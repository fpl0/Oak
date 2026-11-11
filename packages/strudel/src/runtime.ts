// Shared internals of one adapter instance: what the editors, the pattern players and the playback
// functions need from the adapter. Not exported from the package.
import type { LintContext, LintResult, ToolEntry } from "@oak/content-kit";
import type { Vocabulary } from "./completion.ts";
import type { CoordinatorInternals } from "./coordinator.ts";
import type { LiveBudget } from "./lru.ts";
import type { MasterBusInternals } from "./master-bus.ts";
import type { EvalMutex } from "./mutex.ts";
import type { ScopeTapInternals } from "./scope-tap.ts";
import type { TransportInternals } from "./transport.ts";
import type { EditorHandle, PreloadReport, PreloadSpec, StrudelLog } from "./types.ts";

export interface Runtime {
  readonly ctx: AudioContext;
  readonly mutex: EvalMutex;
  readonly toolbox: readonly ToolEntry[];
  readonly vocabulary: Vocabulary;
  lint(code: string, ctx: LintContext): LintResult;
  /** Prebake (memoized, shared). */
  prebake(): Promise<void>;
  /** Resume the context and init audio; never memoizes a failure. */
  unlock(): Promise<boolean>;
  readonly unlocked: () => boolean;
  readonly coordinator: CoordinatorInternals;
  readonly transport: TransportInternals;
  readonly master: MasterBusInternals;
  readonly scope: ScopeTapInternals;
  readonly budget: LiveBudget<string>;
  readonly editors: Map<string, EditorHandle & { evict(): void }>;
  preload(spec: PreloadSpec): Promise<PreloadReport>;
  /** Warms exactly what a pattern triggers in `[from, to)`. */
  preloadPattern(
    pattern: { queryArc(b: number, e: number): Strudel.Hap[] },
    from: number,
    to: number,
  ): Promise<PreloadReport>;
  /** Records the sound a scheduler is about to trigger (names the soundfont skip message). */
  noteTrigger(value: unknown): void;
  emitLog(log: StrudelLog): void;
  readonly disposed: () => boolean;
  /** Calm highlighting in effect now (OakStrudelOptions.calmHighlight). */
  readonly calm: () => boolean;
  /** Apply the CodeMirror settings and the side-effect guards; once, before the first mirror. */
  beforeFirstMirror(): void;
  afterMirror(): void;
}

/** A window `addEventListener('message', …)` captured while a `repl()` is constructed (kabelsalat's leak). */
export type CapturedListener = [
  string,
  EventListenerOrEventListenerObject,
  boolean | AddEventListenerOptions | undefined,
];

/**
 * Runs `construct` while capturing every window `message` listener added meanwhile. `repl()` builds a
 * kabelsalat `SalatRepl` whose constructor adds one and never removes it (docs/spikes.md, s2 gotchas).
 */
export function captureMessageListeners<T>(construct: () => T): { value: T; captured: CapturedListener[] } {
  const captured: CapturedListener[] = [];
  const realAdd = window.addEventListener;
  window.addEventListener = function (
    this: Window,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) {
    if (type === "message" && listener) captured.push([type, listener, options]);
    return realAdd.call(window, type, listener as EventListenerOrEventListenerObject, options);
  } as typeof window.addEventListener;
  try {
    return { value: construct(), captured };
  } finally {
    window.addEventListener = realAdd;
  }
}

export function removeCaptured(captured: CapturedListener[]): void {
  for (const [type, listener, options] of captured.splice(0))
    window.removeEventListener(type, listener, options);
}
