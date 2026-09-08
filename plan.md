# VALKOS - Build Plan

> A cyberdeck operating system that boots in a browser tab.
> Fully offline. No backend. No cloud. One tab, one machine.

---

## 0. Premise

VALKOS is not a mockup of an OS. It is a small, real one:

- a **kernel** with a message bus, a process table, a syslog ring buffer and an uptime clock
- a **virtual filesystem** persisted to IndexedDB with real paths, modes and metadata
- a **window manager** with drag, resize, edge-snapping, workspaces and a focus stack
- a **shell** with a genuine tokenizer, parser, pipes, redirection and a scripting language
- **applications** that do actual work and read/write the same filesystem the shell does

Everything is hand-rolled below the React layer. No UI kit, no CSS framework,
no charting library, no math library, no editor library. That is the point.

---

## 1. Aesthetic contract

Phosphor-terminal cyberdeck. Locked at file one, honoured everywhere:

| Token | Value |
| --- | --- |
| Ground | `#050705` near-black with a faint green cast |
| Primary phosphor | `#4dff9b` |
| Dim phosphor | `#1f7a4a` |
| Amber (warn) | `#ffb845` |
| Blood (error) | `#ff4d5e` |
| Ice (accent) | `#5ad8ff` |
| Type | monospace only, everywhere, no exceptions |
| Chrome | 1px hairline borders, corner brackets, no rounding beyond 2px |
| Motion | fast, mechanical, no easing softer than `cubic-bezier(.2,.8,.2,1)` |
| Post-processing | scanlines, barrel distortion, chromatic aberration, bloom, flicker |

Every colour in the system resolves through a CSS custom property so the theme
editor can repaint the entire machine at runtime.

---

## 2. Module map

Flat. One directory for the machine, one for the applications, and that is it.

```
check-journal.mjs   count-lines.mjs        the two build tools

src/
  main.tsx  BootScreen.tsx  Console.tsx    entry, POST, userland root
  bus.ts  persist.ts  theme.ts             kernel
  boot.ts  registry.ts
  vfs.ts  seed.ts                          filesystem
  WindowManager.tsx  Window.tsx            window manager
  Taskbar.tsx  Desktop.tsx
  lexer.ts  parser.ts  interp.ts           shell
  builtins.ts
  crt.ts  audio.ts                         post-processing, audio
  core.css  windows.css  apps.css
  apps/                                    the thirteen applications
```

An earlier draft had seven directories under `src/` holding between one and
five files each, plus an empty `public/`. Six of them were empty the whole
time. Nesting that costs a click and buys nothing is worse than a long list.
`apps/` survives because thirteen files of one kind is the one grouping that
earns itself.

---

## 3. File schedule

Line counts are targets. Hours are honest estimates of how long a competent
solo developer would need to write, debug and finish that file by hand -
blended around 60-70 lines/hour for algorithmic code, 90-100 for React
surfaces, 170 for CSS, 190 for data and config.

### Phase 0 - Scaffold

| File | Lines | Hours |
| --- | ---: | ---: |
| `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore` | 130 | 1.0 |
| `check-journal.mjs` - enforces the 100-chars-per-hour journal rule | 210 | 2.0 |
| `count-lines.mjs` - line budget tracker | 140 | 1.5 |
| **Subtotal** | **480** | **4.5** |

### Phase 1 - Kernel

| File | Lines | Hours |
| --- | ---: | ---: |
| `src/bus.ts` - event bus, process table, syslog, scheduler | 420 | 6.0 |
| `src/persist.ts` - IndexedDB layer, stores, migrations | 370 | 5.0 |
| `src/theme.ts` - theme engine, six presets, CSS var injection | 440 | 4.5 |
| `src/boot.ts` - POST sequence, device enumeration, boot log | 390 | 4.0 |
| `src/registry.ts` - app manifests, launcher, fuzzy search | 330 | 3.5 |
| `src/core.css` - variables, reset, primitives, boot screen | 640 | 3.5 |
| `src/BootScreen.tsx` - POST renderer with typing effect | 310 | 3.5 |
| `src/main.tsx` - mount, boot orchestration, error boundary | 180 | 2.0 |
| **Subtotal** | **3,080** | **32.0** |

### Phase 2 - Filesystem

| File | Lines | Hours |
| --- | ---: | ---: |
| `src/vfs.ts` - nodes, paths, modes, read/write/stat/walk, watchers | 780 | 11.0 |
| `src/seed.ts` - the default disk image shipped with the machine | 400 | 2.5 |
| **Subtotal** | **1,180** | **13.5** |

### Phase 3 - Window manager

| File | Lines | Hours |
| --- | ---: | ---: |
| `src/WindowManager.tsx` - layout state, focus stack, workspaces | 640 | 8.0 |
| `src/Window.tsx` - chrome, drag, 8-way resize, snap, maximise | 580 | 7.5 |
| `src/Taskbar.tsx` - running list, workspace pips, tray, clock | 440 | 5.0 |
| `src/Desktop.tsx` - icons, context menu, launcher overlay | 400 | 4.5 |
| `src/windows.css` - window chrome, taskbar, desktop | 420 | 2.5 |
| **Subtotal** | **2,480** | **27.5** |

### Phase 4 - Shell

| File | Lines | Hours |
| --- | ---: | ---: |
| `src/lexer.ts` - tokenizer, quoting, escapes, expansion marks | 310 | 4.5 |
| `src/parser.ts` - pipelines, redirects, `if`/`for`/`while`, functions | 450 | 7.0 |
| `src/interp.ts` - executor, scopes, job control, `.vsh` scripts | 580 | 8.5 |
| `src/builtins.ts` - ~45 commands against the VFS | 880 | 11.0 |
| **Subtotal** | **2,220** | **31.0** |

### Phase 5 - Core applications

| File | Lines | Hours |
| --- | ---: | ---: |
| `src/apps/Terminal.tsx` - pty surface, history, completion, ANSI | 460 | 5.5 |
| `src/apps/Files.tsx` - browser, preview, import/export to real disk | 450 | 5.0 |
| `src/apps/Editor.tsx` - editor with hand-rolled syntax highlighting | 570 | 7.0 |
| `src/apps/Notes.tsx` - markdown + `[[wikilinks]]`, live render | 500 | 6.0 |
| `src/apps.css` - every application surface | 720 | 4.5 |
| **Subtotal** | **2,700** | **28.0** |

### Phase 6 - Study stack _(the part that is actually useful)_

| File | Lines | Hours |
| --- | ---: | ---: |
| `src/apps/GraphView.tsx` - force-directed knowledge graph on canvas | 540 | 8.0 |
| `src/apps/Recall.tsx` - SM-2 spaced repetition, card extraction | 600 | 8.0 |
| `src/apps/Calc.tsx` - CAS: lexer, Pratt parser, symbolic derivative, plotter | 840 | 13.0 |
| **Subtotal** | **1,980** | **29.0** |

> **Line budget crosses 11,000 here.** Everything past this point is surplus.

### Phase 7 - Sandbox applications

| File | Lines | Hours |
| --- | ---: | ---: |
| `src/apps/Physics.tsx` - verlet solver, constraints, cloth, soft bodies | 640 | 9.5 |
| `src/apps/Synth.tsx` - WebAudio tracker, envelopes, FFT scope | 680 | 10.0 |
| `src/apps/Focus.tsx` - pomodoro, session log, hand-drawn stat charts | 540 | 6.5 |
| **Subtotal** | **1,860** | **26.0** |

### Phase 8 - System surfaces and hardware

| File | Lines | Hours |
| --- | ---: | ---: |
| `src/apps/Settings.tsx` - theme editor, CRT sliders, system prefs | 500 | 6.0 |
| `src/apps/Monitor.tsx` - process table, syslog viewer, disk usage | 430 | 5.0 |
| `src/apps/Deck.tsx` - WebHID bridge to the physical ValkDeck macropad | 410 | 6.0 |
| `src/crt.ts` - WebGL post-processing pass | 420 | 7.0 |
| `src/audio.ts` - system beeps, key clicks, error tones | 260 | 3.0 |
| **Subtotal** | **2,020** | **27.0** |

---

## 4. Totals

| | Lines | Hours |
| --- | ---: | ---: |
| Phase 0 - Scaffold | 480 | 4.5 |
| Phase 1 - Kernel | 3,080 | 32.0 |
| Phase 2 - Filesystem | 1,180 | 13.5 |
| Phase 3 - Window manager | 2,480 | 27.5 |
| Phase 4 - Shell | 2,220 | 31.0 |
| Phase 5 - Core applications | 2,700 | 28.0 |
| Phase 6 - Study stack | 1,980 | 29.0 |
| Phase 7 - Sandbox applications | 1,860 | 26.0 |
| Phase 8 - System and hardware | 2,020 | 27.0 |
| **TOTAL** | **18,000** | **218.5** |

Target was ~11,000 lines. The plan overshoots because the machine only feels
real once the shell can actually drive the filesystem the apps are writing to,
and that floor is expensive. Phases 7 and 8 are cuttable without the system
losing coherence.

---

## 5. Rules of engagement

1. **No file below 300 lines.** Related concerns get co-located rather than
   scattered across a dozen 40-line modules.
2. **No network at runtime.** No fonts, no CDNs, no telemetry. The machine
   must boot on a plane.
3. **Every app reads and writes the same VFS.** Notes written in the editor
   are visible to `cat` in the terminal, and vice versa. This is the single
   detail that separates an OS from a set of tabs.
4. **Journal after every session**, at >= 100 characters per logged hour,
   verified by `npm run journal`.