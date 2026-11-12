// Which labels and colours each Workbench view shows (Wave 3, docs/design/wave3.md §4.3). Two sources:
//   - the lenses (the shared `useLenses()` preference, gated by unlocks): Studio, free play, the Toolbox, the
//     capstone, the album, a session's sketch — everywhere a host does not name the labels itself;
//   - the content: a lesson step's `ui.rollLabels` / `ui.staffLabels` (scaffold fading, AUTHORING §6), passed as
//     `roll.labels` / `staff.labels`. Content wins inside the step and the lens switches are hidden.
// Gating holds in both: a degree or a syllable never appears in hover text, the notes table or the keyboard
// before its tool is unlocked (contracts §3: "before U03.L02 no degree labels anywhere"). Pure.
import type { LensId, LensPrefs } from "@oak/api";
import type { AnnotationKinds } from "./annotate.ts";

export type RollLabelMode = "none" | "note" | "degree" | "degree+solfege";
export type RollColorMode = "degree" | "chordTone" | "part" | "mono";
/** A lesson step's `ui.staffLabels`, plus the Wave 2 lyric lines a host may still name. */
export type StaffLabelMode = "none" | "note" | "degree" | "solfege" | "degree+solfege" | "counts";
/** Settings → Learning's "Roll labels": `auto` follows the lenses, a fixed value overrides the roll only. */
export type RollLabelSetting = "auto" | "note" | "degree" | "degree+solfege";

/** What the Workbench knows of the lenses (absent outside the app, e.g. the standalone e2e page). */
export interface LensState {
  shown: LensPrefs;
  available: Record<LensId, boolean>;
}

export interface ViewLabels {
  /** Who decides: the lenses (switches shown) or the host/content (switches hidden). */
  mode: "lenses" | "content";
  /** Texts printed on each roll note. */
  note: AnnotationKinds;
  /** Row labels in the roll's gutter. */
  gutter: RollLabelMode;
  color: RollColorMode;
  /** Lines under the staff. */
  staff: AnnotationKinds;
  /** Rhythm counts under a percussion staff (content only). */
  staffCounts: boolean;
  /** Degree and syllable in hover text and the notes table (gated by unlocks only, not by the preference). */
  hover: { degree: boolean; solfege: boolean };
  /** Degree numbers on the keyboard's keys. */
  keyboardDegrees: boolean;
}

export interface ViewLabelsInput {
  rollLabels?: RollLabelMode;
  rollColor?: RollColorMode;
  staffLabels?: StaffLabelMode;
  lenses: LensState | null;
  rollSetting?: RollLabelSetting;
  hasKey: boolean;
}

const NONE: AnnotationKinds = { degree: false, solfege: false, noteName: false };

function fromRollMode(m: RollLabelMode): AnnotationKinds {
  return {
    degree: m === "degree" || m === "degree+solfege",
    solfege: m === "degree+solfege",
    noteName: m === "note",
  };
}

function fromStaffMode(m: StaffLabelMode): AnnotationKinds {
  return {
    degree: m === "degree" || m === "degree+solfege",
    solfege: m === "solfege" || m === "degree+solfege",
    noteName: m === "note",
  };
}

function gated(k: AnnotationKinds, a: Record<LensId, boolean>): AnnotationKinds {
  return { degree: k.degree && a.degrees, solfege: k.solfege && a.solfege, noteName: k.noteName };
}

function gutterOf(k: AnnotationKinds): RollLabelMode {
  if (k.degree) return k.solfege ? "degree+solfege" : "degree";
  return "note";
}

/** True when the host names the labels itself (a lesson step): content wins and the switches are hidden. */
export function contentDecides(i: Pick<ViewLabelsInput, "rollLabels" | "staffLabels">): boolean {
  return i.rollLabels !== undefined || i.staffLabels !== undefined;
}

/** A lens switch exists for the learner only once a lens beyond plain note names is unlocked. */
export function showsSwitcher(lenses: LensState | null, mode: ViewLabels["mode"]): boolean {
  return mode === "lenses" && lenses !== null && (lenses.available.degrees || lenses.available.solfege);
}

export function viewLabels(i: ViewLabelsInput): ViewLabels {
  const a = i.lenses?.available;
  if (contentDecides(i) || !i.lenses || !a) {
    // The host decides. Without lens state (outside the app) the Wave 2 defaults hold.
    const rollMode = i.rollLabels ?? (i.hasKey ? "degree" : "note");
    const staffMode = i.staffLabels ?? "none";
    const note = fromRollMode(rollMode);
    return {
      mode: "content",
      note,
      gutter: rollMode,
      color: i.rollColor ?? (i.hasKey ? "degree" : "part"),
      staff: fromStaffMode(staffMode),
      staffCounts: staffMode === "counts",
      hover: a ? { degree: a.degrees, solfege: a.solfege } : { degree: true, solfege: true },
      keyboardDegrees: a ? a.degrees : true,
    };
  }
  const shown = i.lenses.shown;
  const lensNote: AnnotationKinds = {
    degree: shown.degrees,
    solfege: shown.solfege,
    noteName: shown.noteNames,
  };
  const fixed = i.rollSetting && i.rollSetting !== "auto" ? gated(fromRollMode(i.rollSetting), a) : null;
  const note = fixed && (fixed.degree || fixed.solfege || fixed.noteName) ? fixed : lensNote;
  return {
    mode: "lenses",
    note,
    gutter: gutterOf(note),
    color: i.rollColor ?? (note.degree && i.hasKey ? "degree" : "part"),
    staff: lensNote,
    staffCounts: false,
    hover: { degree: a.degrees, solfege: a.solfege },
    keyboardDegrees: shown.degrees,
  };
}

/** The text one roll note prints for the active kinds: "3", "3 mi", "3 mi E4", "E4". */
export function noteText(
  label: { display: string; degree?: { label: string; syllable: string } } | null,
  k: AnnotationKinds,
): string {
  if (!label) return "";
  const parts: string[] = [];
  if (k.degree && label.degree) parts.push(label.degree.label);
  if (k.solfege && label.degree) parts.push(label.degree.syllable);
  if (k.noteName || (k.degree && !label.degree)) parts.push(label.display);
  return parts.join(" ");
}

export { NONE as NO_LABELS };
