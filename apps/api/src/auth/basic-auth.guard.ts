import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import * as bcrypt from 'bcryptjs';
import basicAuth from 'express-basic-auth';

@Injectable()
export class BasicAuthGuard implements CanActivate {
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();

    const auth = req.headers['authorization'];
    if (!auth?.startsWith('Basic ')) {
      // Deliberately do NOT emit `WWW-Authenticate: Basic` — that header tells
      // the browser to render its native credential dialog, which would
      // bypass our custom login form. The form sends the Basic header
      // manually, so the hint isn't needed.
      throw new UnauthorizedException('Authentication required.');
    }

    const [user, pass] = Buffer.from(auth.split(' ')[1], 'base64')
      .toString()
      .split(':');

    const expectedUser = process.env.ADMIN_USERNAME ?? '';
    const expectedHash = process.env.ADMIN_PASSWORD_HASH ?? '';

    if (!expectedUser || !expectedHash) {
      throw new UnauthorizedException('Server configuration error');
    }

    const validUser = basicAuth.safeCompare(user, expectedUser);
    const validPass = await bcrypt.compare(pass, expectedHash);

    if (validUser && validPass) return true;

    throw new UnauthorizedException('Invalid credentials');
  }
}
