// The admin control room (/admin). Markup follows design/prototype/design/templates/admin.html.
// Real in Milestone 1: roster and join links, projector controls, the projector message,
// health and the crash log. Later controls are shown but disabled with a "later" hint.
import { useEffect, useState, type ReactNode } from 'react';
import {
  clockTime, DEMO_POLL, formatDuration, WALL_PANELS,
  type AdminInfo, type AdminPlayer, type LiveSnapshot, type ServiceHealth,
} from '@lan-os/shared';
import { api, useLive, useNow } from '../live.ts';
import { demoRadioAt } from '../roster.ts';
import { AdminSignIn, useSignedIn } from '../player/SignIn.tsx';
import { Avatar, Modal, StatusDot, Switch, useAction, useToast } from '../ui/common.tsx';
import { Icon, type IconName } from '../ui/Icon.tsx';
import { AllSystems, Shell, TopAvatar } from '../ui/Shell.tsx';
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

  return (
    <Shell
      snapshot={snapshot} now={now} sectionLabel="CONTROL ROOM" breadcrumb="ADMIN CONSOLE"
      nav={[
        { href: '#admin-overview', icon: 'layout-dashboard', label: 'Overview' },
        { href: '#projector', icon: 'projector', label: 'Projector' },
        { href: '#announcements', icon: 'megaphone', label: 'Announcements' },
        { href: '#people', icon: 'users-round', label: 'People & access' },
        { href: '#admin-polls', icon: 'chart-no-axes-column', label: 'Poll moderation' },
        { href: '#systems', icon: 'activity', label: 'Integrations & logs' },
        { href: '#emergency', icon: 'shield-alert', label: 'Safety controls' },
      ]}
      extraLabel="SHORTCUTS"
      extraNav={[
        { href: '/wall', icon: 'monitor', label: 'Open projector', trailing: true, target: '_blank' },
        ...(me ? [{ href: '/app', icon: 'arrow-left' as IconName, label: 'Back to player view' }] : []),
      ]}
      health={<><StatusDot level={snapshot.health.server.level} /> Local server {snapshot.health.server.level === 'ok' ? 'healthy' : 'needs attention'}</>}
      account={<div className="admin-account">
        {me ? <Avatar nickname={me.nickname} tone={me.tone} /> : <span className="avatar tone-6">A</span>}
        <div><strong>{me?.nickname ?? 'Admin'}</strong><small>{me ? 'Admin' : 'Signed in with password'}</small></div>
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
        <Metrics snapshot={snapshot} admin={admin} />
        <div className="admin-grid">
          <div className="admin-left">
            <ProjectorCard snapshot={snapshot} now={now} />
            <PeopleCard admin={admin} snapshot={snapshot} />
            <section className="card admin-polls-card" id="admin-polls">
              <div className="section-header"><div><div className="section-overline">POLL MODERATION</div><h2>Room decisions</h2></div><span className="tiny-pill accent-pill">SAMPLE</span></div>
              <div className="admin-poll-detail">
                <div><strong>{DEMO_POLL.question}</strong><small>{DEMO_POLL.options.map(o => `${o.label} ${o.count}`).join(' · ')}</small></div>
                <Later><button className="button button-soft button-small" disabled>Close poll</button></Later>
              </div>
            </section>
          </div>
          <div className="admin-right">
            <MessageCard snapshot={snapshot} />
            <HealthCard snapshot={snapshot} admin={admin} />
            <MusicCard now={now} />
            <section className="card safety-card" id="emergency">
              <div className="section-header"><div><div className="section-overline">ONLY IF NEEDED</div><h2>Safety controls</h2></div><Icon name="shield-alert" className="safety-icon" /></div>
              <div className="safety-actions">
                <button className="button button-warning" disabled><Icon name="ban" /><span>Disable new submissions</span><span className="later-hint">later</span></button>
                <button className="button button-quiet" disabled><Icon name="eye-off" /><span>Hide public content</span><span className="later-hint">later</span></button>
              </div>
              <p className="muted tiny-copy">These arrive with polls and music (Milestones 2 and 3). Players can already hide themselves from the wall.</p>
            </section>
            <CrashCard admin={admin} />
          </div>
        </div>
        <div className="footer-note">Settings are saved in the config/ folder · {snapshot.demo ? 'Demo mode: pretend players, no real Steam' : 'LAN-only'}</div>
      </main>
    </Shell>
  );
}

/** Wraps a control that arrives in a later milestone. */
function Later({ children }: { children: ReactNode }) {
  return <span title="Arrives in a later milestone" style={{ display: 'inline-flex', alignItems: 'center' }}>{children}<span className="later-hint">later</span></span>;
}

function Metrics({ snapshot, admin }: { snapshot: LiveSnapshot; admin: AdminInfo }) {
  const { wall } = snapshot;
  const playing = snapshot.players.filter(p => p.status === 'in_game').length;
  const projector = wall.blanked ? 'Blanked' : wall.paused ? 'Paused' : 'Live';
  const items: Array<[IconName, string, string, string]> = [
    ['users-round', 'PLAYERS IN THE ROOM', String(snapshot.players.length), `${playing} playing right now`],
    ['music-2', 'LAN RADIO', 'Coming soon', 'Milestone 2'],
    ['monitor', 'PROJECTOR', projector, `Brightness ${wall.brightness}% · ${wall.nightMode ? 'Night' : 'Day'} theme`],
    ['check', 'LOCAL SERVER', snapshot.health.server.level === 'ok' ? 'Healthy' : 'Check config', `Uptime ${formatDuration(admin.uptimeSeconds)}`],
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
  const radio = demoRadioAt(now);
  const preview = snapshot.players.filter(p => p.status !== 'offline').slice(0, 3);

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
            <div className="mini-music"><div className="mini-disc" /><div><small>NOW PLAYING</small><strong>{radio.now.title}</strong><span>{radio.now.artist}</span></div></div>
            <div className="mini-bars"><i /><i /><i /></div>
            <div className="mini-clock">{clockTime(now, snapshot.event.timezone)}</div>
          </div>
        </div></div>
      </div>
      <div className="projector-controls">
        <div className="projector-control">
          <span className="control-name"><Icon name="moon-star" /> Night mode <small>Dimmer, warmer wall palette</small></span>
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

function PeopleCard({ admin, snapshot }: { admin: AdminInfo; snapshot: LiveSnapshot }) {
  const run = useAction();
  const toast = useToast();
  const [editing, setEditing] = useState<AdminPlayer | 'new' | null>(null);
  const copy = (player: AdminPlayer) => {
    if (!player.joinLink) return void run(() => api(`/api/admin/players/${player.id}/join-link`), `Join link made for ${player.nickname}.`);
    const link = player.joinLink;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(link).then(() => toast(`Copied ${player.nickname}'s join link.`), () => toast(link));
    } else toast(link);
  };
  return (
    <section className="card people-card" id="people">
      <div className="section-header">
        <div><div className="section-overline">PEOPLE &amp; ACCESS</div><h2>{admin.players.length} invited players</h2></div>
        <button className="button button-small button-soft" onClick={() => setEditing('new')}><Icon name="link" /> New join link</button>
      </div>
      <table className="people-table">
        <thead><tr><th>Player</th><th>Steam</th><th>Access</th><th /></tr></thead>
        <tbody>
          {admin.players.map(p => {
            const card = snapshot.players.find(c => c.id === p.id);
            return (
              <tr key={p.id}>
                <td><div className="people-name"><Avatar nickname={p.nickname} tone={p.tone} url={card?.avatarUrl} />
                  <span><strong>{p.nickname}</strong><small className="people-role">{p.hiddenFromWall ? 'Hidden from wall' : p.role === 'admin' ? 'Admin' : 'Player'}</small></span></div></td>
                <td><span className={`people-status ${p.steamId || snapshot.demo ? '' : 'offline'}`}>{p.steamId ? 'Linked' : snapshot.demo ? 'Demo' : 'Not linked yet'}</span></td>
                <td>{p.role === 'admin' ? 'Admin' : 'Player'}</td>
                <td><div className="people-actions">
                  <button className="people-action" onClick={() => copy(p)}>{p.joinLink ? 'Copy link ↗' : 'Make link'}</button>
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
  const [id, setId] = useState('');
  const [nickname, setNickname] = useState(player?.nickname ?? '');
  const [steamId, setSteamId] = useState(player?.steamId ?? '');
  const [role, setRole] = useState<'player' | 'admin'>(player?.role ?? 'player');
  const [hidden, setHidden] = useState(player?.hiddenFromWall ?? false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const fields = { nickname: nickname.trim(), steamId: steamId.trim(), role, hiddenFromWall: hidden };

  const save = () => void run(
    () => (player ? api(`/api/admin/players/${player.id}`, 'PATCH', fields) : api('/api/admin/players', 'POST', { id: id.trim(), ...fields })),
    player ? `${fields.nickname} saved to players.yaml.` : `${fields.nickname} added. Copy their join link from the list.`,
  ).then(ok => ok && onClose());

  return (
    <Modal title={player ? `Edit ${player.nickname}` : 'New player & join link'} label="PEOPLE & ACCESS" onClose={onClose}
      footer={<>
        {player && (confirmRemove
          ? <button className="button button-warning" onClick={() => void run(() => api(`/api/admin/players/${player.id}`, 'DELETE'), `${player.nickname} removed.`).then(ok => ok && onClose())}>Yes, remove {player.nickname}</button>
          : <button className="button button-quiet" onClick={() => setConfirmRemove(true)}><Icon name="trash" /> Remove</button>)}
        <button className="button button-primary" onClick={save} disabled={!fields.nickname || (!player && !id.trim())}>Save</button>
      </>}>
      <p className="modal-help" style={{ marginTop: 0 }}>Saved in config/players.yaml. History is kept even when a player is removed.</p>
      {!player && <div className="modal-field">
        <label htmlFor="player-id">Short id</label>
        <input id="player-id" value={id} onChange={e => setId(e.target.value.toLowerCase())} placeholder="kim" />
        <small>Never changes. Lowercase letters, numbers and dashes.</small>
      </div>}
      <div className="modal-field"><label htmlFor="player-name">Nickname</label>
        <input id="player-name" value={nickname} maxLength={20} onChange={e => setNickname(e.target.value)} /></div>
      <div className="modal-field"><label htmlFor="player-steam">Steam ID (optional)</label>
        <input id="player-steam" value={steamId} inputMode="numeric" maxLength={17} onChange={e => setSteamId(e.target.value.replace(/\D/g, ''))} placeholder="Filled in at first Steam sign-in" />
        <small>17 digits. Leave empty and LAN OS fills it in when they first sign in.</small></div>
      <div className="modal-field"><label htmlFor="player-role">Access</label>
        <select id="player-role" value={role} onChange={e => setRole(e.target.value as 'player' | 'admin')}>
          <option value="player">Player</option><option value="admin">Admin</option>
        </select></div>
      <div className="setting-line">
        <div><b>Hidden from wall</b><small>The projector shows a private placeholder.</small></div>
        <Switch label="Hidden from wall" checked={hidden} onChange={setHidden} />
      </div>
      {player && <div className="setting-line">
        <div><b>New join link</b><small>Makes a fresh link. The old one stops working.</small></div>
        <button className="button button-soft button-small" onClick={() => void run(() => api(`/api/admin/players/${player.id}/join-link`), 'New join link made. Copy it from the list.')}>Make new link</button>
      </div>}
    </Modal>
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
      <button className="text-button subtle danger-text" disabled={!snapshot.wall.message}
        onClick={() => void run(() => api('/api/admin/message', 'POST', { text: null }), 'Projector message cleared.')}>
        <Icon name="x" /> Clear current announcement</button>
    </section>
  );
}

function HealthCard({ snapshot, admin }: { snapshot: LiveSnapshot; admin: AdminInfo }) {
  const toast = useToast();
  const services: Array<[IconName, string, ServiceHealth]> = [
    ['gamepad-2', 'Steam Web API', snapshot.health.steam],
    ['music-2', 'Spotify', snapshot.health.spotify],
    ['server', 'Local server', { ...snapshot.health.server, detail: `${snapshot.health.server.detail} · Uptime ${formatDuration(admin.uptimeSeconds)}` }],
  ];
  const allOk = services.every(([, , s]) => s.level !== 'warning');
  return (
    <section className="card systems-card" id="systems">
      <div className="section-header">
        <div><div className="section-overline">HEALTH MONITOR</div><h2>{allOk ? 'Everything connected' : 'Something needs a look'}</h2></div>
        <button className="icon-btn compact" title="Health updates live" onClick={() => toast('Health updates live; nothing to refresh.')}><Icon name="refresh-cw" /></button>
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
      <div className="system-footer"><Icon name="database-backup" /> Automatic backups arrive in Milestone 6 <span>·</span> <button className="text-button" disabled>Run backup</button><span className="later-hint">later</span></div>
    </section>
  );
}

function MusicCard({ now }: { now: Date }) {
  const radio = demoRadioAt(now);
  return (
    <section className="card moderation-card">
      <div className="section-header"><div><div className="section-overline">LAN RADIO</div><h2>Music controls</h2></div><span className="tiny-pill">SAMPLE</span></div>
      <div className="moderation-now"><div className="album-mini" /><div><strong>{radio.now.title}</strong><small>{radio.now.artist} · Requested by {radio.now.requester}</small></div><span className="status-dot grey" /></div>
      <div className="moderation-actions">
        <button type="button" className="button button-soft button-small" disabled><Icon name="pause" /><span>Pause</span></button>
        <button type="button" className="button button-soft button-small" disabled><Icon name="skip-forward" /> Skip</button>
        <button type="button" className="button button-quiet button-small" disabled>Requests on</button>
      </div>
      <div className="system-footer"><Icon name="users-round" /> LAN Radio controls arrive in Milestone 2.<span className="later-hint">later</span></div>
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
