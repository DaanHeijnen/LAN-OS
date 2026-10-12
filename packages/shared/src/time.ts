// Human-friendly time values used in the config files: "15s", "30m", "2h", "7d"
// and local date-times like "2026-11-19 19:00".

export const DURATION_PATTERN = /^(\d+)\s*(s|m|h|d)$/;
export const DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;

const UNIT_SECONDS = { s: 1, m: 60, h: 3600, d: 86400 } as const;

/** "15s" → 15, "30m" → 1800. Throws on anything else. */
export function durationToSeconds(text: string): number {
  const match = DURATION_PATTERN.exec(text.trim());
  if (!match) throw new Error(`Not a duration: ${text}`);
  return Number(match[1]) * UNIT_SECONDS[match[2] as keyof typeof UNIT_SECONDS];
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** How many ms the timezone is ahead of UTC at the given instant. */
function timezoneOffsetMs(instantMs: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instantMs));
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(instantMs / 1000) * 1000;
}

/** "2026-11-19 19:00" in "Europe/Amsterdam" → the matching UTC Date. */
export function localDateTimeToDate(text: string, timezone: string): Date {
  const match = DATE_TIME_PATTERN.exec(text.trim());
  if (!match) throw new Error(`Not a date-time: ${text}`);
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number];
  const wallClockAsUtc = Date.UTC(y, mo - 1, d, h, mi);
  // Two passes settle the offset, also around daylight-saving switches.
  let guess = wallClockAsUtc - timezoneOffsetMs(wallClockAsUtc, timezone);
  guess = wallClockAsUtc - timezoneOffsetMs(guess, timezone);
  return new Date(guess);
}

/** Checks that "2026-02-30 25:00" style mistakes are caught, not silently rolled over. */
export function isRealDateTime(text: string): boolean {
  const match = DATE_TIME_PATTERN.exec(text.trim());
  if (!match) return false;
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number];
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d
    && date.getUTCHours() === h && date.getUTCMinutes() === mi;
}

/** 8040 → "2h 14m", 180 → "3m", 40 → "0m". Used for session durations. */
export function formatDuration(totalSeconds: number): string {
  const minutes = Math.max(0, Math.floor(totalSeconds / 60));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return `${hours}h ${String(rest).padStart(2, '0')}m`;
}
