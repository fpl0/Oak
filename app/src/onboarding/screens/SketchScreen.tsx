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
import { Workbench } from "../../workbench/index.ts";
import { LOOP_BPM, melodyRange } from "../loop.ts";
import { LOOP_LESSON_CTX, ONBOARDING_LINT, U00_LINT } from "../services.ts";

export const SKETCH_TITLE = "Sketch 001";

export function SketchScreen({
  code: initial,
  sketchId,
  heard = false,
  onSaved,
}: {
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
      toast.success(`${SKETCH_TITLE} saved`, "It's in your sketchbook in Studio.");
      onSaved(saved.sketch.id);
    } catch (e) {
      toast.error("The sketch wasn't saved", e instanceof Error ? e.message : undefined);
    }
  };

  return (
    <section className="flex flex-col gap-4" data-testid="screen-sketch" aria-labelledby="sketch-title">
      <header className="flex flex-col gap-1.5">
        <h1 id="sketch-title" className="text-h1 outline-none" tabIndex={-1}>
          Make it yours
        </h1>
        <p className="max-w-measure text-text-2">
          Change anything in the melody's pattern: numbers from 0 to 7, a <span className="font-mono">~</span>{" "}
          for a rest. Run it with <Kbd>{mod}</Kbd> <Kbd>Enter</Kbd>, then save it as {SKETCH_TITLE}. Every
          session ends with a sketch like this one.
        </p>
      </header>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          onClick={() => void save()}
          loading={create.isPending || addVersion.isPending}
          icon={<Save aria-hidden className="size-4" />}
          data-testid="sketch-save"
        >
          {sketchId ? `Save ${SKETCH_TITLE} again` : `Save as ${SKETCH_TITLE}`}
        </Button>
        {!ranOk && <span className="text-sm text-text-3">Run it once to hear your version first.</span>}
      </div>
      {silent && (
        <Callout tone="attention" title="The loop runs, but it plays no notes">
          You can still save it; or undo with {mod}+Z to bring the melody back.
        </Callout>
      )}
      <Workbench
        id="onb-sketch"
        code={code}
        lessonCtx={LOOP_LESSON_CTX}
        lint={ONBOARDING_LINT}
        unit="U00"
        views={["roll"]}
        variant="compact"
        roll={{ color: "part", labels: "none" }}
        readOnly={ro.current}
        onChange={setCode}
        onEvaluated={onEvaluated}
      />
    </section>
  );
}
