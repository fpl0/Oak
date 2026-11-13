// The realism layers on a real Strudel pattern (contracts §6.12, wave4.md §3.5): bounded, deterministic per seed
// and position, scoped to the reference side of an A/B, and grid-exact at R0.
import { describe, expect, test } from "bun:test";
import * as core from "@strudel/core";
import { TRACK_KEY } from "./haps.ts";
import { realismSpec } from "./realism.ts";
import {
  applyRealism,
  DETUNE_STEP_CENTS,
  detuneAt,
  hash32,
  isTargetTrack,
  realismScope,
  unitNoise,
} from "./realism-pattern.ts";

type Pattern = Strudel.Pattern;
type Hap = Strudel.Hap;

const tagged = (pattern: Pattern, track: string): Pattern =>
  (pattern.withContext as (fn: (c: Record<string, unknown>) => Record<string, unknown>) => Pattern).call(
    pattern,
    (c) => ({ ...c, [TRACK_KEY]: track }),
  );
/** Eight eighth notes of a melody, a bass on the beat and eighth-note hats, as a pattern source plays them. */
function item(prefix = "ref_"): Pattern {
  const mel = core.note(core.sequence(60, 62, 64, 65, 67, 65, 64, 62)).s("piano");
  const bass = core.note(core.sequence(36, 43, 36, 43)).s("upright");
  const hats = core.s(core.sequence("hh", "hh", "hh", "hh", "hh", "hh", "hh", "hh"));
  return core.stack(
    tagged(mel, `${prefix}mel`),
    tagged(bass, `${prefix}bass`),
    tagged(hats, `${prefix}drums`),
  ) as Pattern;
}
const TRACKS = ["ref_mel", "ref_bass", "ref_drums"];
const onsets = (p: Pattern, from = 0, to = 4): Hap[] =>
  p
    .queryArc(from, to)
    .filter((h) => h.hasOnset())
    .sort((a, b) => Number(a.whole?.begin.valueOf()) - Number(b.whole?.begin.valueOf()));
const begin = (h: Hap): number => Number(h.whole?.begin.valueOf());
const v = (h: Hap): Record<string, unknown> => h.value as Record<string, unknown>;
const trackOf = (h: Hap): string => String(h.context[TRACK_KEY]);
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

describe("noise", () => {
  test("hash and unit noise are deterministic and spread over [-1, 1]", () => {
    expect(hash32("abc")).toBe(hash32("abc"));
    expect(hash32("abc")).not.toBe(hash32("abd"));
    const xs = Array.from({ length: 2000 }, (_, i) => unitNoise(7, "t", String(i)));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...xs)).toBeLessThanOrEqual(1);
    expect(Math.min(...xs)).toBeLessThan(-0.95);
    expect(Math.max(...xs)).toBeGreaterThan(0.95);
    expect(Math.abs(xs.reduce((a, b) => a + b, 0) / xs.length)).toBeLessThan(0.06);
  });
});

describe("target and scope", () => {
  test("a target matches its own name and the pattern source's labels for it", () => {
    expect(isTargetTrack("bass", "bass")).toBe(true);
    expect(isTargetTrack("ref_bass", "bass")).toBe(true);
    expect(isTargetTrack("ref_bass_1", "bass")).toBe(true);
    expect(isTargetTrack("ref_bassline", "bass")).toBe(false);
    expect(isTargetTrack("mel", "bass")).toBe(false);
    expect(isTargetTrack("ref_lead_vox", "lead vox")).toBe(true);
    expect(isTargetTrack(null, "bass")).toBe(false);
  });
  test("with reference tracks present only they take realism; otherwise every track", () => {
    const withRef = realismScope(["ref_mel", "mel"]);
    expect(withRef("ref_mel")).toBe(true);
    expect(withRef("mel")).toBe(false);
    expect(withRef(null)).toBe(false);
    const all = realismScope(["mel", "bass"]);
    expect(all("mel")).toBe(true);
    expect(all(null)).toBe(true);
  });
});

describe("applyRealism", () => {
  test("R0 is the pattern itself: grid-exact", () => {
    const p = item();
    expect(applyRealism(p, realismSpec(0), { cps: 0.5, tracks: TRACKS })).toBe(p);
  });

  test("R1 moves each onset by at most ±15 ms, the same way every time, and keeps every note", () => {
    const cps = 0.5; // 120 bpm in 4/4
    const spec = realismSpec(1, { seed: 42 });
    // A window whose edges are off the grid by more than the jitter: every note stays inside it.
    const [from, to] = [1 / 16, 3 + 1 / 16];
    const clean = onsets(item(), from, to);
    const a = onsets(applyRealism(item(), spec, { cps, tracks: TRACKS }), from, to);
    const b = onsets(applyRealism(item(), spec, { cps, tracks: TRACKS }), from, to);
    expect(a.length).toBe(clean.length);
    const maxCycles = 0.015 * cps;
    const key = (h: Hap) => `${trackOf(h)}|${JSON.stringify(v(h).note ?? v(h).s)}`;
    // pair by (track, value) in order
    const byKey = (hs: Hap[]) => {
      const m = new Map<string, number[]>();
      for (const h of hs) m.set(key(h), [...(m.get(key(h)) ?? []), begin(h)]);
      return m;
    };
    const cleanBy = byKey(clean);
    const aBy = byKey(a);
    let moved = 0;
    for (const [k, times] of cleanBy) {
      const got = (aBy.get(k) ?? []).sort((x, y) => x - y);
      expect(got.length).toBe(times.length);
      times.forEach((t, i) => {
        const d = (got[i] as number) - t;
        expect(Math.abs(d)).toBeLessThanOrEqual(maxCycles + 1e-9);
        if (Math.abs(d) > 1e-6) moved++;
      });
    }
    expect(moved).toBeGreaterThan(clean.length * 0.8);
    expect(a.map(begin)).toEqual(b.map(begin));
    // another seed, another performance
    const c = onsets(applyRealism(item(), realismSpec(1, { seed: 43 }), { cps, tracks: TRACKS }), from, to);
    expect(c.map(begin)).not.toEqual(a.map(begin));
  });

  test("R1 velocities stay in [0.8, 1] and vary; a query of any window agrees with the whole", () => {
    const spec = realismSpec(1, { seed: 3 });
    const p = applyRealism(item(), spec, { cps: 0.5, tracks: TRACKS });
    const vels = onsets(p).map((h) => v(h).velocity as number);
    expect(Math.min(...vels)).toBeGreaterThanOrEqual(0.8);
    expect(Math.max(...vels)).toBeLessThanOrEqual(1);
    expect(new Set(vels.map((x) => x.toFixed(3))).size).toBeGreaterThan(10);
    // The scheduler queries small windows: the onsets it sees are exactly the ones of a single query.
    const whole = onsets(p, 0, 2).map((h) => `${trackOf(h)}@${begin(h).toFixed(6)}`);
    const pieces: string[] = [];
    for (let t = 0; t < 2; t += 0.05)
      for (const h of p.queryArc(t, Math.min(2, t + 0.05)))
        if (h.hasOnset()) pieces.push(`${trackOf(h)}@${begin(h).toFixed(6)}`);
    expect(pieces.sort()).toEqual(whole.filter((x) => Number(x.split("@")[1]) < 2).sort());
  });

  test("R2 swings every part but the target and adds room where none is set", () => {
    const spec = realismSpec(2, { seed: 1, swung: true, target: "mel" });
    const noTiming = { ...spec, timingMs: 0 };
    const p = applyRealism(item(), noTiming, { cps: 0.5, tracks: TRACKS, target: "mel" });
    const hats = onsets(p, 0, 1).filter((h) => trackOf(h) === "ref_drums");
    // straight eighths at 0, 1/8, 2/8 …: the off-beat eighths land on the last triplet (1/8 + 1/24)
    expect(hats.map((h) => begin(h).toFixed(9)).slice(0, 4)).toEqual(
      [0, 1 / 6, 0.25, 0.25 + 1 / 6].map((x) => x.toFixed(9)),
    );
    const mel = onsets(p, 0, 1).filter((h) => trackOf(h) === "ref_mel");
    expect(near(begin(mel[1] as Hap), 1 / 8)).toBe(true);
    expect(onsets(p, 0, 1).every((h) => v(h).room === 0.3)).toBe(true);
  });

  test("R3 buries the target 6 dB; R4 puts it on the lead sound with a quantized drift of at most ±30 cents", () => {
    const r3 = applyRealism(item(), realismSpec(3, { seed: 9, target: "mel" }), {
      cps: 0.5,
      tracks: TRACKS,
    });
    for (const h of onsets(r3, 0, 1)) {
      if (trackOf(h) === "ref_mel")
        expect((v(h).gain as number).toFixed(4)).toBe((10 ** (-6 / 20)).toFixed(4));
      else expect(v(h).gain).toBeUndefined();
    }
    const spec4 = realismSpec(4, { seed: 9, target: "mel", vocalLead: "tenor" });
    const r4 = applyRealism(item(), spec4, { cps: 0.5, tracks: TRACKS });
    const mel = onsets(r4, 0, 8).filter((h) => trackOf(h) === "ref_mel");
    expect(mel.every((h) => v(h).s === "tenor")).toBe(true);
    const cents = mel.map((h) => {
      const n = v(h).note as number;
      return Math.round((n - Math.round(n)) * 100);
    });
    expect(Math.max(...cents.map(Math.abs))).toBeLessThanOrEqual(30);
    expect(cents.every((c) => c % DETUNE_STEP_CENTS === 0)).toBe(true);
    expect(new Set(cents).size).toBeGreaterThan(2);
    // the bass and drums keep their sounds
    expect(
      onsets(r4, 0, 1)
        .filter((h) => trackOf(h) !== "ref_mel")
        .every((h) => v(h).s !== "tenor"),
    ).toBe(true);
    // the drift is a slow curve: neighbouring bars differ by at most one step or two
    for (let bar = 0; bar < 16; bar++)
      expect(Math.abs(detuneAt(spec4, bar + 1) - detuneAt(spec4, bar))).toBeLessThanOrEqual(30);
  });

  test("the learner's side of an A/B is never humanised", () => {
    const learner = tagged(core.note(core.sequence(60, 62, 64, 65)).s("piano"), "mel");
    const p = core.stack(item(), learner) as Pattern;
    const out = applyRealism(p, realismSpec(4, { seed: 5, target: "mel" }), {
      cps: 0.5,
      tracks: [...TRACKS, "mel"],
    });
    const mine = onsets(out, 0, 1).filter((h) => trackOf(h) === "mel");
    expect(mine.map(begin)).toEqual([0, 0.25, 0.5, 0.75]);
    expect(
      mine.every((h) => v(h).s === "piano" && v(h).velocity === undefined && v(h).room === undefined),
    ).toBe(true);
  });
});
