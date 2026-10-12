// Turns config/theme.yaml into CSS custom properties and checks colour contrast.
import type { ThemeConfig } from './config/schemas.ts';

type Palette = Record<string, string>;

export function dayPalette(theme: ThemeConfig): Palette {
  return { ...theme.surfaces, ...theme.text, ...theme.status, ...theme.accent };
}

export function nightPalette(theme: ThemeConfig): Palette {
  return { ...dayPalette(theme), ...theme.night_mode };
}

/** surface_wall → --surface-wall, status_in_game → --status-in-game, accent_main → --accent */
export function cssTokenName(key: string): string {
  if (key === 'accent_main') return '--accent';
  return `--${key.replaceAll('_', '-')}`;
}

const declarations = (palette: Palette) =>
  Object.entries(palette).map(([key, value]) => `  ${cssTokenName(key)}: ${value};`).join('\n');

export function themeToCss(theme: ThemeConfig): string {
  const t = theme.typography;
  const s = theme.spacing;
  const sizes: Array<[string, string, number]> = [
    ['clock', 'clock', t.size_clock],
    ['duration', 'duration', t.size_duration],
    ['headline', 'headline', t.size_headline],
    ['name', 'name', t.size_name],
    ['body', 'body', t.size_body],
    ['secondary', 'secondary', t.size_secondary],
    ['minimum', 'minimum', t.size_minimum],
  ];
  const lines = [
    declarations(dayPalette(theme)),
    `  --font-family: ${t.font_family};`,
    // --fs-* are the names in theme.yaml; --wall-* are the wall's names for the same values.
    ...sizes.map(([fs, wall, px]) => `  --fs-${fs}: ${px}px;\n  --wall-${wall}: ${px}px;`),
    `  --fw-bold: ${t.weight_bold};`,
    `  --space-frame: ${s.space_frame}px;`,
    `  --space-gap: ${s.space_gap}px;`,
    `  --space-list: ${s.space_list}px;`,
    `  --space-panel: ${s.space_panel}px;`,
    `  --radius-card: ${s.radius_card}px;`,
    `  --radius-group: ${s.radius_group}px;`,
    `  --radius-pill: ${s.radius_pill}px;`,
  ];
  return [
    '/* Generated from config/theme.yaml. Edit the YAML file; LAN OS picks up the change by itself. */',
    `:root {\n${lines.join('\n')}\n}`,
    `:root[data-theme="night"] {\n${declarations(nightPalette(theme))}\n}`,
    '',
  ].join('\n');
}

// --- Contrast (WCAG 2 relative luminance) ---

const channels = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const linear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => {
  const [r, g, b] = channels(hex).map(linear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export interface ContrastResult {
  mode: 'Day' | 'Night';
  pair: string;
  ratio: number;
  minimum: number;
  pass: boolean;
}

const STATUS_LABELS: Array<[string, string]> = [
  ['in_game', 'In game'], ['desktop', 'Desktop'], ['away', 'Away'],
  ['offline', 'Offline'], ['hidden', 'Hidden'], ['looking', 'Looking for players'],
];

/** Wall primary text must reach 7:1, all other text 4.5:1. Surfaces must stay distinguishable (1.3:1). */
export function checkContrast(theme: ThemeConfig): ContrastResult[] {
  const results: ContrastResult[] = [];
  const modes: Array<['Day' | 'Night', Palette]> = [['Day', dayPalette(theme)], ['Night', nightPalette(theme)]];
  for (const [mode, p] of modes) {
    const pairs: Array<[string, string, string, number]> = [
      ['Primary on wall', p.text_primary!, p.surface_wall!, 7],
      ['Primary on card', p.text_primary!, p.surface_card!, 7],
      ['Secondary on card', p.text_secondary!, p.surface_card!, 4.5],
      ['Quiet on card', p.text_quiet!, p.surface_card!, 4.5],
      ['Accent on card', p.accent_main!, p.surface_card!, 4.5],
      ['Wall/Card surfaces', p.surface_wall!, p.surface_card!, 1.3],
      ['Card/Raised surfaces', p.surface_card!, p.surface_raised!, 1.3],
      ...STATUS_LABELS.map(([key, label]): [string, string, string, number] =>
        [`Status ${label} on card`, p[`status_${key}`]!, p.surface_card!, 4.5]),
    ];
    for (const [pair, a, b, minimum] of pairs) {
      const ratio = contrastRatio(a, b);
      results.push({ mode, pair, ratio, minimum, pass: ratio >= minimum });
    }
  }
  return results;
}
