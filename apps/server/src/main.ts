// Starts LAN OS:  node apps/server/src/main.ts [--demo]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkContrast, durationToSeconds } from '@lan-os/shared';
import { Accounts } from './auth/accounts.ts';
import { ConfigError, ConfigStore } from './config/store.ts';
import { openDatabase } from './db/database.ts';
import { seedDemo } from './demo/seed.ts';
import { DemoSteam } from './demo/demo-steam.ts';
import { loadSecrets } from './env.ts';
import { buildApp } from './http/app.ts';
import { LiveHub } from './live/hub.ts';
import { CrashLog, log } from './logging.ts';
import { CONFIG_DIR, DATA_DIR, DEFAULTS_DIR, ROOT_DIR } from './paths.ts';
import { SteamWebApi, type PresenceSource } from './presence/steam-api.ts';

/** Exit code for "fix your config first", so Start LAN OS.bat waits instead of restarting. */
const EXIT_CONFIG_PROBLEM = 2;

const demo = process.argv.includes('--demo');
const crashLog = new CrashLog(DATA_DIR);

process.on('uncaughtException', error => {
  const file = crashLog.write(error, 'uncaught exception');
  console.error(`\nLAN OS crashed: ${error.message}${file ? `\nCrash report: ${path.relative(ROOT_DIR, file)}` : ''}`);
  process.exit(1);
});
process.on('unhandledRejection', reason => {
  const file = crashLog.write(reason, 'unhandled promise rejection');
  console.error(`\nLAN OS crashed: ${String(reason)}${file ? `\nCrash report: ${path.relative(ROOT_DIR, file)}` : ''}`);
  process.exit(1);
});

function lanAddresses(): string[] {
  return Object.values(os.networkInterfaces()).flat()
    .filter(a => a && a.family === 'IPv4' && !a.internal)
    .map(a => a!.address);
}

async function main() {
  const secrets = loadSecrets(ROOT_DIR);

  const store = new ConfigStore(CONFIG_DIR, DEFAULTS_DIR);
  try {
    store.loadAll(label => log.info(`${label} was missing, so it was recreated with the default settings.`));
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    console.error('\nLAN OS can\'t start until these settings are fixed:\n');
    for (const line of error.lines) console.error(`  ${line}`);
    console.error('\nFix them in VS Code, save, and start LAN OS again. config/README.md explains each file.\n');
    process.exit(EXIT_CONFIG_PROBLEM);
  }
  for (const r of checkContrast(store.get('theme')).filter(c => !c.pass)) {
    log.warn(`config/theme.yaml → ${r.mode} "${r.pair}" contrast is ${r.ratio.toFixed(2)}:1, below ${r.minimum}:1 (hard to read from 4 m)`);
  }

  const dbFile = demo ? path.join(DATA_DIR, 'demo', 'lan-os-demo.db') : path.join(DATA_DIR, 'lan-os.db');
  if (demo) for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbFile + suffix, { force: true });
  const db = openDatabase(dbFile);
  const accounts = new Accounts(db);

  let source: PresenceSource | null = null;
  let sourceProblem: string | null = null;
  if (demo) source = new DemoSteam();
  else if (secrets.steamApiKey) source = new SteamWebApi(secrets.steamApiKey);
  else sourceProblem = 'No STEAM_API_KEY in .env (see .env.example)';

  const port = store.get('server').port;
  const address = lanAddresses()[0] ?? 'localhost';
  const baseUrl = () => `http://${address}:${port}`;

  if (demo) seedDemo(db, store, accounts);
  const hub = new LiveHub({ store, db, accounts, crashLog, source, sourceProblem, demo, baseUrl });

  store.on('change', name => {
    log.info(`config/${name}.yaml changed; applied.`);
    hub.onConfigChange(name);
  });
  store.on('invalid', (_name, errors) => {
    for (const line of errors) log.warn(`${line}. Still using the last good version.`);
    hub.push();
  });
  store.watch();

  const app = await buildApp({
    store, accounts, hub, crashLog, demo, adminPassword: secrets.adminPassword,
    webDistDir: path.join(ROOT_DIR, 'apps', 'web', 'dist'),
  });
  await app.listen({ port, host: '0.0.0.0' });
  hub.start();

  const pruned = crashLog.prune(durationToSeconds(store.get('server').log_retention));
  if (pruned) log.info(`Removed ${pruned} old crash report${pruned > 1 ? 's' : ''}.`);

  const shutdown = () => {
    hub.stop();
    store.close();
    void app.close().then(() => {
      db.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log([
    '',
    `  LAN OS is running${demo ? ' in DEMO mode (pretend players, nothing is saved to the real history)' : ''}.`,
    '',
    `  Projector wall:    ${baseUrl()}/wall`,
    `  Player dashboard:  ${baseUrl()}/app`,
    `  Admin page:        ${baseUrl()}/admin`,
    '',
    `  On this PC you can also use http://localhost:${port}/...`,
    sourceProblem ? `\n  ⚠ Steam: ${sourceProblem}. Players show as "Unknown" until it's added.` : '',
    '  Keep this window open. Close it (or press Ctrl+C) to stop LAN OS.',
    '',
  ].join('\n'));
}

void main();
