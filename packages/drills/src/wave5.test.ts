// Wave 5: the stage E families and the drills U08–U11 lean on (content/specs/U08.md–U11.md): bass lines, groove
// lock, form, minor keys (natural, then harmonic and melodic), minor numerals, the twelve bars, swing, scale
// spelling. Golden tests state the expected notes (and check them in headless Strudel); property tests walk the
// default order lesson by lesson from U08.L01 to U12.L02 (U11.CP included) and check that every trial stays
// inside what the learner has met there — the right minor (no raised 7 before U10.L06, no raised 6 before
// U10.L08), numerals, loops, bass moves, feels, scales — that its answer is one of the options it shows, that no
// option repeats and no option names something still closed, and that it sounds in a comfortable register.
import { describe, expect, test } from "bun:test";
import type { Answer, Degree, FamilyDef, KeySpec, Trial } from "@oak/content-kit";
import { evalHeadless } from "@oak/grader/testing";
import { defaultOrder } from "../../../content/syllabus.ts";
import { FAMILIES } from "./catalog/families.ts";
import { bindFamily, DEFAULT_PROFILE, generateTrial, maxOpenLevel } from "./engine.ts";
import { bluesNames } from "./gen/key.ts";
import { degreeOfMidi, mod, parsePc } from "./kernel.ts";
import { resolutionSteps } from "./music.ts";
import { trialSeed } from "./rng.ts";
import { flattenEvents, strudelEvents } from "./testing.test-util.ts";

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
    { index: i, family: def.id, level, category, seed: trialSeed(def.id, `w5-${level}`, i) },
    DEFAULT_PROFILE,
    open,
  ) as Trial<Answer>;
const at = (id: string, lesson: string, level: number, category: string, i = 0) => {
  const def = fam(id);
  return trial(def, level, category, stateAt(def, lesson).open, i);
};
const midisOf = (t: Trial<Answer>, track: string) =>
  t.events
    .filter((e) => e.track === track && e.midi !== null)
    .sort((a, b) => a.onset[0] / a.onset[1] - b.onset[0] / b.onset[1])
    .map((e) => e.midi as number);
const pcsFrom = (t: Trial<Answer>, key: KeySpec) =>
  new Set(
    t.events.filter((e) => e.midi !== null).map((e) => mod((e.midi as number) - parsePc(key.tonic).pc, 12)),
  );
/** Headless Strudel plays exactly the trial's events. */
async function sameAsStrudel(t: Trial<Answer>) {
  const got = await strudelEvents(t.code, Number(t.params.bars ?? 1));
  expect(got.flat).toEqual(flattenEvents(t.events));
}

// --- golden ---------------------------------------------------------------------------------------------

describe("golden: minor degrees after a minor cadence (U10.L03, L06, L08)", () => {
  test("U10.L03: ♭3 in D minor after i–iv–v–i (no C♯: the major V waits for U10.L06), F resolving F E D", async () => {
    const t = at("fam.deg.fet-minor", "U10.L03", 1, "deg.b3");
    expect(t.params.key).toEqual({ tonic: "D", mode: "minor" });
    expect(t.expected).toEqual({ degrees: ["b3"] });
    expect(t.code).toContain(
      'chords: note("<[[d3,f4,a4,d5] [g2,bb4,d5,g5] [a2,c5,e5,a5] [d3,f4,a4,d5]] ~>")',
    );
    expect(t.code).toContain('mel: n("<~ 2>").scale("D4:minor")');
    expect(midisOf(t, "mel")).toEqual([65]);
    expect(t.resolution?.code).toContain('n("2 1 0").scale("D4:minor")');
    await sameAsStrudel(t);
  });
  test("U10.L06: the raised 7 in B minor is A♯ under the cadence with the major V (F♯ A♯ C♯), resolving up to B", async () => {
    const t = at("fam.deg.fet-minor", "U10.L06", 4, "deg.7");
    expect(t.params.key).toEqual({ tonic: "B", mode: "minor" });
    expect(t.code).toContain("[f#2,a#4,c#5,f#5]");
    expect(t.code).toContain('mel: n("<~ -1#>").scale("B4:minor")');
    expect(midisOf(t, "mel")).toEqual([70]);
    expect(t.resolution?.code).toContain('n("-1# 0")');
    await sameAsStrudel(t);
  });
  test("U10.L08: melodic minor's raised 6 (G♯ in B minor) climbs home la ti do: G♯ A♯ B, never through A", async () => {
    const t = at("fam.deg.fet-minor", "U10.L08", 5, "deg.6");
    expect(midisOf(t, "mel")).toEqual([68]);
    expect(t.resolution?.code).toContain('n("-2# -1# 0").scale("B4:minor")');
    const res = await evalHeadless(t.resolution?.code as string, 1);
    expect(res.events.map((e) => e.midi)).toEqual([68, 70, 71]);
    const A: KeySpec = { tonic: "A", mode: "minor" };
    expect(resolutionSteps("5#", A)).toEqual(["5#", "6#", 7]);
  });
});

describe("golden: which minor by ear (fam.key.mode level 2, U10.L06–L08)", () => {
  test("G harmonic minor: G B♭ G A | D E♭ F♯ G | G, over its own scale; the options are the forms met so far", async () => {
    const t = at("fam.key.mode", "U10.L06", 2, "harmonic minor");
    expect(t.code).toContain('mel: n("<[0 2 0 1] [4 5 6 7] 7 7>").scale("G4:harmonic:minor")');
    expect(midisOf(t, "mel")).toEqual([67, 70, 67, 69, 74, 75, 78, 79, 79, 79]);
    expect(t.params.options).toEqual(["major", "minor", "harmonic minor"]);
    await sameAsStrudel(t);
    const later = at("fam.key.mode", "U10.L08", 2, "melodic minor", 1);
    expect(later.params.options).toEqual(["major", "minor", "harmonic minor", "melodic minor"]);
    // Melodic minor climbs with 6 and 7 raised: the two notes below home are a whole step and a half step.
    const mel = midisOf(later, "mel");
    const t0 = parsePc((later.params.key as KeySpec).tonic).pc;
    expect(mel.slice(4, 8).map((m) => mod(m - t0, 12))).toEqual([7, 9, 11, 0]);
  });
});

describe("golden: bass lines and loops", () => {
  test("U08 bass line (fam.har.bass level 5, lines): Am F C G as root–approach, root–5th, root–approach, root–octave", async () => {
    const t = at("fam.har.bass", "U10.L04", 5, "lines");
    expect(t.params.key).toEqual({ tonic: "C", mode: "major" });
    // A2 G2 (G a step above the next root F) | F2 C2 (the 5th below) | C2 A1 (A a step above G) | G1 G2.
    expect(t.code).toContain('bass: note("<[a2 g2] [f2 c2] [c2 a1] [g1 g2]>")');
    expect(t.expected).toEqual({ degrees: ["6", "5", "4", "1", "1", "6", "5", "5"] });
    expect(t.params.moves).toEqual(["approach", "fifth", "approach", "octave"]);
    await sameAsStrudel(t);
  });
  test("U10.L07: the Aeolian loop is i–VI–III–VII (G♯m E B F♯), offered without its twin vi–IV–I–V", () => {
    const t = at("fam.har.schema", "U10.L07", 3, "aeolian");
    expect(midisOf(t, "bass").map((m) => degreeOfMidi(m, { tonic: "G#", mode: "major" }))).toEqual([
      "1",
      "b6",
      "b3",
      "b7",
    ]);
    expect(t.params.options).toEqual(["axis", "three-chord", "doo-wop", "aeolian", "andalusian"]);
    const twin = at("fam.har.schema", "U10.L07", 3, "axis-vi");
    expect(twin.params.options).not.toContain("aeolian");
  });
  test("U10.L07: the Andalusian descent in chord dictation: i VII VI V, the bass stepping down to the major V", () => {
    const def = fam("fam.har.progression");
    const { open } = stateAt(def, "U10.L07");
    let found: Trial<Answer> | null = null;
    for (let i = 0; i < 80 && !found; i++) {
      const t = trial(def, 4, "minor", open, i);
      if ((t.expected.rn ?? []).join(" ") === "i VII VI V") found = t;
    }
    expect(found).not.toBeNull();
    const t = found as Trial<Answer>;
    const key = t.params.key as KeySpec;
    const bass = midisOf(t, "bass").map((m) => degreeOfMidi(m, { tonic: key.tonic, mode: "major" }));
    expect(bass).toEqual(["1", "b7", "b6", "5"]);
    // The V is major: its third is the raised 7.
    expect(pcsFrom(t, key).has(11)).toBe(true);
  });
});

describe("golden: the twelve bars, swing, spelling", () => {
  test("which chord in bars 9 and 10 (V, then IV) is asked on about two trials in five", () => {
    const def = fam("fam.frm.blues");
    const { open } = stateAt(def, "U11.L05");
    let late = 0;
    for (let i = 0; i < 200; i++) {
      const t = trial(def, 1, "which-chord", open, i);
      const bar = t.params.markedBar as number;
      const want = [1, 2, 3, 4, 7, 8, 11].includes(bar) ? "I" : [5, 6, 10].includes(bar) ? "IV" : "V";
      expect([bar, t.expected.choice?.[0]]).toEqual([bar, want]);
      if (bar === 9 || bar === 10) late++;
    }
    // Two in five by design, plus the V and IV bars an ordinary pick lands on (≈ 57% in all).
    expect(late).toBeGreaterThan(90);
    expect(late).toBeLessThan(140);
  });
  test("swung eighths: the hats' off-beats land two thirds of the way through the beat", async () => {
    const t = at("fam.rhy.swing", "U11.L07", 1, "swung");
    expect(t.params.options).toEqual(["straight", "swung"]);
    expect(t.params.optionLabels).toEqual({
      straight: "Straight: even eighths",
      swung: "Swung: long–short eighths",
    });
    const hats = t.events.filter((e) => e.track === "hats").map((e) => e.onset[0] / e.onset[1]);
    // Cycle = one 4/4 bar: beat k at k/4; the off-beat of beat 1 at 1/4 · 2/3 = 1/6.
    expect(hats.slice(0, 2)).toEqual([0, 1 / 6]);
    const res = await evalHeadless(t.code, 1);
    const evalHats = res.events.filter((e) => e.track === "hats").map((e) => e.begin);
    expect(evalHats.slice(0, 2)).toEqual(["0", "1/6"]);
  });
  test("blues scales spelled with the blue note as ♭5, or ♯4 where ♭5 needs a double flat or C♭/F♭", () => {
    expect(bluesNames("C")).toEqual(["C", "Eb", "F", "Gb", "G", "Bb"]);
    expect(bluesNames("A")).toEqual(["A", "C", "D", "Eb", "E", "G"]);
    expect(bluesNames("E")).toEqual(["E", "G", "A", "Bb", "B", "D"]);
    expect(bluesNames("F")).toEqual(["F", "Ab", "Bb", "B", "C", "Eb"]);
    expect(bluesNames("Eb")).toEqual(["Eb", "Gb", "Ab", "A", "Bb", "Db"]);
    expect(bluesNames("B")).toEqual(["B", "D", "E", "F", "F#", "A"]);
  });
  test("a blues spelling accepts the blue note either way, and nothing else enharmonic", () => {
    const def = fam("fam.key.scale-spell");
    const f = bindFamily(def);
    const { open } = stateAt(def, "U11.L03");
    for (let i = 0; i < 12; i++) {
      const t = trial(def, 4, "blues", open, i);
      const want = t.expected.text as string[];
      const blue = want[3] as string;
      const other =
        blue.endsWith("b") && blue.length === 2
          ? `${String.fromCharCode(blue.charCodeAt(0) === 65 ? 71 : blue.charCodeAt(0) - 1)}#`
          : null;
      const right = f.grade(t, { answer: { text: [want.join(" ")] }, rtMs: 1, replays: 0 }, DEFAULT_PROFILE);
      expect(right.credit).toBe(1);
      if (other) {
        const twin = [...want];
        twin[3] = other;
        const ok = f.grade(t, { answer: { text: twin }, rtMs: 1, replays: 0 }, DEFAULT_PROFILE);
        expect([want.join(" "), other, ok.credit]).toEqual([want.join(" "), other, 1]);
      }
      // The 4th spelled enharmonically is still wrong.
      const bad = [...want];
      bad[2] = `${bad[2]}#`;
      expect(f.grade(t, { answer: { text: bad }, rtMs: 1, replays: 0 }, DEFAULT_PROFILE).credit).toBeLessThan(
        1,
      );
    }
  });
  test("the parallel minor's signature, written as the decks write it (D minor: 1b; A minor: 0; E minor: 1#)", () => {
    const def = fam("fam.key.circle");
    const { open } = stateAt(def, "U10.L02");
    const seen = new Map<string, string>();
    for (let i = 0; i < 60; i++) {
      const t = trial(def, 3, "parallel", open, i);
      seen.set((t.params.key as KeySpec).tonic, (t.expected.text as string[])[0] as string);
    }
    if (seen.has("D")) expect(seen.get("D")).toBe("1b");
    if (seen.has("A")) expect(seen.get("A")).toBe("0");
    if (seen.has("E")) expect(seen.get("E")).toBe("1#");
    expect(seen.size).toBeGreaterThan(5);
  });
});

// --- level ladders --------------------------------------------------------------------------------------

describe("level ladders follow U08–U11 (contracts §7.3, the unit specs)", () => {
  const max = (id: string, lesson: string) => stateAt(fam(id), lesson).maxLevel;
  test("scale spelling: natural minor from U10.L01 (level 3), pentatonic from U11.L01 (level 4)", () => {
    expect(max("fam.key.scale-spell", "U09.L05")).toBe(2);
    expect(max("fam.key.scale-spell", "U10.L01")).toBe(3);
    expect(max("fam.key.scale-spell", "U11.L01")).toBe(4);
    const { open } = stateAt(fam("fam.key.scale-spell"), "U11.L01");
    expect(open).not.toContain("minor-pentatonic");
    expect(open).not.toContain("blues");
  });
  test("minor degrees: 1 ♭3 5, 2 4 and ♭6 ♭7 at U10.L03; 7 at U10.L06; 6 at U10.L08", () => {
    expect(max("fam.deg.fet-minor", "U10.L03")).toBe(3);
    expect(max("fam.deg.fet-minor", "U10.L05")).toBe(3);
    expect(max("fam.deg.fet-minor", "U10.L06")).toBe(4);
    expect(max("fam.deg.fet-minor", "U10.L08")).toBe(6);
  });
  test("which minor opens with harmonic minor (U10.L06); bass in minor and bass lines with level 5 (U10.L04)", () => {
    expect(max("fam.key.mode", "U10.L05")).toBe(1);
    expect(max("fam.key.mode", "U10.L06")).toBe(2);
    expect(max("fam.har.bass", "U08.L05")).toBe(4);
    expect(max("fam.har.bass", "U10.L04")).toBe(5);
  });
  test("schemas: the Aeolian loop and the Andalusian cadence at U10.L07, the blues at U11.L05", () => {
    expect(max("fam.har.schema", "U10.L06")).toBe(2);
    expect(max("fam.har.schema", "U10.L07")).toBe(3);
    expect(max("fam.har.schema", "U11.L05")).toBe(4);
  });
  test("the twelve bars: which chord at U11.L05, quick change at U11.L06; swing at U11.L07; groove lock at U08.L04", () => {
    expect(max("fam.frm.blues", "U11.L05")).toBe(2);
    expect(max("fam.frm.blues", "U11.L06")).toBe(3);
    expect(max("fam.rhy.swing", "U11.L07")).toBe(3);
    expect(max("fam.rhy.groove-lock", "U08.L04")).toBe(3);
    expect(max("fam.frm.sections", "U09.L03")).toBe(3);
  });
});

// --- the course walk --------------------------------------------------------------------------------------

const STAGE_E = [
  "fam.deg.fet-minor",
  "fam.deg.tonic",
  "fam.deg.resolve",
  "fam.deg.index",
  "fam.key.mode",
  "fam.key.scale-spell",
  "fam.key.circle",
  "fam.har.rn",
  "fam.har.function",
  "fam.har.bass",
  "fam.har.schema",
  "fam.har.progression",
  "fam.frm.sections",
  "fam.frm.blues",
  "fam.rhy.swing",
  "fam.rhy.groove-lock",
  "fam.mel.dictation",
  "fam.mel.echo",
  "fam.mel.sight",
];
const WALK = defaultOrder.slice(rank("U08.L01"), rank("U12.L02") + 1).filter((s) => /\.(L\d+|CP)$/.test(s));
const MINOR_NATURAL = new Set(["1", "2", "b3", "4", "5", "b6", "b7"]);
const MAJOR_DEGREES = new Set(["1", "2", "3", "4", "5", "6", "7"]);
const isMinorKey = (k: KeySpec) => /minor/.test(k.mode);

describe("the course walk U08.L01–U12.L02: every trial stays inside what the learner has met", () => {
  for (const id of STAGE_E)
    test(id, () => {
      const def = fam(id);
      const catIds = new Set(def.categories.map((c) => c.id));
      let checked = 0;
      for (const lesson of WALK) {
        if (rank(def.unlock.lesson) > rank(lesson)) continue;
        const { open, maxLevel } = stateAt(def, lesson);
        const majorV = rank(lesson) >= rank("U10.L06");
        const raised6 = rank(lesson) >= rank("U10.L08");
        for (let level = 1; level <= maxLevel; level++) {
          const lv = def.levels[level - 1] as FamilyDef["levels"][number];
          const cats = lv.categories.filter((c) => open.includes(c));
          expect([id, lesson, level, cats.length > 0]).toEqual([id, lesson, level, true]);
          for (let i = 0; i < 10; i++) {
            const t = trial(def, level, cats[i % cats.length] as string, open, i);
            checked++;
            const where = [id, lesson, level, t.category, i];
            expect([...where, open.includes(t.category)]).toEqual([...where, true]);
            // Options: unique, the answer among them, and none naming a category still closed.
            const options = t.params.options as string[] | undefined;
            if (options) {
              expect([...where, new Set(options).size]).toEqual([...where, options.length]);
              for (const c of t.expected.choice ?? [])
                expect([...where, options.includes(c)]).toEqual([...where, true]);
              for (const o of options)
                if (catIds.has(o)) expect([...where, o, open.includes(o)]).toEqual([...where, o, true]);
            } else {
              for (const c of t.expected.choice ?? [])
                if (catIds.has(c)) expect([...where, c, open.includes(c)]).toEqual([...where, c, true]);
            }
            const key = t.params.key as KeySpec | undefined;
            // Minor keys only from U10.L01, pentatonic and blues scales only from U11; no mode before U14.
            if (key) {
              const modes = ["major"];
              if (rank(lesson) >= rank("U10.L01")) modes.push("minor", "harmonic minor", "melodic minor");
              if (rank(lesson) >= rank("U11.L01"))
                modes.push("major pentatonic", "minor pentatonic", "blues");
              expect([...where, key.mode, modes.includes(key.mode)]).toEqual([...where, key.mode, true]);
            }
            // The right minor: no raised 7 before U10.L06, no raised 6 before U10.L08 (the scale's own notes).
            if (key && isMinorKey(key)) {
              const pcs = pcsFrom(t, key);
              if (!majorV) expect([...where, "raised 7", pcs.has(11)]).toEqual([...where, "raised 7", false]);
              if (!raised6) expect([...where, "raised 6", pcs.has(9)]).toEqual([...where, "raised 6", false]);
              if (key.mode === "harmonic minor") expect([...where, majorV]).toEqual([...where, true]);
              if (key.mode === "melodic minor") expect([...where, raised6]).toEqual([...where, true]);
            }
            // Degree answers in the pad the learner has: ♭3 ♭6 ♭7 in minor (7 and 6 once taught), 1–7 in major.
            for (const d of t.expected.degrees ?? []) {
              const allowed =
                key && isMinorKey(key)
                  ? new Set([...MINOR_NATURAL, ...(majorV ? ["7"] : []), ...(raised6 ? ["6"] : [])])
                  : MAJOR_DEGREES;
              expect([...where, d, allowed.has(d)]).toEqual([...where, d, true]);
            }
            // Numerals: the major V (and vii°) of a minor key only from U10.L06.
            if (key && isMinorKey(key) && !majorV)
              for (const rn of [...(t.expected.rn ?? []), String(t.params.rn ?? "")])
                expect([...where, rn, /^(V|viio)$/.test(rn)]).toEqual([...where, rn, false]);
            // No double sharps or flats in any shown code, and none in a spelling answer before U12.
            expect([...where, /[a-g](bb|##)\d/.test(t.code)]).toEqual([...where, false]);
            for (const x of t.expected.text ?? [])
              expect([...where, x, /(bb|##)$/.test(x)]).toEqual([...where, x, false]);
            checkFamily(id, t, level, lesson, where);
          }
        }
      }
      expect(checked).toBeGreaterThan(0);
    });
});

function checkFamily(id: string, t: Trial<Answer>, level: number, lesson: string, where: unknown[]): void {
  if (id === "fam.har.bass") {
    // A bass player's register, E1–A♭3, and in a line no leap wider than an octave.
    const bass = midisOf(t, "bass");
    for (const m of bass) expect([...where, m >= 28 && m <= 56]).toEqual([...where, true]);
    for (let k = 1; k < bass.length; k++)
      expect([...where, Math.abs((bass[k] as number) - (bass[k - 1] as number)) <= 12]).toEqual([
        ...where,
        true,
      ]);
    if (t.category === "lines") {
      // Two notes a bar: the root on beat 1 (the chord's root), then the 5th, the octave or an approach.
      expect([...where, bass.length]).toEqual([...where, 8]);
      const moves = t.params.moves as string[];
      const key = t.params.key as KeySpec;
      for (let b = 0; b < 4; b++) {
        const [root, second] = [bass[2 * b] as number, bass[2 * b + 1] as number];
        const next = bass[(2 * b + 2) % 8] as number;
        const iv = mod(second - root, 12);
        if (moves[b] === "fifth") expect([...where, b, iv]).toEqual([...where, b, 7]);
        if (moves[b] === "octave") expect([...where, b, Math.abs(second - root)]).toEqual([...where, b, 12]);
        if (moves[b] === "approach") {
          expect([...where, b, Math.abs(second - next) <= 2 && second !== next]).toEqual([...where, b, true]);
          // Diatonic in its key.
          const deg = degreeOfMidi(second, { tonic: key.tonic, mode: "major" });
          const set = isMinorKey(key) ? MINOR_NATURAL : MAJOR_DEGREES;
          expect([...where, b, set.has(deg)]).toEqual([...where, b, true]);
        }
      }
      // Roots and 5ths side by side: a line has at least two kinds of move.
      expect([...where, new Set(moves).size >= 2]).toEqual([...where, true]);
    }
    if (rank(lesson) < rank("U14.L01"))
      expect([...where, (t.params.key as KeySpec).mode]).not.toEqual([...where, "dorian"]);
  }
  if (id === "fam.deg.fet-minor") {
    // The target in the level's register (A3–E5), in a minor key.
    const [lo, hi] = [57, 76];
    for (const m of midisOf(t, "mel"))
      expect([...where, m >= lo - 1 && m <= hi + 1]).toEqual([...where, true]);
    expect([...where, (t.params.key as KeySpec).mode]).toEqual([...where, "minor"]);
  }
  if (id === "fam.key.mode" && level === 2) {
    // A tune alone in a singer's register, that touches its 3rd and climbs home through 6 and 7.
    const mel = midisOf(t, "mel");
    for (const m of mel) expect([...where, m >= 55 && m <= 81]).toEqual([...where, true]);
    const key = t.params.key as KeySpec;
    const t0 = parsePc(key.tonic).pc;
    const third = key.mode === "major" ? 4 : 3;
    expect([...where, mel.slice(0, 4).some((m) => mod(m - t0, 12) === third)]).toEqual([...where, true]);
  }
  if (id === "fam.har.schema") {
    // The answer's twin (the same four chords with another home) is never offered beside it.
    const options = t.params.options as string[];
    const twins: Record<string, string> = { aeolian: "axis-vi", "axis-vi": "aeolian" };
    const twin = twins[t.category];
    if (twin) expect([...where, options.includes(twin)]).toEqual([...where, false]);
  }
  if (id === "fam.rhy.swing" && level === 1)
    expect([...where, t.params.options]).toEqual([...where, ["straight", "swung"]]);
  if (id === "fam.frm.blues") {
    const key = t.params.key as KeySpec;
    // Blues keys a band plays in: up to two sharps or flats; dominant sevenths.
    expect([...where, ["C", "G", "D", "F", "Bb"].includes(key.tonic)]).toEqual([...where, true]);
  }
  if (id === "fam.key.scale-spell") {
    const key = t.params.key as KeySpec;
    const order = ["U11.L01", "U11.L02", "U11.L03"];
    const need: Record<string, string> = {
      "major pentatonic": order[0] as string,
      "minor pentatonic": order[1] as string,
      blues: order[2] as string,
      "harmonic minor": "U10.L06",
      "melodic minor": "U10.L08",
    };
    const gate = need[key.mode];
    if (gate) expect([...where, key.mode, rank(lesson) >= rank(gate)]).toEqual([...where, key.mode, true]);
  }
}

describe("degrees and their answers agree with what sounds (minor keys)", () => {
  test("bass degrees in minor are do-based (♭3 ♭6 ♭7 against major on the same home)", () => {
    const def = fam("fam.har.bass");
    const { open } = stateAt(def, "U10.L07");
    for (let i = 0; i < 40; i++) {
      const t = trial(def, 5, i % 2 ? "minor" : "lines", open, i);
      const key = t.params.key as KeySpec;
      const got = midisOf(t, "bass").map((m) => degreeOfMidi(m, { tonic: key.tonic, mode: "major" }));
      expect(got).toEqual(t.expected.degrees as Degree[]);
    }
  });
});
