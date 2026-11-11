// The AnswerWidget registry (docs/design/wave2.md §3.1): one component per answer kind. `staff-input` (writing new
// notes on a staff) is Wave 3 and returns null; the host then shows `<AnswerUnavailable>`.
import type { AnswerKind, AnswerSpecOf, AnswerWidget, AnswerWidgetFor, AnswerWidgetProps } from "./types.ts";
import { ChoiceAnswer } from "./widgets/Choice.tsx";
import { ClickRollAnswer, ClickStaffAnswer } from "./widgets/ClickMusic.tsx";
import { BlanksAnswer, ClickCodeAnswer, CodeAnswer } from "./widgets/CodeLike.tsx";
import { DegreePadAnswer } from "./widgets/DegreePad.tsx";
import { QualityPadAnswer, RnPaletteAnswer } from "./widgets/Harmony.tsx";
import { KeyboardAnswer } from "./widgets/KeyboardPick.tsx";
import { OrderAnswer } from "./widgets/Order.tsx";
import { RhythmGridAnswer } from "./widgets/RhythmGrid.tsx";
import { BarButtonsAnswer, HumAnswer, SameDifferentAnswer, SliderAnswer } from "./widgets/Simple.tsx";
import { SingCaptureAnswer } from "./widgets/SingCapture.tsx";
import { TapPadAnswer } from "./widgets/TapPad.tsx";
import { NumberAnswer, TextAnswer } from "./widgets/TextEntry.tsx";

type Registry = { [K in AnswerKind]: AnswerWidget<K> | null };

export const ANSWER_WIDGETS: Registry = {
  choice: ChoiceAnswer,
  "degree-pad": DegreePadAnswer,
  "quality-pad": QualityPadAnswer,
  "rn-palette": RnPaletteAnswer,
  text: TextAnswer,
  number: NumberAnswer,
  keyboard: KeyboardAnswer,
  "staff-input": null,
  grid: RhythmGridAnswer,
  code: CodeAnswer,
  tap: TapPadAnswer,
  mic: SingCaptureAnswer,
  "bar-buttons": BarButtonsAnswer,
  "click-code": ClickCodeAnswer,
  "click-staff": ClickStaffAnswer,
  "click-roll": ClickRollAnswer,
  order: OrderAnswer,
  blanks: BlanksAnswer,
  hum: HumAnswer,
  "same-different": SameDifferentAnswer,
  slider: SliderAnswer,
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
