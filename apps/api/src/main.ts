import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import * as crypto from 'crypto';
import * as path from 'path';
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { csrfMiddleware } from './auth/csrf';

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
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  // Behind nginx + Caddy. Trust loopback/private hops so req.ip and req.secure
  // reflect the real client.
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');

  // Serve music files at /music/:file. Range requests are honored by
  // serve-static; explicit Accept-Ranges advertises that. Long max-age +
  // immutable lets browsers reuse already-streamed chunks across reloads.
  const musicDir = process.env.MUSIC_DIR || '/app/music';
  app.useStaticAssets(musicDir, {
    prefix: '/music',
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
    app.use('/api/docs', (_req: any, res: any, next: any) => {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';",
      );
      next();
    });
  }

  app.use(cookieParser(process.env.COOKIE_SECRET || crypto.randomBytes(32).toString('hex')));

  app.use('/api/admin', csrfMiddleware());

  app.enableCors({
    origin: process.env.WEB_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });

  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());

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
