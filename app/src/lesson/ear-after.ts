// After a lesson ear step is answered it offers what a drill offers (decision of 2026-11-13, d16): the thing alone
// and the thing in context. For a drawn trial the two are the drill's own (the asked note without the chords that
// set home; the whole passage again). For an authored stimulus "alone" is the line the question is about with
// everything around it stripped (the other lines, the Band, the chords that set home), and "in context" is the
// whole stimulus as it was asked. A stimulus with nothing around it (one chord, no home cue) has nothing to take
// away, so it offers neither: the Play button already is the thing alone. Pure rules; the audio is in audio.ts.
import type { AllEx, Exercise, Trial } from "@oak/api";

type Part = Exclude<Exercise, AllEx>;

/** The lines of a code stimulus that can be "the thing", by what the answer is about. */
const MELODY = ["mel", "melody", "lead", "tune", "riff"];
const CHORDS = ["chords", "keys", "comp"];
const BASS = ["bass"];

/** What the answer surface asks about: a note or notes, chords, or (a choice, a bar, a number) anything. */
function askedLines(ui: string | null, bassAsked: boolean): string[] {
  if (bassAsked) return [...BASS, ...MELODY, ...CHORDS];
  if (ui === "degree-pad" || ui === "staff-input" || ui === "keyboard")
    return [...MELODY, ...BASS, ...CHORDS];
  if (ui === "quality-pad" || ui === "rn-palette" || ui === "bar-grid" || ui === "slot-choice")
    return [...CHORDS, ...MELODY, ...BASS];
  return [...MELODY, ...CHORDS, ...BASS];
}

export interface EarAfterPlan {
  /** The button's words: "The note alone", "The tune alone", "The chords alone", "The bass alone". */
  aloneLabel: string;
  /** A drawn trial plays the drill's own "alone"; a code stimulus plays these lines only. */
  alone: { from: "trial" } | { from: "code"; tracks: string[] };
}

/** An ear exercise: an answer about something heard (never code, a take or taps). */
export function isEarAnswer(
  ex: Exercise | undefined,
): ex is Extract<Part, { kind: "identify" | "dictation" }> {
  if (!ex) return false;
  if (ex.kind !== "identify" && ex.kind !== "dictation") return false;
  if (ex.kind === "dictation" && (ex.byEar || ex.answer.ui === "code")) return false;
  const stim = ex.stimulus;
  return stim !== undefined && (stim.src === "code" || stim.src === "generator");
}

const uiOf = (ex: Part): string | null =>
  "answer" in ex && ex.answer && typeof ex.answer === "object" ? ex.answer.ui : null;

/** How many things the answer names (one degree: "the note"; several: "the notes"). */
function answerCount(ex: Part, trial: Trial | null): number {
  const c = (trial?.expected ?? ("correct" in ex ? ex.correct : undefined)) as
    | { degrees?: unknown[]; qualities?: unknown[]; rn?: unknown[]; midi?: unknown[] }
    | undefined;
  return c?.degrees?.length ?? c?.qualities?.length ?? c?.rn?.length ?? c?.midi?.length ?? 1;
}

function labelFor(line: "note" | "tune" | "chords" | "bass", count: number): string {
  if (line === "note") return count === 1 ? "The note alone" : "The notes alone";
  if (line === "chords") return count === 1 ? "The chord alone" : "The chords alone";
  if (line === "bass") return "The bass alone";
  return "The tune alone";
}

/**
 * What "alone" is for this ear exercise, or `null` when there is nothing to take away.
 * `tracks`: the labels of the code stimulus's own lines (audio.ts `stimulusTracks`), unused for a drawn trial.
 * `trialAlone`: whether the drill engine has an "alone" for the drawn trial (drills `alonePlan(trial) !== null`).
 */
export function earAfterPlan(
  ex: Exercise | undefined,
  o: { trial: Trial | null; tracks: readonly string[]; trialAlone: boolean },
): EarAfterPlan | null {
  if (!isEarAnswer(ex)) return null;
  const ui = uiOf(ex);
  const count = answerCount(ex, o.trial);
  const stim = ex.stimulus;
  if (stim.src === "generator") {
    if (!o.trial || !o.trialAlone) return null;
    const degrees = ui === "degree-pad";
    const bass = o.trial.family === "fam.har.bass";
    return {
      aloneLabel: bass
        ? labelFor("bass", count)
        : degrees
          ? labelFor("note", count)
          : labelFor("tune", count),
      alone: { from: "trial" },
    };
  }
  if (stim.src !== "code") return null;
  const bassAsked = /\bbass\b/i.test(ex.prompt) && o.tracks.includes("bass");
  const line = askedLines(ui, bassAsked).find((t) => o.tracks.includes(t));
  if (!line) return null;
  const others = o.tracks.filter((t) => t !== line).length > 0;
  const homeCue = ex.cue.context !== "none";
  // One line and no chords before it: the stimulus already is the thing alone.
  if (!others && !homeCue) return null;
  const kind = BASS.includes(line)
    ? "bass"
    : CHORDS.includes(line)
      ? "chords"
      : ui === "degree-pad"
        ? "note"
        : "tune";
  return { aloneLabel: labelFor(kind, count), alone: { from: "code", tracks: [line] } };
}

/**
 * The second button of an authored stimulus: the whole passage as it was asked (its chords that set home first).
 * A drawn trial uses the drill's own words ("The note in context", "In its key").
 */
export const IN_CONTEXT_LABEL = "In context";

/** After an answer: a result that is a verdict (never while unchecked, never for a step only saved). */
export function earAfterShown(o: {
  mode: "lesson" | "checkpoint";
  answered: boolean;
  checking: boolean;
}): boolean {
  return o.mode === "lesson" && o.answered && !o.checking;
}
