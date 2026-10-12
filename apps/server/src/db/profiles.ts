// Per-LAN player settings (Looking for players, manual game, dashboard layout) and
// runtime switches that must survive a restart.
import type { DashboardLayout } from '@lan-os/shared';
import type { Db } from './database.ts';

export interface Profile {
  looking: boolean;
  manualGame: string | null;
  layout: DashboardLayout | null;
}

const EMPTY: Profile = { looking: false, manualGame: null, layout: null };

export function getProfiles(db: Db, lanId: string): Map<string, Profile> {
  const rows = db.prepare('SELECT player_id, looking_for_players, manual_game, dashboard_layout FROM player_profiles WHERE lan_id = ?')
    .all(lanId) as Array<{ player_id: string; looking_for_players: number; manual_game: string | null; dashboard_layout: string | null }>;
  return new Map(rows.map(r => [r.player_id, {
    looking: r.looking_for_players === 1,
    manualGame: r.manual_game,
    layout: r.dashboard_layout ? JSON.parse(r.dashboard_layout) as DashboardLayout : null,
  }]));
}

export function saveProfile(db: Db, lanId: string, playerId: string, changes: Partial<Profile>, now = new Date()): Profile {
  const current = getProfiles(db, lanId).get(playerId) ?? EMPTY;
  const next = { ...current, ...changes };
  db.prepare(`
    INSERT INTO player_profiles (lan_id, player_id, looking_for_players, manual_game, dashboard_layout, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (lan_id, player_id) DO UPDATE SET
      looking_for_players = excluded.looking_for_players, manual_game = excluded.manual_game,
      dashboard_layout = excluded.dashboard_layout, updated_at = excluded.updated_at
  `).run(lanId, playerId, next.looking ? 1 : 0, next.manualGame, next.layout ? JSON.stringify(next.layout) : null, now.toISOString());
  return next;
}

export interface RuntimeState {
  wall_blanked: boolean;
  wall_paused: boolean;
  wall_message: string | null;
  steam_paused: boolean;
  /** Safety controls on the admin page. */
  submissions_disabled: boolean;
  hide_public: boolean;
  radio_requests_closed: boolean;
  /** Discord message IDs the host picked for the wall. */
  discord_selected: string[];
  /** LANs whose final recap the host has published. */
  recap_published: string[];
}

const RUNTIME_DEFAULTS: RuntimeState = {
  wall_blanked: false, wall_paused: false, wall_message: null, steam_paused: false,
  submissions_disabled: false, hide_public: false, radio_requests_closed: false, discord_selected: [], recap_published: [],
};

export function getRuntimeState(db: Db): RuntimeState {
  const rows = db.prepare('SELECT key, value FROM runtime_state').all() as Array<{ key: string; value: string }>;
  const state = { ...RUNTIME_DEFAULTS };
  for (const row of rows) {
    if (row.key in state) (state as Record<string, unknown>)[row.key] = JSON.parse(row.value);
  }
  return state;
}

export function setRuntimeState(db: Db, changes: Partial<RuntimeState>, now = new Date()): void {
  const statement = db.prepare(`INSERT INTO runtime_state (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`);
  db.transaction(() => {
    for (const [key, value] of Object.entries(changes)) statement.run(key, JSON.stringify(value), now.toISOString());
  })();
}
