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
  // Audio streaming and the peaks endpoint need to handle bursty Range requests
  // (one per seek). Throttling them at 100/min/IP would reject a few seeks in
  // a row. Per-route brute-force caps still apply elsewhere.
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const p = req.path || req.url || '';
    return (
      p.startsWith('/music/') ||
      /^\/api\/tracks\/[^/]+\/peaks$/.test(p)
    );
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
