// The Wave 3 rules of the lesson and checkpoint players (docs/design/wave3.md §10): when a modify step shows
// its target's roll, where the first wrong note of a transcription is, the by-ear transposition rule, what a
// sung target is labelled and how a sing step plays in Quiet mode, which feature tools switch on at a step,
// the staff labels a step asks for, the Make's sketch title, the key-signature answer and the cue that sets
// home before a code stimulus. Pure: `bun test`.
import type {
  AttemptResponse,
  Degree,
  DictationEx,
  Exercise,
  GradeResult,
  KeySpec,
  LessonDef,
  SingEx,
  StepDef,
  StepState,
  Trial,
} from "@oak/api";
import { intervalOf, syllableOf } from "@oak/theory";

// --- course position -----------------------------------------------------------------------------------

/** `U03.L08` → 308; anything that is not a core lesson (a checkpoint, a capstone, a track) → `null`. */
export function coreRank(id: string): number | null {
  const m = /^U(\d\d)\.L(\d\d)$/.exec(id);
  return m ? Number(m[1]) * 100 + Number(m[2]) : null;
}

/** Whether `id` comes at or after the core lesson `from` (non-core sessions count as later: they follow U03). */
export function atOrAfter(id: string, from: string): boolean {
  const a = coreRank(id);
  const b = coreRank(from);
  if (b === null) return false;
  if (a === null) return !/^U0[0-2]\./.test(id);
  return a >= b;
}

// --- modify: the target's roll -------------------------------------------------------------------------

/** Graded attempts that did not pass (a passing attempt ends the series, so it is always the last). */
export function failedChecks(state: Pick<StepState, "attempts"> | null, passed: boolean): number {
  const a = state?.attempts ?? 0;
  return Math.max(0, passed ? a - 1 : a);
}

/**
 * Whether a modify step shows its target's roll: from the start (`showRoll`), or after `revealRollAfter` failed
 * checks (Wave 3: by ear first, then a picture to compare), and always once passed or revealed.
 */
export function targetRollShown(
  ex: Exercise | undefined,
  o: { failed: number; passed: boolean; rung: number },
): boolean {
  if (ex?.kind !== "code-modify") return false;
  const t = ex.target;
  if (t.showRoll) return true;
  if (t.revealRollAfter === undefined) return false;
  return o.passed || o.rung >= 4 || o.failed >= t.revealRollAfter;
}

// --- dictation by ear ----------------------------------------------------------------------------------

export type ByEarEx = DictationEx & { byEar: NonNullable<DictationEx["byEar"]> };

export function isByEar(ex: Exercise | undefined): ex is ByEarEx {
  return ex?.kind === "dictation" && ex.byEar !== undefined;
}

/** The hidden source a by-ear step plays (the reference's first solution). */
export function byEarSource(ex: ByEarEx): { code: string; bars: number } {
  return { code: ex.reference.solutions[0] ?? "", bars: ex.reference.bars };
}

/** The transposition rule, shown before the learner starts (it says what the check will accept). */
export function acceptsText(accepts: ByEarEx["byEar"]["accepts"]): { title: string; body: string } {
  switch (accepts) {
    case "exact":
      return { title: "These exact notes", body: "Write the notes you hear, in the octave you hear them." };
    case "any-octave":
      return {
        title: "Any octave",
        body: "Write the notes you hear. Higher or lower by an octave is fine: the letters and the rhythm count.",
      };
    case "any-key":
      return {
        title: "Any key",
        body: "Write the tune in any key you like: the shape of the tune and its rhythm are what count.",
      };
  }
}

/** The earliest bar with a finding (1-based), or `null`: "the first difference is in bar N". */
export function firstWrongBar(result: Pick<GradeResult, "status" | "diagnostics"> | null): number | null {
  if (result?.status !== "fail") return null;
  let first: number | null = null;
  for (const d of result.diagnostics) {
    if (d.severity !== "error" && d.severity !== "warn") continue;
    const bar = d.where?.bar ?? (typeof d.params.bar === "number" ? d.params.bar : undefined);
    if (typeof bar !== "number" || !Number.isFinite(bar)) continue;
    if (first === null || bar < first) first = bar;
  }
  return first;
}

// --- singing -------------------------------------------------------------------------------------------

export type SingLabels = "numbers" | "syllables";

/** What a sing step sings on: the exercise's own choice, else numbers before U03.L08 and syllables after. */
export function singLabelsFor(ex: Pick<SingEx, "labels">, ownerId: string): SingLabels {
  if (ex.labels) return ex.labels;
  return atOrAfter(ownerId, "U03.L08") ? "syllables" : "numbers";
}

/** A target's label: the number, or the syllable with the number kept beside it (contracts §8.3). */
export function targetLabel(d: Degree, labels: SingLabels): { main: string; sub: string | null } {
  if (labels === "numbers") return { main: d, sub: null };
  return { main: syllableOf(d), sub: d };
}

/** One line per target after a take: the label and how it went, in words (never a colour alone). */
export function targetMarks(
  labels: readonly string[],
  credits: readonly (number | null)[],
): { label: string; word: "on" | "close" | "off" | "missed"; credit: number }[] {
  return labels.map((label, i) => {
    const c = credits[i];
    if (c === null || c === undefined) return { label, word: "missed", credit: 0 };
    return { label, word: c >= 1 ? "on" : c >= 0.5 ? "close" : "off", credit: c };
  });
}

export type SingFallback = { kind: "identify"; degrees: Degree[]; set: Degree[] } | { kind: "inner" };

/**
 * A sing step in Quiet mode or without a mic (contracts §8.5): an identify equivalent when the step names its
 * degrees and asks for one, else "hear it in your head, then press Space". Never a penalty, never evidence.
 */
export function singFallback(ex: SingEx): SingFallback {
  if (ex.fallback === "identify" && ex.target.from === "degrees" && ex.target.degrees.length > 0) {
    const set = [...new Set(ex.target.degrees)].sort((a, b) => degreeOrder(a) - degreeOrder(b));
    return { kind: "identify", degrees: [...ex.target.degrees], set };
  }
  return { kind: "inner" };
}

const degreeOrder = (d: string) => {
  const m = /^([#b]?)(\d)$/.exec(d);
  if (!m) return 99;
  return Number(m[2]) * 10 + (m[1] === "b" ? -1 : m[1] === "#" ? 1 : 0);
};

/** The identify fallback is right when the degrees match in order. */
export function fallbackCorrect(want: readonly Degree[], got: readonly Degree[]): boolean {
  return want.length === got.length && want.every((d, i) => d === got[i]);
}

/** Steps whose exercise is sung never gate Continue (contracts §7.6, §8: singing never gates anything). */
export function isSungStep(step: Pick<StepDef, "exercise">): boolean {
  const ex = step.exercise;
  if (!ex) return false;
  if (ex.kind === "sing") return true;
  return ex.kind === "all" && ex.parts.length > 0 && ex.parts.every((p) => p.kind === "sing");
}

// --- feature tools switching on --------------------------------------------------------------------------

/** The feature tools a lesson can switch on in its own Workbench, and how a step shows each one. */
export const FEATURE_TOOLS = [
  "tb.feature.degree-labels",
  "tb.feature.keysig",
  "tb.feature.circle",
  "tb.feature.solfege",
  "tb.feature.tuner",
  "tb.feature.staff",
  "tb.feature.grand-staff",
] as const;
export type FeatureToolId = (typeof FEATURE_TOOLS)[number];

/** The features a step puts on screen. */
export function featuresOfStep(step: StepDef): Set<FeatureToolId> {
  const out = new Set<FeatureToolId>();
  const labels = [step.ui.rollLabels ?? "none", step.ui.staffLabels ?? "none"];
  if (labels.some((l) => l.includes("degree"))) out.add("tb.feature.degree-labels");
  if (labels.some((l) => l.includes("solfege"))) out.add("tb.feature.solfege");
  const staff = step.ui.panels.staff;
  if (staff) out.add("tb.feature.staff");
  // The key-signature panel sits with the staff: it switches on where the lesson first shows one.
  if (staff && staff !== "perc") out.add("tb.feature.keysig");
  if (staff === "bass" || staff === "grand") out.add("tb.feature.grand-staff");
  const parts = step.exercise ? (step.exercise.kind === "all" ? step.exercise.parts : [step.exercise]) : [];
  for (const p of parts) {
    if (p.kind === "sing") out.add("tb.feature.tuner");
    if (p.kind === "staff-write" && p.answer.mode === "key-signature") out.add("tb.feature.keysig");
  }
  return out;
}

/**
 * The feature tools that switch on at step `index`: of `fresh` (features whose unlock site is this lesson and
 * that the learner did not hold before it), those first shown at this step; a feature no step shows (the circle)
 * switches on at the first step.
 */
export function featureMoment(
  steps: readonly StepDef[],
  index: number,
  fresh: readonly string[],
): FeatureToolId[] {
  const out: FeatureToolId[] = [];
  for (const id of fresh) {
    if (!(FEATURE_TOOLS as readonly string[]).includes(id)) continue;
    const tool = id as FeatureToolId;
    const at = steps.findIndex((s) => featuresOfStep(s).has(tool));
    if (Math.max(at, 0) === index) out.push(tool);
  }
  return out;
}

/** Feature tools whose unlock site is `lessonId`, from the toolbox. */
export function featuresUnlockedAt(
  toolbox: readonly { id: string; kind: string; unlock: { at: string | readonly string[] } }[],
  lessonId: string,
): string[] {
  return toolbox
    .filter((t) => t.kind === "feature" || t.kind === "lens")
    .filter((t) => (Array.isArray(t.unlock.at) ? t.unlock.at : [t.unlock.at]).includes(lessonId))
    .map((t) => t.id);
}

/** Roll labels while a step's degree or solfège labels are still switching on: one step down the ladder. */
export function labelsBefore(
  labels: "none" | "note" | "degree" | "degree+solfege",
  switching: readonly FeatureToolId[],
): "none" | "note" | "degree" | "degree+solfege" {
  if (labels === "degree+solfege" && switching.includes("tb.feature.solfege")) return "degree";
  if (labels.includes("degree") && switching.includes("tb.feature.degree-labels")) return "none";
  return labels;
}

// --- staff labels ----------------------------------------------------------------------------------------

export type StaffLabels = NonNullable<StepDef["ui"]["staffLabels"]>;

/** The staff labels of a step: its own, else the unit default (AUTHORING §6) where the step has a staff. */
export function staffLabelsOf(step: StepDef, ownerId: string): StaffLabels {
  if (step.ui.staffLabels) return step.ui.staffLabels;
  if (!step.ui.panels.staff || step.ui.panels.staff === "perc") return "none";
  if (atOrAfter(ownerId, "U03.L08")) return "degree+solfege";
  if (atOrAfter(ownerId, "U03.L02")) return "degree";
  return "none";
}

/**
 * The Workbench staff's label mode for a step's `staffLabels`: the Workbench takes the content's values as they
 * are (note names, degrees, degrees with syllables), so `note` on a spelling step (U03.L07 S5) draws the names.
 */
export function workbenchStaffLabels(l: StaffLabels): "none" | "note" | "degree" | "degree+solfege" {
  return l;
}

// --- the Make ------------------------------------------------------------------------------------------

/** The Make's sketch title: the exercise's own (`Sketch 001`), else the lesson's. */
export function makeTitle(ex: Pick<Exercise, "title"> | undefined, lesson: Pick<LessonDef, "title">): string {
  const t = ex?.title?.trim();
  return t ? t : lesson.title;
}

// --- key signatures --------------------------------------------------------------------------------------

/** The accidentals as typed or placed ("F♯ c#", "Bb, Eb") in their order, normalised to `F#`, `Bb`. */
export function keySignatureTokens(value: string): string[] {
  return value
    .replace(/♯/g, "#")
    .replace(/♭/g, "b")
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t !== "")
    .map((t) => {
      const m = /^([a-gA-G])(#|b|s|sharp|f|flat)?$/i.exec(t);
      if (!m) return t;
      const acc = (m[2] ?? "").toLowerCase();
      const a = acc === "#" || acc === "s" || acc === "sharp" ? "#" : acc === "" ? "" : "b";
      return `${(m[1] as string).toUpperCase()}${a}`;
    });
}

/** The wire response of a staff-input in key-signature mode (`StaffExpect` `key-signature` reads `text`). */
export function keySignatureResponse(value: string): AttemptResponse {
  return { answer: { text: keySignatureTokens(value) } };
}

// --- cues ------------------------------------------------------------------------------------------------

const PCS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function tonicPc(tonic: string): number {
  const m = /^([A-G])([#b]*)/.exec(tonic);
  if (!m) return 0;
  const acc = [...(m[2] ?? "")].reduce((a, c) => a + (c === "#" ? 1 : -1), 0);
  return ((((PCS[m[1] as string] ?? 0) + acc) % 12) + 12) % 12;
}

/**
 * "A few chords that set home" before a code stimulus (the drills' cadence): ii–V–I in major, ii°–V–i in
 * minor, one bar, voiced around middle C with the bass below. MIDI chords, low to high.
 */
export function cadenceChords(key: KeySpec): number[][] {
  const minor = /minor|aeolian|dorian|phrygian/.test(key.mode);
  // In C: ii d3 f4 a4 d5, V g2 b4 d5 g5, I c3 e4 g4 c5 (the FET family's voicing).
  const inC = minor
    ? [
        [50, 65, 68, 74],
        [43, 71, 74, 79],
        [48, 63, 67, 72],
      ]
    : [
        [50, 65, 69, 74],
        [43, 71, 74, 79],
        [48, 64, 67, 72],
      ];
  const pc = tonicPc(key.tonic);
  const shift = pc > 5 ? pc - 12 : pc;
  return inC.map((c) => c.map((m) => m + shift));
}

// --- passive listening -------------------------------------------------------------------------------------

/** The name a passive-listen block gives a generated example: an interval by its quality, else the answer. */
export function passiveLabel(trial: Pick<Trial, "params" | "expected">): string {
  const p = trial.params as Record<string, unknown>;
  const midis = Array.isArray(p.midis) ? (p.midis as number[]) : null;
  const key = p.key as KeySpec | undefined;
  const e = trial.expected;
  const degrees = e.degrees?.join(" → ");
  if (midis && midis.length === 2) {
    const info = intervalOf(midis[0] as number, midis[1] as number, key ?? null);
    const name = info.semitones === 0 ? "unison" : info.long;
    return degrees ? `${name} · ${degrees}` : name;
  }
  if (degrees) return degrees;
  if (e.text?.length) return e.text.join(" ");
  if (e.choice?.length) return e.choice.join(" ");
  return "";
}
