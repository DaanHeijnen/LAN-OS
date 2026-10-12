// The LAN clock: "Day 2 of 3", hours left, the date range on the wall header.
import type { EventInfo } from './live.ts';

const HOUR = 3_600_000;

export interface LanClock {
  phase: 'before' | 'live' | 'over';
  day: number;
  totalDays: number;
  hoursLeft: number;
  minutesLeft: number;
}

export function lanClock(event: EventInfo, now: Date): LanClock {
  const start = Date.parse(event.startsAt);
  const end = Date.parse(event.endsAt);
  const t = now.getTime();
  const totalDays = Math.max(1, Math.ceil((end - start) / (24 * HOUR)));
  const leftMs = Math.max(0, end - t);
  const base = { totalDays, hoursLeft: Math.floor(leftMs / HOUR), minutesLeft: Math.floor((leftMs % HOUR) / 60_000) };
  if (t < start) return { phase: 'before', day: 0, ...base };
  if (t >= end) return { phase: 'over', day: totalDays, ...base, hoursLeft: 0, minutesLeft: 0 };
  return { phase: 'live', day: Math.min(totalDays, Math.floor((t - start) / (24 * HOUR)) + 1), ...base };
}

const parts = (iso: string, timezone: string) => {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: 'short', day: 'numeric' })
    .formatToParts(new Date(iso));
  const get = (type: string) => p.find(x => x.type === type)?.value ?? '';
  return { day: get('day'), month: get('month').toUpperCase(), year: get('year') };
};

/** "NOV 19–22, 2026", or "NOV 30 – DEC 2, 2026" across months. */
export function eventDateRange(event: EventInfo): string {
  const a = parts(event.startsAt, event.timezone);
  const b = parts(event.endsAt, event.timezone);
  if (a.year !== b.year) return `${a.month} ${a.day}, ${a.year} – ${b.month} ${b.day}, ${b.year}`;
  if (a.month !== b.month) return `${a.month} ${a.day} – ${b.month} ${b.day}, ${b.year}`;
  return `${a.month} ${a.day}–${b.day}, ${a.year}`;
}

/** 24-hour "02:47" in the event timezone. */
export function clockTime(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
}

/** "Sat 21 Nov" style label in the event timezone. */
export function shortDate(iso: string, timezone: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, ...options }).format(new Date(iso));
}
