// The admin control room (/admin).
// On the host PC it always opens; elsewhere it needs an admin player or the admin password.
import { useEffect, useState } from 'react';
import {
  clockTime, formatDuration, WALL_PANELS,
  type AdminInfo, type AdminPlayer, type LiveSnapshot, type ServiceHealth,
} from '@lan-os/shared';
import { api, useLive, useNow } from '../live.ts';
import { AlbumArt, livePosition } from '../player/panels.tsx';
import { AdminSignIn, useSignedIn } from '../player/SignIn.tsx';
import { Avatar, Modal, StatusDot, Switch, useAction, useToast } from '../ui/common.tsx';
import { Icon, type IconName } from '../ui/Icon.tsx';
import { AllSystems, Shell, TopAvatar } from '../ui/Shell.tsx';
import { mmss } from '../format.ts';
import '../styles/app.css';
import '../styles/lan-os.css';

const PANEL_LABEL: Record<(typeof WALL_PANELS)[number], string> = { music: 'Music', poll: 'Poll', activity: 'Activity' };

export default function Admin() {
  const auth = useSignedIn('admin');
  const { snapshot, connected, offsetMs } = useLive('admin');
  const now = useNow(offsetMs);
  useEffect(() => {
    document.body.className = 'app-shell admin-page';
    document.title = 'LAN OS · Admin control room';
  }, []);

  if (!auth) return null;
  if (!auth.isAdmin) return <AdminSignIn passwordSet={auth.adminPasswordSet} />;
  if (!snapshot?.admin) return null;
  const admin = snapshot.admin;
  const me = snapshot.me;
  // Demo mode needs no setup, so it never nags.
  const setupDone = snapshot.demo || (admin.setup.adminPassword && admin.setup.spotifyConnected);

  return (
    <Shell
      snapshot={snapshot} now={now} sectionLabel="CONTROL ROOM" breadcrumb="ADMIN CONSOLE"
      nav={[
        { href: '#admin-overview', icon: 'layout-dashboard', label: 'Overview' },
        { href: '#projector', icon: 'projector', label: 'Projector' },
        { href: '#announcements', icon: 'megaphone', label: 'Announcements' },
        { href: '#people', icon: 'users-round', label: 'People & access' },
        { href: '#admin-polls', icon: 'chart-no-axes-column', label: 'Polls & activities' },
        { href: '#systems', icon: 'activity', label: 'Integrations & logs' },
        { href: '#emergency', icon: 'shield-alert', label: 'Safety controls' },
      ]}
      extraLabel="SHORTCUTS"
      extraNav={[
        { href: '/setup', icon: 'sliders-horizontal', label: 'Setup', ...(setupDone ? {} : { count: 1 }) },
        { href: '/wall', icon: 'monitor', label: 'Open projector', trailing: true, target: '_blank' },
        { href: '/recap', icon: 'history', label: 'LAN Wrapped' },
        ...(me ? [{ href: '/app', icon: 'arrow-left' as IconName, label: 'Back to player view' }] : []),
      ]}
      health={<><StatusDot level={snapshot.health.server.level} /> Local server {snapshot.health.server.level === 'ok' ? 'healthy' : 'needs attention'}</>}
      account={<div className="admin-account">
        {me ? <Avatar nickname={me.nickname} tone={me.tone} /> : <span className="avatar tone-6">A</span>}
        <div><strong>{me?.nickname ?? 'Admin'}</strong><small>{me ? 'Admin' : auth.hostPc ? 'Host PC' : 'Signed in with password'}</small></div>
        <button className="icon-btn compact" title="Sign out" aria-label="Sign out"
          onClick={() => void api('/api/auth/sign-out').then(() => location.reload())}><Icon name="log-out" /></button>
      </div>}
      topbar={<>
        <AllSystems snapshot={snapshot} connected={connected} />
        <span className="tag tag-admin">ADMIN ACCESS</span>
        {me && <TopAvatar nickname={me.nickname} tone={me.tone} />}
      </>}
    >
      <main className="main-content admin-main" id="admin-overview">
        <div className="page-head admin-page-head">
          <div>
            <p className="eyebrow"><span className="eyebrow-dot" /> LAN MANAGEMENT · {snapshot.demo ? 'DEMO MODE' : 'LIVE SESSION'}</p>
            <h1>Control room<span className="soft-period">.</span></h1>
            <p className="page-subtitle">Everything running smoothly? You shouldn't need to touch much.</p>
          </div>
          <a className="button button-primary" href="/wall" target="_blank" rel="noreferrer"><Icon name="external-link" /> Open projector</a>
        </div>
        {!setupDone && <a className="fair-note setup-nudge" href="/setup"><Icon name="info" /> Setup isn't finished yet{!admin.setup.spotifyConnected ? ': LAN Radio needs your Spotify account' : ''}. <b>Open setup →</b></a>}
        <Metrics snapshot={snapshot} admin={admin} />
        <div className="admin-grid">
          <div className="admin-left">
            <ProjectorCard snapshot={snapshot} now={now} />
            <PeopleCard admin={admin} snapshot={snapshot} />
            <PollsCard snapshot={snapshot} />
            <ActivitiesCard snapshot={snapshot} now={now} />
            <WrappedCard snapshot={snapshot} />
            <HistoryCard admin={admin} timezone={snapshot.event.timezone} />
          </div>
          <div className="admin-right">
            <MessageCard snapshot={snapshot} />
            <HealthCard snapshot={snapshot} admin={admin} />
            <MusicCard snapshot={snapshot} now={now} />
            <SafetyCard snapshot={snapshot} />
            <DiscordCard admin={admin} />
            <CrashCard admin={admin} />
          </div>
        </div>
        <div className="footer-note">Settings are saved in the config/ folder · Keys in .env · {snapshot.demo ? 'Demo mode: pretend players and music' : 'LAN-only'}</div>
      </main>
    </Shell>
  );
}

function Metrics({ snapshot, admin }: { snapshot: LiveSnapshot; admin: AdminInfo }) {
  const { wall, radio } = snapshot;
  const playing = snapshot.players.filter(p => p.status === 'in_game').length;
  const projector = wall.blanked ? 'Blanked' : wall.paused ? 'Paused' : 'Live';
  const items: Array<[IconName, string, string, string]> = [
    ['users-round', 'PLAYERS IN THE ROOM', String(snapshot.players.length), `${playing} playing right now`],
    ['music-2', 'LAN RADIO', radio.status === 'ok' ? 'Connected' : radio.status === 'off' ? 'Off' : 'Offline',
      radio.status === 'ok' ? `${radio.queue.length} queued · ${radio.now?.isPlaying ? 'Playing' : 'Paused'}` : 'See setup'],
    ['monitor', 'PROJECTOR', projector, `Brightness ${wall.brightness}% · ${wall.nightMode ? 'Night' : 'Day'} theme`],
    ['check', 'LOCAL SERVER', snapshot.health.server.level === 'ok' ? 'Healthy' : 'Check config',
      `Uptime ${formatDuration(admin.uptimeSeconds)}${admin.lastBackup ? ` · Backup ${clockTime(new Date(admin.lastBackup), snapshot.event.timezone)}` : ''}`],
  ];
  return (
    <div className="metrics">
      {items.map(([icon, label, value, sub]) => (
        <div className="metric" key={label}><div className="metric-label"><Icon name={icon} /> {label}</div><div className="metric-value">{value}</div><div className="metric-sub">{sub}</div></div>
      ))}
    </div>
  );
}

function ProjectorCard({ snapshot, now }: { snapshot: LiveSnapshot; now: Date }) {
  const run = useAction();
  const { wall } = snapshot;
  const [brightness, setBrightness] = useState(wall.brightness);
  useEffect(() => setBrightness(wall.brightness), [wall.brightness]);
  const set = (body: object, success?: string) => run(() => api('/api/admin/wall', 'POST', body), success);
  const preview = snapshot.players.filter(p => p.status !== 'offline').slice(0, 3);
  const song = snapshot.radio.now;

  return (
    <section className="card projector-card" id="projector">
      <div className="section-header">
        <div><div className="section-overline">PROJECTOR</div><h2>Wall display</h2></div>
        <span className="connected-label"><span className={`status-dot ${wall.paused || wall.blanked ? 'amber' : 'green'}`} /> {wall.blanked ? 'Blanked' : wall.paused ? 'Paused' : 'Broadcasting'}</span>
      </div>
      <div className="mini-projector" aria-label="Projector preview" style={{ filter: wall.nightMode ? 'brightness(.77) saturate(.85)' : undefined }}>
        <div className="projector-bezel"><div className="mini-screen">
          <div className="mini-left">
            <div className="mini-logo">LAN OS <small>ROOM LIVE</small></div>
            {preview.map((p, i) => (
              <div className="mini-card" key={p.id}>
                <span className={`mini-avatar ${['', 'other', 'third'][i]}`} />
                <span><strong>{p.nickname}</strong><small>{p.game?.name ?? p.status.replace('_', ' ')}</small></span>
                <b>{p.sessionStartedAt ? formatDuration((now.getTime() - Date.parse(p.sessionStartedAt)) / 1000) : ''}</b>
              </div>
            ))}
          </div>
          <div className="mini-right">
            <div className="mini-music"><div className="mini-disc" /><div><small>NOW PLAYING</small><strong>{song?.title ?? 'Nothing'}</strong><span>{song?.artist ?? ''}</span></div></div>
            <div className="mini-bars"><i /><i /><i /></div>
            <div className="mini-clock">{clockTime(now, snapshot.event.timezone)}</div>
          </div>
        </div></div>
      </div>
      <div className="projector-controls">
        <div className="projector-control">
          <span className="control-name"><Icon name="moon-star" /> Night mode <small>Dimmer, warmer wall and drinking-game lines</small></span>
          <Switch label="Night mode" checked={wall.nightMode} onChange={next => void set({ nightMode: next }, `${next ? 'Night' : 'Day'} palette on the wall.`)} />
        </div>
        <div className="projector-control brightness-control">
          <span className="control-name"><Icon name="sun-dim" /> Brightness <small>Projector output</small></span>
          <div className="brightness-input">
            <input aria-label="Wall brightness" type="range" min={20} max={100} step={5} value={brightness}
              onChange={e => setBrightness(Number(e.target.value))}
              onPointerUp={() => void set({ brightness })} onKeyUp={() => void set({ brightness })} />
            <output>{brightness}%</output>
          </div>
        </div>
        <div className="projector-control panel-control">
          <span className="control-name"><Icon name="panels-top-left" /> Visible panels <small>Fixed layout, no cycling</small></span>
          <div className="panel-chips">
            {WALL_PANELS.map(panel => {
              const on = wall.panels.includes(panel);
              return (
                <button type="button" key={panel} className={`panel-chip ${on ? '' : 'off'}`} aria-pressed={on}
                  onClick={() => void set({ panels: on ? wall.panels.filter(p => p !== panel) : [...wall.panels, panel] },
                    `${PANEL_LABEL[panel]} panel ${on ? 'hidden' : 'visible'} on the wall.`)}>
                  {PANEL_LABEL[panel]} <Icon name="check" />
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="card-footer">
        <span><Icon name="info" /> Changes reach the wall within a second.</span>
        <span style={{ display: 'flex', gap: 16 }}>
          <button className="text-button" onClick={() => void set({ blanked: !wall.blanked }, wall.blanked ? 'Wall is showing again.' : 'Wall blanked.')}>
            <Icon name="eye-off" /><span>{wall.blanked ? 'Unblank wall' : 'Blank wall'}</span></button>
          <button className="text-button" onClick={() => void set({ paused: !wall.paused }, wall.paused ? 'Wall feed resumed.' : 'Wall feed paused.')}>
            <Icon name={wall.paused ? 'play' : 'pause'} /><span>{wall.paused ? 'Resume wall feed' : 'Pause wall feed'}</span></button>
        </span>
      </div>
    </section>
  );
}

function copy(text: string, toast: (m: string) => void, what: string) {
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => toast(`Copied ${what}.`), () => toast(text));
  else toast(text);
}

function PeopleCard({ admin, snapshot }: { admin: AdminInfo; snapshot: LiveSnapshot }) {
  const run = useAction();
  const toast = useToast();
  const [editing, setEditing] = useState<AdminPlayer | 'new' | null>(null);
  return (
    <section className="card people-card" id="people">
      <div className="section-header">
        <div><div className="section-overline">PEOPLE &amp; ACCESS</div><h2>{admin.players.length} players</h2></div>
        <button className="button button-small button-soft" onClick={() => setEditing('new')}><Icon name="plus" /> Add player</button>
      </div>
      <div className="fair-note people-signin">
        <Icon name="link" /> Everyone signs in at <b>{admin.setup.signInUrl}</b> with Steam.
        <button className="text-button" onClick={() => copy(admin.setup.signInUrl, toast, 'the sign-in address')}>Copy</button>
      </div>
      <table className="people-table">
        <thead><tr><th>Player</th><th>Steam</th><th>Access</th><th /></tr></thead>
        <tbody>
          {admin.players.map(p => {
            const card = snapshot.players.find(c => c.id === p.id);
            return (
              <tr key={p.id}>
                <td><div className="people-name"><Avatar nickname={p.nickname} tone={p.tone} url={card?.avatarUrl} />
                  <span><strong>{p.nickname}</strong><small className="people-role">{p.hiddenFromWall ? 'Hidden from wall' : card ? card.status.replace('_', ' ') : ''}</small></span></div></td>
                <td><span className={`people-status ${p.steamId || snapshot.demo ? '' : 'offline'}`}>{p.steamId ? 'Linked' : snapshot.demo ? 'Demo' : 'Not signed in yet'}</span></td>
                <td>{p.role === 'admin' ? 'Admin' : 'Player'}</td>
                <td><div className="people-actions">
                  <button className="people-action" title="A personal link that signs this player in"
                    onClick={() => p.joinLink ? copy(p.joinLink, toast, `${p.nickname}'s join link`)
                      : void run(() => api(`/api/admin/players/${p.id}/join-link`), `Join link made for ${p.nickname}. Click again to copy.`)}>
                    {p.joinLink ? 'Copy link ↗' : 'Make link'}</button>
                  <button className="people-action" onClick={() => setEditing(p)}>Edit</button>
                </div></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {editing && <PlayerModal player={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function PlayerModal({ player, onClose }: { player: AdminPlayer | null; onClose: () => void }) {
  const run = useAction();
  const [nickname, setNickname] = useState(player?.nickname ?? '');
  const [steamId, setSteamId] = useState(player?.steamId ?? '');
  const [role, setRole] = useState<'player' | 'admin'>(player?.role ?? 'player');
  const [hidden, setHidden] = useState(player?.hiddenFromWall ?? false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const fields = { nickname: nickname.trim(), steamId: steamId.trim(), role, hiddenFromWall: hidden };
  const newId = nickname.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);

  const save = () => void run(
    () => (player ? api(`/api/admin/players/${player.id}`, 'PATCH', fields) : api('/api/admin/players', 'POST', { id: newId || 'player', ...fields })),
    player ? `${fields.nickname} saved.` : `${fields.nickname} added. They can now sign in with Steam and pick their name.`,
  ).then(ok => ok && onClose());

  return (
    <Modal title={player ? `Edit ${player.nickname}` : 'Add a player'} label="PEOPLE & ACCESS" onClose={onClose}
      footer={<>
        {player && (confirmRemove
          ? <button className="button button-warning" onClick={() => void run(() => api(`/api/admin/players/${player.id}`, 'DELETE'), `${player.nickname} removed.`).then(ok => ok && onClose())}>Yes, remove {player.nickname}</button>
          : <button className="button button-quiet" onClick={() => setConfirmRemove(true)}><Icon name="trash" /> Remove</button>)}
        <button className="button button-primary" onClick={save} disabled={!fields.nickname}>Save</button>
      </>}>
      <p className="modal-help" style={{ marginTop: 0 }}>Saved in config/players.yaml. History is kept even when a player is removed.</p>
      <div className="modal-field"><label htmlFor="player-name">Nickname</label>
        <input id="player-name" value={nickname} maxLength={20} autoFocus onChange={e => setNickname(e.target.value)} /></div>
      <div className="modal-field"><label htmlFor="player-steam">Steam ID (optional)</label>
        <input id="player-steam" value={steamId} inputMode="numeric" maxLength={17} onChange={e => setSteamId(e.target.value.replace(/\D/g, ''))} placeholder="Filled in when they sign in with Steam" />
        <small>17 digits. Leave it empty: it fills in when they sign in with Steam and pick this name.</small></div>
      <div className="modal-field"><label htmlFor="player-role">Access</label>
        <select id="player-role" value={role} onChange={e => setRole(e.target.value as 'player' | 'admin')}>
          <option value="player">Player</option><option value="admin">Admin</option>
        </select></div>
      <div className="setting-line">
        <div><b>Hidden from wall</b><small>The projector shows a private placeholder.</small></div>
        <Switch label="Hidden from wall" checked={hidden} onChange={setHidden} />
      </div>
      {player && <div className="setting-line">
        <div><b>New join link</b><small>Makes a fresh personal link. The old one stops working.</small></div>
        <button className="button button-soft button-small" onClick={() => void run(() => api(`/api/admin/players/${player.id}/join-link`), 'New join link made. Copy it from the list.')}>Make new link</button>
      </div>}
    </Modal>
  );
}

function PollsCard({ snapshot }: { snapshot: LiveSnapshot }) {
  const run = useAction();
  return (
    <section className="card admin-polls-card" id="admin-polls">
      <div className="section-header"><div><div className="section-overline">POLL MODERATION</div><h2>Room decisions</h2></div>
        <span className="tiny-pill accent-pill">{snapshot.polls.filter(p => !p.closedAt).length} OPEN</span></div>
      {snapshot.polls.length === 0 && <div className="admin-poll-detail"><div><strong>No polls right now</strong><small>Players start polls from their dashboard.</small></div></div>}
      {snapshot.polls.map(p => (
        <div className="admin-poll-detail" key={p.id}>
          <div><strong>{p.question}</strong>
            <small>{p.voted} of {p.eligible} voted · {p.options.map((o, i) => `${o} ${p.counts[i]}`).join(' · ')} · by {p.createdBy}{p.closedAt ? ' · closed' : ''}</small>
            {p.tie && <span className="tie-choices">Tie. Pick the winner: {p.options.map((o, i) => p.counts[i] === Math.max(...p.counts) &&
              <button key={o} className="text-button" onClick={() => void run(() => api(`/api/admin/polls/${p.id}/close`, 'POST', { winner: i }), `${o} wins.`)}>{o}</button>)}</span>}
          </div>
          <span style={{ display: 'flex', gap: 8 }}>
            {!p.closedAt && <button className="button button-soft button-small" onClick={() => void run(() => api(`/api/admin/polls/${p.id}/close`, 'POST', {}), 'Poll closed.')}>Close</button>}
            <button className="button button-quiet button-small" onClick={() => void run(() => api(`/api/admin/polls/${p.id}`, 'DELETE'), 'Poll removed.')}>Remove</button>
          </span>
        </div>
      ))}
    </section>
  );
}

function ActivitiesCard({ snapshot, now }: { snapshot: LiveSnapshot; now: Date }) {
  const run = useAction();
  const act = (id: number, action: 'start' | 'end' | 'cancel') => void run(() => api(`/api/admin/activities/${id}`, 'POST', { action }));
  const list = snapshot.activities.filter(a => a.status === 'upcoming' || a.status === 'live');
  return (
    <section className="card admin-polls-card">
      <div className="section-header"><div><div className="section-overline">ACTIVITIES</div><h2>Coming up</h2></div></div>
      {list.length === 0 && <div className="admin-poll-detail"><div><strong>Nothing planned</strong><small>Players propose activities from their dashboard.</small></div></div>}
      {list.map(a => (
        <div className="admin-poll-detail" key={a.id}>
          <div><strong>{a.title}</strong><small>{a.joined}/{a.maxPlayers} joined · by {a.organizer} · {a.status === 'live' ? 'happening now'
            : `starts in ${Math.max(0, Math.ceil((Date.parse(a.startsAt) - now.getTime()) / 60_000))} min`}</small></div>
          <span style={{ display: 'flex', gap: 8 }}>
            {a.status === 'upcoming' ? <button className="button button-soft button-small" onClick={() => act(a.id, 'start')}>Start</button>
              : <button className="button button-soft button-small" onClick={() => act(a.id, 'end')}>End</button>}
            <button className="button button-quiet button-small" onClick={() => act(a.id, 'cancel')}>Cancel</button>
          </span>
        </div>
      ))}
    </section>
  );
}

function WrappedCard({ snapshot }: { snapshot: LiveSnapshot }) {
  const run = useAction();
  return (
    <section className="card admin-polls-card">
      <div className="section-header"><div><div className="section-overline">HISTORY</div><h2>LAN Wrapped</h2></div>
        <span className="tiny-pill accent-pill">{snapshot.recapPublished ? 'PUBLISHED' : 'SO FAR'}</span></div>
      <div className="admin-poll-detail">
        <div><strong>{snapshot.recapPublished ? 'The final recap is out' : 'Publish the final recap on the last day'}</strong>
          <small>Everyone can always see the weekend so far. Publishing marks it final and announces it on the wall.</small></div>
        <span style={{ display: 'flex', gap: 8 }}>
          <a className="button button-quiet button-small" href="/recap" target="_blank" rel="noreferrer">Open</a>
          <button className="button button-soft button-small" onClick={() => void run(() => api('/api/admin/recap', 'POST', { published: !snapshot.recapPublished }),
            snapshot.recapPublished ? 'Recap unpublished.' : 'LAN Wrapped published.')}>{snapshot.recapPublished ? 'Unpublish' : 'Publish'}</button>
        </span>
      </div>
    </section>
  );
}

function HistoryCard({ admin, timezone }: { admin: AdminInfo; timezone: string }) {
  const run = useAction();
  const [open, setOpen] = useState(false);
  return (
    <section className="card admin-polls-card">
      <div className="section-header"><div><div className="section-overline">HISTORY CORRECTIONS</div><h2>Recent events</h2></div>
        <button className="text-button" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'}</button></div>
      {!open ? <div className="admin-poll-detail"><div><small>History can only be corrected by removing an event that is wrong, for example a session from a misdetected game.</small></div></div>
        : admin.recentEvents.map(e => (
          <div className="admin-poll-detail" key={e.id}>
            <div><strong>{e.summary}</strong><small>{e.player ?? 'Room'} · {clockTime(new Date(e.at), timezone)} · {e.type.replaceAll('_', ' ')}</small></div>
            <button className="button button-quiet button-small" onClick={() => void run(() => api(`/api/admin/events/${e.id}`, 'DELETE'), 'Event removed from history.')}>Remove</button>
          </div>
        ))}
    </section>
  );
}

function MessageCard({ snapshot }: { snapshot: LiveSnapshot }) {
  const run = useAction();
  const [text, setText] = useState('');
  return (
    <section className="card broadcast-card" id="announcements">
      <div className="section-header"><div><div className="section-overline">ANNOUNCEMENTS</div><h2>Message the room</h2></div><span className="tiny-pill">NO SOUND</span></div>
      <p className="muted text-sm">For the projector only. Short, plain-text messages work best.</p>
      <label className="sr-only" htmlFor="announcement-text">Projector message</label>
      <textarea id="announcement-text" maxLength={160} rows={3} value={text} onChange={e => setText(e.target.value)} placeholder="Pizza arrives in 15 minutes. Come grab a slice." />
      <div className="broadcast-actions">
        <span className="hint">{text.length} / 160</span>
        <button className="button button-primary button-small" disabled={!text.trim()}
          onClick={() => void run(() => api('/api/admin/message', 'POST', { text }), 'Message sent to the wall.').then(ok => ok && setText(''))}>
          <Icon name="send" /> Send to wall</button>
      </div>
      {snapshot.wall.message && <p className="muted text-sm">On the wall now: “{snapshot.wall.message}”</p>}
      {snapshot.wall.announcement && <p className="muted text-sm">Automatic announcement showing: “{snapshot.wall.announcement.text}”</p>}
      <button className="text-button subtle danger-text" disabled={!snapshot.wall.message}
        onClick={() => void run(() => api('/api/admin/message', 'POST', { text: null }), 'Projector message cleared.')}>
        <Icon name="x" /> Clear current announcement</button>
    </section>
  );
}

function HealthCard({ snapshot, admin }: { snapshot: LiveSnapshot; admin: AdminInfo }) {
  const run = useAction();
  const services: Array<[IconName, string, ServiceHealth]> = [
    ['gamepad-2', 'Steam', snapshot.health.steam],
    ['music-2', 'Spotify', snapshot.health.spotify],
    ['server', 'Local server', { ...snapshot.health.server, detail: `${snapshot.health.server.detail} · Uptime ${formatDuration(admin.uptimeSeconds)}` }],
  ];
  const allOk = services.every(([, , s]) => s.level !== 'warning');
  return (
    <section className="card systems-card" id="systems">
      <div className="section-header">
        <div><div className="section-overline">HEALTH MONITOR</div><h2>{allOk ? 'Everything connected' : 'Something needs a look'}</h2></div>
        <a className="icon-btn compact" title="Setup" href="/setup"><Icon name="sliders-horizontal" /></a>
      </div>
      <div className="service-list">
        {services.map(([icon, name, s]) => (
          <div className="service" key={name}>
            <span className="service-icon"><Icon name={icon} /></span>
            <div><strong>{name}</strong><small>{s.detail}</small></div>
            <span className="service-status"><StatusDot level={s.level} />{s.level === 'ok' ? 'Healthy' : s.level === 'warning' ? 'Warning' : 'Off'}</span>
          </div>
        ))}
      </div>
      <div className="system-footer"><Icon name="database-backup" /> Last backup: {admin.lastBackup ? new Date(admin.lastBackup).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : snapshot.demo ? 'none in demo mode' : 'not yet'} <span>·</span>
        <button className="text-button" onClick={() => void run(() => api('/api/admin/backup'), 'Backup saved in data/backups.')}>Run backup</button></div>
    </section>
  );
}

function MusicCard({ snapshot, now }: { snapshot: LiveSnapshot; now: Date }) {
  const run = useAction();
  const radio = snapshot.radio;
  const [volume, setVolume] = useState(radio.volume ?? 50);
  useEffect(() => { if (radio.volume !== null) setVolume(radio.volume); }, [radio.volume]);
  const control = (body: object, success?: string) => run(() => api('/api/admin/radio', 'POST', body), success);
  const position = livePosition(radio.now, now);
  return (
    <section className="card moderation-card">
      <div className="section-header"><div><div className="section-overline">LAN RADIO</div><h2>Music controls</h2></div><span className="tiny-pill">{radio.queue.length} QUEUED</span></div>
      {radio.status !== 'ok' && <p className="config-problem">⚠ {radio.message} <a className="text-button" href="/setup">Setup</a></p>}
      <div className="moderation-now">
        <AlbumArt className="album-mini" url={radio.now?.albumArt ?? null} label={radio.now?.artist ?? ''} />
        <div><strong>{radio.now?.title ?? 'Nothing playing'}</strong>
          <small>{radio.now ? `${radio.now.artist} · ${radio.now.requester ? `Requested by ${radio.now.requester}` : 'Room playlist'} · ${mmss(position / 1000)} / ${mmss(radio.now.durationMs / 1000)}` : ''}</small></div>
        <span className={`status-dot ${radio.now?.isPlaying ? 'green' : 'amber'}`} />
      </div>
      <div className="moderation-actions">
        <button type="button" className="button button-soft button-small" disabled={radio.status !== 'ok'}
          onClick={() => void control({ action: radio.now?.isPlaying ? 'pause' : 'resume' })}><Icon name={radio.now?.isPlaying ? 'pause' : 'play'} /><span>{radio.now?.isPlaying ? 'Pause' : 'Play'}</span></button>
        <button type="button" className="button button-soft button-small" disabled={radio.status !== 'ok'} onClick={() => void control({ action: 'skip' }, 'Skipped.')}><Icon name="skip-forward" /> Skip</button>
        <button type="button" className="button button-quiet button-small"
          onClick={() => void run(() => api('/api/admin/safety', 'POST', { radioRequestsClosed: !snapshot.safety.radioRequestsClosed }),
            snapshot.safety.radioRequestsClosed ? 'Requests reopened.' : 'Song requests paused.')}>
          {snapshot.safety.radioRequestsClosed ? 'Requests off' : 'Requests on'}</button>
      </div>
      {radio.volume !== null && <div className="projector-control brightness-control" style={{ marginTop: 8 }}>
        <span className="control-name"><Icon name="music-2" /> Volume</span>
        <div className="brightness-input"><input aria-label="Volume" type="range" min={0} max={100} step={5} value={volume}
          onChange={e => setVolume(Number(e.target.value))} onPointerUp={() => void control({ action: 'volume', volume })} /><output>{volume}%</output></div>
      </div>}
      {radio.queue.map(s => (
        <div className="queue-row" key={s.id}>
          <span className="queue-number">{s.state === 'sent' ? '▶' : '·'}</span>
          <div><strong>{s.title}</strong><small>{s.artist} · {s.requester}</small></div>
          {s.state === 'waiting' && <button type="button" className="queue-remove" title="Remove this request"
            onClick={() => void run(() => api(`/api/admin/radio/${s.id}`, 'DELETE'), `${s.title} removed.`)}><Icon name="x" /></button>}
        </div>
      ))}
      <div className="system-footer"><Icon name="users-round" /> Who may pause, skip and change the volume is set in config/music.yaml.</div>
    </section>
  );
}

function SafetyCard({ snapshot }: { snapshot: LiveSnapshot }) {
  const run = useAction();
  const [confirm, setConfirm] = useState<'submissions' | 'public' | null>(null);
  const safety = snapshot.safety;
  const apply = (kind: 'submissions' | 'public') => void run(() => api('/api/admin/safety', 'POST',
    kind === 'submissions' ? { submissionsDisabled: !safety.submissionsDisabled } : { hidePublic: !safety.hidePublic }), 'Safety setting updated.')
    .then(() => setConfirm(null));
  return (
    <section className="card safety-card" id="emergency">
      <div className="section-header"><div><div className="section-overline">ONLY IF NEEDED</div><h2>Safety controls</h2></div><Icon name="shield-alert" className="safety-icon" /></div>
      <div className="safety-actions">
        <button className="button button-warning" onClick={() => setConfirm('submissions')}><Icon name="ban" /><span>{safety.submissionsDisabled ? 'Enable submissions' : 'Disable new submissions'}</span></button>
        <button className="button button-quiet" onClick={() => setConfirm('public')}><Icon name="eye-off" /><span>{safety.hidePublic ? 'Show public content' : 'Hide public content'}</span></button>
      </div>
      <p className="muted tiny-copy">These actions are reversible. No history is deleted.</p>
      {confirm && <Modal title={confirm === 'submissions' ? (safety.submissionsDisabled ? 'Enable submissions?' : 'Disable submissions?') : (safety.hidePublic ? 'Show public content?' : 'Hide public content?')}
        label="SAFETY CONTROLS" onClose={() => setConfirm(null)}
        footer={<><button className="button button-quiet" onClick={() => setConfirm(null)}>Cancel</button><button className="button button-primary" onClick={() => apply(confirm)}>Apply</button></>}>
        <p className="mini-confirm">{confirm === 'submissions'
          ? 'This pauses new polls, votes, activity proposals and song requests. Existing history is kept.'
          : 'Player names and games on the projector are replaced with private placeholders. Nothing is deleted.'}</p>
      </Modal>}
    </section>
  );
}

function DiscordCard({ admin }: { admin: AdminInfo }) {
  const run = useAction();
  const [channel, setChannel] = useState('');
  const d = admin.discord;
  const selected = d.messages.filter(m => m.selected).map(m => m.id);
  const toggle = (id: string) => void run(() => api('/api/admin/discord', 'POST', { selected: selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id] }));
  return (
    <section className="card admin-log-card">
      <div className="section-header"><div><div className="section-overline">DISCORD</div><h2>Highlights on the wall</h2></div>
        <span className="tiny-pill">{d.enabled && d.connected ? `${selected.length} PICKED` : 'OPTIONAL'}</span></div>
      <div className="card-body">
      {!admin.setup.discordToken ? <p className="muted text-sm">Add a Discord bot token on the <a className="text-button" href="/setup#extras">setup page</a> to show picked messages on the wall. The bot only reads; it never posts.</p>
        : !d.channelSet ? <form onSubmit={e => { e.preventDefault(); void run(() => api('/api/admin/discord', 'POST', { channelId: channel }), 'Channel saved.'); }}>
          <div className="modal-field"><label htmlFor="discord-channel">Channel ID</label>
            <input id="discord-channel" value={channel} onChange={e => setChannel(e.target.value.replace(/\D/g, ''))} placeholder="Right-click the channel → Copy Channel ID" /></div>
          <button className="button button-soft button-small" disabled={!channel}>Save channel</button>
        </form>
          : <>
            <p className="muted text-sm">Pick messages to rotate in the poll panel while no poll is running.</p>
            {d.messages.length === 0 && <p className="config-problem">No messages yet, or the bot can't read the channel. Check that it has "Read Message History" and "Message Content Intent" is on.</p>}
            {d.messages.slice(0, 12).map(m => (
              <div className="setting-line" key={m.id}>
                <div><b>{m.author}</b><small>{m.text}</small></div>
                <Switch label={`Show on wall: ${m.text}`} checked={m.selected} onChange={() => toggle(m.id)} />
              </div>
            ))}
          </>}
      </div>
    </section>
  );
}

function CrashCard({ admin }: { admin: AdminInfo }) {
  const run = useAction();
  return (
    <section className="card admin-log-card">
      <div className="section-header">
        <div><div className="section-overline">OPERATIONS</div><h2>Crash log &amp; integrations</h2></div>
        <span className="tiny-pill">{admin.crashes.length} CRASH{admin.crashes.length === 1 ? '' : 'ES'}</span>
      </div>
      <div className="admin-ops">
        <div>
          <strong>{admin.crashes.length ? 'Recent crashes' : 'No crashes recorded'}</strong>
          <small>Local server up {formatDuration(admin.uptimeSeconds)} · Start LAN OS.bat restarts it after a crash</small>
        </div>
        <button className="button button-quiet button-small" onClick={() => void run(() => api('/api/admin/steam', 'POST', { paused: !admin.steamPaused }),
          admin.steamPaused ? 'Steam polling resumed.' : 'Steam polling paused; last known state kept.')}>
          {admin.steamPaused ? 'Resume Steam polling' : 'Pause Steam polling'}</button>
      </div>
      {admin.crashes.map(c => (
        <div className="crash-row" key={c.file}><strong>{c.summary || 'Unknown error'}</strong><small>{new Date(c.at).toLocaleString('en-GB')} · data/logs/crashes/{c.file}</small></div>
      ))}
      {admin.configProblems.map(line => <p className="config-problem" key={line}>⚠ {line}</p>)}
      <p className="admin-ops-note">Pausing Steam freezes the last known presence and marks it as stale. Other local features keep working.</p>
    </section>
  );
}
