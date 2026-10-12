// Holds the current, valid config. Reloads a file when it changes on disk and
// writes admin-UI changes back to the same file with comments and order intact.
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import type { Document } from 'yaml';
import { CONFIG_NAMES, type Config, type ConfigName } from '@lan-os/shared';
import { configFileLabel, loadConfigFile, parseConfigText } from './load.ts';

const RELOAD_DELAY_MS = 250;

export interface ConfigStoreEvents {
  /** A file was reloaded and is valid. */
  change: [name: ConfigName];
  /** A file changed on disk but is invalid. The last valid version stays in use. */
  invalid: [name: ConfigName, errors: string[]];
}

export class ConfigError extends Error {
  readonly lines: string[];
  constructor(lines: string[]) {
    super(lines.join('\n'));
    this.lines = lines;
  }
}

export class ConfigStore extends EventEmitter<ConfigStoreEvents> {
  readonly configDir: string;
  readonly defaultsDir: string;
  private values = {} as Config;
  private documents = {} as Record<ConfigName, Document>;
  /** Problems in files that changed while running; cleared when the file is fixed. */
  readonly problems = new Map<ConfigName, string[]>();
  private watcher: fs.FSWatcher | undefined;
  private timers = new Map<ConfigName, NodeJS.Timeout>();

  constructor(configDir: string, defaultsDir: string) {
    super();
    this.configDir = configDir;
    this.defaultsDir = defaultsDir;
  }

  /** Loads every file. Throws a ConfigError with friendly lines when any file is invalid. */
  loadAll(onCreated?: (label: string) => void): void {
    const errors: string[] = [];
    for (const name of CONFIG_NAMES) {
      const result = loadConfigFile(name, this.configDir, this.defaultsDir);
      if (!result.ok) {
        errors.push(...result.errors);
        continue;
      }
      if (result.createdFromDefault) onCreated?.(configFileLabel(name));
      this.set(name, result.value, result.document);
    }
    if (errors.length) throw new ConfigError(errors);
  }

  get<K extends ConfigName>(name: K): Config[K] {
    return this.values[name];
  }

  /** Starts watching config/ and reloads a file shortly after it is saved. */
  watch(): void {
    this.watcher = fs.watch(this.configDir, (_event, filename) => {
      const name = filename?.toString().replace(/\.yaml$/, '') as ConfigName | undefined;
      if (!name || !CONFIG_NAMES.includes(name)) return;
      clearTimeout(this.timers.get(name));
      this.timers.set(name, setTimeout(() => this.reload(name), RELOAD_DELAY_MS));
    });
  }

  close(): void {
    this.watcher?.close();
    for (const timer of this.timers.values()) clearTimeout(timer);
  }

  reload(name: ConfigName): void {
    const result = loadConfigFile(name, this.configDir, this.defaultsDir);
    if (!result.ok) {
      this.problems.set(name, result.errors);
      this.emit('invalid', name, result.errors);
      return;
    }
    this.problems.delete(name);
    this.set(name, result.value, result.document);
    this.emit('change', name);
  }

  /**
   * Changes a file through the YAML Document API, so comments and order survive.
   * The result is validated first; an invalid change throws a ConfigError and nothing is written.
   */
  update<K extends ConfigName>(name: K, edit: (document: Document) => void): Config[K] {
    const document = this.documents[name].clone();
    edit(document);
    const text = document.toString();
    const result = parseConfigText(name, text);
    if (!result.ok) throw new ConfigError(result.errors);
    fs.writeFileSync(path.join(this.configDir, `${name}.yaml`), text);
    this.problems.delete(name);
    this.set(name, result.value, result.document);
    this.emit('change', name);
    return result.value;
  }

  private set<K extends ConfigName>(name: K, value: Config[K], document: Document): void {
    this.values[name] = value;
    this.documents[name] = document;
  }
}
