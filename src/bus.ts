// Kernel core: message bus, process table, syslog. These live together because
// splitting them just means three files importing each other in a circle.
// Nothing in here touches the DOM.

// --- types ---

export type Pid = number;

export type ProcState = 'starting' | 'running' | 'suspended' | 'zombie' | 'dead';

export interface ProcessRecord {
  pid: Pid;
  ppid: Pid;
  appId: string;
  title: string;
  state: ProcState;
  startedAt: number;
  cpuMs: number; // simulated, accumulated by the tick
  memKb: number; // simulated resident set
  load: number; // 0..1, resampled each tick
  meta: Record<string, unknown>;
}

export type SyslogLevel = 'debug' | 'info' | 'warn' | 'error' | 'panic';

export interface SyslogEntry {
  seq: number;
  at: number;
  level: SyslogLevel;
  facility: string;
  message: string;
}

export type BusHandler<T = unknown> = (payload: T, topic: string) => void;

interface Subscription {
  topic: string;
  segments: string[]; // pre-split so emit does not re-split every pattern
  handler: BusHandler<never>;
  once: boolean;
  id: number;
}

// --- event bus ---

/**
 * Dot-segmented topic bus. `*` matches one segment, `**` matches the tail:
 *
 *   bus.on('wm.window.focus', fn)   exact
 *   bus.on('wm.*.focus', fn)        any single segment in the middle
 *   bus.on('wm.**', fn)             everything under wm
 *
 * Handlers run synchronously in subscription order. One that throws is logged
 * and skipped - a crashing status bar clock must not take down the wm.
 */
export class EventBus {
  private subs: Subscription[] = [];
  private nextId = 1;
  private depth = 0;
  private readonly maxDepth = 32;

  on<T = unknown>(topic: string, handler: BusHandler<T>): () => void {
    return this.add(topic, handler as BusHandler<never>, false);
  }

  once<T = unknown>(topic: string, handler: BusHandler<T>): () => void {
    return this.add(topic, handler as BusHandler<never>, true);
  }

  private add(topic: string, handler: BusHandler<never>, once: boolean): () => void {
    const sub: Subscription = {
      topic,
      segments: topic.split('.'),
      handler,
      once,
      id: this.nextId++,
    };
    this.subs.push(sub);
    return () => this.offById(sub.id);
  }

  private offById(id: number): void {
    const idx = this.subs.findIndex((s) => s.id === id);
    if (idx >= 0) this.subs.splice(idx, 1);
  }

  off(topic: string, handler?: BusHandler<never>): void {
    this.subs = this.subs.filter((s) => {
      if (s.topic !== topic) return true;
      if (handler && s.handler !== handler) return true;
      return false;
    });
  }

  get subscriberCount(): number {
    return this.subs.length;
  }

  emit<T = unknown>(topic: string, payload?: T): number {
    if (this.depth >= this.maxDepth) {
      // Runaway emit chain. Drop it rather than blowing the JS stack.
      syslog.write('error', 'bus', `emit depth exceeded on "${topic}"`);
      return 0;
    }

    const segments = topic.split('.');
    const matched = this.subs.filter((s) => matchTopic(s.segments, segments));
    if (matched.length === 0) return 0;

    this.depth += 1;
    try {
      for (const sub of matched) {
        if (sub.once) this.offById(sub.id);
        try {
          (sub.handler as BusHandler<T>)(payload as T, topic);
        } catch (err) {
          syslog.write(
            'error',
            'bus',
            `handler for "${sub.topic}" threw: ${errorText(err)}`,
          );
        }
      }
    } finally {
      this.depth -= 1;
    }

    return matched.length;
  }

  /** Awaits the next payload on a topic, with an optional timeout in ms. */
  next<T = unknown>(topic: string, timeoutMs = 0): Promise<T> {
    return new Promise((resolve, reject) => {
      let timer: number | undefined;
      const stop = this.once<T>(topic, (payload) => {
        if (timer !== undefined) clearTimeout(timer);
        resolve(payload);
      });
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          stop();
          reject(new Error(`timed out waiting for "${topic}"`));
        }, timeoutMs) as unknown as number;
      }
    });
  }

  clear(): void {
    this.subs = [];
  }
}

function matchTopic(pattern: string[], topic: string[]): boolean {
  for (let i = 0; i < pattern.length; i += 1) {
    const p = pattern[i];
    if (p === '**') return true;
    if (i >= topic.length) return false;
    if (p === '*') continue;
    if (p !== topic[i]) return false;
  }
  return pattern.length === topic.length;
}

function errorText(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

// --- syslog ---

const SYSLOG_CAPACITY = 1024;

// Fixed-size ring buffer. Bounded so a long uptime cannot leak memory.
export class Syslog {
  private buffer: SyslogEntry[] = [];
  private seq = 0;
  private listeners = new Set<(e: SyslogEntry) => void>();
  mirrorToConsole = true; // boot screen turns this off while it owns the display

  write(level: SyslogLevel, facility: string, message: string): SyslogEntry {
    const entry: SyslogEntry = {
      seq: (this.seq += 1),
      at: Date.now(),
      level,
      facility,
      message,
    };

    this.buffer.push(entry);
    if (this.buffer.length > SYSLOG_CAPACITY) {
      this.buffer.splice(0, this.buffer.length - SYSLOG_CAPACITY);
    }

    for (const fn of this.listeners) {
      try {
        fn(entry);
      } catch {
        /* a listener that throws is not allowed to break logging */
      }
    }

    if (this.mirrorToConsole && (level === 'error' || level === 'panic')) {
      // eslint-disable-next-line no-console
      console.error(`[valkos:${facility}] ${message}`);
    }

    return entry;
  }

  debug(facility: string, message: string) { return this.write('debug', facility, message); }
  info(facility: string, message: string) { return this.write('info', facility, message); }
  warn(facility: string, message: string) { return this.write('warn', facility, message); }
  error(facility: string, message: string) { return this.write('error', facility, message); }

  subscribe(fn: (e: SyslogEntry) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Most recent entries first when `newestFirst`, optionally level-filtered. */
  tail(count = 100, level?: SyslogLevel, newestFirst = false): SyslogEntry[] {
    let rows = this.buffer;
    if (level) {
      const min = LEVEL_ORDER.indexOf(level);
      rows = rows.filter((e) => LEVEL_ORDER.indexOf(e.level) >= min);
    }
    const slice = rows.slice(Math.max(0, rows.length - count));
    return newestFirst ? slice.slice().reverse() : slice;
  }

  search(needle: string, limit = 200): SyslogEntry[] {
    const q = needle.toLowerCase();
    const out: SyslogEntry[] = [];
    for (let i = this.buffer.length - 1; i >= 0 && out.length < limit; i -= 1) {
      const e = this.buffer[i];
      if (e.message.toLowerCase().includes(q) || e.facility.includes(q)) out.push(e);
    }
    return out.reverse();
  }

  get size(): number {
    return this.buffer.length;
  }

  clear(): void {
    this.buffer = [];
  }
}

const LEVEL_ORDER: SyslogLevel[] = ['debug', 'info', 'warn', 'error', 'panic'];

export const syslog = new Syslog();

// --- process table ---

// Seeded per pid. Math.random gives jitter that reads as noise; a fixed seed
// per process gives each one a stable personality instead.
function xorshift(seed: number): () => number {
  let x = seed || 0x9e3779b9;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 100000) / 100000;
  };
}

export class ProcessTable {
  private procs = new Map<Pid, ProcessRecord>();
  private noise = new Map<Pid, () => number>();
  private nextPid: Pid = 100;

  constructor(private readonly bus: EventBus) {}

  spawn(appId: string, title: string, ppid: Pid = 1, meta: Record<string, unknown> = {}): ProcessRecord {
    const pid = (this.nextPid += 1);
    const proc: ProcessRecord = {
      pid,
      ppid,
      appId,
      title,
      state: 'starting',
      startedAt: Date.now(),
      cpuMs: 0,
      memKb: 1200 + Math.floor(Math.random() * 5600),
      load: 0,
      meta,
    };

    this.procs.set(pid, proc);
    this.noise.set(pid, xorshift(pid * 2654435761));
    syslog.info('proc', `spawned ${appId} as pid ${pid}`);
    this.bus.emit('proc.spawn', proc);

    // Let one frame elapse so a "starting" state is actually observable.
    queueMicrotask(() => this.setState(pid, 'running'));
    return proc;
  }

  setState(pid: Pid, state: ProcState): void {
    const proc = this.procs.get(pid);
    if (!proc || proc.state === state) return;
    proc.state = state;
    this.bus.emit('proc.state', { pid, state });
  }

  kill(pid: Pid, reason = 'terminated'): boolean {
    const proc = this.procs.get(pid);
    if (!proc) return false;

    // Reap children first so nothing is orphaned onto init.
    for (const child of this.children(pid)) this.kill(child.pid, 'parent exited');

    proc.state = 'dead';
    this.procs.delete(pid);
    this.noise.delete(pid);
    syslog.info('proc', `pid ${pid} (${proc.appId}) ${reason}`);
    this.bus.emit('proc.exit', { pid, appId: proc.appId, reason });
    return true;
  }

  get(pid: Pid): ProcessRecord | undefined {
    return this.procs.get(pid);
  }

  children(ppid: Pid): ProcessRecord[] {
    return [...this.procs.values()].filter((p) => p.ppid === ppid);
  }

  byApp(appId: string): ProcessRecord[] {
    return [...this.procs.values()].filter((p) => p.appId === appId);
  }

  list(): ProcessRecord[] {
    return [...this.procs.values()].sort((a, b) => a.pid - b.pid);
  }

  get count(): number {
    return this.procs.size;
  }

  // Driven by the kernel tick rather than a render loop, so the numbers keep
  // moving when nothing is on screen.
  tick(deltaMs: number): void {
    for (const proc of this.procs.values()) {
      if (proc.state !== 'running') {
        proc.load = Math.max(0, proc.load * 0.6);
        continue;
      }
      const rnd = this.noise.get(proc.pid) ?? (() => 0.1);
      const target = 0.02 + rnd() * 0.18;
      // Smooth toward the target so the monitor graph reads as a signal.
      proc.load = proc.load * 0.7 + target * 0.3;
      proc.cpuMs += deltaMs * proc.load;
      proc.memKb += Math.round((rnd() - 0.48) * 64);
      if (proc.memKb < 512) proc.memKb = 512;
    }
  }

  totalMemKb(): number {
    let sum = 0;
    for (const p of this.procs.values()) sum += p.memKb;
    return sum;
  }

  totalLoad(): number {
    let sum = 0;
    for (const p of this.procs.values()) sum += p.load;
    return Math.min(1, sum);
  }
}

// --- kernel ---

export interface KernelStats {
  uptimeMs: number;
  processes: number;
  memKb: number;
  load: number;
  logLines: number;
  subscriptions: number;
}

class Kernel {
  readonly bus = new EventBus();
  readonly log = syslog;
  readonly proc: ProcessTable;

  private bootedAt = 0;
  private timer: number | null = null;
  private lastTick = 0;
  panicked: string | null = null;

  constructor() {
    this.proc = new ProcessTable(this.bus);
  }

  /**
   * Marks the machine as up and starts the 1Hz accounting tick.
   *
   * Guarded on the timer rather than on `bootedAt`, so that start/stop/start
   * brings the tick back. Guarding on `bootedAt` looked equivalent and was not:
   * React's StrictMode mounts, unmounts and remounts in development, and the
   * second start became a no-op that left the machine permanently frozen with
   * a stopped clock and a static process table.
   */
  start(): void {
    if (this.timer !== null) return;

    if (!this.bootedAt) {
      this.bootedAt = Date.now();
      syslog.info('kernel', 'VALKOS kernel online');
    }
    this.lastTick = Date.now();

    this.timer = setInterval(() => {
      const now = Date.now();
      const delta = now - this.lastTick;
      this.lastTick = now;
      this.proc.tick(delta);
      this.bus.emit('kernel.tick', { now, delta });
    }, 1000) as unknown as number;
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  get uptimeMs(): number {
    return this.bootedAt ? Date.now() - this.bootedAt : 0;
  }

  stats(): KernelStats {
    return {
      uptimeMs: this.uptimeMs,
      processes: this.proc.count,
      memKb: this.proc.totalMemKb(),
      load: this.proc.totalLoad(),
      logLines: this.log.size,
      subscriptions: this.bus.subscriberCount,
    };
  }

  panic(facility: string, message: string): void {
    this.panicked = `${facility}: ${message}`;
    syslog.write('panic', facility, message);
    this.stop();
    this.bus.emit('kernel.panic', { facility, message });
  }
}

export const kernel = new Kernel();

/** Formats an uptime in ms as `2d 04:17:33`, the way `uptime(1)` would. */
export function formatUptime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const clock = [hours, mins, secs].map((n) => String(n).padStart(2, '0')).join(':');
  return days > 0 ? `${days}d ${clock}` : clock;
}

/** Kilobytes to a human string, e.g. `12.4M`. */
export function formatKb(kb: number): string {
  if (kb < 1024) return `${Math.round(kb)}K`;
  if (kb < 1024 * 1024) return `${(kb / 1024).toFixed(1)}M`;
  return `${(kb / 1024 / 1024).toFixed(2)}G`;
}