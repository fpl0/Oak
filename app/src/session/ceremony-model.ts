// The unlock ceremony in the Coda (ux §5.1, contracts §9.3): the tool appears, a few seconds of it working, then
// "Try it" and "About it". At most 8 seconds, skippable, replayable from the Toolbox. Pure: what each tool shows
// while its demo plays (a "showcase") and the timeline that keeps the whole moment inside the budget. The page
// part is coda/CodaUnlock.tsx.
//
// A feature tool shows the feature itself, drawn from its own demo: degree labels appear under the notes of a
// small roll as they sound, syllables join them for solfège, the key-signature panel names the signature in its
// written order, the circle of fifths lights the keys the demo walks through. Any other tool shows its demo code
// with the tool's own tokens marked. The notes below are the demos' notes; `ceremony-model.test.ts` checks them
// against the content's demo code in headless Strudel, so a changed demo fails the test instead of the picture.
import type { KeySpec } from "@oak/api";
import type { ToolEntry } from "@oak/content-kit";
import { circleOfFifths, keyOf, labelPitch, signatureOf } from "@oak/theory";

/** The whole moment never runs longer than this (contracts §9.3). */
export const CEREMONY_MAX_MS = 8_000;
/** The I–IV–V–I arpeggio before the demo (toolbox `unlockArpeggio`, 13 notes, ≈ 1.1 s) and a breath after it. */
export const ARPEGGIO_LEAD_MS = 1_300;
/** The demo plays at most two bars. */
export const DEMO_BARS = 2;

/** One note of a showcase roll: onset and length in bars from the demo's start. */
export interface ShowNote {
  midi: number;
  at: number;
  dur: number;
  /** "F♯4" */
  name: string;
  /** "3", "♭3" */
  degree: string;
  /** "mi" */
  syllable: string;
}

export type Showcase =
  /** A small roll whose notes take their labels as they sound (`labels` says which). */
  | { kind: "roll"; key: KeySpec; keyName: string; notes: ShowNote[]; labels: ("degree" | "syllable")[] }
  /** The key-signature panel: the key, its accidentals in written order, and the demo's notes by name. */
  | { kind: "signature"; key: KeySpec; keyName: string; accidentals: string[]; notes: ShowNote[] }
  /** The circle of fifths: the twelve majors, and the keys the demo walks through, one per bar. */
  | { kind: "circle"; ring: { tonic: string; fifths: number }[]; path: string[] }
  /** Any other tool: its demo code with the tool's own tokens marked (`[start, end)` offsets). */
  | { kind: "code"; code: string; marks: [number, number][] };

interface RollSpec {
  key: string;
  /** [midi, onset in bars, length in bars] */
  notes: [number, number, number][];
}

const Q = 0.25;
const E = 0.125;
/** The demo notes of the feature tools (content/toolbox.ts), two bars each, verified in ceremony-model.test.ts. */
export const FEATURE_NOTES: Readonly<Record<string, RollSpec>> = {
  // n("<[0 2 4 2] [3 1 0 ~]>").scale("C4:major")
  "tb.feature.degree-labels": {
    key: "C major",
    notes: [
      [60, 0, Q],
      [64, 0.25, Q],
      [67, 0.5, Q],
      [64, 0.75, Q],
      [65, 1, Q],
      [62, 1.25, Q],
      [60, 1.5, Q],
    ],
  },
  // n("<[0 1 2 [3 2]] [4 2 0 ~]>").scale("C4:major")
  "tb.feature.solfege": {
    key: "C major",
    notes: [
      [60, 0, Q],
      [62, 0.25, Q],
      [64, 0.5, Q],
      [65, 0.75, E],
      [64, 0.875, E],
      [67, 1, Q],
      [64, 1.25, Q],
      [60, 1.5, Q],
    ],
  },
  // n("<[0 2 4 6] [7 [6 4] 5 ~]>").scale("D4:major")
  "tb.feature.keysig": {
    key: "D major",
    notes: [
      [62, 0, Q],
      [66, 0.25, Q],
      [69, 0.5, Q],
      [73, 0.75, Q],
      [74, 1, Q],
      [73, 1.25, E],
      [69, 1.375, E],
      [71, 1.5, Q],
    ],
  },
};

/** The keys `tb.feature.circle`'s demo walks through, one per bar: `.scale("<C4:major F4:major Bb3:major Eb4:major>")`. */
export const CIRCLE_PATH = ["C", "F", "Bb", "Eb"] as const;

/** "D major", "B♭ major". */
export function keyName(key: KeySpec): string {
  return `${key.tonic.replace("#", "♯").replace(/b$/, "♭")} ${key.mode}`;
}

/** Display form of an accidental or tonic: "F#" → "F♯", "Bb" → "B♭". */
export function displayNote(n: string): string {
  return n.replace("#", "♯").replace(/(?<=[A-G])b/, "♭");
}

function rollNotes(spec: RollSpec): { key: KeySpec; notes: ShowNote[] } {
  const key = keyOf(spec.key);
  if (!key) throw new RangeError(`not a key: ${spec.key}`);
  return {
    key,
    notes: spec.notes.map(([midi, at, dur]) => {
      const l = labelPitch(midi, key);
      return { midi, at, dur, name: l.display, degree: l.degreeDisplay, syllable: l.syllable };
    }),
  };
}

/** `[start, end)` of every occurrence of the tool's own tokens in its demo code: its call (`scale(`) and its `matches`. */
export function tokenMarks(code: string, tool: Pick<ToolEntry, "code" | "matches">): [number, number][] {
  const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns: RegExp[] = [];
  // The signature form of a function: `.scale("C4:major")` → `scale(`, `n("…")` → `n(`.
  const fn = /^\.?([a-zA-Z]\w*)\(/.exec(tool.code)?.[1];
  if (fn) patterns.push(new RegExp(`(?<![\\w$])${esc(fn)}(?=\\()`, "g"));
  // Names the lint maps to the tool: a scale name inside `.scale("C4:major")`, a sound, a chord symbol.
  for (const w of tool.matches ?? [])
    if (w !== fn) patterns.push(new RegExp(`(?<![\\w$])${esc(w)}(?![\\w])`, "g"));
  const marks: [number, number][] = [];
  for (const re of patterns) for (const m of code.matchAll(re)) marks.push([m.index, m.index + m[0].length]);
  marks.sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const m of marks) if (out.length === 0 || m[0] >= (out.at(-1) as [number, number])[1]) out.push(m);
  return out;
}

/** The demo code without its tempo line (shown on its own: it is the same in every demo). */
export function demoBody(demo: string): string {
  return demo.replace(/^setcpm\([^)]*\)\s*\n+/, "").trim();
}

/** What a tool shows while its demo plays. */
export function showcaseOf(tool: Pick<ToolEntry, "id" | "code" | "kind" | "catalog" | "matches">): Showcase {
  const roll = FEATURE_NOTES[tool.id];
  if (tool.id === "tb.feature.keysig" && roll) {
    const { key, notes } = rollNotes(roll);
    const sig = signatureOf(key);
    return {
      kind: "signature",
      key,
      keyName: keyName(key),
      accidentals: (sig.sharps.length > 0 ? sig.sharps : sig.flats).map(displayNote),
      notes,
    };
  }
  if (roll) {
    const { key, notes } = rollNotes(roll);
    return {
      kind: "roll",
      key,
      keyName: keyName(key),
      notes,
      labels: tool.id === "tb.feature.solfege" ? ["degree", "syllable"] : ["degree"],
    };
  }
  if (tool.id === "tb.feature.circle")
    return {
      kind: "circle",
      ring: circleOfFifths().map((c) => ({ tonic: c.major.tonic, fifths: c.accidentals })),
      path: [...CIRCLE_PATH],
    };
  const code = demoBody(tool.catalog.demo);
  return { kind: "code", code, marks: code ? tokenMarks(code, tool) : [] };
}

/** Beats per minute of a demo (`setcpm(84/4)` → 84), or null. */
export function demoBpm(demo: string): number | null {
  const m = /setcpm\(\s*(\d+(?:\.\d+)?)\s*\/\s*4\s*\)/.exec(demo);
  return m ? Number(m[1]) : null;
}

/**
 * The timeline: when the demo starts and how long it plays (ms), inside the budget. Two bars of 4/4 at the
 * demo's tempo, cut where the 8 seconds end. Reduced motion changes nothing here: sound is not motion.
 */
export function ceremonyTimeline(demo: string): { demoAt: number; demoMs: number; totalMs: number } {
  const bpm = demoBpm(demo) ?? 90;
  const bars = (DEMO_BARS * 4 * 60_000) / bpm;
  const demoMs = Math.max(0, Math.min(bars, CEREMONY_MAX_MS - ARPEGGIO_LEAD_MS));
  return { demoAt: ARPEGGIO_LEAD_MS, demoMs, totalMs: ARPEGGIO_LEAD_MS + demoMs };
}

/** Notes sounding or already sounded at `bar` (bars since the demo started): the ones that show their labels. */
export function litNotes(notes: readonly Pick<ShowNote, "at">[], bar: number): number {
  let n = 0;
  for (const note of notes) if (note.at <= bar + 1e-9) n++;
  return n;
}

/** The circle step lit at `bar` (one key per bar), clamped to the path and to the bars the demo plays. */
export function circleStep(pathLength: number, bar: number): number {
  return Math.max(0, Math.min(pathLength - 1, DEMO_BARS - 1, Math.floor(bar + 1e-9)));
}

/** Where a fifths position sits on the ring: C at 12 o'clock, sharps clockwise (degrees, 0 = up). */
export function ringAngle(fifths: number): number {
  return (((fifths % 12) + 12) % 12) * 30;
}
