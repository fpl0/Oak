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
//
// Wave 7 (docs/design/wave7.md §11): `grouping` (an odd-meter bar cut into 2s and 3s) and `euclid` (k, n, r with
// the ring live) are new kinds. The rest are the same kinds drawn for the tracks: a jazz chord symbol (`text` with
// `normalize: "chord"` and `jazz`), the voicing builder (a chord keyboard or a chord staff with
// `AnswerEnv.harmony.voicing`), the clave pick, the tension pick and the A/B sound pick (a `choice` whose options
// are `CLAVE_OPTIONS`, `TENSION_OPTIONS` or a `SOUND_COMPARE_OPTIONS` pair), the register map (a `slot-choice` of
// register bands), two-lane taps (`AnswerEnv.tap.lanes`), the numerals' jazz row (`AnswerEnv.harmony.jazz`) and the
// sliders that play (`slider` with `play`).

import { useAnswerEnv } from "./env.tsx";
import { staffChordMidis } from "./jazz.ts";
import { IntervalAnswer } from "./keys/IntervalAnswer.tsx";
import { KeyAnswer } from "./keys/KeyAnswer.tsx";
import { isClaveChoice } from "./rhythm7.ts";
import { comparePairOf, isRegisterChoice } from "./sound7.ts";
import { StaffInputAnswer } from "./staff/StaffInput.tsx";
import type { AnswerKind, AnswerSpecOf, AnswerWidget, AnswerWidgetFor, AnswerWidgetProps } from "./types.ts";
import { BarGridAnswer } from "./widgets/BarGrid.tsx";
import { ChoiceAnswer } from "./widgets/Choice.tsx";
import { ChordNameAnswer } from "./widgets/ChordName.tsx";
import { ClavePickAnswer } from "./widgets/ClavePick.tsx";
import { ClickRollAnswer, ClickStaffAnswer } from "./widgets/ClickMusic.tsx";
import { BlanksAnswer, ClickCodeAnswer, CodeAnswer } from "./widgets/CodeLike.tsx";
import { CompareABAnswer } from "./widgets/CompareAB.tsx";
import { DegreePadAnswer } from "./widgets/DegreePad.tsx";
import { EuclidAnswer } from "./widgets/Euclid.tsx";
import { FormAnswer } from "./widgets/Form.tsx";
import { GroupingAnswer } from "./widgets/Grouping.tsx";
import { QualityPadAnswer, RnPaletteAnswer } from "./widgets/Harmony.tsx";
import { JazzChordAnswer } from "./widgets/JazzChord.tsx";
import { KeyboardAnswer } from "./widgets/KeyboardPick.tsx";
import { OrderAnswer } from "./widgets/Order.tsx";
import { RegisterMapAnswer } from "./widgets/RegisterMap.tsx";
import { RhythmGridAnswer } from "./widgets/RhythmGrid.tsx";
import { ScaleBuilderAnswer } from "./widgets/ScaleBuilder.tsx";
import { BarButtonsAnswer, HumAnswer, SameDifferentAnswer, SliderAnswer } from "./widgets/Simple.tsx";
import { SingCaptureAnswer } from "./widgets/SingCapture.tsx";
import { SlotChoiceAnswer } from "./widgets/SlotChoice.tsx";
import { TapPadAnswer } from "./widgets/TapPad.tsx";
import { isTensionChoice, TensionPickAnswer } from "./widgets/TensionPick.tsx";
import { NumberAnswer, TextAnswer } from "./widgets/TextEntry.tsx";
import { VoicingLine } from "./widgets/VoicingLine.tsx";

type Registry = { [K in AnswerKind]: AnswerWidget<K> | null };

/** Text answers: an interval gets the number-then-quality pad, a key the circle of fifths, the rest a text field. */
function TextKindAnswer(p: AnswerWidgetProps<"text">) {
  if (p.spec.normalize === "interval") return <IntervalAnswer {...p} />;
  if (p.spec.normalize === "key") return <KeyAnswer {...p} />;
  if (p.spec.normalize === "chord" && p.spec.jazz) return <JazzChordAnswer {...p} />;
  if (p.spec.normalize === "chord") return <ChordNameAnswer {...p} />;
  return <TextAnswer {...p} />;
}

/** A single choice among claves, tensions or an A/B sound pair gets its own drawing; the rest the choice cards. */
function ChoiceKindAnswer(p: AnswerWidgetProps<"choice">) {
  if (!p.spec.multi) {
    if (isClaveChoice(p.spec.options)) return <ClavePickAnswer {...p} />;
    if (isTensionChoice(p.spec.options)) return <TensionPickAnswer {...p} />;
    const pair = comparePairOf(p.spec.options);
    if (pair) return <CompareABAnswer {...p} pair={pair} />;
  }
  return <ChoiceAnswer {...p} />;
}

/** A slot strip of register bands is the register map. */
function SlotChoiceKindAnswer(p: AnswerWidgetProps<"slot-choice">) {
  if (isRegisterChoice(p.spec.options)) return <RegisterMapAnswer {...p} />;
  return <SlotChoiceAnswer {...p} />;
}

/** A chord staff with a voicing to build (`staff-expect.voicing`) says what each written chord is as a voicing. */
function StaffKindAnswer(p: AnswerWidgetProps<"staff-input">) {
  const env = useAnswerEnv();
  const v = env.harmony?.voicing;
  if (!v || !p.spec.palette.chords) return <StaffInputAnswer {...p} />;
  const chords = staffChordMidis(p.value, env.staff?.meter);
  const symbolAt = (i: number) =>
    typeof v.symbol === "string" ? v.symbol : (v.symbol[i] ?? v.symbol[v.symbol.length - 1] ?? "");
  const count = typeof v.symbol === "string" ? Math.max(1, chords.length) : v.symbol.length;
  return (
    <div className="flex min-w-0 flex-col gap-1" data-staff-voicing>
      <StaffInputAnswer {...p} />
      <div className="flex flex-col">
        {Array.from({ length: count }, (_, i) => (
          <VoicingLine
            key={i}
            midis={chords[i] ?? []}
            symbol={symbolAt(i)}
            feedback={p.feedback}
            index={i + 1}
          />
        ))}
      </div>
    </div>
  );
}

export const ANSWER_WIDGETS: Registry = {
  // Wave 7 (docs/design/wave7.md §11): an odd-meter grouping and a Euclidean rhythm's numbers.
  grouping: GroupingAnswer,
  euclid: EuclidAnswer,
  choice: ChoiceKindAnswer,
  "degree-pad": DegreePadAnswer,
  "quality-pad": QualityPadAnswer,
  "rn-palette": RnPaletteAnswer,
  text: TextKindAnswer,
  number: NumberAnswer,
  keyboard: KeyboardAnswer,
  "staff-input": StaffKindAnswer,
  grid: RhythmGridAnswer,
  code: CodeAnswer,
  tap: TapPadAnswer,
  mic: SingCaptureAnswer,
  "bar-buttons": BarButtonsAnswer,
  "slot-choice": SlotChoiceKindAnswer,
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
