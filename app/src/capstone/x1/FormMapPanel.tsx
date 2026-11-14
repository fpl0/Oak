// CF-T.S1's form map in the capstone workspace (content/specs/CF.md "The form map"): the 32 numbered bars of the
// chorus, cut into sections and named by the learner, then checked. The strip itself is the transcribe engineer's
// (`FormMapStrip`: a click on a bar line cuts, a letter names; arrows, Enter and letters from the keyboard); this
// panel holds the learner's map (kept in this browser between visits), runs the check, says which section to
// listen to again without giving the answer, and, once the map has passed or been shown, becomes the tune's
// sections: each a button that loops it.
import { useEffect, useState } from "react";
import { FormMapStrip } from "../../transcribe/FormMap.tsx";
import {
  emptyFormMap,
  type FormMap,
  type FormSection,
  formMapProblem,
  formMarks,
  formSummary,
  formVerdict,
  readFormDraft,
  writeFormDraft,
} from "../../transcribe/form-map.ts";
import { Button } from "../../ui/kit/Button.tsx";
import type { FormMapFeedback } from "./cft.ts";
import type { LocalCheck } from "./phrases.ts";

export function FormMapPanel({
  storeId,
  bars,
  pickup,
  state,
  known,
  feedback,
  busy,
  onCheck,
  onReveal,
  onSection,
}: {
  /** Where this browser keeps the learner's cuts and names (the capstone and its draft). */
  storeId: string;
  bars: number;
  pickup: boolean;
  state: LocalCheck;
  /** The song's own map, shown once the check was revealed (never before). */
  known: FormMap | null;
  /** The last check of this sitting. */
  feedback: FormMapFeedback | null;
  busy: boolean;
  onCheck(map: FormMap): void;
  onReveal(map: FormMap): void;
  /** A section of the settled map was chosen: loop its bars (1-based, inclusive). */
  onSection(from: number, to: number): void;
}) {
  const [map, setMap] = useState<FormMap>(() => readFormDraft(storeId, bars) ?? emptyFormMap(bars));
  useEffect(() => writeFormDraft(storeId, map), [storeId, map]);
  const [confirming, setConfirming] = useState(false);
  const settled = state.passed || state.revealed;
  // Passed: the learner's own map is the tune's. Revealed: the song's.
  // A map passed on another device (or before this browser kept drafts) is not here: the song's own stands in
  // for it, as a passed map is the song's by shape.
  const blank = map.labels.every((l) => !l);
  const shown = settled && known && ((state.revealed && !state.passed) || blank) ? known : map;
  const problem = settled ? null : formMapProblem(map);
  const marks = !settled && feedback ? formMarks(feedback.result, feedback.map) : null;
  const loop = (s: FormSection) => onSection(s.from, s.to);
  return (
    <section aria-labelledby="cft-form" className="flex flex-col gap-2" data-testid="cft-form-map">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h2 id="cft-form" className="font-sans text-sm font-semibold text-text-2">
          The form
        </h2>
        <p
          className="text-sm text-text-2"
          data-testid="cft-form-state"
          data-state={settled ? (state.passed ? "passed" : "revealed") : "open"}
        >
          {settled
            ? state.passed
              ? `Mapped by ear: ${formSummary(shown)}. Select a section to loop it.`
              : `Shown: ${formSummary(shown)}. It is named in the liner notes.`
            : "Listen through, then cut the bars into sections and name them. Where does the tune start again?"}
        </p>
      </div>
      <FormMapStrip
        map={shown}
        {...(settled ? {} : { onChange: setMap })}
        pickup={pickup}
        marks={marks}
        onSection={loop}
        label={settled ? "The tune's sections" : "The form map: cut and name the sections"}
      />
      {!settled && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            loading={busy}
            disabled={problem !== null}
            onClick={() => onCheck(map)}
            data-testid="cft-form-check"
          >
            Check the form
          </Button>
          {state.attempts >= 2 &&
            (confirming ? (
              <>
                <span className="text-sm text-text-2">
                  Show the form? It then counts as shown, not heard.
                </span>
                <Button size="sm" onClick={() => onReveal(map)} data-testid="cft-form-reveal-confirm">
                  Show it
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                  Keep listening
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirming(true)}
                data-testid="cft-form-reveal"
              >
                Show the form
              </Button>
            ))}
          {problem && (
            <span className="text-sm text-text-2" data-testid="cft-form-problem">
              {problem}
            </span>
          )}
        </div>
      )}
      {feedback && !state.passed && !state.revealed && (
        <div
          role="status"
          className="rounded-control bg-surface-2/60 px-2.5 py-1.5 text-sm"
          data-testid="cft-form-feedback"
        >
          <p>{formVerdict(feedback, feedback.map)}</p>
          {feedback.result.messages.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-text-2">
              {feedback.result.messages.map((m) => (
                <li key={m.text}>{m.text}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
