// The runner's words (ux §7.11: second person, short, musical, no exclamation marks, no blame). Prompts by
// generator for trials whose generator does not write one.
import type { FamilyDef, Trial } from "@oak/api";
import type { Stage } from "./machine.ts";

const PROMPTS: Record<string, string> = {
  "rhythm-pulse": "Tap along on the beat from the second bar.",
  "rhythm-echo": "Listen to the bar, then tap it back over the click.",
  "rhythm-read": "After the count-in, tap the rhythm on the staff.",
  "rhythm-count": "On which count does it land?",
  "rhythm-meter": "How are the beats grouped?",
  "rhythm-dictation": "Mark the hits you hear on the grid.",
  "rhythm-subdivision": "How do the hats divide the beat?",
  "rhythm-swing": "Straight or swung?",
  "rhythm-clave": "Which pattern is it?",
  "rhythm-odd-grouping": "How is the bar grouped?",
  "pitch-match": "Listen, then sing the note on any vowel.",
  "pitch-compare": "Is the second note higher, lower or the same?",
  "pitch-steps": "Half step or whole step?",
  "pitch-keyboard": "Name the highlighted key.",
  "degree-tonic": "Which note feels like home?",
  "degree-id": "Which degree was the last note?",
  "degree-sing": "Sing the degree after the cadence.",
  "degree-resolve": "Sing the line home to 1.",
  "melody-dictation": "Which way does the tune move?",
  "melody-echo": "Listen, then sing it back.",
  "melody-sight": "Sing what the staff shows.",
  "interval-in-key": "Which two degrees did you hear?",
  "interval-sing": "Sing the interval above the note.",
  "interval-isolated": "Which interval?",
  "chord-quality": "After the key, one chord: what quality is it?",
  "chord-inversion": "Which chord tone is in the bass: which inversion?",
  "chord-spell": "Spell the chord from the root up.",
  "harmony-cadence": "How does the phrase end?",
  "harmony-bass": "Hear the bass first: which degree is each root?",
  "harmony-schema": "Which loop is it?",
  "harmony-function": "Home, away or tension: what is the chord's job?",
  "harmony-progression": "Bass first, then each chord's quality, then the numerals.",
  "key-mode": "Which mode?",
  "notation-read": "Write these bars as code.",
};

export function promptOf(trial: Trial<unknown>, def: FamilyDef): string {
  const p = trial.params;
  // Chord dictation names its key in its own prompt; the runner says how it is answered (bass first).
  if (def.generator === "harmony-progression" && p.key && typeof p.key === "object") {
    const k = p.key as { tonic: string; mode: string };
    return `In ${k.tonic.replace(/b$/, "♭").replace(/#$/, "♯")} ${k.mode}: bass first, then each chord's quality, then the numerals.`;
  }
  const own = p.prompt;
  if (typeof own === "string" && own.trim() !== "") return own;
  if (def.generator === "melody-dictation") {
    if (p.ui === "degree-pad") return "Write the tune as degrees, in order.";
    if (p.ui === "code") return "Write the tune as code: n is the degree − 1.";
    if (p.ui === "staff-input")
      return "Write the tune on the staff: the pitches and how long each one lasts.";
  }
  if (def.generator === "rhythm-dictation" && p.ui === "staff-input")
    return "Write the rhythm on the staff: where each hit falls and how long it lasts.";
  if (def.generator === "interval-in-key" && p.shape === "harmonic")
    return "Which two degrees sounded together? Lower first.";
  if (def.generator === "degree-id" && Number(p.steps && (p.steps as unknown[]).length) > 1)
    return "Which degrees, in order?";
  return PROMPTS[def.generator] ?? def.title;
}

/** What the stimulus panel says during a stage. */
export function stageText(stage: Stage, mode: unknown): string | null {
  switch (stage) {
    case "cue":
      return "Setting the key…";
    case "count-in":
      return "Count-in…";
    case "listen":
      return mode === "sing" ? "Listen…" : "Listening…";
    case "respond":
      return "Your turn: tap with Space.";
    case "sing":
      return "Your turn: sing now.";
    case "resolution":
      return "The way home…";
    default:
      return null;
  }
}

/** What a written dictation asks in each answer mode (level 4 and beyond). */
export const DICTATION_PROMPTS: Readonly<Record<"degrees" | "code" | "staff", string>> = {
  degrees: "Write the tune as degrees, in order.",
  code: "Write the tune as code: n is the degree − 1.",
  staff: "Write the tune on the staff: the pitches and how long each one lasts.",
};

/** What a staged trial's open step asks. */
export const STEP_PROMPTS: Readonly<Record<"bass" | "quality" | "rn", string>> = {
  bass: "Step 1 · The bass: the degree under each chord.",
  quality: "Step 2 · The quality of each chord.",
  rn: "Step 3 · The Roman numerals.",
};

/** The line after a step check that did not pass yet (never shaming: what is right, and what to do). */
export function stepRetryText(step: "bass" | "quality" | "rn", marks: readonly boolean[]): string {
  const right = marks.filter(Boolean).length;
  const what = step === "bass" ? "bass notes" : step === "quality" ? "qualities" : "numerals";
  return `${right} of ${marks.length} ${what} right so far. Hear it again, change the marked ones, and check again.`;
}

/** Calm copy when free practice moves the level (never shaming). */
export function levelMoveText(from: number, to: number): string | null {
  if (to > from) return `Up to level ${to}: a little more to tell apart.`;
  if (to < from) return `Back to level ${to} for a few trials. The ear settles there, then climbs.`;
  return null;
}
