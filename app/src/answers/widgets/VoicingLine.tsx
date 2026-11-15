// The voicing builder's readout (Wave 7, features `keyboard.voicing` and `staff-expect.voicing`; J1.L05 shells,
// J3.L01 rootless A and B, J3.L02 drop-2): what the keys picked, or each chord written on the staff, is as a
// voicing of the chord the step names: every note's role and the shape ("D3 F3 C4: root, 3rd, 7th. A shell
// voicing of Dm7."), read octave-aware by the same definition the grader grades with. Live with the VOICINGS lens
// on; otherwise once the answer is checked, so a step that asks the learner to find the shape is not answered by
// the label. Reserved height: the line never moves what is under it.

import type { VoicingShape } from "@oak/content-kit";
import { clsx } from "clsx";
import { useAnswerEnv } from "../env.tsx";
import { VOICING_SHAPE_TEXT, voicingReadout } from "../jazz.ts";
import type { AnswerFeedback } from "../types.ts";

/** Whether the readout shows now: live with the lens, else after a check. */
export function voicingLive(lens: boolean | undefined, feedback: AnswerFeedback): boolean {
  return lens === true || (feedback.state !== "idle" && feedback.state !== "pending");
}

const shapeList = (shape: VoicingShape | readonly VoicingShape[] | undefined): string =>
  shape === undefined
    ? ""
    : (typeof shape === "string" ? [shape] : [...shape]).map((s) => VOICING_SHAPE_TEXT[s].name).join(" or ");

/** One chord's readout line (keyboard: the keys held; staff: one written chord). */
export function VoicingLine({
  midis,
  symbol,
  feedback,
  index,
}: {
  midis: readonly number[];
  symbol: string;
  feedback: AnswerFeedback;
  /** The chord's place on a staff (1-based), or none on the keyboard. */
  index?: number;
}) {
  const env = useAnswerEnv();
  const v = env.harmony?.voicing;
  const live = voicingLive(env.lenses?.voicings, feedback);
  const read = v && live && midis.length > 0 ? voicingReadout(midis, symbol, v.shape) : null;
  return (
    <p
      className="min-h-6 text-sm text-text-2"
      aria-live="polite"
      data-testid="voicing-line"
      data-shape={read?.shape ?? undefined}
    >
      {read ? (
        <>
          {index !== undefined ? <span className="text-text-3">Chord {index}: </span> : null}
          <span className={clsx(read.shape && "font-medium text-text")}>{read.text}</span>
        </>
      ) : v && !live && midis.length > 0 ? (
        <span className="text-text-3">
          {index !== undefined ? `Chord ${index}: ` : ""}Oak names the voicing once you check.
        </span>
      ) : null}
    </p>
  );
}

/** What the step asks for, in words, for the host's prompt or the reveal: "a shell voicing of Dm7". */
export function voicingAsk(
  symbol: string,
  shape: VoicingShape | readonly VoicingShape[] | undefined,
): string {
  const list = shapeList(shape);
  return list ? `${list} of ${symbol}` : symbol;
}
