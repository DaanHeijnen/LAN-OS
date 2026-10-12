// Console output for the owner, and crash reports in data/logs/crashes/.
import fs from 'node:fs';
import path from 'node:path';
import type { CrashInfo } from '@lan-os/shared';

const stamp = () => new Date().toLocaleTimeString('en-GB', { hour12: false });

export const log = {
  info: (message: string) => console.log(`[${stamp()}] ${message}`),
  warn: (message: string) => console.warn(`[${stamp()}] ⚠ ${message}`),
};

export class CrashLog {
  readonly dir: string;

  constructor(dataDir: string) {
    this.dir = path.join(dataDir, 'logs', 'crashes');
  }

  /** Writes one report per crash. Never throws: a crash report must not cause a second crash. */
  write(error: unknown, context: string): string | null {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      const at = new Date();
      const file = path.join(this.dir, `crash-${at.toISOString().replace(/[:.]/g, '-')}.txt`);
      const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
      fs.writeFileSync(file, [
        `LAN OS crash report`,
        `When: ${at.toISOString()}`,
        `Where: ${context}`,
        `What: ${error instanceof Error ? error.message : String(error)}`,
        '',
        detail,
        '',
      ].join('\n'));
      return file;
    } catch {
      return null;
    }
  }

  list(limit = 20): CrashInfo[] {
    if (!fs.existsSync(this.dir)) return [];
    return fs.readdirSync(this.dir)
      .filter(f => f.startsWith('crash-') && f.endsWith('.txt'))
      .sort().reverse().slice(0, limit)
      .map(file => {
        const text = fs.readFileSync(path.join(this.dir, file), 'utf8');
        const line = (prefix: string) => text.split('\n').find(l => l.startsWith(prefix))?.slice(prefix.length) ?? '';
        return { file, at: line('When: '), summary: line('What: ') };
      });
  }

  /** Deletes reports older than the retention period from server.yaml. */
  prune(maxAgeSeconds: number, now = Date.now()): number {
    if (!fs.existsSync(this.dir)) return 0;
    let removed = 0;
    for (const file of fs.readdirSync(this.dir)) {
      const full = path.join(this.dir, file);
      if (now - fs.statSync(full).mtimeMs > maxAgeSeconds * 1000) {
        fs.rmSync(full);
        removed++;
      }
    }
    return removed;
  }
}
