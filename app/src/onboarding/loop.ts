// The onboarding loop (content/specs/U00.ts `ONBOARDING_LOOP`, ux §8): four labelled lines, one musician each.
// Kept as a copy here because the app never imports the unit specs; `loop.test.ts` fails if the two differ.
// Everything here is pure: where the one editable number sits, what the learner typed, which layers play in
// which bar of the build-up, and the deterministic reaction to the chosen number (ux §8 `onb.react`).
import type { CodeRange } from "@oak/content-kit";

export const ONBOARDING_LOOP = `setcpm(92/4)

drums: s("bd ~ sd ~, hh*8").bank("RolandTR808").gain(.8)
bass: note("<c2 a1 f1 g1>").s("ebass").lpf(800)
chords: chord("<C Am F G>").voicing().s("rhodes").gain(.5)
mel: n("<[4 ~ 2 4] [0 ~ ~ 2] [5 ~ 3 5] [4 ~ ~ ~]>").scale("C4:major").s("piano")`;

export const LOOP_BPM = 92;
export const LOOP_BARS = 4;

export type Layer = "drums" | "bass" | "chords" | "mel";

export interface LayerInfo {
  id: Layer;
  /** The musician, in plain words. */
  name: string;
  /** The 1-based bar of the build-up in which it comes in (ux §8: bass 2, chords 3, melody 5). */
  entersAtBar: number;
  /** The lesson whose tools this line is written with ("you'll unlock this"); checked against content/toolbox.ts. */
  unlockLesson: string;
  /** The call the learner will write themselves then. */
  tool: string;
}

export const LAYERS: readonly LayerInfo[] = [
  { id: "drums", name: "Drums", entersAtBar: 1, unlockLesson: "U01.L01", tool: "s()" },
  { id: "bass", name: "Bass", entersAtBar: 2, unlockLesson: "U02.L01", tool: "note()" },
  { id: "chords", name: "Chords", entersAtBar: 3, unlockLesson: "U05.L08", tool: "chord()" },
  { id: "mel", name: "Melody", entersAtBar: 5, unlockLesson: "U03.L02", tool: "n()" },
];

/** The labels still silent in 0-based bar `bar` of the build-up (everything plays from bar index 4 on). */
export function mutedAt(bar: number): Layer[] {
  return LAYERS.filter((l) => bar < l.entersAtBar - 1).map((l) => l.id);
}

/** Bars of the build-up before the whole band plays. */
export const BUILD_BARS = Math.max(...LAYERS.map((l) => l.entersAtBar)) - 1;

/** The offsets of each labelled line (for lighting a line as it enters). */
export function lineRanges(code: string): Partial<Record<Layer, CodeRange>> {
  const out: Partial<Record<Layer, CodeRange>> = {};
  let at = 0;
  for (const line of code.split("\n")) {
    const m = /^(drums|bass|chords|mel):/.exec(line);
    if (m) out[m[1] as Layer] = { from: at, to: at + line.length };
    at += line.length + 1;
  }
  return out;
}

/**
 * The one editable number (contracts §3.1 rule 5a): the first number of the melody's last bar, `[4 ~ ~ ~]`.
 * Returns its range in `code` (empty when the learner cleared it), or null when the melody line has another shape.
 */
export function editableRange(code: string): CodeRange | null {
  const mel = lineRanges(code).mel;
  if (!mel) return null;
  const line = code.slice(mel.from, mel.to);
  const open = line.indexOf('n("<');
  const close = line.indexOf('>")', open);
  if (open < 0 || close < 0) return null;
  const lastGroup = line.lastIndexOf("[", close);
  if (lastGroup < open) return null;
  const m = /^\[\s*([^\s\]~]*)/.exec(line.slice(lastGroup));
  if (!m) return null;
  const from = mel.from + lastGroup + m[0].length - (m[1] as string).length;
  return { from, to: from + (m[1] as string).length };
}

/**
 * What the learner left in the editable slot. The editor allows typing only inside the slot, so the region is
 * found again from the text: the first token of the last melody group. `value` is null for anything that is not
 * a whole number from 0 to 7 (`text` says what it was).
 */
export function readEdit(code: string): { text: string; value: number | null } {
  const mel = lineRanges(code).mel;
  if (!mel) return { text: "", value: null };
  const line = code.slice(mel.from, mel.to);
  const open = line.indexOf('n("<');
  const close = line.indexOf('>")', open);
  const lastGroup = open < 0 || close < 0 ? -1 : line.lastIndexOf("[", close);
  if (lastGroup < 0) return { text: "", value: null };
  const token = /^\[\s*([^\s\]~]*)/.exec(line.slice(lastGroup))?.[1] ?? "";
  const value = /^[0-7]$/.test(token) ? Number(token) : null;
  return { text: token, value };
}

/** The loop with `value` in the editable slot. */
export function withEdit(code: string, value: number | string): string {
  const r = editableRange(code);
  if (!r) return code;
  return code.slice(0, r.from) + String(value) + code.slice(r.to);
}

/** The starter's value in the slot (4: the melody ends on G over the G chord). */
export const STARTER_VALUE = 4;

/** Degree-1 numbers of the C major scale from C4: what `n(v).scale("C4:major")` plays (checked headless). */
export const SLOT_MIDI: readonly number[] = [60, 62, 64, 65, 67, 69, 71, 72];

export interface Reaction {
  /** The learner's number and the note it plays, in words. */
  title: string;
  /** Two short sentences about what they hear; true for this loop (G chord under bar 4, home on C). */
  body: string;
  /** What to listen for when it comes round again. */
  listen: string;
}

/**
 * The deterministic reaction keyed by the chosen number (ux §8 `onb.react`, 8 variants): no tutor needed.
 * Bar 4 plays G B D (the G chord) over a G in the bass; the loop then starts again on C. No theory words are
 * taught here (content/specs U00 voice rule): numbers, "home", lean, rest.
 */
export const REACTIONS: Readonly<Record<number, Reaction>> = {
  0: {
    title: "0 plays C, the note the loop calls home",
    body: "It sounds settled and unsettled at once: the tune is home a bar early, while the bass is still on G. When the loop comes round, the bass arrives home too.",
    listen: "Listen to bar 4 rub against the bass, then relax as bar 1 starts again.",
  },
  1: {
    title: "1 plays D, a step above home",
    body: "D belongs to the sound underneath, so it sits calmly, but it does not rest. It leaves a question that bar 1 answers.",
    listen: "Hear how the start of the loop feels like the answer.",
  },
  2: {
    title: "2 plays E, a gentler colour",
    body: "E is not part of the sound under bar 4, so the ending softens and floats. Many songs lean on this note for warmth.",
    listen: "Listen for the slight blur in bar 4 that clears when the loop restarts.",
  },
  3: {
    title: "3 plays F, the restless one",
    body: "F pushes against the bass and wants to step down. The ending now pulls forward into the next bar.",
    listen: "Hear the pull in bar 4, and the release as the loop lands on bar 1.",
  },
  4: {
    title: "4 is where it started: G",
    body: "G matches the bass note under bar 4, so the ending is steady. Try another number to hear something change.",
    listen: "This is the original ending; any other number from 0 to 7 changes it.",
  },
  5: {
    title: "5 plays A, bright and open",
    body: "A floats above the sound underneath without clashing. The ending turns lighter and leaves the door open.",
    listen: "Listen for the lift in bar 4 before the loop settles back on bar 1.",
  },
  6: {
    title: "6 plays B, leaning up toward home",
    body: "B sits right under the home note, so it leans up and wants to resolve. The start of the loop finishes the thought.",
    listen: "Hear how it leans up, wanting to go home, then gets there in bar 1.",
  },
  7: {
    title: "7 plays C again, an octave higher",
    body: "Seven steps up from 0 you reach the home note again, higher. It sounds like 0, only brighter.",
    listen: "Compare it in your head with 0: the same note, higher up.",
  },
};

/** Whether the edit counts as a change (contracts: the unchanged starter fails with `code.unchanged`). */
export function isChanged(value: number | null): value is number {
  return value !== null && value !== STARTER_VALUE;
}

/** The melody's pattern, between `n("<` and `>")`: what Sketch 001 lets the learner change ("change anything"). */
export function melodyRange(code: string): CodeRange | null {
  const mel = lineRanges(code).mel;
  if (!mel) return null;
  const line = code.slice(mel.from, mel.to);
  const open = line.indexOf('n("<');
  const close = line.indexOf('>")', open);
  if (open < 0 || close < 0) return null;
  return { from: mel.from + open + 4, to: mel.from + close };
}
