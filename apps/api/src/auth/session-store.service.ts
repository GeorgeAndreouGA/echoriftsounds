import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * Server-side session registry.
 *
 * The session cookie used to carry the constant string 'ok' — so its signature
 * was the only secret, logout could not revoke anything (a captured cookie stayed
 * valid for the whole SESSION_HOURS), and there was no server-side record of a
 * session at all. This holds a random id per login and the moment it expires, so:
 *   - the cookie value is unguessable and unique per login;
 *   - logout deletes the id, making a captured cookie useless immediately;
 *   - a process restart drops every session (fail-closed — admins re-auth), which
 *     for a single-instance deployment is the right default.
 *
 * In-memory Map is sufficient for one instance. If this ever runs multi-replica,
 * swap the Map for a shared store (Redis) behind the same interface.
 */
@Injectable()
export class SessionStore {
  private readonly sessions = new Map<string, number>();

  /** Mint a session valid for `maxAgeMs`, returning its id (the cookie value). */
  create(maxAgeMs: number): string {
    this.sweep();
    const id = crypto.randomBytes(32).toString('hex');
    this.sessions.set(id, Date.now() + maxAgeMs);
    return id;
  }

  /** Is this id a live session? Expired ids are dropped lazily on lookup. */
  verify(id: string): boolean {
    const expiry = this.sessions.get(id);
    if (expiry === undefined) return false;
    if (expiry <= Date.now()) {
      this.sessions.delete(id);
      return false;
    }
    return true;
  }

  /** Revoke a session (logout). No-op if it's already gone. */
  destroy(id: string): void {
    this.sessions.delete(id);
  }

  /** Drop expired entries so abandoned sessions don't accumulate unbounded. */
  private sweep(): void {
    const now = Date.now();
    for (const [id, expiry] of this.sessions) {
      if (expiry <= now) this.sessions.delete(id);
    }
  }
}
