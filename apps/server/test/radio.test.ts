import { describe, expect, it } from 'vitest';
import { fairOrder } from '../src/radio/fair-queue.ts';
import { playlistUriFromLink, trackUriFromLink } from '../src/radio/music.ts';

const at = (minute: number) => `2026-11-20T20:${String(minute).padStart(2, '0')}:00.000Z`;
let nextId = 1;
const req = (playerId: string, minute: number) => ({ id: nextId++, playerId, requestedAt: at(minute) });

describe('fair queue (DJ rotation)', () => {
  it('lets a new requester in after one song, not after a whole list', () => {
    const a1 = req('mara', 1), a2 = req('mara', 2), a3 = req('mara', 3), b1 = req('sam', 10);
    expect(fairOrder([a1, a2, a3, b1], new Map()).map(r => r.id)).toEqual([a1.id, b1.id, a2.id, a3.id]);
  });

  it('serves whoever waited longest since their last song first', () => {
    const a2 = req('mara', 5), b1 = req('sam', 6);
    // Mara's previous song was just played; Sam hasn't had a turn yet.
    expect(fairOrder([a2, b1], new Map([['mara', at(4)]])).map(r => r.playerId)).toEqual(['sam', 'mara']);
  });

  it('rotates through three requesters round by round', () => {
    const list = [req('a', 1), req('a', 2), req('b', 3), req('c', 4), req('b', 5), req('a', 6)];
    expect(fairOrder(list, new Map()).map(r => r.playerId)).toEqual(['a', 'b', 'c', 'a', 'b', 'a']);
  });

  it('is first come, first served when DJ rotation is off', () => {
    const list = [req('a', 1), req('a', 2), req('b', 3)];
    expect(fairOrder(list, new Map(), false).map(r => r.playerId)).toEqual(['a', 'a', 'b']);
  });
});

describe('Spotify links', () => {
  it('understands pasted track links', () => {
    expect(trackUriFromLink('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc')).toBe('spotify:track:4uLU6hMCjMI75M1A2tKUQC');
    expect(trackUriFromLink('https://open.spotify.com/intl-nl/track/4uLU6hMCjMI75M1A2tKUQC')).toBe('spotify:track:4uLU6hMCjMI75M1A2tKUQC');
    expect(trackUriFromLink('spotify:track:4uLU6hMCjMI75M1A2tKUQC')).toBe('spotify:track:4uLU6hMCjMI75M1A2tKUQC');
    expect(trackUriFromLink('never gonna give you up')).toBeNull();
  });
  it('understands playlist links for the fallback playlist', () => {
    expect(playlistUriFromLink('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')).toBe('spotify:playlist:37i9dQZF1DXcBWIGoYBM5M');
  });
});
