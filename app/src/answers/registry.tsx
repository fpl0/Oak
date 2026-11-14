// The AnswerWidget registry (docs/design/wave2.md §3.1): one component per answer kind. Wave 6 added no kind: the
// same widgets take the new fields (ties, dots and triplets on the staff, 6- and 24-step grids, numerals with
// applied chords and a key per slot, `form` with `input: "map"`, `scale-builder` with `from`) and what the host
// tells them through `AnswerEnv` (the meter, a key change, a guide-tone chord). Wave 5: `form` (a timeline
// of sections to label, or cards to order), `bar-grid` (a chord chart, a numeral or symbol per bar) and
// `scale-builder` (a scale's notes on a keyboard or a degree pad). Wave 4: a `chord` text answer
// gets the chord-name picker; `slot-choice` is the slot strip (function, cadence). Wave 3: `staff-input` is the
// staff (notes, or a key signature with `mode: "key-signature"`); a `text` answer read as an interval or a key gets
// the interval pad or the circle of fifths, each with its forgiving text field. A kind without a widget returns
// null and the host shows `<AnswerUnavailable>`.
import { IntervalAnswer } from "./keys/IntervalAnswer.tsx";
import { KeyAnswer } from "./keys/KeyAnswer.tsx";
import { StaffInputAnswer } from "./staff/StaffInput.tsx";
import type { AnswerKind, AnswerSpecOf, AnswerWidget, AnswerWidgetFor, AnswerWidgetProps } from "./types.ts";
import { BarGridAnswer } from "./widgets/BarGrid.tsx";
import { ChoiceAnswer } from "./widgets/Choice.tsx";
import { ChordNameAnswer } from "./widgets/ChordName.tsx";
import { ClickRollAnswer, ClickStaffAnswer } from "./widgets/ClickMusic.tsx";
import { BlanksAnswer, ClickCodeAnswer, CodeAnswer } from "./widgets/CodeLike.tsx";
import { DegreePadAnswer } from "./widgets/DegreePad.tsx";
import { FormAnswer } from "./widgets/Form.tsx";
import { QualityPadAnswer, RnPaletteAnswer } from "./widgets/Harmony.tsx";
import { KeyboardAnswer } from "./widgets/KeyboardPick.tsx";
import { OrderAnswer } from "./widgets/Order.tsx";
import { RhythmGridAnswer } from "./widgets/RhythmGrid.tsx";
import { ScaleBuilderAnswer } from "./widgets/ScaleBuilder.tsx";
import { BarButtonsAnswer, HumAnswer, SameDifferentAnswer, SliderAnswer } from "./widgets/Simple.tsx";
import { SingCaptureAnswer } from "./widgets/SingCapture.tsx";
import { SlotChoiceAnswer } from "./widgets/SlotChoice.tsx";
import { TapPadAnswer } from "./widgets/TapPad.tsx";
import { NumberAnswer, TextAnswer } from "./widgets/TextEntry.tsx";

type Registry = { [K in AnswerKind]: AnswerWidget<K> | null };

/** Text answers: an interval gets the number-then-quality pad, a key the circle of fifths, the rest a text field. */
function TextKindAnswer(p: AnswerWidgetProps<"text">) {
  if (p.spec.normalize === "interval") return <IntervalAnswer {...p} />;
  if (p.spec.normalize === "key") return <KeyAnswer {...p} />;
  if (p.spec.normalize === "chord") return <ChordNameAnswer {...p} />;
  return <TextAnswer {...p} />;
}

export const ANSWER_WIDGETS: Registry = {
  choice: ChoiceAnswer,
  "degree-pad": DegreePadAnswer,
  "quality-pad": QualityPadAnswer,
  "rn-palette": RnPaletteAnswer,
  text: TextKindAnswer,
  number: NumberAnswer,
  keyboard: KeyboardAnswer,
  "staff-input": StaffInputAnswer,
  grid: RhythmGridAnswer,
  code: CodeAnswer,
  tap: TapPadAnswer,
  mic: SingCaptureAnswer,
  "bar-buttons": BarButtonsAnswer,
  "slot-choice": SlotChoiceAnswer,
  "click-code": ClickCodeAnswer,
  "click-staff": ClickStaffAnswer,
  "click-roll": ClickRollAnswer,
  order: OrderAnswer,
  blanks: BlanksAnswer,
  hum: HumAnswer,
  "same-different": SameDifferentAnswer,
  slider: SliderAnswer,
  // Wave 5 kinds (docs/design/wave5.md §11): the form strip, the chord chart, the scale builder.
  form: FormAnswer,
  "bar-grid": BarGridAnswer,
  "scale-builder": ScaleBuilderAnswer,
};

export const answerWidgetFor: AnswerWidgetFor = <K extends AnswerKind>(spec: AnswerSpecOf<K>) =>
  (ANSWER_WIDGETS[spec.ui as K] ?? null) as AnswerWidget<K> | null;

/** What a host shows for a kind without a widget (never a dead control). */
export function AnswerUnavailable({ label }: { label: string }) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a styled custom control with roving focus (ux §7.9); native radios and fieldsets cannot take this layout
    <div
      role="group"
      aria-label={label}
      className="rounded-card border border-dashed border-border p-3 text-sm text-text-2"
    >
      This answer type isn't available yet. Continue to the next step; nothing is lost.
    </div>
  );
}

/** Renders any answer through the registry, or `AnswerUnavailable`. */
export function AnswerView<K extends AnswerKind>(props: AnswerWidgetProps<K>) {
  const W = answerWidgetFor(props.spec);
  if (!W) return <AnswerUnavailable label={props.label} />;
  return <W {...props} />;
}
