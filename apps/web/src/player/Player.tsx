// The player dashboard (/app). Markup follows design/prototype/design/templates/player.html.
// Real in Milestone 1: the roster with Join game / Steam ↗, "Your status", panel layout and compact view.
// LAN Radio, polls, activities and the Shared Game Finder show demo data until their milestone.
import { useCallback, useEffect, useState, type SyntheticEvent } from 'react';
import {
  DASHBOARD_PANELS, DEMO_ACTIVITY, DEMO_POLL, DEMO_SHARED_GAMES, formatDuration, isJoinable, lanClock, shortDate,
  STATUS_DISPLAY, type DashboardLayout, type LiveSnapshot, type MeInfo, type PlayerCard,
} from '@lan-os/shared';
import { cardDuration, cardGame, gameCode, mmss, staleLabel } from '../format.ts';
import { api, useLive, useNow } from '../live.ts';
import { demoRadioAt, groupRoster } from '../roster.ts';
import { Avatar, Modal, StatusDot, Switch, useAction, useToast } from '../ui/common.tsx';
import { Icon, type IconName } from '../ui/Icon.tsx';
import { AllSystems, Shell, TopAvatar } from '../ui/Shell.tsx';
import { useSignedIn } from './SignIn.tsx';
import '../styles/app.css';
import '../styles/lan-os.css';

type Panel = (typeof DASHBOARD_PANELS)[number];
const DEFAULT_LAYOUT: DashboardLayout = { order: [...DASHBOARD_PANELS], hidden: [], collapsed: [], compact: false };
const PANEL_NAMES: Record<Panel, string> = { radio: 'LAN Radio', polls: 'Room decisions', activities: 'Coming up', history: 'Session history' };

/** Panels whose real features come later. Their buttons explain that instead of pretending. */
const COMING_SOON = {
  radio: 'LAN Radio is coming soon (Milestone 2). This panel shows sample music for now.',
  polls: 'Polls are coming soon (Milestone 3). This poll is a sample.',
  activities: 'Activities are coming soon (Milestone 3). This one is a sample.',
  finder: 'The Shared Game Finder is coming soon (Milestone 5). These games are samples.',
};

export default function Player() {
  const signedIn = useSignedIn('player');
  const { snapshot, connected, offsetMs } = useLive('app');
  const now = useNow(offsetMs);
  const [modal, setModal] = useState<'status' | 'customize' | { player: string } | null>(null);
  const [layout, setLayoutState] = useState<DashboardLayout>(DEFAULT_LAYOUT);
  const toast = useToast();

  useEffect(() => { document.title = 'LAN OS · Player dashboard'; }, []);
  useEffect(() => { if (snapshot?.me?.layout) setLayoutState(snapshot.me.layout); }, [snapshot?.me?.layout]);
  useEffect(() => {
    document.body.className = `app-shell player-page${layout.compact ? ' mini' : ''}`;
  }, [layout.compact]);

  const setLayout = useCallback((next: DashboardLayout) => {
    setLayoutState(next);
    void api('/api/me/layout', 'POST', next).catch(() => toast('Your layout could not be saved.'));
  }, [toast]);

  if (!signedIn || !snapshot?.me) return null;
  const me = snapshot.me;
  const soon = (text: string) => () => toast(text);

  return (
    <>
      <Shell
        snapshot={snapshot} now={now} sectionLabel="YOUR SPACE" breadcrumb="PLAYER DASHBOARD"
        nav={[
          { href: '#overview', icon: 'layout-dashboard', label: 'Overview' },
          { href: '#radio', icon: 'music-2', label: 'LAN Radio', count: demoRadioAt(now).queue.length },
          { href: '#polls', icon: 'chart-no-axes-column', label: 'Polls & activities' },
          { href: '#game-finder', icon: 'gamepad-2', label: 'Games & friends' },
          { href: '#history', icon: 'history', label: 'History' },
        ]}
        extraLabel="MANAGEMENT"
        extraNav={me.isAdmin ? [{ href: '/admin', icon: 'sliders-horizontal', label: 'Admin tools', trailing: true }] : []}
        health={<><StatusDot level={snapshot.health.steam.level} />{snapshot.health.steam.level === 'ok' ? 'Steam connected' : snapshot.health.steam.label}
          <span className="muted">· {snapshot.health.steam.level === 'ok' ? `${snapshot.demo ? 'demo' : 'live'} sync` : 'see admin'}</span></>}
        account={<button type="button" className="account-switch" onClick={() => setModal('status')}>
          <Avatar nickname={me.nickname} tone={me.tone} /><span><b>{me.nickname}</b><small>Your profile &amp; status</small></span><Icon name="chevrons-up-down" />
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
            <button className="button button-primary" onClick={soon(COMING_SOON.radio)}><Icon name="plus" /> Request a song <Icon name="arrow-up-right" className="button-tail" /></button>
            <button className="button button-soft" onClick={soon(COMING_SOON.polls)}><Icon name="chart-no-axes-column" /> Start a poll</button>
            <button className="button button-soft" onClick={soon(COMING_SOON.activities)}><Icon name="calendar-plus" /> Propose activity</button>
            <button className="button button-quiet" onClick={() => setModal('status')}><Icon name="scan-face" /> Your status <Icon name="chevron-down" /></button>
          </div>
          <div className="player-layout">
            <div className="player-primary">
              <Roster snapshot={snapshot} me={me} now={now} onEditStatus={() => setModal('status')} onDetails={id => setModal({ player: id })} />
              <GameFinder />
            </div>
            <div className="player-secondary" id="player-panels">
              {layout.order.filter(p => !layout.hidden.includes(p)).map(panel => (
                <SidePanel key={panel} panel={panel} collapsed={layout.collapsed.includes(panel)} now={now} me={me}
                  playerCount={snapshot.players.length} timezone={snapshot.event.timezone}
                  onToggle={() => setLayout({ ...layout, collapsed: toggle(layout.collapsed, panel) })} />
              ))}
            </div>
          </div>
          <div className="footer-note">Made for the people in this room. LAN-only · No pop-ups outside this tab{snapshot.demo ? ' · Demo data' : ''}</div>
        </main>
      </Shell>
      <button className="button button-primary mini-exit" onClick={() => setLayout({ ...layout, compact: false })}><Icon name="panels-top-left" /> Expand dashboard</button>

      {modal === 'status' && <StatusModal snapshot={snapshot} me={me} onClose={() => setModal(null)} />}
      {modal === 'customize' && <CustomizeModal layout={layout} onChange={setLayout} onClose={() => setModal(null)} />}
      {modal && typeof modal === 'object' && <PlayerDetails player={snapshot.players.find(p => p.id === modal.player)} me={me}
        now={now} timezone={snapshot.event.timezone} onClose={() => setModal(null)} />}
    </>
  );
}

const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter(x => x !== item) : [...list, item]);

function PageHead({ snapshot, me, now }: { snapshot: LiveSnapshot; me: MeInfo; now: Date }) {
  const clock = lanClock(snapshot.event, now);
  const tz = snapshot.event.timezone;
  const date = shortDate(now.toISOString(), tz, { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
  const online = snapshot.players.filter(p => p.status !== 'offline').length;
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

function GameFinder() {
  const toast = useToast();
  return (
    <section className="card game-finder" id="game-finder">
      <div className="section-header">
        <div><div className="section-overline">SHARED GAME FINDER</div><h2>Play something together</h2></div>
        <button type="button" className="tiny-pill coming-soon-pill" onClick={() => toast(COMING_SOON.finder)}>COMING SOON</button>
      </div>
      <p className="muted game-finder-intro">Games several friends own. Suggestions stay here, never on the wall.</p>
      <div id="game-finder-list">
        {DEMO_SHARED_GAMES.map((g, i) => (
          <div className="game-suggestion" key={g.name}>
            <div className={`game-tile ${['dr', 'va', 'rl'][i % 3]}`}>{gameCode(g.name)}</div>
            <div><b>{g.name}</b><span>{g.owners} of 7 players own it</span></div>
            <span className="tiny-pill">SAMPLE</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function SidePanel({ panel, collapsed, now, me, playerCount, timezone, onToggle }: {
  panel: Panel; collapsed: boolean; now: Date; me: MeInfo; playerCount: number; timezone: string; onToggle: () => void;
}) {
  const toast = useToast();
  const soon = (text: string) => () => toast(text);
  const collapse = <button className="icon-btn compact" onClick={onToggle} title="Collapse or expand" aria-label={`Collapse or expand ${PANEL_NAMES[panel]}`}><Icon name="chevron-up" /></button>;
  const cls = `card ${collapsed ? 'collapsed' : ''}`;

  if (panel === 'radio') {
    const radio = demoRadioAt(now);
    return (
      <section className={`${cls} radio-panel`} id="radio" data-panel="radio">
        <div className="section-header">
          <div><div className="section-overline">LAN RADIO</div><h2>Music for the room</h2></div>
          <div className="card-header-actions"><span className="connected-label coming-soon-pill">Sample · coming soon</span>{collapse}</div>
        </div>
        <div id="player-radio"><div className="radio-content">
          <div className="now-playing-block">
            <div className="album-cover" data-label={radio.now.artist} />
            <div><div className="now-title">{radio.now.title}</div><div className="now-artist">{radio.now.artist}</div>
              <div className="requester">▶ Playing · Requested by {radio.now.requester}</div></div>
          </div>
          <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.round((100 * radio.now.position) / radio.now.length)}%` }} /></div>
          <div className="progress-times"><span>{mmss(radio.now.position)}</span><span>{mmss(radio.now.length)}</span></div>
          <div className="queue-head"><strong>Up next</strong><span>{radio.queue.length} in the fair queue</span></div>
          {radio.queue.map((s, i) => (
            <div className="queue-row" key={s.title}>
              <span className="queue-number">{i + 1}</span>
              <div><strong>{s.title}</strong><small>{s.artist} · {s.requester}</small></div>
              {s.requester === me.nickname && <button type="button" className="queue-remove" title="Remove your request" onClick={soon(COMING_SOON.radio)}><Icon name="x" /></button>}
            </div>
          ))}
          <div className="fair-note"><Icon name="users-round" /> One song per requester per round. Everyone gets a turn.</div>
          <div className="radio-actions"><span className="muted text-sm">Requests are added immediately</span>
            <button className="text-button" onClick={soon(COMING_SOON.radio)}>Add track <Icon name="arrow-right" /></button></div>
        </div></div>
      </section>
    );
  }

  if (panel === 'polls') {
    const total = DEMO_POLL.options.reduce((sum, o) => sum + o.count, 0);
    const max = Math.max(...DEMO_POLL.options.map(o => o.count));
    return (
      <section className={`${cls} poll-panel`} id="polls" data-panel="polls">
        <div className="section-header">
          <div><div className="section-overline">POLL · MAIN</div><h2>Room decisions</h2></div>
          <div className="card-header-actions"><span className="tiny-pill accent-pill">SAMPLE</span>{collapse}</div>
        </div>
        <div id="player-poll"><div className="poll-body">
          <h3 className="poll-question">{DEMO_POLL.question}</h3>
          <p className="poll-meta">Started by {DEMO_POLL.startedBy} · {total} of {playerCount} voted · Results live</p>
          {DEMO_POLL.options.map(o => (
            <button key={o.label} className={`vote-option ${o.count === max ? 'leading' : ''}`} onClick={soon(COMING_SOON.polls)}>
              <div className="vote-option-head"><span>{o.label}</span><span className="vote-option-count">{o.count} {o.count === 1 ? 'vote' : 'votes'}</span></div>
              <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.round((100 * o.count) / Math.max(1, total))}%` }} /></div>
            </button>
          ))}
          <div className="poll-bottom"><span>Choose an option to vote.</span><button className="text-button" onClick={soon(COMING_SOON.polls)}>+ New poll</button></div>
        </div></div>
      </section>
    );
  }

  if (panel === 'activities') {
    return (
      <section className={`${cls} activity-panel`} id="activities" data-panel="activities">
        <div className="section-header">
          <div><div className="section-overline">UP NEXT</div><h2>Coming up</h2></div>
          <div className="card-header-actions"><span className="muted text-sm">Sample activity</span>{collapse}</div>
        </div>
        <div id="player-activity"><div className="activity-body">
          <div className="activity-big">
            <div><div className="activity-title">{DEMO_ACTIVITY.title}</div><div className="activity-meta">{DEMO_ACTIVITY.kind} · {DEMO_ACTIVITY.joined} joined · By {DEMO_ACTIVITY.organizer}</div></div>
            <div className="activity-time"><b>{DEMO_ACTIVITY.startsInMinutes}m</b><small>until start</small></div>
          </div>
          <div className="rsvp-line"><span className="rsvp-label">Are you joining?</span>
            <div className="rsvp-buttons">{['Join', 'Maybe', 'Skip'].map(x => <button key={x} className="rsvp-button" onClick={soon(COMING_SOON.activities)}>{x}</button>)}</div>
          </div>
        </div></div>
      </section>
    );
  }

  return (
    <section className={`${cls} player-history`} id="history" data-panel="history">
      <div className="section-header"><div><div className="section-overline">THIS WEEKEND</div><h2>Your last sessions</h2></div>{collapse}</div>
      <div id="recent-sessions">
        {me.sessions.length === 0 && <div className="history-row"><b>No game sessions yet</b><span>They appear here as you play</span></div>}
        {me.sessions.map(s => (
          <div className="history-row" key={s.startedAt}>
            <b>{s.game}</b>
            <span>{formatDuration(s.endedAt ? s.seconds : (now.getTime() - Date.parse(s.startedAt)) / 1000)} · {s.endedAt ? whenLabel(s.endedAt, now, timezone) : 'Playing now'}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function whenLabel(iso: string, now: Date, timezone: string): string {
  const day = (d: Date) => shortDate(d.toISOString(), timezone, { year: 'numeric', month: 'numeric', day: 'numeric' });
  const then = new Date(iso);
  if (day(then) === day(now)) return 'Earlier today';
  if (day(then) === day(new Date(now.getTime() - 86_400_000))) return 'Yesterday';
  return shortDate(iso, timezone, { weekday: 'long' });
}

function StatusModal({ snapshot, me, onClose }: { snapshot: LiveSnapshot; me: MeInfo; onClose: () => void }) {
  const card = snapshot.players.find(p => p.id === me.id);
  const run = useAction();
  const [game, setGame] = useState(me.manualGame ?? '');
  const [pin, setPin] = useState('');
  const status = (body: object, success: string) => run(() => api('/api/me/status', 'POST', body), success);
  return (
    <Modal title="Your status & privacy" label="STEAM PRESENCE" onClose={onClose}>
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
        <form onSubmit={e => { e.preventDefault(); void status({ manualGame: game.trim() || null }, game.trim() ? 'Manual game override saved.' : 'Steam game detection restored.'); }}>
          <div className="modal-field">
            <label htmlFor="manual-game">Manual game override</label>
            <input id="manual-game" value={game} maxLength={60} onChange={e => setGame(e.target.value)} placeholder="Non-Steam game title" />
            <small>Useful if Steam misses a game. Clear this field to use Steam presence.</small>
          </div>
          <button type="submit" className="button button-soft button-small">Save game override</button>
        </form>
        <form onSubmit={e => { e.preventDefault(); void run(() => api('/api/me/pin', 'POST', { pin }), 'PIN saved. Use it with your join link on a new browser.').then(ok => ok && setPin('')); }}>
          <div className="modal-field">
            <label htmlFor="pin">Quick PIN for a new browser {me.hasPin && <span className="muted">· set</span>}</label>
            <input id="pin" inputMode="numeric" pattern="\d{4}" maxLength={4} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} placeholder="4 digits" />
            <small>Optional. With a PIN you can open your join link on another PC without signing in to Steam.</small>
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

function PlayerDetails({ player, me, now, timezone, onClose }:
  { player: PlayerCard | undefined; me: MeInfo; now: Date; timezone: string; onClose: () => void }) {
  if (!player) return null;
  const game = cardGame(player);
  const yours = player.id === me.id;
  const earlier = yours ? me.sessions.find(s => s.endedAt) : undefined;
  return (
    <Modal title={`${player.nickname}'s session`} label="PLAYER DETAILS" onClose={onClose}
      footer={<button className="button button-soft" onClick={onClose}>Close</button>}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 15, marginBottom: 20 }}>
        <Avatar nickname={player.nickname} tone={player.tone} url={player.avatarUrl} className="large-avatar" />
        <div><b style={{ fontSize: 17 }}>{player.nickname}</b>
          <div className="muted text-sm">{STATUS_DISPLAY[player.status].word}{game ? ` · ${game.prefix}${game.name}` : ''}</div></div>
      </div>
      <div className="setting-line">
        <div><b>{player.status === 'offline' ? 'Offline since' : player.sessionStartedAt ? 'Current session' : 'Status for'}</b>
          <small>{player.game?.name ?? STATUS_DISPLAY[player.status].word}</small></div>
        <b>{cardDuration(player, now)}</b>
      </div>
      {earlier && <div className="setting-line">
        <div><b>Previous session</b><small>{earlier.game} · {formatDuration(earlier.seconds)} · {whenLabel(earlier.endedAt!, now, timezone)}</small></div>
        <Icon name="history" />
      </div>}
      <p className="modal-help">LAN OS measures session time from the first Steam presence observation, not from a process on the PC.</p>
    </Modal>
  );
}
