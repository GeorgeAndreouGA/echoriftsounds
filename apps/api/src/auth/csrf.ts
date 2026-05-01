import * as crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';

const SECRET_COOKIE = 'csrf_secret';
const TOKEN_HEADER = 'csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
// Login bootstraps the session — there is no token to verify yet, and CSRF on
// an unauthenticated endpoint adds no security (the attacker would still need
// the password). The session cookie is HttpOnly + SameSite=strict, so a
// cross-origin login attempt cannot read the response either.
const CSRF_EXEMPT_PATHS = new Set(['/login']);

interface CookieFlags {
  secure: boolean;
}

function freshSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

function mintToken(secret: string): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  const hmac = crypto.createHmac('sha256', secret).update(nonce).digest('hex');
  return `${nonce}.${hmac}`;
}

function verifyToken(secret: string, token: string): boolean {
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const nonce = token.slice(0, dot);
  const provided = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', secret).update(nonce).digest('hex');
  if (provided.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

function ensureSecret(req: Request, res: Response, flags: CookieFlags): string {
  const existing = req.signedCookies?.[SECRET_COOKIE] as string | undefined;
  if (existing) return existing;
  const secret = freshSecret();
  res.cookie(SECRET_COOKIE, secret, {
    httpOnly: true,
    secure: flags.secure,
    sameSite: 'strict',
    signed: true,
    path: '/api/admin',
  });
  // Make available within the same request for token minting after the cookie is set.
  (req.signedCookies as Record<string, string>)[SECRET_COOKIE] = secret;
  return secret;
}

export function generateCsrfToken(req: Request, res: Response, flags: CookieFlags): string {
  const secret = ensureSecret(req, res, flags);
  return mintToken(secret);
}

export function csrfMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    // `secure` is per-request — derived from req.secure (Express resolves it
    // from X-Forwarded-Proto via trust proxy). Plain HTTP gets non-secure
    // cookies (so browsers actually keep them); HTTPS gets secure cookies.
    const flags: CookieFlags = { secure: req.secure };
    if (SAFE_METHODS.has(req.method) || CSRF_EXEMPT_PATHS.has(req.path)) {
      if (SAFE_METHODS.has(req.method)) ensureSecret(req, res, flags);
      return next();
    }
    const secret = req.signedCookies?.[SECRET_COOKIE] as string | undefined;
    const token = req.headers[TOKEN_HEADER];
    if (!secret || typeof token !== 'string' || !verifyToken(secret, token)) {
      res.status(403).json({ statusCode: 403, message: 'Invalid CSRF token' });
      return;
    }
    next();
  };
}
