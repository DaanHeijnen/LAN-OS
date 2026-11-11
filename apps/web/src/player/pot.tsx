// The game pot on the player dashboard: throw in a game you'd like to play. Before the tournament
// starts, an admin draws a few at random and they join the lineup.
import { useState } from 'react';
import type { GamePotEntry, GamePotInfo, LiveSnapshot, MeInfo, PotEntryState } from '@lan-os/shared';
import { api } from '../live.ts';
import { Modal, useAction } from '../ui/common.tsx';
import { Icon } from '../ui/Icon.tsx';

export const POT_STATE_LABELS: Record<PotEntryState, string> = {
  waiting: 'WAITING FOR APPROVAL', approved: 'IN THE POT', rejected: 'NOT ACCEPTED', drawn: 'DRAWN',
};

export const potPill = (pot: GamePotInfo) =>
  pot.entries.some(e => e.state === 'drawn') ? 'DRAWN' : pot.open ? 'OPEN' : 'CLOSED';

/** "Wildcard 1 · in the lineup" for a drawn game, otherwise the state. */
export function potEntryStatus(e: GamePotEntry): string {
  if (e.state === 'drawn') return e.drawOrder ? `WILDCARD ${e.drawOrder}` : 'DRAWN';
  return POT_STATE_LABELS[e.state];
}

export function GamePotPanel({ snapshot, me }: { snapshot: LiveSnapshot; me: MeInfo }) {
  const run = useAction();
  const [adding, setAdding] = useState(false);
  const pot = snapshot.gamePot;
  if (!pot.enabled) return null;
  const mine = pot.entries.filter(e => e.playerId === me.id && e.state !== 'rejected');
  const canAdd = pot.open && mine.length < pot.perPlayer && !snapshot.safety.submissionsDisabled;
  const drawn = pot.entries.filter(e => e.state === 'drawn').sort((a, b) => (a.drawOrder ?? 0) - (b.drawOrder ?? 0));
  return (
    <section className="card pot-panel" id="game-pot">
      <div className="section-header">
        <div><div className="section-overline">GAME POT</div><h2>Throw a game in the pot</h2></div>
        <span className={`tiny-pill ${pot.open ? 'accent-pill' : ''}`}>{potPill(pot)}</span>
      </div>
      {drawn.length > 0
        ? <div className="fair-note"><Icon name="trophy" /> Drawn for the tournament: {drawn.map(e => `${e.name} (${e.addedBy})`).join(' and ')}.</div>
        : <p className="muted text-sm pot-help">
          Add {pot.perPlayer === 1 ? 'one game' : `up to ${pot.perPlayer} games`} you'd like to play together.
          Before the tournament starts, {pot.drawCount === 1 ? 'one game is' : `${pot.drawCount} games are`} drawn at random
          and join the lineup. A good pot game is free, plays all of us in one match and shows a ranking at the end.
          {pot.needsApproval && ' The host approves each game first.'}
        </p>}
      <div className="pot-list">
        {pot.entries.length === 0 && <p className="muted text-sm">The pot is empty. Be the first to add a game.</p>}
        {pot.entries.map(e => (
          <div className={`pot-row ${e.state}`} key={e.id}>
            <span className="lineup-number">{e.state === 'drawn' ? <Icon name="trophy" /> : <Icon name="gamepad-2" />}</span>
            <div>
              <strong>{e.link ? <a href={e.link} target="_blank" rel="noreferrer">{e.name} <Icon name="external-link" size={12} /></a> : e.name}</strong>
              <small>{e.playerId === me.id ? 'Your pick' : `From ${e.addedBy}`}{e.how && ` · ${e.how}`}</small>
              {e.state === 'rejected' && <small className="pot-note">Not accepted{e.note ? `: ${e.note}` : ''}. You can add another game.</small>}
            </div>
            <span className="tiny-pill">{potEntryStatus(e)}</span>
            {e.playerId === me.id && e.state !== 'drawn' && <button className="icon-btn compact" title="Remove from the pot" aria-label={`Remove ${e.name} from the pot`}
              onClick={() => void run(() => api(`/api/pot/${e.id}`, 'DELETE'), `${e.name} is out of the pot.`)}><Icon name="trash" /></button>}
          </div>
        ))}
      </div>
      <div className="pot-actions">
        <button className="button button-primary button-small" disabled={!canAdd} onClick={() => setAdding(true)}
          title={!pot.open ? 'The pot is closed' : mine.length >= pot.perPlayer ? 'You already added your game' : snapshot.safety.submissionsDisabled ? 'The host paused new submissions' : undefined}>
          <Icon name="plus" /> Add a game</button>
        {!pot.open && drawn.length === 0 && <span className="muted text-sm">The pot is closed for new games.</span>}
        {pot.open && mine.length >= pot.perPlayer && <span className="muted text-sm">You're in. Remove your game to swap it.</span>}
      </div>
      {adding && <PotModal onClose={() => setAdding(false)} />}
    </section>
  );
}

function PotModal({ onClose }: { onClose: () => void }) {
  const run = useAction();
  const [name, setName] = useState('');
  const [link, setLink] = useState('');
  const [how, setHow] = useState('');
  const submit = () => void run(() => api('/api/pot', 'POST', { name, link, how }), `${name.trim()} is in the pot.`).then(ok => ok && onClose());
  return (
    <Modal title="Add a game to the pot" label="GAME POT" onClose={onClose}>
      <p className="modal-help" style={{ marginTop: 0, marginBottom: 18 }}>Pick something free that all of us can play in one match, with a ranking at the end. Everyone installs every pot game before the night.</p>
      <form onSubmit={e => { e.preventDefault(); submit(); }}>
        <div className="modal-field"><label htmlFor="pot-name">Game</label>
          <input id="pot-name" required maxLength={40} autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Krunker" /></div>
        <div className="modal-field"><label htmlFor="pot-link">Download or store link (optional)</label>
          <input id="pot-link" type="url" maxLength={200} value={link} onChange={e => setLink(e.target.value)} placeholder="https://" /></div>
        <div className="modal-field"><label htmlFor="pot-how">How a match works (optional)</label>
          <textarea id="pot-how" rows={2} maxLength={160} value={how} onChange={e => setHow(e.target.value)} placeholder="Free-for-all, 8 players, 5-minute rounds" /></div>
        <button className="button button-primary" style={{ width: '100%' }} type="submit" disabled={!name.trim()}><Icon name="plus" /> Throw it in</button>
      </form>
    </Modal>
  );
}
