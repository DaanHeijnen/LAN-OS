// Building blocks for config schemas. Every field carries one plain-English rule,
// which becomes the error message: "<file> → <setting> <rule> (you wrote <value>)".
import { z } from 'zod';
import { DATE_TIME_PATTERN, DURATION_PATTERN, durationToSeconds, isRealDateTime, isValidTimezone } from '../time.ts';

const rule = (message: string) => ({ error: message });

export const text = (message = 'must be some text between quotes') =>
  z.string(rule(message));

export const shortText = (max: number) => {
  const message = `must be text of 1 to ${max} characters`;
  return z.string(rule(message)).min(1, rule(message)).max(max, rule(message));
};

export const wholeNumber = (min: number, max: number) => {
  const message = `must be a whole number between ${min} and ${max}`;
  return z.number(rule(message)).int(rule(message)).min(min, rule(message)).max(max, rule(message));
};

export const onOff = () => z.boolean(rule('must be true or false'));

export const oneOf = <const T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values, rule(`must be one of: ${values.join(', ')}`));

export const listOf = <const T extends readonly [string, ...string[]]>(values: T) => {
  const message = `must be a list like [${values.join(', ')}], using only those words, each once`;
  return z.array(z.enum(values, rule(message)), rule(message))
    .refine(list => new Set(list).size === list.length, rule(message));
};

/** "15s", "30m", "2h", "7d" between two limits. */
export const duration = (min: string, max: string) => {
  const message = `must be a time from "${min}" to "${max}", written like "15s", "30m" or "2h"`;
  return z.string(rule(message))
    .regex(DURATION_PATTERN, rule(message))
    .refine(v => {
      const seconds = durationToSeconds(v);
      return seconds >= durationToSeconds(min) && seconds <= durationToSeconds(max);
    }, rule(message));
};

export const dateTime = () => {
  const message = 'must be a date and time written like "2026-11-19 19:00"';
  return z.string(rule(message)).regex(DATE_TIME_PATTERN, rule(message)).refine(isRealDateTime, rule(message));
};

export const timezone = () => {
  const message = 'must be a timezone name like "Europe/Amsterdam"';
  return z.string(rule(message)).refine(isValidTimezone, rule(message));
};

export const hexColour = () => {
  const message = 'must be a hex colour like "#1E2A43"';
  return z.string(rule(message)).regex(/^#[0-9A-Fa-f]{6}$/, rule(message));
};

/** Lowercase letters, numbers and dashes: "lan-2026", "mara". */
export const slug = () => {
  const message = 'must use only lowercase letters, numbers and dashes, like "lan-2026"';
  return z.string(rule(message)).regex(/^[a-z0-9][a-z0-9-]{0,39}$/, rule(message));
};

/** Settings group: unknown keys are reported, so typos never pass silently. */
export const section = <T extends z.ZodRawShape>(shape: T) => z.strictObject(shape);
