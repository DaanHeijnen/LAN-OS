// Today's side quests and your achievements, on the player dashboard.
import type { LiveSnapshot, MeInfo } from '@lan-os/shared';
import { api } from '../live.ts';
import { useAction } from '../ui/common.tsx';
import { Icon } from '../ui/Icon.tsx';

export function SideQuestsPanel({ snapshot, me }: { snapshot: LiveSnapshot; me: MeInfo }) {
  const run = useAction();
  const { quests } = snapshot;
  if (!quests.enabled) return null;
  const done = quests.mine.filter(q => q.done).length;
  const leader = quests.board[0];
  return (
    <section className="card fun-card" id="side-quests">
      <div className="section-header">
        <div><div className="section-overline">SIDE QUESTS{quests.day ? ` · DAY ${quests.day}` : ''}</div><h2>Today's quests</h2></div>
        {quests.day > 0 && <span className="tiny-pill accent-pill">{done}/{quests.mine.length} DONE</span>}
      </div>
      <div className="fun-body">
        {quests.day === 0 ? <p className="muted text-sm">Your first quests appear when the LAN starts. A new set every LAN day.</p> : <>
          <p className="muted text-sm" style={{ marginTop: 0 }}>Tick them off yourself when you've done them. Every finished quest shows on the projector.</p>
          {quests.mine.map(q => (
            <label className={`quest-row ${q.done ? 'done' : ''}`} key={q.id}>
              <input type="checkbox" checked={q.done}
                onChange={e => void run(() => api(`/api/quests/${q.id}`, 'POST', { done: e.target.checked }), e.target.checked ? 'Quest done! 🎉' : undefined)} />
              <span>{q.text}</span>
              {q.done && <span className="quest-state"><Icon name="check" /> Done</span>}
            </label>
          ))}
          {leader && leader.done > 0 && (
            <div className="fun-board">
              <strong>Room progress</strong>
              {quests.board.filter(b => b.done > 0).map(b => (
                <span key={b.playerId} className={b.playerId === me.id ? 'me' : ''}>{b.player} {b.done}/{b.total}</span>
              ))}
            </div>
          )}
        </>}
      </div>
    </section>
  );
}

export function AchievementsPanel({ snapshot, me }: { snapshot: LiveSnapshot; me: MeInfo }) {
  const { achievements } = snapshot;
  if (!achievements.enabled) return null;
  const earned = achievements.mine.filter(a => a.earnedAt);
  return (
    <section className="card fun-card" id="achievements">
      <div className="section-header">
        <div><div className="section-overline">ACHIEVEMENTS</div><h2>Your badges</h2></div>
        <span className="tiny-pill">{earned.length}/{achievements.mine.length}</span>
      </div>
      <div className="fun-body">
        <div className="badge-grid">
          {achievements.mine.map(a => (
            <div key={a.id} className={`badge ${a.earnedAt ? 'earned' : 'locked'}`} title={a.description}>
              <span className="badge-emoji" aria-hidden="true">{a.emoji}</span>
              <span><b>{a.title}</b><small>{a.earnedAt ? a.detail : a.description}</small></span>
              <span className="badge-state">{a.earnedAt ? <><Icon name="check" /> Earned</> : 'Locked'}</span>
            </div>
          ))}
        </div>
        {achievements.board.length > 0 && (
          <div className="fun-board">
            <strong>Most badges</strong>
            {achievements.board.slice(0, 7).map(b => (
              <span key={b.playerId} className={b.playerId === me.id ? 'me' : ''}>{b.player} {b.count}</span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
