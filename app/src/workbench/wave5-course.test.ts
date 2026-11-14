// Wave 5 review (review:surfaces): every U08–U11 and A1 shown example, reference solution and Make starter (lessons
// and the U09–U11 checkpoints), and every passing reference of the C3, C4 and C5 capstones, walked through the
// Workbench as the lesson player shows it, then every one-key example moved to every key the units use. For each,
// independently of the code under test:
// - the staff: what abcjs parses back from every page sounds exactly the learner's notes; the key line names the
//   piece's key (a minor key keeps its own name, so abcjs draws the relative major's signature);
// - spelling: every note a `.scale()` produces is written on the letter of its degree (the raised 7 of G♯ minor is
//   F𝄪, never G; the ♭3 of a blues is E♭, never D♯), and its degree label and syllable are the do-based ones (minor:
//   ♭3 me, ♭6 le, ♭7 te, raised 6 la, raised 7 ti);
// - harmony: every chord region is the chord @oak/theory reads from the pitch classes sounding at its start, and
//   its numeral is theory's numeral of it in the key (i iv V7 in minor, I7 IV7 V7 in a blues);
// - form: for code with `arrange()`, the sections the Workbench shows are the ones read here from the code's own
//   `label: arrange([n, roleSection], …)` calls (tags, bars, order), the staff labels each one where it starts with
//   a double bar before it, and no tracks disagree.
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import type { KeySpec, LessonDef, MeterId, PickupSpec } from "@oak/content-kit";
import { flattenExercise, stripMarkers } from "@oak/content-kit";
import { evaluateForGrading, initRealm } from "@oak/grader";
import { spelledByEvent } from "@oak/notation";
import { chordOfRoman, displayRN, parseRN, readChord, romanText, toLeadSheet } from "@oak/theory";
import { capstones } from "../../../content/capstones.ts";
import { loadCheckpointFiles, loadLessons } from "../../../content/lib/load.bun.ts";
import { readBack } from "../../../packages/notation/corpus/harness.ts";
import { bandCodeFor } from "../../../packages/strudel/src/band.ts";
import { bandSetupOf } from "../lesson/band.ts";
import { keyOfRibbon } from "./colour.ts";
import { pieceBarsOf } from "./lines.ts";
import { buildModel, staffPage, staffPageCount, type WorkbenchModel } from "./model.ts";

setDefaultTimeout(180_000);

interface Shown {
  where: string;
  code: string;
  bars: number;
  key: KeySpec;
  meter: MeterId;
  pickup: PickupSpec | null;
  band: { code: string; heard: ("drums" | "bass" | "chords")[] } | null;
}

let SHOWN: Shown[] = [];

const UNITS = /^(U0[89]|U1[01]|A1)\./;

beforeAll(async () => {
  await initRealm({ toolbox: [], lockdown: false });
  const { lessons } = await loadLessons();
  SHOWN = lessons.filter((l) => UNITS.test(l.def.id)).flatMap((l) => shownOf(l.def));
  const { defs } = await loadCheckpointFiles();
  for (const cp of defs.filter((d) => /^U(09|10|11)\.CP$/.test(d.id))) {
    const items = [...cp.authored, cp.make];
    SHOWN.push(
      ...shownOf({
        id: cp.id,
        key: { tonic: "C", mode: "major" },
        meter: "4/4",
        bpm: 90,
        steps: items.map((e, i) => ({ id: `I${i + 1}`, ui: {}, exercise: e })),
      } as unknown as LessonDef),
    );
  }
  // The capstones' passing references (their rubric tests): whole songs, arranged.
  for (const c of capstones.filter((x) => ["C3", "C4", "C5"].includes(x.id))) {
    const key = ((c as { key?: KeySpec }).key ?? { tonic: "C", mode: "major" }) as KeySpec;
    const passing: { name: string; code: string }[] = [];
    const find = (x: unknown) => {
      if (Array.isArray(x)) for (const v of x) find(v);
      else if (x && typeof x === "object") {
        const t = x as { name?: string; expect?: string; response?: { code?: unknown } };
        if (t.expect === "pass" && typeof t.response?.code === "string")
          passing.push({ name: t.name ?? "", code: t.response.code });
        else for (const v of Object.values(x)) find(v);
      }
    };
    find(c);
    for (const t of passing)
      SHOWN.push({
        where: `${c.id} ${t.name}`,
        code: t.code,
        bars: 8,
        key,
        meter: "4/4",
        pickup: null,
        band: null,
      });
  }
});

function shownOf(def: LessonDef): Shown[] {
  const out: Shown[] = [];
  for (const s of def.steps) {
    const exs = s.exercise ? flattenExercise(s.exercise) : [];
    const first = exs[0];
    const key = (first && "key" in first && first.key) || def.key;
    const meter = (first && "meter" in first && first.meter) || def.meter;
    const pickup = (first && "pickup" in first && first.pickup) || def.pickup || null;
    const setup = bandSetupOf(s.ui.band, { flavour: "flavour.pop", key, bpm: def.bpm, at: def.id });
    const bandFor = (code: string): Shown["band"] =>
      setup
        ? {
            code: bandCodeFor(setup, { learnerCode: code, key, defaultBpm: def.bpm }),
            heard: setup.tracks as ("drums" | "bass" | "chords")[],
          }
        : null;
    const push = (where: string, code: string, bars: number) =>
      out.push({ where: `${def.id} ${s.id} ${where}`, code, bars, key, meter, pickup, band: bandFor(code) });
    if (s.example) push(s.example.id, s.example.code, s.example.bars);
    for (const e of exs) {
      const bars = "reference" in e && e.reference && "bars" in e.reference ? Number(e.reference.bars) : 4;
      if ("reference" in e && e.reference?.solutions)
        for (const [i, sol] of e.reference.solutions.entries()) push(`${e.id}:ref${i}`, sol, bars || 4);
      if (e.kind === "code-make") push(`${e.id}:starter`, stripMarkers(e.code.starter).code, 4);
    }
  }
  return out;
}

async function modelOf(s: Shown): Promise<WorkbenchModel | null> {
  // The Workbench analyses an arranged song whole (lines.ts `pieceBarsOf`).
  const bars = pieceBarsOf(s.code, s.bars);
  const result = await evaluateForGrading(s.code, {
    mode: "lesson",
    bars,
    lint: null,
    ...(s.band ? { band: s.band.code } : {}),
  });
  const out = buildModel(s.code, result, {
    meter: s.meter,
    key: s.key,
    staff: "auto",
    annotations: { degree: true, solfege: true, noteName: false },
    ...(s.pickup ? { pickup: s.pickup } : {}),
    bandHeard: s.band ? s.band.heard : null,
  });
  return out.ok ? out.model : null;
}

// --- spelling ------------------------------------------------------------------------------------------------

const LETTERS = "CDEFGAB";
const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const tonicPc = (t: string) =>
  (PC[t[0] as string] as number) + (t.includes("#") ? 1 : t.includes("b") ? -1 : 0);

/**
 * Semitones above the tonic → [degree number, label, syllable], do-based (contracts §8: 1 is do in minor too).
 * The tritone (♯4 / ♭5) and ♭2 depend on direction and are left out.
 */
const DEGREES: Record<"major" | "minor", Record<number, [number, string, string]>> = {
  major: {
    0: [1, "1", "do"],
    2: [2, "2", "re"],
    3: [3, "♭3", "me"],
    4: [3, "3", "mi"],
    5: [4, "4", "fa"],
    7: [5, "5", "sol"],
    8: [6, "♭6", "le"],
    9: [6, "6", "la"],
    10: [7, "♭7", "te"],
    11: [7, "7", "ti"],
  },
  minor: {
    0: [1, "1", "do"],
    2: [2, "2", "re"],
    3: [3, "♭3", "me"],
    5: [4, "4", "fa"],
    7: [5, "5", "sol"],
    8: [6, "♭6", "le"],
    9: [6, "6", "la"],
    10: [7, "♭7", "te"],
    11: [7, "7", "ti"],
  },
};

/** "C#:minor" / "Eb4 blues" (the events' `scaleCtx`) → the key the degrees are counted in (blues and pentatonics: their tonic's mode). */
function keyOfScale(ctx: string): { tonic: string; mode: "major" | "minor" } | null {
  const m = /^([A-G][#b]?)-?\d*[: ](.+)$/.exec(ctx.trim());
  if (!m) return null;
  const name = m[2] as string;
  const minor = /minor|aeolian|dorian|phrygian|blues/.test(name) && !/major blues/.test(name);
  if (/major|ionian|mixolydian|lydian/.test(name) && !/minor/.test(name))
    return { tonic: m[1] as string, mode: "major" };
  return minor ? { tonic: m[1] as string, mode: "minor" } : null;
}

/** Notes the spelling check read, and how many of them were the raised 6 or 7 of a minor key. */
const COUNT = { spelled: 0, raised: 0 };

function spellingProblems(s: Shown, m: WorkbenchModel): string[] {
  const src = m.staffSource;
  if (!src) return [];
  const out: string[] = [];
  const spelled = new Map<string, { letter: string; name: string }>();
  for (let p = 0; p < staffPageCount(src); p++) {
    const page = staffPage(src, p);
    if (page.score) for (const [id, sp] of spelledByEvent(page.score)) spelled.set(id, sp);
  }
  for (const e of src.events) {
    if (e.midi === null || !e.scaleCtx) continue;
    const k = keyOfScale(e.scaleCtx);
    if (!k) continue;
    const off = (((Math.round(e.midi) - tonicPc(k.tonic)) % 12) + 12) % 12;
    const want = DEGREES[k.mode][off];
    if (!want) continue;
    const sp = spelled.get(e.id);
    if (sp) COUNT.spelled++;
    if (sp && k.mode === "minor" && (off === 9 || off === 11)) COUNT.raised++;
    const letter = LETTERS[(LETTERS.indexOf(k.tonic[0] as string) + want[0] - 1) % 7];
    if (sp && sp.letter !== letter)
      out.push(`${s.where}: ${e.scaleCtx} midi ${e.midi} drawn ${sp.name}, degree ${want[1]} is a ${letter}`);
    const lab = m.byId.get(e.id)?.label;
    // A blues names its ♭5/♯4 by direction; the rest are fixed. Only the key the label reads in can be checked.
    const labKey = m.key && m.key.tonic === k.tonic && modeOf(m.key.mode) === k.mode;
    if (labKey && lab?.degree && (lab.degree.label !== want[1] || lab.degree.syllable !== want[2]))
      out.push(
        `${s.where}: ${e.scaleCtx} midi ${e.midi} labelled ${lab.degree.label} ${lab.degree.syllable}, want ${want[1]} ${want[2]}`,
      );
  }
  return out;
}

// --- harmony -------------------------------------------------------------------------------------------------

function regionProblems(s: Shown, m: WorkbenchModel): string[] {
  const h = m.harmony;
  if (!h) return [];
  const out: string[] = [];
  const heard = new Set((s.band?.heard ?? []).map((t) => `band.${t}`));
  const voices = m.events.filter(
    (e) => e.midi !== null && (!e.band || heard.has(e.track)) && (h.source === "band" ? e.band : true),
  );
  const melodyIds = new Set(h.melody.keys());
  for (const r of h.regions) {
    const at = r.from + 1e-6;
    const sounding = voices.filter((e) => e.onset <= at && e.end > at && !melodyIds.has(e.id));
    if (sounding.length < 3) continue;
    const midis = sounding.map((e) => Math.round(e.midi as number));
    const bass = Math.min(...midis);
    const reading = readChord(
      midis.map((x) => ((x % 12) + 12) % 12),
      ((bass % 12) + 12) % 12,
    );
    if (!reading) continue;
    if (reading.quality === "aug") continue;
    // Wave 6 (definition of done 16): a chord is read in the key in force at its bar, not in the piece's first key
    // (U10.L01's hook plays the same loop in C major, then in C minor).
    const k = keyOfRibbon(m.colour?.keys ?? [], r.from) ?? m.key ?? s.key;
    const rnRaw = romanText(reading.chord, k);
    const inKeyChord = rnRaw.includes("/") ? null : chordOfRoman(rnRaw, k);
    const symbol = inKeyChord ? toLeadSheet(inKeyChord) : reading.leadSheet;
    if (symbol !== r.symbol)
      out.push(`${s.where} @${r.from}: band shows ${r.symbol}, theory reads ${symbol}`);
    const parsed = parseRN(rnRaw, k);
    const rn = parsed && !rnRaw.includes("/") ? displayRN(parsed) : rnRaw.replace(/o/g, "°");
    if (r.rn !== null && r.rn !== rn) out.push(`${s.where} @${r.from}: numeral ${r.rn}, theory ${rn}`);
  }
  return out;
}

// --- the staff -----------------------------------------------------------------------------------------------

const modeOf = (mode: string): "major" | "minor" =>
  /minor|aeolian|dorian|phrygian/.test(mode) ? "minor" : "major";

function staffProblems(s: Shown, m: WorkbenchModel): string[] {
  const src = m.staffSource;
  if (!src) return [];
  const out: string[] = [];
  for (let p = 0; p < staffPageCount(src); p++) {
    const page = staffPage(src, p);
    if (!page.abc) {
      out.push(`${s.where} page ${p}: ${page.error}`);
      continue;
    }
    const drawn = readBack(page.abc.abc)
      .staves.filter((st) => !st.perc)
      .flatMap((st) => st.voices.flatMap((v) => v.flatMap((n) => n.midis)));
    const sounding = m.events
      .filter(
        (e) => !e.band && e.midi !== null && e.onset >= page.startBar && e.onset < page.startBar + page.bars,
      )
      .map((e) => Math.round(e.midi as number));
    // Two lines in unison on one staff share a head (c5): every pitch that sounds is drawn, nothing more.
    const uniq = (xs: readonly number[]) => [...new Set(xs)].sort((a, b) => a - b).join();
    if (uniq(drawn) !== uniq(sounding) || drawn.length > sounding.length)
      out.push(`${s.where} page ${p}: drew ${uniq(drawn)} for ${uniq(sounding)}`);
    // The key line: a one-key piece in a stated key names it (minor as minor: K:Ebm draws six flats).
    if (m.keySpans.length === 1 && m.key && src.keySpans.every((k) => k.source === "scale")) {
      const kLine = /^K:\s*([A-G][#b]?m?)/m.exec(page.abc.abc)?.[1];
      const want = `${m.key.tonic}${modeOf(m.key.mode) === "minor" ? "m" : ""}`;
      if (kLine && kLine !== want && !/blues/.test(s.code))
        out.push(`${s.where} page ${p}: key line K:${kLine}, the piece is in ${want}`);
    }
  }
  return out;
}

// --- form ----------------------------------------------------------------------------------------------------

const ROLE =
  /^(drums|perc|bass|chords|keys|pad|mel|melody|lead|vox|riff|hats|kick|snare|guitar|strings|horns|arp)/;

/**
 * The sections a code's `label: arrange([n, const], …)` calls state, read from the text: tag, start and bars. A
 * part that rests in a section (`[4, silence]`) names no section: its tag is `null`.
 */
function arrangedOf(
  code: string,
): { track: string; sections: { tag: string | null; start: number; bars: number }[] }[] {
  const out: { track: string; sections: { tag: string | null; start: number; bars: number }[] }[] = [];
  for (const line of code.split("\n")) {
    const m = /^\s*([A-Za-z_$][\w$]*)\s*:\s*arrange\((.*)\)/.exec(line);
    if (!m) continue;
    const sections: { tag: string | null; start: number; bars: number }[] = [];
    let start = 0;
    for (const a of (m[2] as string).matchAll(/\[\s*(\d+(?:\.\d+)?)\s*,\s*([A-Za-z_$][\w$]*)\s*\]/g)) {
      const bars = Number(a[1]);
      const name = a[2] as string;
      const rest = name.replace(ROLE, "");
      const tag = name === "silence" ? null : rest.charAt(0).toLowerCase() + rest.slice(1);
      sections.push({ tag, start, bars });
      start += bars;
    }
    out.push({ track: m[1] as string, sections });
  }
  return out;
}

function formProblems(s: Shown, m: WorkbenchModel): string[] {
  const arranged = arrangedOf(s.code);
  if (arranged.length === 0) return [];
  // Content writes one arrange() per labelled track with silence where a part rests (STYLE §10), so the
  // tracks always agree; a disagreement would be content's bug, reported as such.
  const span = (xs: readonly { start: number; bars: number }[]) =>
    xs.map((x) => `${x.start}+${x.bars}`).join();
  const first = arranged[0]?.sections ?? [];
  const agree = arranged.every((a) => span(a.sections) === span(first));
  const ref = first.map((x, i) => ({
    ...x,
    tag: arranged.map((a) => a.sections[i]?.tag).find(Boolean) ?? null,
  }));
  const lines = m.lines;
  if (!lines) return [`${s.where}: no form view`];
  if (!agree) return lines.problem ? [] : [`${s.where}: the tracks disagree but the Workbench draws a form`];
  const out: string[] = [];
  if (lines.problem) out.push(`${s.where}: the Workbench says the tracks disagree: ${lines.problem}`);
  const got = lines.sections.map((x) => `${x.tag}@${x.startBar}+${x.bars}`).join(" ");
  const want = ref.map((x) => `${x.tag}@${x.start}+${x.bars}`).join(" ");
  // A wholly silent `[n, silence]` section (a lead-in) has no const name: compare the named ones.
  if (got !== want) out.push(`${s.where}: sections ${got} ≠ ${want}`);
  // The staff: each section starting in a page is labelled there, a double bar before it (not before bar 1).
  const src = m.staffSource;
  if (src && lines.sections.length > 0)
    for (let p = 0; p < staffPageCount(src); p++) {
      const page = staffPage(src, p);
      if (!page.abc) continue;
      const parts = [...page.abc.abc.matchAll(/\[P:([^\]]+)\]/g)].map((x) => (x[1] as string).trim());
      const starting = lines.sections.filter(
        (x) => x.startBar >= page.startBar && x.startBar < page.startBar + page.bars,
      );
      const names = starting.map((x) => x.text);
      if (parts.join("|") !== names.join("|") && !parts.every((x, i) => x.includes(names[i] ?? "\u0000")))
        out.push(
          `${s.where} page ${p}: section labels ${JSON.stringify(parts)}, want ${JSON.stringify(names)}`,
        );
    }
  return out;
}

// --- moving examples to every key ----------------------------------------------------------------------------

/** Every tonic the units use, sharps and flats to seven: minor keys from A♭ (seven flats) to A♯ (seven sharps). */
const TONICS = [
  "C",
  "G",
  "D",
  "A",
  "E",
  "B",
  "F#",
  "C#",
  "F",
  "Bb",
  "Eb",
  "Ab",
  "Db",
  "Gb",
  "G#",
  "D#",
  "A#",
];
const SCALE_ARG = /\.scale\("([A-G][#b]?)(-?\d):([a-z :]+)"\)/g;
/** Minor tonics past seven accidentals do not exist as keys (D♭ minor, G♭ minor): left out. */
const NO_MINOR = new Set(["Db", "Gb"]);
const NO_MAJOR = new Set(["G#", "D#", "A#"]);

function inKey(s: Shown, tonic: string): Shown | null {
  // One tonic (its scales may differ: a bass on the natural minor under a tune on the harmonic minor).
  const found = [...s.code.matchAll(SCALE_ARG)];
  const tonics = new Set(found.map((m) => m[1]));
  if (tonics.size !== 1 || s.band || /\bnote\(|chord\(/.test(s.code)) return null;
  const names = [...new Set(found.map((m) => m[3] as string))];
  const modes = names.map((n) => keyOfScale(`C:${n}`));
  if (modes.some((k) => !k) || new Set(modes.map((k) => k?.mode)).size !== 1) return null;
  const name = names.join(", ");
  const k = modes[0] as { mode: "major" | "minor" };
  if (k.mode === "minor" ? NO_MINOR.has(tonic) : NO_MAJOR.has(tonic)) return null;
  const code = s.code.replace(
    SCALE_ARG,
    (_a, _t, oct: string, md: string) => `.scale("${tonic}${oct}:${md}")`,
  );
  return { ...s, where: `${s.where} in ${tonic} ${name}`, code, key: { tonic, mode: k.mode } as KeySpec };
}

async function walk(list: readonly Shown[], form = true) {
  const problems: string[] = [];
  let regions = 0;
  let pages = 0;
  let skipped = 0;
  let arranged = 0;
  for (const s of list) {
    const m = await modelOf(s);
    if (!m) {
      skipped++;
      continue;
    }
    regions += m.harmony?.regions.length ?? 0;
    pages += m.staffSource ? staffPageCount(m.staffSource) : 0;
    if ((m.lines?.sections.length ?? 0) > 0) arranged++;
    problems.push(...staffProblems(s, m), ...spellingProblems(s, m), ...regionProblems(s, m));
    if (form) problems.push(...formProblems(s, m));
  }
  return { problems, regions, pages, skipped, arranged };
}

describe("U08–U11, A1 and the Wave 5 capstones on the Workbench: drawn as it sounds, read as theory reads it", () => {
  test("the course has its examples (sanity)", () => {
    expect(SHOWN.length).toBeGreaterThan(140);
    for (const u of ["U08", "U09", "U10", "U11", "A1", "U09.CP", "C3", "C4", "C5"])
      expect(
        SHOWN.some((s) => s.where.startsWith(u)),
        u,
      ).toBe(true);
    expect(SHOWN.some((s) => s.code.includes("arrange("))).toBe(true);
    expect(SHOWN.some((s) => /:minor"/.test(s.code))).toBe(true);
    expect(SHOWN.some((s) => /:blues"|minor pentatonic/.test(s.code))).toBe(true);
  });

  test("every example, reference, starter and capstone reference, in its own key", async () => {
    const r = await walk(SHOWN);
    expect(r.problems).toEqual([]);
    expect(r.skipped).toBeLessThan(SHOWN.length / 10);
    expect(r.arranged).toBeGreaterThan(10);
    expect(r.pages).toBeGreaterThan(200);
  }, 900_000);

  test("every one-key example moved to every key the units use (minor to seven flats and seven sharps)", async () => {
    const moved = SHOWN.flatMap((s) => TONICS.flatMap((t) => inKey(s, t) ?? []));
    expect(moved.length).toBeGreaterThan(300);
    expect(moved.some((s) => /in Eb (natural )?minor/.test(s.where))).toBe(true);
    expect(moved.some((s) => /in A# .*minor/.test(s.where))).toBe(true);
    const before = { ...COUNT };
    const r = await walk(moved, false);
    expect(r.problems).toEqual([]);
    expect(COUNT.spelled - before.spelled).toBeGreaterThan(5000);
    expect(COUNT.raised - before.raised).toBeGreaterThan(150);
  }, 1_800_000);
});

describe("hostile cases on the staff (review:surfaces)", () => {
  async function abcOf(code: string, bars: number) {
    const r = await evaluateForGrading(code, { mode: "lesson", bars, lint: null });
    const out = buildModel(code, r, {
      meter: "4/4",
      key: null,
      staff: "auto",
      annotations: { degree: true, solfege: true, noteName: true },
    });
    if (!out.ok) throw new Error(out.error.message);
    const page = staffPage(out.model.staffSource as NonNullable<WorkbenchModel["staffSource"]>, 0);
    return { abc: page.abc?.abc ?? "", model: out.model };
  }
  const music = (abc: string) => abc.split("\n").filter((l) => /oak-e\d/.test(l));
  const lyric = (abc: string, n: number) => abc.split("\n").filter((l) => l.startsWith("w:"))[n] ?? "";

  test("six flats minor with a raised seventh: K:Ebm, D♮ written, cancelled inside the bar, again next bar", async () => {
    const { abc } = await abcOf(
      'mel: n("<[4 5 6 7] [7 6 5 4]>").scale("Eb4:harmonic:minor").s("piano")\nbass: n("<0 4>").scale("Eb2:minor").s("ebass").lpf(700)',
      2,
    );
    expect(abc).toMatch(/^K:Ebm/m);
    const [mel] = music(abc);
    // B♭ C♭ D♮ E♭ | E♭ D♮ C♭ B♭: the natural is written in both bars (the signature's D♭ returns at the bar line).
    expect(mel?.match(/=d/g)?.length).toBe(2);
    expect(mel).not.toMatch(/\^c|_e(?!\d)/);
    expect(lyric(abc, 0)).toContain("7");
    expect(lyric(abc, 1)).toContain("ti");
  });

  test("G♯ minor's raised seventh is F𝄪, D♯ minor's is C𝄪 (never G or D)", async () => {
    for (const [tonic, dbl] of [
      ["G#", "^^F"],
      ["D#", "^^c"],
    ] as const) {
      const { abc } = await abcOf(`mel: n("4 5 6 7").scale("${tonic}4:harmonic:minor").s("piano")`, 1);
      expect(abc).toMatch(new RegExp(`^K:${tonic}m`, "m"));
      expect(abc.replace(/!class=oak-e\d+!/g, "").toLowerCase()).toContain(dbl.toLowerCase());
    }
  });

  test("a scale step the code flattens is written flat, the texts under it agree (U11.L03 `2b`)", async () => {
    const { abc } = await abcOf('mel: n("0 2b 2 4b 4 6b").scale("C4:major").s("piano")', 1);
    const mel = music(abc)[0] ?? "";
    expect(mel).toContain("_E");
    expect(mel).not.toContain("^D");
    expect(lyric(abc, 0)).toBe("w:1 ♭3 3 ♭5 5 ♭7");
    expect(lyric(abc, 2)).toBe("w:C4 E♭4 E4 G♭4 G4 B♭4");
  });

  test("a blues line by `.scale(… blues)` is spelled as a blues; the name under every head is the head's", async () => {
    // The grader's scaleCtx reads "A3 minor blues", not "A3:minor:blues": the blues context must still be found.
    const { abc, model } = await abcOf('mel: n("0 1 2 3 4 3 2 1").scale("A3:minor:blues").s("piano")', 1);
    const mel = music(abc)[0] ?? "";
    // The blue five climbs as D♯ and falls as E♭; the name line says the same.
    expect(mel).toMatch(/\^D2[^|]*E2[^|]*_E2/);
    expect(lyric(abc, 2)).toBe("w:A3 C4 D4 D♯4 E4 E♭4 D4 C4");
    expect(lyric(abc, 0)).toBe("w:1 ♭3 4 ♭5 5 ♭5 4 ♭3");
    expect(model.events.some((e) => e.label?.degree?.label === "♭5")).toBe(true);
  });

  test("an approach tone the staff leans into its target is named as drawn under the staff", async () => {
    // F♯ into G in C (a half step into the next note): the staff writes F♯, the texts say F♯ and ♯4.
    const { abc } = await abcOf('bass: note("<[c2 e2 f#2 g2] [g2 b1 c2 ~]>").s("ebass").lpf(700)', 2);
    const bass = music(abc).join(" ");
    expect(bass).toContain("^F");
    expect(lyric(abc, 2)).toContain("F♯2");
  });
});
