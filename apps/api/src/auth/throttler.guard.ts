import { ExecutionContext, Injectable } from '@nestjs/common';
import {
  ThrottlerException,
  ThrottlerGuard,
  ThrottlerLimitDetail,
} from '@nestjs/throttler';
import { Request, Response } from 'express';

/**
 * ThrottlerGuard variant that emits a `Retry-After` header on 429 so clients
 * (and the login form) can show how long the cooldown is.
 */
@Injectable()
export class HeaderedThrottlerGuard extends ThrottlerGuard {
  // Audio streaming needs to handle bursty Range requests (one per seek).
  // Throttling at 100/min/IP would reject a few seeks in a row. Per-route
  // brute-force caps still apply elsewhere.
  //
  // The peaks endpoint used to be exempt too, because it could sit on an ffmpeg
  // decode for tens of seconds and clients had to be free to retry. It now
  // answers from cache or returns 202 immediately, so it is neither slow nor
  // bursty — one request per track load, plus a 5s poll while generating, both
  // far under the limit. Leaving it exempt only widened an endpoint that is
  // public, unauthenticated, and the cheapest lever on the ffmpeg queue.
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const p = req.path || req.url || '';
    // Strip the configured subpath (BASE_PATH, e.g. /music) so the match is
    // independent of where the app is mounted. Without this, every request
    // would start with the subpath and the whole API would skip throttling —
    // including the admin-login brute-force cap.
    const basePath = (process.env.BASE_PATH || '').replace(/\/+$/, '');
    const rel = basePath && p.startsWith(basePath) ? p.slice(basePath.length) : p;
    return rel.startsWith('/audio/') || rel.startsWith('/stream/');
  }

  protected async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const res = context.switchToHttp().getResponse<Response>();
    // The default in-memory storage returns timeToExpire / timeToBlockExpire
    // already in SECONDS (Math.ceil((expiresAt - now) / 1000)). Use them as-is;
    // fall back to ttl (ms) when neither is populated.
    const blockSec = detail.timeToBlockExpire;
    const expireSec = detail.timeToExpire;
    const seconds =
      blockSec && blockSec > 0
        ? blockSec
        : expireSec && expireSec > 0
          ? expireSec
          : Math.ceil(detail.ttl / 1000);
    const safe = Math.max(1, seconds);
    res.setHeader('Retry-After', String(safe));
    throw new ThrottlerException(`Too many requests. Retry in ${safe}s.`);
  }
}
