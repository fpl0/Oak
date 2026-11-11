// The answer gallery's examples: one or two per kind, each with the expected answer and a partly wrong sample, so
// every state (idle, pending, correct, wrong, revealed) can be drawn from real data. Musical claims are checked
// in `fixtures.test.ts` with headless Strudel and @oak/theory.
import { type AnswerEnv, NEUTRAL_PROFILE } from "../env.tsx";
import { readsAs, type TextKind } from "../normalize.ts";
import { emptyValue } from "../response.ts";
import { centsText } from "../sing.ts";
import { tapReport, targetSeconds } from "../tap.ts";
import type {
  AnswerFeedback,
  AnswerKind,
  AnswerSpec,
  AnswerSpecOf,
  AnswerValue,
  PartMark,
  SungSummary,
} from "../types.ts";

export interface Fixture<K extends AnswerKind = AnswerKind> {
  id: string;
  kind: K;
  title: string;
  /** The question, as a host would show it above the widget. */
  prompt: string;
  spec: AnswerSpecOf<K>;
  expected: AnswerValue<K>;
  /** A filled answer with at least one wrong part (the pending and wrong states). */
  sample: AnswerValue<K>;
  /** The host's message on the wrong state. */
  wrongMessage?: string;
  env?: AnswerEnv;
}

const fx = <K extends AnswerKind>(f: Fixture<K>): Fixture => f as unknown as Fixture;

/** One bar of quarters plus the "and" of 3 at 90 BPM: the tap gallery's rhythm, in bars from bar 1. */
export const TAP_RHYTHM = [0, 0.25, 0.5, 0.625, 0.75] as const;
export const TAP_BPM = 90;

export const CLICK_CODE = 'setcpm(90/4)\n\nkick: s("bd ~ bd ~")\nsnare: s("~ sd ~ sd")';
/** The first `sd` atom of CLICK_CODE (the snare on beat 2). */
export const CLICK_CODE_SNARE = { from: CLICK_CODE.indexOf("sd"), to: CLICK_CODE.indexOf("sd") + 2 };
export const MELODY_CODE = 'setcpm(90/4)\n\nmel: n("0 2 4 2").scale("C4:major").s("piano")';

export const FIXTURES: Fixture[] = [
  fx({
    id: "choice",
    kind: "choice",
    title: "Single choice",
    prompt: "In C major, which chord is IV?",
    spec: {
      ui: "choice",
      options: [
        { id: "C", label: "C" },
        { id: "F", label: "F" },
        { id: "G", label: "G" },
        { id: "Am", label: "Am" },
      ],
    },
    expected: ["F"],
    sample: ["G"],
    wrongMessage: "G is V. Count four letters up from C: C D E F.",
  }),
  fx({
    id: "choice-multi",
    kind: "choice",
    title: "Multiple choice, audio cards",
    prompt: "Pick every loop with a backbeat: the snare on 2 and 4.",
    spec: {
      ui: "choice",
      multi: true,
      layout: "audio-cards",
      options: [
        {
          id: "a",
          label: "`kick` + `snare`",
          audio: 'setcpm(90/4)\n\nkick: s("bd ~ bd ~")\nsnare: s("~ sd ~ sd")',
        },
        { id: "b", label: "Kick on every beat", audio: 'setcpm(90/4)\n\nkick: s("bd*4")' },
        {
          id: "c",
          label: "Snare and **hats**",
          audio: 'setcpm(90/4)\n\nsnare: s("~ sd ~ sd")\nhats: s("hh*8")',
        },
      ],
    },
    expected: ["a", "c"],
    sample: ["a", "b"],
  }),
  fx({
    id: "degree-pad",
    kind: "degree-pad",
    title: "Degree pad",
    prompt: "Which degree was the last note?",
    spec: { ui: "degree-pad", set: ["1", "2", "3", "4", "5", "6", "7"], syllables: false },
    expected: ["5"],
    sample: ["4"],
  }),
  fx({
    id: "degree-seq",
    kind: "degree-pad",
    title: "Degree slots, with syllables",
    prompt: "Mary Had a Little Lamb starts on 3. Enter its first four degrees.",
    spec: { ui: "degree-pad", set: ["1", "2", "3", "4", "5"], sequenceLen: 4, syllables: true },
    expected: ["3", "2", "1", "2"],
    sample: ["3", "2", "2", "2"],
  }),
  fx({
    id: "degree-minor",
    kind: "degree-pad",
    title: "Minor pad",
    prompt: "In A minor, which degree is C?",
    spec: { ui: "degree-pad", set: ["1", "2", "b3", "4", "5", "b6", "b7"], syllables: false },
    expected: ["b3"],
    sample: ["b6"],
  }),
  fx({
    id: "quality-pad",
    kind: "quality-pad",
    title: "Chord quality",
    prompt: "What quality is the chord A C E?",
    spec: { ui: "quality-pad", set: ["maj", "min", "dim", "aug"] },
    expected: ["min"],
    sample: ["maj"],
  }),
  fx({
    id: "rn-palette",
    kind: "rn-palette",
    title: "Roman numerals",
    prompt: "Name the four chords: C G Am F.",
    spec: { ui: "rn-palette", slots: 4, allow: ["triads", "sevenths", "inversions", "borrowed"] },
    expected: ["I", "V", "vi", "IV"],
    sample: ["I", "V", "IV", "IV"],
  }),
  fx({
    id: "text-note",
    kind: "text",
    title: "Text: a note name",
    prompt: "Which note is a whole step below F?",
    spec: { ui: "text", normalize: "note" },
    expected: "Eb",
    sample: "E",
    wrongMessage: "E is a half step below F. A whole step is two half steps.",
  }),
  fx({
    id: "text-interval",
    kind: "text",
    title: "Text: an interval",
    prompt: "C up to G is a…",
    spec: { ui: "text", normalize: "interval" },
    expected: "P5",
    sample: "P4",
  }),
  fx({
    id: "number",
    kind: "number",
    title: "Number",
    prompt: "How many eighth notes fit in one bar of 3/4?",
    spec: { ui: "number" },
    expected: 6,
    sample: 3,
  }),
  fx({
    id: "keyboard",
    kind: "keyboard",
    title: "Keyboard: one key",
    prompt: "Click middle C.",
    spec: { ui: "keyboard", range: ["C3", "B4"], mode: "single" },
    expected: [60],
    sample: [48],
    wrongMessage: "That C is an octave lower: C3. Middle C is C4.",
  }),
  fx({
    id: "keyboard-chord",
    kind: "keyboard",
    title: "Keyboard: a chord",
    prompt: "Build an F major triad from F4.",
    spec: { ui: "keyboard", range: ["C4", "C6"], mode: "chord" },
    expected: [65, 69, 72],
    sample: [65, 68, 72],
  }),
  fx({
    id: "grid",
    kind: "grid",
    title: "Rhythm grid, one row",
    prompt: "Enter the tresillo: 3 + 3 + 2 eighths.",
    spec: { ui: "grid", rows: ["hit"], stepsPerBar: 8, bars: 1 },
    expected: [[true, false, false, true, false, false, true, false]],
    sample: [[true, false, true, false, false, false, true, false]],
  }),
  fx({
    id: "grid-drums",
    kind: "grid",
    title: "Rhythm grid, drums",
    prompt: "Kick on 1 and 3, snare on 2 and 4, hats on every eighth.",
    spec: { ui: "grid", rows: ["kick", "snare", "hatClosed"], stepsPerBar: 8, bars: 1 },
    expected: [
      [true, false, false, false, true, false, false, false],
      [false, false, true, false, false, false, true, false],
      [true, true, true, true, true, true, true, true],
    ],
    sample: [
      [true, false, false, false, true, false, false, false],
      [false, false, false, true, false, false, true, false],
      [true, true, true, true, true, true, true, true],
    ],
  }),
  fx({
    id: "tap",
    kind: "tap",
    title: "Tap capture",
    prompt: "Tap the rhythm: 1, 2, 3 and, 4.",
    spec: { ui: "tap" },
    expected: TAP_RHYTHM.map((b) => 100 + (b * 4 * 60) / TAP_BPM),
    // Four of the five onsets, each a little off; the "and" of 3 is missing.
    sample: [
      [0, 0.012],
      [0.25, -0.02],
      [0.5, 0.03],
      [0.75, 0.01],
    ].map(([b = 0, off = 0]) => 100 + (b * 4 * 60) / TAP_BPM + off),
    env: { tap: { bars: 1, bpm: TAP_BPM, stepsPerBeat: 2, targets: [...TAP_RHYTHM], startAt: 100 } },
  }),
  fx({
    id: "mic",
    kind: "mic",
    title: "Sing capture",
    prompt: "Sing an A. Any octave is fine.",
    spec: { ui: "mic" },
    expected: [{ midi: 57.02, cents: 2.1, credit: 1 }],
    sample: [{ midi: 58.01, cents: 100.6, credit: 0.5 }],
    env: { sing: { notes: [{ midi: 69, at: 0, dur: 1.6, label: "A" }], mode: "pitch", leadIn: 0.8 } },
  }),
  fx({
    id: "hum",
    kind: "hum",
    title: "Hum to predict",
    prompt: "Before you run it: hum what this will play.",
    spec: { ui: "hum", bars: 2 },
    expected: [{ midi: null, cents: null, credit: 1 }],
    sample: [{ midi: null, cents: null, credit: 1 }],
    env: { hum: { seconds: 3 } },
  }),
  fx({
    id: "bar-buttons",
    kind: "bar-buttons",
    title: "Bar buttons",
    prompt: "Which bar has the wrong note?",
    spec: { ui: "bar-buttons", bars: 4 },
    expected: [3],
    sample: [2],
  }),
  fx({
    id: "click-code",
    kind: "click-code",
    title: "Click the code",
    prompt: "Click the snare that lands on beat 2.",
    spec: { ui: "click-code", target: { drum: "snare", nth: 1 } },
    expected: CLICK_CODE_SNARE,
    sample: { from: CLICK_CODE.indexOf("bd"), to: CLICK_CODE.indexOf("bd") + 2 },
    env: { code: CLICK_CODE },
  }),
  fx({
    id: "click-staff",
    kind: "click-staff",
    title: "Staff pick",
    prompt: "Click the note on degree 3.",
    spec: { ui: "click-staff", target: { degree: "3" } },
    expected: "oak-e1",
    sample: "oak-e2",
  }),
  fx({
    id: "click-roll",
    kind: "click-roll",
    title: "Roll pick",
    prompt: "Click the highest note.",
    spec: { ui: "click-roll", target: { nth: 3 } },
    // Event IDs come from the analysed model; the gallery fills these in at runtime.
    expected: null,
    sample: null,
  }),
  fx({
    id: "order",
    kind: "order",
    title: "Ordering",
    prompt: "Put the chords in the order you heard: I, V, vi, IV in C.",
    spec: {
      ui: "order",
      assemble: "chord-seq",
      blocks: [
        { id: "c", text: "C", audition: 'chords: note("[c3,e3,g3]").s("piano")' },
        { id: "g", text: "G", audition: 'chords: note("[g2,b2,d3]").s("piano")' },
        { id: "am", text: "Am", audition: 'chords: note("[a2,c3,e3]").s("piano")' },
        { id: "f", text: "F", audition: 'chords: note("[f2,a2,c3]").s("piano")' },
      ],
      distractors: [{ id: "dm", text: "Dm", audition: 'chords: note("[d3,f3,a3]").s("piano")' }],
    },
    expected: ["c", "g", "am", "f"],
    sample: ["c", "am", "g", "f"],
  }),
  fx({
    id: "order-lines",
    kind: "order",
    title: "Parsons lines",
    prompt: "Assemble a loop: the tempo first, then kick, snare and hats.",
    spec: {
      ui: "order",
      assemble: "lines",
      blocks: [
        { id: "tempo", text: "setcpm(90/4)" },
        { id: "kick", text: 'kick: s("bd ~ bd ~")' },
        { id: "snare", text: 'snare: s("~ sd ~ sd")' },
        { id: "hats", text: 'hats: s("hh*8").gain(.6)' },
      ],
      distractors: [{ id: "solo", text: 'Snare: s("~ sd ~ sd")' }],
    },
    expected: ["tempo", "kick", "snare", "hats"],
    sample: ["kick", "tempo", "snare", "hats"],
  }),
  fx({
    id: "blanks",
    kind: "blanks",
    title: "Code with blanks",
    prompt: "Fill in the C major arpeggio, 1 3 5 8, on the piano.",
    spec: {
      ui: "blanks",
      starter: 'setcpm(90/4)\n\nmel: n("⟦steps⟧").scale("C4:major").s("⟦sound⟧")',
      blanks: [
        { id: "steps", input: "text", maxLen: 16 },
        { id: "sound", input: "select", options: ["piano", "sawtooth", "triangle"] },
      ],
    },
    expected: { steps: "0 2 4 7", sound: "piano" },
    sample: { steps: "1 3 5 8", sound: "piano" },
    wrongMessage: "Steps count from 0: degree 1 is step 0.",
  }),
  fx({
    id: "code",
    kind: "code",
    title: "Code field",
    prompt: "Move the snare to beats 2 and 4.",
    spec: { ui: "code", starter: 'setcpm(90/4)\n\nkick: s("bd ~ bd ~")\nsnare: s("sd ~ sd ~")' },
    expected: 'setcpm(90/4)\n\nkick: s("bd ~ bd ~")\nsnare: s("~ sd ~ sd")',
    sample: 'setcpm(90/4)\n\nkick: s("bd ~ bd ~")\nsnare: s("sd ~ sd ~")',
  }),
  fx({
    id: "same-different",
    kind: "same-different",
    title: "A/B same or different",
    prompt: "Do A and B play the same melody?",
    spec: {
      ui: "same-different",
      a: 'setcpm(90/4)\n\nmel: n("0 2 4").scale("C4:major").s("piano")',
      b: 'setcpm(90/4)\n\nmel: n("0 2 5").scale("C4:major").s("piano")',
    },
    expected: ["different"],
    sample: ["same"],
  }),
  fx({
    id: "slider-tempo",
    kind: "slider",
    title: "Slider: tempo",
    prompt: "Estimate the tempo.",
    spec: { ui: "slider", min: 60, max: 180, step: 1, unit: "BPM" },
    expected: 96,
    sample: 120,
  }),
  fx({
    id: "slider-swing",
    kind: "slider",
    title: "Slider: swing amount",
    prompt: "How much swing? Straight is 0, triplet swing is 1/3.",
    spec: {
      ui: "slider",
      min: 0,
      max: 0.5,
      step: 0.01,
      format: "swing",
      marks: [
        { at: 0, label: "" },
        { at: 1 / 3, label: "triplet" },
      ],
    },
    expected: 1 / 3,
    sample: 0.15,
  }),
  fx({
    id: "staff-input",
    kind: "staff-input",
    title: "Staff input (Wave 3)",
    prompt: "Write the melody on the staff.",
    spec: {
      ui: "staff-input",
      clef: "treble",
      bars: 1,
      palette: { durations: ["q"], accidentals: false, ties: false, rests: true },
    },
    expected: "",
    sample: "",
  }),
];

// --- the gallery's stand-in host: shows what a host does with a GradeResult ------------------------

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Per-part marks of `value` against `expected`, as a host would derive them from its GradeResult. */
export function demoMarks(spec: AnswerSpec, value: AnswerValue, expected: AnswerValue): PartMark[] {
  switch (spec.ui) {
    case "choice":
    case "same-different":
      return (value as string[]).map((id) => ({ part: id, ok: (expected as string[]).includes(id) }));
    case "degree-pad":
    case "quality-pad":
    case "rn-palette":
    case "keyboard":
    case "order":
      return (value as unknown[]).map((v, i) => ({
        part: i,
        ok:
          spec.ui === "keyboard" && spec.mode === "chord"
            ? (expected as number[]).includes(v as number)
            : same(v, (expected as unknown[])[i]),
      }));
    case "grid": {
      const rows = spec.rows;
      const one = rows.length === 1;
      const out: PartMark[] = [];
      const v = value as boolean[][];
      const e = expected as boolean[][];
      for (const [r, row] of v.entries())
        for (const [c, on] of row.entries()) {
          const want = e[r]?.[c] === true;
          if (on || want) out.push({ part: one ? String(c) : `${rows[r]}:${c}`, ok: on === want });
        }
      return out;
    }
    case "text": {
      const read = (t: string) => {
        const r = readsAs(spec.normalize as TextKind, t);
        return r.state === "ok" ? r.canonical : t.trim();
      };
      return [{ part: 0, ok: read(value as string) === read(expected as string) }];
    }
    case "mic":
      return (value as SungSummary[]).map((n, i) => ({
        part: i,
        ok: n.credit >= 1,
        note: n.cents === null ? "not heard" : centsText(n.cents),
      }));
    case "blanks":
      return Object.entries(value as Record<string, string>).map(([id, text]) => ({
        part: id,
        ok: text.trim() === (expected as Record<string, string>)[id],
      }));
    case "slider":
      return [
        {
          part: 0,
          ok: Math.abs((value as number) - (expected as number)) <= 0.05 * Math.abs(spec.max - spec.min),
          note: (value as number) > (expected as number) ? "a little fast" : "a little slow",
        },
      ];
    default:
      return [{ part: 0, ok: same(value, expected) }];
  }
}

export function demoCheck(f: Fixture, value: AnswerValue): AnswerFeedback {
  if (f.spec.ui === "tap") {
    const tap = f.env?.tap;
    const targets = targetSeconds(tap?.targets ?? [], tap?.startAt ?? 0, tap ? tap.bpm / 60 / 4 : 0.5);
    return tapReport(value as number[], targets, NEUTRAL_PROFILE).feedback;
  }
  const marks = demoMarks(f.spec, value, f.expected);
  const ok =
    f.spec.ui === "text"
      ? marks.every((m) => m.ok)
      : marks.length > 0 &&
        marks.every((m) => m.ok) &&
        (f.spec.ui !== "choice" || (value as string[]).length === (f.expected as string[]).length);
  if (ok) return { state: "correct", marks };
  return { state: "wrong", marks, ...(f.wrongMessage ? { message: f.wrongMessage } : {}) };
}

export const STATES = ["idle", "pending", "correct", "wrong", "revealed"] as const;
export type GalleryState = (typeof STATES)[number];

/** The value and feedback of a fixture in one of the five states. */
export function stateOf(f: Fixture, s: GalleryState): { value: AnswerValue; feedback: AnswerFeedback } {
  switch (s) {
    case "idle":
      return { value: emptyValue(f.spec), feedback: { state: "idle" } };
    case "pending":
      return { value: f.sample, feedback: { state: "pending" } };
    case "correct": {
      const fb = demoCheck(f, f.expected);
      return {
        value: f.expected,
        feedback: { state: "correct", ...(fb.state === "correct" ? { marks: fb.marks ?? [] } : {}) },
      };
    }
    case "wrong": {
      const fb = demoCheck(f, f.sample);
      return { value: f.sample, feedback: fb.state === "wrong" ? fb : { state: "wrong", marks: [] } };
    }
    case "revealed": {
      const fb = demoCheck(f, f.sample);
      const marks = fb.state === "wrong" || fb.state === "correct" ? (fb.marks ?? []) : [];
      return { value: f.sample, feedback: { state: "revealed", correct: f.expected, marks } };
    }
  }
}
