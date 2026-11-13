// "Hum it, Oak drafts it" (contracts §6.12): the learner sings or hums a line over a click; the pitch tracker
// segments the take into notes and `draftFromHum` (@oak/pitch, the audio engineer's) turns them into a draft
// `n("…").scale("…")` line in the project's key and tempo (`humToDraft`). The draft is machine-made: it is saved with
// `machineDraft: true` and gives no evidence until the learner's corrected version is checked. Quiet mode hides
// the mic path and offers typing instead (wave4.md §10 item 9). The mic is analysed live; nothing is recorded.
import type { KeySpec, LearnerProfile, MeterId } from "@oak/content-kit";
import type { HumDraft, HumToDraftResult, PitchFrame, SungNote } from "@oak/pitch";
import { humToDraft } from "@oak/pitch";

export type HumTarget = "melody" | "bass";

export interface HumPlan {
  key: KeySpec;
  bpm: number;
  meter: MeterId;
  /** Bars to sing (the item's length, or 4 for own audio). */
  bars: number;
  target: HumTarget;
}

/** Where a hummed line lands: its label and octave as the grader reads it (`@melody`, `@bass`). */
export const HUM_TRACK: Record<HumTarget, { label: string; octave: number; sound: string }> = {
  melody: { label: "melody", octave: 4, sound: "piano" },
  bass: { label: "bass", octave: 2, sound: "ebass" },
};

/**
 * Draft from a take: frames on the AudioContext clock, bar 1 sounding at `downbeat`. `humToDraft` (@oak/pitch)
 * runs the graders' tracker, drops blips shorter than a sung note, removes the learner's sing latency and drafts
 * the line in the key; `degrees` are the draft's 1-based degrees.
 */
export function draftOfTake(
  frames: readonly PitchFrame[],
  plan: HumPlan,
  profile: Pick<LearnerProfile, "rangeLow" | "noiseFloorDb" | "singLatencyMs">,
  downbeat: number,
): { draft: HumDraft; notes: SungNote[]; degrees: HumToDraftResult["degrees"] } {
  const t = HUM_TRACK[plan.target];
  const r = humToDraft(frames, {
    key: plan.key,
    bpm: plan.bpm,
    meter: plan.meter,
    downbeat,
    maxBars: plan.bars,
    label: t.label,
    tonicOctave: t.octave,
    profile,
  });
  const { sung, degrees, ...draft } = r;
  return { draft, notes: sung, degrees };
}

/** The draft line with the target's sound, ready to go into the editor. */
export function draftLine(draft: HumDraft, target: HumTarget): string {
  return `${draft.line}.s("${HUM_TRACK[target].sound}")`;
}

/**
 * The learner's code with the drafted line in place: it replaces the line of the same label when there is
 * one, otherwise it is added at the end (after a tempo line when the code has none).
 */
export function withDraft(code: string, line: string, tempoLine: string): string {
  const label = /^([A-Za-z_$][\w$]*):/.exec(line)?.[1];
  const lines = code.split("\n");
  if (label) {
    const at = lines.findIndex((l) => l.trimStart().startsWith(`${label}:`));
    if (at >= 0) {
      lines[at] = line;
      return lines.join("\n");
    }
  }
  const hasTempo = /\bset(cpm|cps)\s*\(/.test(code);
  const body = code.trimEnd();
  return `${hasTempo || !body ? (body ? `${body}\n` : `${tempoLine}\n\n`) : `${tempoLine}\n${body}\n`}${line}\n`;
}

/** A sentence about what the draft could not keep (empty when nothing). */
export function draftNotes(draft: HumDraft): string[] {
  const out: string[] = [];
  const snapped = draft.warnings.filter((w) => w.code === "chromatic-snapped").length;
  if (draft.warnings.some((w) => w.code === "empty"))
    out.push("No clear notes came through. Try again a little louder, or closer to the mic.");
  if (snapped > 0)
    out.push(
      `${snapped} ${snapped === 1 ? "note was" : "notes were"} between scale steps and moved to the nearest one.`,
    );
  if (draft.warnings.some((w) => w.code === "truncated")) out.push("Notes after the last bar were left out.");
  if (draft.warnings.some((w) => w.code === "collision-dropped"))
    out.push("Two notes fell on one slot; the longer one was kept.");
  if (Math.abs(draft.tuningCents) >= 20)
    out.push(
      `You sang ${Math.abs(Math.round(draft.tuningCents))}¢ ${draft.tuningCents > 0 ? "sharp" : "flat"} overall; the draft allows for it.`,
    );
  return out;
}
