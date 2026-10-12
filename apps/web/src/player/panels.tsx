// The right-hand dashboard panels: LAN Radio, Room decisions (polls), Coming up (activities)
// and Your last sessions.
import { useEffect, useMemo, useState } from 'react';
import {
  ACTIVITY_KIND_LABELS, clockTime, formatDuration, shortDate,
  type ActivityInfo, type LiveSnapshot, type MeInfo, type PollInfo, type RadioInfo,
} from '@lan-os/shared';
import { mmss } from '../format.ts';
import { api } from '../live.ts';
import { Modal, useAction, useToast } from '../ui/common.tsx';
import { Icon } from '../ui/Icon.tsx';

export type Panel = 'radio' | 'polls' | 'activities' | 'history';

interface PanelProps {
  snapshot: LiveSnapshot;
  me: MeInfo;
  now: Date;
  collapsed: boolean;
  onToggle: () => void;
  open: (modal: 'song' | 'poll' | 'activity') => void;
}

const CollapseButton = ({ onToggle, label }: { onToggle: () => void; label: string }) => (
  <button className="icon-btn compact" onClick={onToggle} title="Collapse or expand" aria-label={`Collapse or expand ${label}`}><Icon name="chevron-up" /></button>
);

/** The song position right now, counted on from the last update while playing. */
export function livePosition(now: RadioInfo['now'], at: Date): number {
  if (!now) return 0;
  const moved = now.isPlaying ? at.getTime() - Date.parse(now.at) : 0;
  return Math.min(now.durationMs, now.positionMs + Math.max(0, moved));
}

export function AlbumArt({ url, label, className }: { url: string | null; label: string; className: string }) {
  return <div className={`${className}${url ? ' has-art' : ''}`} data-label={label} style={url ? { backgroundImage: `url("${url}")` } : undefined} />;
}

// --- LAN Radio ---

export function RadioPanel({ snapshot, me, now, collapsed, onToggle, open }: PanelProps) {
  const radio = snapshot.radio;
  const run = useAction();
  const position = livePosition(radio.now, now);
  const canControl = (who: 'everyone' | 'admins') => who === 'everyone' || me.isAdmin;
  const voted = radio.skip.voters.includes(me.id);
  const [volume, setVolume] = useState(radio.volume ?? 50);
  useEffect(() => { if (radio.volume !== null) setVolume(radio.volume); }, [radio.volume]);

  return (
    <section className={`card radio-panel ${collapsed ? 'collapsed' : ''}`} id="radio" data-panel="radio">
      <div className="section-header">
        <div><div className="section-overline">LAN RADIO</div><h2>Music for the room</h2></div>
        <div className="card-header-actions">
          <span className="connected-label"><span className={`status-dot ${radio.status === 'ok' ? 'green' : radio.status === 'off' ? 'grey' : 'amber'}`} />
            {radio.status === 'ok' ? ' Spotify' : radio.status === 'off' ? ' Off' : ' LAN Radio Offline'}</span>
          <CollapseButton onToggle={onToggle} label="LAN Radio" />
        </div>
      </div>
      <div id="player-radio"><div className="radio-content">
        {radio.status !== 'ok' && <div className="fair-note radio-offline"><Icon name="info" /> {radio.message}</div>}
        {radio.now ? <>
          <div className="now-playing-block">
            <AlbumArt className="album-cover" url={radio.now.albumArt} label={radio.now.artist} />
            <div>
              <div className="now-title">{radio.now.title}</div>
              <div className="now-artist">{radio.now.artist}</div>
              <div className="requester">{radio.now.isPlaying ? '▶ Playing' : 'Ⅱ Paused'} · {radio.now.requester ? `Requested by ${radio.now.requester}` : 'Room playlist'}</div>
            </div>
          </div>
          <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.round((100 * position) / Math.max(1, radio.now.durationMs))}%` }} /></div>
          <div className="progress-times"><span>{mmss(position / 1000)}</span><span>{mmss(radio.now.durationMs / 1000)}</span></div>
        </> : radio.status === 'ok' && <p className="muted text-sm">Nothing is playing. Open Spotify on the host PC and press play once.</p>}

        {radio.status === 'ok' && radio.now && (
          <div className="radio-controls">
            <button className="button button-soft button-small" disabled={voted}
              onClick={() => void run(() => api('/api/radio/skip-vote'), 'Skip vote counted.')}>
              <Icon name="skip-forward" /> {voted ? 'You voted to skip' : 'Vote to skip'} · {radio.skip.votes}/{radio.skip.needed}
            </button>
            {canControl(radio.permissions.pause) && <button className="button button-quiet button-small"
              onClick={() => void run(() => api('/api/radio/control', 'POST', { action: radio.now!.isPlaying ? 'pause' : 'resume' }))}>
              <Icon name={radio.now.isPlaying ? 'pause' : 'play'} /> {radio.now.isPlaying ? 'Pause' : 'Play'}</button>}
            {canControl(radio.permissions.skip) && <button className="button button-quiet button-small"
              onClick={() => void run(() => api('/api/radio/control', 'POST', { action: 'skip' }), 'Skipped.')}>Skip now</button>}
            {canControl(radio.permissions.volume) && radio.volume !== null && <span className="brightness-input">
              <input aria-label="Volume" type="range" min={0} max={100} step={5} value={volume} onChange={e => setVolume(Number(e.target.value))}
                onPointerUp={() => void run(() => api('/api/radio/control', 'POST', { action: 'volume', volume }))} />
              <output>{volume}%</output></span>}
          </div>
        )}

        <div className="queue-head"><strong>Up next</strong><span>{radio.queue.length} in the fair queue</span></div>
        {radio.queue.length === 0 && <p className="muted text-sm">Queue empty. {radio.fallbackPlaylist ? 'The room playlist keeps playing.' : ''} Request something!</p>}
        {radio.queue.slice(0, 6).map((s, i) => (
          <div className="queue-row" key={s.id}>
            <span className="queue-number">{i + 1}</span>
            <div><strong>{s.title}</strong><small>{s.artist} · {s.requester}{s.state === 'sent' ? ' · next on Spotify' : ''}</small></div>
            {s.requesterId === me.id && s.state === 'waiting' && <button type="button" className="queue-remove" title="Remove your request"
              onClick={() => void run(() => api(`/api/radio/request/${s.id}`, 'DELETE'), `${s.title} removed.`)}><Icon name="x" /></button>}
          </div>
        ))}
        {radio.queue.length > 6 && <p className="muted text-sm">…and {radio.queue.length - 6} more.</p>}
        <div className="fair-note"><Icon name="users-round" /> One song per requester per round. Everyone gets a turn.</div>
        <div className="radio-actions">
          <span className="muted text-sm">{radio.requestsOpen ? 'Requests are added immediately' : radio.requestsClosedReason ?? 'Requests are paused'}</span>
          <button className="text-button" disabled={!radio.requestsOpen} onClick={() => open('song')}>Add track <Icon name="arrow-right" /></button>
        </div>
      </div></div>
    </section>
  );
}

export function SongModal({ onClose }: { onClose: () => void }) {
  const run = useAction();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ uri: string; title: string; artist: string; durationMs: number }>>([]);
  const [link, setLink] = useState('');
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    setSearching(true);
    const timer = window.setTimeout(() => {
      api<{ tracks: typeof results }>(`/api/radio/search?${new URLSearchParams({ q: query })}`, 'GET')
        .then(r => setResults(r.tracks), e => toast(e instanceof Error ? e.message : String(e)))
        .finally(() => setSearching(false));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [query, toast]);

  const request = (body: object, title?: string) =>
    void run(() => api<{ track: { title: string } }>('/api/radio/request', 'POST', body).then(r => toast(`${r.track.title ?? title} added to the fair queue.`)))
      .then(ok => ok && onClose());

  return (
    <Modal title="Request a song" label="LAN RADIO" onClose={onClose}>
      <p className="modal-help" style={{ marginTop: 0, marginBottom: 18 }}>Search Spotify or paste a song link. Requests go straight into the fair queue.</p>
      <div className="modal-field">
        <label htmlFor="track-search">Find a song</label>
        <input id="track-search" type="search" autoComplete="off" autoFocus placeholder="Artist or song title" value={query} onChange={e => setQuery(e.target.value)} />
        <div>
          {results.map(t => (
            <div className="modal-result" key={t.uri}>
              <div><b>{t.title}</b><small>{t.artist} · {mmss(t.durationMs / 1000)}</small></div>
              <button className="button button-small button-soft" onClick={() => request({ uri: t.uri }, t.title)}>Add <Icon name="plus" /></button>
            </div>
          ))}
          {query.trim() && !searching && results.length === 0 && <p className="modal-help">No songs found. Try other words, or paste a link below.</p>}
        </div>
      </div>
      <form onSubmit={e => { e.preventDefault(); request({ link }); }}>
        <div className="modal-field">
          <label htmlFor="song-link">Or paste a Spotify link</label>
          <input id="song-link" value={link} onChange={e => setLink(e.target.value)} placeholder="https://open.spotify.com/track/…" />
        </div>
        <button className="button button-primary" style={{ width: '100%' }} type="submit" disabled={!link.trim()}><Icon name="plus" /> Add to fair queue</button>
      </form>
    </Modal>
  );
}

// --- Polls ---

function PollCard({ poll, me, now, timezone }: { poll: PollInfo; me: MeInfo; now: Date; timezone: string }) {
  const run = useAction();
  const total = poll.counts.reduce((a, b) => a + b, 0);
  const max = Math.max(...poll.counts);
  const closed = poll.closedAt !== null;
  const locked = poll.myVote !== null && poll.changeUntil !== null && Date.parse(poll.changeUntil) < now.getTime();
  const status = closed ? (poll.tie ? 'Tie · the host decides' : poll.winner !== null ? `Winner: ${poll.options[poll.winner]}` : 'Closed without votes')
    : poll.myVote === null ? 'Choose an option to vote.'
      : locked ? 'Your vote is locked in.' : `You voted. You can change it until ${clockTime(new Date(poll.changeUntil!), timezone)}.`;
  return (
    <div className="poll-body">
      <h3 className="poll-question">{poll.question}</h3>
      <p className="poll-meta">Started by {poll.createdBy} · {poll.voted} of {poll.eligible} voted · {closed ? 'Results final' : `Closes at ${clockTime(new Date(poll.closesAt), timezone)}`}{poll.anonymous ? ' · Anonymous' : ''}</p>
      {poll.options.map((option, i) => (
        <button key={option} className={`vote-option ${i === poll.myVote ? 'selected' : ''} ${(closed ? i === poll.winner : poll.counts[i] === max && max > 0) ? 'leading' : ''}`}
          aria-pressed={i === poll.myVote} disabled={closed || (locked && i !== poll.myVote)}
          onClick={() => void run(() => api(`/api/polls/${poll.id}/vote`, 'POST', { option: i }), 'Vote saved.')}>
          <div className="vote-option-head"><span>{option}</span>{i === poll.myVote && <Icon name="check" />}
            <span className="vote-option-count">{poll.counts[i]} {poll.counts[i] === 1 ? 'vote' : 'votes'}</span></div>
          <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.round((100 * (poll.counts[i] ?? 0)) / Math.max(1, total))}%` }} /></div>
          {!poll.anonymous && (poll.votersByOption[i]?.length ?? 0) > 0 && <small className="vote-voters">{poll.votersByOption[i]!.join(', ')}</small>}
        </button>
      ))}
      <div className="poll-bottom">
        <span>{status}</span>
        {!closed && poll.createdById === me.id && <button className="text-button" onClick={() => void run(() => api(`/api/polls/${poll.id}/close`, 'POST', {}), 'Poll closed.')}>Close poll</button>}
      </div>
    </div>
  );
}

export function PollsPanel({ snapshot, me, now, collapsed, onToggle, open }: PanelProps) {
  const [main, ...others] = snapshot.polls;
  return (
    <section className={`card poll-panel ${collapsed ? 'collapsed' : ''}`} id="polls" data-panel="polls">
      <div className="section-header">
        <div><div className="section-overline">POLL{main?.isMain ? ' · MAIN' : ''}</div><h2>Room decisions</h2></div>
        <div className="card-header-actions">
          {main && <span className="tiny-pill accent-pill">{main.closedAt ? 'CLOSED' : 'LIVE'}</span>}
          <CollapseButton onToggle={onToggle} label="polls" />
        </div>
      </div>
      <div id="player-poll">
        {main ? <PollCard poll={main} me={me} now={now} timezone={snapshot.event.timezone} />
          : <div className="poll-body"><p className="muted">No vote running. Got a question for the room?</p></div>}
        {others.map(p => (
          <details className="side-poll" key={p.id}>
            <summary><strong>{p.isMain ? 'MAIN POLL' : 'SIDE POLL'} · {p.question}</strong><span>{p.voted} of {p.eligible} voted · {p.closedAt ? 'closed' : 'open'}</span></summary>
            <PollCard poll={p} me={me} now={now} timezone={snapshot.event.timezone} />
          </details>
        ))}
        <div className="poll-bottom" style={{ padding: '0 22px 20px' }}><span /><button className="text-button" onClick={() => open('poll')}>+ New poll</button></div>
      </div>
    </section>
  );
}

export function PollModal({ onClose }: { onClose: () => void }) {
  const run = useAction();
  const [question, setQuestion] = useState('');
  const [mode, setMode] = useState<'choice' | 'yes_no_maybe'>('choice');
  const [options, setOptions] = useState('');
  const [minutes, setMinutes] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const submit = () => void run(() => api('/api/polls', 'POST', {
    question, mode, anonymous, minutes: minutes ? Number(minutes) : null,
    options: mode === 'choice' ? options.split(/\n|,/).map(x => x.trim()).filter(Boolean) : [],
  }), 'Poll started.').then(ok => ok && onClose());
  return (
    <Modal title="Start a quick poll" label="GROUP VOTING" onClose={onClose}>
      <p className="modal-help" style={{ marginTop: 0, marginBottom: 18 }}>One main poll runs at a time; yours becomes a side poll if one is already running. Results show live.</p>
      <form onSubmit={e => { e.preventDefault(); submit(); }}>
        <div className="modal-field"><label htmlFor="poll-question">Question</label>
          <input id="poll-question" required maxLength={120} autoFocus value={question} onChange={e => setQuestion(e.target.value)} placeholder="Play Factorio in 20 minutes?" /></div>
        <div className="modal-field"><label htmlFor="poll-mode">Answers</label>
          <select id="poll-mode" value={mode} onChange={e => setMode(e.target.value as typeof mode)}>
            <option value="choice">My own choices</option><option value="yes_no_maybe">Yes / No / Maybe</option>
          </select></div>
        {mode === 'choice' && <div className="modal-field"><label htmlFor="poll-options">Choices · one per line (2 to 6)</label>
          <textarea id="poll-options" rows={4} required value={options} onChange={e => setOptions(e.target.value)} placeholder={'Pizza\nWalk outside\nKeep playing'} /></div>}
        <div className="modal-field"><label htmlFor="poll-minutes">Open for (minutes)</label>
          <input id="poll-minutes" type="number" min={1} max={240} value={minutes} onChange={e => setMinutes(e.target.value)} placeholder="Default" />
          <small>It also closes as soon as everyone has voted.</small></div>
        <div className="modal-field"><label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={anonymous} onChange={e => setAnonymous(e.target.checked)} /> Anonymous votes</label></div>
        <button className="button button-primary" style={{ width: '100%' }} type="submit"><Icon name="plus" /> Start poll</button>
      </form>
    </Modal>
  );
}

// --- Activities ---

const ETAS = [null, 5, 10, 15, 30, 60];

function ActivityCard({ a, me, now }: { a: ActivityInfo; me: MeInfo; now: Date }) {
  const run = useAction();
  const [eta, setEta] = useState<number | null>(null);
  const minutes = Math.max(0, Math.ceil((Date.parse(a.startsAt) - now.getTime()) / 60_000));
  const canManage = a.organizerId === me.id || me.isAdmin;
  const answer = (value: 'join' | 'maybe' | 'skip') =>
    void run(() => api(`/api/activities/${a.id}/rsvp`, 'POST', { answer: value, etaMinutes: value === 'skip' ? null : eta }), `Saved: ${value === 'join' ? 'Join' : value === 'maybe' ? 'Maybe' : 'Skip'}.`);
  const act = (action: 'start' | 'end' | 'cancel') => void run(() => api(`/api/activities/${a.id}`, 'POST', { action }));
  const going = a.rsvps.filter(r => r.answer !== 'skip');
  return (
    <div className="activity-body">
      <div className="activity-big">
        <div>
          <div className="activity-title">{a.title}</div>
          <div className="activity-meta">{ACTIVITY_KIND_LABELS[a.kind]} · {a.joined}/{a.maxPlayers} joined · By {a.organizer}{a.joined < a.minPlayers ? ` · needs ${a.minPlayers}` : ''}</div>
        </div>
        <div className="activity-time">
          {a.status === 'upcoming' ? <><b>{minutes}m</b><small>until start</small></> : a.status === 'live' ? <><b>Now</b><small>happening</small></>
            : <><b>{a.status === 'ended' ? 'Done' : 'Off'}</b><small>{a.status}</small></>}
        </div>
      </div>
      {going.length > 0 && <p className="muted text-sm activity-who">{going.map(r => `${r.nickname}${r.answer === 'maybe' ? ' (maybe)' : ''}${r.etaMinutes ? ` · ${r.etaMinutes}m` : ''}`).join(', ')}</p>}
      {(a.status === 'upcoming' || a.status === 'live') && <div className="rsvp-line">
        <span className="rsvp-label">Are you joining?
          <select className="eta-select" aria-label="When can you be there" value={eta ?? ''} onChange={e => setEta(e.target.value ? Number(e.target.value) : null)}>
            {ETAS.map(m => <option key={m ?? 0} value={m ?? ''}>{m ? `in ${m} min` : 'right away'}</option>)}
          </select></span>
        <div className="rsvp-buttons">
          {(['join', 'maybe', 'skip'] as const).map(x => (
            <button key={x} className={`rsvp-button ${a.myAnswer === x ? 'selected' : ''}`} aria-pressed={a.myAnswer === x} onClick={() => answer(x)}>
              {x === 'join' ? 'Join' : x === 'maybe' ? 'Maybe' : 'Skip'}</button>
          ))}
        </div>
      </div>}
      {canManage && (a.status === 'upcoming' || a.status === 'live') && <div className="radio-actions">
        <span className="muted text-sm">{a.organizerId === me.id ? "You organize this" : "Admin controls"}</span>
        <span style={{ display: 'flex', gap: 14 }}>
          {a.status === 'upcoming' && <button className="text-button" onClick={() => act('start')}>Start now</button>}
          {a.status === 'live' && <button className="text-button" onClick={() => act('end')}>End</button>}
          <button className="text-button danger-text" onClick={() => act('cancel')}>Cancel</button>
        </span>
      </div>}
    </div>
  );
}

export function ActivitiesPanel({ snapshot, me, now, collapsed, onToggle, open }: PanelProps) {
  const current = snapshot.activities.filter(a => a.status === 'upcoming' || a.status === 'live');
  const recent = snapshot.activities.filter(a => a.status === 'ended' || a.status === 'cancelled');
  return (
    <section className={`card activity-panel ${collapsed ? 'collapsed' : ''}`} id="activities" data-panel="activities">
      <div className="section-header">
        <div><div className="section-overline">UP NEXT</div><h2>Coming up</h2></div>
        <div className="card-header-actions"><button className="text-button" onClick={() => open('activity')}>+ Propose</button><CollapseButton onToggle={onToggle} label="activities" /></div>
      </div>
      <div id="player-activity">
        {current.map(a => <ActivityCard key={a.id} a={a} me={me} now={now} />)}
        {current.length === 0 && <div className="activity-body">
          {snapshot.suggestion
            ? <div className="fair-note suggestion"><Icon name="users-round" /> {listNames(snapshot.suggestion.players)} are free right now. Propose something to do together?</div>
            : <p className="muted">Nothing planned. Propose a game, a food break or something IRL.</p>}
          <button className="button button-soft button-small" onClick={() => open('activity')}><Icon name="calendar-plus" /> Propose activity</button>
        </div>}
        {recent.map(a => <p className="muted text-sm activity-ended" key={a.id}>{a.title} · {a.status === 'ended' ? `ended with ${a.joined} players` : 'cancelled'}</p>)}
      </div>
    </section>
  );
}

const listNames = (names: string[]) => (names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

export function ActivityModal({ onClose, kinds }: { onClose: () => void; kinds?: Array<keyof typeof ACTIVITY_KIND_LABELS> }) {
  const run = useAction();
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<keyof typeof ACTIVITY_KIND_LABELS>('game');
  const [startsIn, setStartsIn] = useState(20);
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const available = useMemo(() => kinds ?? (Object.keys(ACTIVITY_KIND_LABELS) as Array<keyof typeof ACTIVITY_KIND_LABELS>), [kinds]);
  const submit = () => void run(() => api('/api/activities', 'POST', {
    title, kind, startsInMinutes: startsIn, minPlayers: min ? Number(min) : null, maxPlayers: max ? Number(max) : null,
  }), 'Activity proposed. Others can join.').then(ok => ok && onClose());
  return (
    <Modal title="Propose an activity" label="PLANS & ACTIVITIES" onClose={onClose}>
      <p className="modal-help" style={{ marginTop: 0, marginBottom: 18 }}>Friends answer Join, Maybe or Skip. It starts at the time you choose, or when you press Start.</p>
      <form onSubmit={e => { e.preventDefault(); submit(); }}>
        <div className="modal-field"><label htmlFor="activity-name">Activity</label>
          <input id="activity-name" required maxLength={70} autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Mario Kart together" /></div>
        <div className="modal-field"><label htmlFor="activity-kind">Type</label>
          <select id="activity-kind" value={kind} onChange={e => setKind(e.target.value as typeof kind)}>
            {available.map(k => <option key={k} value={k}>{ACTIVITY_KIND_LABELS[k]}</option>)}
          </select></div>
        <div className="modal-field"><label htmlFor="activity-time">Start in (minutes)</label>
          <input id="activity-time" type="number" min={0} max={720} required value={startsIn} onChange={e => setStartsIn(Number(e.target.value))} /></div>
        <div className="modal-field" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <span><label htmlFor="activity-min">Min players</label><input id="activity-min" type="number" min={1} max={32} value={min} onChange={e => setMin(e.target.value)} placeholder="Default" /></span>
          <span><label htmlFor="activity-max">Max players</label><input id="activity-max" type="number" min={1} max={32} value={max} onChange={e => setMax(e.target.value)} placeholder="Default" /></span>
        </div>
        <button className="button button-primary" style={{ width: '100%' }} type="submit"><Icon name="calendar-plus" /> Propose to the room</button>
      </form>
    </Modal>
  );
}

// --- Your last sessions ---

export function HistoryPanel({ snapshot, me, now, collapsed, onToggle }: PanelProps) {
  const tz = snapshot.event.timezone;
  const when = (iso: string) => {
    const day = (d: Date) => shortDate(d.toISOString(), tz, { year: 'numeric', month: 'numeric', day: 'numeric' });
    if (day(new Date(iso)) === day(now)) return 'Earlier today';
    if (day(new Date(iso)) === day(new Date(now.getTime() - 86_400_000))) return 'Yesterday';
    return shortDate(iso, tz, { weekday: 'long' });
  };
  return (
    <section className={`card player-history ${collapsed ? 'collapsed' : ''}`} id="history" data-panel="history">
      <div className="section-header"><div><div className="section-overline">THIS WEEKEND</div><h2>Your last sessions</h2></div><CollapseButton onToggle={onToggle} label="history" /></div>
      <div id="recent-sessions">
        {me.sessions.length === 0 && <div className="history-row"><b>No game sessions yet</b><span>They appear here as you play</span></div>}
        {me.sessions.map(s => (
          <div className="history-row" key={s.startedAt}>
            <b>{s.game}</b>
            <span>{formatDuration(s.endedAt ? s.seconds : (now.getTime() - Date.parse(s.startedAt)) / 1000)} · {s.endedAt ? when(s.endedAt) : 'Playing now'}</span>
          </div>
        ))}
        <div className="history-row"><b>LAN Wrapped</b><a className="text-button" href="/recap">{snapshot.recapPublished ? 'The final recap is ready' : 'See the weekend so far'} <Icon name="arrow-right" /></a></div>
      </div>
    </section>
  );
}
