// Turns a zod validation error into one plain-English line per problem, for example:
//   config/music.yaml → skip_vote_threshold must be a number between 1 and 7 (you wrote "half")
import type { z } from 'zod';

const valueAt = (data: unknown, path: ReadonlyArray<PropertyKey>): unknown =>
  path.reduce<unknown>((node, key) =>
    node !== null && typeof node === 'object' ? (node as Record<PropertyKey, unknown>)[key] : undefined, data);

const describeValue = (value: unknown) => {
  if (value === null) return 'nothing';
  if (typeof value === 'object') return Array.isArray(value) ? 'a list' : 'a group of settings';
  return JSON.stringify(value);
};

/** players[2].role → "players → item 3 → role" */
const describePath = (path: ReadonlyArray<PropertyKey>) =>
  path.map(key => (typeof key === 'number' ? `item ${key + 1}` : String(key))).join(' → ');

export function friendlyConfigErrors(file: string, error: z.ZodError, raw: unknown): string[] {
  return error.issues.map(issue => {
    if (issue.code === 'unrecognized_keys') {
      const where = issue.path.length ? `${describePath(issue.path)} → ` : '';
      const names = issue.keys.map(k => `"${k}"`).join(', ');
      return `${file} → ${where}${names} ${issue.keys.length > 1 ? 'are not known settings' : 'is not a known setting'} (check the spelling, or remove it)`;
    }
    const setting = issue.path.length ? describePath(issue.path) : 'the file';
    const value = valueAt(raw, issue.path);
    if (value === undefined && issue.path.length) {
      return `${file} → ${setting} is missing (add it back; config/README.md shows the default)`;
    }
    if (!issue.path.length && (raw === null || typeof raw !== 'object' || Array.isArray(raw))) {
      return `${file} → the file must contain settings written as "name: value" lines`;
    }
    return `${file} → ${setting} ${issue.message} (you wrote ${describeValue(value)})`;
  });
}
