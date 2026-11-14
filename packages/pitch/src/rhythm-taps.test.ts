// Wave 6 (U13): pushes, triplets and compound meter tapped against a click — graded by the §8.4 rule, reported
// onset by onset, with the three mistakes named.
import { describe, expect, test } from "bun:test";
import { PROFILE, TAP_TOL } from "./fixtures.test-data.ts";
import {
  beatOnsets,
  classifyRhythm,
  gradeRhythmTaps,
  pushWord,
  RHYTHM_TAP_FEEDBACK,
  type RhythmPattern,
  rhythmBarSec,
  rhythmTapText,
  rhythmTargets,
} from "./rhythm-taps.ts";
import { mulberry32 } from "./synth.ts";
import { gradeTaps, tapWindowMs } from "./taps.ts";

/** U13.L01's figure over two bars of 4/4: chords pushed an eighth ahead of beats 3 and 1. */
const PUSHED: RhythmPattern = {
  downbeat: 2,
  bpm: 100,
  meter: "4/4",
  // bar 1: 1, 2, (3 pushed: the & of 2), 4 & (1 pushed: the & of 4); bar 2: 2, the & of 2, 4
  onsets: [0, 1 / 4, 3 / 8, 3 / 4, 7 / 8, 1 + 1 / 4, 1 + 3 / 8, 1 + 3 / 4],
};

/** Perfect taps for a pattern, each moved by `move(index)` ms, with ±jitter. */
function take(
  p: RhythmPattern,
  o: { move?: (i: number) => number; jitterMs?: number; offsetMs?: number; seed?: number } = {},
): number[] {
  const rand = mulberry32(o.seed ?? 5);
  return rhythmTargets(p).map(
    (t, i) => t + ((o.move?.(i) ?? 0) + (o.offsetMs ?? 0) + (rand() * 2 - 1) * (o.jitterMs ?? 0)) / 1000,
  );
}

describe("what each onset is", () => {
  test("pushes: off the beat, the last note before a beat that is empty", () => {
    const c = classifyRhythm(PUSHED);
    expect(c.map((o) => o.kind)).toEqual(["beat", "beat", "push", "beat", "push", "beat", "push", "beat"]);
    expect(c.map((o) => o.label)).toEqual(["1", "2", "2&", "4", "4&", "2", "2&", "4"]);
    expect(c[2]?.push?.by).toBeCloseTo(0.5, 9);
    // The beat it comes before: bar 1 beat 3, 2 + 2 beats of 0.6 s.
    expect(c[2]?.push?.beatAt).toBeCloseTo(2 + 1.2, 9);
    expect(pushWord(0.5)).toBe("an eighth");
    expect(pushWord(0.25)).toBe("a sixteenth");
  });
  test("an off-beat with a note on the next beat is an off-beat, not a push", () => {
    const c = classifyRhythm({ downbeat: 0, bpm: 120, onsets: [0, 1 / 8, 1 / 4, 3 / 8, 1 / 2] });
    expect(c.map((o) => o.kind)).toEqual(["beat", "offbeat", "beat", "offbeat", "beat"]);
  });
  test("a sixteenth push, and sixteenths that are not pushes", () => {
    const c = classifyRhythm({ downbeat: 0, bpm: 90, onsets: [0, 1 / 16, 3 / 16, 1 / 2] });
    expect(c.map((o) => o.kind)).toEqual(["beat", "sub", "push", "beat"]);
    expect(c[2]?.push?.by).toBeCloseTo(0.25, 9);
    expect(c[2]?.label).toBe("1a");
  });
  test("a loop: the last off-beat is judged against bar 1's downbeat", () => {
    const loop = { downbeat: 0, bpm: 120, onsets: [0, 1 / 2, 7 / 8] };
    expect(classifyRhythm(loop)[2]?.kind).toBe("push");
    expect(classifyRhythm({ ...loop, bars: 1 })[2]?.kind).toBe("offbeat");
    expect(classifyRhythm({ downbeat: 0, bpm: 120, bars: 1, onsets: [1 / 4, 7 / 8] })[1]?.kind).toBe("push");
  });
  test("triplets and compound meter are named by their own counts", () => {
    const trip = classifyRhythm({ downbeat: 0, bpm: 80, onsets: [0, 1 / 12, 2 / 12, 1 / 4] });
    expect(trip.map((o) => `${o.kind}:${o.label}`)).toEqual([
      "beat:1",
      "triplet:1-trip",
      "triplet:1-let",
      "beat:2",
    ]);
    const six = classifyRhythm({
      downbeat: 0,
      bpm: 60,
      meter: "6/8",
      onsets: [0, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1],
    });
    expect(six.map((o) => `${o.kind}:${o.label}`)).toEqual([
      "beat:1",
      "sub:1li",
      "beat:2",
      "sub:2la",
      "sub:2li",
      "beat:1",
    ]);
    // In 6/8 the eighth before an empty beat is the push.
    const pushed = classifyRhythm({ downbeat: 0, bpm: 60, meter: "6/8", onsets: [0, 2 / 6, 5 / 6] });
    expect(pushed.map((o) => o.kind)).toEqual(["beat", "push", "push"]);
    expect(pushWord(1 / 3, "6/8")).toBe("an eighth");
  });
  test("the beat of a compound meter is the dotted quarter: two taps a bar in 6/8", () => {
    expect(beatOnsets("6/8", 2)).toEqual([0, 0.5, 1, 1.5]);
    expect(beatOnsets("12/8", 1, { closing: true })).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(beatOnsets("4/4", 1)).toEqual([0, 0.25, 0.5, 0.75]);
    // 60 to the dotted quarter: a 6/8 bar lasts two seconds.
    expect(rhythmBarSec({ bpm: 60, meter: "6/8" })).toBe(2);
    expect(rhythmTargets({ downbeat: 1, bpm: 60, meter: "6/8", onsets: beatOnsets("6/8", 1) })).toEqual([
      1, 2,
    ]);
  });
});

describe("pushes", () => {
  test("a clean pushed take passes, and the grade is gradeTaps's own", () => {
    const taps = take(PUSHED, { jitterMs: 12 });
    const r = gradeRhythmTaps(taps, PUSHED, TAP_TOL, PROFILE, { level: 1, levels: 4 });
    const plain = gradeTaps(taps, rhythmTargets(PUSHED), TAP_TOL, PROFILE, { level: 1, levels: 4 });
    expect(r.pass).toBe(true);
    expect(r.score).toBe(plain.score);
    expect(r.f1).toBe(plain.f1);
    expect(r.timing).toBe(plain.timing);
    expect(r.windowMs).toBe(plain.windowMs);
    expect(r.onsets.every((o) => o.verdict === "on")).toBe(true);
    expect(r.pushesOnBeat).toEqual([]);
    expect(r.kinds.map((k) => [k.kind, k.n, k.matched])).toEqual([
      ["beat", 5, 5],
      ["push", 3, 3],
    ]);
    expect(r.diagnostics.filter((d) => d.id.startsWith("tap.push"))).toEqual([]);
  });

  test("pushes tapped on the beat: each is missed, and the take is told its pushes are landing on the beat", () => {
    // Every push arrives an eighth late: exactly on the beat it should come before.
    const eighthMs = (60 / PUSHED.bpm / 2) * 1000;
    const kinds = classifyRhythm(PUSHED).map((o) => o.kind);
    const taps = take(PUSHED, { move: (i) => (kinds[i] === "push" ? eighthMs : 0), jitterMs: 8 });
    const r = gradeRhythmTaps(taps, PUSHED, TAP_TOL, PROFILE, { level: 1, levels: 4 });
    expect(r.pass).toBe(false);
    expect(r.pushesOnBeat).toEqual([2, 4, 6]);
    expect(r.onsets.filter((o) => o.kind === "push").map((o) => o.verdict)).toEqual([
      "on-the-beat",
      "on-the-beat",
      "on-the-beat",
    ]);
    expect(r.onsets.filter((o) => o.kind === "beat").every((o) => o.verdict === "on")).toBe(true);
    const d = r.diagnostics.find((x) => x.id === "tap.push-on-beat");
    expect(d?.params).toEqual({ n: 3, of: 3, which: "All 3 of your pushes", by: "an eighth", bars: "1, 2" });
    expect(rhythmTapText(d as NonNullable<typeof d>)).toBe(
      "All 3 of your pushes landed on the beat. A push comes an eighth early: tap it just before the beat, then leave the beat itself empty.",
    );
    // The §8.4 result still counts three missed targets and three extra taps.
    expect(r.missed).toEqual([2, 4, 6]);
    expect(r.extra.length).toBe(3);
  });

  test("one push of three on the beat is named alone", () => {
    const eighthMs = (60 / PUSHED.bpm / 2) * 1000;
    const taps = take(PUSHED, { move: (i) => (i === 4 ? eighthMs : 0) });
    const r = gradeRhythmTaps(taps, PUSHED, TAP_TOL, PROFILE);
    expect(r.pushesOnBeat).toEqual([4]);
    expect(r.diagnostics.find((x) => x.id === "tap.push-on-beat")?.params).toMatchObject({
      n: 1,
      of: 3,
      bars: "1",
    });
  });

  test("pushes that lean toward the beat but still count are reported late, per onset and as a line", () => {
    const kinds = classifyRhythm(PUSHED).map((o) => o.kind);
    const w = tapWindowMs(300, 1, 4, PROFILE);
    expect(w).toBe(75);
    const taps = take(PUSHED, { move: (i) => (kinds[i] === "push" ? 48 : 2) });
    const r = gradeRhythmTaps(taps, PUSHED, TAP_TOL, PROFILE, { level: 3, levels: 4 });
    const pushes = r.onsets.filter((o) => o.kind === "push");
    expect(pushes.map((o) => o.verdict)).toEqual(["late", "late", "late"]);
    expect(pushes.map((o) => Math.round(o.errorMs as number))).toEqual([48, 48, 48]);
    expect(r.pushesOnBeat).toEqual([]);
    expect(r.kinds.find((k) => k.kind === "push")).toMatchObject({ late: 3, early: 0, matched: 3 });
    expect(r.kinds.find((k) => k.kind === "push")?.medianMs).toBeCloseTo(48, 6);
    const d = r.diagnostics.find((x) => x.id === "tap.push-late");
    expect(d?.params).toEqual({ ms: 46, n: 3, dir: "late" });
    expect(r.diagnostics.some((x) => x.id === "tap.push-on-beat")).toBe(false);
  });

  test("a whole take that is late is an offset, not late pushes", () => {
    const taps = take(PUSHED, { offsetMs: 40 });
    const r = gradeRhythmTaps(taps, PUSHED, TAP_TOL, PROFILE, { level: 1, levels: 4 });
    expect(r.diagnostics.map((d) => d.id)).toEqual(["tap.offset"]);
    // Forgiven at level 1: every onset reads as on time once the offset is taken out.
    expect(r.onsets.every((o) => o.verdict === "on")).toBe(true);
    expect(r.pass).toBe(true);
  });

  test("a sixteenth push tapped on the beat is caught too", () => {
    const p: RhythmPattern = { downbeat: 1, bpm: 96, onsets: [0, 3 / 16, 1 / 2, 11 / 16] };
    const sixteenthMs = (60 / 96 / 4) * 1000;
    const taps = take(p, { move: (i) => (i === 1 || i === 3 ? sixteenthMs : 0) });
    const r = gradeRhythmTaps(taps, p, TAP_TOL, PROFILE);
    expect(r.pushesOnBeat).toEqual([1, 3]);
    expect(r.diagnostics.find((x) => x.id === "tap.push-on-beat")?.params.by).toBe("a sixteenth");
  });
});

describe("triplets", () => {
  /** Two bars of 4/4 at 80: triplets on beats 1 and 3, quarters on 2 and 4. */
  const TRIP: RhythmPattern = {
    downbeat: 1,
    bpm: 80,
    onsets: [0, 1, 2, 3, 4, 5, 6, 7].flatMap((b) =>
      b % 2 === 0 ? [b / 4, b / 4 + 1 / 12, b / 4 + 2 / 12] : [b / 4],
    ),
  };

  test("three even notes to the beat pass and read as even", () => {
    const r = gradeRhythmTaps(take(TRIP, { jitterMs: 10 }), TRIP, TAP_TOL, PROFILE, { level: 1, levels: 4 });
    expect(r.pass).toBe(true);
    expect(r.triplets.map((t) => t.shape)).toEqual(["even", "even", "even", "even"]);
    expect(r.triplets.map((t) => [t.bar, t.beat])).toEqual([
      [0, 1],
      [0, 3],
      [1, 1],
      [1, 3],
    ]);
    expect(r.diagnostics.some((d) => d.id === "tap.triplet-uneven")).toBe(false);
    expect(r.kinds.find((k) => k.kind === "triplet")).toMatchObject({ n: 8, matched: 8 });
  });

  test("two sixteenths and an eighth where the beat has a triplet", () => {
    const beatMs = (60 / 80) * 1000;
    const kinds = classifyRhythm(TRIP);
    // -trip moves from 1/3 to 1/4 of the beat, -let from 2/3 to 1/2.
    const taps = take(TRIP, {
      move: (i) => {
        const o = kinds[i];
        if (o?.kind !== "triplet") return 0;
        return o.inBeat < 0.5 ? (1 / 4 - 1 / 3) * beatMs : (1 / 2 - 2 / 3) * beatMs;
      },
    });
    const r = gradeRhythmTaps(taps, TRIP, TAP_TOL, PROFILE, { level: 4, levels: 4 });
    expect(r.triplets.map((t) => t.shape)).toEqual([
      "short-short-long",
      "short-short-long",
      "short-short-long",
      "short-short-long",
    ]);
    const d = r.diagnostics.find((x) => x.id === "tap.triplet-uneven");
    expect(d?.params).toEqual({ n: 4, of: 4, shape: "two quick notes and a long one", bar: 1 });
    expect(rhythmTapText(d as NonNullable<typeof d>)).toBe(
      "4 of 4 triplets came out as two quick notes and a long one. A triplet is three even notes to the beat: 1-trip-let.",
    );
    expect(r.pass).toBe(false);
  });

  test("even eighths where the beat has a triplet: two notes, said so", () => {
    const beatSec = 60 / 80;
    const targets = rhythmTargets(TRIP);
    const kinds = classifyRhythm(TRIP);
    const taps: number[] = [];
    kinds.forEach((o, i) => {
      if (o.kind === "beat") taps.push(targets[i] as number);
      // One tap on the "&" in place of the two thirds.
      else if (o.inBeat < 0.5) taps.push((targets[i] as number) + (1 / 2 - 1 / 3) * beatSec);
    });
    const r = gradeRhythmTaps(taps, TRIP, TAP_TOL, PROFILE);
    expect(r.triplets.map((t) => t.shape)).toEqual(["two", "two", "two", "two"]);
    expect(r.diagnostics.find((x) => x.id === "tap.triplet-uneven")?.params.shape).toBe("two notes");
  });

  test("the shape is measured in the learner's own beat, so a take that is late throughout still reads even", () => {
    const r = gradeRhythmTaps(take(TRIP, { offsetMs: 45 }), TRIP, TAP_TOL, PROFILE, { level: 3, levels: 4 });
    expect(r.triplets.every((t) => t.shape === "even")).toBe(true);
    expect(r.triplets[0]?.positions[0]).toBeCloseTo(1 / 3, 3);
    expect(r.triplets[0]?.positions[1]).toBeCloseTo(2 / 3, 3);
  });
});

describe("compound meter", () => {
  /** Two bars of 6/8 at 72 to the dotted quarter: 1 . li 2 la li | 1 . . 2 . . */
  const SIX: RhythmPattern = {
    downbeat: 1,
    bpm: 72,
    meter: "6/8",
    onsets: [0, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1, 1.5],
  };

  test("a 6/8 rhythm tapped as written passes; the window comes from the eighth", () => {
    const r = gradeRhythmTaps(take(SIX, { jitterMs: 10 }), SIX, TAP_TOL, PROFILE, { level: 1, levels: 4 });
    expect(r.pass).toBe(true);
    // An eighth at 72 to the dotted quarter lasts 277.8 ms: w = clamp(0.25 × 277.8, 50, 120) = 69.4 ms.
    expect(r.windowMs).toBeCloseTo(69.44, 1);
    expect(r.quarterBars).toEqual([]);
    expect(r.kinds.map((k) => k.kind)).toEqual(["beat", "sub"]);
  });

  test("the beat tapped in quarter notes (three to the bar) is named as the waltz count", () => {
    const beat: RhythmPattern = { downbeat: 1, bpm: 72, meter: "6/8", onsets: beatOnsets("6/8", 2) };
    const bar = rhythmBarSec(beat);
    // Three even taps a bar: 0, 1/3, 2/3.
    const taps = [0, 1, 2, 3, 4, 5].map((k) => 1 + (k / 3) * bar);
    const r = gradeRhythmTaps(taps, beat, TAP_TOL, PROFILE);
    expect(r.pass).toBe(false);
    expect(r.quarterBars).toEqual([0, 1]);
    const d = r.diagnostics.find((x) => x.id === "tap.grouping");
    expect(d?.params).toEqual({ n: 2, meter: "6/8", beats: 2, quarters: 3, count: "1 la li 2 la li" });
    expect(rhythmTapText(d as NonNullable<typeof d>)).toBe(
      "You tapped 3 even beats to the bar. 6/8 has 2 beats of three eighths: 1 la li 2 la li.",
    );
  });

  test("the dotted-quarter beat tapped right is two taps a bar and passes", () => {
    const beat: RhythmPattern = { downbeat: 1, bpm: 72, meter: "6/8", onsets: beatOnsets("6/8", 4) };
    const r = gradeRhythmTaps(take(beat, { jitterMs: 15 }), beat, TAP_TOL, PROFILE);
    expect(r.pass).toBe(true);
    expect(r.onsets.length).toBe(8);
    expect(r.diagnostics).toEqual([]);
  });

  test("12/8: six quarter taps to a bar of four beats", () => {
    const beat: RhythmPattern = { downbeat: 0.5, bpm: 60, meter: "12/8", onsets: beatOnsets("12/8", 1) };
    const bar = rhythmBarSec(beat);
    const taps = [0, 1, 2, 3, 4, 5].map((k) => 0.5 + (k / 6) * bar);
    const r = gradeRhythmTaps(taps, beat, TAP_TOL, PROFILE);
    expect(r.quarterBars).toEqual([0]);
    expect(r.diagnostics.find((x) => x.id === "tap.grouping")?.params).toMatchObject({
      beats: 4,
      quarters: 6,
      count: "1 la li 2 la li 3 la li 4 la li",
    });
  });
});

describe("the catalog rows", () => {
  test("every id this module emits has a text with no unfilled slot", () => {
    const eighthMs = (60 / PUSHED.bpm / 2) * 1000;
    const kinds = classifyRhythm(PUSHED).map((o) => o.kind);
    const runs = [
      gradeRhythmTaps(
        take(PUSHED, { move: (i) => (kinds[i] === "push" ? eighthMs : 0) }),
        PUSHED,
        TAP_TOL,
        PROFILE,
      ),
      gradeRhythmTaps(
        take(PUSHED, { move: (i) => (kinds[i] === "push" ? -50 : 0) }),
        PUSHED,
        TAP_TOL,
        PROFILE,
        { level: 3, levels: 4 },
      ),
      gradeRhythmTaps(
        take(
          { downbeat: 0, bpm: 100, onsets: [0, 1 / 8, 1 / 4, 3 / 8, 1 / 2, 5 / 8, 3 / 4] },
          { move: (i) => (i % 2 === 1 ? 45 : 0) },
        ),
        { downbeat: 0, bpm: 100, onsets: [0, 1 / 8, 1 / 4, 3 / 8, 1 / 2, 5 / 8, 3 / 4] },
        TAP_TOL,
        PROFILE,
        { level: 3, levels: 4 },
      ),
    ];
    const seen = new Set<string>();
    for (const r of runs)
      for (const d of r.diagnostics) {
        const text = rhythmTapText(d);
        if (text === null) continue;
        seen.add(d.id);
        expect(text).not.toMatch(/[{}]|undefined|\s{2}/);
      }
    expect([...seen].sort()).toEqual(["tap.kind-timing", "tap.push-early", "tap.push-on-beat"]);
    expect(Object.keys(RHYTHM_TAP_FEEDBACK).sort()).toEqual([
      "tap.grouping",
      "tap.kind-timing",
      "tap.push-early",
      "tap.push-late",
      "tap.push-on-beat",
      "tap.triplet-uneven",
    ]);
  });
});
