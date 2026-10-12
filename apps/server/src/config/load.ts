// Reads one config file: recreates it from its default template when missing,
// parses the YAML and validates it, returning friendly one-line errors.
import fs from 'node:fs';
import path from 'node:path';
import { parseDocument, type Document } from 'yaml';
import { CONFIG_SCHEMAS, friendlyConfigErrors, type Config, type ConfigName } from '@lan-os/shared';

export type LoadResult<K extends ConfigName> =
  | { ok: true; value: Config[K]; document: Document; createdFromDefault: boolean }
  | { ok: false; errors: string[] };

export const configFileLabel = (name: ConfigName) => `config/${name}.yaml`;

export function parseConfigText<K extends ConfigName>(name: K, text: string): LoadResult<K> {
  const label = configFileLabel(name);
  const document = parseDocument(text, { prettyErrors: true });
  if (document.errors.length) {
    return {
      ok: false,
      errors: document.errors.map(e => {
        const line = e.linePos?.[0]?.line;
        const reason = e.message.split('\n')[0]!.replace(/ at line \d+, column \d+:?$/, '');
        return `${label} → ${line ? `line ${line} ` : ''}is not valid YAML: ${reason} (check quotes, colons and indentation)`;
      }),
    };
  }
  const raw: unknown = document.toJS();
  const result = CONFIG_SCHEMAS[name].safeParse(raw);
  if (!result.success) return { ok: false, errors: friendlyConfigErrors(label, result.error, raw) };
  return { ok: true, value: result.data as Config[K], document, createdFromDefault: false };
}

export function loadConfigFile<K extends ConfigName>(name: K, configDir: string, defaultsDir: string): LoadResult<K> {
  const file = path.join(configDir, `${name}.yaml`);
  let createdFromDefault = false;
  if (!fs.existsSync(file)) {
    fs.mkdirSync(configDir, { recursive: true });
    fs.copyFileSync(path.join(defaultsDir, `${name}.yaml`), file);
    createdFromDefault = true;
  }
  const result = parseConfigText(name, fs.readFileSync(file, 'utf8'));
  return result.ok ? { ...result, createdFromDefault } : result;
}
