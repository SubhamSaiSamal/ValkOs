// Every colour in the machine resolves through a custom property defined here.
// No stylesheet is allowed a literal hex value - that rule is what lets the
// theme editor repaint everything live, open windows included.

import { syslog } from './bus';

// --- shape of a theme ---

export interface Palette {
  bg0: string; // desktop, behind everything
  bg1: string; // window bodies and panels
  bg2: string; // title bars, toolbars, table headers
  bg3: string; // hover and pressed
  fg: string;
  fgDim: string;
  fgBright: string;
  accent: string;
  accent2: string; // charts, links, selection
  warn: string;
  error: string;
  ok: string;
  border: string;
  borderActive: string; // focused window only
  selection: string;
}

// Everything here is 0..1.
export interface CrtParams {
  scanlines: number;
  curvature: number; // barrel distortion, applied by the gl pass
  aberration: number; // rgb separation at the edges
  bloom: number;
  flicker: number; // mains hum
  noise: number;
  vignette: number;
}

export interface Typography {
  family: string;
  size: number; // px at the root; everything downstream is em
  lineHeight: number;
  letterSpacing: number;
}

export interface Theme {
  id: string;
  name: string;
  blurb: string;
  palette: Palette;
  crt: CrtParams;
  type: Typography;
}

// --- colour maths ---

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return { r: 0, g: 0, b: 0 };
  return {
    r: Number.parseInt(h.slice(0, 2), 16),
    g: Number.parseInt(h.slice(2, 4), 16),
    b: Number.parseInt(h.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[r, g, b].map((n) => clamp(n).toString(16).padStart(2, '0')).join('')}`;
}

/** Linear blend between two hex colours. `t` of 0 returns `a`, 1 returns `b`. */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const k = Math.max(0, Math.min(1, t));
  return rgbToHex({
    r: x.r + (y.r - x.r) * k,
    g: x.g + (y.g - x.g) * k,
    b: x.b + (y.b - x.b) * k,
  });
}

export function lighten(hex: string, amount: number): string {
  return mix(hex, '#ffffff', amount);
}

export function darken(hex: string, amount: number): string {
  return mix(hex, '#000000', amount);
}

/** Returns an `rgba()` string, for shadows and overlays that need real alpha. */
export function alpha(hex: string, a: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a))})`;
}

function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

// WCAG contrast ratio. Used to warn about unreadable custom palettes, which is
// a real hazard when the whole interface is one hue.
export function contrastRatio(fg: string, bg: string): number {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const light = Math.max(a, b);
  const dark = Math.min(a, b);
  return (light + 0.05) / (dark + 0.05);
}

// --- presets ---

const MONO_STACK =
  '"Cascadia Mono", "JetBrains Mono", "Fira Code", "SF Mono", Consolas, "DejaVu Sans Mono", ui-monospace, monospace';

const BASE_TYPE: Typography = {
  family: MONO_STACK,
  size: 13,
  lineHeight: 1.5,
  letterSpacing: 0.2,
};

const BASE_CRT: CrtParams = {
  scanlines: 0.34,
  curvature: 0.16,
  aberration: 0.28,
  bloom: 0.45,
  flicker: 0.12,
  noise: 0.06,
  vignette: 0.42,
};

export const THEMES: Theme[] = [
  {
    id: 'phosphor',
    name: 'PHOSPHOR',
    blurb: 'P1 green on a cold tube. The house style.',
    palette: {
      bg0: '#050705',
      bg1: '#0a0f0c',
      bg2: '#101a14',
      bg3: '#16261d',
      fg: '#4dff9b',
      fgDim: '#1f7a4a',
      fgBright: '#c7ffe2',
      accent: '#4dff9b',
      accent2: '#5ad8ff',
      warn: '#ffb845',
      error: '#ff4d5e',
      ok: '#4dff9b',
      border: '#1a3527',
      borderActive: '#37d98a',
      selection: '#1c5c3c',
    },
    crt: { ...BASE_CRT },
    type: { ...BASE_TYPE },
  },
  {
    id: 'amber',
    name: 'AMBER',
    blurb: 'P3 amber. Warmer, slower, easier at 2am.',
    palette: {
      bg0: '#080602',
      bg1: '#100c05',
      bg2: '#1a1308',
      bg3: '#261c0d',
      fg: '#ffb845',
      fgDim: '#8a6220',
      fgBright: '#ffe4b0',
      accent: '#ffb845',
      accent2: '#ff7a45',
      warn: '#ffd76a',
      error: '#ff5c3d',
      ok: '#c8e05a',
      border: '#3a2a10',
      borderActive: '#e0a03a',
      selection: '#5c4118',
    },
    crt: { ...BASE_CRT, bloom: 0.55, scanlines: 0.38 },
    type: { ...BASE_TYPE },
  },
  {
    id: 'ice',
    name: 'ICE',
    blurb: 'Cold cyan. Highest legibility of the set.',
    palette: {
      bg0: '#03060a',
      bg1: '#070d14',
      bg2: '#0d1620',
      bg3: '#13202e',
      fg: '#7fd4ff',
      fgDim: '#3a6b8a',
      fgBright: '#d6f2ff',
      accent: '#5ad8ff',
      accent2: '#9d7bff',
      warn: '#ffcc55',
      error: '#ff6b8a',
      ok: '#5affc4',
      border: '#16293a',
      borderActive: '#4bb8e0',
      selection: '#1b435c',
    },
    crt: { ...BASE_CRT, curvature: 0.1, scanlines: 0.24, aberration: 0.18 },
    type: { ...BASE_TYPE },
  },
  {
    id: 'blood',
    name: 'BLOOD',
    blurb: 'Red room. Use when something is wrong.',
    palette: {
      bg0: '#0a0304',
      bg1: '#120608',
      bg2: '#1c0a0d',
      bg3: '#2a1013',
      fg: '#ff6b7d',
      fgDim: '#8a3040',
      fgBright: '#ffd2d8',
      accent: '#ff4d5e',
      accent2: '#ff9d45',
      warn: '#ffa845',
      error: '#ff2d44',
      ok: '#ff8f6b',
      border: '#3a1219',
      borderActive: '#e03a52',
      selection: '#5c1a26',
    },
    crt: { ...BASE_CRT, flicker: 0.2, noise: 0.1 },
    type: { ...BASE_TYPE },
  },
  {
    id: 'vapour',
    name: 'VAPOUR',
    blurb: 'Magenta and cyan. Loud on purpose.',
    palette: {
      bg0: '#0b0518',
      bg1: '#130a24',
      bg2: '#1d1035',
      bg3: '#2a1a48',
      fg: '#ff77e9',
      fgDim: '#7a3d8a',
      fgBright: '#ffd6f7',
      accent: '#ff4dd2',
      accent2: '#4de8ff',
      warn: '#ffd24d',
      error: '#ff4d6b',
      ok: '#4dffb8',
      border: '#331a4d',
      borderActive: '#d94dc4',
      selection: '#4a1f66',
    },
    crt: { ...BASE_CRT, bloom: 0.7, aberration: 0.45, vignette: 0.5 },
    type: { ...BASE_TYPE },
  },
  {
    id: 'paper',
    name: 'PAPER',
    blurb: 'Tube off. For reading long documents.',
    palette: {
      bg0: '#d8d5c8',
      bg1: '#e8e5d8',
      bg2: '#dedbcc',
      bg3: '#cfccbc',
      fg: '#22201a',
      fgDim: '#6b6759',
      fgBright: '#000000',
      accent: '#1a5c3a',
      accent2: '#1a4a7a',
      warn: '#8a5a00',
      error: '#9c1f2e',
      ok: '#1a5c3a',
      border: '#b8b4a4',
      borderActive: '#1a5c3a',
      selection: '#c2d6c8',
    },
    crt: { scanlines: 0, curvature: 0, aberration: 0, bloom: 0, flicker: 0, noise: 0.02, vignette: 0.1 },
    type: { ...BASE_TYPE, letterSpacing: 0 },
  },
];

const THEME_INDEX = new Map(THEMES.map((t) => [t.id, t]));

export const DEFAULT_THEME_ID: string = 'phosphor';

export function getTheme(id: string): Theme {
  return THEME_INDEX.get(id) ?? THEME_INDEX.get(DEFAULT_THEME_ID)!;
}

export function listThemes(): Theme[] {
  return THEMES.slice();
}

/** Deep copy, so the editor can mutate a preset without corrupting it. */
export function cloneTheme(theme: Theme, id: string, name: string): Theme {
  return {
    id,
    name,
    blurb: `Derived from ${theme.name}.`,
    palette: { ...theme.palette },
    crt: { ...theme.crt },
    type: { ...theme.type },
  };
}

// --- application ---

let activeTheme: Theme = getTheme(DEFAULT_THEME_ID);

export function currentTheme(): Theme {
  return activeTheme;
}

/**
 * Writes the theme into `:root`. Derived values (hover tints, glows, overlays)
 * are computed here rather than in CSS, so the arithmetic stays in one place.
 */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const p = theme.palette;
  const set = (key: string, value: string) => root.style.setProperty(key, value);

  for (const [key, value] of Object.entries(p)) {
    set(`--${kebab(key)}`, value);
  }

  // Derived surfaces.
  set('--bg-overlay', alpha(p.bg0, 0.82));
  set('--bg-scrim', alpha(p.bg0, 0.55));
  set('--border-soft', alpha(p.border, 0.6));
  set('--fg-ghost', alpha(p.fgDim, 0.45));
  set('--accent-soft', alpha(p.accent, 0.16));
  set('--accent-line', alpha(p.accent, 0.4));
  set('--error-soft', alpha(p.error, 0.18));
  set('--warn-soft', alpha(p.warn, 0.18));

  // Glow. Scaled by the bloom parameter so Settings can dial it out entirely.
  const glow = theme.crt.bloom;
  set('--glow-text', glow > 0.02 ? `0 0 ${(6 * glow).toFixed(1)}px ${alpha(p.accent, 0.5 * glow)}` : 'none');
  set('--glow-strong', glow > 0.02 ? `0 0 ${(14 * glow).toFixed(1)}px ${alpha(p.accent, 0.7 * glow)}` : 'none');
  set('--glow-border', glow > 0.02 ? `0 0 ${(10 * glow).toFixed(1)}px ${alpha(p.borderActive, 0.45 * glow)}` : 'none');
  set('--shadow-window', `0 18px 48px ${alpha('#000000', 0.55)}, 0 2px 0 ${alpha(p.border, 0.5)}`);

  // Typography.
  set('--font-mono', theme.type.family);
  set('--font-size', `${theme.type.size}px`);
  set('--line-height', String(theme.type.lineHeight));
  set('--letter-spacing', `${theme.type.letterSpacing}px`);

  // CRT knobs consumed by the overlay layers and the WebGL pass.
  set('--crt-scanlines', String(theme.crt.scanlines));
  set('--crt-curvature', String(theme.crt.curvature));
  set('--crt-aberration', String(theme.crt.aberration));
  set('--crt-bloom', String(theme.crt.bloom));
  set('--crt-flicker', String(theme.crt.flicker));
  set('--crt-noise', String(theme.crt.noise));
  set('--crt-vignette', String(theme.crt.vignette));

  root.dataset.theme = theme.id;
  root.dataset.tube = theme.crt.scanlines > 0.05 ? 'on' : 'off';

  activeTheme = theme;
  syslog.info('theme', `applied "${theme.name}"`);
}

function kebab(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

// --- serialisation ---

/** Round-trips a custom theme through the settings store. */
export function serializeTheme(theme: Theme): string {
  return JSON.stringify(theme);
}

export function deserializeTheme(json: string): Theme | null {
  try {
    const raw = JSON.parse(json) as Partial<Theme>;
    if (!raw || typeof raw.id !== 'string' || !raw.palette) return null;
    const base = getTheme(DEFAULT_THEME_ID);
    return {
      id: raw.id,
      name: raw.name ?? raw.id.toUpperCase(),
      blurb: raw.blurb ?? 'Custom theme.',
      palette: { ...base.palette, ...raw.palette },
      crt: { ...base.crt, ...(raw.crt ?? {}) },
      type: { ...base.type, ...(raw.type ?? {}) },
    };
  } catch (err) {
    syslog.error('theme', `could not parse stored theme: ${String(err)}`);
    return null;
  }
}

// Warns rather than blocks. An unreadable theme is the user's prerogative.
export function auditContrast(theme: Theme): Array<{ pair: string; ratio: number }> {
  const p = theme.palette;
  const checks: Array<[string, string, string]> = [
    ['fg on bg1', p.fg, p.bg1],
    ['fgDim on bg1', p.fgDim, p.bg1],
    ['fg on bg2', p.fg, p.bg2],
    ['accent on bg1', p.accent, p.bg1],
    ['error on bg1', p.error, p.bg1],
    ['warn on bg1', p.warn, p.bg1],
  ];

  const failures: Array<{ pair: string; ratio: number }> = [];
  for (const [label, fg, bg] of checks) {
    const ratio = contrastRatio(fg, bg);
    if (ratio < 4.5) failures.push({ pair: label, ratio: Math.round(ratio * 100) / 100 });
  }
  return failures;
}