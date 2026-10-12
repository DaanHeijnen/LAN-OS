// Demo mode: a pretend Spotify with a small catalogue and a playback clock, so LAN Radio
// (search, fair queue, hand-over, skip votes, controls) works without an account.
import type { MusicService, Playback, Track } from '../radio/music.ts';

const t = (id: string, title: string, artist: string, seconds: number): Track =>
  ({ uri: `spotify:track:demo${id.padStart(18, '0')}`, title, artist, albumArt: null, durationMs: seconds * 1000 });

export const DEMO_CATALOGUE: Track[] = [
  t('1', 'Take On Me', 'a-ha', 225), t('2', 'Mr. Brightside', 'The Killers', 222), t('3', 'Africa', 'Toto', 295),
  t('4', 'Blinding Lights', 'The Weeknd', 200), t('5', 'Take Five', 'Dave Brubeck', 324),
  t('6', 'Everybody Wants to Rule the World', 'Tears for Fears', 251), t('7', 'Sweet Dreams (Are Made of This)', 'Eurythmics', 216),
  t('8', 'Get Lucky', 'Daft Punk', 248), t('9', 'Dreams', 'Fleetwood Mac', 257), t('10', 'Seven Nation Army', 'The White Stripes', 231),
  t('11', 'Bohemian Rhapsody', 'Queen', 354), t('12', 'Smells Like Teen Spirit', 'Nirvana', 301), t('13', 'Uptown Funk', 'Mark Ronson, Bruno Mars', 270),
  t('14', 'Levels', 'Avicii', 199), t('15', 'Sandstorm', 'Darude', 225), t('16', 'Still Alive', 'Jonathan Coulton', 176),
];
/** What plays when nobody has requested anything (the "normal playlist"). */
const FALLBACK = DEMO_CATALOGUE.slice(10);

export class FakeSpotify implements MusicService {
  private current: Track = DEMO_CATALOGUE[0]!;
  private startedAt = Date.now() - 134_000;
  private pausedAt: number | null = null;
  private queue: Track[] = [];
  private fallbackIndex = 0;
  private volume = 70;

  private settle(now = Date.now()) {
    while (this.pausedAt === null && now - this.startedAt >= this.current.durationMs) {
      const endedAt = this.startedAt + this.current.durationMs;
      this.current = this.queue.shift() ?? FALLBACK[this.fallbackIndex++ % FALLBACK.length]!;
      this.startedAt = endedAt;
    }
  }

  async account() { return { name: 'Demo host', premium: true }; }

  async search(query: string) {
    const q = query.toLowerCase();
    return DEMO_CATALOGUE.filter(x => `${x.title} ${x.artist}`.toLowerCase().includes(q)).slice(0, 10);
  }

  async track(uri: string) {
    return DEMO_CATALOGUE.find(x => x.uri === uri) ?? { ...DEMO_CATALOGUE[2]!, uri };
  }

  async playback(): Promise<Playback> {
    this.settle();
    const position = (this.pausedAt ?? Date.now()) - this.startedAt;
    return { track: this.current, positionMs: position, isPlaying: this.pausedAt === null, volume: this.volume, contextUri: null };
  }

  async addToQueue(uri: string) { this.queue.push(await this.track(uri)); }
  async playTrack(uri: string) { this.current = await this.track(uri); this.startedAt = Date.now(); this.pausedAt = null; }
  async playContext() { this.pausedAt = null; }
  async pause() { this.settle(); this.pausedAt ??= Date.now(); }
  async resume() {
    if (this.pausedAt !== null) this.startedAt += Date.now() - this.pausedAt;
    this.pausedAt = null;
  }
  async next() {
    this.settle();
    this.current = this.queue.shift() ?? FALLBACK[this.fallbackIndex++ % FALLBACK.length]!;
    this.startedAt = Date.now();
    if (this.pausedAt !== null) this.pausedAt = Date.now();
  }
  async setVolume(percent: number) { this.volume = percent; }
}
