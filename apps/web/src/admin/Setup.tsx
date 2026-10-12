// First-run setup (/setup), on the host PC: admin password, the LAN, players, Steam, Spotify
// and optional extras. Everything is saved for you; nobody has to edit files.
import { useEffect, useState, type ReactNode } from 'react';
import type { AdminInfo, LiveSnapshot } from '@lan-os/shared';
import { api, useLive } from '../live.ts';
import { AdminSignIn, useSignedIn } from '../player/SignIn.tsx';
import { BrandMark, useAction, useToast } from '../ui/common.tsx';
import { Icon } from '../ui/Icon.tsx';
import '../styles/app.css';
import '../styles/lan-os.css';

/** The prototype's example roster; offered for removal on a real LAN. */
const EXAMPLE_NAMES = ['Mara', 'Joris', 'Sam', 'Nick', 'Alex', 'Lisa', 'Tom'];

/** ISO time → "2026-11-19T19:00" in the event timezone, for <input type="datetime-local">. */
function toLocalInput(iso: string, timezone: string): string {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(iso));
  const get = (t: string) => p.find(x => x.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

function Step({ id, n, title, done, optional, children }: { id: string; n: number; title: string; done: boolean; optional?: boolean; children: ReactNode }) {
  return (
    <section className={`card setup-step ${done ? 'done' : ''}`} id={id}>
      <div className="section-header">
        <div><div className="section-overline">STEP {n}{optional ? ' · OPTIONAL' : ''}</div><h2>{title}</h2></div>
        <span className={`tiny-pill ${done ? 'accent-pill' : ''}`}>{done ? '✓ DONE' : optional ? 'OPTIONAL' : 'TO DO'}</span>
      </div>
      <div className="setup-body">{children}</div>
    </section>
  );
}

function SecretForm({ name, label, placeholder, help, set }: { name: string; label: string; placeholder: string; help?: ReactNode; set: boolean }) {
  const run = useAction();
  const toast = useToast();
  const [value, setValue] = useState('');
  return (
    <form onSubmit={e => {
      e.preventDefault();
      void run(() => api<{ message: string }>('/api/setup/secret', 'POST', { name, value: value.trim() }).then(r => { toast(r.message); setValue(''); }));
    }}>
      <div className="modal-field">
        <label htmlFor={name}>{label} {set && <span className="muted">· saved</span>}</label>
        <input id={name} type={name === 'ADMIN_PASSWORD' ? 'password' : 'text'} autoComplete="off" value={value} onChange={e => setValue(e.target.value)} placeholder={set ? 'Saved. Type a new one to replace it' : placeholder} />
        {help && <small>{help}</small>}
      </div>
      <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button className="button button-soft button-small" disabled={!value.trim()}>Save</button>
        {set && name !== 'ADMIN_PASSWORD' && <button type="button" className="text-button" onClick={() => void run(() => api('/api/setup/secret', 'POST', { name, value: null }), 'Removed.')}>Remove</button>}
      </span>
    </form>
  );
}

export default function Setup() {
  const auth = useSignedIn('admin');
  const { snapshot } = useLive('admin');
  useEffect(() => {
    document.body.className = 'app-shell admin-page';
    document.title = 'LAN OS · Setup';
  }, []);
  if (!auth) return null;
  if (!auth.isAdmin) return <AdminSignIn passwordSet={auth.adminPasswordSet} />;
  if (!snapshot?.admin) return null;
  return <SetupSteps snapshot={snapshot} admin={snapshot.admin} hostPc={auth.hostPc} />;
}

function SetupSteps({ snapshot, admin, hostPc }: { snapshot: LiveSnapshot; admin: AdminInfo; hostPc: boolean }) {
  const run = useAction();
  const toast = useToast();
  const s = admin.setup;
  const params = new URLSearchParams(location.search);
  const spotifyResult = params.get('spotify');
  useEffect(() => {
    if (spotifyResult === 'connected') toast('Spotify connected. LAN Radio is on.');
    else if (spotifyResult) toast(spotifyResult === 'access_denied' ? 'Spotify connection was cancelled.' : 'Connecting Spotify did not work. Check the Client ID and Redirect URI, then try again.');
  }, [spotifyResult, toast]);

  const tz = snapshot.event.timezone;
  const [name, setName] = useState(snapshot.event.name);
  const [starts, setStarts] = useState(toLocalInput(snapshot.event.startsAt, tz));
  const [ends, setEnds] = useState(toLocalInput(snapshot.event.endsAt, tz));
  const [newLan, setNewLan] = useState(false);
  const [newPlayer, setNewPlayer] = useState('');
  const examples = admin.players.filter(p => EXAMPLE_NAMES.includes(p.nickname) && !p.steamId);
  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => toast('Copied.'), () => toast(text));

  return (
    <div className="setup-page">
      <header className="setup-head">
        <a className="brand" href="/admin"><BrandMark /><span>LAN <strong>OS</strong></span></a>
        <div>
          <p className="eyebrow"><span className="eyebrow-dot" /> SETUP</p>
          <h1>Let's get the room ready<span className="soft-period">.</span></h1>
          <p className="page-subtitle">A few steps, once. Everything is saved for you. {snapshot.demo && 'You are in demo mode: music and players are pretend.'}</p>
          {!hostPc && <p className="config-problem">You are not on the host PC. Connecting Spotify (step 5) only works on the host PC itself.</p>}
        </div>
      </header>

      <Step id="password" n={1} title="Choose an admin password" done={s.adminPassword}>
        <p className="muted">On this PC the admin page always opens. Other admins use this password, or just sign in with Steam if you make them admin in step 3.</p>
        <SecretForm name="ADMIN_PASSWORD" label="Admin password" placeholder="At least 6 characters" set={s.adminPassword} />
      </Step>

      <Step id="lan" n={2} title="Your LAN" done={true}>
        <form onSubmit={e => {
          e.preventDefault();
          void run(() => api('/api/admin/event', 'POST', { name, startsAt: starts.replace('T', ' '), endsAt: ends.replace('T', ' '), newLan }), 'LAN details saved.');
        }}>
          <div className="modal-field"><label htmlFor="lan-name">Name</label><input id="lan-name" maxLength={40} value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="modal-field" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <span><label htmlFor="lan-start">Starts</label><input id="lan-start" type="datetime-local" value={starts} onChange={e => setStarts(e.target.value)} /></span>
            <span><label htmlFor="lan-end">Ends</label><input id="lan-end" type="datetime-local" value={ends} onChange={e => setEnds(e.target.value)} /></span>
          </div>
          <div className="modal-field"><label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={newLan} onChange={e => setNewLan(e.target.checked)} />
            This is a new LAN (keep last time's stats separate, for LAN Wrapped and year-over-year comparisons)</label></div>
          <button className="button button-soft button-small">Save</button>
        </form>
      </Step>

      <Step id="players" n={3} title="Who's coming" done={examples.length === 0 && admin.players.length > 0}>
        <p className="muted">Friends open <b>{s.signInUrl}</b> on their own PC and click <b>Sign in through Steam</b>. They pick their name below, or add themselves. <button className="text-button" onClick={() => void copy(s.signInUrl)}>Copy the address</button></p>
        {examples.length > 0 && <div className="fair-note"><Icon name="info" /> {examples.map(p => p.nickname).join(', ')} are example players.
          <button className="text-button" onClick={() => void run(async () => { for (const p of examples) await api(`/api/admin/players/${p.id}`, 'DELETE'); }, 'Example players removed.')}>Remove them</button></div>}
        <div className="name-choices">
          {admin.players.map(p => (
            <span key={p.id} className="setup-player">
              {p.nickname}{p.role === 'admin' ? ' · admin' : ''}{p.steamId ? ' · ✓ Steam' : ''}
              <button className="text-button" title={p.role === 'admin' ? 'Make normal player' : 'Make admin'}
                onClick={() => void run(() => api(`/api/admin/players/${p.id}`, 'PATCH', { role: p.role === 'admin' ? 'player' : 'admin' }))}>{p.role === 'admin' ? '★' : '☆'}</button>
              <button className="text-button" title="Remove" onClick={() => void run(() => api(`/api/admin/players/${p.id}`, 'DELETE'), `${p.nickname} removed.`)}>×</button>
            </span>
          ))}
        </div>
        <form onSubmit={e => {
          e.preventDefault();
          const nickname = newPlayer.trim();
          const id = nickname.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'player';
          void run(() => api('/api/admin/players', 'POST', { id, nickname, steamId: '', role: 'player', hiddenFromWall: false }), `${nickname} added.`).then(ok => ok && setNewPlayer(''));
        }} style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <input aria-label="Name of a friend" value={newPlayer} maxLength={20} onChange={e => setNewPlayer(e.target.value)} placeholder="Add a friend's name (optional)" />
          <button className="button button-soft button-small" disabled={!newPlayer.trim()}>Add</button>
        </form>
        <p className="muted text-sm">☆ makes someone an admin. Admins get the admin page after signing in with Steam.</p>
      </Step>

      <Step id="steam" n={4} title="Steam" done={true}>
        <p className="muted"><b>This already works.</b> LAN OS reads everyone's public Steam profile to see who's playing what. Each player's Steam profile and "Game details" must be set to <b>Public</b>.</p>
        <p className="muted">Optional: a free Steam Web API key adds Away status, "Join game" for lobbies, and the Shared Game Finder.
          Get it at <a className="text-button" href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noreferrer">steamcommunity.com/dev/apikey</a> (sign in, type any domain name such as lan-os.local, copy the key).</p>
        <SecretForm name="STEAM_API_KEY" label="Steam Web API key (optional)" placeholder="32 letters and numbers" set={s.steamApiKey} />
      </Step>

      <Step id="spotify" n={5} title="LAN Radio (Spotify)" done={s.spotifyConnected}>
        {snapshot.demo ? <p className="muted">Demo mode plays pretend music. On the real LAN, do this step with the host's Spotify Premium account.</p> : <>
          <p className="muted">LAN Radio plays through the Spotify app on this PC. It needs Spotify <b>Premium</b> and a free Spotify developer app (Spotify requires one; it takes two minutes):</p>
          <ol className="setup-list">
            <li>Open <a className="text-button" href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">developer.spotify.com/dashboard</a>, sign in with the host's Spotify account and click <b>Create app</b>.</li>
            <li>Name: <b>LAN OS</b>. Description: anything. Redirect URI: paste this exactly and click <b>Add</b>:
              <code className="copy-box">{s.spotifyRedirectUri}</code> <button className="text-button" onClick={() => void copy(s.spotifyRedirectUri)}>Copy</button></li>
            <li>Tick <b>Web API</b>, accept the terms and click <b>Save</b>.</li>
            <li>Open the app's <b>Settings</b>, copy the <b>Client ID</b> and paste it here:</li>
          </ol>
          <SecretForm name="SPOTIFY_CLIENT_ID" label="Spotify Client ID" placeholder="32 letters and numbers" set={s.spotifyClientId} />
          <div className="setup-connect">
            {s.spotifyConnected
              ? <p><b>✓ Connected{s.spotifyAccount ? ` as ${s.spotifyAccount}` : ''}.</b> <button className="text-button" onClick={() => void run(() => api('/api/admin/spotify/disconnect'), 'Spotify disconnected.')}>Disconnect</button></p>
              : <a className={`button button-primary ${s.spotifyClientId ? '' : 'disabled-link'}`} href={s.spotifyClientId ? '/auth/spotify/start' : undefined}><Icon name="music-2" /> Connect Spotify</a>}
          </div>
          <p className="muted text-sm">Then open the Spotify app on this PC and press play once, so Spotify knows where to play. LAN OS takes it from there.</p>
        </>}
      </Step>

      <Step id="extras" n={6} title="Extras" done={s.aiKey || s.discordToken} optional>
        <p className="muted"><b>AI-written announcements.</b> Without a key, the wall uses LAN OS's own lines, which work fine. With an Anthropic API key from <a className="text-button" href="https://console.anthropic.com" target="_blank" rel="noreferrer">console.anthropic.com</a>, Claude rewrites them.</p>
        <SecretForm name="AI_API_KEY" label="Anthropic API key" placeholder="sk-ant-…" set={s.aiKey} />
        <p className="muted" style={{ marginTop: 18 }}><b>Discord highlights.</b> Create a bot at <a className="text-button" href="https://discord.com/developers/applications" target="_blank" rel="noreferrer">discord.com/developers</a>, switch on "Message Content Intent", invite it to your server with "Read Message History", and paste its token. Then pick the channel on the admin page.</p>
        <SecretForm name="DISCORD_BOT_TOKEN" label="Discord bot token" placeholder="Bot token" set={s.discordToken} />
      </Step>

      <section className="card setup-step">
        <div className="section-header"><div><div className="section-overline">ALL SET</div><h2>Open the screens</h2></div></div>
        <div className="setup-links">
          <a className="button button-primary" href="/wall" target="_blank" rel="noreferrer"><Icon name="monitor" /> Projector wall</a>
          <a className="button button-soft" href="/admin"><Icon name="sliders-horizontal" /> Admin page</a>
          <a className="button button-soft" href="/app"><Icon name="users-round" /> Player dashboard</a>
        </div>
        <p className="muted text-sm">On the projector PC, open <b>{s.hostUrl}/wall</b> and press F11 for full screen.</p>
      </section>
    </div>
  );
}
