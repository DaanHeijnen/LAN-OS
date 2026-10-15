// The player dashboard (/app).
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import {
  DASHBOARD_PANELS, formatDuration, isJoinable, lanClock, shortDate, STATUS_DISPLAY,
  type DashboardLayout, type LiveSnapshot, type MeInfo, type PlayerCard,
} from '@lan-os/shared';
import { cardDuration, cardGame, gameCode, staleLabel } from '../format.ts';
import { api, useLive, useNow } from '../live.ts';
import { groupRoster } from '../roster.ts';
import { Avatar, Modal, StatusDot, Switch, useAction, useToast } from '../ui/common.tsx';
import { Icon, type IconName } from '../ui/Icon.tsx';
import { AllSystems, Shell, TopAvatar } from '../ui/Shell.tsx';
import { ActivitiesPanel, ActivityModal, HistoryPanel, PollModal, PollsPanel, RadioPanel, SongModal, type Panel } from './panels.tsx';
import { useSignedIn } from './SignIn.tsx';
import { TournamentPanel } from './tournament.tsx';
import '../styles/app.css';
import '../styles/lan-os.css';

const DEFAULT_LAYOUT: DashboardLayout = { order: [...DASHBOARD_PANELS], hidden: [], collapsed: [], compact: false };
const PANEL_NAMES: Record<Panel, string> = { radio: 'LAN Radio', polls: 'Room decisions', activities: 'Coming up', history: 'Session history' };
const SOUND_KEY = 'lanos-sound-cues';

type ModalState = 'status' | 'customize' | 'song' | 'poll' | 'activity' | { player: string } | null;

const readSound = () => { try { return localStorage.getItem(SOUND_KEY) === 'on'; } catch { return false; } };

/** A short, soft chime for important items. Dashboards only; the projector never makes sound. */
function chime() {
  try {
    const ctx = new AudioContext();
    for (const [i, freq] of [660, 880].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.12 + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.3);
    }
    window.setTimeout(() => void ctx.close(), 800);
  } catch { /* no audio available */ }
}

/** Popups (inside this tab only) for a new poll and for activities you joined that start soon. */
function useNotifications(snapshot: LiveSnapshot | null, me: MeInfo | undefined, now: Date, sound: boolean) {
  const toast = useToast();
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!snapshot || !me) return;
    const keys: Array<[string, string]> = [];
    for (const p of snapshot.polls) {
      if (!p.closedAt && p.createdById !== me.id && p.myVote === null) keys.push([`poll:${p.id}`, `New poll from ${p.createdBy}: ${p.question}`]);
      if (p.closedAt && p.tie === false && p.winner !== null) keys.push([`poll-closed:${p.id}`, `"${p.question}": ${p.options[p.winner]} wins.`]);
    }
    for (const a of snapshot.activities) {
      const until = Date.parse(a.startsAt) - now.getTime();
      if (a.status === 'upcoming' && a.organizerId !== me.id && a.myAnswer === null) keys.push([`activity:${a.id}`, `${a.organizer} proposed ${a.title}. Join?`]);
      if (a.status === 'upcoming' && (a.myAnswer === 'join' || a.myAnswer === 'maybe') && until <= 5 * 60_000) keys.push([`soon:${a.id}`, `${a.title} starts in ${Math.max(1, Math.round(until / 60_000))} minutes.`]);
    }
    // The first snapshot only records what already exists, so a page load doesn't fire old popups.
    if (seen.current === null) {
      seen.current = new Set(keys.map(([k]) => k));
      return;
    }
    const fresh = keys.filter(([k]) => !seen.current!.has(k));
    for (const [k] of fresh) seen.current.add(k);
    if (fresh.length) {
      toast(fresh[fresh.length - 1]![1]);
      if (sound) chime();
    }
  }, [snapshot, me, now, sound, toast]);
}

export default function Player() {
  const signedIn = useSignedIn('player');
  const { snapshot, connected, offsetMs } = useLive('app');
  const now = useNow(offsetMs);
  const [modal, setModal] = useState<ModalState>(null);
  const [layout, setLayoutState] = useState<DashboardLayout>(DEFAULT_LAYOUT);
  const [sound, setSound] = useState(readSound);
  const toast = useToast();

  useEffect(() => { document.title = 'LAN OS · Player dashboard'; }, []);
  useEffect(() => { if (snapshot?.me?.layout) setLayoutState(snapshot.me.layout); }, [snapshot?.me?.layout]);
  useEffect(() => { document.body.className = `app-shell player-page${layout.compact ? ' mini' : ''}`; }, [layout.compact]);
  useNotifications(snapshot, snapshot?.me, now, sound);

  const setLayout = useCallback((next: DashboardLayout) => {
    setLayoutState(next);
    void api('/api/me/layout', 'POST', next).catch(() => toast('Your layout could not be saved.'));
  }, [toast]);

  if (!signedIn || !snapshot?.me) return null;
  const me = snapshot.me;
  const open = (m: 'song' | 'poll' | 'activity') => setModal(m);
  const openPolls = snapshot.polls.filter(p => !p.closedAt && p.myVote === null).length;
  const panelProps = (panel: Panel) => ({
    snapshot, me, now, open, collapsed: layout.collapsed.includes(panel),
    onToggle: () => setLayout({ ...layout, collapsed: toggle(layout.collapsed, panel) }),
  });

  return (
    <>
      <Shell
        snapshot={snapshot} now={now} sectionLabel="YOUR SPACE" breadcrumb="PLAYER DASHBOARD"
        nav={[
          { href: '#overview', icon: 'layout-dashboard', label: 'Overview' },
          ...(snapshot.tournament && snapshot.tournament.state !== 'setup' ? [{ href: '#tournament', icon: 'trophy' as IconName, label: 'Tournament' }] : []),
          { href: '#radio', icon: 'music-2', label: 'LAN Radio', count: snapshot.radio.queue.length },
          { href: '#polls', icon: 'chart-no-axes-column', label: 'Polls & activities', ...(openPolls ? { count: openPolls } : {}) },
          { href: '#game-finder', icon: 'gamepad-2', label: 'Games & friends' },
          { href: '/recap', icon: 'history', label: 'LAN Wrapped' },
        ]}
        extraLabel="MANAGEMENT"
        extraNav={me.isAdmin ? [{ href: '/admin', icon: 'sliders-horizontal', label: 'Admin tools', trailing: true }] : []}
        health={<><StatusDot level={snapshot.health.steam.level} />{snapshot.health.steam.level === 'ok' ? 'Steam connected' : snapshot.health.steam.label}
          <span className="muted">· {snapshot.health.steam.level === 'ok' ? 'live sync' : 'see admin'}</span></>}
        account={<button type="button" className="account-switch" onClick={() => setModal('status')}>
          <Avatar nickname={me.nickname} tone={me.tone} url={snapshot.players.find(p => p.id === me.id)?.avatarUrl} />
          <span><b>{me.nickname}</b><small>Your profile &amp; status</small></span><Icon name="chevrons-up-down" />
        </button>}
        topbar={<>
          <AllSystems snapshot={snapshot} connected={connected} />
          <button type="button" className="icon-btn" aria-label="Customize dashboard" title="Customize panels" onClick={() => setModal('customize')}><Icon name="sliders-horizontal" /></button>
          <button type="button" className="icon-btn" aria-label="Toggle mini dashboard" title="Toggle mini dashboard"
            onClick={() => { setLayout({ ...layout, compact: !layout.compact }); if (!layout.compact) toast('Compact second-screen view enabled.'); }}><Icon name="panels-top-left" /></button>
          <TopAvatar nickname={me.nickname} tone={me.tone} />
        </>}
      >
        <main className="main-content player-main" id="overview">
          <PageHead snapshot={snapshot} me={me} now={now} />
          <div className="quick-actions">
            <button className="button button-primary" disabled={!snapshot.radio.requestsOpen} onClick={() => open('song')}
              title={snapshot.radio.requestsOpen ? undefined : snapshot.radio.message ?? snapshot.radio.requestsClosedReason ?? undefined}>
              <Icon name="plus" /> Request a song <Icon name="arrow-up-right" className="button-tail" /></button>
            <button className="button button-soft" onClick={() => open('poll')}><Icon name="chart-no-axes-column" /> Start a poll</button>
            <button className="button button-soft" onClick={() => open('activity')}><Icon name="calendar-plus" /> Propose activity</button>
            <button className="button button-quiet" onClick={() => setModal('status')}><Icon name="scan-face" /> Your status <Icon name="chevron-down" /></button>
          </div>
          {snapshot.recapPublished && <div className="fair-note recap-ready"><Icon name="history" /> LAN Wrapped is ready. <a className="text-button" href="/recap">See the weekend in numbers <Icon name="arrow-right" /></a></div>}
          <div className="player-layout">
            <div className="player-primary">
              <TournamentPanel snapshot={snapshot} me={me} now={now} />
              <Roster snapshot={snapshot} me={me} now={now} onEditStatus={() => setModal('status')} onDetails={id => setModal({ player: id })} />
              <GameFinder snapshot={snapshot} />
            </div>
            <div className="player-secondary" id="player-panels">
              {layout.order.filter(p => !layout.hidden.includes(p)).map(panel =>
                panel === 'radio' ? <RadioPanel key={panel} {...panelProps(panel)} />
                  : panel === 'polls' ? <PollsPanel key={panel} {...panelProps(panel)} />
                    : panel === 'activities' ? <ActivitiesPanel key={panel} {...panelProps(panel)} />
                      : <HistoryPanel key={panel} {...panelProps(panel)} />)}
            </div>
          </div>
          <div className="footer-note">Made for the people in this room. LAN-only · No pop-ups outside this tab{snapshot.demo ? ' · Demo data' : ''}</div>
        </main>
      </Shell>
      <button className="button button-primary mini-exit" onClick={() => setLayout({ ...layout, compact: false })}><Icon name="panels-top-left" /> Expand dashboard</button>

      {modal === 'status' && <StatusModal snapshot={snapshot} me={me} sound={sound} onSound={on => { setSound(on); try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch { /* private window */ } if (on) chime(); }} onClose={() => setModal(null)} />}
      {modal === 'customize' && <CustomizeModal layout={layout} onChange={setLayout} onClose={() => setModal(null)} />}
      {modal === 'song' && <SongModal onClose={() => setModal(null)} />}
      {modal === 'poll' && <PollModal onClose={() => setModal(null)} />}
      {modal === 'activity' && <ActivityModal onClose={() => setModal(null)} />}
      {modal && typeof modal === 'object' && <PlayerDetails player={snapshot.players.find(p => p.id === modal.player)} me={me}
        now={now} onClose={() => setModal(null)} />}
    </>
  );
}

const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter(x => x !== item) : [...list, item]);

function PageHead({ snapshot, me, now }: { snapshot: LiveSnapshot; me: MeInfo; now: Date }) {
  const clock = lanClock(snapshot.event, now);
  const tz = snapshot.event.timezone;
  const date = shortDate(now.toISOString(), tz, { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
  const online = snapshot.players.filter(p => p.status !== 'offline' && p.status !== 'unknown').length;
  return (
    <div className="page-head">
      <div>
        <p className="eyebrow"><span className="eyebrow-dot" /> {date} · {clock.phase === 'live' ? 'LIVE' : clock.phase === 'before' ? 'SOON' : 'FINISHED'}</p>
        <h1>Hey, {me.nickname}<span className="soft-period">.</span></h1>
        <p className="page-subtitle">{online === snapshot.players.length ? "Everyone's in the room." : `${online} of ${snapshot.players.length} are online.`} Here's what's happening.</p>
      </div>
      <div className="countdown-block">
        <div className="count-label">{clock.phase === 'before' ? 'TIME UNTIL THE LAN' : 'TIME LEFT IN THE LAN'}</div>
        <div className="count-value">{clock.hoursLeft > 48
          ? <>{Math.floor(clock.hoursLeft / 24)}<span>d</span> {clock.hoursLeft % 24}<span>h</span></>
          : <>{clock.hoursLeft}<span>h</span> {clock.minutesLeft}<span>m</span></>}</div>
        <div className="count-foot">Ends {shortDate(snapshot.event.endsAt, tz, { weekday: 'short', day: 'numeric', month: 'short' })} at {shortDate(snapshot.event.endsAt, tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}</div>
      </div>
    </div>
  );
}

function Roster({ snapshot, me, now, onEditStatus, onDetails }:
  { snapshot: LiveSnapshot; me: MeInfo; now: Date; onEditStatus: () => void; onDetails: (id: string) => void }) {
  const { groups, rest } = groupRoster(snapshot.players, { respectHidden: false });
  const row = (p: PlayerCard) => <PlayerRow key={p.id} p={p} me={me} now={now} timezone={snapshot.event.timezone} onEditStatus={onEditStatus} onDetails={onDetails} />;
  return (
    <section className="card player-roster" id="room">
      <div className="section-header">
        <div><div className="section-overline">THE ROOM</div><h2>Who's playing what <span className="heading-count">{snapshot.players.length}</span></h2></div>
        <div className="text-meta"><StatusDot level={snapshot.health.steam.level} /> {snapshot.health.steam.level === 'ok' ? 'Live Steam presence' : snapshot.health.steam.detail}</div>
      </div>
      <div id="player-list" aria-live="polite">
        {groups.map(g => (
          <div className="player-group" key={g.game}>
            <div className="player-group-label">{g.game.toUpperCase()} <span className="group-line" /> {g.players.length} PLAYING</div>
            {g.players.map(row)}
          </div>
        ))}
        <div className="player-group">
          <div className="player-group-label">EVERYONE ELSE <span className="group-line" /></div>
          {rest.map(row)}
        </div>
      </div>
      <div className="card-footer">
        <span><Icon name="refresh-cw" /> Syncs automatically</span>
        <a className="text-button" href="#history">View session history <Icon name="arrow-right" /></a>
      </div>
    </section>
  );
}

const STATUS_ICON: Record<PlayerCard['status'], IconName> = {
  in_game: 'play', away: 'moon-star', offline: 'ban', desktop: 'monitor', hidden: 'eye-off', unknown: 'info',
};

function PlayerRow({ p, me, now, timezone, onEditStatus, onDetails }:
  { p: PlayerCard; me: MeInfo; now: Date; timezone: string; onEditStatus: () => void; onDetails: (id: string) => void }) {
  const yourself = p.id === me.id;
  const game = cardGame(p);
  const stale = staleLabel(p, timezone);
  const stop = (event: SyntheticEvent) => event.stopPropagation();
  const action = yourself
    ? <button className="mini-action" onClick={e => { stop(e); onEditStatus(); }}>Edit status</button>
    : p.status === 'offline' || !p.link
      ? <button className="mini-action disabled" disabled>{p.status === 'offline' ? 'Offline' : 'No Steam'}</button>
      : <a className={`mini-action ${isJoinable(p.link) ? 'join' : ''}`} href={p.link.url} onClick={stop}
        title={isJoinable(p.link) ? `Join ${p.nickname}'s game in Steam` : `Open ${p.nickname}'s Steam profile`}>
        {isJoinable(p.link) ? 'Join game ↗' : 'Steam ↗'}
      </a>;
  return (
    <div className={`player-row ${p.status === 'offline' ? 'row-offline' : ''}`} role="button" tabIndex={0}
      aria-label={`Show ${p.nickname}'s activity`} onClick={() => onDetails(p.id)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onDetails(p.id); } }}>
      <Avatar nickname={p.nickname} tone={p.tone} url={p.avatarUrl} offline={p.status === 'offline'} />
      <div className="player-row-left">
        <div className="player-name-line">
          <b className="player-name">{p.nickname}</b>
          {yourself && <span className="player-you">YOU</span>}
          {p.looking && <span className="looking-tiny">{STATUS_DISPLAY.looking.icon} Looking</span>}
          {p.hiddenFromWall && <span className="looking-tiny">{STATUS_DISPLAY.hidden.icon} Private on wall</span>}
        </div>
        <div className="player-row-status">
          <Icon name={STATUS_ICON[p.status]} />
          <span className={`status-text status-${p.status}`}>{STATUS_DISPLAY[p.status].word}</span>
          {game && <span className="game-text">· {game.prefix}{game.name}</span>}
          {stale && <span className="game-text">· {stale}</span>}
        </div>
      </div>
      <div className="player-row-actions"><b className="duration">{cardDuration(p, now)}</b>{action}</div>
    </div>
  );
}

function GameFinder({ snapshot }: { snapshot: LiveSnapshot }) {
  const finder = snapshot.gameFinder;
  return (
    <section className="card game-finder" id="game-finder">
      <div className="section-header">
        <div><div className="section-overline">SHARED GAME FINDER</div><h2>Play something together</h2></div>
        <span className="tiny-pill">{finder.available ? 'FROM STEAM LIBRARIES' : 'NEEDS STEAM KEY'}</span>
      </div>
      <p className="muted game-finder-intro">Games several friends own. Suggestions stay here, never on the wall.</p>
      {finder.reason && <p className="muted game-finder-intro">{finder.reason}</p>}
      <div id="game-finder-list">
        {finder.games.map((g, i) => (
          <div className="game-suggestion" key={g.appId}>
            <div className={`game-tile ${['dr', 'va', 'rl'][i % 3]}`}>{gameCode(g.name)}</div>
            <div><b>{g.name}</b><span title={g.owners.join(', ')}>{g.owners.length} of {snapshot.players.length} players own it</span></div>
            <a className="tiny-pill" href={`steam://run/${g.appId}`}>PLAY ↗</a>
          </div>
        ))}
      </div>
    </section>
  );
}

function StatusModal({ snapshot, me, sound, onSound, onClose }:
  { snapshot: LiveSnapshot; me: MeInfo; sound: boolean; onSound: (on: boolean) => void; onClose: () => void }) {
  const card = snapshot.players.find(p => p.id === me.id);
  const run = useAction();
  const [game, setGame] = useState(me.manualGame ?? '');
  const [pin, setPin] = useState('');
  const status = (body: object, success: string) => run(() => api('/api/me/status', 'POST', body), success);
  return (
    <Modal title="Your status & privacy" label="STEAM PRESENCE" onClose={onClose}
      footer={<button className="button button-quiet" onClick={() => void api('/api/auth/sign-out').then(() => location.replace('/app/sign-in'))}><Icon name="log-out" /> Sign out</button>}>
      <div className="status-settings">
        <div className="setting-line">
          <div><b>Looking for players</b><small>Let everyone know you have room for one more.</small></div>
          <Switch label="Looking for players" checked={card?.looking ?? false}
            onChange={next => void status({ looking: next }, next ? 'You are looking for players.' : 'Looking for players switched off.')} />
        </div>
        <div className="setting-line">
          <div><b>Hide me from projector</b><small>Keep your Steam activity private on the wall.</small></div>
          <Switch label="Hide me from projector" checked={card?.hiddenFromWall ?? false}
            onChange={next => void status({ hiddenFromWall: next }, next ? 'Hidden from the wall.' : 'Visible on the wall again.')} />
        </div>
        <div className="setting-line">
          <div><b>Sound cues</b><small>A soft chime in this tab for new polls and activities starting soon.</small></div>
          <Switch label="Sound cues" checked={sound} onChange={onSound} />
        </div>
        <form onSubmit={e => { e.preventDefault(); void status({ manualGame: game.trim() || null }, game.trim() ? 'Manual game override saved.' : 'Steam game detection restored.'); }}>
          <div className="modal-field">
            <label htmlFor="manual-game">Manual game override</label>
            <input id="manual-game" value={game} maxLength={60} onChange={e => setGame(e.target.value)} placeholder="Non-Steam game title" />
            <small>Useful if Steam misses a game. Clear this field to use Steam presence.</small>
          </div>
          <button type="submit" className="button button-soft button-small">Save game override</button>
        </form>
        <form onSubmit={e => { e.preventDefault(); void run(() => api('/api/me/pin', 'POST', { pin }), 'PIN saved.').then(ok => ok && setPin('')); }}>
          <div className="modal-field">
            <label htmlFor="pin">Quick PIN for a new browser {me.hasPin && <span className="muted">· set</span>}</label>
            <input id="pin" inputMode="numeric" pattern="\d{4}" maxLength={4} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} placeholder="4 digits" />
            <small>Optional. With a PIN you can sign in on another PC without Steam: pick your name on the sign-in page.</small>
          </div>
          <button type="submit" className="button button-soft button-small" disabled={pin.length !== 4}>Save PIN</button>
          {me.hasPin && <button type="button" className="text-button" style={{ marginLeft: 12 }}
            onClick={() => void run(() => api('/api/me/pin', 'POST', { pin: null }), 'PIN removed.')}>Remove PIN</button>}
        </form>
      </div>
    </Modal>
  );
}

function CustomizeModal({ layout, onChange, onClose }: { layout: DashboardLayout; onChange: (l: DashboardLayout) => void; onClose: () => void }) {
  const move = (panel: Panel, by: number) => {
    const order = [...layout.order];
    const i = order.indexOf(panel);
    const j = i + by;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j]!, order[i]!];
    onChange({ ...layout, order });
  };
  return (
    <Modal title="Customize dashboard" label="PERSONAL LAYOUT" onClose={onClose}
      footer={<button className="button button-primary" onClick={onClose}>Done</button>}>
      <p className="modal-help" style={{ marginTop: 0, marginBottom: 16 }}>Choose which right-hand panels to show, and change their order. Your layout follows you to any browser.</p>
      {layout.order.map((panel, i) => {
        const visible = !layout.hidden.includes(panel);
        return (
          <div className="setting-line" key={panel}>
            <div style={{ flex: 1 }}><b>{PANEL_NAMES[panel]}</b><small>Position {i + 1} · {visible ? 'Visible' : 'Hidden'}</small></div>
            <button className="icon-btn compact" title="Move up" disabled={i === 0} onClick={() => move(panel, -1)}><Icon name="chevron-up" /></button>
            <button className="icon-btn compact" title="Move down" disabled={i === layout.order.length - 1} onClick={() => move(panel, 1)}><Icon name="chevron-down" /></button>
            <Switch label={`Show ${PANEL_NAMES[panel]}`} checked={visible} onChange={() => onChange({ ...layout, hidden: toggle(layout.hidden, panel) })} />
          </div>
        );
      })}
    </Modal>
  );
}

function PlayerDetails({ player, me, now, onClose }: { player: PlayerCard | undefined; me: MeInfo; now: Date; onClose: () => void }) {
  if (!player) return null;
  const game = cardGame(player);
  const earlier = player.id === me.id ? me.sessions.find(s => s.endedAt) : undefined;
  return (
    <Modal title={`${player.nickname}'s session`} label="PLAYER DETAILS" onClose={onClose}
      footer={<button className="button button-soft" onClick={onClose}>Close</button>}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 15, marginBottom: 20 }}>
        <Avatar nickname={player.nickname} tone={player.tone} url={player.avatarUrl} />
        <div><b style={{ fontSize: 17 }}>{player.nickname}</b>
          <div className="muted text-sm">{STATUS_DISPLAY[player.status].word}{game ? ` · ${game.prefix}${game.name}` : ''}</div></div>
      </div>
      <div className="setting-line">
        <div><b>{player.status === 'offline' ? 'Offline since' : player.sessionStartedAt ? 'Current session' : 'Status for'}</b>
          <small>{player.game?.name ?? STATUS_DISPLAY[player.status].word}</small></div>
        <b>{cardDuration(player, now)}</b>
      </div>
      {earlier && <div className="setting-line">
        <div><b>Previous session</b><small>{earlier.game} · {formatDuration(earlier.seconds)}</small></div>
        <Icon name="history" />
      </div>}
      <p className="modal-help">LAN OS measures session time from the first Steam presence observation, not from a process on the PC.</p>
    </Modal>
  );
}
