// The session's own Make surfaces: the Quick sketch (after "Wrap up", or at the 15-minute split's midpoint:
// contracts §9.4), the Light session (the last lesson's Make with one new constraint, §7.9) and the Keep-alive's
// optional one-minute riff (§7.8 c). Each one is a compact workbench seeded with the code in hand, and one Save
// that writes a sketch. Saving is never blocked ("Save anyway"); a sketch counts for the day once it has run.
import type { SketchCreate } from "@oak/api";
import type { LintContext, UnlockableId } from "@oak/content-kit";
import type { EvalOutcome } from "@oak/strudel";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useLessonPublic } from "../../lesson/public.ts";
import {
  apiQuery,
  useBootstrap,
  useLessonPosition,
  useSketchCreate,
  useSketches,
} from "../../lib/queries.ts";
import { Button } from "../../ui/kit/Button.tsx";
import { Callout } from "../../ui/kit/Controls.tsx";
import { LoadingState } from "../../ui/kit/QueryState.tsx";
import { toast } from "../../ui/kit/Toast.tsx";
import "../../workbench/index.ts";
import { appWorkbenchServices } from "../../lib/workbench-services.ts";
import { ServicesGate } from "../../workbench/ServicesGate.tsx";
import { Workbench } from "../../workbench/Workbench.tsx";
import { sessionRunner } from "../live.ts";
import { currentSessionId, reportBlockDone, useSession } from "../store.ts";

/** A loop to start from when nothing else is in hand: drums, a I–V bass and a two-note melody in C. */
export const STARTER_RIFF = `setcpm(90/4)

drums: s("bd ~ sd ~, hh*8").gain(.8)
bass: note("c2 ~ c2 ~ g2 ~ g2 ~").s("sawtooth").lpf(600).gain(.6)
mel: note("<[e4 g4] [d4 ~] [c4 e4] [d4 ~]>").s("triangle")`;

export type SketchMode = "quick" | "light" | "riff";

const COPY: Record<SketchMode, { title: string; body: string; save: string }> = {
  quick: {
    title: "Quick sketch",
    body: "Save the loop you have now as a sketch. Change one thing first if you like: a note, a rest, the tempo.",
    save: "Save sketch",
  },
  light: {
    title: "Light session",
    body: "The Make of a lesson you know, with one new idea. Run it, change it, save it.",
    save: "Save sketch",
  },
  riff: {
    title: "Riff of the day",
    body: "One minute, one small change: a note, a drum, the tempo. Or skip it; today already counts.",
    save: "Save riff",
  },
};

/** The code a sketch block starts from: the lesson's editor, a given seed, the last sketch, or the starter. */
export function seedCode(lessonCode: string | null | undefined, seed: string | null | undefined): string {
  if (lessonCode?.trim()) return lessonCode;
  if (seed?.trim()) return seed;
  return STARTER_RIFF;
}

/** The code of the learner's latest sketch (from this lesson when there is one), once it is known. */
function useLastSketchCode(preferOrigin: string | null): { code: string | null; ready: boolean } {
  const list = useSketches();
  const items = list.data?.items ?? [];
  const pick = (preferOrigin ? items.find((s) => s.originId === preferOrigin) : undefined) ?? items[0];
  const detail = useQuery({
    ...apiQuery("sketches.get", { params: { id: pick?.id ?? "" } }),
    enabled: !!pick,
  });
  if (list.isPending) return { code: null, ready: false };
  if (!pick || list.isError) return { code: null, ready: true };
  if (detail.isPending) return { code: null, ready: false };
  const d = detail.data;
  const v = d?.versions.find((x) => x.version === d.currentVersion) ?? d?.versions.at(-1);
  return { code: v && !v.flags.reviewBeforeRun ? v.code : null, ready: true };
}

export function SketchBlock({
  mode,
  lessonId = null,
  constraint = null,
}: {
  mode: SketchMode;
  lessonId?: string | null;
  constraint?: string | null;
}) {
  const boot = useBootstrap();
  const lessonCode = useLessonPublic((s) =>
    s.lesson && (!lessonId || s.lesson.lessonId === lessonId) ? s.lesson.code : null,
  );
  const last = useLastSketchCode(lessonId);
  const create = useSketchCreate();
  const position = useLessonPosition();
  const wrappedEarly = useSession((s) => s.wrappedEarly);
  const plan = useSession((s) => s.plan);
  const [code, setCode] = useState<string | null>(null);
  const [ranOk, setRanOk] = useState(false);
  // The seed is fixed once known: a later change of the Workbench's `code` prop would replace the editor text.
  const seed = useRef<string | null>(null);
  if (seed.current === null && (last.ready || lessonCode))
    seed.current = seedCode(mode === "riff" ? null : lessonCode, last.code);
  const initial = seed.current;
  const current = code ?? initial ?? STARTER_RIFF;
  const copy = COPY[mode];

  const unlocked = new Set((boot.data?.unlocks ?? []).map((u) => u.itemId as UnlockableId));
  const lint: LintContext = { profile: "studio", unlocked, allowPreview: true, meter: "4/4", key: null };
  const lessonCtx = { key: null, meter: "4/4" as const, defaultBpm: 90, loopBars: 4 };

  const save = async () => {
    const sessionId = currentSessionId();
    const body: SketchCreate = {
      title: mode === "riff" ? "Riff of the day" : mode === "light" ? "Light session" : "Quick sketch",
      originKind: mode === "riff" ? "keepalive" : lessonId ? "lesson-make" : "free",
      originId: lessonId,
      sessionId,
      code: current,
      bpm: null,
      meter: null,
      key: null,
      analysis: null,
      note: constraint,
      tutorAssisted: false,
      band: null,
      flags: { lockedTools: [], previewTools: [] },
      ranOk,
    };
    try {
      const saved = await create.mutateAsync({ body });
      const sketchId = saved.sketch.id;
      // "Wrap up" in a lesson: the lesson stays in progress and resumes at its step next time (contracts §9.4).
      const snap = useLessonPublic.getState().lesson;
      if (
        mode === "quick" &&
        lessonId &&
        snap &&
        snap.lessonId === lessonId &&
        (wrappedEarly || plan?.main?.splitPart === "A")
      )
        position
          .mutateAsync({
            params: { id: lessonId },
            body: { sessionId, stepId: snap.stepId, splitPart: snap.splitPart, wrapped: wrappedEarly },
          })
          .catch(() => {});
      if (mode === "light" && lessonId)
        reportBlockDone({ block: "new", source: "light", itemId: lessonId, completed: true });
      reportBlockDone({ block: "make", source: mode === "light" ? "lesson" : "quick-sketch", sketchId });
    } catch (e) {
      toast.error("The sketch didn't save", e instanceof Error ? e.message : undefined);
    }
  };

  return (
    <section aria-labelledby="sketch-h" className="flex flex-col gap-3" data-testid={`sketch-block-${mode}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="sketch-h" className="text-h2">
            {copy.title}
          </h2>
          <p className="max-w-[70ch] text-text-2">{copy.body}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {mode === "riff" && (
            <Button variant="ghost" onClick={() => sessionRunner.toCoda()} data-testid="skip-riff">
              Skip the riff
            </Button>
          )}
          <Button
            variant="primary"
            onClick={() => void save()}
            loading={create.isPending}
            data-testid="save-sketch"
          >
            {ranOk ? copy.save : `${copy.save} anyway`}
          </Button>
        </div>
      </div>
      {constraint && (
        <Callout tone="info" title="Today's new idea">
          {constraint}
        </Callout>
      )}
      {initial === null ? (
        <LoadingState rows={3} label="Opening the editor" />
      ) : (
        <ServicesGate load={appWorkbenchServices} auto>
          <Workbench
            id={`session-${mode}`}
            code={initial}
            lessonCtx={lessonCtx}
            lint={lint}
            views={["roll"]}
            variant="compact"
            onChange={(c) => setCode(c)}
            onEvaluated={(o: EvalOutcome) => {
              if (o.ok) setRanOk(true);
            }}
          />
        </ServicesGate>
      )}
      {!ranOk && (
        <p className="text-sm text-text-3">
          Run it once (Ctrl+Enter) to hear it; a sketch that has run counts for today.
        </p>
      )}
    </section>
  );
}
