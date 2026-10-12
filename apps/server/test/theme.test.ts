import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { checkContrast, contrastRatio, themeSchema, themeToCss, type ThemeConfig } from '@lan-os/shared';


const themeFile = path.resolve(import.meta.dirname, '../../../config/theme.yaml');
const theme: ThemeConfig = themeSchema.parse(parse(fs.readFileSync(themeFile, 'utf8')));

describe('theme contrast', () => {
  it('computes WCAG ratios', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
  });

  it('config/theme.yaml passes every check, day and night', () => {
    const failures = checkContrast(theme).filter(r => !r.pass)
      .map(r => `${r.mode} / ${r.pair}: ${r.ratio.toFixed(2)} < ${r.minimum}`);
    expect(failures).toEqual([]);
  });

  it('holds wall primary text to 7:1 and other text to 4.5:1', () => {
    const results = checkContrast(theme);
    expect(results.find(r => r.mode === 'Day' && r.pair === 'Primary on wall')?.minimum).toBe(7);
    expect(results.find(r => r.mode === 'Night' && r.pair === 'Quiet on card')?.minimum).toBe(4.5);
  });

  it('catches a colour that is too dim', () => {
    const dim = { ...theme, text: { ...theme.text, text_quiet: '#3A4560' } };
    expect(checkContrast(dim).filter(r => !r.pass).map(r => r.pair)).toContain('Quiet on card');
  });
});

describe('theme CSS', () => {
  it('generates day and night tokens with the wall's token names', () => {
    const css = themeToCss(theme);
    expect(css).toContain('--surface-wall: #0A0F1A;');
    expect(css).toContain('--accent: #B9B3E6;');
    expect(css).toContain('--status-in-game: #70C49A;');
    expect(css).toContain('--fs-minimum: 22px;');
    expect(css).toContain('--wall-clock: 72px;');
    expect(css).toMatch(/:root\[data-theme="night"\] \{[^}]*--surface-wall: #08080A;/);
  });
});
