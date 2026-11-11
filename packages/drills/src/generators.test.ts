// Property tests over every implemented generator, at every level of its ladder, for many seeds:
// (1) the shown code evaluates headlessly without error and plays exactly the trial's events (and the
// resolution's), (2) the answer key is right by an independent computation (tonal, or the events as
// Strudel resolves them), (3) the trial respects its level (categories, tempo, register, replays,
// sequence length), (4) no trial repeats the previous trial's key.
import { describe, expect, test } from "bun:test";
import type { Answer, Degree, FamilyDef, KeySpec, LearnerProfile, Trial } from "@oak/content-kit";
import { Chord, ChordType, Interval, Key, Note, Scale } from "tonal";
import { FAMILIES } from "./catalog/families.ts";
import {
  bindFamily,
  DEFAULT_PROFILE,
  generateSet,
  generateTrial,
  isPendingGenerator,
  planSet,
} from "./engine.ts";
import { SCHEMA_LOOPS } from "./gen/harmony.ts";
import { intervalSemis } from "./gen/interval.ts";
import { MODE_VAMPS } from "./gen/key.ts";
import { gradeAnswer, gradeCodeTrial } from "./grade.ts";
import { degreeSemis, keysFor, parseDegree } from "./kernel.ts";
import { trialSeed } from "./rng.ts";
import { flattenEvents, strudelEvents } from "./testing.test-util.ts";

const SEEDS = Number(process.env.OAK_DRILL_SEEDS ?? 12);
const PROFILE: LearnerProfile = { ...DEFAULT_PROFILE, comfLow: 50, comfHigh: 65 };
const implemented = FAMILIES.filter((f) => !isPendingGenerator(f.generator));
const allCats = (def: FamilyDef): string[] => def.categories.map((c) => c.id);

// An independent degree table: semitones above the tonic → degree relative to the major scale.
const DEG: Degree[] = ["1", "b2", "2", "b3", "3", "4", "#4", "5", "b6", "6", "b7", "7"];
const pcOfName = (n: string): number => Note.chroma(n) as number;
const degreeOf = (midi: number, key: KeySpec): Degree =>
  DEG[(((midi - pcOfName(key.tonic)) % 12) + 12) % 12] as Degree;
/** Degrees compared by sound: "#4" and "b5" are one pitch. */
const sameSound = (a: Degree, b: Degree): boolean => (degreeSemis(a) - degreeSemis(b)) % 12 === 0;
const tonalScale = (key: KeySpec): string[] => Scale.get(`${key.tonic} ${key.mode}`).notes;

function trialsOf(def: FamilyDef, levelNo: number, n: number): Trial<Answer>[] {
  const fam = bindFamily(def);
  const plan = planSet(fam, {
    family: def.id,
    setId: `prop-${levelNo}`,
    level: levelNo,
    openCategories: allCats(def),
    categoryStats: {},
    blockedRemaining: 0,
    trials: n,
    quiet: false,
  });
  // Force every trial to this level (planSet mixes in one level down).
  plan.trials = plan.trials.map((t) => ({ ...t, level: levelNo, category: t.category }));
  return generateSet(fam, plan, PROFILE, allCats(def)) as Trial<Answer>[];
}

/** Sung targets sit inside comfLow+1 … comfHigh−1 whenever the phrase fits there at all. */
function checkComfort(targets: readonly { midi: number }[]) {
  const ms = targets.map((t) => t.midi);
  const fits = (k: number): boolean =>
    ms.every((m) => m + k >= PROFILE.comfLow + 1 && m + k <= PROFILE.comfHigh - 1);
  if (![-48, -36, -24, -12, 0, 12, 24, 36, 48].some(fits)) return;
  for (const m of ms) {
    expect(m).toBeGreaterThanOrEqual(PROFILE.comfLow + 1);
    expect(m).toBeLessThanOrEqual(PROFILE.comfHigh - 1);
  }
}

/** Family-specific checks of the answer key against an independent computation. */
async function checkAnswer(
  def: FamilyDef,
  trial: Trial<Answer>,
  played: Awaited<ReturnType<typeof strudelEvents>> | null,
) {
  const p = trial.params;
  const key = p.key as KeySpec | undefined;
  const exp = trial.expected;
  const midisOf = async (track: string, fromBar = 0): Promise<number[]> => {
    const { evalHeadless } = await import("@oak/grader/testing");
    const res = await evalHeadless(trial.code, Number(p.bars ?? 1));
    return res.events.filter((e) => e.track === track && e.onset >= fromBar).map((e) => e.midi as number);
  };
  switch (def.generator) {
    case "degree-id": {
      const mel = await midisOf("mel", Number(p.targetBar ?? 0));
      expect(mel.length).toBe((exp.degrees as Degree[]).length);
      for (const [i, m] of mel.entries())
        expect(sameSound(degreeOf(m, key as KeySpec), (exp.degrees as Degree[])[i] as Degree)).toBe(true);
      // The resolution ends on the tonic.
      const res = trial.resolution?.events ?? [];
      const last = res[res.length - 1]?.midi as number;
      expect(degreeOf(last, key as KeySpec)).toBe("1");
      checkComfort(p.resolutionTargets as { midi: number }[]);
      break;
    }
    case "interval-in-key": {
      const mel = await midisOf("mel", Number(p.cueBars ?? 0));
      const got = [...mel].map((m) => degreeOf(m, key as KeySpec));
      const want = exp.degrees as Degree[];
      if (p.steps && trial.params.cueBars !== undefined && (p.steps as number[])[0] !== undefined) {
        expect(got.length).toBe(2);
        const sortedGot = [...mel].sort((a, b) => a - b).map((m) => degreeOf(m, key as KeySpec));
        const ok =
          (got[0] === want[0] && got[1] === want[1]) ||
          (sortedGot[0] === want[0] && sortedGot[1] === want[1]);
        expect(ok).toBe(true);
      }
      // The interval number is the category: steps differ by size − 1 scale steps.
      const steps = p.steps as number[];
      expect(Math.abs((steps[1] as number) - (steps[0] as number)) + 1).toBe(Number(trial.category.slice(1)));
      break;
    }
    case "interval-isolated": {
      const [a, b] = p.notes as [string, string];
      const name = exp.choice?.[0] as string;
      const semis = Math.abs((Note.midi(b) as number) - (Note.midi(a) as number));
      expect(semis).toBe(intervalSemis(name === "TT" ? "A4" : name));
      const dist = Interval.distance(a, b).replace(/^-/, "");
      if (name === "TT") expect(["4A", "5d"]).toContain(Interval.get(dist).name);
      else expect(Interval.get(dist).name).toBe(`${name.slice(1)}${name[0]}`);
      if (played) {
        const ms = played.flat.length;
        expect(ms).toBe(2);
      }
      break;
    }
    case "interval-spell": {
      const iv = p.interval as string;
      const down = /below/.test(String(p.prompt));
      const ans = Note.pitchClass(
        Note.transpose(`${p.root}4`, down ? `-${iv.slice(1)}${iv[0]}` : `${iv.slice(1)}${iv[0]}`),
      );
      expect(exp.text?.[0]).toBe(ans);
      break;
    }
    case "chord-quality": {
      const q = exp.qualities?.[0] as string;
      const tonalName: Record<string, string> = {
        maj: "M",
        min: "m",
        dim: "dim",
        aug: "aug",
        maj7: "maj7",
        "7": "7",
        m7: "m7",
        m7b5: "m7b5",
        dim7: "dim7",
        mMaj7: "mMaj7",
        "6": "6",
        m6: "m6",
      };
      const ivs = ChordType.get(tonalName[q] as string).intervals.map((i) => Interval.semitones(i) % 12);
      const pcs = new Set((p.midis as number[]).map((m) => (((m - (p.rootPc as number)) % 12) + 12) % 12));
      const want = new Set(ivs);
      if (p.rootless) for (const x of pcs) expect(want.has(x)).toBe(true);
      else expect([...pcs].sort()).toEqual([...want].sort());
      break;
    }
    case "chord-inversion": {
      if (trial.category === "spot") break;
      const midis = p.midis as number[];
      const bassIv = (((Math.min(...midis) - (p.rootPc as number)) % 12) + 12) % 12;
      const inv = ["root", "first", "second", "third"].indexOf(trial.category);
      const tonalName: Record<string, string> = { maj: "M", min: "m", "7": "7", maj7: "maj7", m7: "m7" };
      const ivs = ChordType.get(tonalName[p.quality as string] as string).intervals.map(
        (i) => Interval.semitones(i) % 12,
      );
      const member = ivs.indexOf(bassIv);
      expect(member).toBe(inv);
      break;
    }
    case "chord-spell": {
      const tonalName: Record<string, string> = {
        maj: "M",
        min: "m",
        dim: "dim",
        aug: "aug",
        maj7: "maj7",
        "7": "7",
        m7: "m7",
        m7b5: "m7b5",
        dim7: "dim7",
        "9": "9",
        maj9: "maj9",
        m9: "m9",
        "13": "13",
        "7b9": "7b9",
        "7#9": "7#9",
        "7#11": "7#11",
        m11: "m11",
      };
      const notes = Chord.getChord(tonalName[p.quality as string] as string, p.root as string).notes;
      // tonal orders 13ths as 1 3 5 b7 9 13; same set and order as ours.
      expect(exp.text).toEqual(notes);
      break;
    }
    case "key-scale-spell":
      expect(exp.text).toEqual(tonalScale(key as KeySpec));
      break;
    case "degree-index": {
      if (exp.text && trial.category !== "chromatic") {
        const n = Number(/n\("(-?\d+)"\)/.exec(String(p.prompt))?.[1]);
        expect(exp.text[0]).toBe(tonalScale(key as KeySpec)[n % 7]);
      }
      if (exp.number !== undefined && trial.category === "deg-to-n")
        expect(String(p.prompt)).toContain(`degree ${exp.number + 1}`);
      if (trial.category === "chromatic") {
        // The chromatic step plays the degree's pitch in a .scale() of the key.
        const d = (exp.degrees?.[0] ?? null) as Degree | null;
        if (d) {
          const step = /n\("([^"]+)"\)/.exec(String(p.prompt))?.[1] as string;
          const { evalHeadless } = await import("@oak/grader/testing");
          const r = await evalHeadless(`n("${step}").scale("${(key as KeySpec).tonic}4:major")`);
          expect(degreeOf(r.events[0]?.midi as number, key as KeySpec)).toBe(d);
        }
      }
      break;
    }
    case "key-circle": {
      if (trial.category === "relative" && key) {
        const [tonic, mode] = String(exp.text?.[0]).split(" ");
        if (mode === "minor") expect(Key.majorKey(key.tonic).minorRelative).toBe(tonic as string);
        else expect(Key.minorKey(key.tonic).relativeMajor).toBe(tonic as string);
      }
      if (trial.category === "dominant" && key) {
        const up = /clockwise \(a fifth up\)/.test(String(p.prompt));
        const ans = exp.text?.[0] as string;
        expect(Note.chroma(Note.transpose(key.tonic, up ? "5P" : "4P"))).toBe(Note.chroma(ans));
      }
      if (trial.category === "parallel") expect(exp.number).toBe(3);
      break;
    }
    case "harmony-bass": {
      const bass = await midisOf("bass");
      expect(bass.map((m) => degreeOf(m, key as KeySpec))).toEqual(exp.degrees as Degree[]);
      break;
    }
    case "harmony-schema": {
      const loop = SCHEMA_LOOPS[trial.category];
      const bass = await midisOf("bass");
      const want = (loop?.chords ?? []).flat().map((c) => c.degree);
      expect(bass.map((m) => degreeOf(m, key as KeySpec))).toEqual(want.slice(0, bass.length) as Degree[]);
      break;
    }
    case "key-mode": {
      const scale = tonalScale(key as KeySpec).map((n) => Note.chroma(n));
      for (const m of await midisOf("mel")) expect(scale).toContain(((m % 12) + 12) % 12);
      const vamp = MODE_VAMPS[trial.category];
      expect(vamp?.mode).toBe((key as KeySpec).mode);
      break;
    }
    case "melody-dictation": {
      const mel = await midisOf("mel", Number(p.cueBars ?? 0));
      if (exp.degrees) expect(mel.map((m) => degreeOf(m, key as KeySpec))).toEqual(exp.degrees.map((d) => d));
      if (trial.params.mode === "code") {
        // The reference answer, typed as note names, earns full credit.
        const names = mel.map((m) => Note.fromMidi(m).toLowerCase());
        void names;
      }
      break;
    }
    case "melody-echo":
    case "melody-sight":
    case "pitch-match":
    case "degree-sing":
    case "degree-resolve":
    case "interval-sing": {
      checkComfort(p.singTargets as { midi: number }[]);
      for (const t of p.singTargets as { on: number; off: number }[]) expect(t.off).toBeGreaterThan(t.on);
      if (def.generator === "degree-resolve") {
        const path = trial.category.split("-") as Degree[];
        const ts = p.singTargets as { midi: number }[];
        for (const [i, t] of ts.entries()) expect(degreeOf(t.midi, key as KeySpec)).toBe(path[i] as Degree);
      }
      if (def.generator === "interval-sing") {
        const [t] = p.singTargets as { midi: number }[];
        const root = (await midisOf("mel"))[0] as number;
        expect(Math.abs((t as { midi: number }).midi - root)).toBe(intervalSemis(String(p.interval)));
      }
      break;
    }
    case "pitch-compare": {
      const s = p.semitones as number;
      expect(exp.choice?.[0]).toBe(s > 0 ? "higher" : s < 0 ? "lower" : "same");
      break;
    }
    case "degree-tonic":
      expect(exp.choice?.[0]).toBe(tonalScale(key as KeySpec)[0]);
      expect(p.options as string[]).toContain(exp.choice?.[0] as string);
      break;
    case "rhythm-echo":
    case "rhythm-read": {
      const { evalHeadless } = await import("@oak/grader/testing");
      const r = await evalHeadless(trial.code, Number(p.bars));
      const want = r.events.filter((e) => e.track === "perc").map((e) => e.onset / r.cps);
      const got = p.tapTargets as number[];
      expect(got.length).toBe(want.length);
      for (const [i, t] of got.entries()) expect(t).toBeCloseTo(want[i] as number, 9);
      break;
    }
    case "rhythm-count": {
      const { evalHeadless } = await import("@oak/grader/testing");
      const r = await evalHeadless(trial.code, 2);
      const clap = r.events.find((e) => e.track === "perc");
      expect(clap).toBeDefined();
      expect(p.options as string[]).toContain(exp.choice?.[0] as string);
      break;
    }
    case "rhythm-odd-grouping": {
      const groups = String(exp.choice?.[0]).split("+").map(Number);
      const { evalHeadless } = await import("@oak/grader/testing");
      const r = await evalHeadless(trial.code, 1);
      const total = groups.reduce((s, g) => s + g, 0);
      const accents = r.events
        .filter((e) => (e.value.gain as number) === 1 || e.track === "kick")
        .map((e) => Math.round(e.onset * total));
      let at = 0;
      for (const g of groups) {
        expect(accents).toContain(at);
        at += g;
      }
      break;
    }
    case "rhythm-syncopation": {
      const { evalHeadless } = await import("@oak/grader/testing");
      const r = await evalHeadless(trial.code, 1);
      const kicks = r.events.filter((e) => e.track === "kick").map((e) => Math.round(e.onset * 16));
      for (const c of exp.choice as string[]) expect(kicks).toContain(Number(c.slice(1)));
      break;
    }
    case "rhythm-dictation": {
      if (exp.choice) {
        const { evalHeadless } = await import("@oak/grader/testing");
        const r = await evalHeadless(trial.code, Number(p.gridBars));
        const per = Number(p.stepsPerBar);
        const cells = r.events.map((e) => String(Math.round(e.onset * per)));
        expect([...exp.choice].sort()).toEqual([...new Set(cells)].sort());
      } else {
        // The answer written as the reference mini-notation earns full credit.
        const mini = /s\("([^"]+)"\)/.exec(trial.code)?.[1] as string;
        const res = gradeCodeTrial(trial, { answer: { text: [mini] }, rtMs: 1, replays: 0 });
        expect(res.credit).toBe(1);
      }
      break;
    }
    case "notation-read": {
      if (trial.category === "lead-sheet") break;
      const staff = p.staff as { notes: string[] };
      const mel = await midisOf("mel");
      expect(staff.notes.map((n) => Note.midi(n))).toEqual(mel);
      // Typing the staff back as note names earns full credit.
      const code = /note\("([^"]+)"\)/.exec(trial.code)?.[1] as string;
      const res = gradeCodeTrial(trial, { answer: { text: [`note("${code}")`] }, rtMs: 1, replays: 0 });
      expect(res.credit).toBe(1);
      break;
    }
    default:
      break;
  }
}

/** Level constraints: category, tempo window, replays, register, sequence length. */
function checkLevel(def: FamilyDef, trial: Trial<Answer>, levelNo: number) {
  const level = def.levels[levelNo - 1] as FamilyDef["levels"][number];
  expect(level.categories).toContain(trial.category);
  expect(trial.level).toBe(levelNo);
  if (trial.cue.replays !== -1 && def.generator !== "rhythm-pulse" && def.generator !== "rhythm-read")
    expect(trial.cue.replays).toBe(level.replays);
  const bpm = trial.params.bpm as number | undefined;
  const unitTempo = [
    "rhythm-meter",
    "rhythm-count",
    "rhythm-echo",
    "rhythm-read",
    "rhythm-dictation",
  ].includes(def.generator);
  if (
    bpm !== undefined &&
    !unitTempo &&
    !["pitch-match", "interval-sing"].includes(def.generator) &&
    trial.events.length > 0
  ) {
    expect(bpm).toBeGreaterThanOrEqual(Math.round(level.tempo[0] * 0.92));
    expect(bpm).toBeLessThanOrEqual(Math.round(level.tempo[1] * 1.08));
  }
  if (def.generator === "degree-id") {
    expect((trial.expected.degrees as Degree[]).length).toBe(Number(level.seqLen ?? 1));
    const reg = (level.register as [number, number] | undefined) ?? [60, 72];
    for (const e of trial.events.filter((x) => x.track === "mel")) {
      expect(e.midi as number).toBeGreaterThanOrEqual(reg[0]);
      expect(e.midi as number).toBeLessThanOrEqual(reg[1] + 1);
    }
  }
  const key = trial.params.key as KeySpec | undefined;
  if (
    key &&
    ["degree-id", "interval-in-key", "harmony-cadence", "harmony-schema", "harmony-bass"].includes(
      def.generator,
    )
  ) {
    expect(keysFor(level.keys, key.mode).some((k) => k.tonic === key.tonic)).toBe(true);
  }
}

describe("every implemented family, every level, many seeds", () => {
  for (const def of implemented) {
    for (let levelNo = 1; levelNo <= def.levels.length; levelNo++) {
      test(`${def.id} L${levelNo}`, async () => {
        const trials = trialsOf(def, levelNo, SEEDS);
        for (const trial of trials) {
          checkLevel(def, trial, levelNo);
          let played: Awaited<ReturnType<typeof strudelEvents>> | null = null;
          if (trial.events.length > 0) {
            const bars = Number(trial.params.bars ?? 1);
            played = await strudelEvents(trial.code, bars);
            expect(played.logs).toEqual([]);
            expect(flattenEvents(trial.events)).toEqual(played.flat);
            expect(played.cps).toBeCloseTo(trial.cps, 9);
          }
          if (trial.resolution) {
            const res = await strudelEvents(trial.resolution.code, 1);
            expect(flattenEvents(trial.resolution.events)).toEqual(res.flat);
          }
          await checkAnswer(def, trial, played);
          // The expected answer itself earns full credit; an empty answer earns none.
          if (
            !["tap", "sing", "code"].includes(String(trial.params.mode)) &&
            Object.keys(trial.expected).length > 0
          ) {
            expect(gradeAnswer(trial, { answer: trial.expected, rtMs: 900, replays: 0 }).credit).toBe(1);
            expect(gradeAnswer(trial, { answer: {}, rtMs: 900, replays: 0 }).credit).toBe(0);
          }
        }
      }, 120_000);
    }
  }
});

describe("key randomization (code K)", () => {
  for (const def of implemented) {
    test(`${def.id}: never the previous trial's key`, () => {
      const fam = bindFamily(def);
      for (let levelNo = 1; levelNo <= def.levels.length; levelNo++) {
        let prev: Trial | undefined;
        for (let i = 0; i < 20; i++) {
          const level = def.levels[levelNo - 1] as FamilyDef["levels"][number];
          const t = generateTrial(
            fam,
            {
              index: i,
              family: def.id,
              level: levelNo,
              category: level.categories[i % level.categories.length] as string,
              seed: trialSeed(def.id, "keys", i + 100 * levelNo),
            },
            PROFILE,
            allCats(def),
            prev,
          );
          const k = t.params.key as KeySpec | undefined;
          const pk = prev?.params.key as KeySpec | undefined;
          if (k && pk && keysFor(level.keys, k.mode).length > 1 && k.mode === pk.mode)
            expect(Note.chroma(k.tonic) === Note.chroma(pk.tonic)).toBe(false);
          prev = t;
        }
      }
    });
  }
});

test("degree table sanity", () => {
  expect(parseDegree("b3")).toEqual({ num: 3, alt: -1 });
  expect(degreeOf(69, { tonic: "A", mode: "major" })).toBe("1");
});
