// The tournament on the admin page: the lineup, scoring rounds, teams, bingo ideas and the podium.
import { useState } from 'react';
import {
  placesFromGroups, TOURNAMENT_GAME_KINDS, TOURNAMENT_KIND_LABELS,
  type LiveSnapshot, type TournamentGameInfo, type TournamentGameKind, type TournamentInfo, type TournamentTeam,
} from '@lan-os/shared';
import { api } from '../live.ts';
import { BingoGrid, bingoSummary, placeLabel, timeLeft } from '../player/tournament.tsx';
import { Modal, useAction } from '../ui/common.tsx';
import { Icon } from '../ui/Icon.tsx';

type Dialog = { kind: 'round' | 'teams' | 'bingo' | 'cards'; game: TournamentGameInfo } | null;

const STATE_PILL = { setup: 'SETTING UP', live: 'LIVE ON THE WALL', finished: 'PODIUM ON THE WALL' } as const;

export function TournamentCard({ snapshot, now }: { snapshot: LiveSnapshot; now: Date }) {
  const run = useAction();
  const [name, setName] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const t = snapshot.tournament;
  const nick = (id: string) => snapshot.players.find(p => p.id === id)?.nickname ?? id;

  if (!t) {
    return (
      <section className="card admin-polls-card" id="tournament">
        <div className="section-header"><div><div className="section-overline">TOURNAMENT</div><h2>Games night</h2></div><span className="tiny-pill">OFF</span></div>
        <p className="muted text-sm">Plan a lineup of games, score each round, and the wall shows a live scoreboard. Bingo rounds give everyone their own card.</p>
        <form className="tournament-form" onSubmit={e => { e.preventDefault(); void run(() => api('/api/admin/tournament', 'POST', { name }), 'Tournament created. Add the games next.').then(ok => ok && setName('')); }}>
          <label className="sr-only" htmlFor="tournament-name">Tournament name</label>
          <input id="tournament-name" value={name} maxLength={40} onChange={e => setName(e.target.value)} placeholder="Friday Night Cup" />
          <button className="button button-primary button-small" disabled={!name.trim()}><Icon name="trophy" /> Create tournament</button>
        </form>
      </section>
    );
  }

  const live = t.games.find(g => g.state === 'live');
  const setState = (state: 'live' | 'finished' | 'closed', message: string) => void run(() => api('/api/admin/tournament/state', 'POST', { state }), message);
  return (
    <section className="card admin-polls-card" id="tournament">
      <div className="section-header"><div><div className="section-overline">TOURNAMENT</div><h2>{t.name}</h2></div>
        <span className="tiny-pill accent-pill">{STATE_PILL[t.state]}</span></div>
      <div className="admin-poll-detail">
        <div><strong>{t.state === 'setup' ? 'Ready when you are' : t.state === 'live' ? (live ? `${live.name} is live` : 'Between games') : 'The podium is on the wall'}</strong>
          <small>{t.state === 'setup' ? 'Starting puts the scoreboard on the wall. You can keep adding games later.'
            : t.state === 'live' ? 'The wall shows the scoreboard until you finish the tournament.'
              : 'Results are saved for LAN Wrapped. Go back to the normal wall when the party is over.'}</small></div>
        <span style={{ display: 'flex', gap: 8 }}>
          {t.state === 'setup' && <button className="button button-primary button-small" onClick={() => setState('live', 'Tournament started. It\'s on the wall.')}>Start tournament</button>}
          {t.state === 'live' && <button className="button button-soft button-small" disabled={!!live} title={live ? `Finish ${live.name} first` : undefined}
            onClick={() => setState('finished', 'Tournament finished. The podium is on the wall.')}><Icon name="trophy" /> Finish &amp; show podium</button>}
          {t.state !== 'setup' && <CloseButton finished={t.state === 'finished'} onClose={() => setState('closed', 'The wall is back to normal.')} />}
          {t.state === 'setup' && <CloseButton finished={false} onClose={() => setState('closed', 'Tournament removed.')} />}
        </span>
      </div>

      {t.state !== 'setup' && t.standings.some(s => s.points > 0) && <p className="muted text-sm tournament-standings-line">
        {t.standings.slice(0, 7).map(s => `${s.place}. ${nick(s.playerId)} ${s.points}`).join(' · ')}</p>}

      {t.games.map((g, i) => <GameRow key={g.id} game={g} index={i} count={t.games.length} tournament={t} anyLive={!!live} nick={nick} now={now} open={kind => setDialog({ kind, game: g })} />)}
      {t.state !== 'finished' && <AddGame />}

      {dialog?.kind === 'round' && <RoundModal game={current(t, dialog.game)} snapshot={snapshot} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'teams' && <TeamsModal game={current(t, dialog.game)} snapshot={snapshot} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'bingo' && <BingoModal game={current(t, dialog.game)} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'cards' && <CardsModal game={current(t, dialog.game)} nick={nick} now={now} onClose={() => setDialog(null)} />}
    </section>
  );
}

/** The latest version of a game from the live snapshot, so open dialogs stay up to date. */
const current = (t: TournamentInfo, game: TournamentGameInfo) => t.games.find(g => g.id === game.id) ?? game;

function CloseButton({ finished, onClose }: { finished: boolean; onClose: () => void }) {
  const [sure, setSure] = useState(false);
  if (finished) return <button className="button button-soft button-small" onClick={onClose}>Back to normal wall</button>;
  return sure
    ? <button className="button button-warning button-small" onClick={onClose}>Yes, end it</button>
    : <button className="button button-quiet button-small" onClick={() => setSure(true)}>End</button>;
}

function GameRow({ game, index, count, tournament, anyLive, nick, now, open }: {
  game: TournamentGameInfo; index: number; count: number; tournament: TournamentInfo; anyLive: boolean;
  nick: (id: string) => string; now: Date; open: (kind: 'round' | 'teams' | 'bingo' | 'cards') => void;
}) {
  const run = useAction();
  const path = `/api/admin/tournament/games/${game.id}`;
  const needed = (game.bingo?.size ?? 4) ** 2;
  const detail = game.state === 'finished'
    ? game.results.filter(r => r.points > 0).map(r => `${nick(r.playerId)} +${r.points}`).join(' · ')
    : game.kind === 'teams' ? (game.teams.length ? game.teams.map(team => `${team.name}: ${team.playerIds.map(nick).join(', ') || 'nobody'}`).join(' · ') : 'No teams yet')
      : game.kind === 'bingo' && game.bingo ? (game.state === 'live'
        ? `${game.bingo.locked ? 'Time is up' : `${timeLeft(game.bingo.endsAt, now)} left`} · leading: ${game.scores.filter(s => s.place === 1 && s.score > 0).map(s => nick(s.playerId)).join(', ') || 'nobody yet'}`
        : `${game.bingo.ideas.length} ideas${game.bingo.ideas.length < needed ? ` (a card needs ${needed})` : ''} · ${game.bingo.minutes} min`)
        : game.state === 'live' ? `${game.rounds.length} round${game.rounds.length === 1 ? '' : 's'} scored` : 'Solo';
  return (
    <div className="admin-poll-detail">
      <div>
        <strong>{index + 1}. {game.name} <span className="tiny-pill">{TOURNAMENT_KIND_LABELS[game.kind].toUpperCase()}</span>
          {game.state === 'live' && <span className="tiny-pill accent-pill">LIVE</span>}{game.state === 'finished' && <span className="tiny-pill">DONE</span>}</strong>
        <small>{detail}</small>
        {game.state === 'live' && game.rounds.map(r => (
          <small key={r.id}>Round {r.number}: {r.placings.map(p => `${placeLabel(p.place)} ${p.entries.map(e => e.label).join(' = ')}`).join(' · ')}</small>
        ))}
      </div>
      <span className="tournament-actions">
        {game.state === 'upcoming' && <>
          <button className="icon-btn compact" title="Move up" aria-label="Move up" disabled={index === 0}
            onClick={() => void run(() => api(path, 'PATCH', { move: 'up' }))}><Icon name="chevron-up" /></button>
          <button className="icon-btn compact" title="Move down" aria-label="Move down" disabled={index === count - 1}
            onClick={() => void run(() => api(path, 'PATCH', { move: 'down' }))}><Icon name="chevron-down" /></button>
          {game.kind === 'bingo' && <button className="button button-soft button-small" onClick={() => open('bingo')}>Ideas</button>}
        </>}
        {game.kind === 'teams' && game.state !== 'finished' && <button className="button button-soft button-small" onClick={() => open('teams')}>Teams</button>}
        {game.state === 'upcoming' && <>
          <button className="button button-primary button-small" disabled={tournament.state !== 'live' || anyLive}
            title={tournament.state !== 'live' ? 'Start the tournament first' : anyLive ? 'Finish the live game first' : undefined}
            onClick={() => void run(() => api(`${path}/start`), `${game.name} is live.`)}>Start</button>
          <button className="button button-quiet button-small" onClick={() => void run(() => api(path, 'DELETE'), `${game.name} removed.`)}>Remove</button>
        </>}
        {game.state === 'live' && <>
          {game.kind === 'bingo'
            ? <button className="button button-soft button-small" onClick={() => open('cards')}><Icon name="grid-3x3" /> Cards</button>
            : <>
              <button className="button button-primary button-small" onClick={() => open('round')}>Score round {game.rounds.length + 1}</button>
              {game.rounds.length > 0 && <button className="button button-quiet button-small"
                onClick={() => void run(() => api(`${path}/rounds/last`, 'DELETE'), `Round ${game.rounds.length} removed.`)}>Undo round</button>}
            </>}
          <button className="button button-soft button-small" onClick={() => void run(() => api(`${path}/finish`), `${game.name} finished. Points are on the wall.`)}>Finish game</button>
        </>}
      </span>
    </div>
  );
}

function AddGame() {
  const run = useAction();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<TournamentGameKind>('solo');
  return (
    <form className="tournament-form" onSubmit={e => {
      e.preventDefault();
      void run(() => api('/api/admin/tournament/games', 'POST', { name, kind }),
        kind === 'bingo' ? `${name} added. Click Ideas to write the bingo squares.` : kind === 'teams' ? `${name} added. Click Teams to split the players.` : `${name} added to the lineup.`)
        .then(ok => ok && setName(''));
    }}>
      <label className="sr-only" htmlFor="game-name">Game</label>
      <input id="game-name" value={name} maxLength={40} onChange={e => setName(e.target.value)} placeholder="Add a game, e.g. GeoGuessr" />
      <label className="sr-only" htmlFor="game-kind">Kind</label>
      <select id="game-kind" value={kind} onChange={e => setKind(e.target.value as TournamentGameKind)}>
        {TOURNAMENT_GAME_KINDS.map(k => <option key={k} value={k}>{TOURNAMENT_KIND_LABELS[k]}</option>)}
      </select>
      <button className="button button-soft button-small" disabled={!name.trim()}><Icon name="plus" /> Add</button>
    </form>
  );
}

/** Tap entries in finishing order; "Tie" puts an entry on the same place as the one above. */
function RoundModal({ game, snapshot, onClose }: { game: TournamentGameInfo; snapshot: LiveSnapshot; onClose: () => void }) {
  const run = useAction();
  const [order, setOrder] = useState<Array<{ key: string; tie: boolean }>>([]);
  const entries = game.kind === 'teams'
    ? game.teams.map((team, i) => ({ key: String(i), label: team.name }))
    : snapshot.players.map(p => ({ key: p.id, label: p.nickname }));
  const label = (key: string) => entries.find(e => e.key === key)?.label ?? key;
  const groups: string[][] = [];
  for (const o of order) {
    if (o.tie && groups.length) groups[groups.length - 1]!.push(o.key);
    else groups.push([o.key]);
  }
  const places = new Map(placesFromGroups(groups).flatMap(p => p.entries.map(key => [key, p.place] as const)));
  const placed = new Set(order.map(o => o.key));
  const save = () => void run(() => api(`/api/admin/tournament/games/${game.id}/rounds`, 'POST', { placings: groups }),
    `Round ${game.rounds.length + 1} of ${game.name} scored.`).then(ok => ok && onClose());

  return (
    <Modal title={`${game.name}: round ${game.rounds.length + 1}`} label="SCORE A ROUND" onClose={onClose}
      footer={<><button className="button button-quiet" onClick={() => setOrder([])} disabled={!order.length}>Clear</button>
        <button className="button button-primary" onClick={save} disabled={!order.length}>Save round</button></>}>
      <p className="modal-help" style={{ marginTop: 0 }}>Tap {game.kind === 'teams' ? 'the teams' : 'the players'} in finishing order: the winner first. Use <b>Tie</b> to share a place with the one above. You don't have to place everyone; anyone left out gets no points this round.</p>
      <div className="round-pick">
        {entries.filter(e => !placed.has(e.key)).map(e => (
          <button type="button" key={e.key} className="button button-soft button-small" onClick={() => setOrder([...order, { key: e.key, tie: false }])}>{e.label}</button>
        ))}
        {entries.every(e => placed.has(e.key)) && <span className="muted text-sm">Everyone is placed.</span>}
      </div>
      {order.map((o, i) => (
        <div className="setting-line" key={o.key}>
          <div><b>{placeLabel(places.get(o.key) ?? 0)} · {label(o.key)}</b></div>
          <span style={{ display: 'flex', gap: 8 }}>
            {i > 0 && <button type="button" className={`panel-chip ${o.tie ? '' : 'off'}`} aria-pressed={o.tie}
              onClick={() => setOrder(order.map((x, j) => (j === i ? { ...x, tie: !x.tie } : x)))}>Tie <Icon name="check" /></button>}
            <button type="button" className="icon-btn compact" aria-label={`Remove ${label(o.key)}`} onClick={() => setOrder(order.filter((_, j) => j !== i))}><Icon name="x" /></button>
          </span>
        </div>
      ))}
    </Modal>
  );
}

function TeamsModal({ game, snapshot, onClose }: { game: TournamentGameInfo; snapshot: LiveSnapshot; onClose: () => void }) {
  const run = useAction();
  const [teams, setTeams] = useState<TournamentTeam[]>(game.teams.length >= 2 ? game.teams : [{ name: 'Team 1', playerIds: [] }, { name: 'Team 2', playerIds: [] }]);
  const teamOf = (id: string) => teams.findIndex(t => t.playerIds.includes(id));
  const assign = (id: string, index: number) => setTeams(teams.map((t, i) => ({
    ...t, playerIds: i === index ? [...t.playerIds.filter(p => p !== id), id] : t.playerIds.filter(p => p !== id),
  })));
  const save = () => void run(() => api(`/api/admin/tournament/games/${game.id}`, 'PATCH', { teams }), 'Teams saved.').then(ok => ok && onClose());
  return (
    <Modal title={`${game.name}: teams`} label="TEAM GAME" onClose={onClose}
      footer={<button className="button button-primary" onClick={save}>Save teams</button>}>
      <p className="modal-help" style={{ marginTop: 0 }}>Everyone in a team gets the team's place. You can change the teams between rounds.</p>
      {teams.map((team, i) => (
        <div className="modal-field" key={i}>
          <label htmlFor={`team-${i}`}>Team {i + 1}</label>
          <span style={{ display: 'flex', gap: 8 }}>
            <input id={`team-${i}`} value={team.name} maxLength={24} onChange={e => setTeams(teams.map((t, j) => (j === i ? { ...t, name: e.target.value } : t)))} />
            {teams.length > 2 && <button type="button" className="icon-btn compact" aria-label={`Remove ${team.name}`} onClick={() => setTeams(teams.filter((_, j) => j !== i))}><Icon name="x" /></button>}
          </span>
        </div>
      ))}
      {teams.length < 8 && <button type="button" className="text-button" onClick={() => setTeams([...teams, { name: `Team ${teams.length + 1}`, playerIds: [] }])}><Icon name="plus" /> Add a team</button>}
      {snapshot.players.map(p => (
        <div className="setting-line" key={p.id}>
          <div><b>{p.nickname}</b></div>
          <select aria-label={`${p.nickname}'s team`} value={teamOf(p.id)} onChange={e => assign(p.id, Number(e.target.value))}>
            <option value={-1}>Not in a team</option>
            {teams.map((t, i) => <option key={i} value={i}>{t.name || `Team ${i + 1}`}</option>)}
          </select>
        </div>
      ))}
    </Modal>
  );
}

function BingoModal({ game, onClose }: { game: TournamentGameInfo; onClose: () => void }) {
  const run = useAction();
  const bingo = game.bingo!;
  const [text, setText] = useState(bingo.ideas.join('\n'));
  const [minutes, setMinutes] = useState(bingo.minutes);
  const [points, setPoints] = useState(bingo.points);
  const ideas = [...new Set(text.split('\n').map(l => l.trim()).filter(Boolean))];
  const needed = bingo.size ** 2;
  const tooLong = ideas.filter(i => i.length > 60);
  const save = () => void run(() => api(`/api/admin/tournament/games/${game.id}`, 'PATCH', { bingo: { ideas, minutes, points } }), 'Bingo saved.')
    .then(ok => ok && onClose());
  const number = (key: keyof typeof points, label: string) => (
    <div className="modal-field"><label htmlFor={`bingo-${key}`}>{label}</label>
      <input id={`bingo-${key}`} type="number" min={0} max={100} value={points[key]} onChange={e => setPoints({ ...points, [key]: Number(e.target.value) })} /></div>
  );
  return (
    <Modal title={`${game.name}: bingo`} label="BINGO CARDS" onClose={onClose}
      footer={<button className="button button-primary" onClick={save} disabled={tooLong.length > 0}>Save bingo</button>}>
      <p className="modal-help" style={{ marginTop: 0 }}>One idea per line. Each player gets {needed} of them, picked at random, when the game starts. Write more than {needed} so every card is different.</p>
      <div className="modal-field"><label htmlFor="bingo-ideas">Ideas <small>({ideas.length}{ideas.length < needed ? `, at least ${needed} needed` : ''})</small></label>
        <textarea id="bingo-ideas" rows={10} value={text} onChange={e => setText(e.target.value)}
          placeholder={'Get a Steam achievement\nBuild a house\nEarn 1,000,000 dollars\nPet a dog'} />
        {tooLong.length > 0 && <small className="form-error">Keep each idea under 60 characters: "{tooLong[0]!.slice(0, 30)}…"</small>}</div>
      <div className="modal-field"><label htmlFor="bingo-minutes">Time limit (minutes)</label>
        <input id="bingo-minutes" type="number" min={5} max={360} value={minutes} onChange={e => setMinutes(Number(e.target.value))} /></div>
      <p className="modal-help">The card score ranks the players; the ranking gives the normal tournament points, so bingo weighs the same as any other game.</p>
      <div className="tournament-points-fields">
        {number('square', 'Per square')}{number('line', 'Per line')}{number('full', 'Full card')}
      </div>
    </Modal>
  );
}

function CardsModal({ game, nick, now, onClose }: { game: TournamentGameInfo; nick: (id: string) => string; now: Date; onClose: () => void }) {
  const run = useAction();
  const bingo = game.bingo!;
  const ranked = [...bingo.cards].sort((a, b) => b.score - a.score);
  return (
    <Modal title={`${game.name}: all cards`} label={bingo.locked ? 'TIME IS UP' : `${timeLeft(bingo.endsAt, now)} LEFT`} onClose={onClose}>
      <p className="modal-help" style={{ marginTop: 0 }}>Click a ticked square to remove the tick, for example when someone claimed something they didn't do.</p>
      <div className="admin-bingo-cards">
        {ranked.map(card => (
          <div key={card.playerId}>
            <p><b>{nick(card.playerId)}</b> <small className="muted">{bingoSummary(card)}</small></p>
            <BingoGrid card={card} size={bingo.size} onSquare={(square, ticked) => {
              if (!ticked) void run(() => api(`/api/admin/tournament/games/${game.id}/bingo/${card.playerId}/${square}`, 'DELETE'), `Tick removed from ${nick(card.playerId)}'s card.`);
            }} />
          </div>
        ))}
      </div>
    </Modal>
  );
}
