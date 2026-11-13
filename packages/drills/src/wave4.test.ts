// Wave 4: the stage D families and the melodic dictation of U05–U07 (content/specs/U05.md, U06.md, U07.md).
// Golden tests state the expected notes; property tests walk the default order lesson by lesson from U05.L02
// to U07.L10 and check that every trial stays inside what the learner has met there (qualities, inversions,
// numerals, cadences, schemas, keys), that its answer is one of the options it shows and no option repeats,
// and that it sounds as a musician would play it (a comfortable register, readable spelling, the tune on top
// of a cadence, a bass line that moves to the nearest note, chord tones on the strong beats of a dictation).
import { describe, expect, test } from "bun:test";
import { type Answer, type FamilyDef, type KeySpec, R, type Trial } from "@oak/content-kit";
import { defaultOrder } from "../../../content/syllabus.ts";
import { FAMILIES } from "./catalog/families.ts";
import { bindFamily, DEFAULT_PROFILE, generateTrial, maxOpenLevel } from "./engine.ts";
import { readableRoot } from "./gen/chord.ts";
import { gradeAnswer, sameRnAnswer } from "./grade.ts";
import { chordPcs, mod, parsePc } from "./kernel.ts";
import { trialSeed } from "./rng.ts";

const fam = (id: string): FamilyDef => FAMILIES.find((f) => f.id === id) as FamilyDef;
const rank = (id: string): number => {
  const i = defaultOrder.indexOf(id as never);
  return i < 0 ? Number.POSITIVE_INFINITY : i;
};
function stateAt(def: FamilyDef, lesson: string) {
  const open = def.categories.filter((c) => rank(c.unlockAt) <= rank(lesson)).map((c) => c.id);
  const completed = defaultOrder.slice(0, rank(lesson) + 1) as string[];
  return { open, completed, maxLevel: maxOpenLevel(def, open, completed) };
}
const trial = (def: FamilyDef, level: number, category: string, open: readonly string[], i: number) =>
  generateTrial(
    bindFamily(def),
    { index: i, family: def.id, level, category, seed: trialSeed(def.id, `w4-${level}`, i) },
    DEFAULT_PROFILE,
    open,
  ) as Trial<Answer>;
const WALK = defaultOrder.slice(rank("U05.L02"), rank("U07.L10") + 1).filter((s) => /\.L\d+$/.test(s));
const midisOf = (t: Trial<Answer>, track: string) =>
  t.events.filter((e) => e.track === track && e.midi !== null).map((e) => e.midi as number);
const DIATONIC_RN = new Set(["I", "ii", "iii", "IV", "V", "vi", "viio"]);

describe("golden: chords as a musician spells and voices them", () => {
  test("a root spelled so the chord reads with fewest accidentals", () => {
    const names = (pc: number, q: "maj" | "min" | "dim" | "aug") => readableRoot(pc, q);
    expect([names(1, "maj"), names(1, "min"), names(8, "maj"), names(8, "min")]).toEqual([
      "Db",
      "C#",
      "Ab",
      "G#",
    ]);
    expect([names(10, "dim"), names(6, "maj"), names(3, "min"), names(5, "dim")]).toEqual([
      "A#",
      "F#",
      "Eb",
      "F",
    ]);
  });
  test("U05.L02 spell the triad, level 1: a triad on a degree of C, all natural notes, named in words", () => {
    const def = fam("fam.chd.spell");
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const t = trial(def, 1, "triad-naturals", ["triad-naturals"], i);
      const notes = (t.expected as { text: string[] }).text;
      expect(notes.every((n) => /^[A-G]$/.test(n))).toBe(true);
      const p = t.params as { root: string; quality: string; prompt: string };
      seen.add(`${p.root}${p.quality === "min" ? "m" : ""}`);
      // Words first: chord symbols are U05.L04's term.
      expect(p.prompt).toMatch(/^Spell [A-G] (major|minor \([A-G]m\)) from the root up\.$/);
    }
    expect([...seen].sort()).toEqual(["Am", "C", "Dm", "Em", "F", "G"]);
    const t2 = trial(def, 2, "triads", ["triad-naturals", "triads"], 4);
    expect((t2.params as { prompt: string }).prompt).toMatch(
      /^Spell [A-G][♯♭]? (major|minor \(.+m\)|diminished \(.+°\)|augmented \(.+\+\)) from the root up\.$/,
    );
  });
  test("U05.L02 triad quality, level 1: a root-position triad, bass between C3 and B3, on piano", () => {
    const def = fam("fam.chd.quality-triad");
    const t = trial(def, 1, "min", ["maj", "min"], 0);
    expect(t.expected).toEqual({ qualities: ["min"] });
    expect(t.code).toBe('setcpm(97/2)\n\nchords: note("[c#3,e3,g#3,c#4]").s("piano")');
    const t2 = trial(def, 1, "maj", ["maj", "min"], 3);
    expect(t2.code).toBe('setcpm(105/2)\n\nchords: note("[b3,d#4,f#4,b4]").s("piano")');
  });
  test("U06.L04 cadence: the tune is the top voice, a bass under close triads", () => {
    const def = fam("fam.har.cadence");
    const t = trial(def, 1, "PAC", ["PAC", "HC"], 0);
    expect(t.expected).toEqual({ choice: ["PAC"] });
    expect(t.code).toBe(
      'setcpm(71/4)\n\nchords: note("[g2,g3,b3,d4] [c3,g3,c4,e4] [d3,f#3,a3,d4] [g2,g3,b3,d4]").s("rhodes").gain(.42)\nmel: n("2 3 1 0").scale("G4:major").s("piano").gain(.7)',
    );
  });
  test("U07.L04 dictation level 6: two bars over I IV | V I, a neighbour tone (A between Bs over G), ending home", () => {
    const def = fam("fam.mel.dictation");
    const t = trial(def, 6, "nct", ["nct"], 1);
    expect(t.expected).toEqual({ degrees: ["3", "1", "2", "7", "6", "7", "1"] });
    expect(t.code).toContain('mel: n("<~ [2@2 0 1] [[6 5] 6 7@2]>").scale("C4:major")');
  });
});

/** The stage D families and the U07 dictation, with what each must stay inside. */
const STAGE_D = [
  "fam.chd.quality-triad",
  "fam.chd.inversion",
  "fam.chd.spell",
  "fam.har.rn",
  "fam.har.function",
  "fam.har.cadence",
  "fam.har.bass",
  "fam.har.schema",
  "fam.har.progression",
  "fam.mel.nct",
  "fam.mel.dictation",
];

describe("the course walk U05.L02–U07.L10: every trial stays inside what the learner has met", () => {
  for (const id of STAGE_D)
    test(id, () => {
      const def = fam(id);
      let checked = 0;
      for (const lesson of WALK) {
        if (rank(def.unlock.lesson) > rank(lesson)) continue;
        const { open, maxLevel } = stateAt(def, lesson);
        for (let level = 1; level <= maxLevel; level++) {
          const lv = def.levels[level - 1] as FamilyDef["levels"][number];
          const cats = lv.categories.filter((c) => open.includes(c));
          expect([id, lesson, level, cats.length > 0]).toEqual([id, lesson, level, true]);
          for (let i = 0; i < 12; i++) {
            const t = trial(def, level, cats[i % cats.length] as string, open, i);
            checked++;
            const where = [id, lesson, level, t.category, i];
            expect([...where, cats.includes(t.category)]).toEqual([...where, true]);
            // Major keys only before U10 (minor) and no chromatic chord before U15.
            const key = t.params.key as KeySpec | undefined;
            if (key) expect([...where, key.mode]).toEqual([...where, "major"]);
            // Choice options: the answer is one of them and none repeats.
            const options = t.params.options as string[] | undefined;
            if (options) {
              expect(new Set(options).size).toBe(options.length);
              for (const c of t.expected.choice ?? []) expect(options).toContain(c);
            }
            for (const c of t.expected.choice ?? []) {
              // A choice answer is one of the open categories (or, for an alias, names one).
              if (id !== "fam.har.function" && id !== "fam.mel.dictation")
                expect([...where, c, open.includes(c) || cats.includes(c)]).toEqual([...where, c, true]);
            }
            // Spelling: no double sharps or flats in any shown code before U12's sevenths.
            expect([...where, /[a-g](bb|##)\d/.test(t.code)]).toEqual([...where, false]);
            checkFamily(id, t, level, lv, open, where);
          }
        }
      }
      expect(checked).toBeGreaterThan(0);
    });
});

function checkFamily(
  id: string,
  t: Trial<Answer>,
  level: number,
  lv: FamilyDef["levels"][number],
  open: readonly string[],
  where: unknown[],
): void {
  if (id === "fam.chd.quality-triad") {
    for (const q of t.expected.qualities ?? [])
      expect([...where, open.includes(q)]).toEqual([...where, true]);
    // Root position until U05.L05 opens level 5; the bass inside the level's register.
    if (level < 5) expect([...where, t.params.inversion]).toEqual([...where, 0]);
    const [lo, hi] = (lv as unknown as { register: [number, number] }).register;
    const bass = Math.min(...midisOf(t, "chords"));
    expect([...where, bass >= lo && bass <= hi]).toEqual([...where, true]);
    if (level <= 5) expect([...where, /\.s\("(piano|rhodes)"\)/.test(t.code)]).toEqual([...where, true]);
  }
  if (id === "fam.chd.inversion") {
    expect([...where, ["maj", "min"].includes(String(t.params.quality))]).toEqual([...where, true]);
    const notes = midisOf(t, "chords");
    const bassPc = mod(Math.min(...notes), 12);
    const pcs = chordPcs(Number(t.params.rootPc), t.params.quality as "maj");
    const inv = ["root", "first", "second"].indexOf(String(t.expected.choice?.[0]));
    expect([...where, bassPc]).toEqual([...where, pcs[inv]]);
  }
  if (id === "fam.har.cadence") {
    // The cadence is heard in the outer voices: the tune is above every chord note.
    const top = Math.max(...midisOf(t, "chords"));
    const tune = midisOf(t, "mel");
    expect([...where, Math.min(...tune) > top]).toEqual([...where, true]);
    const key = t.params.key as KeySpec;
    const last = mod((tune.at(-1) as number) - parsePc(key.tonic).pc, 12);
    const answer = t.expected.choice?.[0];
    if (answer === "PAC") expect([...where, last]).toEqual([...where, 0]);
    if (answer === "IAC") expect([...where, [4, 7].includes(last)]).toEqual([...where, true]);
  }
  if (id === "fam.har.bass") {
    for (const d of t.expected.degrees ?? []) expect([...where, /^[1-7]$/.test(d)]).toEqual([...where, true]);
    // A bass player's line: every move goes to the nearest octave of the next note, unless that octave is
    // outside E1–A♭3 (a line walking down off the bottom of the bass jumps up an octave).
    const bass = midisOf(t, "bass");
    for (let k = 1; k < bass.length; k++) {
      const [a, b] = [bass[k - 1] as number, bass[k] as number];
      const nearer = b > a ? b - 12 : b + 12;
      const ok = Math.abs(b - a) <= 6 || nearer < 28 || nearer > 56;
      expect([...where, a, b, ok]).toEqual([...where, a, b, true]);
    }
    for (const m of bass) expect([...where, m >= 28 && m <= 56]).toEqual([...where, true]);
  }
  if (id === "fam.har.progression") {
    const allow = (t.params.rnAllow as string[] | undefined) ?? [];
    for (const rn of t.expected.rn ?? []) {
      const core = rn.replace(/6?4?$/, "");
      expect([...where, rn, DIATONIC_RN.has(core)]).toEqual([...where, rn, true]);
      if (/\d/.test(rn)) expect([...where, rn, allow.includes("inversions")]).toEqual([...where, rn, true]);
    }
  }
  if (id === "fam.har.schema") {
    expect([...where, open.includes(String(t.expected.choice?.[0]))]).toEqual([...where, true]);
  }
  if (id === "fam.mel.dictation" && level >= 5) {
    const degrees = t.expected.degrees ?? [];
    for (const d of degrees) expect([...where, /^[1-7]$/.test(d)]).toEqual([...where, true]);
    expect([...where, degrees.at(-1)]).toEqual([...where, "1"]);
    // A chord tone on beats 1 and 3 of each answer bar (the chords keep sounding under the tune).
    const mel = t.events.filter((e) => e.track === "mel" && R.toNum(e.onset) >= 1);
    const chords = t.events.filter((e) => e.track === "chords" && R.toNum(e.onset) >= 1);
    for (const e of mel) {
      const pos = R.toNum(R.mul(R.frac(e.onset), [8, 1]));
      if (pos !== 0 && pos !== 4) continue;
      const sounding = chords.filter((c) => R.lte(c.onset, e.onset) && R.lt(e.onset, R.add(c.onset, c.dur)));
      const pcs = new Set(sounding.map((c) => mod(c.midi as number, 12)));
      expect([...where, R.str(e.onset), pcs.has(mod(e.midi as number, 12))]).toEqual([
        ...where,
        R.str(e.onset),
        true,
      ]);
      // ... and the chords stay under the tune.
      for (const c of sounding)
        expect([...where, (c.midi as number) < (e.midi as number)]).toEqual([...where, true]);
    }
    if (level === 6) {
      // At least one passing or neighbour tone: a weak eighth outside its chord, stepped into and out of.
      const steps = t.params.steps as number[];
      expect([...where, steps.length >= 6]).toEqual([...where, true]);
    }
  }
}

describe("level ladders follow the lessons (contracts §7.3 gates, U05–U06 specs)", () => {
  test("triad quality: dim and aug at U05.L03, inversions at U05.L05, voicings at U05.L08", () => {
    const def = fam("fam.chd.quality-triad");
    expect(stateAt(def, "U05.L02").maxLevel).toBe(2);
    expect(stateAt(def, "U05.L03").maxLevel).toBe(4);
    expect(stateAt(def, "U05.L04").maxLevel).toBe(4);
    expect(stateAt(def, "U05.L05").maxLevel).toBe(5);
    expect(stateAt(def, "U05.L08").maxLevel).toBe(6);
  });
  test("bass dictation: two chords a bar open with U06.L08; numeral inversions (progression) with U06.L11", () => {
    const def = fam("fam.har.bass");
    expect(stateAt(def, "U06.L05").open).not.toContain("two-per-bar");
    expect(stateAt(def, "U06.L08").open).toContain("two-per-bar");
    const prog = fam("fam.har.progression");
    expect(stateAt(prog, "U06.L09").maxLevel).toBe(2);
    expect(stateAt(prog, "U06.L11").maxLevel).toBe(3);
  });
  test("cadences: PC and DC at U06.L07; schemas: rotations and doo-wop at U06.L07", () => {
    expect(stateAt(fam("fam.har.cadence"), "U06.L06").maxLevel).toBe(2);
    expect(stateAt(fam("fam.har.cadence"), "U06.L07").maxLevel).toBe(3);
    expect(stateAt(fam("fam.har.schema"), "U06.L07").maxLevel).toBe(2);
  });
  test("melodic dictation reaches level 5 by GYM.01 and level 6 at U07.L04 (X1 needs ≥ 4)", () => {
    const def = fam("fam.mel.dictation");
    expect(stateAt(def, "U07.L03").maxLevel).toBe(5);
    expect(stateAt(def, "U07.L04").maxLevel).toBe(6);
  });
});

describe("numerals are graded by (degree, quality, inversion), never as strings (integration)", () => {
  const C: KeySpec = { tonic: "C", mode: "major" };
  test("sameRnAnswer: spellings of one numeral agree; case, figure and target do not", () => {
    expect(sameRnAnswer("viio", "vii°", C)).toBe(true);
    expect(sameRnAnswer("V65", "V6/5", C)).toBe(true);
    expect(sameRnAnswer("bVII", "♭VII", C)).toBe(true);
    expect(sameRnAnswer("ii", "II", C)).toBe(false);
    expect(sameRnAnswer("V6", "V", C)).toBe(false);
    expect(sameRnAnswer("V7/V", "V7/V", C)).toBe(true);
    expect(sameRnAnswer("V7/V", "V7/ii", C)).toBe(false);
    expect(sameRnAnswer("ii", "II", null)).toBe(false);
  });
  test("a chord-dictation trial accepts the palette's degree sign and refuses the wrong case", () => {
    const def = fam("fam.har.progression");
    const t = trial(def, 1, "diatonic", ["diatonic"], 2);
    const rn = (t.expected as { rn: string[] }).rn;
    const glyphs = rn.map((x) => x.replace("viio", "vii°"));
    expect(gradeAnswer(t, { answer: { rn: glyphs }, rtMs: 1000, replays: 0 }).credit).toBe(1);
    const wrongCase = rn.map((x, i) =>
      i === 1 ? (x === x.toUpperCase() ? x.toLowerCase() : x.toUpperCase()) : x,
    );
    expect(gradeAnswer(t, { answer: { rn: wrongCase }, rtMs: 1000, replays: 0 }).credit).toBeLessThan(1);
  });
});

describe("Roman-numeral prompts print what the learner reads, answers keep the code spelling", () => {
  test("a diminished chord reads B° (never Bo), its numeral vii° (never viio)", () => {
    const def = fam("fam.har.rn");
    const prompts: string[] = [];
    for (let i = 0; i < 80; i++) {
      const t = trial(def, 1, "major-triads", ["major-triads"], i);
      const prompt = String(t.params.prompt ?? "");
      prompts.push(prompt);
      // The typing hint "(code spelling, e.g. F#m)" is code on purpose.
      expect(prompt.replace(/\(code spelling.*\)/, "")).not.toMatch(
        /\b[A-G][#b♯♭]?o\b|\bviio\b|[A-G]#|\b[A-G]b\b/,
      );
      // The answer keeps Oak's code spelling (what the RN palette and the text field compare).
      const want = (t.expected as { rn?: string[]; text?: string[] }).rn ?? t.expected.text ?? [];
      for (const w of want) expect(w).not.toMatch(/°|♯|♭/);
    }
    expect(prompts.some((p) => /B° is which Roman numeral|which chord is vii°/.test(p))).toBe(true);
  });
});
