// The live state of the room. Polls Steam, tracks sessions, and pushes a fresh snapshot
// to every open wall, dashboard and admin page whenever something changes.
import {
  buildSteamLink, derivePresence, durationToSeconds, localDateTimeToDate,
  type LiveSnapshot, type PlayerCard, type PlayerConfig, type Screen, type ServiceHealth, type SteamSummary,
} from '@lan-os/shared';
import type { Accounts, Session } from '../auth/accounts.ts';
import type { ConfigStore } from '../config/store.ts';
import type { Db } from '../db/database.ts';
import { appendEvent, upsertLan } from '../db/events.ts';
import { getProfiles, getRuntimeState, saveProfile, setRuntimeState, type Profile, type RuntimeState } from '../db/profiles.ts';
import { demoSteamId } from '../demo/demo-steam.ts';
import type { CrashLog } from '../logging.ts';
import { log } from '../logging.ts';
import { recentSessions, restorePresence, storeTrackerEvents } from '../presence/history.ts';
import type { PresenceSource } from '../presence/steam-api.ts';
import { PresenceTracker } from '../presence/tracker.ts';

/** How long the large "everyone is in the same game" announcement stays up. */
const ALL_SAME_GAME_SHOWN_MS = 60_000;
/** Bundle quick changes into one update for the screens. */
const PUSH_DELAY_MS = 100;

export interface Subscriber {
  screen: Screen;
  session: Session | null;
  send: (snapshot: LiveSnapshot) => void;
}

export interface HubOptions {
  store: ConfigStore;
  db: Db;
  accounts: Accounts;
  crashLog: CrashLog;
  source: PresenceSource | null;
  /** Why there's no source, e.g. "No Steam API key in .env". */
  sourceProblem: string | null;
  demo: boolean;
  baseUrl: () => string;
  now?: () => Date;
}

export class LiveHub {
  private readonly o: HubOptions;
  private readonly now: () => Date;
  private readonly startedAt: Date;
  private tracker = new PresenceTracker();
  private summaries = new Map<string, SteamSummary>();
  private subscribers = new Set<Subscriber>();
  private pushTimer: NodeJS.Timeout | undefined;
  private pollTimer: NodeJS.Timeout | undefined;
  private polling = false;
  private steamError: string | null = null;
  private announcement: { text: string; kind: 'major' | 'minor'; until: number } | null = null;
  private everyoneInSameGame: string | null = null;
  private themeVersion = 1;

  constructor(options: HubOptions) {
    this.o = options;
    this.now = options.now ?? (() => new Date());
    this.startedAt = this.now();
    this.syncLan();
    this.tracker.restore(restorePresence(this.o.db, this.lanId));
  }

  get lanId(): string {
    return this.o.store.get('event').lan_id;
  }

  get players(): PlayerConfig[] {
    return this.o.store.get('players').players;
  }

  player(id: string | null | undefined): PlayerConfig | undefined {
    return this.players.find(p => p.id === id);
  }

  isAdmin(session: Session | null): boolean {
    if (!session) return false;
    if (session.kind === 'admin') return true;
    return this.player(session.playerId)?.role === 'admin';
  }

  /** The Steam ID used for presence: the real one, or a pretend one in demo mode. */
  steamIdOf(player: PlayerConfig): string | null {
    if (this.o.demo) return demoSteamId(this.players.indexOf(player));
    return player.steam_id || null;
  }

  // --- Lifecycle ---

  start(): void {
    this.schedulePoll(0);
  }

  stop(): void {
    clearTimeout(this.pollTimer);
    clearTimeout(this.pushTimer);
  }

  /** Called when a config file changed on disk or through the admin page. */
  onConfigChange(name: string): void {
    if (name === 'event') {
      this.syncLan();
      this.tracker = new PresenceTracker();
      this.tracker.restore(restorePresence(this.o.db, this.lanId));
    }
    if (name === 'theme') this.themeVersion++;
    if (name === 'integrations') this.schedulePoll(0);
    if (name === 'players') {
      const ids = new Set(this.players.map(p => p.id));
      for (const id of this.tracker.all().keys()) if (!ids.has(id)) this.tracker.forget(id);
      this.schedulePoll(0);
    }
    this.push();
  }

  private syncLan(): void {
    upsertLan(this.o.db, this.o.store.get('event'), this.now());
  }

  // --- Steam polling ---

  private schedulePoll(delayMs: number): void {
    clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => void this.pollOnce().finally(() => {
      this.schedulePoll(durationToSeconds(this.o.store.get('integrations').steam_poll_interval) * 1000);
    }), delayMs);
  }

  async pollOnce(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const integrations = this.o.store.get('integrations');
      const runtime = this.runtime();
      if (!integrations.steam_enabled || runtime.steam_paused) return;
      const withIds = this.players.map(p => ({ player: p, steamId: this.steamIdOf(p) }));
      let reachable = this.o.source !== null;
      if (this.o.source) {
        const ids = withIds.flatMap(x => (x.steamId ? [x.steamId] : []));
        try {
          const list = ids.length ? await this.o.source.fetchSummaries(ids) : [];
          this.summaries = new Map(list.map(s => [s.steamid, s]));
          this.steamError = null;
        } catch (error) {
          reachable = false;
          const message = error instanceof Error ? error.message : String(error);
          if (this.steamError !== message) log.warn(`Steam: ${message}. Showing the last known state.`);
          this.steamError = message;
        }
      }
      this.applyPresence(withIds, reachable);
    } finally {
      this.polling = false;
    }
  }

  private applyPresence(players: Array<{ player: PlayerConfig; steamId: string | null }>, reachable: boolean): void {
    const now = this.now();
    const profiles = getProfiles(this.o.db, this.lanId);
    for (const { player, steamId } of players) {
      const summary = steamId ? this.summaries.get(steamId) : undefined;
      const derived = derivePresence({
        summary, steamReachable: reachable && (steamId !== null || this.o.demo),
        manualGame: profiles.get(player.id)?.manualGame ?? null,
      });
      // A player without a Steam ID who set a manual game is shown as playing it.
      const manual = profiles.get(player.id)?.manualGame;
      const next = !steamId && manual ? { status: 'in_game' as const, game: { name: manual, appId: null } } : derived;
      const link = summary ? buildSteamLink(summary) : steamId ? buildSteamLink({ steamid: steamId }) : null;
      storeTrackerEvents(this.o.db, this.lanId, this.tracker.update(player.id, next, link, now));
    }
    this.checkAllSameGame();
    this.push();
  }

  /** When everyone is in the same game: one short, large announcement, nothing more. */
  private checkAllSameGame(): void {
    const games = this.players.map(p => this.tracker.get(p.id)).map(s => (s?.status === 'in_game' ? s.game?.name ?? null : null));
    const shared = this.players.length > 1 && games.every(g => g !== null && g === games[0]) ? games[0]! : null;
    if (shared && shared !== this.everyoneInSameGame && this.o.store.get('announcements').trigger_all_same_game) {
      const text = `Everyone is in ${shared}.`;
      this.announcement = { text, kind: 'major', until: this.now().getTime() + ALL_SAME_GAME_SHOWN_MS };
      appendEvent(this.o.db, this.lanId, 'announcement', null, { text, trigger: 'all_same_game' }, this.now());
      setTimeout(() => this.push(), ALL_SAME_GAME_SHOWN_MS + 50);
    }
    this.everyoneInSameGame = shared;
  }

  // --- Changes from players and admins ---

  updateProfile(playerId: string, changes: Partial<Profile>): void {
    saveProfile(this.o.db, this.lanId, playerId, changes, this.now());
    if ('manualGame' in changes) void this.pollOnceFromCache();
    else this.push();
  }

  /** Re-derives presence without asking Steam again, so a manual game shows at once. */
  private async pollOnceFromCache(): Promise<void> {
    const reachable = this.o.source !== null && this.steamError === null;
    this.applyPresence(this.players.map(p => ({ player: p, steamId: this.steamIdOf(p) })), reachable);
  }

  runtime(): RuntimeState {
    return getRuntimeState(this.o.db);
  }

  setRuntime(changes: Partial<RuntimeState>): void {
    setRuntimeState(this.o.db, changes, this.now());
    if (changes.wall_message) {
      appendEvent(this.o.db, this.lanId, 'announcement', null, { text: changes.wall_message, trigger: 'admin_message' }, this.now());
    }
    if (changes.steam_paused === false) this.schedulePoll(0);
    this.push();
  }

  // --- Snapshots ---

  subscribe(subscriber: Subscriber): () => void {
    this.subscribers.add(subscriber);
    subscriber.send(this.snapshot(subscriber.screen, subscriber.session));
    return () => this.subscribers.delete(subscriber);
  }

  /** Sends every screen a fresh snapshot shortly after a change. */
  push(): void {
    clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => {
      for (const s of this.subscribers) s.send(this.snapshot(s.screen, s.session));
    }, PUSH_DELAY_MS);
  }

  snapshot(screen: Screen, session: Session | null): LiveSnapshot {
    const now = this.now();
    const event = this.o.store.get('event');
    const wall = this.o.store.get('wall');
    const runtime = this.runtime();
    const profiles = getProfiles(this.o.db, this.lanId);
    const forWall = screen === 'wall';
    const players = this.players.map((p, index) => this.card(p, index, profiles.get(p.id), forWall));

    if (this.announcement && this.announcement.until < now.getTime()) this.announcement = null;
    const snapshot: LiveSnapshot = {
      serverNow: now.toISOString(),
      demo: this.o.demo,
      themeVersion: this.themeVersion,
      event: {
        name: event.name,
        startsAt: localDateTimeToDate(event.starts_at, event.timezone).toISOString(),
        endsAt: localDateTimeToDate(event.ends_at, event.timezone).toISOString(),
        timezone: event.timezone,
      },
      players,
      health: this.health(runtime),
      wall: {
        nightMode: wall.night_mode,
        brightness: wall.brightness,
        panels: wall.panels,
        blanked: runtime.wall_blanked,
        paused: runtime.wall_paused,
        message: runtime.wall_message,
        announcement: this.announcement ? { text: this.announcement.text, kind: this.announcement.kind } : null,
      },
    };

    const me = this.player(session?.playerId);
    if (me && screen !== 'wall') {
      const profile = profiles.get(me.id);
      snapshot.me = {
        id: me.id, nickname: me.nickname, tone: this.players.indexOf(me) % 7, isAdmin: this.isAdmin(session),
        hasPin: this.o.accounts.hasPin(me.id), manualGame: profile?.manualGame ?? null, layout: profile?.layout ?? null,
        sessions: recentSessions(this.o.db, this.lanId, me.id, now),
      };
    }
    if (screen === 'admin' && this.isAdmin(session)) {
      snapshot.admin = {
        players: this.players.map((p, index) => {
          const token = this.o.accounts.joinLinkFor(p.id);
          return {
            id: p.id, nickname: p.nickname, tone: index % 7, steamId: p.steam_id, role: p.role,
            hiddenFromWall: p.hidden_from_wall, joinLink: token ? `${this.o.baseUrl()}/join/${token}` : null,
          };
        }),
        crashes: this.o.crashLog.list(),
        configProblems: [...this.o.store.problems.values()].flat(),
        steamPaused: runtime.steam_paused,
        steamPollInterval: this.o.store.get('integrations').steam_poll_interval,
        uptimeSeconds: Math.floor((now.getTime() - this.startedAt.getTime()) / 1000),
      };
    }
    return snapshot;
  }

  private card(p: PlayerConfig, index: number, profile: Profile | undefined, forWall: boolean): PlayerCard {
    const state = this.tracker.get(p.id);
    const steamId = this.steamIdOf(p);
    const summary = steamId ? this.summaries.get(steamId) : undefined;
    const card: PlayerCard = {
      id: p.id,
      nickname: p.nickname,
      tone: index % 7,
      avatarUrl: this.o.demo ? null : summary?.avatarfull ?? null,
      status: state?.status ?? 'unknown',
      statusSince: state?.statusSince ?? this.startedAt.toISOString(),
      game: state?.game ?? null,
      lastKnownGame: state?.lastKnownGame ?? null,
      sessionStartedAt: state?.session?.startedAt ?? null,
      looking: profile?.looking ?? false,
      hiddenFromWall: p.hidden_from_wall,
      link: state?.link ?? null,
      updatedAt: state?.updatedAt ?? null,
    };
    // The wall never receives what a hidden player is doing.
    if (forWall && p.hidden_from_wall) {
      return { ...card, nickname: 'Private player', avatarUrl: null, status: 'hidden', game: null, lastKnownGame: null,
        sessionStartedAt: null, looking: false, link: null };
    }
    return card;
  }

  private health(runtime: RuntimeState): LiveSnapshot['health'] {
    const integrations = this.o.store.get('integrations');
    let steam: ServiceHealth;
    if (!integrations.steam_enabled) steam = { level: 'off', label: 'Steam off', detail: 'Turned off in integrations.yaml' };
    else if (runtime.steam_paused) steam = { level: 'warning', label: 'Steam paused', detail: 'Paused by an admin; showing the last known state' };
    else if (!this.o.source) steam = { level: 'warning', label: 'Steam', detail: this.o.sourceProblem ?? 'Not connected' };
    else if (this.steamError) steam = { level: 'warning', label: 'Steam', detail: this.steamError };
    else steam = { level: 'ok', label: 'Steam', detail: this.o.demo ? 'Demo presence' : `Presence polling · ${integrations.steam_poll_interval}` };

    const spotify: ServiceHealth = this.o.demo
      ? { level: 'ok', label: 'Spotify', detail: 'Demo · LAN Radio arrives in Milestone 2' }
      : { level: 'off', label: 'Spotify', detail: 'LAN Radio arrives in Milestone 2' };
    const problems = this.o.store.problems.size;
    const server: ServiceHealth = problems
      ? { level: 'warning', label: 'Server', detail: `${problems} config file${problems > 1 ? 's have' : ' has'} a problem` }
      : { level: 'ok', label: 'Server', detail: 'Healthy' };
    return { steam, spotify, server };
  }
}
