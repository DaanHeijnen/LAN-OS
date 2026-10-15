// The wall while a tournament runs: the scoreboard (or every bingo card), the lineup, the podium
// at the end, and a small strip with what everyone is playing and what's on LAN Radio.
import {
  STATUS_DISPLAY, TOURNAMENT_KIND_LABELS,
  type BingoInfo, type LiveSnapshot, type PlayerCard, type TournamentGameInfo, type TournamentInfo,
} from '@lan-os/shared';
import { cardGame, initial } from '../format.ts';
import { AlbumArt } from '../player/panels.tsx';
import { liveGame, placeLabel, timeLeft } from '../player/tournament.tsx';

export function TournamentWall({ snapshot, tournament: t, now }: { snapshot: LiveSnapshot; tournament: TournamentInfo; now: Date }) {
  const player = (id: string) => snapshot.players.find(p => p.id === id);
  const live = liveGame(t);
  return (
    <main className="twall">
      {t.state === 'finished' ? <Podium t={t} player={player} />
        : live?.kind === 'bingo' && live.bingo ? <BingoBoard game={live} bingo={live.bingo} player={player} now={now} />
          : <div className="twall-body">
            <Scoreboard t={t} player={player} live={live} />
            <div className="twall-side">
              <LiveGameCard t={t} live={live} />
              <Lineup t={t} player={player} />
            </div>
          </div>}
      <RoomStrip snapshot={snapshot} />
    </main>
  );
}

type Lookup = (id: string) => PlayerCard | undefined;

function WallAvatar({ p, className = '' }: { p: PlayerCard | undefined; className?: string }) {
  const hidden = !p || p.status === 'hidden';
  return (
    <div className={`wall-avatar ${hidden ? 'private' : `tone-${p.tone}`} ${className}`}>
      {hidden ? '•' : p.avatarUrl ? <img src={p.avatarUrl} alt="" /> : initial(p.nickname)}
    </div>
  );
}

function Scoreboard({ t, player, live }: { t: TournamentInfo; player: Lookup; live: TournamentGameInfo | null }) {
  const played = t.games.filter(g => g.state === 'finished').length;
  return (
    <section className="wall-card twall-scores" aria-label="Tournament standings">
      <div className="wall-card-heading">
        <span className="overline">{t.name.toUpperCase()} <span className="overline-dot">·</span> STANDINGS</span>
        <span className="radio-count">{played} OF {t.games.length} GAMES PLAYED</span>
      </div>
      <div className="twall-rows" style={{ gridTemplateRows: `repeat(${Math.max(t.standings.length, 1)}, minmax(0, 1fr))` }}>
        {t.standings.map(s => {
          const p = player(s.playerId);
          return (
            <div className={`twall-row ${s.place === 1 && s.points > 0 ? 'leader' : ''}`} key={s.playerId}>
              <span className="twall-place">{s.place}</span>
              <WallAvatar p={p} />
              <span className="twall-name">{p?.nickname ?? s.playerId}
                {s.gameWins > 0 && <small>{s.gameWins} game{s.gameWins === 1 ? '' : 's'} won</small>}</span>
              <span className="twall-delta">{live && s.liveScore !== null ? <>{s.liveScore}<small> in {live.name}</small></>
                : s.lastGamePoints ? `+${s.lastGamePoints}` : ''}</span>
              <span className="twall-points">{s.points}<small> PTS</small></span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function LiveGameCard({ t, live }: { t: TournamentInfo; live: TournamentGameInfo | null }) {
  const next = t.games.find(g => g.state === 'upcoming');
  if (!live) {
    return (
      <div className="wall-card twall-live">
        <div className="wall-card-heading"><span className="overline">{t.games.some(g => g.state === 'finished') ? 'BETWEEN GAMES' : 'ABOUT TO START'}</span></div>
        <h2 className="twall-game-title">{next ? next.name : 'No game planned'}</h2>
        <p className="twall-soft">{next ? `Up next · ${TOURNAMENT_KIND_LABELS[next.kind]}` : 'The host adds the next game'}</p>
      </div>
    );
  }
  return (
    <div className="wall-card twall-live">
      <div className="wall-card-heading">
        <span className="overline">NOW PLAYING <span className="overline-dot">·</span> {TOURNAMENT_KIND_LABELS[live.kind].toUpperCase()}</span>
        <span className="wall-poll-live"><i /> ROUND {live.rounds.length + 1}</span>
      </div>
      <h2 className="twall-game-title">{live.name}</h2>
      {live.rounds.length === 0 && <p className="twall-soft">First round underway</p>}
      {live.rounds.slice(-3).reverse().map(r => (
        <div className="twall-round" key={r.id}>
          <b>R{r.number}</b>
          <span>{r.placings.slice(0, 3).map(p => `${placeLabel(p.place)} ${p.entries.map(e => e.label).join(' = ')}`).join('  ·  ')}</span>
        </div>
      ))}
    </div>
  );
}

function Lineup({ t, player }: { t: TournamentInfo; player: Lookup }) {
  return (
    <div className="wall-card twall-lineup">
      <div className="wall-card-heading"><span className="overline">LINEUP</span></div>
      {t.games.map((g, i) => {
        const winners = g.results.filter(r => r.place === 1).map(r => player(r.playerId)?.nickname ?? r.playerId);
        return (
          <div className={`twall-lineup-row ${g.state}`} key={g.id}>
            <span className="twall-lineup-mark">{g.state === 'finished' ? '✓' : g.state === 'live' ? '▶' : i + 1}</span>
            <b>{g.name}</b>
            <span>{g.state === 'finished' ? `🏆 ${winners.join(' & ')}` : g.state === 'live' ? 'LIVE' : TOURNAMENT_KIND_LABELS[g.kind]}</span>
          </div>
        );
      })}
    </div>
  );
}

function BingoBoard({ game, bingo, player, now }: { game: TournamentGameInfo; bingo: BingoInfo; player: Lookup; now: Date }) {
  const cards = [...bingo.cards].sort((a, b) => b.score - a.score);
  const columns = cards.length <= 4 ? cards.length || 1 : cards.length <= 8 ? 4 : Math.ceil(cards.length / 2);
  const locked = bingo.locked || (bingo.endsAt !== null && Date.parse(bingo.endsAt) <= now.getTime());
  return (
    <div className="twall-body">
      <section className="twall-bingo" aria-label="Bingo cards" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {cards.map((card, rank) => {
          const p = player(card.playerId);
          const ticked = new Set(card.ticked);
          return (
            <div className={`wall-card twall-card ${rank === 0 && card.score > 0 ? 'leader' : ''}`} key={card.playerId}>
              <div className="twall-card-head">
                <WallAvatar p={p} className="small" />
                <b>{p?.nickname ?? card.playerId}</b>
                <span>{card.score}</span>
              </div>
              <div className="twall-mini-grid" style={{ gridTemplateColumns: `repeat(${bingo.size}, 1fr)` }}>
                {card.squares.map((_, i) => <i key={i} className={ticked.has(i) ? 'on' : ''} />)}
              </div>
              <div className="twall-card-foot">{card.full ? 'FULL CARD' : `${card.ticked.length} ticked · ${card.lines} line${card.lines === 1 ? '' : 's'}`}</div>
            </div>
          );
        })}
      </section>
      <div className="twall-side">
        <div className="wall-card twall-live">
          <div className="wall-card-heading"><span className="overline">BINGO <span className="overline-dot">·</span> {game.name.toUpperCase()}</span></div>
          <div className={`twall-timer ${locked ? 'over' : ''}`}>{locked ? 'TIME IS UP' : timeLeft(bingo.endsAt, now)}</div>
          <p className="twall-soft">{bingo.points.square} per square · {bingo.points.line} per line · {bingo.points.full} for a full card</p>
        </div>
        <div className="wall-card twall-lineup">
          <div className="wall-card-heading"><span className="overline">JUST TICKED</span></div>
          {bingo.recentTicks.length === 0 && <p className="twall-soft">Tick squares on your dashboard</p>}
          {bingo.recentTicks.map(tick => (
            <div className="twall-tick" key={`${tick.playerId}-${tick.at}`}>
              <b>{player(tick.playerId)?.nickname ?? tick.playerId}</b><span>{tick.square}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Podium({ t, player }: { t: TournamentInfo; player: Lookup }) {
  const byPlace = (n: number) => t.standings.filter(s => s.place === n);
  // A tie on top can fill the second step; the podium shows the first three places that exist.
  const steps = [...new Set(t.standings.map(s => s.place))].slice(0, 3);
  const order = steps.length === 3 ? [steps[1]!, steps[0]!, steps[2]!] : steps.length === 2 ? [steps[1]!, steps[0]!] : steps;
  const rest = t.standings.filter(s => !steps.includes(s.place));
  return (
    <div className="twall-podium">
      <div className="overline">{t.name.toUpperCase()} <span className="overline-dot">·</span> FINAL RESULT</div>
      <div className="twall-steps">
        {order.map(place => (
          <div className={`twall-step place-${steps.indexOf(place) + 1}`} key={place}>
            <div className="twall-step-people">
              {byPlace(place).map(s => {
                const p = player(s.playerId);
                return <div key={s.playerId}><WallAvatar p={p} className="large" /><b>{p?.nickname ?? s.playerId}</b><span>{s.points} PTS</span></div>;
              })}
            </div>
            <div className="twall-step-block">{placeLabel(place).toUpperCase()}</div>
          </div>
        ))}
      </div>
      {rest.length > 0 && <div className="twall-rest">
        {rest.map(s => <span key={s.playerId}><b>{s.place}.</b> {player(s.playerId)?.nickname ?? s.playerId} · {s.points}</span>)}
      </div>}
    </div>
  );
}

function RoomStrip({ snapshot }: { snapshot: LiveSnapshot }) {
  const radio = snapshot.radio;
  const song = radio.status === 'ok' ? radio.now : null;
  return (
    <div className="twall-strip">
      <div className="twall-presence">
        {snapshot.players.filter(p => p.status !== 'offline').map(p => {
          const display = STATUS_DISPLAY[p.status];
          const game = cardGame(p);
          return (
            <span className={`twall-chip wall-status status-${p.status}`} key={p.id}>
              <b>{p.nickname}</b>
              <span className="twall-chip-line"><span className="status-shape">{display.icon}</span>
                <span className="status-label">{display.word}{game ? ` · ${game.name}` : ''}</span></span>
            </span>
          );
        })}
      </div>
      <div className="twall-radio">
        <AlbumArt className="twall-album" url={song?.albumArt ?? null} label={song?.artist ?? ''} />
        <div>
          <b>{song ? song.title : radio.status === 'ok' ? 'Nothing playing' : 'LAN Radio offline'}</b>
          <span>{song ? song.artist : ''}{radio.queue.length ? ` · next: ${radio.queue[0]!.title}${radio.queue.length > 1 ? ` +${radio.queue.length - 1}` : ''}` : ''}</span>
        </div>
      </div>
    </div>
  );
}
