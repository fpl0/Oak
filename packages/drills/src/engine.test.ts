import { afterEach, describe, expect, test } from "bun:test";
import type { Answer, FamilyDef, KeySpec, LessonId, SkillId, Trial } from "@oak/content-kit";
import { defineDeck, defineFamily } from "@oak/content-kit";
import { ChordType, Key, Note } from "tonal";
import { skills } from "../../../content/skills.ts";
import { units } from "../../../content/syllabus.ts";
import { clickPlan, eventsToAudioPlan, trialAudio } from "./audio.ts";
import { CHORD_SYMBOLS, DECKS, KEY_SIGNATURES, STAFF_NAMES, signatureKeys } from "./catalog/decks.ts";
import { FAMILIES } from "./catalog/families.ts";
import {
  bindDeck,
  bindFamily,
  createRegistry,
  DEFAULT_PROFILE,
  GENERATORS,
  generateSet,
  generateTrial,
  isPendingGenerator,
  levelAfterSet,
  levelAtDifficulty,
  listenBlock,
  maxOpenLevel,
  planCompositeSet,
  planSet,
  setOutcome,
  setPreload,
  staircaseStep,
  summarizeSet,
} from "./engine.ts";
import { gradeSungResolution } from "./gen/degree.ts";
import { type DrillTrialResult, gradeAnswer, gradeCodeTrial } from "./grade.ts";
import type { CHORD_SUFFIX } from "./kernel.ts";
import { generateLadderPiece } from "./ladder.ts";
import { parseMini, parseMiniCode } from "./mini.ts";
import { pitch } from "./pitch-seam.ts";
import { createRng } from "./rng.ts";
import { flattenEvents, strudelEvents } from "./testing.test-util.ts";

const fam = (id: string): FamilyDef => FAMILIES.find((f) => f.id === id) as FamilyDef;
const allCats = (def: FamilyDef): string[] => def.categories.map((c) => c.id);

describe("catalog", () => {
  const lessons = new Set<string>(units.flatMap((u) => u.lessons.map((l) => l.id)));
  const skillIds = new Set<string>(skills.map((s) => s.id));
  test("every family validates and points at real lessons and skills", () => {
    for (const f of FAMILIES) {
      expect(() => defineFamily(f)).not.toThrow();
      expect(lessons.has(f.unlock.lesson)).toBe(true);
      for (const c of f.categories) expect(lessons.has(c.unlockAt)).toBe(true);
      for (const g of Object.values(f.unlock.levelGates ?? {}))
        for (const l of Array.isArray(g) ? g : [g]) expect(lessons.has(l as LessonId)).toBe(true);
      for (const s of f.skills) expect(skillIds.has(String(s.skill).split("/")[0] as SkillId)).toBe(true);
      expect(f.trialsPerSet).toBeGreaterThanOrEqual(3);
      expect(f.masteryLevel).toBeLessThanOrEqual(f.levels.length);
      // A level's categories never open before the family itself.
      for (const l of f.levels) expect(l.categories.length).toBeGreaterThan(0);
      if (!isPendingGenerator(f.generator)) expect(GENERATORS).toContain(f.generator);
    }
    expect(new Set(FAMILIES.map((f) => f.id)).size).toBe(FAMILIES.length);
  });
  test("contract §7.3 ear stages A–D are all implemented", () => {
    const stages =
      "rhy.pulse rhy.echo pit.match pit.compare deg.tonic deg.fet-major deg.sing deg.resolve int.in-key mel.dictation mel.echo chd.quality-triad har.bass har.schema har.cadence chd.inversion".split(
        " ",
      );
    for (const s of stages) expect(isPendingGenerator(fam(`fam.${s}`).generator)).toBe(false);
  });
  test("decks validate, gates are real lessons", () => {
    for (const d of DECKS) {
      expect(() => defineDeck(d)).not.toThrow();
      for (const c of d.cards) if (c.gate) expect(lessons.has(c.gate)).toBe(true);
    }
  });
  test("key signatures: 15 major and 15 minor keys, counts agree with tonal", () => {
    expect(signatureKeys("major").length).toBe(15);
    expect(signatureKeys("minor").length).toBe(15);
    for (const c of KEY_SIGNATURES.cards) {
      const m = /fact\.keysig\.(major|minor)\.([A-G])(-sharp|-flat)?\.(sig|key)/.exec(
        c.id,
      ) as RegExpExecArray;
      const tonic = `${m[2]}${m[3] === "-sharp" ? "#" : m[3] === "-flat" ? "b" : ""}`;
      const alt = m[1] === "major" ? Key.majorKey(tonic).alteration : Key.minorKey(tonic).alteration;
      const text = alt === 0 ? "0" : alt > 0 ? `${alt}#` : `${-alt}b`;
      if (m[4] === "sig") expect(c.answer.text?.[0]).toBe(text);
      else expect(c.answer.text?.[0]).toBe(tonic);
    }
    expect(KEY_SIGNATURES.cards.length).toBe(60);
  });
  test("staff names: letters agree with the written note", () => {
    for (const c of STAFF_NAMES.cards)
      expect(c.answer.choice?.[0]).toBe(Note.get(c.prompt.staff?.notes[0] as string).letter);
    const treble = STAFF_NAMES.cards
      .filter((c) => c.prompt.staff?.clef === "treble")
      .map((c) => c.prompt.staff?.notes[0]);
    expect(treble).toContain("D4");
    expect(treble).toContain("G5");
    expect(treble).toContain("C6");
  });
  test("chord symbols: the code spelling is a chord tonal knows with the same quality", () => {
    const tonal: Record<string, string> = {
      maj: "M",
      min: "m",
      dim: "dim",
      aug: "aug",
      "7": "7",
      maj7: "maj7",
      m7: "m7",
      m7b5: "m7b5",
      dim7: "dim7",
      "6": "6",
      m6: "m6",
      "69": "6add9",
      sus2: "sus2",
      sus4: "sus4",
      "7sus4": "7sus4",
      "9": "9",
      maj9: "maj9",
      m9: "m9",
      "13": "13",
      mMaj7: "mMaj7",
    };
    for (const c of CHORD_SYMBOLS.cards.filter((x) => x.id.endsWith(".name"))) {
      const q = c.answer.choice?.[0] as keyof typeof CHORD_SUFFIX;
      expect(ChordType.get(tonal[q] as string).empty).toBe(false);
    }
  });
  test("deck grading", () => {
    const deck = bindDeck(KEY_SIGNATURES);
    const card = KEY_SIGNATURES.cards[0];
    if (!card) throw new Error("no card");
    expect(deck.grade(card, card.answer, 1000).correct).toBe(true);
    expect(deck.grade(card, { text: ["nope"] }, 1000).correct).toBe(false);
    const staff = bindDeck(STAFF_NAMES);
    const s = STAFF_NAMES.cards[3];
    if (!s) throw new Error("no card");
    expect(staff.grade(s, s.answer, 500).credit).toBe(1);
  });
});

describe("registry", () => {
  test("binds implemented families, pending ones throw clearly", () => {
    const reg = createRegistry(FAMILIES, DECKS);
    expect(reg.family("fam.deg.fet-major").def.id).toBe("fam.deg.fet-major");
    expect(() => reg.family("fam.frm.sections")).toThrow(/not implemented/);
    expect(() => reg.family("fam.nope.x")).toThrow(/unknown/);
    expect(reg.decks().length).toBe(3);
    expect(() => bindFamily({ ...fam("fam.pit.compare"), generator: "nope" })).toThrow(/unknown generator/);
  });
  test("category skills", () => {
    const f = bindFamily(fam("fam.deg.fet-major"));
    expect(f.categorySkill?.("deg.6")).toBe("E05/deg.6");
    expect(bindFamily(fam("fam.rhy.meter")).categorySkill?.("6/8")).toBe("R08/6-8");
  });
  test("exposure: labelled examples", () => {
    const f = bindFamily(fam("fam.chd.quality-triad"));
    const ex = f.exposure?.(createRng(3), f.def.levels[0] as never) ?? [];
    expect(ex.length).toBe(2);
    expect(ex.map((e) => e.caption)).toEqual(["maj", "min"]);
    const fet = bindFamily(fam("fam.deg.fet-major"));
    expect((fet.exposure?.(createRng(1), fet.def.levels[2] as never) ?? []).length).toBe(3);
  });
});

describe("set planning", () => {
  const fet = bindFamily(fam("fam.deg.fet-major"));
  const input = {
    family: fet.def.id,
    setId: "s1",
    level: 3,
    openCategories: allCats(fet.def),
    categoryStats: {},
    blockedRemaining: 0,
    quiet: false,
  };
  test("75% at the level, 25% one down; no category three times in a row; seeds are stable", () => {
    for (let i = 0; i < 40; i++) {
      const plan = planSet(fet, { ...input, setId: `s${i}` });
      expect(plan.trials.length).toBe(8);
      expect(plan.trials.filter((t) => t.level === 2).length).toBe(2);
      for (let k = 2; k < plan.trials.length; k++) {
        const [a, b, c] = [plan.trials[k - 2], plan.trials[k - 1], plan.trials[k]];
        expect(a?.category === b?.category && b?.category === c?.category).toBe(false);
      }
      for (const t of plan.trials) expect(fet.def.levels[t.level - 1]?.categories).toContain(t.category);
      expect(planSet(fet, { ...input, setId: `s${i}` })).toEqual(plan);
    }
  });
  test("closed categories are never sampled", () => {
    const open = ["deg.1", "deg.3", "deg.5"];
    for (let i = 0; i < 20; i++) {
      const plan = planSet(fet, { ...input, setId: `c${i}`, openCategories: open, level: 3 });
      for (const t of plan.trials) expect(open).toContain(t.category);
    }
  });
  test("weak categories are sampled more", () => {
    let weak = 0;
    let strong = 0;
    for (let i = 0; i < 60; i++) {
      const plan = planSet(fet, {
        ...input,
        level: 1,
        setId: `w${i}`,
        categoryStats: {
          "deg.1": { n: 30, hits: 30 },
          "deg.3": { n: 30, hits: 10 },
          "deg.5": { n: 30, hits: 29 },
        },
      });
      weak += plan.trials.filter((t) => t.category === "deg.3").length;
      strong += plan.trials.filter((t) => t.category === "deg.1").length;
    }
    expect(weak).toBeGreaterThan(2 * strong);
  });
  test("blocked introduction: half new categories against their contrast neighbours", () => {
    const plan = planSet(fet, { ...input, blockedRemaining: 2, level: 3, setId: "b" });
    expect(plan.blockedIntro).toBe(true);
    const atLevel = plan.trials.filter((t) => t.level === 3);
    for (const t of atLevel) expect(["deg.6", "deg.7", "deg.5", "deg.1"]).toContain(t.category);
    expect(atLevel.filter((t) => ["deg.6", "deg.7"].includes(t.category)).length).toBeGreaterThanOrEqual(2);
  });
  test("sung resolutions: 2–3 per FET set, none in Quiet mode, none for other families", () => {
    expect(planSet(fet, input).trials.filter((t) => t.sungResolution).length).toBe(2);
    expect(planSet(fet, { ...input, sungResolutions: 3 }).trials.filter((t) => t.sungResolution).length).toBe(
      3,
    );
    expect(planSet(fet, { ...input, quiet: true }).trials.filter((t) => t.sungResolution).length).toBe(0);
    const ch = bindFamily(fam("fam.chd.quality-triad"));
    expect(
      planSet(ch, { ...input, family: ch.def.id, level: 2, openCategories: allCats(ch.def) }).trials.some(
        (t) => t.sungResolution,
      ),
    ).toBe(false);
  });
  test("generateSet: no repeated (key, category) and the sung flag reaches the trial", () => {
    for (let i = 0; i < 10; i++) {
      // Level 3 draws keys with up to two accidentals (level 1 has only C, where pairs must repeat).
      const plan = planSet(fet, { ...input, setId: `g${i}`, level: 3 });
      plan.trials = plan.trials.map((t) => ({ ...t, level: 3 }));
      const trials = generateSet(fet, plan, DEFAULT_PROFILE, allCats(fet.def));
      const seen = new Set<string>();
      for (const t of trials) {
        const k = `${(t.params.key as KeySpec).tonic}|${t.category}`;
        expect(seen.has(k)).toBe(false);
        seen.add(k);
      }
      expect(trials.filter((t) => t.params.sungResolution === true).length).toBe(2);
      const pre = setPreload(trials);
      for (const t of trials) for (const p of t.preload) expect(pre).toContain(p);
    }
  });
  test("composite: ≤ 10 trials, 2 per member, lowest accuracy first, ≤ 1 sung member, none in Quiet mode", () => {
    const ids = [
      "fam.deg.fet-major",
      "fam.int.in-key",
      "fam.pit.compare",
      "fam.deg.sing",
      "fam.mel.echo",
      "fam.deg.tonic",
      "fam.key.mode",
    ];
    const members = ids.map((id, i) => {
      const f = bindFamily(fam(id));
      return {
        family: f,
        input: { ...input, family: f.def.id, level: 1, openCategories: allCats(f.def) },
        recentAccuracy: i / 10,
      };
    });
    const plans = planCompositeSet(members, "mix1", false);
    expect(plans.length).toBe(5);
    expect(plans.reduce((s, p) => s + p.trials.length, 0)).toBe(10);
    expect(plans.filter((p) => fam(p.family).mic).length).toBeLessThanOrEqual(1);
    expect(plans[0]?.family).toBe("fam.deg.fet-major");
    const quiet = planCompositeSet(members, "mix1", true);
    expect(quiet.some((p) => fam(p.family).mic)).toBe(false);
  });
});

describe("summaries, outcomes and staircases", () => {
  const def = fam("fam.deg.fet-major");
  const f = bindFamily(def);
  const plan = planSet(f, {
    family: def.id,
    setId: "sum",
    level: 2,
    openCategories: allCats(def),
    categoryStats: {},
    blockedRemaining: 0,
    quiet: true,
  });
  const trials = generateSet(f, plan, DEFAULT_PROFILE, allCats(def));
  test("summarizeSet folds credit, RT, replays, categories and confusions", () => {
    const results: DrillTrialResult[] = trials.map((t, i) =>
      i === 0
        ? {
            ...gradeAnswer(t as Trial<Answer>, { answer: { degrees: ["7"] }, rtMs: 3000, replays: 4 }, def),
            confusion: [t.expected.degrees?.[0] as string, "7"],
          }
        : i === 1
          ? { credit: 0, correct: false, rtMs: 1, replays: 0, diagnostics: [], skipped: true }
          : gradeAnswer(
              t as Trial<Answer>,
              { answer: t.expected as Answer, rtMs: 1000 + i, replays: 0 },
              def,
            ),
    );
    const s = summarizeSet(plan, trials, results);
    expect(s.trials).toBe(7);
    expect(s.meanCredit).toBeCloseTo(6 / 7, 6);
    expect(s.extraReplays).toBe(2);
    expect(Object.values(s.confusions).reduce((a, b) => a + b, 0)).toBe(1);
    expect(Object.values(s.perCategory).reduce((a, c) => a + c.n, 0)).toBe(7);
    expect(s.playedLevel).toBe(2);
    expect(s.meanAbsCents).toBeNull();
    const o = setOutcome(f, s, { cardLevel: 2 });
    expect(o).toMatchObject({
      fastRtMs: 2500,
      extraReplays: 2,
      atOrAboveLevel: true,
      hintRung: 0,
      revealed: false,
    });
  });
  test("levelAfterSet: two good sets on two days promote, a bad set demotes, a middling one resets", () => {
    const sum = (meanCredit: number) => ({
      ...summarizeSet(plan, [], []),
      trials: 8,
      meanCredit,
      playedLevel: 2,
    });
    let st = { level: 2, promoDay: null as string | null, maxOpenLevel: 5 };
    let r = levelAfterSet(st, sum(0.95), "2026-11-10");
    expect(r).toEqual({ level: 2, promoDay: "2026-11-10", change: null });
    r = levelAfterSet({ ...st, promoDay: r.promoDay }, sum(0.95), "2026-11-10");
    expect(r.change).toBeNull();
    r = levelAfterSet({ ...st, promoDay: "2026-11-10" }, sum(0.92), "2026-11-11");
    expect(r).toEqual({ level: 3, promoDay: null, change: "promoted" });
    st = { level: 2, promoDay: "2026-11-10", maxOpenLevel: 2 };
    expect(levelAfterSet(st, sum(0.95), "2026-11-12").level).toBe(2);
    expect(levelAfterSet(st, sum(0.5), "2026-11-12")).toEqual({
      level: 1,
      promoDay: null,
      change: "demoted",
    });
    expect(levelAfterSet(st, sum(0.75), "2026-11-12")).toEqual({ level: 2, promoDay: null, change: null });
  });
  test("maxOpenLevel follows open categories and gate lessons", () => {
    expect(maxOpenLevel(def, ["deg.1", "deg.3", "deg.5"])).toBe(1);
    expect(maxOpenLevel(def, allCats(def))).toBe(def.levels.length);
    expect(maxOpenLevel(def, allCats(def), ["U03.L03"])).toBe(2);
  });
  test("Kaernbach staircase converges near 85% correct", () => {
    // A simulated learner whose success falls with difficulty: p = 1 / (1 + e^(d − 4)).
    const rng = createRng(42);
    let st = { d: 1, levels: 7 };
    let correct = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const p = 1 / (1 + Math.exp(st.d - 4));
      const ok = rng.next() < p;
      if (i >= 1000) correct += ok ? 1 : 0;
      st = staircaseStep(st, ok);
      expect(st.d).toBeGreaterThanOrEqual(1);
      expect(st.d).toBeLessThanOrEqual(7.99);
    }
    expect(correct / (n - 1000)).toBeGreaterThan(0.82);
    expect(correct / (n - 1000)).toBeLessThan(0.88);
  });
  test("levelAtDifficulty interpolates tempo and replays within a level", () => {
    const meter = fam("fam.rhy.pulse");
    const a = levelAtDifficulty(meter, 1.0);
    const b = levelAtDifficulty(meter, 1.5);
    expect(a.level).toBe(1);
    expect(a.params.tempo).toEqual([90, 110]);
    expect(b.params.tempo).toEqual([80, 120]);
    expect(levelAtDifficulty(meter, 9).level).toBe(5);
  });
});

describe("grading with the real @oak/pitch (no stand-in)", () => {
  test("taps on every target pass; no taps fail", () => {
    const def = fam("fam.rhy.echo");
    const f = bindFamily(def);
    const t = generateTrial(
      f,
      { index: 0, family: def.id, level: 2, category: "rests", seed: 7 },
      DEFAULT_PROFILE,
      allCats(def),
    );
    const targets = t.params.tapTargets as number[];
    expect(targets.length).toBeGreaterThan(0);
    const hit = f.grade(t, { taps: [...targets], rtMs: 10, replays: 0 }, DEFAULT_PROFILE);
    expect(hit.correct).toBe(true);
    expect(hit.credit).toBeGreaterThan(0.9);
    const none = f.grade(t, { taps: [], rtMs: 10, replays: 0 }, DEFAULT_PROFILE);
    expect(none.correct).toBe(false);
  });
  test("a sung resolution on pitch passes and reports a small cents error; a semitone off fails", () => {
    const def = fam("fam.deg.fet-major");
    const f = bindFamily(def);
    const t = generateTrial(
      f,
      { index: 0, family: def.id, level: 1, category: "deg.3", seed: 9, sungResolution: true },
      DEFAULT_PROFILE,
      allCats(def),
    );
    const targets = t.params.resolutionTargets as { midi: number; on: number; off: number }[];
    expect(targets.length).toBeGreaterThan(0);
    const frames = (shift: number) =>
      targets.flatMap((x) => {
        const out = [];
        for (let time = x.on + 0.02; time < x.off - 0.02; time += 0.01)
          out.push({ t: time, hz: 440 * 2 ** ((x.midi + shift + 0.1 - 69) / 12), clarity: 0.97, rms: 0.2 });
        return out;
      });
    const good = gradeSungResolution(
      t as Trial<Answer>,
      { frames: frames(0), rtMs: 1, replays: 0 },
      DEFAULT_PROFILE,
    );
    expect(good.correct).toBe(true);
    expect(good.centsError).not.toBeNull();
    expect(good.centsError as number).toBeLessThan(15);
    const off = gradeSungResolution(
      t as Trial<Answer>,
      { frames: frames(1), rtMs: 1, replays: 0 },
      DEFAULT_PROFILE,
    );
    expect(off.correct).toBe(false);
  });
});

describe("grading by modality", () => {
  const saved = { ...pitch };
  afterEach(() => Object.assign(pitch, saved));
  test("tap trials hand the targets and an auto window to gradeTaps", () => {
    const def = fam("fam.rhy.echo");
    const f = bindFamily(def);
    const t = generateTrial(
      f,
      { index: 0, family: def.id, level: 2, category: "rests", seed: 7 },
      DEFAULT_PROFILE,
      allCats(def),
    );
    let seen: { taps: readonly number[]; targets: readonly number[]; w: number } | null = null;
    pitch.tapWindowMs = () => 77;
    pitch.gradeTaps = (taps, targets, tol) => {
      seen = { taps, targets, w: tol.windowMs as number };
      return {
        score: 0.9,
        pass: true,
        dims: {},
        diagnostics: [],
        pairs: [],
        missed: [],
        extra: [],
        f1: 1,
        timing: 0.7,
        offsetMs: 0,
        windowMs: 77,
      };
    };
    const r = f.grade(t, { taps: [0.1, 0.2], rtMs: 10, replays: 0 }, DEFAULT_PROFILE);
    expect(r).toMatchObject({ credit: 0.9, correct: true });
    expect(seen).toEqual({ taps: [0.1, 0.2], targets: t.params.tapTargets as number[], w: 77 } as never);
  });
  test("sung trials and sung resolutions report the cents error", () => {
    const def = fam("fam.deg.fet-major");
    const f = bindFamily(def);
    const t = generateTrial(
      f,
      { index: 0, family: def.id, level: 1, category: "deg.3", seed: 9, sungResolution: true },
      DEFAULT_PROFILE,
      allCats(def),
    );
    pitch.gradeSung = (_frames, targets, _tol, mode) => ({
      score: 1,
      pass: true,
      dims: {},
      diagnostics: [],
      notes: targets.map((x, i) => ({
        index: i,
        targetMidi: x.midi,
        sungMidi: x.midi,
        cents: i % 2 ? -10 : 20,
        coverage: 1,
        credit: 1,
        timingCredit: null,
        onsetErrorMs: null,
        octaveShift: 0,
        feedback: null,
      })),
      driftCents: 0,
      medianAbsCents: 15,
      mode,
      tolCents: 50,
    });
    const r = gradeSungResolution(t as Trial<Answer>, { frames: [], rtMs: 1, replays: 0 }, DEFAULT_PROFILE);
    expect(r.correct).toBe(true);
    expect(r.centsError).toBeGreaterThan(0);
    // The identification credit is untouched by the sung part.
    expect(f.grade(t, { answer: { degrees: ["3"] }, rtMs: 1, replays: 0 }, DEFAULT_PROFILE).credit).toBe(1);
    expect(
      f.grade(t, { answer: { degrees: ["4"] }, rtMs: 1, replays: 0 }, DEFAULT_PROFILE).confusion,
    ).toEqual(["3", "4"]);
    const t6 = generateTrial(
      f,
      { index: 0, family: def.id, level: 3, category: "deg.6", seed: 9 },
      DEFAULT_PROFILE,
      allCats(def),
    );
    const tip = f.grade(t6, { answer: { degrees: ["5"] }, rtMs: 1, replays: 0 }, DEFAULT_PROFILE);
    expect(tip.diagnostics.some((d) => d.id === "id.confusion")).toBe(true);
  });
  test("skipped responses carry no evidence", () => {
    const def = fam("fam.pit.compare");
    const f = bindFamily(def);
    const t = generateTrial(
      f,
      { index: 0, family: def.id, level: 1, category: "higher", seed: 1 },
      DEFAULT_PROFILE,
      allCats(def),
    );
    expect(f.grade(t, { skipped: true, rtMs: 0, replays: 0 }, DEFAULT_PROFILE)).toMatchObject({
      credit: 0,
      skipped: true,
    });
  });
  test("code answers: mini-notation, note names, n with scale, wrong and unparsable answers", () => {
    const def = fam("fam.rhy.dictation");
    const f = bindFamily(def);
    const t = generateTrial(
      f,
      { index: 0, family: def.id, level: 3, category: "sixteenths", seed: 5 },
      DEFAULT_PROFILE,
      allCats(def),
    );
    const mini = /s\("([^"]+)"\)/.exec(t.code)?.[1] as string;
    expect(
      f.grade(
        t,
        { answer: { text: [mini.replace(/\b(rim|cp|hh)\b/g, "x")] }, rtMs: 1, replays: 0 },
        DEFAULT_PROFILE,
      ).credit,
    ).toBe(1);
    expect(
      f.grade(t, { answer: { text: ["x x x x"] }, rtMs: 1, replays: 0 }, DEFAULT_PROFILE).credit,
    ).toBeLessThanOrEqual(1);
    expect(
      f.grade(t, { answer: { text: ["[x x"] }, rtMs: 1, replays: 0 }, DEFAULT_PROFILE).diagnostics[0]?.id,
    ).toBe("eval.mini-parse");
    const m = fam("fam.mel.dictation");
    const mf = bindFamily(m);
    const mt = generateTrial(
      mf,
      { index: 0, family: m.id, level: 5, category: "two-bars", seed: 11 },
      DEFAULT_PROFILE,
      allCats(m),
    );
    const key = mt.params.key as KeySpec;
    const oct = mt.params.octave as number;
    const melCode = /n\("([^"]+)"\)/g;
    const all = [...mt.code.matchAll(melCode)].map((x) => x[1] as string);
    const melMini = all[all.length - 1] as string;
    // The reference melody drops its cadence bar: answer bars only.
    const answerBars = melMini.replace(/^<~ /, "<");
    const ok = gradeCodeTrial(mt as Trial<Answer>, {
      answer: { text: [`n("${answerBars}").scale("${key.tonic}${oct}:${key.mode}")`] },
      rtMs: 1,
      replays: 0,
    });
    expect(ok.credit).toBe(1);
  });
});

describe("mini parser", () => {
  test("parses the subset", () => {
    const evs = (s: string, bars = 1) =>
      (parseMiniCode(s, bars) as { ok: true; events: { t: number }[] }).events.map((e) => e.t);
    expect(evs("x ~ x x")).toEqual([0, 0.5, 0.75]);
    expect(evs("x [x x] x@2")).toEqual([0, 0.25, 0.375, 0.5]);
    expect(evs("x _ x x")).toEqual([0, 0.5, 0.75]);
    expect(evs("x!3 ~")).toEqual([0, 0.25, 0.5]);
    expect(evs("x*4")).toEqual([0, 0.25, 0.5, 0.75]);
    expect(evs("<x [x x]>", 2)).toEqual([0, 1, 1.5]);
    expect(evs("[x, x x]")).toEqual([0, 0, 0.5]);
    expect(() => parseMini("[x x")).toThrow();
    const n = parseMiniCode('n("0 2 4").scale("D4:major")', 1);
    expect(n.ok && n.events.map((e) => e.midi)).toEqual([62, 66, 69]);
  });
});

describe("audio plans", () => {
  test("eventsToAudioPlan: seconds, internal names, preload keys", async () => {
    const def = fam("fam.har.schema");
    const f = bindFamily(def);
    const t = generateTrial(
      f,
      { index: 0, family: def.id, level: 3, category: "aeolian", seed: 3 },
      DEFAULT_PROFILE,
      allCats(def),
    );
    const plan = eventsToAudioPlan(t.events, t.cps);
    expect(plan.durationSec).toBeCloseTo(4 / t.cps, 6);
    expect(plan.events.length).toBe(t.events.length);
    for (const e of plan.events) {
      expect(e.at).toBeGreaterThanOrEqual(0);
      expect(typeof e.value.s).toBe("string");
    }
    expect(
      plan.events.some((e) => e.value.bank !== undefined) ||
        plan.preload.includes("hh") ||
        plan.preload.some((p) => p.endsWith("_hh")),
    ).toBe(true);
    const slow = eventsToAudioPlan(t.events, t.cps, { rate: 0.5, transpose: 12, fromBar: 1, bars: 2 });
    expect(slow.durationSec).toBeCloseTo(4 / t.cps, 6);
    expect(slow.events.every((e) => e.at < 4 / t.cps)).toBe(true);
  });
  test("trialAudio splits cue, stimulus and resolution", () => {
    const def = fam("fam.deg.fet-major");
    const f = bindFamily(def);
    const t = generateTrial(
      f,
      { index: 0, family: def.id, level: 1, category: "deg.5", seed: 4 },
      DEFAULT_PROFILE,
      allCats(def),
    );
    const a = trialAudio(t);
    expect(a.cue?.events.length).toBeGreaterThan(0);
    expect(a.stimulus.events.length).toBe(1);
    expect(a.stimulus.events[0]?.at).toBe(0);
    expect(a.resolution?.events.length).toBeGreaterThanOrEqual(1);
    const echo = bindFamily(fam("fam.rhy.echo"));
    const e = generateTrial(
      echo,
      { index: 0, family: "fam.rhy.echo", level: 1, category: "quarters", seed: 2 },
      DEFAULT_PROFILE,
      ["quarters"],
    );
    expect(trialAudio(e).cue?.events.length).toBe(4);
  });
  test("clickPlan accents beat one", () => {
    const c = clickPlan(2, 0.5, 3);
    expect(c.events.length).toBe(6);
    expect(c.events[0]?.value.gain).toBeGreaterThan(c.events[1]?.value.gain as number);
    expect(c.durationSec).toBe(4);
    expect(c.events[3]?.at).toBeCloseTo(2, 9);
  });
  test("listen block: labelled examples for 15–20 s", () => {
    const f = bindFamily(fam("fam.chd.quality-triad"));
    const block = listenBlock(f, 4, 1, allCats(f.def));
    const total = block.reduce((s, b) => s + b.plan.durationSec, 0);
    expect(block.length).toBeGreaterThan(1);
    expect(total).toBeGreaterThan(8);
    expect(total).toBeLessThan(26);
  });
});

describe("ladder pieces L1–L4 × R0–R4", () => {
  for (const level of [1, 2, 3, 4] as const)
    for (const realism of [0, 1, 2, 3, 4] as const)
      test(`L${level} R${realism}`, async () => {
        for (const seed of [1, 2, 3]) {
          const p = generateLadderPiece(level, realism, seed * 100 + level * 10 + realism, DEFAULT_PROFILE);
          const got = await strudelEvents(p.code, p.bars);
          expect(got.logs).toEqual([]);
          expect(flattenEvents(p.events)).toEqual(got.flat);
          expect(p.events.length).toBeGreaterThan(0);
          const tracks = new Set(p.events.map((e) => e.track));
          if (level === 1) expect(tracks.has("kick")).toBe(true);
          if (level === 2) expect(tracks.has("bass")).toBe(true);
          if (level === 3) expect(tracks.has("chords")).toBe(true);
          if (level === 4) {
            expect(tracks.has("mel")).toBe(true);
            if (realism >= 3) expect(tracks.size).toBeGreaterThanOrEqual(4);
          }
        }
      });
});
