// Wave 5 answers (content-kit AnswerUi `form`, `bar-grid`, `scale-builder`; docs/design/wave5.md §11). Pure and
// synchronous, called from `gradeAnswer`. The form strip is graded by section type when the learner names the
// sections (`chorus2` is a chorus) and on its shape when it uses letters (letters by first appearance: AABA); the bar grid bar by bar by degree and quality,
// never by string; the scale builder as a set of degrees (or pitch classes against the tonic). Every miss names
// the actual fault: "Section 3 is a repeat of section 1, not a new section"; "Bar 5: IV7 (F7), not I7 (C7). In a
// 12-bar blues, bar 5 moves to IV"; "The blues scale also has ♭5 (se), the note G♭".
import type { Answer, AnswerUi, Degree, Diagnostic, KeySpec } from "@oak/content-kit";
import { formLetters } from "@oak/content-kit";
import type { ChordId } from "@oak/theory";
import {
  degreeOf,
  degreeSemitones,
  displayRN,
  parseChordWithBass,
  parseRN,
  pcOf,
  rnToChord,
  spellMidi,
  syllableOf,
  toLeadSheet,
  triadCore,
} from "@oak/theory";
import { mod12 } from "../analyze/events.ts";
import { diag } from "../feedback/catalog.ts";
import type { AnswerCheck } from "./answers.ts";
import { type FormMapAnswer, gradeFormMap } from "./standard-ladder.ts";

const shown = (d: string): string => d.replace(/^b/, "♭").replace(/^#/, "♯");
const result = (slots: number[], diagnostics: Diagnostic[], n = slots.length): AnswerCheck => {
  const score = n === 0 ? 1 : slots.reduce((a, b) => a + b, 0) / n;
  return { score, dims: { choice: { score, weight: 1, n } }, diagnostics, slots };
};

// --- form ---------------------------------------------------------------------------------------------------

const LETTER = /^[A-Z]$/;
/** `Chorus2` → `chorus`: the section type a name stands for. */
const sectionType = (name: string): string => name.trim().toLowerCase().replace(/\d+$/, "");

/** "the verse again", "a repeat of section 1", "a new section": what a slot of a form is, in the learner's words. */
function sectionWords(seq: readonly string[], i: number, letters: string): string {
  const x = letters[i] as string;
  const first = letters.indexOf(x);
  const name = (seq[i] ?? "").trim();
  const named = name && !LETTER.test(name) ? `the ${sectionType(name)}` : null;
  if (first === i) return named ? `${named} (a new section)` : "a new section";
  return named ? `${named} again (a repeat of section ${first + 1})` : `a repeat of section ${first + 1}`;
}

/**
 * The `form` answer (U09.L01, L03; `fam.frm.sections`): one label per section. With `vocabulary: "letters"` (or
 * a letter key) it is graded on the shape: a slot is right when its letter by first appearance matches. With
 * named sections a slot is right when it names the same section type; a miss says what that section is ("a repeat of section 1")
 * and what the answer made it.
 */
export function formCheck(ui: Extract<AnswerUi, { ui: "form" }>, correct: Answer, got: Answer): AnswerCheck {
  if (ui.input === "map") return formMapCheck(ui, correct, got);
  const expected = correct.sections ?? [];
  const answer = got.sections ?? [];
  const eL = formLetters(expected);
  const gL = formLetters(answer.filter((x) => x.trim() !== ""));
  // Named vocabulary (verse, chorus …): the learner names each section, so a slot is right when it names the
  // same section type (`chorus2` is a chorus), like the `form` rule with names (contracts §6.3 item 4). Shape
  // alone would pass any order of distinct cards and "chorus verse chorus verse" for a verse-first song.
  const named =
    ui.vocabulary !== "letters" && expected.length > 0 && expected.every((x) => !LETTER.test(x.trim()));
  const sameSlot = (i: number): boolean =>
    named
      ? sectionType(answer[i] ?? "") === sectionType(expected[i] ?? "")
      : eL[i] !== undefined && eL[i] === gL[i];
  const n = Math.max(expected.length, ui.sections);
  const slots: number[] = [];
  const diagnostics: Diagnostic[] = [];
  for (let i = 0; i < n; i++) {
    const g = answer[i];
    if (g === undefined || g.trim() === "") {
      slots.push(0);
      continue;
    }
    if (i < expected.length && sameSlot(i)) {
      slots.push(1);
      continue;
    }
    slots.push(0);
    if (eL[i] !== undefined)
      diagnostics.push(
        diag(
          "form.section",
          { exp: sectionWords(expected, i, eL), got: sectionWords(answer, i, gL) },
          { slot: i + 1 },
          "order",
        ),
      );
  }
  const missing = slots.filter(
    (x, i) => x === 0 && (answer[i] === undefined || answer[i]?.trim() === ""),
  ).length;
  if (missing > 0) diagnostics.push(diag("id.missing", { n: missing }, undefined, "choice"));
  if (answer.length > n)
    diagnostics.push(diag("id.wrong", { exp: `${n} sections`, got: `${answer.length}` }));
  return result(slots, diagnostics, n);
}

/**
 * Wave 6 (`form.map`; CF-T.S1, ladder L8): the form map of a whole tune. The learner cuts the bar strip into
 * sections and labels each; a section counts when it starts on the right bar and has the right label by shape
 * (`gradeFormMap`: A A B A, verse verse bridge verse and X X Y X are one answer). A missing boundary, a boundary
 * where the tune has none and a wrong label are each named with their bar.
 */
export function formMapCheck(
  ui: Extract<AnswerUi, { ui: "form" }>,
  correct: Answer,
  got: Answer,
): AnswerCheck {
  const labels = correct.sections ?? [];
  const starts = correct.bars ?? [];
  const total = ui.bars ?? Math.max(...starts, 1);
  const song = {
    answerKey: {
      bars: total,
      code: "",
      layers: {},
      sections: labels.map((label, i) => ({
        label,
        bars: [starts[i] ?? 1, (starts[i + 1] ?? total + 1) - 1] as [number, number],
      })),
    },
  };
  const answer: FormMapAnswer = { sections: got.sections ?? [], bars: got.bars ?? [] };
  if (labels.length === 0 || answer.sections.length === 0 || answer.bars.length === 0)
    return result(
      labels.map(() => 0),
      [diag("id.missing", { n: Math.max(1, labels.length) }, undefined, "choice")],
      Math.max(1, labels.length),
    );
  const r = gradeFormMap(answer, song);
  const diagnostics: Diagnostic[] = [];
  for (const row of r.sections) {
    if (!row.startOk) {
      // Never the answer (content/specs/CF.md): the learner's own section that holds the missed boundary, to
      // listen through again. `bar` stays in the params for a host that marks the strip after a reveal.
      const cuts = [...new Set(answer.bars)].filter((b) => b <= row.expected.bar).sort((a, b) => a - b);
      const from = cuts.at(-1) ?? 1;
      const next = [...answer.bars].filter((b) => b > from).sort((a, b) => a - b)[0];
      const to = (next ?? total + 1) - 1;
      diagnostics.push(
        diag("form.map-start", { bar: row.expected.bar, from, to }, { slot: row.index + 1 }, "order"),
      );
    } else if (!row.labelOk) {
      const at = answer.bars.indexOf(row.expected.bar);
      diagnostics.push(
        diag(
          "form.section",
          {
            exp: sectionWords(labels, row.index, r.expected),
            got: sectionWords([...answer.sections], at, r.got),
          },
          { slot: row.index + 1 },
          "order",
        ),
      );
    }
  }
  for (const bar of r.extra) diagnostics.push(diag("form.map-extra", { bar }, undefined, "order"));
  const slots = r.sections.map((x) => (x.ok ? 1 : 0));
  return {
    score: r.score,
    dims: { choice: { score: r.score, weight: 1, n: slots.length } },
    diagnostics,
    slots,
  };
}

// --- the bar grid -----------------------------------------------------------------------------------------

/** Why a 12-bar bar is what it is (U11.L05–L06): said under a miss in a 12- or 24-bar blues chart. */
const BLUES_WHY: Readonly<Record<number, string>> = {
  2: "Bar 2 stays on I, or moves to IV in the quick change.",
  5: "In a 12-bar blues, bar 5 moves to IV.",
  7: "Bar 7 comes home to I.",
  9: "Bar 9 is the high point: V.",
  10: "Bar 10 steps down to IV.",
  11: "Bar 11 is home again: I.",
  12: "Bar 12 is I, or V as the turnaround.",
};
interface GridChord {
  chord: ChordId;
  text: string;
}

/**
 * The `bar-grid` answer (U11.L05–L06, U11.CP, `fam.frm.blues`, X2's changes): one numeral (`entry: "rn"`) or chord
 * symbol (`"symbol"`) per bar, graded bar by bar on root (against the key) and quality. Given bars (`given`) are
 * printed already filled and not scored. `qualities` decides the depth: a grid that offers `7` reads the seventh
 * (I7 is not I), one that offers only triads reads the triad core.
 */
export function barGridCheck(
  ui: Extract<AnswerUi, { ui: "bar-grid" }>,
  correct: Answer,
  got: Answer,
  key: KeySpec | null,
): AnswerCheck {
  const rn = ui.entry === "rn";
  const expected = (rn ? correct.rn : correct.text) ?? [];
  const answer = (rn ? got.rn : got.text) ?? [];
  const sevenths = ui.qualities.some((q) => !["maj", "min", "dim", "aug"].includes(q));
  const blues = (ui.bars === 12 || ui.bars === 24) && expected.every((x) => /7$/.test(x.trim()));
  const read = (s: string | undefined): GridChord | null => {
    if (!s?.trim()) return null;
    if (rn) {
      if (!key) return null;
      const p = parseRN(s.trim(), key);
      if (!p) return null;
      const c = rnToChord(p, key);
      return {
        chord: c,
        text: `${displayRN({ ...p, inversion: 0 })} (${toLeadSheet({ ...c, bassPc: c.rootPc })})`,
      };
    }
    const c = parseChordWithBass(s.trim());
    return c ? { chord: c, text: toLeadSheet({ ...c, bassPc: c.rootPc }) } : null;
  };
  const same = (a: ChordId, b: ChordId): boolean =>
    sevenths
      ? a.rootPc === b.rootPc && a.quality === b.quality
      : triadCore(a).rootPc === triadCore(b).rootPc && triadCore(a).quality === triadCore(b).quality;
  const given = new Set(ui.given ?? []);
  const slots: number[] = [];
  const diagnostics: Diagnostic[] = [];
  let scored = 0;
  let missing = 0;
  for (let i = 0; i < ui.bars; i++) {
    const bar = i + 1;
    if (given.has(bar)) continue;
    scored++;
    const e = read(expected[i]);
    const g = read(answer[i]);
    if (!answer[i]?.trim()) {
      slots.push(0);
      missing++;
      continue;
    }
    if (!e) {
      slots.push(0);
      continue;
    }
    if (g && same(e.chord, g.chord)) {
      slots.push(1);
      continue;
    }
    slots.push(0);
    let why: string;
    if (!g) why = `"${answer[i]}" is not a ${rn ? "numeral" : "chord symbol"} Oak can read.`;
    else if (e.chord.rootPc !== g.chord.rootPc)
      why =
        blues && BLUES_WHY[((bar - 1) % 12) + 1]
          ? (BLUES_WHY[((bar - 1) % 12) + 1] as string)
          : `The chord changes to ${rn ? "another degree" : "another root"} here.`;
    else
      why = `Right root, but this bar is ${QUALITY_PHRASE[e.chord.quality] ?? e.chord.quality}${
        blues ? ": every chord of this blues is a dominant seventh" : ""
      }.`;
    diagnostics.push(
      diag("harmony.bar", { exp: e.text, got: g?.text ?? `"${answer[i]}"`, why }, { bar }, "rn"),
    );
  }
  if (missing > 0) diagnostics.push(diag("id.missing", { n: missing }, undefined, "choice"));
  return result(slots, diagnostics, scored);
}
const QUALITY_PHRASE: Readonly<Record<string, string>> = {
  maj: "a major triad",
  min: "a minor triad",
  dim: "a diminished triad",
  aug: "an augmented triad",
  "7": "a dominant seventh",
  maj7: "a major seventh",
  m7: "a minor seventh",
  m7b5: "half-diminished",
  o7: "a diminished seventh",
};

// --- the scale builder ----------------------------------------------------------------------------------------

/** What scale a set of degrees is, for the message ("The blues scale"); else "This scale". */
function scaleName(degrees: readonly string[]): string {
  const k = [...degrees].sort().join(" ");
  const NAMES: Record<string, string> = {
    [["1", "2", "3", "5", "6"].sort().join(" ")]: "The major pentatonic",
    [["1", "b3", "4", "5", "b7"].sort().join(" ")]: "The minor pentatonic",
    [["1", "b3", "4", "b5", "5", "b7"].sort().join(" ")]: "The blues scale",
    [["1", "2", "b3", "4", "5", "b6", "b7"].sort().join(" ")]: "Natural minor",
    [["1", "2", "b3", "4", "5", "b6", "7"].sort().join(" ")]: "Harmonic minor",
    [["1", "2", "b3", "4", "5", "6", "7"].sort().join(" ")]: "Melodic minor",
    [["1", "2", "3", "4", "5", "6", "7"].sort().join(" ")]: "The major scale",
    // Wave 6 (U14): the four colour modes.
    [["1", "2", "3", "4", "5", "6", "b7"].sort().join(" ")]: "Mixolydian",
    [["1", "2", "b3", "4", "5", "6", "b7"].sort().join(" ")]: "Dorian",
    [["1", "2", "3", "#4", "5", "6", "7"].sort().join(" ")]: "Lydian",
    [["1", "b2", "b3", "4", "5", "b6", "b7"].sort().join(" ")]: "Phrygian",
  };
  return NAMES[k] ?? "This scale";
}
/** The degree number of a degree label: "b7" → 7, "#4" → 4. */
const degreeNumber = (d: string): number => Number(d.replace(/^[b#]+/, ""));

/**
 * The `scale-builder` answer (U10–U11; `fam.key.scale-spell`): the scale as a set, degrees ticked on a pad
 * (`answer.degrees`) or notes picked on a keyboard (`answer.midi`, read as pitch classes against `tonic`, so any
 * octave counts). Score: the set overlap (2·hits / (expected + answered)). Each degree left out or added is named
 * with its syllable and note.
 */
export function scaleBuilderCheck(
  ui: Extract<AnswerUi, { ui: "scale-builder" }>,
  correct: Answer,
  got: Answer,
): AnswerCheck {
  const want = [...new Set(correct.degrees ?? [])] as Degree[];
  const tonicPc = pcOf(ui.tonic);
  const semis = new Map(want.map((d) => [mod12(degreeSemitones(d)), d] as const));
  const major: KeySpec = { tonic: ui.tonic, mode: "major" };
  const asDegree = (s: number): string => semis.get(s) ?? degreeOf(60 + tonicPc + s, major).degree;
  const answered: number[] =
    ui.input === "keyboard" || (got.midi && !got.degrees)
      ? [...new Set((got.midi ?? []).map((m) => mod12(m - tonicPc)))]
      : [...new Set((got.degrees ?? []).map((d) => mod12(degreeSemitones(d))))];
  const wantSemis = [...semis.keys()];
  const hits = answered.filter((s) => semis.has(s));
  const missing = wantSemis.filter((s) => !answered.includes(s));
  const extra = answered.filter((s) => !semis.has(s));
  const name = scaleName(want);
  const note = (s: number): string => {
    const midi = 60 + tonicPc + s;
    const byDegree = spellMidi(midi, { key: major, direction: asDegree(s).startsWith("b") ? -1 : 1 }).name;
    const plain = /(##|bb|x)-?\d+$/.test(byDegree) ? spellMidi(midi, { key: major }).name : byDegree;
    return plain
      .replace(/-?\d+$/, "")
      .replace(/^([A-G])#/, "$1♯")
      .replace(/^([A-G])b/, "$1♭");
  };
  // Another scale altogether, one note off per changed degree (U14: the major scale ticked for Mixolydian): one
  // sentence that names the scale it is and what the asked one has in its place, instead of a pair per note.
  const answeredDegrees = answered.map((x) => degreeOf(60 + tonicPc + x, major).degree);
  const gotName = scaleName(answeredDegrees);
  // Only where a mode is asked for (or the builder opens on a scale to change): U10's three minors keep their
  // note-by-note findings.
  const modal = ui.from !== undefined || ["Mixolydian", "Dorian", "Lydian", "Phrygian"].includes(name);
  const swaps =
    modal &&
    missing.length > 0 &&
    missing.length === extra.length &&
    gotName !== "This scale" &&
    name !== "This scale"
      ? missing.map((m) => {
          const e = extra.find((x) => degreeNumber(asDegree(x)) === degreeNumber(asDegree(m)));
          return e === undefined
            ? null
            : `${shown(asDegree(m))} (${note(m)}) in place of ${shown(asDegree(e))} (${note(e)})`;
        })
      : [];
  if (swaps.length > 0 && swaps.every((x) => x !== null)) {
    const total = wantSemis.length + answered.length;
    const score = total === 0 ? 1 : (2 * hits.length) / total;
    const lower = (x: string): string => (x.startsWith("The ") ? `t${x.slice(1)}` : x);
    return {
      score,
      dims: { choice: { score, weight: 1, n: wantSemis.length } },
      diagnostics: [
        diag(
          "id.scale-other",
          { got: lower(gotName), scale: name.replace(/^The /, "the "), swaps: swaps.join(" and ") },
          undefined,
          "choice",
        ),
        // The note-by-note findings stay behind it as notes (a lesson may word them itself).
        ...perNote().map((d): Diagnostic => ({ ...d, severity: "info" })),
      ],
      slots: wantSemis.map((x) => (answered.includes(x) ? 1 : 0)),
    };
  }
  const diagnostics: Diagnostic[] = perNote();
  function perNote(): Diagnostic[] {
    return [
      ...missing.map((s) =>
        diag(
          "id.scale-missing",
          { scale: name, deg: shown(asDegree(s)), syl: syllableOf(asDegree(s) as Degree), note: note(s) },
          undefined,
          "choice",
        ),
      ),
      ...extra.map((s) =>
        diag(
          "id.scale-extra",
          {
            scale: `${name.charAt(0).toLowerCase()}${name.slice(1)}`,
            deg: shown(asDegree(s)),
            note: note(s),
          },
          undefined,
          "choice",
        ),
      ),
    ];
  }
  const total = wantSemis.length + answered.length;
  const score = total === 0 ? 1 : (2 * hits.length) / total;
  return {
    score,
    dims: { choice: { score, weight: 1, n: wantSemis.length } },
    diagnostics,
    slots: wantSemis.map((s) => (answered.includes(s) ? 1 : 0)),
  };
}

/** The Wave 5 answer UIs `gradeAnswer` hands over, or `null` for every other UI. */
export function wave5Answer(
  ui: AnswerUi,
  correct: Answer,
  got: Answer,
  key: KeySpec | null,
): AnswerCheck | null {
  if (ui.ui === "form") return formCheck(ui, correct, got);
  if (ui.ui === "bar-grid") return barGridCheck(ui, correct, got, key);
  if (ui.ui === "scale-builder") return scaleBuilderCheck(ui, correct, got);
  return null;
}
