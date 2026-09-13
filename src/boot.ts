// Power-on self test. Every number it prints is probed from the real host -
// core count, device memory, screen geometry, gpu string, storage quota.
// Async generator so the renderer sets its own pace and can bail on a keypress.

import { syslog } from './bus';
import { storageReport } from './persist';

export type BootLineKind = 'plain' | 'ok' | 'fail' | 'warn' | 'head' | 'blank' | 'logo';

export interface BootLine {
  kind: BootLineKind;
  text: string;
  /** Right-aligned status tag, e.g. `OK` or `SKIP`. */
  tag?: string;
  /** Milliseconds to wait before emitting the next line. */
  delay: number;
}

export const BOOT_LOGO = [
  '   ██╗   ██╗ █████╗ ██╗     ██╗  ██╗ ██████╗ ███████╗',
  '   ██║   ██║██╔══██╗██║     ██║ ██╔╝██╔═══██╗██╔════╝',
  '   ██║   ██║███████║██║     █████╔╝ ██║   ██║███████╗',
  '   ╚██╗ ██╔╝██╔══██║██║     ██╔═██╗ ██║   ██║╚════██║',
  '    ╚████╔╝ ██║  ██║███████╗██║  ██╗╚██████╔╝███████║',
  '     ╚═══╝  ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝',
];

export const FIRMWARE_VERSION = '1.4.2';
export const KERNEL_VERSION = '0.1.0-cyberdeck';
export const BUILD_TAG = 'valk-rp2040-companion';

// --- host probing ---

export interface HostFacts {
  cores: number;
  memoryGb: number | null;
  screen: string;
  dpr: number;
  gpu: string;
  platform: string;
  language: string;
  timezone: string;
  hasHid: boolean;
  hasSerial: boolean;
  hasAudio: boolean;
  hasWebgl: boolean;
  online: boolean;
}

// Browsers increasingly mask the renderer string, so fall back rather than
// failing the probe outright.
function probeGpu(): { name: string; ok: boolean } {
  if (typeof document === 'undefined') return { name: 'none', ok: false };
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ??
      canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return { name: 'no accelerated context', ok: false };

    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const raw = dbg
      ? (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) as string)
      : (gl.getParameter(gl.RENDERER) as string);

    const name = (raw || 'generic raster').replace(/\s+/g, ' ').trim();
    return { name: name.length > 46 ? `${name.slice(0, 43)}...` : name, ok: true };
  } catch {
    return { name: 'probe failed', ok: false };
  }
}

// window.screen reports 0x0 in some embedded hosts, and printing that during
// POST reads as a hardware fault rather than a probe limitation.
function probeScreen(): string {
  if (typeof window === 'undefined') return 'headless';
  const sw = window.screen?.width ?? 0;
  const sh = window.screen?.height ?? 0;
  if (sw > 0 && sh > 0) return `${sw}x${sh}`;

  const vw = window.innerWidth || 0;
  const vh = window.innerHeight || 0;
  return vw > 0 && vh > 0 ? `${vw}x${vh} (viewport)` : 'undetected';
}

export function probeHost(): HostFacts {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const gpu = probeGpu();

  let timezone = 'UTC';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    /* Intl can be absent in exotic hosts */
  }

  const deviceMemory = (nav as unknown as { deviceMemory?: number })?.deviceMemory;

  return {
    cores: nav?.hardwareConcurrency ?? 1,
    memoryGb: typeof deviceMemory === 'number' ? deviceMemory : null,
    screen: probeScreen(),
    dpr: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
    gpu: gpu.name,
    platform: nav?.platform || 'unknown',
    language: nav?.language || 'en',
    timezone,
    hasHid: typeof nav !== 'undefined' && 'hid' in nav,
    hasSerial: typeof nav !== 'undefined' && 'serial' in nav,
    hasAudio: typeof window !== 'undefined' && 'AudioContext' in window,
    hasWebgl: gpu.ok,
    online: nav?.onLine ?? true,
  };
}

// --- line helpers ---

const line = (text: string, delay = 26): BootLine => ({ kind: 'plain', text, delay });
const ok = (text: string, delay = 34): BootLine => ({ kind: 'ok', text, tag: 'OK', delay });
const warn = (text: string, tag = 'WARN', delay = 40): BootLine => ({ kind: 'warn', text, tag, delay });
const fail = (text: string, delay = 60): BootLine => ({ kind: 'fail', text, tag: 'FAIL', delay });
const head = (text: string, delay = 60): BootLine => ({ kind: 'head', text, delay });
const blank = (delay = 18): BootLine => ({ kind: 'blank', text: '', delay });

function pad(label: string, value: string, width = 26): string {
  return `${label.padEnd(width, '.')} ${value}`;
}

// --- the sequence ---

export interface BootOptions {
  /** Skips the slow memory count and shortens every delay. */
  fast?: boolean;
  /** Prior boot count, printed in the banner. */
  bootNumber?: number;
}

/**
 * Yields the log one line at a time. The consumer honours `delay` itself, which
 * keeps timing policy in the renderer where the skip key can just stop awaiting.
 */
export async function* bootSequence(opts: BootOptions = {}): AsyncGenerator<BootLine> {
  const scale = opts.fast ? 0.15 : 1;
  const host = probeHost();
  const t0 = performance.now();

  const s = (l: BootLine): BootLine => ({ ...l, delay: Math.round(l.delay * scale) });

  for (const row of BOOT_LOGO) {
    yield s({ kind: 'logo', text: row, delay: 34 });
  }
  yield s(blank());
  yield s(line(`   VALK FIRMWARE ${FIRMWARE_VERSION}   ${BUILD_TAG}`, 40));
  yield s(line(`   (c) valk industries - all rights reserved to nobody`, 40));
  if (opts.bootNumber && opts.bootNumber > 1) {
    yield s(line(`   boot count ${opts.bootNumber}`, 30));
  }
  yield s(blank(80));

  // --- stage 1: processor ---

  yield s(head('POWER-ON SELF TEST'));
  yield s(line(pad('cpu cores', String(host.cores))));
  yield s(line(pad('platform', host.platform)));
  yield s(line(pad('locale', `${host.language} / ${host.timezone}`)));
  yield s(ok('processor identified'));

  // --- stage 2: memory ---

  const memGb = host.memoryGb ?? 4;
  const totalKb = memGb * 1024 * 1024;

  if (!opts.fast) {
    // Count memory in eight visible steps - the classic BIOS crawl.
    const steps = 8;
    for (let i = 1; i <= steps; i += 1) {
      const counted = Math.round((totalKb / steps) * i);
      yield {
        kind: 'plain',
        text: pad('memory test', `${counted.toLocaleString()} K`),
        delay: 55,
      };
    }
  } else {
    yield s(line(pad('memory test', `${totalKb.toLocaleString()} K`)));
  }

  if (host.memoryGb === null) {
    yield s(warn('device memory not reported - assuming 4G', 'ASSUMED'));
  } else {
    yield s(ok(`${memGb}G addressable`));
  }

  // --- stage 3: display ---

  yield s(blank());
  yield s(head('DISPLAY SUBSYSTEM'));
  yield s(line(pad('panel', `${host.screen} @ ${host.dpr.toFixed(2)}x`)));
  yield s(line(pad('renderer', host.gpu)));
  if (host.hasWebgl) {
    yield s(ok('accelerated context acquired'));
    yield s(ok('crt post-processing armed'));
  } else {
    yield s(warn('no webgl - falling back to css scanlines', 'DEGRADED'));
  }

  // --- stage 4: peripherals ---

  yield s(blank());
  yield s(head('PERIPHERAL ENUMERATION'));
  yield s(line(pad('hid bus', host.hasHid ? 'present' : 'absent')));
  if (host.hasHid) {
    yield s(ok('valkdeck bridge available'));
  } else {
    yield s(warn('webhid unsupported - macropad bridge offline', 'SKIP'));
  }
  yield s(line(pad('serial bus', host.hasSerial ? 'present' : 'absent')));
  yield s(line(pad('audio engine', host.hasAudio ? 'webaudio' : 'none')));
  if (host.hasAudio) yield s(ok('synthesiser core registered'));

  // --- stage 5: storage ---

  yield s(blank());
  yield s(head('STORAGE'));

  let report: Awaited<ReturnType<typeof storageReport>> | null = null;
  try {
    report = await storageReport();
  } catch (err) {
    syslog.error('boot', `storage probe failed: ${String(err)}`);
  }

  if (!report) {
    yield s(fail('storage subsystem unreachable'));
    yield s(warn('continuing with volatile memory only', 'VOLATILE'));
  } else if (report.volatile) {
    yield s(warn('no durable store - changes will not survive reload', 'VOLATILE'));
  } else {
    if (report.quotaBytes) {
      const quotaMb = Math.round(report.quotaBytes / 1024 / 1024);
      const usedMb = Math.round((report.usedBytes ?? 0) / 1024 / 1024);
      yield s(line(pad('quota', `${usedMb}M used of ${quotaMb}M`)));
    }
    yield s(line(pad('inodes', String(report.files))));
    yield s(ok('indexeddb mounted at /'));
  }

  // --- stage 6: kernel ---

  yield s(blank());
  yield s(head('KERNEL'));
  yield s(line(pad('version', KERNEL_VERSION)));
  yield s(ok('message bus initialised'));
  yield s(ok('process table initialised'));
  yield s(ok('syslog ring buffer 1024 entries'));
  yield s(ok('virtual filesystem checked'));
  yield s(ok('window manager loaded'));
  yield s(ok('shell interpreter registered'));
  yield s(ok('application registry populated'));

  if (!host.online) {
    yield s(line('network offline - which changes nothing, nothing here needs it'));
  }

  // --- stage 7: handoff ---

  const elapsed = Math.round(performance.now() - t0);
  yield s(blank());
  yield s(line(`post complete in ${elapsed}ms`, 60));
  yield s({ kind: 'ok', text: 'handing control to userland', tag: 'BOOT', delay: 260 });
  yield s(blank(120));

  syslog.info('boot', `POST completed in ${elapsed}ms`);
}

// --- motd ---

const MOTD_LINES = [
  'the machine is yours. break it freely.',
  'type `help` in a terminal to see what it can do.',
  'everything here works offline, on purpose.',
  'notes written in the editor are visible to `cat`.',
  'the encoder scrubs workspaces if a valkdeck is attached.',
  'ctrl+space opens the launcher from anywhere.',
  'nothing you write leaves this tab.',
  'the filesystem is real. the hardware is not.',
];

/** Deterministic, so it stays put across re-renders within a session. */
export function motd(seed = Date.now()): string {
  const day = Math.floor(seed / 86400000);
  return MOTD_LINES[day % MOTD_LINES.length];
}

/** What `uname -a` prints. */
export function unameString(host: HostFacts = probeHost()): string {
  return [
    'VALKOS',
    'valkdeck',
    KERNEL_VERSION,
    `#${FIRMWARE_VERSION}`,
    host.platform,
    `${host.cores}-core`,
    host.hasWebgl ? 'gl' : 'nogl',
  ].join(' ');
}