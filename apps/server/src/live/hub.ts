// The live state of the room. Owns presence, LAN Radio, polls, activities, announcements,
// backups and the extras, and pushes a fresh snapshot to every open screen when anything changes.
import {
  buildSteamLink, derivePresence, durationToSeconds, localDateTimeToDate,
  type LiveSnapshot, type PlayerCard, type PlayerConfig, type Screen, type ServiceHealth, type SteamSummary,
} from '@lan-os/shared';
import { AiWriter } from '../announce/ai.ts';
import { Announcer } from '../announce/announcer.ts';
import type { Accounts, Session } from '../auth/accounts.ts';
import { Backups } from '../backup.ts';
import type { ConfigStore } from '../config/store.ts';
import type { Db } from '../db/database.ts';
import { appendEvent, listEvents, upsertLan } from '../db/events.ts';
import { getProfiles, getRuntimeState, saveProfile, setRuntimeState, type Profile, type RuntimeState } from '../db/profiles.ts';
import { demoSteamId, DemoSteam } from '../demo/demo-steam.ts';
import { FakeSpotify } from '../demo/fake-spotify.ts';
import { fetchChannelMessages, type DiscordMessage } from '../discord.ts';
import type { Secrets } from '../env.ts';
import { GameFinder } from '../history/game-finder.ts';
import type { CrashLog } from '../logging.ts';
import { log } from '../logging.ts';
import { Activities } from '../polls/activities.ts';
import { Polls } from '../polls/polls.ts';
import { recentSessions, restorePresence, storeTrackerEvents } from '../presence/history.ts';
import { SteamWebApi, type PresenceSource } from '../presence/steam-api.ts';
import { SteamCommunityProfiles } from '../presence/steam-community.ts';
import { PresenceTracker } from '../presence/tracker.ts';
import type { MusicService } from '../radio/music.ts';
import { Radio } from '../radio/radio.ts';
import { SpotifyApi, type SpotifyTokens } from '../radio/spotify.ts';

/** Bundle quick changes into one update for the screens. */
const PUSH_DELAY_MS = 100;
const HOUSEKEEPING_MS = 5_000;
const ANNOUNCER_EVERY_MS = 60_000;
const DISCORD_EVERY_MS = 2 * 60_000;
const GAME_FINDER_EVERY_MS = 10 * 60_000;
/** Shown when the host publishes the final recap. */
const RECAP_READY_MS = 90_000;

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
  secrets: Secrets;
  spotifyTokens: SpotifyTokens;
  dataDir: string;
  demo: boolean;
  baseUrl: () => string;
  port: number;
  now?: () => Date;
}

export class LiveHub {
  private readonly o: HubOptions;
  private readonly now: () => Date;
  private readonly startedAt: Date;
  private tracker = new PresenceTracker();
  private summaries = new Map<string, SteamSummary>();
  private subscribers = new Set<Subscriber>();
  private timers: NodeJS.Timeout[] = [];
  private pushTimer: NodeJS.Timeout | undefined;
  private pollTimer: NodeJS.Timeout | undefined;
  private backupTimer: NodeJS.Timeout | undefined;
  private polling = false;
  private steamError: string | null = null;
  private announcement: { text: string; kind: 'major' | 'minor'; until: number } | null = null;
  private everyoneInSameGame: string | null = null;
  private themeVersion = 1;
  private discordMessages: DiscordMessage[] = [];
  private discordError: string | null = null;
  private steamSource: { key: string; source: PresenceSource } | null = null;
  private music: { key: string; service: MusicService } | null = null;
  private ai: { key: string; writer: AiWriter } | null = null;
  readonly radio: Radio;
  readonly polls: Polls;
  readonly activities: Activities;
  readonly announcer: Announcer;
  readonly backups: Backups;
  readonly gameFinder: GameFinder;
  spotifyAccount: string | null = null;

  constructor(options: HubOptions) {
    this.o = options;
    this.now = options.now ?? (() => new Date());
    this.startedAt = this.now();
    this.syncLan();
    this.tracker.restore(restorePresence(this.o.db, this.lanId));

    const common = { db: options.db, store: options.store, lanId: () => this.lanId, onChange: () => this.push(), now: this.now };
    this.radio = new Radio({
      ...common,
      music: () => this.musicService(),
      notSetUpReason: () => (this.o.secrets.get('SPOTIFY_CLIENT_ID')
        ? 'Spotify is not connected yet. An admin can connect it on the admin page.'
        : 'Spotify is not set up yet. An admin can set it up on the admin page.'),
      nickname: id => this.nickname(id),
      requestsBlocked: () => {
        const runtime = this.runtime();
        if (runtime.submissions_disabled) return 'The host has paused new requests for a moment.';
        if (runtime.radio_requests_closed) return 'Song requests are paused by the host.';
        return null;
      },
    });
    this.polls = new Polls({
      ...common,
      playerIds: () => this.players.map(p => p.id),
      nickname: id => this.nickname(id),
      submissionsBlocked: () => this.submissionsBlocked(),
      onClosed: poll => {
        if (poll.closeReason === 'removed') return;
        this.announcer.offer(`poll:${poll.id}`, {
          kind: 'poll_closed', question: poll.question, tie: poll.tie,
          winner: poll.winner !== null ? poll.options[poll.winner]! : null,
          votes: poll.winner !== null ? poll.counts[poll.winner]! : 0,
        });
        void this.announcer.tick(this.o.store.get('wall').night_mode);
      },
    });
    this.activities = new Activities({ ...common, nickname: id => this.nickname(id), submissionsBlocked: () => this.submissionsBlocked() });
    this.announcer = new Announcer({
      store: options.store,
      ai: () => this.aiWriter(),
      show: (text, kind, ms, trigger) => this.showAnnouncement(text, kind, ms, trigger),
    });
    this.backups = new Backups(options.db, options.dataDir);
    this.gameFinder = new GameFinder(options.db, () => this.o.secrets.get('STEAM_API_KEY'));
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

  nickname(id: string): string {
    return this.player(id)?.nickname ?? id;
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

  private submissionsBlocked(): string | null {
    return this.runtime().submissions_disabled ? 'The host has paused new polls and activities for a moment.' : null;
  }

  // --- Integrations, created when their keys appear (no restart needed) ---

  private presenceSource(): PresenceSource {
    const key = this.o.demo ? 'demo' : this.o.secrets.get('STEAM_API_KEY') ?? 'profiles';
    if (this.steamSource?.key !== key) {
      const source = key === 'demo' ? new DemoSteam() : key === 'profiles' ? new SteamCommunityProfiles() : new SteamWebApi(key);
      this.steamSource = { key, source };
    }
    return this.steamSource.source;
  }

  musicService(): MusicService | null {
    const clientId = this.o.secrets.get('SPOTIFY_CLIENT_ID');
    const key = this.o.demo ? 'demo' : clientId && this.o.spotifyTokens.connected ? `spotify:${clientId}` : null;
    if (!key) {
      this.music = null;
      return null;
    }
    if (this.music?.key !== key) {
      this.music = { key, service: key === 'demo' ? new FakeSpotify() : new SpotifyApi(this.o.spotifyTokens, () => this.o.secrets.get('SPOTIFY_CLIENT_ID')) };
      void this.music.service.account().then(a => {
        this.spotifyAccount = a.name;
        if (!a.premium) log.warn('The connected Spotify account is not Premium. LAN Radio needs Premium to control playback.');
        this.push();
      }).catch(() => {});
    }
    return this.music.service;
  }

  /** Called after Spotify is connected or disconnected on the admin page. */
  resetMusic(): void {
    this.music = null;
    this.spotifyAccount = null;
    void this.radio.tick();
  }

  private aiWriter(): AiWriter | null {
    const key = this.o.secrets.get('AI_API_KEY');
    if (!key || !this.o.store.get('integrations').ai_enabled) return null;
    if (this.ai?.key !== key) this.ai = { key, writer: new AiWriter(key) };
    return this.ai.writer;
  }

  // --- Lifecycle ---

  start(): void {
    this.schedulePoll(0);
    this.radio.start();
    this.timers.push(setInterval(() => this.housekeeping(), HOUSEKEEPING_MS));
    this.timers.push(setInterval(() => void this.announcer.tick(this.o.store.get('wall').night_mode), ANNOUNCER_EVERY_MS));
    this.timers.push(setInterval(() => void this.refreshDiscord(), DISCORD_EVERY_MS));
    this.timers.push(setInterval(() => void this.refreshGameFinder(), GAME_FINDER_EVERY_MS));
    void this.refreshDiscord();
    setTimeout(() => void this.refreshGameFinder(), 5_000);
    this.scheduleBackup();
  }

  stop(): void {
    clearTimeout(this.pollTimer);
    clearTimeout(this.pushTimer);
    clearTimeout(this.backupTimer);
    for (const t of this.timers) clearInterval(t);
    this.radio.stop();
  }

  private housekeeping(): void {
    this.polls.tick();
    this.activities.tick();
    const lead = durationToSeconds(this.o.store.get('activities').reminder_lead_time) * 1000;
    for (const a of this.activities.list(null)) {
      const until = Date.parse(a.startsAt) - this.now().getTime();
      if (a.status === 'upcoming' && until > 0 && until <= lead) {
        this.announcer.offer(`activity:${a.id}:soon`, { kind: 'activity_soon', title: a.title, minutes: Math.max(1, Math.round(until / 60_000)), joined: a.joined });
      }
    }
    if (this.announcement && this.announcement.until < this.now().getTime()) {
      this.announcement = null;
      this.push();
    }
  }

  private scheduleBackup(): void {
    clearTimeout(this.backupTimer);
    if (this.o.demo) return;
    this.backupTimer = setTimeout(() => {
      void this.runBackup().finally(() => this.scheduleBackup());
    }, durationToSeconds(this.o.store.get('server').backup_interval) * 1000);
  }

  async runBackup(): Promise<void> {
    try {
      await this.backups.run(this.o.store.get('server').backups_to_keep);
    } catch (error) {
      this.o.crashLog.write(error, 'backup');
    }
    this.push();
  }

  /** Called when a config file changed on disk or through the admin page. */
  onConfigChange(name: string): void {
    if (name === 'event') {
      this.syncLan();
      this.tracker = new PresenceTracker();
      this.tracker.restore(restorePresence(this.o.db, this.lanId));
    }
    if (name === 'theme') this.themeVersion++;
    if (name === 'server') this.scheduleBackup();
    if (name === 'integrations') {
      this.schedulePoll(0);
      void this.refreshDiscord();
      void this.radio.tick();
    }
    if (name === 'players') {
      const ids = new Set(this.players.map(p => p.id));
      for (const id of this.tracker.all().keys()) if (!ids.has(id)) this.tracker.forget(id);
      this.schedulePoll(0);
    }
    this.push();
  }

  /** Called when a key was added on the admin page. */
  onSecretsChange(): void {
    this.steamSource = null;
    this.ai = null;
    this.resetMusic();
    this.schedulePoll(0);
    void this.refreshDiscord();
    void this.refreshGameFinder();
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
      if (!integrations.steam_enabled || this.runtime().steam_paused) return;
      const withIds = this.players.map(p => ({ player: p, steamId: this.steamIdOf(p) }));
      const ids = withIds.flatMap(x => (x.steamId ? [x.steamId] : []));
      let reachable = true;
      try {
        const list = ids.length ? await this.presenceSource().fetchSummaries(ids) : [];
        this.summaries = new Map(list.map(s => [s.steamid, s]));
        if (this.steamError) log.info('Steam is reachable again.');
        this.steamError = null;
      } catch (error) {
        reachable = false;
        const message = error instanceof Error ? error.message : String(error);
        if (this.steamError !== message) log.warn(`Steam: ${message}. Showing the last known state.`);
        this.steamError = message;
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
      const manual = profiles.get(player.id)?.manualGame ?? null;
      const derived = derivePresence({ summary, steamReachable: reachable && steamId !== null, manualGame: manual });
      // A player without a Steam ID who set a manual game is shown as playing it.
      const next = !steamId && manual ? { status: 'in_game' as const, game: { name: manual, appId: null } } : derived;
      const link = summary ? buildSteamLink(summary) : steamId ? buildSteamLink({ steamid: steamId }) : null;
      storeTrackerEvents(this.o.db, this.lanId, this.tracker.update(player.id, next, link, now));
    }
    const cards = this.players.map((p, i) => this.card(p, i, profiles.get(p.id), false, false));
    this.announcer.observe(cards, now);
    this.checkAllSameGame();
    this.push();
  }

  /** When everyone is in the same game: one short, large announcement, nothing more. */
  private checkAllSameGame(): void {
    const games = this.players.map(p => this.tracker.get(p.id)).map(s => (s?.status === 'in_game' ? s.game?.name ?? null : null));
    const shared = this.players.length > 1 && games.every(g => g !== null && g === games[0]) ? games[0]! : null;
    if (shared && shared !== this.everyoneInSameGame && this.o.store.get('announcements').trigger_all_same_game) {
      void this.announcer.announceNow(`same:${shared}:${this.now().toISOString().slice(0, 13)}`,
        { kind: 'all_same_game', game: shared, players: this.players.length }, this.o.store.get('wall').night_mode);
    }
    this.everyoneInSameGame = shared;
  }

  showAnnouncement(text: string, kind: 'major' | 'minor', ms: number, trigger: string): void {
    this.announcement = { text, kind, until: this.now().getTime() + ms };
    appendEvent(this.o.db, this.lanId, 'announcement', null, { text, trigger, kind }, this.now());
    this.push();
  }

  // --- Extras ---

  async refreshDiscord(): Promise<void> {
    const integrations = this.o.store.get('integrations');
    const token = this.o.secrets.get('DISCORD_BOT_TOKEN');
    if (!integrations.discord_enabled || !token || !integrations.discord_channel_id) {
      this.discordMessages = [];
      this.discordError = null;
      return;
    }
    try {
      this.discordMessages = await fetchChannelMessages(token, integrations.discord_channel_id);
      this.discordError = null;
    } catch (error) {
      this.discordError = error instanceof Error ? error.message : String(error);
    }
    this.push();
  }

  private async refreshGameFinder(): Promise<void> {
    if (this.o.demo) return;
    await this.gameFinder.refresh(this.players.flatMap(p => (p.steam_id ? [p.steam_id] : [])));
    this.push();
  }

  // --- Changes from players and admins ---

  updateProfile(playerId: string, changes: Partial<Profile>): void {
    saveProfile(this.o.db, this.lanId, playerId, changes, this.now());
    if ('manualGame' in changes) {
      this.applyPresence(this.players.map(p => ({ player: p, steamId: this.steamIdOf(p) })), this.steamError === null);
    } else this.push();
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

  publishRecap(published: boolean): void {
    const list = new Set(this.runtime().recap_published);
    if (published) list.add(this.lanId);
    else list.delete(this.lanId);
    this.setRuntime({ recap_published: [...list] });
    if (published) this.showAnnouncement('LAN Wrapped is ready. Open your dashboard to see the weekend in numbers.', 'major', RECAP_READY_MS, 'recap');
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
      for (const s of this.subscribers) {
        try {
          s.send(this.snapshot(s.screen, s.session));
        } catch (error) {
          this.o.crashLog.write(error, 'sending a snapshot');
        }
      }
    }, PUSH_DELAY_MS);
  }

  snapshot(screen: Screen, session: Session | null): LiveSnapshot {
    const now = this.now();
    const event = this.o.store.get('event');
    const wall = this.o.store.get('wall');
    const runtime = this.runtime();
    const profiles = getProfiles(this.o.db, this.lanId);
    const forWall = screen === 'wall';
    const players = this.players.map((p, index) => this.card(p, index, profiles.get(p.id), forWall, runtime.hide_public));
    const viewer = screen === 'wall' ? null : session?.playerId ?? null;
    const activities = this.activities.list(viewer);
    const free = players.filter(p => (p.status === 'desktop' || p.status === 'away') && !p.hiddenFromWall);
    const busyActivity = activities.some(a => a.status === 'upcoming' || a.status === 'live');
    const selected = new Set(runtime.discord_selected);

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
        highlights: this.discordMessages.filter(m => selected.has(m.id)).map(m => ({ author: m.author, text: m.text })),
      },
      radio: this.radio.info(this.players.length),
      polls: this.polls.list(viewer),
      activities,
      suggestion: !busyActivity && free.length >= Math.max(3, this.o.store.get('activities').default_min_players)
        ? { players: free.map(p => p.nickname) } : null,
      safety: { submissionsDisabled: runtime.submissions_disabled, hidePublic: runtime.hide_public, radioRequestsClosed: runtime.radio_requests_closed },
      recapPublished: runtime.recap_published.includes(this.lanId),
      gameFinder: forWall ? { available: false, reason: null, games: [] }
        : this.gameFinder.info(this.players.map(p => ({ nickname: p.nickname, steamId: this.steamIdOf(p) })), this.o.demo),
    };
    // Anonymous or hidden details never reach the wall.
    if (forWall && runtime.hide_public) snapshot.polls = snapshot.polls.map(p => ({ ...p, votersByOption: p.options.map(() => []) }));

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
      const integrations = this.o.store.get('integrations');
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
        steamPollInterval: integrations.steam_poll_interval,
        uptimeSeconds: Math.floor((now.getTime() - this.startedAt.getTime()) / 1000),
        setup: {
          adminPassword: this.o.secrets.get('ADMIN_PASSWORD') !== null,
          steamApiKey: this.o.secrets.get('STEAM_API_KEY') !== null,
          spotifyClientId: this.o.secrets.get('SPOTIFY_CLIENT_ID') !== null,
          spotifyConnected: this.o.demo || this.o.spotifyTokens.connected,
          spotifyAccount: this.spotifyAccount,
          spotifyRedirectUri: `http://127.0.0.1:${this.o.port}/auth/spotify/callback`,
          aiKey: this.o.secrets.get('AI_API_KEY') !== null,
          discordToken: this.o.secrets.get('DISCORD_BOT_TOKEN') !== null,
          hostUrl: this.o.baseUrl(),
          signInUrl: `${this.o.baseUrl()}/app/sign-in`,
        },
        lastBackup: this.backups.last(),
        recentEvents: listEvents(this.o.db, this.lanId).slice(-40).reverse().map(e => ({
          id: e.id, type: e.type, player: e.playerId ? this.nickname(e.playerId) : null, at: e.occurredAt, summary: summarize(e.type, e.data),
        })),
        discord: {
          enabled: integrations.discord_enabled,
          connected: this.discordError === null && this.discordMessages.length > 0,
          channelSet: integrations.discord_channel_id !== '',
          messages: this.discordMessages.map(m => ({ ...m, selected: selected.has(m.id) })),
        },
      };
    }
    return snapshot;
  }

  private card(p: PlayerConfig, index: number, profile: Profile | undefined, forWall: boolean, hidePublic: boolean): PlayerCard {
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
    if (forWall && (p.hidden_from_wall || hidePublic)) {
      return { ...card, nickname: 'Private player', avatarUrl: null, status: 'hidden', game: null, lastKnownGame: null,
        sessionStartedAt: null, looking: false, link: null };
    }
    return card;
  }

  private health(runtime: RuntimeState): LiveSnapshot['health'] {
    const integrations = this.o.store.get('integrations');
    let steam: ServiceHealth;
    const hasKey = this.o.secrets.get('STEAM_API_KEY') !== null;
    if (!integrations.steam_enabled) steam = { level: 'off', label: 'Steam off', detail: 'Turned off in integrations.yaml' };
    else if (runtime.steam_paused) steam = { level: 'warning', label: 'Steam paused', detail: 'Paused by an admin; showing the last known state' };
    else if (this.steamError) steam = { level: 'warning', label: 'Steam', detail: this.steamError };
    else steam = { level: 'ok', label: 'Steam', detail: this.o.demo ? 'Demo presence'
      : hasKey ? `Steam Web API · every ${integrations.steam_poll_interval}` : `Public Steam profiles · every ${integrations.steam_poll_interval}` };

    const radio = this.radio.info(this.players.length);
    const spotify: ServiceHealth = radio.status === 'ok'
      ? { level: 'ok', label: 'Spotify', detail: this.o.demo ? 'Demo LAN Radio' : `LAN Radio · ${this.spotifyAccount ?? 'connected'}` }
      : radio.status === 'off' ? { level: 'off', label: 'Spotify', detail: 'Switched off in integrations.yaml' }
        : { level: 'warning', label: 'Spotify', detail: radio.message ?? 'Offline' };
    const problems = this.o.store.problems.size;
    const server: ServiceHealth = problems
      ? { level: 'warning', label: 'Server', detail: `${problems} config file${problems > 1 ? 's have' : ' has'} a problem` }
      : { level: 'ok', label: 'Server', detail: 'Healthy' };
    return { steam, spotify, server };
  }
}

function summarize(type: string, data: Record<string, unknown>): string {
  const d = (k: string) => (data[k] === null || data[k] === undefined ? '' : String(data[k]));
  switch (type) {
    case 'game_session_started': return `Started ${d('game')}`;
    case 'game_session_ended': return `Stopped ${d('game')}`;
    case 'presence_changed': return `Now ${d('status').replace('_', ' ')}${d('game') ? ` · ${d('game')}` : ''}`;
    case 'song_requested': return `Requested ${d('title')} · ${d('artist')}`;
    case 'song_played': return `Played ${d('title')} · ${d('artist')}`;
    case 'vote_cast': return `Voted "${d('option')}" on "${d('question')}"`;
    case 'activity': return `Activity ${d('action')}: ${d('title')}`;
    case 'announcement': return d('text');
    default: return type;
  }
}
