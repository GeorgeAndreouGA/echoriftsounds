import { Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';

/**
 * Broadcasts "something in the data store changed" to any listener.
 *
 * Fired from JsonStore's write path rather than from each service method, so a
 * new mutation can never forget to announce itself — if it hits disk, it
 * broadcasts. The payload is deliberately just a monotonic tick: subscribers
 * refetch through their own authenticated endpoints, so this stream never
 * carries data and is safe to expose publicly.
 */
@Injectable()
export class ChangesService {
  private readonly logger = new Logger(ChangesService.name);
  private readonly subject = new Subject<number>();

  get stream$() {
    return this.subject.asObservable();
  }

  emit(): void {
    const at = Date.now();
    this.logger.debug?.(`change broadcast @${at}`);
    this.subject.next(at);
  }
}
