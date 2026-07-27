import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';
import { SessionStore } from './session-store.service';

export const SESSION_COOKIE = 'admin_session';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionStore,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    // The cookie is signed (tamper-proof) and now carries a random session id
    // rather than a constant, so a valid session must both verify the signature
    // and still be live in the store — logout and restart both invalidate it.
    const value = req.signedCookies?.[SESSION_COOKIE];
    if (typeof value === 'string' && this.sessions.verify(value)) return true;
    throw new UnauthorizedException('Session required');
  }
}
