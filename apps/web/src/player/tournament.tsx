// The tournament on the player dashboard: standings, the lineup, and your own bingo card.
import {
  TOURNAMENT_KIND_LABELS,
  type BingoCardInfo, type BingoInfo, type LiveSnapshot, type MeInfo, type TournamentGameInfo, type TournamentInfo,
} from '@lan-os/shared';
import { api } from '../live.ts';
import { Avatar, useAction } from '../ui/common.tsx';
import { Icon } from '../ui/Icon.tsx';

/** "12:04" or "1:02:09" until the bingo time runs out. */
export function timeLeft(endsAt: string | null, now: Date): string {
  const seconds = endsAt ? Math.max(0, Math.ceil((Date.parse(endsAt) - now.getTime()) / 1000)) : 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export const placeLabel = (place: number) => `${place}${place % 10 === 1 && place !== 11 ? 'st' : place % 10 === 2 && place !== 12 ? 'nd' : place % 10 === 3 && place !== 13 ? 'rd' : 'th'}`;

export const liveGame = (t: TournamentInfo) => t.games.find(g => g.state === 'live') ?? null;

/** A bingo card. Squares are buttons when `onSquare` is given. */
export function BingoGrid({ card, size, onSquare, disabled }:
  { card: BingoCardInfo; size: number; onSquare?: (square: number, ticked: boolean) => void; disabled?: boolean }) {
  const ticked = new Set(card.ticked);
  return (
    <div className="bingo-grid" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
      {card.squares.map((text, i) => {
        const on = ticked.has(i);
        return onSquare
          ? <button type="button" key={i} className={`bingo-square ${on ? 'ticked' : ''}`} aria-pressed={on} disabled={disabled}
            onClick={() => onSquare(i, !on)}>{on && <Icon name="check" className="bingo-check" />}<span>{text}</span></button>
          : <div key={i} className={`bingo-square ${on ? 'ticked' : ''}`}>{on && <Icon name="check" className="bingo-check" />}<span>{text}</span></div>;
      })}
    </div>
  );
}

export function bingoSummary(card: BingoCardInfo) {
  return `${card.ticked.length} ticked · ${card.lines} line${card.lines === 1 ? '' : 's'}${card.full ? ' · full card' : ''} · ${card.score} pts`;
}

export function TournamentPanel({ snapshot, me, now }: { snapshot: LiveSnapshot; me: MeInfo; now: Date }) {
  const t = snapshot.tournament;
  if (!t || t.state === 'setup') return null;
  const live = liveGame(t);
  const player = (id: string) => snapshot.players.find(p => p.id === id);
  const winners = t.standings.filter(s => s.place === 1).map(s => player(s.playerId)?.nickname ?? s.playerId);
  return (
    <section className="card tournament-panel" id="tournament">
      <div className="section-header">
        <div><div className="section-overline">TOURNAMENT</div><h2>{t.name}</h2></div>
        <span className="tiny-pill accent-pill">{t.state === 'finished' ? 'FINAL' : live ? `LIVE · ${live.name.toUpperCase()}` : 'BETWEEN GAMES'}</span>
      </div>
      {t.state === 'finished' && <div className="fair-note"><Icon name="trophy" /> {winners.join(' & ')} won the tournament!</div>}
      {live?.kind === 'bingo' && live.bingo && <MyBingo game={live} bingo={live.bingo} me={me} now={now} />}
      <div className="tournament-columns">
        <div>
          <p className="side-label">STANDINGS</p>
          <table className="tournament-table">
            <tbody>
              {t.standings.map(s => {
                const p = player(s.playerId);
                return (
                  <tr key={s.playerId} className={s.playerId === me.id ? 'you' : ''}>
                    <td className="tournament-place">{s.place}</td>
                    <td><span className="people-name"><Avatar nickname={p?.nickname ?? s.playerId} tone={p?.tone ?? 0} url={p?.avatarUrl} />
                      <strong>{p?.nickname ?? s.playerId}</strong>{s.playerId === me.id && <span className="player-you">YOU</span>}</span></td>
                    <td className="tournament-delta">{s.liveScore !== null ? `${s.liveScore} in game` : s.lastGamePoints ? `+${s.lastGamePoints}` : ''}</td>
                    <td className="tournament-points">{s.points}<small> pts</small></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div>
          <p className="side-label">LINEUP</p>
          {t.games.map((g, i) => <LineupRow key={g.id} game={g} index={i} name={id => player(id)?.nickname ?? id} meId={me.id} />)}
        </div>
      </div>
    </section>
  );
}

function LineupRow({ game, index, name, meId }: { game: TournamentGameInfo; index: number; name: (id: string) => string; meId: string }) {
  const mine = game.results.find(r => r.playerId === meId);
  return (
    <div className={`lineup-row ${game.state}`}>
      <span className="lineup-number">{game.state === 'finished' ? <Icon name="check" /> : index + 1}</span>
      <div>
        <strong>{game.name}</strong>
        <small>{TOURNAMENT_KIND_LABELS[game.kind]}
          {game.state === 'live' && game.kind !== 'bingo' && ` · round ${game.rounds.length + 1}`}
          {game.state === 'finished' && ` · won by ${game.results.filter(r => r.place === 1).map(r => name(r.playerId)).join(' & ')}`}
          {mine && ` · you +${mine.points}`}</small>
        {game.state === 'live' && game.rounds.slice(-3).map(r => (
          <small key={r.id} className="lineup-round">Round {r.number}: {r.placings.map(p => `${placeLabel(p.place)} ${p.entries.map(e => e.label).join(' = ')}`).join(' · ')}</small>
        ))}
      </div>
      {game.state === 'live' && <span className="status-dot green" />}
    </div>
  );
}

function MyBingo({ game, bingo, me, now }: { game: TournamentGameInfo; bingo: BingoInfo; me: MeInfo; now: Date }) {
  const run = useAction();
  const card = bingo.cards.find(c => c.playerId === me.id);
  const locked = bingo.locked || (bingo.endsAt !== null && Date.parse(bingo.endsAt) <= now.getTime());
  return (
    <div className="my-bingo">
      <div className="my-bingo-head">
        <div><strong>{game.name}: your card</strong>
          <small>Tick a square as soon as you did it. {bingo.points.square} pt per square, {bingo.points.line} per line, {bingo.points.full} for a full card.</small></div>
        <span className={`bingo-timer ${locked ? 'over' : ''}`}><Icon name="clock" /> {locked ? 'Time is up' : timeLeft(bingo.endsAt, now)}</span>
      </div>
      {card ? <>
        <BingoGrid card={card} size={bingo.size} disabled={locked}
          onSquare={(square, ticked) => void run(() => api(`/api/tournament/bingo/${square}`, 'POST', { ticked }))} />
        <p className="muted text-sm">{bingoSummary(card)}</p>
      </> : <button className="button button-soft" disabled={locked}
        onClick={() => void run(() => api('/api/tournament/bingo/0', 'POST', { ticked: false }), 'Your card is ready.')}>Get my card</button>}
    </div>
  );
}
