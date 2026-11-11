// The transcription player's control logic against a fake stretch node; the real signalsmith-stretch
// path is proven in e2e/stretch.pw.ts.
import { describe, expect, test } from "bun:test";
import type { StretchNode, StretchSchedule } from "signalsmith-stretch";
import { FakeContext, FakeNode } from "./fakes.test-data.ts";
import { audioSource, createPatternSource, loopToBars, type PatternPlayerLike } from "./pattern-source.ts";
import { computePeaks, createTranscriptionPlayer } from "./transcription.ts";

class FakeBuffer {
  readonly length: number;
  readonly duration: number;
  constructor(
    readonly data: Float32Array[],
    readonly sampleRate: number,
  ) {
    this.length = data[0]?.length ?? 0;
    this.duration = this.length / sampleRate;
  }
  get numberOfChannels() {
    return this.data.length;
  }
  getChannelData(c: number) {
    return this.data[c] as Float32Array;
  }
}

function fakeStretch() {
  const node = Object.assign(new FakeNode(), {
    inputTime: 0,
    schedules: [] as StretchSchedule[],
    buffers: [] as ArrayLike<Float32Array>[],
    tick: null as ((t: number) => void) | null,
    async schedule(c: StretchSchedule) {
      node.schedules.push(c);
      if (c.input !== undefined) node.inputTime = c.input;
    },
    async setUpdateInterval(_s: number, cb?: (t: number) => void) {
      node.tick = cb ?? null;
    },
    async addBuffers(b: ArrayLike<Float32Array>) {
      node.buffers.push(b);
      return 0;
    },
    async dropBuffers() {
      node.buffers = [];
      return { start: 0, end: 0 };
    },
  });
  return node;
}

async function setup() {
  const ctx = new FakeContext();
  const stretch = fakeStretch();
  const out = new FakeNode();
  const sr = 1000;
  const samples = new Float32Array(10 * sr);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.sin(i / 10) * (i < sr ? 0.5 : 0.1);
  const player = await createTranscriptionPlayer(
    ctx as unknown as AudioContext,
    out as unknown as AudioNode,
    {
      createStretch: async () => stretch as unknown as StretchNode,
      decode: async () => new FakeBuffer([samples], sr) as unknown as AudioBuffer,
    },
  );
  return { ctx, stretch, out, player };
}

describe("TranscriptionPlayer", () => {
  test("load decodes, hands the channels to the stretch, and resets the state", async () => {
    const { stretch, out, player, ctx } = await setup();
    expect(ctx.gains[0]?.connected).toContain(out);
    const info = await player.load(new ArrayBuffer(8));
    expect(info).toEqual({ durationS: 10, sampleRate: 1000, channels: 1 });
    expect(stretch.buffers.length).toBe(1);
    expect(player.state).toMatchObject({ loaded: true, playing: false, time: 0, durationS: 10, rate: 1 });
  });

  test("rate, semitones and ±50¢ fine-tune go to the stretch as rate and fractional semitones", async () => {
    const { stretch, player, ctx } = await setup();
    await player.load(new ArrayBuffer(8));
    player.setRate(0.75);
    player.setSemitones(-3);
    player.setFineTuneCents(30);
    ctx.currentTime = 2;
    await player.play({ at: 2.5, fromS: 1 });
    const last = stretch.schedules.at(-1);
    expect(last).toMatchObject({
      active: true,
      input: 1,
      output: 2.5,
      rate: 0.75,
      semitones: -2.7,
      loopStart: 0,
      loopEnd: 0,
    });
    player.setFineTuneCents(80);
    expect(player.state.fineTuneCents).toBe(50);
    expect(stretch.schedules.at(-1)?.semitones).toBeCloseTo(-2.5, 9);
    player.setRate(0.1);
    expect(player.state.rate).toBe(0.25);
    player.setRate(2);
    expect(player.state.rate).toBe(1);
  });

  test("A–B loop: the stretch's auto-loop; a playhead outside it jumps to A", async () => {
    const { stretch, player } = await setup();
    await player.load(new ArrayBuffer(8));
    await player.play();
    stretch.inputTime = 1;
    player.setLoop({ startS: 4, endS: 2 });
    expect(player.state.loop).toEqual({ startS: 2, endS: 4 });
    expect(stretch.schedules.at(-1)).toMatchObject({ loopStart: 2, loopEnd: 4, input: 2 });
    player.setLoop({ startS: 3, endS: 3.01 }); // too short: no loop
    expect(player.state.loop).toBe(null);
    expect(stretch.schedules.at(-1)).toMatchObject({ loopStart: 0, loopEnd: 0 });
  });

  test("position events while playing; the end of the file stops playback", async () => {
    const { stretch, player } = await setup();
    await player.load(new ArrayBuffer(8));
    const times: number[] = [];
    player.subscribe((s) => times.push(s.time));
    await player.play();
    stretch.tick?.(1.25);
    stretch.tick?.(1.3);
    expect(player.state.time).toBeCloseTo(1.3, 9);
    stretch.tick?.(10.02);
    expect(player.state.playing).toBe(false);
    expect(player.state.time).toBe(10);
    expect(times).toContain(1.25);
    // Play again from the end restarts at 0.
    await player.play();
    expect(stretch.schedules.at(-1)?.input).toBe(0);
  });

  test("pause keeps the position; seek moves it", async () => {
    const { stretch, player } = await setup();
    await player.load(new ArrayBuffer(8));
    await player.play();
    stretch.inputTime = 3.3;
    player.pause();
    expect(player.state).toMatchObject({ playing: false, time: 3.3 });
    expect(stretch.schedules.at(-1)?.active).toBe(false);
    player.seek(12);
    expect(player.state.time).toBe(10);
    player.seek(-1);
    expect(player.state.time).toBe(0);
  });

  test("peaks are min/max pairs and cached", async () => {
    const { player } = await setup();
    await player.load(new ArrayBuffer(8));
    const p = player.peaks(10);
    expect(p.length).toBe(200);
    expect(p[1]).toBeCloseTo(0.5, 2);
    expect(p[0]).toBeCloseTo(-0.5, 2);
    expect(p[21]).toBeLessThanOrEqual(0.1 + 1e-6);
    expect(player.peaks(10)).toBe(p);
  });

  test("dispose", async () => {
    const { player, stretch } = await setup();
    await player.load(new ArrayBuffer(8));
    player.dispose();
    expect(stretch.connected).toEqual([]);
    await expect(player.play()).rejects.toThrow();
  });
});

test("computePeaks takes min and max across channels", () => {
  const a = new Float32Array([0.1, -0.2, 0.3, 0.0]);
  const b = new Float32Array([-0.5, 0.0, 0.0, 0.9]);
  const peaks = computePeaks(new FakeBuffer([a, b], 4) as unknown as AudioBuffer, 2);
  expect(Array.from(peaks).map((x) => Math.round(x * 10) / 10)).toEqual([-0.5, 0.1, 0, 0.9]);
});

describe("Transcribe sources", () => {
  function fakePlayer() {
    const log: string[] = [];
    let pos = 0;
    let playing = false;
    const player: PatternPlayerLike & { setPos(p: number): void } = {
      async load(code, o) {
        log.push(`load ${o.bars} ${o.cps} ${code.length}`);
        return { ok: true };
      },
      async play() {
        playing = true;
        log.push("play");
      },
      stop() {
        playing = false;
        log.push("stop");
      },
      setRate: (r) => log.push(`rate ${r}`),
      setTranspose: (s) => log.push(`transpose ${s}`),
      setLoop: (l) => log.push(l ? `loop ${l.fromBar}+${l.bars}` : "loop off"),
      position: () => pos,
      get playing() {
        return playing;
      },
      dispose: () => log.push("dispose"),
      setPos(p) {
        pos = p;
      },
    };
    return { player, log };
  }

  test("pattern source: cps rate, .transpose() semitones, whole-bar loops, no fine-tune, bar timeline", async () => {
    const { player, log } = fakePlayer();
    const src = await createPatternSource(player, {
      code: 'mel: n("0 2 4").scale("C4:major")',
      bars: 8,
      cps: 0.5,
      pollMs: 5,
    });
    expect(src.state).toMatchObject({
      kind: "pattern",
      loaded: true,
      durationS: 16,
      bars: 8,
      barSec: 2,
      fineTuneCents: null,
    });
    expect(src.canFineTune).toBe(false);
    src.setRate(0.5);
    src.setSemitones(-2.4);
    src.setFineTuneCents(20);
    src.setLoop({ startS: 2.5, endS: 5.1 });
    expect(src.state.loop).toEqual({ startS: 2, endS: 6 });
    await src.play();
    player.setPos(2.5);
    await new Promise((r) => setTimeout(r, 20));
    expect(src.state.time).toBeCloseTo(5, 9);
    src.pause();
    src.setLoop(null);
    src.dispose();
    expect(log).toEqual([
      "load 8 0.5 33",
      "rate 0.5",
      "transpose -2",
      "loop 1+2",
      "play",
      "stop",
      "loop off",
      "stop",
      "dispose",
    ]);
  });

  test("loopToBars covers the selection with whole bars inside the material", () => {
    expect(loopToBars({ startS: 0, endS: 0.1 }, 2, 8)).toEqual({ fromBar: 0, bars: 1 });
    expect(loopToBars({ startS: 15.9, endS: 30 }, 2, 8)).toEqual({ fromBar: 7, bars: 1 });
    expect(loopToBars({ startS: 4, endS: 8 }, 2, 8)).toEqual({ fromBar: 2, bars: 2 });
  });

  test("audio source mirrors the player and keeps fine-tune", async () => {
    const { player, stretch } = await setup();
    await player.load(new ArrayBuffer(8));
    const src = audioSource(player);
    const seen: (number | null)[] = [];
    src.subscribe((s) => seen.push(s.fineTuneCents));
    src.setFineTuneCents(-20);
    await src.play({ at: 0 });
    expect(src.state).toMatchObject({ kind: "audio", playing: true, fineTuneCents: -20, bars: null });
    expect(stretch.schedules.at(-1)?.semitones).toBeCloseTo(-0.2, 9);
    expect(seen).toContain(-20);
  });
});
