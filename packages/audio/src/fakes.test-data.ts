// Structural fakes of the Web Audio and media APIs for the bun tests of @oak/audio (not a test file).
// The real browser path is proven by the Playwright specs in packages/audio/e2e.
import type { PitchFrame } from "@oak/pitch";

export class FakeNode {
  connected: unknown[] = [];
  connect<T>(n: T): T {
    this.connected.push(n);
    return n;
  }
  disconnect(): void {
    this.connected = [];
  }
}
export class FakePort {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  sent: unknown[] = [];
  postMessage(m: unknown): void {
    this.sent.push(m);
  }
  emit(data: unknown): void {
    this.onmessage?.({ data });
  }
}
export class FakeWorkletNode extends FakeNode {
  port = new FakePort();
  constructor(
    readonly name: string,
    readonly options: AudioWorkletNodeOptions,
  ) {
    super();
  }
}
export class FakeTrack {
  stopped = false;
  private listeners: (() => void)[] = [];
  constructor(readonly deviceId = "mic-1") {}
  stop(): void {
    this.stopped = true;
  }
  getSettings() {
    return { deviceId: this.deviceId };
  }
  addEventListener(_: string, cb: () => void): void {
    this.listeners.push(cb);
  }
  end(): void {
    for (const cb of this.listeners) cb();
  }
}
export class FakeStream {
  tracks = [new FakeTrack()];
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks;
  }
}

export class FakeContext {
  currentTime = 0;
  sampleRate = 48000;
  state: AudioContextState = "running";
  outputLatency = 0.02;
  baseLatency = 0.005;
  destination = new FakeNode();
  modules: string[] = [];
  sources: FakeNode[] = [];
  gains: (FakeNode & { gain: { value: number; setTargetAtTime(v: number): void } })[] = [];
  failModule = false;
  audioWorklet = {
    addModule: async (url: string) => {
      if (this.failModule) throw new Error("nope");
      this.modules.push(url);
    },
  };
  async resume(): Promise<void> {
    this.state = "running";
  }
  createMediaStreamSource(): FakeNode {
    const n = new FakeNode();
    this.sources.push(n);
    return n;
  }
  createGain() {
    const g = Object.assign(new FakeNode(), {
      gain: {
        value: 1,
        setTargetAtTime(v: number) {
          g.gain.value = v;
        },
      },
    });
    this.gains.push(g);
    return g;
  }
  getOutputTimestamp(): AudioTimestamp {
    return { contextTime: this.currentTime, performanceTime: 1000 + this.currentTime * 1000 };
  }
  /** Advances the clock (and nothing else). */
  advance(sec: number): void {
    this.currentTime += sec;
  }
}

/** A clock-driven sleep: each call advances the fake context by `ms` and lets `onTick` push frames. */
export function fakeSleep(ctx: FakeContext, onTick?: (from: number, to: number) => void) {
  return async (ms: number): Promise<void> => {
    const from = ctx.currentTime;
    ctx.advance(ms / 1000);
    onTick?.(from, ctx.currentTime);
    await Promise.resolve();
  };
}

/** Frames every hop between two context times for a "signal" given as a function of the window centre. */
export function framesBetween(
  from: number,
  to: number,
  signal: (tc: number) => { midi: number | null; rms?: number },
  sr = 48000,
): PitchFrame[] {
  const hop = 512 / sr;
  const half = 1024 / sr;
  const out: PitchFrame[] = [];
  const first = Math.ceil(from / hop) * hop;
  for (let t = first; t < to; t += hop) {
    const s = signal(t - half);
    out.push(
      s.midi === null
        ? { t, hz: 0, clarity: 0.1, rms: s.rms ?? 1e-4 }
        : { t, hz: 440 * 2 ** ((s.midi - 69) / 12), clarity: 0.97, rms: s.rms ?? 0.1 },
    );
  }
  return out;
}
