// Manifests are static so the launcher, taskbar, desktop icons and the shell's
// `open` builtin all read one list. Components register at runtime from
// apps/index.ts, so the kernel never imports an application.

import type { ComponentType } from 'react';

// --- types ---

export type AppCategory = 'system' | 'work' | 'study' | 'lab' | 'media';

export interface AppSize {
  w: number;
  h: number;
}

export interface AppManifest {
  id: string;
  name: string;
  glyph: string; // two or three characters, monospace, no images
  category: AppCategory;
  blurb: string;
  defaultSize: AppSize;
  minSize: AppSize;
  singleton: boolean; // relaunch focuses the existing window instead
  keywords: string[]; // so `sy` finds Synth and `revision` finds Recall
  onDesktop: boolean;
}

/** What the window manager hands every application component. */
export interface AppProps {
  pid: number;
  windowId: string;
  args: string[]; // e.g. `open editor /home/valk/notes/physics.md`
  focused: boolean;
  setTitle: (title: string) => void;
  close: () => void;
}

export type AppComponent = ComponentType<AppProps>;

// --- manifests ---

export const APPS: AppManifest[] = [
  {
    id: 'terminal',
    name: 'Terminal',
    glyph: '>_',
    category: 'system',
    blurb: 'A real shell over the virtual filesystem.',
    defaultSize: { w: 720, h: 440 },
    minSize: { w: 360, h: 200 },
    singleton: false,
    keywords: ['shell', 'console', 'sh', 'vsh', 'command', 'tty'],
    onDesktop: true,
  },
  {
    id: 'files',
    name: 'Files',
    glyph: '[]',
    category: 'system',
    blurb: 'Browse, preview, import and export the disk.',
    defaultSize: { w: 780, h: 500 },
    minSize: { w: 420, h: 260 },
    singleton: true,
    keywords: ['browser', 'explorer', 'disk', 'folder', 'directory'],
    onDesktop: true,
  },
  {
    id: 'editor',
    name: 'Editor',
    glyph: 'Ed',
    category: 'work',
    blurb: 'Text and code with hand-rolled highlighting.',
    defaultSize: { w: 820, h: 540 },
    minSize: { w: 400, h: 260 },
    singleton: false,
    keywords: ['text', 'code', 'write', 'vim', 'ide'],
    onDesktop: true,
  },
  {
    id: 'notes',
    name: 'Notes',
    glyph: 'No',
    category: 'study',
    blurb: 'Markdown with wikilinks and live render.',
    defaultSize: { w: 860, h: 560 },
    minSize: { w: 440, h: 300 },
    singleton: true,
    keywords: ['markdown', 'md', 'wiki', 'zettel', 'writing'],
    onDesktop: true,
  },
  {
    id: 'graph',
    name: 'Graph',
    glyph: '∴',
    category: 'study',
    blurb: 'Force-directed map of every linked note.',
    defaultSize: { w: 760, h: 560 },
    minSize: { w: 380, h: 300 },
    singleton: true,
    keywords: ['knowledge', 'network', 'links', 'map', 'zettel'],
    onDesktop: true,
  },
  {
    id: 'recall',
    name: 'Recall',
    glyph: 'R↺',
    category: 'study',
    blurb: 'Spaced repetition scheduled by SM-2.',
    defaultSize: { w: 640, h: 480 },
    minSize: { w: 380, h: 320 },
    singleton: true,
    keywords: ['flashcards', 'anki', 'srs', 'revision', 'memory', 'cards'],
    onDesktop: true,
  },
  {
    id: 'calc',
    name: 'Calc',
    glyph: 'fx',
    category: 'study',
    blurb: 'Symbolic algebra and a function plotter.',
    defaultSize: { w: 800, h: 560 },
    minSize: { w: 420, h: 320 },
    singleton: false,
    keywords: ['math', 'graph', 'plot', 'cas', 'derivative', 'calculator'],
    onDesktop: true,
  },
  {
    id: 'physics',
    name: 'Physics',
    glyph: '◈',
    category: 'lab',
    blurb: 'Verlet sandbox: rope, cloth, soft bodies.',
    defaultSize: { w: 760, h: 560 },
    minSize: { w: 400, h: 320 },
    singleton: false,
    keywords: ['sim', 'simulation', 'sandbox', 'verlet', 'cloth', 'toy'],
    onDesktop: true,
  },
  {
    id: 'synth',
    name: 'Synth',
    glyph: '♪',
    category: 'media',
    blurb: 'Tracker, envelopes and an FFT scope.',
    defaultSize: { w: 820, h: 540 },
    minSize: { w: 460, h: 340 },
    singleton: true,
    keywords: ['audio', 'music', 'tracker', 'sound', 'sequencer', 'fft'],
    onDesktop: true,
  },
  {
    id: 'focus',
    name: 'Focus',
    glyph: '◷',
    category: 'study',
    blurb: 'Pomodoro timer with a session history.',
    defaultSize: { w: 560, h: 480 },
    minSize: { w: 340, h: 300 },
    singleton: true,
    keywords: ['pomodoro', 'timer', 'study', 'track', 'stats', 'clock'],
    onDesktop: true,
  },
  {
    id: 'monitor',
    name: 'Monitor',
    glyph: '▤',
    category: 'system',
    blurb: 'Processes, syslog and disk usage.',
    defaultSize: { w: 760, h: 480 },
    minSize: { w: 420, h: 280 },
    singleton: true,
    keywords: ['top', 'htop', 'ps', 'log', 'process', 'system', 'usage'],
    onDesktop: false,
  },
  {
    id: 'settings',
    name: 'Settings',
    glyph: '⚙',
    category: 'system',
    blurb: 'Themes, CRT knobs and system preferences.',
    defaultSize: { w: 720, h: 540 },
    minSize: { w: 420, h: 340 },
    singleton: true,
    keywords: ['prefs', 'preferences', 'theme', 'config', 'crt', 'appearance'],
    onDesktop: false,
  },
  {
    id: 'deck',
    name: 'Deck',
    glyph: '⌘',
    category: 'system',
    blurb: 'Bridge to the physical ValkDeck macropad.',
    defaultSize: { w: 640, h: 520 },
    minSize: { w: 400, h: 340 },
    singleton: true,
    keywords: ['hid', 'macropad', 'hardware', 'keys', 'encoder', 'valkdeck'],
    onDesktop: false,
  },
];

const BY_ID = new Map(APPS.map((a) => [a.id, a]));

export function getManifest(id: string): AppManifest | undefined {
  return BY_ID.get(id);
}

export function listApps(category?: AppCategory): AppManifest[] {
  const rows = category ? APPS.filter((a) => a.category === category) : APPS.slice();
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export function desktopApps(): AppManifest[] {
  return APPS.filter((a) => a.onDesktop);
}

export const CATEGORY_LABEL: Record<AppCategory, string> = {
  system: 'SYSTEM',
  work: 'WORK',
  study: 'STUDY',
  lab: 'LAB',
  media: 'MEDIA',
};

// --- component registration ---

const COMPONENTS = new Map<string, AppComponent>();

export function registerComponent(id: string, component: AppComponent): void {
  if (!BY_ID.has(id)) {
    throw new Error(`registerComponent: no manifest for app "${id}"`);
  }
  COMPONENTS.set(id, component);
}

export function getComponent(id: string): AppComponent | undefined {
  return COMPONENTS.get(id);
}

/** Manifested but not yet implemented. The launcher greys these out. */
export function unimplemented(): string[] {
  return APPS.filter((a) => !COMPONENTS.has(a.id)).map((a) => a.id);
}

// --- fuzzy search ---

export interface SearchHit {
  app: AppManifest;
  score: number;
  /** Indices in `app.name` that matched, for highlight rendering. */
  matches: number[];
}

/**
 * Subsequence match with positional bonuses: consecutive matches compound, a
 * word-boundary match beats a mid-word one, an exact prefix beats everything.
 *
 * Only has to rank thirteen items, so readability wins over cleverness.
 */
function fuzzyScore(needle: string, haystack: string): { score: number; matches: number[] } {
  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();
  if (n.length === 0) return { score: 0, matches: [] };
  if (h.startsWith(n)) {
    return { score: 1000 - h.length, matches: Array.from({ length: n.length }, (_, i) => i) };
  }

  const matches: number[] = [];
  let score = 0;
  let hi = 0;
  let streak = 0;

  for (let ni = 0; ni < n.length; ni += 1) {
    const ch = n[ni];
    let found = -1;
    while (hi < h.length) {
      if (h[hi] === ch) {
        found = hi;
        break;
      }
      hi += 1;
    }
    if (found === -1) return { score: -1, matches: [] };

    matches.push(found);
    streak = matches.length > 1 && found === matches[matches.length - 2] + 1 ? streak + 1 : 0;
    score += 10 + streak * 8;
    if (found === 0 || /[\s\-_/]/.test(h[found - 1] ?? '')) score += 14;
    score -= Math.min(found, 12) * 0.4;
    hi = found + 1;
  }

  return { score, matches };
}

/** Ranks applications against a launcher query. Empty query returns all. */
export function searchApps(query: string, limit = 12): SearchHit[] {
  const q = query.trim();
  if (!q) {
    return listApps()
      .slice(0, limit)
      .map((app) => ({ app, score: 0, matches: [] }));
  }

  const hits: SearchHit[] = [];

  for (const app of APPS) {
    const byName = fuzzyScore(q, app.name);
    const byId = fuzzyScore(q, app.id);

    let best = byName.score >= byId.score ? byName : { ...byId, matches: [] as number[] };

    // Keywords contribute but are worth less than the visible name.
    for (const kw of app.keywords) {
      const k = fuzzyScore(q, kw);
      if (k.score > 0 && k.score * 0.6 > best.score) {
        best = { score: k.score * 0.6, matches: [] };
      }
    }

    // The blurb is a last resort so `revision` still finds Recall.
    if (best.score <= 0 && app.blurb.toLowerCase().includes(q.toLowerCase())) {
      best = { score: 5, matches: [] };
    }

    if (best.score > 0) hits.push({ app, score: best.score, matches: best.matches });
  }

  return hits.sort((a, b) => b.score - a.score || a.app.name.localeCompare(b.app.name)).slice(0, limit);
}

/** Typed name to app id, tolerating case and partials. Used by `open`. */
export function resolveAppId(input: string): string | null {
  const raw = input.trim().toLowerCase();
  if (!raw) return null;
  if (BY_ID.has(raw)) return raw;

  const exactName = APPS.find((a) => a.name.toLowerCase() === raw);
  if (exactName) return exactName.id;

  const hits = searchApps(raw, 1);
  return hits.length && hits[0].score > 20 ? hits[0].app.id : null;
}