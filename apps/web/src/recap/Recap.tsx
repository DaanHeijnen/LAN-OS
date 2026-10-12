// LAN Wrapped (/recap and /recap/<lan-id>): the weekend in numbers, awards, a timeline,
// a personal recap per player, the archive of earlier LANs and the LAN Time Capsule.
import { useEffect, useState } from 'react';
import { formatDuration, type LanSummary, type RecapData } from '@lan-os/shared';
import { api } from '../live.ts';
import { BrandMark } from '../ui/common.tsx';
import { Icon } from '../ui/Icon.tsx';
import '../styles/app.css';
import '../styles/lan-os.css';

const when = (iso: string, tz: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
const dateRange = (a: string, b: string, tz: string) => {
  const f = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
  return `${f(a)} – ${f(b)}`;
};

export default function Recap() {
  const lanFromPath = /^\/recap\/([^/]+)/.exec(location.pathname)?.[1] ?? null;
  const [lans, setLans] = useState<LanSummary[]>([]);
  const [range, setRange] = useState('all');
  const [recap, setRecap] = useState<RecapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => {
    document.body.className = 'app-shell player-page recap-page';
    document.title = 'LAN OS · LAN Wrapped';
    void api<LanSummary[]>('/api/recap/lans', 'GET').then(setLans).catch(() => {});
    void api<{ playerId: string | null }>('/api/auth/status', 'GET').then(s => setMe(s.playerId)).catch(() => {});
  }, []);
  useEffect(() => {
    const q = new URLSearchParams({ range, ...(lanFromPath ? { lan: lanFromPath } : {}) });
    void api<RecapData>(`/api/recap?${q}`, 'GET').then(r => { setRecap(r); setError(null); }, e => setError(e instanceof Error ? e.message : String(e)));
  }, [range, lanFromPath]);

  if (error) return <div className="sign-in"><p className="form-error">{error}</p><a className="text-button" href="/recap">Back to this LAN</a></div>;
  if (!recap) return null;
  const tz = recap.lan.timezone;
  const days = Math.max(1, Math.ceil((Date.parse(recap.lan.endsAt) - Date.parse(recap.lan.startsAt)) / 86_400_000));
  const mine = recap.players.find(p => p.id === me);

  return (
    <div className="recap">
      <header className="recap-head">
        <a className="brand" href="/app"><BrandMark /><span>LAN <strong>OS</strong></span></a>
        <div className="recap-title">
          <p className="eyebrow"><span className="eyebrow-dot" /> LAN WRAPPED{recap.range.final ? '' : ' · SO FAR'}</p>
          <h1>{recap.lan.name}<span className="soft-period">.</span></h1>
          <p className="page-subtitle">{recap.range.label} · {dateRange(recap.range.from, recap.range.to, tz)}</p>
        </div>
        <div className="recap-actions">
          <a className="button button-soft button-small" href={`/recap/${recap.lan.id}/export.html`} download><Icon name="external-link" /> Download as HTML</a>
          <a className="button button-quiet button-small" href="/app"><Icon name="arrow-left" /> Dashboard</a>
        </div>
      </header>

      <nav className="recap-tabs" aria-label="Which part of the LAN">
        {['all', ...Array.from({ length: days }, (_, i) => `day-${i + 1}`), 'last-24h'].map(r => (
          <button key={r} className={`panel-chip ${range === r ? '' : 'off'}`} aria-pressed={range === r} onClick={() => setRange(r)}>
            {r === 'all' ? 'Whole weekend' : r === 'last-24h' ? 'Last 24 hours' : `Day ${r.slice(4)}`}</button>
        ))}
      </nav>

      <div className="metrics recap-metrics">
        {([['history', 'PLAYED TOGETHER', `${recap.totals.hours}h`, `${recap.totals.sessions} game sessions`],
          ['gamepad-2', 'DIFFERENT GAMES', String(recap.totals.uniqueGames), recap.topGames[0] ? `Most played: ${recap.topGames[0].name}` : 'No games yet'],
          ['music-2', 'SONGS ON LAN RADIO', String(recap.totals.songs), recap.music.topArtists[0] ? `Top artist: ${recap.music.topArtists[0].artist}` : 'No songs yet'],
          ['chart-no-axes-column', 'VOTES & ACTIVITIES', `${recap.totals.votes} · ${recap.totals.activities}`, 'votes cast · activities held'],
        ] as const).map(([icon, label, value, sub]) => (
          <div className="metric" key={label}><div className="metric-label"><Icon name={icon} /> {label}</div><div className="metric-value">{value}</div><div className="metric-sub">{sub}</div></div>
        ))}
      </div>

      {mine && <section className="card recap-card recap-you">
        <div className="section-header"><div><div className="section-overline">YOUR WEEKEND</div><h2>{mine.nickname}{mine.award ? ` · ${mine.award}` : ''}</h2></div></div>
        <PlayerLines p={mine} />
      </section>}

      <div className="recap-grid">
        <section className="card recap-card">
          <div className="section-header"><div><div className="section-overline">AWARDS</div><h2>Not a ranking, just facts</h2></div></div>
          {recap.awards.length === 0 && <p className="muted">Awards appear once people have played a while.</p>}
          {recap.awards.map(a => <div className="recap-row" key={a.title}><b className="recap-award">{a.title}</b><span>{a.player}<small> · {a.reason}</small></span></div>)}
        </section>

        <section className="card recap-card">
          <div className="section-header"><div><div className="section-overline">GAMES</div><h2>Most played</h2></div></div>
          {recap.topGames.length === 0 && <p className="muted">No games yet.</p>}
          {recap.topGames.map(g => <div className="recap-row" key={g.name}><b>{g.name}</b><span>{g.hours}h · {g.players} {g.players === 1 ? 'player' : 'players'}</span></div>)}
          {recap.mostVaried && <p className="muted text-sm">Most varied: {recap.mostVaried.player}, with {recap.mostVaried.games} different games.</p>}
        </section>

        <section className="card recap-card">
          <div className="section-header"><div><div className="section-overline">MARATHONS</div><h2>Longest sessions</h2></div></div>
          {recap.longestSessions.map(s => <div className="recap-row" key={`${s.playerId}${s.startedAt}`}><b>{s.player}</b><span>{s.game} · {formatDuration(s.seconds)}</span></div>)}
          {recap.longestSessions.length === 0 && <p className="muted">No sessions yet.</p>}
        </section>

        <section className="card recap-card">
          <div className="section-header"><div><div className="section-overline">TOGETHER</div><h2>Biggest same-game groups</h2></div></div>
          {recap.biggestGroups.map(g => <div className="recap-row" key={g.game}><b>{g.game}</b><span>{g.players.length} at once · {when(g.at, tz)}<small> · {g.players.join(', ')}</small></span></div>)}
          {recap.biggestGroups.length === 0 && <p className="muted">Nobody shared a game yet.</p>}
        </section>

        <section className="card recap-card recap-wide">
          <div className="section-header"><div><div className="section-overline">WHEN WE PLAYED</div><h2>Hours played, by time of day</h2></div></div>
          <HourChart hours={recap.hourly} />
        </section>

        <section className="card recap-card">
          <div className="section-header"><div><div className="section-overline">LAN RADIO</div><h2>The soundtrack</h2></div></div>
          {recap.music.topSongs.map(s => <div className="recap-row" key={s.title + s.artist}><b>{s.title}</b><span>{s.artist} · {s.count}×</span></div>)}
          {recap.music.topSongs.length === 0 && <p className="muted">No songs yet.</p>}
          {recap.music.perPlayer.length > 0 && <p className="muted text-sm">Requests: {recap.music.perPlayer.map(p => `${p.player} ${p.count}`).join(' · ')}</p>}
          {recap.music.playlist.length > 0 && <details className="recap-playlist"><summary>The weekend playlist ({recap.music.playlist.length} requests)</summary>
            {recap.music.playlist.map((s, i) => <div className="recap-row" key={i}><b>{s.title}</b><span>{s.artist} · {s.requester}</span></div>)}</details>}
        </section>

        <section className="card recap-card">
          <div className="section-header"><div><div className="section-overline">TIMELINE</div><h2>How it went</h2></div></div>
          {recap.timeline.length === 0 && <p className="muted">The big moments show up here.</p>}
          {recap.timeline.map((t, i) => <div className="recap-row" key={i}><span>{t.text}</span><small>{when(t.at, tz)}</small></div>)}
        </section>
      </div>

      <section className="card recap-card">
        <div className="section-header"><div><div className="section-overline">EVERYONE</div><h2>Personal recaps</h2></div></div>
        <div className="recap-people">
          {recap.players.map(p => (
            <div className="recap-person" key={p.id}>
              <b>{p.nickname}</b>{p.award && <span className="tiny-pill accent-pill">{p.award}</span>}
              <PlayerLines p={p} />
            </div>
          ))}
        </div>
      </section>

      {lans.length > 0 && <section className="card recap-card">
        <div className="section-header"><div><div className="section-overline">LAN TIME CAPSULE</div><h2>Every LAN, side by side</h2></div></div>
        <table className="people-table recap-table">
          <thead><tr><th>LAN</th><th>When</th><th>Hours</th><th>Games</th><th>Songs</th><th>Players</th><th>Top game</th></tr></thead>
          <tbody>
            {lans.map(l => (
              <tr key={l.id} className={l.id === recap.lan.id ? 'current' : undefined}>
                <td><a className="text-button" href={`/recap/${l.id}`}>{l.name}</a>{l.final ? '' : <small className="muted"> · so far</small>}</td>
                <td>{new Date(l.startsAt).getFullYear()}</td>
                <td>{l.hours}</td><td>{l.games}</td><td>{l.songs}</td><td>{l.players}</td><td>{l.topGame ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>}
    </div>
  );
}

function PlayerLines({ p }: { p: RecapData['players'][number] }) {
  return (
    <div className="recap-lines">
      <span><b>{p.hours}h</b> played in {p.sessions} {p.sessions === 1 ? 'session' : 'sessions'}</span>
      {p.longest && <span>Longest: <b>{formatDuration(p.longest.seconds)}</b> of {p.longest.game}</span>}
      {p.games.length > 0 && <span>{p.games.slice(0, 3).map(g => `${g.name} ${g.hours}h`).join(' · ')}</span>}
      <span>{p.songs} {p.songs === 1 ? 'song' : 'songs'} requested · {p.votes} {p.votes === 1 ? 'vote' : 'votes'}{p.favouriteHour !== null ? ` · most active around ${p.favouriteHour}:00` : ''}</span>
    </div>
  );
}

/** Single-series bar chart: one accent hue, no legend (the title names it), hover for exact values, table for screen readers. */
function HourChart({ hours }: { hours: number[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...hours);
  if (max === 0) return <p className="muted">No play time yet.</p>;
  return (
    <figure className="hour-chart" aria-label="Hours played by time of day">
      <div className="hour-bars" onMouseLeave={() => setHover(null)}>
        {hours.map((h, i) => (
          <div key={i} className={`hour-slot ${hover === i ? 'active' : ''}`} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0}
            aria-label={`${i}:00 to ${i + 1}:00, ${h} hours`}>
            <i style={{ height: `${Math.max(h > 0 ? 2 : 0, (h / max) * 100)}%` }} />
            {hover === i && <span className="hour-tip"><b>{h}h</b> played<br />{String(i).padStart(2, '0')}:00–{String((i + 1) % 24).padStart(2, '0')}:00</span>}
          </div>
        ))}
      </div>
      <div className="hour-axis" aria-hidden="true">{hours.map((_, i) => <span key={i}>{i % 3 === 0 ? `${String(i).padStart(2, '0')}:00` : ''}</span>)}</div>
      <table className="sr-only"><caption>Hours played per hour of the day</caption><tbody>
        {hours.map((h, i) => <tr key={i}><th>{i}:00</th><td>{h} hours</td></tr>)}
      </tbody></table>
    </figure>
  );
}
