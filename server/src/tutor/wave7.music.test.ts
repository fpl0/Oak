// Wave 7 against Oak's real analysis: the eight track-capstone fixtures (JC1–JC4, RC1–RC2, AC1's two versions, AC2)
// through headless Strudel and the grader's views, the advanced tracks' included (`twoFiveView`, `voicingView`,
// `walkingBassView`, `reharmView`, `contrafactView`, `tensionView`, `feelView`, `claveView`, `claveAlignmentView`,
// `registerClashView`, `levelsView`, `euclidView`, `polyrhythmView`, `densityView`, `compareIdioms`), shaped by
// `reviewFactsFrom` as the server's adapter is asked to (apiNotes). The review cassettes (wave7.reviews.test.ts) are
// anchored to these facts; every try-it is evaluated and its musical claim checked; the vocabulary's and the answer
// guard's facts are checked against @oak/theory. (Test only: the tutor itself imports no package.)
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { type KeySpec, swingRatio as kitSwingRatio, type MeterId, R } from "@oak/content-kit";
import {
  analyzePiece,
  bassView,
  bluesView,
  chromaticHarmonyView,
  claveAlignmentView,
  claveView,
  compareIdioms,
  compingView,
  contrafactView,
  contrastAxes,
  densityView,
  detectDevices,
  euclidView,
  feelView,
  formView,
  isNotBuilt,
  keyPlanView,
  levelsView,
  modeView,
  polyrhythmView,
  registerClashView,
  reharmView,
  rhythmView,
  swingView,
  tensionView,
  twoFiveView,
  voicingView,
  walkingBassView,
} from "@oak/grader";
import { evalHeadless } from "@oak/grader/testing";
import {
  CINQUILLO,
  chordScales,
  claveSteps,
  euclidIdentity,
  polymeterPeriod,
  rootlessVoicing,
  swingRatio,
  TRESILLO,
  toCode,
  tritoneSub,
} from "@oak/theory";
import { terms as COURSE_TERMS } from "../../../content/terms.ts";
import { strudel } from "../../../packages/grader/src/analyze/__support__/fixtures.ts";
import { harmonyView } from "../../../packages/grader/src/analyze/harmony-view.ts";
import { swingRatioOf } from "./answer-guard-w7.ts";
import type { ReviewFacts } from "./domain.ts";
import { HARMONY_TERMS } from "./lint/review.ts";
import { type ReviewFactsInput, reviewFactsFrom } from "./review-facts.ts";
import * as X from "./testing/wave7-fixtures.ts";
import { W7_TERMS } from "./vocabulary.ts";

setDefaultTimeout(120_000);

interface W7Opts {
  code: string;
  bars: number;
  key: KeySpec;
  meter?: MeterId;
  chords?: string;
  bass?: string;
  comp?: string;
  melody?: string;
  reharm?: { reference: string[]; melody?: { onset: [number, number]; midi: number }[] };
  contrafact?: { changes: string[]; model: { onset: [number, number]; midi: number }[] };
  clave?: string;
  align?: string[];
  euclid?: string[];
  poly?: [string, string];
  feel?: string[];
}

const ok = <T>(v: T) => (isNotBuilt(v) ? null : v);

async function factsOf7(o: W7Opts): Promise<{ facts: ReviewFacts; n: unknown }> {
  const meter: MeterId = o.meter ?? "4/4";
  const n = await strudel(o.code, o.bars);
  const ctx = { meter, key: o.key, bars: o.bars };
  const code = o.code;
  const view = harmonyView(n, ctx);
  const analysis = analyzePiece(n, { ...ctx, code } as never);
  const unitsPerBar = 4;
  const notes = n.all
    .filter((e) => e.midi !== null && e.drum === undefined)
    .map((e) => {
      const at = R.toNum(e.onset);
      const bar = Math.floor(at);
      return {
        track: e.track,
        midi: e.midi as number,
        bar: bar + 1,
        beat: Math.round(((at - bar) * unitsPerBar + 1) * 100) / 100,
      };
    });
  // One symbol a bar from the harmony view (the chord sounding at each bar's start): the changes a hand-voiced line
  // is read against.
  const changes: string[] = [];
  for (let b = 1; b <= o.bars; b++) {
    const beat = view.beats.find((x) => x.bar === b && x.chord !== null);
    const slot = beat ? view.slots[beat.chord as number] : undefined;
    changes.push(slot?.symbol ?? "");
  }
  const input: ReviewFactsInput = {
    view: view as never,
    analysis: analysis as never,
    notes,
    meter,
    key: `${o.key.tonic} ${o.key.mode}`,
    form: formView(n, { code, bars: o.bars }) as never,
    contrast: contrastAxes as never,
    bass: bassView(n, ctx) as never,
    blues: bluesView(n, ctx) as never,
    swing: swingView(n, meter) as never,
    chromatic: chromaticHarmonyView(n, { ...ctx, code } as never) as never,
    mode: (span) => modeView(n, { ...ctx, ...(span ? { span } : {}) } as never) as never,
    keyPlan: keyPlanView(n, { ...ctx, code } as never) as never,
    devices: detectDevices(n, { ...ctx, code } as never) as never,
    durationSec: (analysis as unknown as { durationSec?: number }).durationSec ?? null,
    rhythm: rhythmView(n, ctx as never) as never,
    // Wave 7.
    twoFives: twoFiveView(n, ctx as never) as never,
    ...(o.chords
      ? { voicings: { [o.chords]: voicingView(n, { ...ctx, track: o.chords, changes } as never) } }
      : {}),
    ...(o.bass
      ? {
          walking: (() => {
            const v = ok(
              walkingBassView(n, { ...ctx, bass: o.bass, harmony: o.chords ?? "@chords" } as never),
            );
            return v ? { track: o.bass as string, bars: v as never } : null;
          })(),
        }
      : {}),
    ...(o.comp
      ? {
          comping: (() => {
            const v = ok(compingView(n, { ...ctx, track: o.comp } as never));
            return v ? { track: o.comp as string, bars: v as never } : null;
          })(),
        }
      : {}),
    ...(o.reharm
      ? {
          reharm: ok(
            reharmView(n, {
              ...ctx,
              code,
              reference: o.reharm.reference,
              ...(o.reharm.melody ? { melody: o.reharm.melody, melodyTrack: o.melody ?? "@melody" } : {}),
            } as never),
          ) as never,
          reharmMelodyGiven: !!o.reharm.melody,
        }
      : {}),
    ...(o.contrafact
      ? {
          contrafact: ok(
            contrafactView(n, {
              ...ctx,
              changes: o.contrafact.changes,
              model: o.contrafact.model,
              ...(o.melody ? { melody: o.melody } : {}),
              ...(o.chords ? { harmony: o.chords } : {}),
            } as never),
          ) as never,
        }
      : {}),
    ...(o.melody ? { tensions: tensionView(n, { ...ctx, melody: o.melody } as never) as never } : {}),
    ...(o.feel ? { feel: feelView(n, { ...ctx, tracks: o.feel } as never) as never } : {}),
    ...(o.clave
      ? { clave: { track: o.clave, view: claveView(n, { ...ctx, track: o.clave } as never) as never } }
      : {}),
    ...(o.align
      ? {
          claveAlign: o.align.map((t) => ({
            track: t,
            windows: (ok(claveAlignmentView(n, { ...ctx, track: t, clave: o.clave } as never)) ??
              []) as never,
          })),
        }
      : {}),
    registerClashes: registerClashView(n, ctx as never) as never,
    levels: levelsView(n, ctx as never) as never,
    ...(o.euclid
      ? {
          euclid: o.euclid.map((t) => ({
            track: t,
            bars: euclidView(n, { ...ctx, track: t, steps: 16 } as never) as never,
          })),
        }
      : {}),
    ...(o.poly
      ? {
          polyrhythm: {
            a: o.poly[0],
            b: o.poly[1],
            bars: (ok(polyrhythmView(n, { ...ctx, a: o.poly[0], b: o.poly[1] } as never)) ?? []) as never,
          },
        }
      : {}),
    density: densityView(n, ctx as never) as never,
  };
  return { facts: reviewFactsFrom(input), n };
}

const key = (tonic: string, mode = "major") => ({ tonic, mode }) as KeySpec;
const C = key("C");
const F = key("F");

/** The Wave 7 part of the facts, the part this wave's views give (the earlier waves' parts have their own tests). */
const W7_FIELDS = [
  "twoFives",
  "voicings",
  "walking",
  "comping",
  "reharm",
  "contrafact",
  "tensions",
  "feel",
  "clave",
  "claveAlign",
  "registerClashes",
  "levels",
  "euclid",
  "polyrhythm",
  "density",
] as const;
const w7Part = (f: ReviewFacts) =>
  Object.fromEntries(W7_FIELDS.filter((k) => f[k] !== undefined).map((k) => [k, f[k]]));

describe("the Wave 7 capstone facts are what Oak's analysis reads", () => {
  const cases: [string, W7Opts, ReviewFacts][] = [
    ["JC1", { code: X.JC1_CODE, bars: 16, key: C, chords: "chords", melody: "mel" }, X.JC1_FACTS],
    [
      "JC2",
      { code: X.JC2_CODE, bars: 12, key: F, chords: "chords", bass: "bass", melody: "mel" },
      X.JC2_FACTS,
    ],
    [
      "JC3",
      {
        code: X.JC3_CODE,
        bars: 32,
        key: key("Bb"),
        chords: "chords",
        bass: "bass",
        melody: "mel",
        contrafact: { changes: X.JC3_CHANGES, model: X.JC3_MODEL },
      },
      X.JC3_FACTS,
    ],
    [
      "JC4",
      {
        code: X.JC4_CODE,
        bars: 8,
        key: C,
        chords: "chords",
        melody: "mel",
        reharm: { reference: X.JC4_ORIGINAL, melody: X.JC4_MELODY },
      },
      X.JC4_FACTS,
    ],
    [
      "RC1",
      { code: X.RC1_CODE, bars: 4, key: key("E", "minor"), feel: ["snare", "hats", "bass", "clav"] },
      X.RC1_FACTS,
    ],
    [
      "RC2",
      {
        code: X.RC2_CODE,
        bars: 8,
        key: C,
        clave: "perc",
        align: ["keys", "bass"],
        euclid: ["perc3"],
        poly: ["perc2", "kick"],
      },
      X.RC2_FACTS,
    ],
    ["AC1 Swing", { code: X.AC1_A_CODE, bars: 8, key: F, melody: "mel" }, X.AC1A_FACTS],
    ["AC1 Bossa", { code: X.AC1_B_CODE, bars: 8, key: F, melody: "mel" }, X.AC1B_FACTS],
    [
      "AC2",
      { code: X.AC2_CODE, bars: 4, key: key("D"), chords: "chords", melody: "mel", feel: ["chords", "hats"] },
      X.AC2_FACTS,
    ],
  ];
  test.each(cases)("%s", async (_id, opts, fixture) => {
    const { facts } = await factsOf7(opts);
    expect(w7Part(facts)).toEqual(w7Part(fixture));
    expect({ key: facts.key, bars: facts.bars }).toEqual({ key: fixture.key, bars: fixture.bars });
  });

  test("what each review names is there: keys visited, faults, devices, clave, levels", () => {
    expect(new Set(X.JC1_FACTS.twoFives?.map((t) => t.target))).toEqual(
      new Set(["C major", "E♭ major", "A minor"]),
    );
    expect(X.JC2_FACTS.walking?.faults).toEqual([
      { bar: 6, faults: ["beat 1 is not the chord's root"] },
      { bar: 8, faults: ["beat 4 leaps 9 half steps into the next bar"] },
    ]);
    expect(X.JC3_FACTS.contrafact).toMatchObject({ changesRatio: 1, sharedBars: [1, 9, 25] });
    expect(X.JC4_FACTS.reharm?.melodyKept).toBe(true);
    expect(new Set(X.JC4_FACTS.reharm?.devices.map((d) => d.device))).toEqual(
      new Set(["secondary ii–V", "tritone sub", "diminished passing"]),
    );
    expect(X.RC1_FACTS.feel?.find((f) => f.track === "snare")?.offsetMs).toBe(15);
    expect(X.RC2_FACTS.clave).toMatchObject({ type: "son", direction: "3-2", coveredBars: 6, missing: [7] });
    expect(X.RC2_FACTS.polyrhythm).toMatchObject({ ratio: "3:2", bars: [1, 2, 3, 4, 5, 6, 7, 8] });
    expect(X.AC2_FACTS.levels?.find((l) => l.track === "pad")).toMatchObject({ heard: false });
    expect(X.AC2_FACTS.voicings?.map((v) => [v.type, v.bars])).toEqual([
      ["rootless-a", [1, 2]],
      ["other", [3]],
      ["rootless-b", [4]],
    ]);
  });

  test("AC1: the same tune, and what the two idioms change", async () => {
    const a = await strudel(X.AC1_A_CODE, 8);
    const b = await strudel(X.AC1_B_CODE, 8);
    expect(compareIdioms(a, b, { meter: "4/4", melody: "mel" } as never)).toEqual(X.AC1_COMPARED);
    expect(X.AC1_COMPARED.sameTune).toBe(true);
  });
});

describe("each try-it does what its review says (headless Strudel and the grader's views)", () => {
  const pcs = (ms: readonly number[]) => ms.map((m) => ((m % 12) + 12) % 12);
  const notesOf = async (code: string, bars: number) =>
    (await evalHeadless(code, bars)).events.filter((e) => e.midi !== null && e.midi !== undefined);

  test("JC1: the lifted 3rd clears the clash; bar 9 starts on the 3rd of Bm7b5", async () => {
    const lifted = await strudel(X.JC1_REVIEW.revisions[0]?.tryCode as string, 2);
    expect(registerClashView(lifted, { meter: "4/4" } as never)).toEqual([]);
    const mel = await notesOf(X.JC1_REVIEW.revisions[1]?.tryCode as string, 1);
    expect(mel.map((e) => e.midi)).toEqual([74, 72, 71]);
    expect([11, 2, 5, 9]).toContain(74 % 12);
  });

  test("JC2: bar 6 starts on B with A♭ on beat 3; bar 8 steps into bar 9", async () => {
    const b6 = await notesOf(X.JC2_REVIEW.revisions[0]?.tryCode as string, 1);
    expect(b6.map((e) => e.midi)).toEqual([47, 50, 44, 43]);
    const b89 = (await notesOf(X.JC2_REVIEW.revisions[1]?.tryCode as string, 2)).map((e) => e.midi as number);
    expect(Math.abs((b89[4] as number) - (b89[3] as number))).toBeLessThanOrEqual(2);
  });

  test("JC3: the bass walks into each chord; D is the 3rd of B♭7", async () => {
    const code = `chords: chord("<[Bb^7 G7] [Cm7 F7]>").voicing().s("piano")\n${X.JC3_REVIEW.revisions[0]?.tryCode}`;
    const n = await strudel(code, 2);
    const walk = walkingBassView(n, { meter: "4/4", bars: 2, bass: "bass", harmony: "chords" } as never);
    expect(isNotBuilt(walk)).toBe(false);
    for (const b of walk as { rootOnOne: boolean; chordToneOnThree: boolean; quarters: boolean }[])
      expect(b).toMatchObject({ quarters: true, rootOnOne: true, chordToneOnThree: true });
    expect((walk as { approach: { semis: number } | null }[])[0]?.approach?.semis).toBeLessThanOrEqual(2);
    const mel = await notesOf(X.JC3_REVIEW.revisions[1]?.tryCode as string, 1);
    expect((mel.at(-1)?.midi as number) % 12).toBe(2);
  });

  test("JC4: Fm7 B♭7 makes a backdoor; Em7b5 A7 aims at D minor and lands", async () => {
    const back = await strudel(
      `chords: chord("<C^7 [Em7 A7] Dm7 Db7 C^7 C#o7 [Fm7 Bb7] C^7>").voicing().s("piano")\nmel: ${X.JC4_TUNE}.s("vibes")`,
      8,
    );
    const r = reharmView(back, { meter: "4/4", key: C, bars: 8, reference: X.JC4_ORIGINAL } as never);
    expect((r as { devices: { device: string; bar: number }[] }).devices.map((d) => d.device)).toContain(
      "backdoor",
    );
    const minor = await strudel(X.JC4_REVIEW.revisions[1]?.tryCode as string, 4);
    expect(twoFiveView(minor, { meter: "4/4", key: C, bars: 4 } as never)[0]).toMatchObject({
      bar: 2,
      target: "D minor",
      resolved: true,
    });
  });

  test("RC1: quieter hats sit further under the loudest part; two clav stabs drop to .3", async () => {
    const piece = X.RC1_CODE.replace(/^hats: .*$/m, X.RC1_REVIEW.revisions[0]?.tryCode as string);
    const lv = levelsView(await strudel(piece, 1), { meter: "4/4" } as never);
    const before = X.RC1_FACTS.levels?.find((l) => l.track === "hats")?.relDb as number;
    expect(lv.find((l) => l.track === "hats")?.relDb as number).toBeLessThan(before);
    const clav = (await evalHeadless(X.RC1_REVIEW.revisions[1]?.tryCode as string, 1)).events;
    const vel = [
      ...new Set(
        clav.map((e) => `${e.onset}:${(e as { value?: { velocity?: number } }).value?.velocity ?? 1}`),
      ),
    ];
    expect(vel.filter((v) => v.endsWith(":0.3"))).toHaveLength(2);
  });

  test("RC2: the clave holds all eight bars; the bass faces the clave as written", async () => {
    const clave = claveView(await strudel(X.RC2_REVIEW.revisions[0]?.tryCode as string, 8), {
      meter: "4/4",
      bars: 8,
      track: "perc",
    } as never);
    expect(clave).toMatchObject({ first: { type: "son", direction: "3-2" }, coveredBars: 8 });
    const piece = `${X.RC2_REVIEW.revisions[0]?.tryCode}\n${X.RC2_REVIEW.revisions[1]?.tryCode}`;
    const al = claveAlignmentView(await strudel(piece, 8), {
      meter: "4/4",
      bars: 8,
      track: "bass",
      clave: "perc",
    } as never);
    for (const w of al as { shared: number; crossed: number }[]) expect(w.shared).toBeGreaterThan(w.crossed);
  });

  test("AC1: Bossa's guitar strikes twice in bars 4 and 8; Swing's bass steps into each chord", async () => {
    const g = await evalHeadless(X.AC1_REVIEW.revisions[0]?.tryCode as string, 8);
    const perBar = (b: number) =>
      new Set(g.events.filter((e) => Math.floor(e.onset + 1e-9) === b).map((e) => e.onset)).size;
    expect([perBar(0), perBar(3), perBar(7)]).toEqual([4, 2, 2]);
    const code = `chords: chord("<F^7 Dm7 Gm7 C7>").voicing().s("piano")\n${X.AC1_REVIEW.revisions[1]?.tryCode}`;
    const walk = walkingBassView(await strudel(code, 4), {
      meter: "4/4",
      bars: 4,
      bass: "bass",
      harmony: "chords",
    } as never);
    for (const b of (walk as { bar: number; rootOnOne: boolean; approach: { semis: number } | null }[]).slice(
      0,
      3,
    ))
      expect([b.rootOnOne, (b.approach?.semis ?? 0) <= 2]).toEqual([true, true]);
  });

  test("AC2: the lifted bar 3 has no clash; the raised pad is heard", async () => {
    const piece = X.AC2_CODE.replace(/^chords: .*$/m, X.AC2_REVIEW.revisions[0]?.tryCode as string).replace(
      /^pad: .*$/m,
      X.AC2_REVIEW.revisions[1]?.tryCode as string,
    );
    const n = await strudel(piece, 4);
    expect(registerClashView(n, { meter: "4/4" } as never).filter((c) => c.bar === 3)).toEqual([]);
    expect(levelsView(n, { meter: "4/4" } as never).find((l) => l.track === "pad")).toMatchObject({
      heard: true,
    });
    // Bar 3 over F♯ in the bass: A C♯ E G♯ are its 3rd, 5th, 7th and 9th (a rootless A of F♯m9).
    expect(pcs([57, 61, 64, 68]).map((p) => (p - 6 + 12) % 12)).toEqual([3, 7, 10, 2]);
  });
});

describe("the vocabulary's and the answer guard's facts are @oak/theory's", () => {
  test("swing amounts and ratios (forms_tracks, the swingBy forms)", () => {
    for (const [a, r] of [
      [0.2, 1.5],
      [1 / 3, 2],
      [0.5, 3],
    ] as const) {
      expect(swingRatio(a)).toBeCloseTo(r, 9);
      expect(kitSwingRatio(a)).toBeCloseTo(r, 9);
      expect(swingRatioOf(a)).toBeCloseTo(r, 9);
    }
  });
  test("the clave grids, the rootless shapes, the tritone sub, the polymeter, the named Euclids, chord-scales", () => {
    expect(claveSteps("son", "3-2")).toEqual([0, 3, 6, 10, 12]);
    expect(pcs3(rootlessVoicing("Dm7", "A"))).toEqual([5, 9, 0, 4]);
    expect(pcs3(rootlessVoicing("Dm7", "B"))).toEqual([0, 4, 5, 9]);
    expect(toCode(tritoneSub("G7"))).toBe("Db7");
    expect(polymeterPeriod(3, 4)).toBe(3);
    expect(euclidIdentity([...TRESILLO], 8)).toEqual({ pulses: 3, steps: 8, rotation: 0 });
    expect(euclidIdentity([...CINQUILLO], 8)).toEqual({ pulses: 5, steps: 8, rotation: 0 });
    expect(chordScales("Dm7")[0]).toBe("dorian");
    expect(chordScales("G7")[0]).toBe("mixolydian");
    expect(chordScales("Dm7b5")[0]).toBe("locrian");
    expect(chordScales("G7alt")[0]).toBe("altered");
  });
  test("every Wave 7 term the vocabulary and the review lint wait for is a glossary term", () => {
    const ids = new Set(COURSE_TERMS.map((t) => t.id as string));
    for (const id of Object.values(W7_TERMS)) expect(ids.has(id)).toBe(true);
    for (const r of HARMONY_TERMS) if (r.term !== null) expect(ids.has(r.term)).toBe(true);
  });
});

const pcs3 = (ms: readonly number[]) => ms.map((m) => ((m % 12) + 12) % 12);
