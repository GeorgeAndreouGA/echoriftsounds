import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';

class Mutex {
  private queue: Promise<void> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const next = new Promise<void>((r) => { release = r; });
    const result = this.queue.then(() => fn()).finally(() => release());
    this.queue = next;
    return result;
  }
}

export class JsonStore<T> {
  private readonly mutex = new Mutex();

  constructor(
    public readonly filePath: string,
    private readonly defaultValue: T,
    /**
     * Normalises whatever is on disk into the current shape. Lets an older
     * on-disk format (e.g. published.json's legacy `string[]`) keep working
     * without a migration script — every read upgrades in memory, and the next
     * write persists the new shape.
     */
    private readonly migrate?: (raw: unknown) => T,
    /**
     * Called after a successful write. Used to broadcast a change event to
     * connected clients — hooking it here rather than in each service means
     * every mutation announces itself, including future ones.
     */
    private readonly onWrite?: () => void,
  ) {}

  private parse(raw: string): T {
    const parsed: unknown = JSON.parse(raw);
    return this.migrate ? this.migrate(parsed) : (parsed as T);
  }

  async ensureFile(): Promise<void> {
    try {
      await fs.access(this.filePath);
    } catch {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.writeFile(this.filePath, JSON.stringify(this.defaultValue, null, 2), 'utf-8');
    }
  }

  async read(): Promise<T> {
    await this.ensureFile();
    const raw = await fs.readFile(this.filePath, 'utf-8');
    return this.parse(raw);
  }

  async writeAtomic(data: T): Promise<void> {
    const tmp = `${this.filePath}.tmp.${process.hrtime.bigint().toString()}`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tmp, this.filePath);
  }

  async update(fn: (current: T) => T): Promise<T> {
    await this.ensureFile();
    const updated = await this.mutex.run(async () => {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const current = this.parse(raw);
      const next = fn(current);
      await this.writeAtomic(next);
      return next;
    });
    // Announce outside the mutex: a slow subscriber must never hold up the
    // next writer. `fn` throwing (e.g. a validation guard) skips this.
    this.onWrite?.();
    return updated;
  }

  /** Sync read used only in tests / scheduler init (avoids async waterfall) */
  readSync(): T {
    if (!fsSync.existsSync(this.filePath)) return this.defaultValue;
    try {
      return this.parse(fsSync.readFileSync(this.filePath, 'utf-8'));
    } catch {
      return this.defaultValue;
    }
  }
}
