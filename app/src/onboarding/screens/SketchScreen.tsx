// `onb.sketch` (ux §8, contracts §2.3 U00.L01): "Make it yours: change anything in the melody, then save." Saves
// Sketch 001 to the sketchbook (origin: U00.L01's Make). Saving is never blocked; a loop that stopped making
// sound is pointed out, not refused.
import type { SketchCreate } from "@oak/api";
import type { LintResult } from "@oak/content-kit";
import type { EvalOutcome } from "@oak/strudel";
import { Save } from "lucide-react";
import { useRef, useState } from "react";
import { lintInBrowser } from "../../lib/grader-client.ts";
import { useSketchAddVersion, useSketchCreate } from "../../lib/queries.ts";
import { Button } from "../../ui/kit/Button.tsx";
import { Kbd } from "../../ui/kit/basics.tsx";
import { Callout } from "../../ui/kit/Controls.tsx";
import { toast } from "../../ui/kit/Toast.tsx";
import { PartActions, type PartBack, PartFrame, StatusSlot } from "../../voice/parts/common.tsx";
import { Workbench } from "../../workbench/index.ts";
import { LOOP_BPM, melodyRange } from "../loop.ts";
import { LOOP_LESSON_CTX, ONBOARDING_LINT, U00_LINT } from "../services.ts";

export const SKETCH_TITLE = "Sketch 001";

export function SketchScreen({
  code: initial,
  sketchId,
  heard = false,
  onSaved,
  back,
}: {
  back?: PartBack | null;
  code: string;
  sketchId: string | null;
  /**
   * The learner's version already ran and was heard (the edit and reaction screens play exactly this code). It
   * counts as the successful Run a saved sketch needs to make the day a qualifying one (contracts §7.8, qualifying day (b)):
   * without it, saving straight away left the onboarding day off the week strip.
   */
  heard?: boolean;
  onSaved(sketchId: string): void;
}) {
  const [code, setCode] = useState(initial);
  const [ranOk, setRanOk] = useState(heard);
  const [silent, setSilent] = useState(false);
  const [saveError, setSaveError] = useState<{ text: string; n: number } | null>(null);
  const ro = useRef<true | { editable: { from: number; to: number }[] } | null>(null);
  if (ro.current === null) {
    const r = melodyRange(initial);
    ro.current = r ? { editable: [r] } : true;
  }
  const create = useSketchCreate();
  const addVersion = useSketchAddVersion();
  const mod = typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "⌘" : "Ctrl";

  const onEvaluated = (o: EvalOutcome) => {
    if (!o.ok) return;
    setRanOk(true);
    setSilent(o.diagnostics.some((d) => d.id === "eval.silent"));
  };

  const save = async () => {
    setSaveError(null);
    let lint: LintResult | null = null;
    try {
      lint = await lintInBrowser(code, U00_LINT);
    } catch {
      lint = null;
    }
    const version = {
      code,
      bpm: LOOP_BPM,
      meter: "4/4" as const,
      key: { tonic: "C" as const, mode: "major" as const },
      analysis: null,
      note: null,
      tutorAssisted: false,
      band: null,
      flags: { lockedTools: [], previewTools: lint ? [...lint.lockedTools] : [] },
      ranOk,
    } satisfies Omit<SketchCreate, "title" | "originKind" | "originId" | "sessionId">;
    try {
      const saved = sketchId
        ? await addVersion.mutateAsync({ params: { id: sketchId }, body: { sessionId: null, ...version } })
        : await create.mutateAsync({
            body: {
              title: SKETCH_TITLE,
              originKind: "lesson-make",
              originId: "U00.L01",
              sessionId: null,
              ...version,
            },
          });
      // No toast: the coda says where it is, and a toast would sit over the footer's primary.
      onSaved(saved.sketch.id);
    } catch (e) {
      const text = e instanceof Error ? e.message : "Oak couldn't reach its server.";
      toast.error("The sketch wasn't saved", text);
      setSaveError((p) => ({ text, n: (p?.n ?? 0) + 1 }));
    }
  };

  const pending = create.isPending || addVersion.isPending;
  return (
    <PartFrame
      testId="screen-sketch"
      context="onboarding"
      title={SKETCH_TITLE}
      instruction={`Change anything in the melody, run it, then save it as ${SKETCH_TITLE}.`}
      lead={
        <>
          Numbers from 0 to 7 are notes, a <span className="font-mono">~</span> is a rest. Run it with{" "}
          <Kbd>{mod}</Kbd> <Kbd>Enter</Kbd>. Every session ends with a sketch like this one.
        </>
      }
    >
      <Workbench
        id="onb-sketch"
        code={code}
        lessonCtx={LOOP_LESSON_CTX}
        lint={ONBOARDING_LINT}
        unit="U00"
        views={["roll"]}
        variant="compact"
        roll={{ color: "part", labels: "none" }}
        lenses={null}
        readOnly={ro.current}
        onChange={setCode}
        onEvaluated={onEvaluated}
      />
      <StatusSlot>
        {silent && (
          <Callout tone="attention" title="The loop runs, but it plays no notes">
            You can still save it; or undo with {mod}+Z to bring the melody back.
          </Callout>
        )}
        {saveError && (
          <Callout tone="issue" title="The sketch wasn't saved">
            {saveError.text}
          </Callout>
        )}
        {!ranOk && !saveError && (
          <p className="text-sm text-text-3">Run it once to hear your version first.</p>
        )}
      </StatusSlot>
      <PartActions
        context="onboarding"
        back={back}
        resultKey={saveError ? `save-error-${saveError.n}` : null}
        onRetry={saveError ? () => void save() : null}
        retryDisabled={pending}
        onContinue={null}
        testId="sketch-actions"
        action={
          saveError ? null : (
            <Button
              variant="primary"
              onClick={() => void save()}
              loading={pending}
              icon={<Save aria-hidden className="size-4" />}
              data-testid="sketch-save"
            >
              {sketchId ? `Save ${SKETCH_TITLE} again` : `Save as ${SKETCH_TITLE}`}
            </Button>
          )
        }
      />
    </PartFrame>
  );
}
