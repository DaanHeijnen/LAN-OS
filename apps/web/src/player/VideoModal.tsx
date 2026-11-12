// Share a YouTube video to the projector, and see what plays now and what is waiting.
import { useState } from 'react';
import { formatDuration, type LiveSnapshot, type MeInfo } from '@lan-os/shared';
import { api } from '../live.ts';
import { Modal, useAction } from '../ui/common.tsx';
import { Icon } from '../ui/Icon.tsx';

export function VideoModal({ snapshot, me, onClose }: { snapshot: LiveSnapshot; me: MeInfo; onClose: () => void }) {
  const run = useAction();
  const [link, setLink] = useState('');
  const { videos } = snapshot;
  const share = () => void run(() => api('/api/videos', 'POST', { link }),
    videos.now ? 'Video added to the queue.' : 'Your video is on the projector.').then(ok => ok && onClose());

  return (
    <Modal title="Share a video" label="PROJECTOR" onClose={onClose}>
      <p className="modal-help" style={{ marginTop: 0, marginBottom: 18 }}>
        Paste a YouTube link. It takes over the whole projector while it plays, without sound, up to {formatDuration(videos.maxSeconds)}.
        Videos play one after another.
      </p>
      {!videos.enabled ? <p className="muted">Sharing videos is turned off by the host.</p> : (
        <form onSubmit={e => { e.preventDefault(); share(); }}>
          <div className="modal-field"><label htmlFor="video-link">YouTube link</label>
            <input id="video-link" type="text" inputMode="url" autoComplete="off" autoFocus maxLength={300} value={link}
              onChange={e => setLink(e.target.value)} placeholder="https://youtu.be/…" /></div>
          <button className="button button-primary" style={{ width: '100%' }} type="submit" disabled={!link.trim()}><Icon name="tv" /> Put it on the projector</button>
        </form>
      )}
      {(videos.now || videos.queue.length > 0) && (
        <div style={{ marginTop: 20 }}>
          {videos.now && (
            <div className="queue-row">
              <span className="queue-number">▶</span>
              <div><strong>{videos.now.title}</strong><small>On the projector now · shared by {videos.now.sharedBy}</small></div>
            </div>
          )}
          {videos.queue.map((v, i) => (
            <div className="queue-row" key={v.id}>
              <span className="queue-number">{i + 1}</span>
              <div><strong>{v.title}</strong><small>Waiting · shared by {v.sharedBy}</small></div>
              {(v.sharedById === me.id || me.isAdmin) && <button type="button" className="queue-remove" title="Remove this video"
                onClick={() => void run(() => api(`/api/videos/${v.id}`, 'DELETE'), 'Video removed.')}><Icon name="x" /></button>}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
