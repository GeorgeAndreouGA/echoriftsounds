import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import * as crypto from 'crypto';
import * as path from 'path';
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger, ValidationPipe } from '@nestjs/common';
import { Request, Response } from 'express';
import { csrfMiddleware } from './auth/csrf';
import { PublishedAccessService } from './tracks/published-access.service';

@Catch()
class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('AllExceptionsFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    // Always log non-HTTP (unhandled) exceptions with the full stack so prod
    // 500s aren't black boxes. HttpException is intentional and noisy, skip.
    if (!(exception instanceof HttpException)) {
      const err = exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error(
        `Unhandled exception on ${req.method} ${req.originalUrl}: ${err.message}`,
        err.stack,
      );
    }

    res.status(status).json({ statusCode: status, message });
  }
}

async function bootstrap() {
  // Owner-only by default for everything the app creates — the peaks JSON, the
  // transcoded streams, the JSON stores and their temp files. Combined with the
  // 700 data dirs, nothing the process writes is readable by any other uid.
  process.umask(0o077);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  // Behind nginx + Caddy. Trust loopback/private hops so req.ip and req.secure
  // reflect the real client.
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');

  // Subpath the whole app is served under (e.g. '/music'), matching the web
  // build's NEXT_PUBLIC_BASE_PATH and the reverse-proxy routes. Empty = root.
  // Normalised to a leading slash with no trailing slash. setGlobalPrefix takes
  // no leading slash, the app.use()/static mounts need the full prefixed path.
  const basePath = (process.env.BASE_PATH || '').replace(/\/+$/, '');
  const apiPrefix = basePath ? `${basePath.slice(1)}/api` : 'api';

  // Gate the byte routes on publish state. /audio and /stream are static mounts
  // over the whole music/stream dirs, so without this any file on disk is
  // fetchable by name — published or not — which defeats scheduled releases.
  // Registered before the static handlers so an unpublished (or unknown) name
  // 404s before serve-static ever touches the filesystem. The set is refreshed
  // from published.json on every store-change broadcast.
  const access = app.get(PublishedAccessService, { strict: false });
  app.use(`${basePath}/audio`, access.gate('audio'));
  app.use(`${basePath}/stream`, access.gate('stream'));

  // Serve music files at <basePath>/audio/:file. Range requests are honored by
  // serve-static; explicit Accept-Ranges advertises that. Long max-age +
  // immutable lets browsers reuse already-streamed chunks across reloads.
  // The route segment is `audio` (not `music`) so it doesn't collide with a
  // /music subpath, which would otherwise produce /music/music/...
  const musicDir = process.env.MUSIC_DIR || '/app/music';
  app.useStaticAssets(musicDir, {
    prefix: `${basePath}/audio`,
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      // Range requests (206) and immutable caching for 2hr+ audio files.
      // acceptRanges defaults true in serve-static; we advertise it explicitly
      // so clients and reverse proxies don't need to probe.
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      const name = path.basename(filePath);
      res.setHeader(
        'Content-Disposition',
        `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
      );
    },
  });

  // Serve the compressed playback streams at <basePath>/stream/:file.m4a. These
  // are the small AAC proxies the player uses so seeking a 1–2 hr master only
  // fetches ~1/10 the bytes. Same Range + immutable-cache semantics as /audio;
  // the DATA_DIR/stream volume persists them across restarts.
  const streamDir = path.join(process.env.DATA_DIR || './data', 'stream');
  app.useStaticAssets(streamDir, {
    prefix: `${basePath}/stream`,
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (filePath.endsWith('.m4a')) {
        res.setHeader('Content-Type', 'audio/mp4');
      }
    },
  });

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      referrerPolicy: { policy: 'same-origin' },
      // nginx (host) is the authoritative HSTS source — avoid double headers.
      hsts: false,
    }),
  );

  // Swagger UI requires 'unsafe-inline' — override CSP only for /api/docs after helmet runs.
  if (process.env.SWAGGER_ENABLED === 'true') {
    app.use(`${basePath}/api/docs`, (_req: any, res: any, next: any) => {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';",
      );
      next();
    });
  }

  // The session cookie's payload is a constant ('ok'); its signature is the only
  // secret standing between an attacker and a forged admin session. A missing
  // COOKIE_SECRET used to fall back to a random per-boot value, which "works" but
  // silently invalidates every session on restart and hides a misconfigured deploy.
  // Fail closed in production rather than boot into that state.
  const cookieSecret = process.env.COOKIE_SECRET;
  if (!cookieSecret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('COOKIE_SECRET must be set in production');
    }
    Logger.warn(
      'COOKIE_SECRET is unset — using a random per-boot secret (dev only; sessions drop on restart).',
      'Bootstrap',
    );
  }
  app.use(cookieParser(cookieSecret || crypto.randomBytes(32).toString('hex')));

  app.use(`${basePath}/api/admin`, csrfMiddleware());

  app.enableCors({
    origin: process.env.WEB_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });

  app.setGlobalPrefix(apiPrefix);
  app.useGlobalFilters(new AllExceptionsFilter());

  // Validate + shape every request body against its DTO. `whitelist` strips any
  // property a DTO doesn't declare (so extra keys can't reach the JSON stores),
  // `forbidNonWhitelisted` turns an unexpected property into a 400 rather than a
  // silent drop, and `transform` runs the class-transformer @Transform hooks that
  // normalise the panel's `x | x[]` shapes into arrays.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (process.env.SWAGGER_ENABLED === 'true') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('EchoRiftSounds API')
      .setDescription('Audio tracks and admin management API')
      .setVersion('1.0')
      .addCookieAuth('session')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, { useGlobalPrefix: true });
  }

  const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;
  await app.listen(port, '0.0.0.0');

  // Allow long downloads (2hr+ tracks) to stream over a single socket without
  // Express terminating idle connections between Range chunks.
  const server = app.getHttpServer();
  server.keepAliveTimeout = 75_000;
  server.headersTimeout = 80_000; // must exceed keepAliveTimeout
  server.requestTimeout = 0;
  server.timeout = 0;

  console.log(`EchoRiftSounds API listening on port ${port}`);
}

bootstrap();
