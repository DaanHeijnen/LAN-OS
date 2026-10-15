// The projector wall: a fixed 1920×1080 canvas scaled to fit the screen. Read-only.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  ACTIVITY_KIND_LABELS, clockTime, eventDateRange, lanClock, STATUS_DISPLAY,
  type LiveSnapshot, type PlayerCard, type ServiceHealth,
} from '@lan-os/shared';
import { cardDuration, cardGame, gameCode, gameTone, initial, mmss, staleLabel } from '../format.ts';
import { useLive, useNow } from '../live.ts';
import { groupRoster } from '../roster.ts';
import { AlbumArt, livePosition } from '../player/panels.tsx';
import { TournamentWall } from './TournamentWall.tsx';
import '../styles/wall.css';
import '../styles/lan-os.css';

const WIDTH = 1920;
const HEIGHT = 1080;

export default function Wall() {
  const { snapshot, connected, offsetMs } = useLive('wall');
  const now = useNow(offsetMs);

  useEffect(() => {
    document.body.className = 'wall-page fullscreen';
    document.title = 'LAN OS · Projector wall';
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = snapshot?.wall.nightMode ? 'night' : 'day';
  }, [snapshot?.wall.nightMode]);

  if (snapshot?.wall.blanked) return <div className="wall-blank" />;
  return (
    <WallStage>
      {snapshot ? <WallCanvas snapshot={snapshot} now={now} connected={connected} /> : <div className="wall-canvas" />}
    </WallStage>
  );
}

function WallStage({ children }: { children: ReactNode }) {
  const stage = useRef<HTMLDivElement>(null);
  const [factor, setFactor] = useState(1);
  useLayoutEffect(() => {
    const fit = () => {
      const el = stage.current;
      if (el) setFactor(Math.min(el.clientWidth / WIDTH, el.clientHeight / HEIGHT));
    };
    fit();
    // Re-fit whenever the stage changes size: window resize, fullscreen, or the page's own styles settling.
    const observer = new ResizeObserver(fit);
    if (stage.current) observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="wall-stage" ref={stage}>
      <div id="wall-scale" style={{ width: WIDTH * factor, height: HEIGHT * factor }}>
        <div style={{ transform: `scale(${factor})`, transformOrigin: 'top left' }}>{children}</div>
      </div>
    </div>
  );
}

function WallCanvas({ snapshot, now, connected }: { snapshot: LiveSnapshot; now: Date; connected: boolean }) {
  const { wall, event } = snapshot;
  const clock = lanClock(event, now);
  const { groups, rest } = groupRoster(snapshot.players, { respectHidden: true });
  const gaming = snapshot.players.filter(p => p.status === 'in_game').length;
  // The server dot turns amber while this screen has lost its connection.
  const health = { ...snapshot.health, server: connected ? snapshot.health.server : { level: 'warning', label: 'Server', detail: '' } as ServiceHealth };
  const announcement = wall.announcement ?? (wall.message ? { text: wall.message, kind: 'minor' as const } : null);

  return (
    <div className="wall-canvas" style={{ filter: wall.brightness < 100 ? `brightness(${wall.brightness / 100})` : undefined }}>
      <header className="wall-header">
        <div className="wall-identity">
          <span className="wall-brand-mark"><i /><i /><i /><i /></span>
          <strong>LAN OS</strong>
          <span className="wall-header-divider" />
          <span className="wall-live"><span className="pulse-dot" style={clock.phase === 'live' ? undefined : { background: 'var(--status-offline)' }} />
            {clock.phase === 'live' ? ' ROOM LIVE' : clock.phase === 'before' ? ' STARTING SOON' : ' LAN OVER'}</span>
          <span className="wall-header-soft">{eventDateRange(event)}</span>
        </div>
        <div className="wall-header-right">
          <span className="wall-health">
            {Object.values(health).map(service => (
              <span className="health-item" key={service.label}>
                <i className="health-dot" style={{ background: dotColour(service) }} />{service.label}
              </span>
            ))}
          </span>
          <span className="wall-time-block">
            <span className="wall-time">{clockTime(now, event.timezone)}</span>
            <span className="wall-day">{clock.phase === 'live'
              ? <>DAY {clock.day} <small>·</small> {clock.hoursLeft}H LEFT</>
              : clock.phase === 'before' ? <>STARTS IN {clock.hoursLeft > 48 ? `${Math.ceil(clock.hoursLeft / 24)} DAYS` : `${clock.hoursLeft}H`}</> : <>SEE YOU NEXT TIME</>}</span>
          </span>
        </div>
      </header>

      {snapshot.tournament && snapshot.tournament.state !== 'setup' ? <TournamentWall snapshot={snapshot} tournament={snapshot.tournament} now={now} />
        : <main className="wall-main">
        <section className="room-panel" aria-label="Players in the room">
          <div className="wall-section-title">
            <h1>In the room</h1>
            <span className="wall-section-meta"><i className="little-live" /> <span>{snapshot.players.length} players · {gaming} gaming</span></span>
          </div>
          <div className="wall-roster">
            {groups.map(g => (
              <div className="wall-group" key={g.game}>
                <div className="wall-group-caption"><span className="group-streak" />{g.game.toUpperCase()}<span className="group-count">{g.players.length} PLAYING</span></div>
                {g.players.map(p => <WallPlayer key={p.id} p={p} now={now} timezone={event.timezone} demo={snapshot.demo} />)}
              </div>
            ))}
            {rest.map(p => <WallPlayer key={p.id} p={p} now={now} timezone={event.timezone} demo={snapshot.demo} />)}
          </div>
        </section>

        <section className="wall-column" aria-label="Music, poll and next activity">
          {wall.panels.map(panel => panel === 'music' ? <MusicPanel key={panel} snapshot={snapshot} now={now} />
            : panel === 'poll' ? <PollPanel key={panel} snapshot={snapshot} now={now} />
              : <ActivityPanel key={panel} snapshot={snapshot} now={now} />)}
        </section>
      </main>}

      {announcement && (
        <div className={`wall-announcement ${announcement.kind === 'major' ? 'major' : ''}`} aria-live="polite">
          <span className="announcement-tag">ANNOUNCEMENT</span>
          <p>{announcement.text}</p>
          <span className="announcement-bottom">LAN OS · THE ROOM</span>
        </div>
      )}
      {wall.paused && (
        <div className="wall-paused"><i>Ⅱ</i><h2>Wall feed paused</h2><p>Session data is still being recorded.</p></div>
      )}
      {!connected && <span className="wall-reconnecting">Reconnecting…</span>}
    </div>
  );
}

const dotColour = (s: ServiceHealth) =>
  s.level === 'ok' ? 'var(--status-in-game)' : s.level === 'warning' ? 'var(--status-away)' : 'var(--status-offline)';

function WallPlayer({ p, now, timezone, demo }: { p: PlayerCard; now: Date; timezone: string; demo: boolean }) {
  const hidden = p.status === 'hidden';
  const display = STATUS_DISPLAY[p.status];
  const game = cardGame(p);
  const stale = staleLabel(p, timezone);
  const showCover = !!p.game && p.status !== 'offline' && !hidden;
  return (
    <div className={`wall-player ${p.status === 'offline' ? 'offline' : ''}`}>
      <div className={`wall-avatar ${hidden ? 'private' : `tone-${p.tone}`}`}>
        {hidden ? '•' : p.avatarUrl ? <img src={p.avatarUrl} alt="" /> : initial(p.nickname)}
      </div>
      <div className="wall-player-main">
        <div className="wall-player-name">{p.nickname}{p.looking && <span className="wall-looking">{STATUS_DISPLAY.looking.icon} Looking</span>}</div>
        <div className={`wall-status status-${p.status}`}>
          <span className="status-shape">{display.icon}</span>
          <span className="status-label">{display.word}</span>
          {game && <span className="wall-game-name">· {game.prefix}{game.name}</span>}
          {stale && <span className="wall-stale">· {stale}</span>}
        </div>
      </div>
      {showCover ? <Cover name={p.game!.name} appId={demo ? null : p.game!.appId} /> : <div className="wall-cover none" />}
      <div className="wall-duration">{cardDuration(p, now)}</div>
    </div>
  );
}

function Cover({ name, appId }: { name: string; appId: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`wall-cover ${gameTone(name)}`}>
      {gameCode(name)}
      {appId && !failed && (
        <img src={`https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`} alt="" onError={() => setFailed(true)} />
      )}
    </div>
  );
}

// --- Right-hand panels ---

function MusicPanel({ snapshot, now }: { snapshot: LiveSnapshot; now: Date }) {
  const radio = snapshot.radio;
  const current = radio.now;
  const position = livePosition(current, now);
  const progress = current ? position / Math.max(1, current.durationMs) : 0;
  const next = radio.queue[0];
  const nearEnd = progress > 0.85 && !!next;
  if (radio.status !== 'ok') {
    return (
      <div className="wall-card wall-music">
        <div className="wall-card-heading"><span className="overline">LAN RADIO</span><span className="radio-count" style={{ color: 'var(--status-away)' }}>OFFLINE</span></div>
        <div className="wall-song-meta wall-quiet">
          <div className="wall-song-title">LAN Radio Offline</div>
          <div className="wall-song-requester">{radio.status === 'off' ? 'Music is switched off for now.' : 'Requests are paused until Spotify is back. LAN OS keeps retrying.'}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="wall-card wall-music">
      <div className="wall-card-heading">
        <span className="overline">LAN RADIO <span className="overline-dot">·</span> {current?.isPlaying === false ? 'PAUSED' : 'NOW PLAYING'}</span>
        <span className="radio-count">{radio.queue.length} IN QUEUE</span>
      </div>
      {current ? <>
        <div className="wall-radio-main">
          <AlbumArt className="wall-album" url={current.albumArt} label={current.artist} />
          <div className="wall-song-meta">
            <div className="wall-song-title">{current.title}</div>
            <div className="wall-song-artist">{current.artist}</div>
            <div className="wall-song-requester">{current.isPlaying ? '▶ Playing' : 'Ⅱ Paused'} · {current.requester ? `Requested by ${current.requester}` : 'Room playlist'}</div>
          </div>
        </div>
        <div className="wall-progress"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
        <div className="wall-progress-labels"><span>{mmss(position / 1000)}</span><span>{mmss(current.durationMs / 1000)}</span></div>
      </> : <div className="wall-song-meta wall-quiet"><div className="wall-song-title">Nothing playing</div><div className="wall-song-requester">Request a song from your dashboard</div></div>}
      <div className="wall-next">
        <span>{nearEnd ? 'UP NEXT' : 'FAIR QUEUE'} <em>· {radio.queue.length ? `${radio.queue.length} waiting` : 'empty: request a song!'}</em></span>
        <strong>{nearEnd ? `${next.title} · ${next.requester}` : 'Everyone gets a turn'}</strong>
      </div>
    </div>
  );
}

function PollPanel({ snapshot, now }: { snapshot: LiveSnapshot; now: Date }) {
  const poll = snapshot.polls[0];
  const highlights = snapshot.wall.highlights;
  if (!poll) {
    const highlight = highlights.length ? highlights[Math.floor(now.getTime() / 15_000) % highlights.length]! : null;
    return (
      <div className="wall-card wall-poll">
        <div className="wall-card-heading"><span className="overline">{highlight ? 'FROM DISCORD' : 'ROOM DECISIONS'}</span></div>
        {highlight
          ? <><h2 className="wall-poll-question wall-highlight">“{highlight.text}”</h2><div className="wall-poll-footer"><span>— {highlight.author}</span></div></>
          : <><h2 className="wall-poll-question wall-quiet">No vote right now</h2><div className="wall-poll-footer"><span>Start a poll from your dashboard</span></div></>}
      </div>
    );
  }
  const max = Math.max(...poll.counts);
  const closed = poll.closedAt !== null;
  const minutesLeft = Math.max(0, Math.ceil((Date.parse(poll.closesAt) - now.getTime()) / 60_000));
  return (
    <div className="wall-card wall-poll">
      <div className="wall-card-heading">
        <span className="overline">ROOM DECISIONS</span>
        <span className="wall-poll-live"><i /> {closed ? (poll.tie ? 'TIE · HOST DECIDES' : 'RESULT') : `POLL LIVE · ${minutesLeft} MIN`}</span>
      </div>
      <h2 className="wall-poll-question">{poll.question}</h2>
      <div className="wall-poll-options">
        {poll.options.slice(0, 4).map((o, i) => (
          <div className={`wall-poll-row ${(closed ? i === poll.winner : poll.counts[i] === max && max > 0) ? 'leading' : ''}`} key={o}>
            <b>{o}</b>
            <span className="wall-poll-track"><i style={{ width: `${Math.round((100 * (poll.counts[i] ?? 0)) / Math.max(1, max))}%` }} /></span>
            <span className="wall-poll-count">{poll.counts[i]}</span>
          </div>
        ))}
      </div>
      <div className="wall-poll-footer"><span>{poll.voted} of {poll.eligible} voted</span><span>{closed ? 'Results final' : 'Results update live'}</span></div>
    </div>
  );
}

function ActivityPanel({ snapshot, now }: { snapshot: LiveSnapshot; now: Date }) {
  const activity = snapshot.activities.find(a => a.status === 'live') ?? snapshot.activities.find(a => a.status === 'upcoming');
  if (!activity) {
    return (
      <div className="wall-card wall-activity">
        <div className="wall-activity-layout"><div>
          <div className="overline">NEXT UP</div>
          <h2 className="wall-quiet">Nothing planned</h2>
          <p>Propose a game or a break from your dashboard</p>
        </div></div>
      </div>
    );
  }
  const minutes = Math.max(0, Math.ceil((Date.parse(activity.startsAt) - now.getTime()) / 60_000));
  return (
    <div className="wall-card wall-activity">
      <div className="wall-activity-layout">
        <div>
          <div className="overline">{activity.status === 'live' ? 'HAPPENING NOW' : 'NEXT UP'} <span className="overline-dot">·</span> {ACTIVITY_KIND_LABELS[activity.kind].toUpperCase()}</div>
          <h2>{activity.title}</h2>
          <p>{activity.joined} joined · Organized by {activity.organizer}</p>
        </div>
        {activity.status === 'upcoming'
          ? <div className="wall-activity-timer"><small>STARTS IN</small><b>{minutes >= 120 ? Math.round(minutes / 60) : minutes}<span> {minutes >= 120 ? 'HRS' : 'MIN'}</span></b></div>
          : <div className="wall-activity-timer"><small>JOIN NOW</small><b>{activity.joined}<span> IN</span></b></div>}
      </div>
    </div>
  );
}
