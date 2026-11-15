// The AnswerWidget contract (docs/design/wave2.md §3.1): one props shape for every answer kind of contracts §5.4,
// so the lesson player, the drill runner, checkpoints and capstones render any answer the same way. The answers
// engineer implements the widgets and `answerWidgetFor`; everyone else only imports this file and response.ts.
//
// Rules every widget follows:
//  - Controlled: `value` comes in, `onChange(next)` goes out. A widget never grades and never calls the API.
//  - `onSubmit()` is the learner's "Check" (Enter, or Mod+Shift+Enter inside a code editor). The host decides
//    what happens (grade, attempt, next trial); a widget never submits on its own except where
//    `AUTO_SUBMIT_KINDS` says so (a drill's single-choice pad).
//  - `feedback` is shown, not computed: per-part marks come from the GradeResult the host already has, at the
//    rung the host allows (contracts §10.5). A widget never reveals anything the feedback does not carry.
//  - `disabled` while a check is pending or once the step is passed; the value stays visible.
//  - Keys (ux §7.10): see `ANSWER_KEYS`. A widget only handles keys while focus is inside it, and never
//    `Space` (play/stop belongs to the workbench) unless it is a tap pad, which says so with
//    `data-keyscope="tap"`.
import type {
  Answer,
  AnswerUi,
  AttemptResponse,
  BlankSpec,
  ChordQuality,
  CodeRange,
  Degree,
  HintRung,
  Md,
  ParsonsBlock,
  ParsonsEx,
  TrackRef,
} from "@oak/api";
import type { ComponentType } from "react";

/**
 * Every answer the app renders: the authored `AnswerUi` kinds plus the three answer surfaces that live on an
 * exercise rather than in an `AnswerUi` (Parsons blocks, code-fill blanks, hum-to-predict).
 */
export type AnswerSpec =
  | AnswerUi
  /** `ParsonsEx`: drag or keyboard-move blocks into order. */
  | { ui: "order"; blocks: ParsonsBlock[]; distractors: ParsonsBlock[]; assemble: ParsonsEx["assemble"] }
  /** `CodeFillEx`: the starter with ⟦blank⟧ inputs (text or select). */
  | { ui: "blanks"; starter: string; blanks: BlankSpec[] }
  /** `PredictEx` with `mode: 'hum'`: hum what you expect; completion only, never graded against a key. */
  | { ui: "hum"; bars: number; track?: TrackRef }
  /**
   * Two auditions, A and B: "same" or "different" (contour, rhythm, chord quality). Wave 2 addition: the
   * value is a choice (`"same"` | `"different"`), so it grades as a `choice` answer.
   */
  | { ui: "same-different"; a: string; b: string; question?: string }
  /**
   * An estimate on a scale: tempo in BPM, swing amount, a count. Wave 2 addition: the value is a number,
   * so it grades as a `number` answer (with the exercise's own tolerance).
   */
  | {
      ui: "slider";
      min: number;
      max: number;
      step: number;
      /** Printed after the value: "BPM", "%". */
      unit?: string;
      /**
       * How the value reads: plain number, a percentage of 0–1, or a swing amount (0 straight, 1/3 triplet). Wave 7:
       * `ms`, a lay-back in milliseconds (read with the `.late()` it takes at `AnswerEnv.slider.bpm`); `hz`, a
       * cutoff ("800 Hz", "2.4 kHz").
       */
      format?: "number" | "percent" | "swing" | "ms" | "hz";
      /** Landmarks under the track ("straight", "triplet"). */
      marks?: { at: number; label: string }[];
      /** Wave 7: `log` spreads the track logarithmically (a cutoff from 100 Hz to 10 kHz). Default linear. */
      scale?: "linear" | "log";
      /**
       * Wave 7, a slider that plays (R1.L02 "set the swing", R1.L05 "set the lay-back", A1 "match the control by
       * ear"): `swing` and `layback` play a two-bar groove at the learner's setting by themselves; `control`
       * plays through the host (`AnswerEnv.slider.play`, with `playTarget` the sound to match).
       */
      play?: "swing" | "layback" | "control";
    };
export type AnswerKind = AnswerSpec["ui"];
/**
 * The spec of one kind. Distributive, so a member that covers several kinds (`click-code | click-staff |
 * click-roll` share one `AnswerUi` member) narrows to `{ ui: K }` instead of `never`.
 */
export type AnswerSpecOf<K extends AnswerKind> = SpecFor<AnswerSpec, K>;
type SpecFor<S, K> = S extends { ui: infer U } ? (K extends U ? Omit<S, "ui"> & { ui: K } : never) : never;

/** One sung note's summary: what an attempt stores (never audio). */
export interface SungSummary {
  midi: number | null;
  cents: number | null;
  credit: number;
}

/** The value each kind holds while the learner answers. `null`/empty means "nothing yet". */
export interface AnswerValueMap {
  /** Selected choice IDs; at most one unless `multi`. */
  choice: string[];
  /** One degree per slot (`sequenceLen`, default 1). */
  "degree-pad": Degree[];
  "quality-pad": ChordQuality[];
  /** One Roman numeral per slot, `""` for an empty slot. */
  "rn-palette": string[];
  /** As typed; normalised only for the "reads as" preview (`@oak/theory` `normalizeText`). */
  text: string;
  number: number | null;
  /** MIDI notes picked, in order (`mode: 'sequence'`) or as a set. */
  keyboard: number[];
  /**
   * The staff-input text (`@oak/notation` staff-input helpers). With `palette.chords` (Wave 4) notes that start
   * together are one chord: `[C4,E4,G4]:2`.
   */
  "staff-input": string;
  /** Sounding cells, `row × (stepsPerBar × bars)`; row order is `spec.rows`. */
  grid: boolean[][];
  /** Wave 7 (planned; the answers engineer builds the widget): group sizes in order, `[2, 2, 3]`. */
  grouping: number[];
  /** Wave 7 (planned): a Euclidean rhythm's numbers, `[k, n]` or `[k, n, r]`. */
  euclid: number[];
  code: string;
  /** Tap times in seconds on the AudioContext clock, latency-corrected by the tap input. */
  tap: number[];
  /** The sung notes' summaries once singing ends (live frames stay inside the widget). */
  mic: SungSummary[];
  /** 1-based bars, in click order. */
  "bar-buttons": number[];
  /**
   * Wave 4: one option ID per slot, `""` for an empty slot (a function strip, a cadence per phrase). Sent as
   * `answer.choice` in slot order, graded slot by slot.
   */
  "slot-choice": string[];
  "click-code": CodeRange | null;
  /** Engraved element ID (`oak-e12`). */
  "click-staff": string | null;
  /** Roll event ID. */
  "click-roll": string | null;
  /** Block IDs in the order placed (distractors may be left out). */
  order: string[];
  /** Blank ID → text. */
  blanks: Record<string, string>;
  hum: SungSummary[];
  /** `"same"` or `"different"`, as a one-item choice list. */
  "same-different": string[];
  slider: number | null;
  /**
   * Wave 5 (docs/design/wave5.md §11; the answers engineer builds the widgets): one label per section heard
   * (`"verse"`, or a letter), sent as `answer.sections`.
   *
   * Wave 6, `input: "map"` (the form map of CF-T and ladder L8): one entry per section the learner has cut, in
   * bar order, written `"<first bar>:<label>"` (`"1:A"`, `"9:A"`, `"17:"` for a section not named yet). The strip
   * always starts with a section at bar 1, so the empty value is `["1:"]` (`emptyValue`). Sent as
   * `answer.sections` (the labels) with `answer.bars` (the first bars). Read and write it with `formMapSections`
   * and `formMapValue` (form-map.ts); per-part marks and a reveal use the same shape (part = index in the value).
   */
  form: string[];
  /** Wave 5: one entry per bar — a numeral (`entry: "rn"`, `answer.rn`) or a code-spelled symbol (`answer.text`); `""` empty. */
  "bar-grid": string[];
  /**
   * Wave 5: MIDI notes picked on the keyboard (`answer.midi`) or degrees ticked on the pad (`answer.degrees`).
   * Wave 6, `from`: the builder opens holding that scale (`emptyValue` gives it), and the learner moves one note.
   */
  "scale-builder": (number | string)[];
}
export type AnswerValue<K extends AnswerKind = AnswerKind> = AnswerValueMap[K];

/** Per-part marks of a checked answer: slot, block, blank, cell or note index → right or wrong. */
export interface PartMark {
  /** Index into the value (slot, block position, note), or a blank/choice ID. */
  part: number | string;
  ok: boolean;
  /** Short learner-facing text for this part, already redacted to the rung ("not this one"). */
  note?: string;
}

export type AnswerFeedback =
  | { state: "idle" }
  /** A check is running: the widget is disabled and shows a calm busy state. */
  | { state: "pending" }
  | { state: "correct"; marks?: PartMark[] }
  | { state: "wrong"; marks?: PartMark[]; message?: Md }
  /** Rung 4 or a passed review: the correct answer is shown next to the learner's. */
  | { state: "revealed"; correct: AnswerValue; marks?: PartMark[] };
export type AnswerFeedbackState = AnswerFeedback["state"];

export interface AnswerWidgetProps<K extends AnswerKind = AnswerKind> {
  spec: AnswerSpecOf<K>;
  value: AnswerValue<K>;
  onChange(next: AnswerValue<K>): void;
  /** The learner asked to check (Enter or the host's Check button). */
  onSubmit(): void;
  disabled?: boolean;
  feedback: AnswerFeedback;
  /** Focus the first control on mount (drills and the active lesson step; never on page load elsewhere). */
  autoFocus?: boolean;
  /** Accessible name of the answer group ("Your answer: which degree?"). */
  label: string;
  /** Current hint rung, for widgets that show more structure at higher rungs (e.g. highlighted slots). */
  rung?: HintRung;
  /** Plays a choice's or a block's audition code through the shared adapter (`oak.ts`); absent = no audio. */
  audition?(code: string): void;
  /** Drill pads show syllables after U03.L08 (`profile.solfege`). */
  solfege?: "numbers" | "syllables";
  /** Stable ID prefix for labels and `aria-describedby`. */
  idBase: string;
}

export type AnswerWidget<K extends AnswerKind = AnswerKind> = ComponentType<AnswerWidgetProps<K>>;

/**
 * The registry the answers engineer implements in `app/src/answers/registry.tsx`:
 * `export const answerWidgetFor: AnswerWidgetFor = (spec) => …`. It returns `null` only for a kind that has
 * no widget yet, and the host then shows "This answer type isn't available yet" instead of a dead control.
 */
export type AnswerWidgetFor = <K extends AnswerKind>(spec: AnswerSpecOf<K>) => AnswerWidget<K> | null;

/** Keys a widget handles while focus is inside it (ux §7.10, Drills and Lesson rows). */
export const ANSWER_KEYS = {
  submit: "Enter",
  /** `1`–`9` pick the n-th choice or degree; `0` clears in number fields only. */
  pick: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
  /** Chromatic keyboard row (C to C'). */
  chromatic: ["A", "W", "S", "E", "D", "F", "T", "G", "Y", "H", "U", "J", "K"],
  /** Remove the last filled slot. */
  clear: "Backspace",
  /** Move a focused block or slot. */
  move: ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"],
  /** Tap pads only (`data-keyscope="tap"`). */
  tap: ["Space", "F", "J"],
} as const;

/** Kinds whose value is complete after one pick, so a drill may submit on pick (lessons never do). */
export const AUTO_SUBMIT_KINDS: readonly AnswerKind[] = [
  "choice",
  "degree-pad",
  "quality-pad",
  "same-different",
];

/** What `responseOf` produces: the wire shape stored with an attempt (`StepAttemptCreate.response`). */
export type WidgetResponse = AttemptResponse;
/** The answer part a grader `Answer` holds, for kinds graded by `gradeAnswer`. */
export type WidgetAnswer = Answer;
