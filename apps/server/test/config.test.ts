import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CONFIG_NAMES } from '@lan-os/shared';
import { parseConfigText } from '../src/config/load.ts';
import { addPlayer, removePlayer, updatePlayer } from '../src/config/players.ts';
import { ConfigError, ConfigStore } from '../src/config/store.ts';
import { CONFIG_DIR, DEFAULTS_DIR } from '../src/paths.ts';

const template = (name: string) => fs.readFileSync(path.join(DEFAULTS_DIR, `${name}.yaml`), 'utf8');
const errorsFor = (name: Parameters<typeof parseConfigText>[0], text: string) => {
  const result = parseConfigText(name, text);
  return result.ok ? [] : result.errors;
};

describe('default config templates', () => {
  it.each(CONFIG_NAMES)('%s.yaml is valid', name => {
    expect(errorsFor(name, template(name))).toEqual([]);
  });

  it.each(CONFIG_NAMES)('%s.yaml has a comment above every setting', name => {
    const lines = template(name).split('\n');
    lines.forEach((line, i) => {
      // A setting with a value, top-level or inside a group (group headers and roster entries excluded).
      if (/^( {2})?[a-z_]+:\s*\S/.test(line)) {
        expect(lines[i - 1]?.trim().startsWith('#'), `${name}.yaml line ${i + 1}: "${line}"`).toBe(true);
      }
    });
  });

  it('the shipped config files are valid', () => {
    for (const name of CONFIG_NAMES) {
      expect(errorsFor(name, fs.readFileSync(path.join(CONFIG_DIR, `${name}.yaml`), 'utf8'))).toEqual([]);
    }
  });
});

describe('friendly config errors', () => {
  it('names the file, setting, rule and the value written', () => {
    const text = template('music').replace('skip_vote_threshold: 4', 'skip_vote_threshold: "half"');
    expect(errorsFor('music', text)).toEqual([
      'config/music.yaml → skip_vote_threshold must be a whole number between 1 and 7 (you wrote "half")',
    ]);
  });

  it('explains a bad duration', () => {
    const text = template('integrations').replace('steam_poll_interval: "15s"', 'steam_poll_interval: 15000');
    expect(errorsFor('integrations', text)).toEqual([
      'config/integrations.yaml → steam_poll_interval must be a time from "10s" to "5m", written like "15s", "30m" or "2h" (you wrote 15000)',
    ]);
  });

  it('rejects an end before the start', () => {
    const text = template('event').replace('ends_at: "2026-11-22 15:00"', 'ends_at: "2026-11-18 15:00"');
    expect(errorsFor('event', text)).toEqual([
      'config/event.yaml → ends_at must be later than starts_at (you wrote "2026-11-18 15:00")',
    ]);
  });

  it('rejects impossible dates', () => {
    const text = template('event').replace('starts_at: "2026-11-19 19:00"', 'starts_at: "2026-02-30 19:00"');
    expect(errorsFor('event', text)[0]).toContain('starts_at must be a date and time written like "2026-11-19 19:00"');
  });

  it('reports a typo in a setting name', () => {
    const text = template('wall').replace('night_mode:', 'nite_mode:');
    expect(errorsFor('wall', text)).toEqual([
      'config/wall.yaml → night_mode is missing (add it back; config/README.md shows the default)',
      'config/wall.yaml → "nite_mode" is not a known setting (check the spelling, or remove it)',
    ]);
  });

  it('points at the player inside the roster', () => {
    const text = template('players').replace('role: admin', 'role: boss');
    expect(errorsFor('players', text)).toEqual([
      'config/players.yaml → players → item 1 → role must be one of: player, admin (you wrote "boss")',
    ]);
  });

  it('asks for Steam IDs between quotes', () => {
    const text = template('players').replace('steam_id: ""', 'steam_id: 76561198012345678');
    expect(errorsFor('players', text)[0]).toMatch(/steam_id must be a 17-digit Steam ID between quotes/);
  });

  it('rejects duplicate player ids', () => {
    const text = template('players').replace('id: joris', 'id: mara');
    expect(errorsFor('players', text)).toEqual([
      'config/players.yaml → players → item 2 → id must be unique; another player already uses it (you wrote "mara")',
    ]);
  });

  it('reports broken YAML with a line number', () => {
    const errors = errorsFor('wall', 'panels: [music, poll\nnight_mode: false\n');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^config\/wall\.yaml → line \d+ is not valid YAML: /);
  });

  it('never includes a stack trace', () => {
    const errors = errorsFor('theme', template('theme').replace('"#0A0F1A"', '"dark blue"'));
    expect(errors.join('\n')).not.toMatch(/\bat \w+ \(/);
    expect(errors).toEqual(['config/theme.yaml → surfaces → surface_wall must be a hex colour like "#1E2A43" (you wrote "dark blue")']);
  });
});

describe('config store', () => {
  let dir: string;
  let store: ConfigStore;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lan-os-config-'));
    store = new ConfigStore(dir, DEFAULTS_DIR);
  });
  afterEach(() => {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('recreates missing files from the commented templates', () => {
    const created: string[] = [];
    store.loadAll(label => created.push(label));
    expect(created).toHaveLength(CONFIG_NAMES.length);
    expect(fs.readFileSync(path.join(dir, 'music.yaml'), 'utf8')).toBe(template('music'));
  });

  it('refuses to start with an invalid file', () => {
    fs.writeFileSync(path.join(dir, 'wall.yaml'), template('wall').replace('brightness: 100', 'brightness: 150'));
    expect(() => store.loadAll()).toThrow(ConfigError);
  });

  it('keeps the last valid version when a file becomes invalid', () => {
    store.loadAll();
    const invalid: string[][] = [];
    store.on('invalid', (_name, errors) => invalid.push(errors));
    fs.writeFileSync(path.join(dir, 'wall.yaml'), template('wall').replace('brightness: 100', 'brightness: 150'));
    store.reload('wall');
    expect(store.get('wall').brightness).toBe(100);
    expect(invalid[0]).toEqual(['config/wall.yaml → brightness must be a whole number between 20 and 100 (you wrote 150)']);
  });

  it('writes roster changes back with every comment intact', () => {
    store.loadAll();
    updatePlayer(store, 'joris', { nickname: 'Jorrit', hidden_from_wall: true, steam_id: '76561198012345678' });
    addPlayer(store, { id: 'kim', nickname: 'Kim', steam_id: '', role: 'player', hidden_from_wall: false });
    removePlayer(store, 'tom');

    const written = fs.readFileSync(path.join(dir, 'players.yaml'), 'utf8');
    const comments = (text: string) => text.split('\n').filter(l => l.trim().startsWith('#'));
    expect(comments(written)).toEqual(comments(template('players')));
    expect(written).toContain('steam_id: "76561198012345678"');
    expect(store.get('players').players.map(p => p.nickname)).toEqual(['Mara', 'Jorrit', 'Sam', 'Nick', 'Alex', 'Lisa', 'Kim']);
    expect(store.get('players').players[1]?.hidden_from_wall).toBe(true);
  });

  it('keeps one-line lists as the owner wrote them', () => {
    store.loadAll();
    store.update('wall', document => document.set('night_mode', true));
    const written = fs.readFileSync(path.join(dir, 'wall.yaml'), 'utf8');
    expect(written).toBe(template('wall').replace('night_mode: false', 'night_mode: true'));
  });

  it('rejects an invalid admin change without touching the file', () => {
    store.loadAll();
    const before = fs.readFileSync(path.join(dir, 'players.yaml'), 'utf8');
    expect(() => updatePlayer(store, 'joris', { nickname: '' })).toThrow(ConfigError);
    expect(fs.readFileSync(path.join(dir, 'players.yaml'), 'utf8')).toBe(before);
  });
});
