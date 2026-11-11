// Public types of @oak/strudel: the OakStrudel adapter. Browser only, one instance per page.
// It is the only place a StrudelMirror is constructed and the only module that knows the Strudel
// 1.2.6 API (`defaultOutput`; Strudel main renames it `onSchedule`).
import type { EditorView } from "@codemirror/view";
import type {
  BandId,
  CodeRange,
  FlavourId,
  KeySpec,
  LintContext,
  LintDiagnostic,
  LintResult,
  MeterId,
  ToolEntry,
  UnlockableId,
} from "@oak/content-kit";
import type { AudioPlan } from "@oak/drills";

export interface Readable<T> {
  get(): T;
  subscribe(cb: (value: T) => void): () => void;
}

export type AudioState = "locked" | "running" | "suspended" | "interrupted";

// --- editors ------------------------------------------------------------------------------------

export interface LessonCtx {
  key: KeySpec | null;
  meter: MeterId;
  /** Tempo used until the code's own `setcpm` line runs. */
  defaultBpm: number;
  loopBars: number;
}

/** One hap as the paint loop sees it, already JSON-safe and sorted by onset. */
export interface LiveHap {
  /** Label, '$0', 'main' or 'band.<label>'. */
  track: string;
  /** Cycles. */
  begin: number;
  end: number;
  value: Record<string, unknown>;
  /** Every contributing mini-notation atom, later-applied first: pick the right one for the view, not `[0]`. */
  locations: { start: number; end: number }[];
}
export interface PaintFrame {
  /** Haps inside the draw window, sorted by `begin`. */
  haps: LiveHap[];
  cycle: number;
  /** `cycle` minus scheduler latency, output latency and the learner's visual offset: what is heard now. */
  audibleCycle: number;
}
export interface EvalOutcome {
  ok: boolean;
  code: string;
  cps: number | null;
  /** Lint and evaluation findings; an error-severity finding means the code did not run. */
  diagnostics: LintDiagnostic[];
  lint: LintResult | null;
  /** [start, end] of every mini-notation atom, in source order. */
  miniLocations: [number, number][];
  /** Labels the evaluation registered, in source order. */
  tracks: string[];
  /** Oak panels the code asked for with `.scope()` and `.fscope()` (contracts §3.1 rule 9). Absent when none. */
  panels?: ScopePanel[];
}
export type ScopePanel = "scope" | "fscope";

/** UI mute and solo never rewrite code: they are a live filter in `beforeEval` (contracts §6.2 rule 3). */
export interface MuteMap {
  /** Labels muted by the mute buttons, Band tracks as `band.<label>`. */
  muted: ReadonlySet<string>;
  /** When set, every other label is muted. */
  solo: string | null;
}

export interface BandSetup {
  band: BandId;
  flavour: FlavourId;
  /** The Band's code for this flavour, with `{{key}}` and `{{bpm}}` already substituted. Read-only, strict-linted. */
  code: string;
  followsLearnerKey: boolean;
  tracks: ("drums" | "bass" | "chords")[];
}

/** Hooks into the CodeMirror 6 extensions Oak appends to every mirror. */
export interface EditorHooks {
  /** Completion items: only unlocked tools. Strudel's own autocompletion stays off. */
  completions?(
    prefix: string,
    ctx: { inString: boolean; callee: string | null },
  ): { label: string; detail?: string; apply?: string; toolId?: UnlockableId }[];
  /** The cursor or selection moved: feeds the highlight bus (code → roll, staff). */
  onCursor?(range: CodeRange): void;
  /** A click on a token in a click-code question. */
  onTokenClick?(range: CodeRange): void;
}

export interface EditorOptions {
  /** `oak_${slug}_${n}_`. MUST end with '_' (Strudel's cleanupDraw matches by prefix). */
  id: string;
  /** Clean code (markers stripped with `stripMarkers`). */
  initialCode: string;
  /** `true`: nothing is editable. Ranges: only these regions are (the ⟪⟫ regions of a starter). Default: all editable. */
  readOnly?: true | { editable: readonly CodeRange[] };
  lessonCtx: LessonCtx;
  /** How this editor's code is linted. `unlocked` inside it is replaced by `setUnlocked`. */
  lint: LintContext;
  band?: BandSetup | null;
  /** Cycles drawn around now. Default [-2, 2]. */
  drawWindow?: [number, number];
  hooks?: EditorHooks;
  onChange?(code: string): void;
  onEvaluated?(outcome: EvalOutcome): void;
  /** May fire `false` for an editor that was not playing (another editor started, or dispose): handlers must be idempotent. */
  onToggle?(playing: boolean): void;
  /** Every animation frame while playing. */
  onPaint?(frame: PaintFrame): void;
  /**
   * The live-mirror budget (`maxLiveEditors`) disposed this editor to make room. The adapter has already
   * replaced the mirror by a static `<pre class="oak-static-code">`; mount a new editor when it scrolls back.
   */
  onEvicted?(): void;
}

export interface EditorHandle {
  readonly id: string;
  readonly view: EditorView;
  readonly playing: boolean;
  readonly disposed: boolean;
  getCode(): string;
  setCode(code: string, opts?: { undoable?: boolean }): void;
  /**
   * Lint, then evaluate. Serialized through one mutex across all editors, which also covers the
   * mirror's own entry points (Ctrl-Enter, toggle, the repl-evaluate event). Never rejects for a
   * problem in the code: read `outcome.ok`.
   */
  evaluate(opts?: { autostart?: boolean }): Promise<EvalOutcome>;
  play(): Promise<EvalOutcome>;
  stop(): void;
  toggle(): Promise<void>;
  setDiagnostics(diagnostics: readonly LintDiagnostic[]): void;
  /** Select and scroll to ranges (roll or staff → code). */
  focusRanges(ranges: readonly CodeRange[]): void;
  /** Persistent marks, e.g. a hint's highlight or a diagnostic's place. */
  setMarks(marks: readonly { range: CodeRange; kind: "hint" | "error" | "target" | "ok" }[]): void;
  /** A transient highlight (roll or staff hover → code). Does not move the selection. Default 600 ms. */
  flashRanges(ranges: readonly CodeRange[], ms?: number): void;
  /** Sorted onset haps of the last evaluated pattern in `[from, to)` cycles, Band included (static views, tests). */
  queryHaps(from: number, to: number): LiveHap[];
  setEditable(readOnly: EditorOptions["readOnly"]): void;
  setUnlocked(unlocked: ReadonlySet<UnlockableId>): void;
  /** Takes effect on the playing pattern at once; no re-evaluation, the text is untouched. */
  setMutes(mutes: MuteMap): void;
  getMutes(): MuteMap;
  setBand(band: BandSetup | null): void;
  /** Complete teardown: scheduler, drawer, editor, DOM, inline styles, and the window listener kabelsalat leaks per mirror. */
  dispose(): void;
}

// --- transport ----------------------------------------------------------------------------------

export interface TransportState {
  activeEditorId: string | null;
  playing: boolean;
  cps: number;
  bpm: number;
}
/** The one clock. Views read it; nothing else keeps time. */
export interface Transport extends Readable<TransportState> {
  readonly activeEditorId: string | null;
  /** The active scheduler's position, in cycles. */
  cycle(): number;
  audibleCycle(): number;
  /** AudioContext time at which `cycle` will sound (for scheduling the stretch node and the recorder). */
  timeOfCycle(cycle: number): number;
  cps(): number;
  setCps(cps: number): void;
  /** The learner's visual offset, ms. */
  setVisualOffset(ms: number): void;
  /** Sorted onset haps of the active editor's pattern in `[from, to)` cycles; `[]` when nothing was evaluated. */
  haps(from: number, to: number): LiveHap[];
}

// --- sounds, preload, master bus, recorder ------------------------------------------------------

export interface PreloadSpec {
  /** Sound names as written in code: "piano", "bd", "RolandTR909_bd" or with a bank. */
  sounds: { s: string; bank?: string; n?: number; notes?: (string | number)[] }[];
}
export interface PreloadReport {
  warmed: number;
  synths: number;
  /** Names with no registered sound. */
  missing: string[];
  ms: number;
}

export interface MasterBus {
  /** Where everything that is not superdough connects (the transcription player). */
  readonly input: GainNode;
  readonly limiter: DynamicsCompressorNode;
  /** Undoes the compressor's built-in makeup gain, so quiet material passes at unity. */
  readonly trim: GainNode;
  /** Post-limiter: what the speakers and the recorder get. Feeds Oak's scope and spectrum panel. */
  readonly analyser: AnalyserNode;
  readonly preAnalyser: AnalyserNode;
  /** The record tap. */
  readonly tap: MediaStreamAudioDestinationNode;
  setVolume(volume: number): void;
  level(): { rms: number; peak: number };
  /** Times the bus was re-attached to a fresh destinationGain (superdough rebuilds it on resetGlobalEffects). */
  attachCount(): number;
}

export interface RecordOptions {
  /** Bars to record from the next integer cycle. */
  bars: number;
  /** Seconds of tail after the last bar. Default 2. */
  tailSec?: number;
  mimeType?: "audio/webm;codecs=opus" | "audio/mp4";
}
export interface Recording {
  blob: Blob;
  mime: string;
  durationS: number;
}
export interface Recorder {
  readonly recording: boolean;
  /** Starts at the next integer cycle of the active editor and resolves when the tail is over. */
  record(opts: RecordOptions): Promise<Recording>;
  cancel(): void;
}

export interface PlayEventsOptions {
  /** AudioContext time of the plan's zero. Default: now + 80 ms. */
  at?: number;
  /** Multiplies every event's gain. */
  gain?: number;
  /** Stop every other source first (drill stimuli). `false` for clicks and cues over a playing editor. Default true. */
  exclusive?: boolean;
}
export interface PlaybackHandle {
  /** Resolves when the plan has finished or was stopped. */
  readonly done: Promise<void>;
  /** AudioContext time of the plan's first event. */
  readonly startTime: number;
  stop(): void;
}

/**
 * Plays hidden reference code for Transcribe's "pattern source" (ladder stimuli, X1, X2, CF-T): a second,
 * hidden adapter instance with no editor and nothing in the DOM. Rate is a cps scale, transposition is
 * `.transpose()` on the pitched tracks, the A–B loop is `.ribbon(fromBar, bars)`. No fine-tune.
 */
export interface PatternPlayer {
  /** `lint` defaults to the content profile with previews allowed: reference code is authored, never typed. */
  load(code: string, opts: { bars: number; cps: number; lint?: LintContext }): Promise<EvalOutcome>;
  play(): Promise<void>;
  stop(): void;
  /** 0.25 to 1. */
  setRate(rate: number): void;
  /** −12 to 12. */
  setTranspose(semitones: number): void;
  setLoop(loop: { fromBar: number; bars: number } | null): void;
  setMutes(mutes: MuteMap): void;
  /** 0-based bar position, fractional. */
  position(): number;
  readonly playing: boolean;
  dispose(): void;
}

export interface StrudelLog {
  tag:
    | "query"
    | "getTrigger"
    | "cyclist"
    | "voicing"
    | "tonal"
    | "mini"
    | "webaudio"
    | "sampler"
    | "eval"
    | "other";
  message: string;
  /** A sound was skipped because it was still loading: the adapter preloads it and tells the UI. */
  skippedSound?: string;
}

export interface OakStrudelOptions {
  /** Default: a new `AudioContext({ latencyHint: "interactive" })` at the device's own rate. Shared with the mic and the stretch node. */
  ctx?: AudioContext;
  /** `/sounds/<packVersion>`; the manifest is fetched from `<soundsRoot>/manifest.json`. No remote origin is ever contacted. */
  soundsRoot: string;
  /** The unlock table, for the lint and the completion source. */
  toolbox: readonly ToolEntry[];
  /** The one lint pass (`lintOak` from @oak/grader), injected so the adapter and the grader cannot drift. */
  lint(code: string, ctx: LintContext): LintResult;
  /** At most this many live mirrors (LRU dispose; offscreen editors render a static `<pre>`). Default 6. */
  maxLiveEditors?: number;
  /** Install the global panic key (`Ctrl+.`, `Cmd+.`, `Alt+.` → `stopAll()`) on `window`. Default true. */
  panicKey?: boolean;
  /** Wire `unlock()` to the first `pointerdown`, `keydown` or `touchstart` on the document. Default true. */
  autoUnlock?: boolean;
}

// --- additions to the Foundation surface (reported in the Wave 1 result) ---------------------------

/** One thing that makes sound and must stop when another starts (ux §2.1 PlaybackCoordinator). */
export interface PlaybackSource {
  /** Unique: an editor ID, `player:<n>`, `plan:<n>` or the caller's own (`transcription`). */
  id: string;
  kind: "editor" | "pattern-player" | "plan" | "external";
  stop(): void;
}
export interface CoordinatorState {
  /** The source that plays now, or null. */
  activeId: string | null;
  kind: PlaybackSource["kind"] | null;
}
/** Only one source plays at a time. Editors, pattern players and exclusive plans claim by themselves. */
export interface PlaybackCoordinator extends Readable<CoordinatorState> {
  /** `source` starts playing: every other source is stopped first. Returns the release function. */
  claim(source: PlaybackSource): () => void;
  /** `id` stopped by itself. A no-op when it is not the active source. */
  release(id: string): void;
  /** Stop everything at once: schedulers, plans, pattern players, external sources and every ringing voice. */
  panic(): void;
}

/** The UI-sound bus (ux §7.7): an own tiny synth at −24 dBFS straight to the destination, past limiter and recorder. */
export interface UiSoundBus {
  readonly bus: GainNode;
  /** Triangle blips: 5 ms attack, 180 ms exponential decay, light lowpass. `at` is seconds from now. */
  play(notes: readonly { midi: number; at?: number; dur?: number; gain?: number }[]): void;
  setEnabled(on: boolean): void;
  /** 0 to 1, on top of the −24 dBFS bus level. */
  setVolume(volume: number): void;
  /** Mutes the bus until the returned function is called (ear trials, mic capture, transcription audio). Recording suppresses by itself. */
  suppress(reason: string): () => void;
  readonly audible: boolean;
}

/** Oak's own scope and spectrum, fed by the post-limiter analyser of the master bus (contracts §3.1 rule 9). */
export interface ScopeTap extends Readable<{ editorId: string | null; panels: ScopePanel[] }> {
  readonly fftSize: number;
  readonly sampleRate: number;
  /** Time-domain samples (−1 to 1) of the current window. Reuses `target` when its length fits. */
  wave(target?: Float32Array): Float32Array;
  /** Magnitudes in dBFS per frequency bin (`fftSize / 2` bins up to `sampleRate / 2`). */
  spectrum(target?: Float32Array): Float32Array;
}

export interface OakStrudel {
  readonly ctx: AudioContext;
  /** Prebake and sound registration; needs no gesture. One shared promise. */
  readonly ready: Promise<void>;
  /** From a user gesture: resume the context and initialise audio once. Races `resume()` against a timeout; a failure is not memoized. */
  unlock(): Promise<boolean>;
  readonly audio: Readable<AudioState>;
  createEditor(root: HTMLElement, opts: EditorOptions): EditorHandle;
  readonly editors: ReadonlyMap<string, EditorHandle>;
  readonly transport: Transport;
  preload(spec: PreloadSpec, onProgress?: (done: number, total: number) => void): Promise<PreloadReport>;
  /** Sounds a piece of code needs, read from its `s()`, `sound()` and `.bank()` arguments. */
  soundsIn(code: string): PreloadSpec;
  /** Plays events directly through superdough, bypassing the scheduler: drills, cues, clicks. */
  playEvents(plan: AudioPlan, opts?: PlayEventsOptions): PlaybackHandle;
  /** One note or chord now: the on-screen keyboard and audition buttons. */
  playNote(value: {
    s: string;
    note: number | string | (number | string)[];
    dur?: number;
    gain?: number;
  }): void;
  /** Stops every editor, every plan and every pattern player. */
  stopAll(): void;
  readonly master: MasterBus;
  readonly recorder: Recorder;
  createPatternPlayer(): PatternPlayer;
  lint(code: string, ctx: LintContext): LintResult;
  onLog(cb: (log: StrudelLog) => void): () => void;
  /** Names of every registered sound (for the Toolbox and `/dev/listen`). */
  sounds(): string[];
  dispose(): void;
  /** Only one source plays; `coordinator.panic()` is `stopAll()`. External sources (the transcription player) claim through it. */
  readonly coordinator: PlaybackCoordinator;
  /** UI sounds, past the limiter and the recorder. */
  readonly ui: UiSoundBus;
  /** What `.scope()` and `.fscope()` open. */
  readonly scope: ScopeTap;
  /** Every `/sounds/...` URL of the pack with its size, for "Download all sounds" and the Service Worker precache. */
  packFiles(): Promise<{ url: string; bytes: number }[]>;
}
