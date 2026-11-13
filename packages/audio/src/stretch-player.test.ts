// The stretch engine on a recording fake node: what it tells signalsmith-stretch, and the clock it keeps. The
// real node (rate without pitch change, transpose, loop, the A/B drift) is measured in packages/audio/e2e.
import { describe, expect, test } from "bun:test";
import type { StretchNode } from "signalsmith-stretch";
import { FakeContext, FakeNode, FakeStretchNode, fakeBuffer } from "./fakes.test-data.ts";
import { createStretchEngine, ctxTimeAt, positionAt } from "./stretch-player.ts";

async function setup() {
  const ctx = new FakeContext();
  const node = new FakeStretchNode();
  const output = new FakeNode();
  const claims: string[] = [];
  const player = await createStretchEngine({
    ctx: ctx as unknown as AudioContext,
    output: output as unknown as AudioNode,
    createStretch: async () => node as unknown as StretchNode,
    claim: (s) => {
      claims.push(`claim:${s.id}`);
      return () => claims.push("release");
    },
  });
  await player.load(fakeBuffer(20));
  return { ctx, node, output, player, claims };
}

describe("positionAt and ctxTimeAt (the clock's maths)", () => {
  const a = { ctxTime: 10, sourceS: 2, rate: 0.5 };
  test("linear without a loop", () => {
    expect(positionAt(a, 14, null, 60)).toBeCloseTo(4, 9);
    expect(ctxTimeAt(a, 4, null, 0)).toBeCloseTo(14, 9);
    // Before the segment starts it sits at its start.
    expect(positionAt(a, 9, null, 60)).toBe(2);
    // The end of the file stops the position.
    expect(positionAt(a, 1000, null, 30)).toBe(30);
  });
  test("wraps inside a loop exactly as the stretch does; next pass of a time", () => {
    const loop = { startS: 2, endS: 3 };
    // A pass is 1 s of source at 0.5× = 2 s of context time.
    expect(positionAt(a, 12.5, loop, 60)).toBeCloseTo(2.25, 9);
    expect(positionAt(a, 15, loop, 60)).toBeCloseTo(2.5, 9);
    expect(ctxTimeAt(a, 2.5, loop, 10)).toBeCloseTo(11, 9);
    expect(ctxTimeAt(a, 2.5, loop, 11.5)).toBeCloseTo(13, 9);
    expect(ctxTimeAt(a, 3.5, loop, 10)).toBeNull();
    expect(ctxTimeAt(a, 1, loop, 10)).toBeNull();
  });
});

describe("createStretchEngine", () => {
  test("load hands the channels to the stretch and parks it at 0", async () => {
    const { node, player } = await setup();
    expect(node.buffers[0]?.length).toBe(2);
    expect(player.state).toMatchObject({ loaded: true, playing: false, durationS: 20, time: 0 });
    expect(node.last()).toMatchObject({ active: false, input: 0 });
  });

  test("play: one segment at the asked time, the clock anchored on it, the end planned, the coordinator told", async () => {
    const { ctx, node, player, claims } = await setup();
    ctx.currentTime = 1;
    player.setRate(0.75);
    await player.play({ at: 2, fromS: 4 });
    // One segment: the stretch keeps a single pending one, so the end of the file is a timer, not a segment.
    expect(node.last()).toEqual({
      active: true,
      input: 4,
      output: 2,
      rate: 0.75,
      semitones: 0,
      loopStart: 0,
      loopEnd: 0,
    });
    expect(player.clock.anchor).toEqual({ ctxTime: 2, sourceS: 4, rate: 0.75 });
    expect(player.clock.ctxTimeOf(7)).toBeCloseTo(6, 9);
    expect(player.clock.sourceTimeAt(6)).toBeCloseTo(7, 9);
    ctx.currentTime = 6;
    expect(player.state.time).toBeCloseTo(7, 9);
    expect(claims).toEqual(["claim:oak-stretch"]);
    player.pause();
    expect(node.last()).toMatchObject({ active: false, output: 6 });
    expect(player.state).toMatchObject({ playing: false });
    expect(player.state.time).toBeCloseTo(7, 9);
    expect(player.clock.ctxTimeOf(8)).toBeNull();
    expect(claims).toEqual(["claim:oak-stretch", "release"]);
  });

  test("a change while the start is still pending rewrites that start (the stretch would drop it)", async () => {
    const { ctx, node, player } = await setup();
    ctx.currentTime = 1;
    await player.play({ at: 1.5, fromS: 2 });
    player.setSemitones(5);
    expect(node.last()).toMatchObject({ active: true, output: 1.5, input: 2, semitones: 5 });
    player.setRate(0.5);
    expect(node.last()).toMatchObject({ active: true, output: 1.5, input: 2, rate: 0.5 });
    expect(player.clock.ctxTimeOf(3)).toBeCloseTo(3.5, 9);
  });

  test("rate, transpose and fine-tune while playing: a new segment after the lead, the position kept", async () => {
    const { ctx, node, player } = await setup();
    await player.play({ at: 0.1, fromS: 0 });
    ctx.currentTime = 2.1;
    player.setRate(0.5);
    const seg = node.schedules.filter((s) => s.active === true).at(-1) as Record<string, number>;
    expect(seg.output).toBeCloseTo(2.16, 9);
    expect(seg.input).toBeCloseTo(2.06, 9);
    expect(seg.rate).toBe(0.5);
    // Two seconds later at half speed: one more second of source.
    expect(player.clock.sourceTimeAt(4.16)).toBeCloseTo(3.06, 9);
    player.setSemitones(-3);
    player.setCents(25);
    const pitched = node.schedules.filter((s) => s.active === true).at(-1) as Record<string, number>;
    expect(pitched.semitones).toBeCloseTo(-2.75, 9);
    expect(pitched.rate).toBe(0.5);
    // The tempo map did not move.
    expect(player.clock.sourceTimeAt(4.16)).toBeCloseTo(3.06, 9);
    // Ranges: 0.25–1.5, ±12, ±50.
    player.setRate(9);
    player.setSemitones(40);
    player.setCents(-90);
    expect([player.state.rate, player.state.semitones, player.state.cents]).toEqual([1.5, 12, -50]);
  });

  test("an A–B loop: loop fields on the stretch, the clock wraps, a start outside the loop moves into it", async () => {
    const { ctx, node, player } = await setup();
    player.setLoop({ startS: 6, endS: 4 });
    expect(player.state.loop).toEqual({ startS: 4, endS: 6 });
    expect(player.state.time).toBe(4);
    await player.play({ at: 1 });
    expect(node.schedules.filter((s) => s.active === true).at(-1)).toMatchObject({
      input: 4,
      loopStart: 4,
      loopEnd: 6,
    });
    expect(node.last().active).toBe(true);
    ctx.currentTime = 4.5;
    expect(player.state.time).toBeCloseTo(5.5, 9);
    ctx.currentTime = 6;
    expect(player.state.time).toBeCloseTo(5, 9);
    // The next time 4.5 s sounds: passes start at 1, 3, 5 and 7 s; at 6 s it already sounded at 5.5 s.
    expect(player.clock.ctxTimeOf(4.5)).toBeCloseTo(7.5, 9);
    expect(player.clock.ctxTimeOf(5.5)).toBeCloseTo(6.5, 9);
    player.setLoop({ startS: 10, endS: 10.01 });
    expect(player.state.loop).toBeNull();
    player.seek(25);
    expect(player.state.time).toBeLessThanOrEqual(20);
  });

  test("gain and dispose", async () => {
    const { ctx, node, player } = await setup();
    player.setGain(2);
    expect(player.state.gain).toBe(1);
    expect(ctx.gains[0]?.gain.value).toBe(1);
    player.setGain(0);
    expect(ctx.gains[0]?.gain.value).toBe(0);
    player.dispose();
    expect(node.dropped).toBeGreaterThan(1);
    await expect(player.play()).rejects.toThrow("disposed");
  });
});
