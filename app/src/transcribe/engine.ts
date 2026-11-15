// The learner's audio as Transcribe plays it (contracts §6.12, architecture §6.8): the decoded file through
// signalsmith-stretch into the master bus (`OakStrudel.master.input`), so the master tap hears it and UI sounds
// never do. The Wave 4 engine is `createStretchPlayer` (@oak/audio, the audio engineer's); until it is built it
// throws `AudioNotBuiltError` and the Wave 1 `createTranscriptionPlayer` (the same stretch node, already built)
// plays instead. Both are seen through one `SourceEngine`.
import type { StretchPlayer, TranscriptionPlayer } from "@oak/audio";
import type { StretchNode } from "signalsmith-stretch";

/**
 * How the stretch cuts the audio (carry f7). signalsmith-stretch's default preset analyses 120 ms blocks every
 * 30 ms; at 0.25× a transient then lands in the output wherever that 30 ms frame grid puts it, and its onset moved
 * by up to ±20 ms from bar to bar and take to take. Measured on the Transcribe page (bar bursts against the code's
 * blips, 0.25×, 6 bars a take): the default, SD 9.0 ms, worst 19.5 ms against the 20 ms A/B gate (quiet), SD 9.9 ms,
 * worst 29.3 ms with ten cores busy; the same 120 ms block every 10 ms, SD 6.8 ms, worst 17.2 ms (busy); every 5 ms,
 * SD 3.5 ms, worst 11.3 ms (busy). The 120 ms block keeps the frequency resolution a bass line needs at 0.25×; the
 * finer interval costs six times the default's FFTs (a few percent of one core). 1× and 0.75× stay within 3 ms.
 */
export const STRETCH_CONFIG = { blockMs: 120, intervalMs: 5 } as const;
type StretchConfig = { blockMs: number; intervalMs: number };

async function createConfiguredStretch(c: BaseAudioContext, config: StretchConfig): Promise<StretchNode> {
  const mod = await import("signalsmith-stretch");
  const node = await mod.default(c);
  await (node as unknown as { configure(o: StretchConfig): Promise<void> }).configure(config);
  return node;
}

export interface SourceEngineState {
  loaded: boolean;
  playing: boolean;
  /** Source seconds. */
  time: number;
  durationS: number;
  rate: number;
  semitones: number;
  cents: number;
  loop: { startS: number; endS: number } | null;
}

export interface SourceEngine {
  readonly state: SourceEngineState;
  readonly buffer: AudioBuffer;
  /** Which engine plays: the Wave 4 stretch player or the Wave 1 transcription player. */
  readonly impl: "stretch" | "transcription";
  /** `at`: AudioContext time to start at; `fromS`: source seconds. */
  play(opts?: { at?: number; fromS?: number }): Promise<void>;
  pause(): void;
  seek(s: number): void;
  setRate(r: number): void;
  setSemitones(st: number): void;
  setCents(c: number): void;
  setLoop(loop: { startS: number; endS: number } | null): void;
  /** 0–1: the source's level (A/B mutes it with 0). */
  setGain(g: number): void;
  subscribe(cb: (s: SourceEngineState) => void): () => void;
  dispose(): void;
}

export function fromStretchPlayer(p: StretchPlayer, buffer: AudioBuffer): SourceEngine {
  const view = (): SourceEngineState => {
    const s = p.state;
    return {
      loaded: s.loaded,
      playing: s.playing,
      time: s.time,
      durationS: s.durationS,
      rate: s.rate,
      semitones: s.semitones,
      cents: s.cents,
      loop: s.loop,
    };
  };
  return {
    impl: "stretch",
    buffer,
    get state() {
      return view();
    },
    play: (o) => p.play(o),
    pause: () => p.pause(),
    seek: (s) => p.seek(s),
    setRate: (r) => p.setRate(r),
    setSemitones: (st) => p.setSemitones(st),
    setCents: (c) => p.setCents(c),
    setLoop: (l) => p.setLoop(l),
    setGain: (g) => p.setGain(g),
    subscribe: (cb) => p.subscribe(() => cb(view())),
    dispose: () => p.dispose(),
  };
}

export function fromTranscriptionPlayer(p: TranscriptionPlayer, buffer: AudioBuffer): SourceEngine {
  const view = (): SourceEngineState => {
    const s = p.state;
    return {
      loaded: s.loaded,
      playing: s.playing,
      time: s.time,
      durationS: s.durationS,
      rate: s.rate,
      semitones: s.semitones,
      cents: s.fineTuneCents,
      loop: s.loop,
    };
  };
  return {
    impl: "transcription",
    buffer,
    get state() {
      return view();
    },
    play: (o) => p.play(o),
    pause: () => p.pause(),
    seek: (s) => p.seek(s),
    setRate: (r) => p.setRate(r),
    setSemitones: (st) => p.setSemitones(st),
    setCents: (c) => p.setFineTuneCents(c),
    setLoop: (l) => p.setLoop(l),
    setGain: (g) => p.setGain(g),
    subscribe: (cb) => p.subscribe(() => cb(view())),
    dispose: () => p.dispose(),
  };
}

/** The engine for a decoded file on Oak's one context, playing into `output`. */
export async function createSourceEngine(
  ctx: AudioContext,
  output: AudioNode,
  buffer: AudioBuffer,
): Promise<SourceEngine> {
  const audio = await import("@oak/audio");
  try {
    // `createStretch` is the engine's own injection point (`StretchEngineDeps`), passed through the seam.
    const deps: Parameters<typeof audio.createStretchPlayer>[0] & {
      createStretch(c: BaseAudioContext): Promise<StretchNode>;
    } = { ctx, output, createStretch: (c) => createConfiguredStretch(c, STRETCH_CONFIG) };
    const p = await audio.createStretchPlayer(deps);
    await p.load(buffer);
    return fromStretchPlayer(p, buffer);
  } catch (e) {
    if (!(e instanceof audio.AudioNotBuiltError)) throw e;
  }
  const p = await audio.createTranscriptionPlayer(ctx, output, { decode: async () => buffer });
  await p.load(new ArrayBuffer(0));
  return fromTranscriptionPlayer(p, buffer);
}

/** Fetches and decodes the learner's file (it never leaves the machine: the server is local). */
export async function decodeAudio(
  ctx: BaseAudioContext,
  url: string,
  signal?: AbortSignal,
): Promise<AudioBuffer> {
  const res = await fetch(url, { signal: signal ?? null, headers: { "x-oak": "1" } });
  if (!res.ok) throw new Error(`The audio file could not be read (HTTP ${res.status}).`);
  const bytes = await res.arrayBuffer();
  return ctx.decodeAudioData(bytes);
}
