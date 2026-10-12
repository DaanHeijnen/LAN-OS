// Automatic database backups in data/backups/, every server.yaml → backup_interval.
import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './db/database.ts';
import { log } from './logging.ts';

export class Backups {
  readonly dir: string;
  private readonly db: Db;

  constructor(db: Db, dataDir: string) {
    this.db = db;
    this.dir = path.join(dataDir, 'backups');
  }

  /** Copies the live database safely (SQLite's own backup), then keeps only the newest `keep`. */
  async run(keep: number, now = new Date()): Promise<string> {
    fs.mkdirSync(this.dir, { recursive: true });
    const file = path.join(this.dir, `lan-os-${now.toISOString().replace(/[:.]/g, '-')}.db`);
    await this.db.backup(file);
    const all = this.list();
    for (const old of all.slice(keep)) fs.rmSync(path.join(this.dir, old), { force: true });
    log.info(`Backup saved: data/backups/${path.basename(file)}`);
    return file;
  }

  /** Backup files, newest first. */
  list(): string[] {
    if (!fs.existsSync(this.dir)) return [];
    return fs.readdirSync(this.dir).filter(f => /^lan-os-.*\.db$/.test(f)).sort().reverse();
  }

  last(): string | null {
    const newest = this.list()[0];
    return newest ? fs.statSync(path.join(this.dir, newest)).mtime.toISOString() : null;
  }
}
