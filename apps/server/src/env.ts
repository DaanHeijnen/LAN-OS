// Secrets live only in the .env file in the main folder. The setup page writes them there,
// so nobody has to edit .env by hand. Nothing else reads process.env.
import fs from 'node:fs';
import path from 'node:path';

export const SECRET_NAMES = ['ADMIN_PASSWORD', 'STEAM_API_KEY', 'SPOTIFY_CLIENT_ID', 'DISCORD_BOT_TOKEN', 'AI_API_KEY'] as const;
export type SecretName = (typeof SECRET_NAMES)[number];

/** Parses KEY=value lines; quotes around the value are optional. */
export function parseEnv(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) result[match[1]!] = match[2]!.replace(/^(['"])(.*)\1$/, '$2');
  }
  return result;
}

/** Sets one KEY=value line, keeping every other line and comment as it was. */
export function setEnvValue(text: string, name: string, value: string): string {
  const line = `${name}=${value}`;
  const lines = text.split(/\r?\n/);
  const index = lines.findIndex(l => new RegExp(`^\\s*#?\\s*${name}\\s*=`).test(l));
  if (index >= 0) lines[index] = line;
  else lines.push(line);
  return lines.join('\n').replace(/\n*$/, '\n');
}

export class Secrets {
  private readonly file: string;
  private readonly example: string;
  private values: Record<string, string>;

  constructor(rootDir: string) {
    this.file = path.join(rootDir, '.env');
    this.example = path.join(rootDir, '.env.example');
    this.values = fs.existsSync(this.file) ? parseEnv(fs.readFileSync(this.file, 'utf8')) : {};
  }

  get(name: SecretName): string | null {
    return this.values[name]?.trim() || null;
  }

  /** Writes the value to .env (created from .env.example the first time). */
  set(name: SecretName, value: string | null): void {
    if (!fs.existsSync(this.file)) {
      fs.writeFileSync(this.file, fs.existsSync(this.example) ? fs.readFileSync(this.example, 'utf8') : '');
    }
    const text = setEnvValue(fs.readFileSync(this.file, 'utf8'), name, (value ?? '').replace(/[\r\n]/g, ''));
    fs.writeFileSync(this.file, text);
    this.values = parseEnv(text);
  }
}
