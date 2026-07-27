import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Request } from 'express';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ipRangeCheck = require('ip-range-check') as (ip: string, range: string | string[]) => boolean;

function stripIpv6Prefix(ip: string): string {
  // Express may report IPv4 addresses as "::ffff:1.2.3.4"; strip the prefix
  // so ipRangeCheck can compare against IPv4 ranges.
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

@Injectable()
export class IpWhitelistGuard implements CanActivate {
  private readonly logger = new Logger('IpWhitelistGuard');

  canActivate(ctx: ExecutionContext): boolean {
    const allowedIps = (process.env.ADMIN_IPS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (allowedIps.length === 0) {
      // Fail closed in production: an empty allowlist is almost always a misconfig.
      if (process.env.NODE_ENV === 'production') {
        throw new ForbiddenException('Admin IP allowlist not configured');
      }
      return true;
    }

    const req = ctx.switchToHttp().getRequest<Request>();

    // req.ip respects `trust proxy` set in main.ts — it walks X-Forwarded-For
    // right-to-left, skipping trusted private hops, and returns the first
    // untrusted address. That's the real client.
    const ip = stripIpv6Prefix(req.ip ?? '');

    // debug, not log: this line carries the client IP, the full XFF chain, and the
    // entire ADMIN_IPS allowlist, and it fired on every admin request. Keep it
    // reachable for diagnosing the proxy trust chain, but off by default so the
    // allowlist isn't copied into stdout logs on each hit.
    this.logger.debug(
      `check ip=${ip} req.ip=${req.ip} xff=${String(req.headers['x-forwarded-for'] ?? '')} socket=${req.socket?.remoteAddress ?? ''} ips=${process.env.ADMIN_IPS}`,
    );

    if (!ip) {
      throw new ForbiddenException('Forbidden');
    }

    if (ipRangeCheck(ip, allowedIps)) return true;

    // Diagnostic — without this, "blocked" with no clue why is the worst UX. The
    // allowlist is deliberately omitted here; only the offending request is logged.
    this.logger.warn(
      `blocked ip=${ip} xff=${String(req.headers['x-forwarded-for'] ?? '')} socket=${req.socket?.remoteAddress ?? ''}`,
    );
    throw new ForbiddenException('Forbidden');
  }
}
