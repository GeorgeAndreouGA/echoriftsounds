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
  ) {}

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
    return JSON.parse(raw) as T;
  }

  async writeAtomic(data: T): Promise<void> {
    const tmp = `${this.filePath}.tmp.${process.hrtime.bigint().toString()}`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tmp, this.filePath);
  }

  async update(fn: (current: T) => T): Promise<T> {
    await this.ensureFile();
    return this.mutex.run(async () => {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const current = JSON.parse(raw) as T;
      const updated = fn(current);
      await this.writeAtomic(updated);
      return updated;
    });
  }

  /** Sync read used only in tests / scheduler init (avoids async waterfall) */
  readSync(): T {
    if (!fsSync.existsSync(this.filePath)) return this.defaultValue;
    try {
      return JSON.parse(fsSync.readFileSync(this.filePath, 'utf-8')) as T;
    } catch {
      return this.defaultValue;
    }
  }
}
