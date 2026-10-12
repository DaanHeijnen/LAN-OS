// Starts LAN OS:  node apps/server/src/main.ts [--demo]
import { exec } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkContrast, durationToSeconds } from '@lan-os/shared';
import { Accounts } from './auth/accounts.ts';
import { ConfigError, ConfigStore } from './config/store.ts';
import { openDatabase } from './db/database.ts';
import { seedDemo } from './demo/seed.ts';
import { Secrets } from './env.ts';
import { buildApp } from './http/app.ts';
import { LiveHub } from './live/hub.ts';
import { CrashLog, log } from './logging.ts';
import { announceHostname } from './mdns.ts';
import { CONFIG_DIR, DATA_DIR, DEFAULTS_DIR, ROOT_DIR } from './paths.ts';
import { SpotifyTokens } from './radio/spotify.ts';

/** Exit code for "fix your config first", so Start LAN OS.bat waits instead of restarting. */
const EXIT_CONFIG_PROBLEM = 2;

const demo = process.argv.includes('--demo');
const crashLog = new CrashLog(DATA_DIR);

const crash = (what: string) => (error: unknown) => {
  const file = crashLog.write(error, what);
  console.error(`\nLAN OS crashed: ${error instanceof Error ? error.message : String(error)}${file ? `\nCrash report: ${path.relative(ROOT_DIR, file)}` : ''}`);
  process.exit(1);
};
process.on('uncaughtException', crash('uncaught exception'));
process.on('unhandledRejection', crash('unhandled promise rejection'));

/** This PC's address on the LAN (the first IPv4 that isn't loopback or a virtual adapter). */
function lanAddress(): string | null {
  const all = Object.entries(os.networkInterfaces()).flatMap(([name, list]) => (list ?? []).map(a => ({ ...a, name })))
    .filter(a => a.family === 'IPv4' && !a.internal);
  const physical = all.filter(a => !/vEthernet|VirtualBox|VMware|Hyper-V|WSL|docker|vboxnet|utun|bridge/i.test(a.name));
  return (physical[0] ?? all[0])?.address ?? null;
}

function openBrowser(url: string): void {
  const command = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(command, () => {});
}

async function main() {
  const secrets = new Secrets(ROOT_DIR);

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
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const spotifyTokens = new SpotifyTokens(path.join(DATA_DIR, 'spotify-token.json'));

  const server = store.get('server');
  const port = server.port;
  const address = lanAddress();
  const baseUrl = () => `http://${address ?? 'localhost'}:${port}`;

  if (demo) seedDemo(db, store, accounts);
  const hub = new LiveHub({ store, db, accounts, crashLog, secrets, spotifyTokens, dataDir: DATA_DIR, demo, baseUrl, port });

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
    store, db, accounts, hub, crashLog, secrets, spotifyTokens, demo, port,
    webDistDir: path.join(ROOT_DIR, 'apps', 'web', 'dist'),
  });
  try {
    await app.listen({ port, host: '0.0.0.0' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      console.error(`\nPort ${port} is already in use. Is LAN OS already running in another window? Or change "port" in config/server.yaml.\n`);
      process.exit(EXIT_CONFIG_PROBLEM);
    }
    throw error;
  }
  hub.start();
  const stopMdns = server.announce_hostname && address ? announceHostname(server.hostname, lanAddress) : () => {};

  const pruned = crashLog.prune(durationToSeconds(server.log_retention));
  if (pruned) log.info(`Removed ${pruned} old crash report${pruned > 1 ? 's' : ''}.`);

  const shutdown = () => {
    hub.stop();
    store.close();
    stopMdns();
    void app.close().then(() => {
      db.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  const named = server.announce_hostname ? `http://${server.hostname}:${port}` : null;
  const firstRun = !demo && secrets.get('ADMIN_PASSWORD') === null;
  console.log([
    '',
    `  LAN OS is running${demo ? ' in DEMO mode (pretend players and music, nothing is saved to the real history)' : ''}.`,
    '',
    `  Projector wall:    ${baseUrl()}/wall`,
    `  Player dashboard:  ${baseUrl()}/app`,
    `  Admin page:        ${baseUrl()}/admin`,
    named ? `\n  Or use the friendly name on any PC: ${named}/app` : '',
    `  On this PC you can also use http://localhost:${port}/...`,
    firstRun ? '\n  First start: the setup page opens in your browser. Finish it on this PC.' : '',
    '  Keep this window open. Close it (or press Ctrl+C) to stop LAN OS.',
    '',
  ].join('\n'));
  if (server.open_browser && !process.argv.includes('--no-browser')) openBrowser(`http://localhost:${port}/${firstRun ? 'setup' : 'admin'}`);
}

void main();
