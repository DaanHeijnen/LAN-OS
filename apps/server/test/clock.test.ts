import { describe, expect, it } from 'vitest';
import { clockTime, eventDateRange, lanClock } from '@lan-os/shared';

// 19 Nov 2026 19:00 → 22 Nov 2026 15:00, Europe/Amsterdam (UTC+1 in November).
const event = { name: "LAN Weekend '26", startsAt: '2026-11-19T18:00:00.000Z', endsAt: '2026-11-22T14:00:00.000Z', timezone: 'Europe/Amsterdam' };

describe('LAN clock', () => {
  it('matches the design sample: Saturday 02:47 is Day 2 of 3 with 36h 13m left', () => {
    const now = new Date('2026-11-21T01:47:00Z');
    expect(lanClock(event, now)).toEqual({ phase: 'live', day: 2, totalDays: 3, hoursLeft: 36, minutesLeft: 13 });
    expect(clockTime(now, event.timezone)).toBe('02:47');
  });
  it('counts down to the start before the LAN', () => {
    expect(lanClock(event, new Date('2026-11-19T13:30:00Z'))).toMatchObject({ phase: 'before', hoursLeft: 4, minutesLeft: 30 });
  });
  it('stops at the end', () => {
    expect(lanClock(event, new Date('2026-11-23T00:00:00Z'))).toMatchObject({ phase: 'over', hoursLeft: 0 });
  });
  it('writes the date range like the wall header', () => {
    expect(eventDateRange(event)).toBe('NOV 19–22, 2026');
    expect(eventDateRange({ ...event, endsAt: '2026-12-01T14:00:00.000Z' })).toBe('NOV 19 – DEC 1, 2026');
  });
});
