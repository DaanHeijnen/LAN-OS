// The game pot on the admin page: approve or reject games, open or close the pot, and draw the wildcards.
import { useState } from 'react';
import type { GamePotEntry, LiveSnapshot } from '@lan-os/shared';
import { api } from '../live.ts';
import { potEntryStatus, potPill } from '../player/pot.tsx';
import { Switch, useAction } from '../ui/common.tsx';
import { Icon } from '../ui/Icon.tsx';

export function GamePotCard({ snapshot }: { snapshot: LiveSnapshot }) {
  const run = useAction();
  const [sure, setSure] = useState(false);
  const pot = snapshot.gamePot;
  if (!pot.enabled) return null;
  const approved = pot.entries.filter(e => e.state === 'approved').length;
  const waiting = pot.entries.filter(e => e.state === 'waiting').length;
  const draw = () => void run(async () => {
    const result = await api<{ drawn: Array<{ name: string }> }>('/api/admin/pot/draw');
    setSure(false);
    return result;
  }, 'Drawn. The wildcards are on the wall and in the lineup.');
  return (
    <section className="card admin-polls-card" id="game-pot">
      <div className="section-header">
        <div><div className="section-overline">GAME POT</div><h2>Wildcards from the players</h2></div>
        <span className={`tiny-pill ${pot.open ? 'accent-pill' : ''}`}>{potPill(pot)}</span>
      </div>
      <div className="projector-controls">
        <div className="projector-control">
          <span className="control-name"><Icon name="gamepad-2" />Open for new games<small>Players add games on their dashboard. Closes by itself when you draw.</small></span>
          <Switch checked={pot.open} label="Open the game pot" onChange={open => void run(() => api('/api/admin/pot/state', 'POST', { open }), open ? 'The pot is open.' : 'The pot is closed.')} />
        </div>
      </div>
      {pot.entries.length === 0 && <p className="muted text-sm pot-help">No games yet. Players see the pot on their dashboard.</p>}
      <div className="pot-list">
        {pot.entries.map(e => <PotRow key={e.id} entry={e} />)}
      </div>
      <div className="pot-actions">
        {sure
          ? <>
            <button className="button button-primary button-small" onClick={draw}><Icon name="trophy" /> Yes, draw {pot.drawCount === 1 ? 'one game' : `${pot.drawCount} games`}</button>
            <button className="button button-quiet button-small" onClick={() => setSure(false)}>Not yet</button>
          </>
          : <button className="button button-primary button-small" disabled={pot.drawBlocked !== null} title={pot.drawBlocked ?? undefined}
            onClick={() => setSure(true)}><Icon name="trophy" /> Draw the wildcards</button>}
        <span className="muted text-sm">{pot.drawBlocked
          ?? `${approved} approved${waiting ? ` · ${waiting} waiting` : ''}. Draws ${Math.min(pot.drawCount, approved)} at random into the lineup and shows them on the wall.`}</span>
      </div>
    </section>
  );
}

function PotRow({ entry: e }: { entry: GamePotEntry }) {
  const run = useAction();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const path = `/api/admin/pot/${e.id}/review`;
  return (
    <div className={`pot-row ${e.state}`}>
      <span className="lineup-number">{e.state === 'drawn' ? <Icon name="trophy" /> : <Icon name="gamepad-2" />}</span>
      <div>
        <strong>{e.link ? <a href={e.link} target="_blank" rel="noreferrer">{e.name} <Icon name="external-link" size={12} /></a> : e.name}</strong>
        <small>From {e.addedBy}{e.how && ` · ${e.how}`}</small>
        {e.state === 'rejected' && e.note && <small className="pot-note">Rejected: {e.note}</small>}
      </div>
      <span className="tiny-pill">{potEntryStatus(e)}</span>
      {e.state !== 'drawn' && (rejecting
        ? <form className="pot-review" onSubmit={ev => { ev.preventDefault(); void run(() => api(path, 'POST', { action: 'reject', note }), `${e.name} rejected.`).then(ok => ok && setRejecting(false)); }}>
          <label className="sr-only" htmlFor={`pot-note-${e.id}`}>Reason</label>
          <input id={`pot-note-${e.id}`} maxLength={120} autoFocus value={note} onChange={ev => setNote(ev.target.value)} placeholder="Reason (optional)" />
          <button className="button button-warning button-small">Reject</button>
          <button type="button" className="button button-quiet button-small" onClick={() => setRejecting(false)}>Cancel</button>
        </form>
        : <span className="pot-review">
          {e.state !== 'approved' && <button className="button button-soft button-small" onClick={() => void run(() => api(path, 'POST', { action: 'approve' }), `${e.name} approved.`)}>Approve</button>}
          {e.state !== 'rejected' && <button className="button button-quiet button-small" onClick={() => setRejecting(true)}>Reject</button>}
          <button className="icon-btn compact" title="Remove from the pot" aria-label={`Remove ${e.name}`}
            onClick={() => void run(() => api(`/api/pot/${e.id}`, 'DELETE'), `${e.name} removed.`)}><Icon name="trash" /></button>
        </span>)}
    </div>
  );
}
