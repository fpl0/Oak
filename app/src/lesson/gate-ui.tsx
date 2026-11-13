// The voicing gate on screen (contracts §3.1 rule 6, ux §1.4 unlock moments): the gate box under U05.L07's
// hand-voiced cadence and U05.L08's second chance (where the learner stands against 90 %, what to fix, that a
// reveal does not count), and the unlock moment once it is met: the learner's own hand voicing next to the one
// Strudel's `.voicing()` picks for the same chords, both on the staff and playable. The chords are read from the
// learner's code by the grader's harmony view (`harmonyView`), never from a table here.
import type { GradeResult, KeySpec, MeterId } from "@oak/api";
import { harmonyView, normalize } from "@oak/grader";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { VOICING_GATE } from "../../../content/toolbox.ts";
import { callApi } from "../lib/api.ts";
import { auditionCode } from "../lib/audition.ts";
import { analyzeCode } from "../lib/grader-client.ts";
import { Button } from "../ui/kit/Button.tsx";
import { shapeOf, summaryOf, viewFor } from "./feedback.ts";
import { InlineMd, useStepHost } from "./frame.tsx";
import { type GateRule, type GateState, gateLine, isGateExercise } from "./gate.ts";
import { chordPatternOf } from "./harmony.ts";
import { globalExerciseId } from "./model.ts";
import { CodeMusic } from "./music.tsx";
import { isNotImplemented } from "./server.ts";

/** The content's rule (`VOICING_GATE`), the fallback when the server has not answered. */
export const CONTENT_GATE: GateRule = {
  exercise: VOICING_GATE.exercise,
  variants: VOICING_GATE.variants,
  minScore: VOICING_GATE.minScore,
};

/** Whether a lesson holds the gate check or its second chance (U05.L07, U05.L08). */
export function lessonHasGate(
  def: {
    id: string;
    steps: readonly { gateCheck?: true; exercise?: { id: string } | undefined }[];
  },
  rule: GateRule = CONTENT_GATE,
): boolean {
  return def.steps.some(
    (s) =>
      s.gateCheck === true ||
      (s.exercise !== undefined && isGateExercise(rule, `${def.id}/${s.exercise.id}`)),
  );
}

const lessonOf = (globalId: string) => globalId.split("/")[0] ?? "";

/**
 * The gate for a lesson that holds it: `gates.voicing`, or, until the server builds that endpoint, the best
 * graded score of the check and its variant from the lessons' step states (`bestScore ≥ minScore`). A preview
 * (nothing saved) starts unmet.
 */
export function useGateState(enabled: boolean, preview: boolean, own: GateRule | null = null) {
  return useQuery({
    queryKey: ["api", "gates.voicing", "lesson-player", { preview, own: own?.exercise ?? null }],
    enabled,
    staleTime: 0,
    queryFn: async (): Promise<GateState> => {
      if (preview) return { rule: own ?? CONTENT_GATE, passed: false };
      try {
        const g = await callApi("gates.voicing");
        return {
          rule: { exercise: g.exerciseId, variants: g.variants, minScore: g.minScore },
          passed: g.passed,
        };
      } catch (e) {
        if (!isNotImplemented(e)) throw e;
      }
      const ids = [CONTENT_GATE.exercise, ...CONTENT_GATE.variants];
      const lessons = [...new Set(ids.map(lessonOf))];
      const states = await Promise.all(
        lessons.map((id) =>
          callApi("lessons.steps", { params: { id } })
            .then((r) => r.steps)
            .catch(() => []),
        ),
      );
      const passed = states
        .flat()
        .some(
          (st) =>
            st.result !== null &&
            ids.includes(st.result.exerciseId) &&
            (st.result.bestScore ?? 0) >= CONTENT_GATE.minScore,
        );
      return { rule: CONTENT_GATE, passed };
    },
  });
}

/** Strudel's voicing of the chords the learner voiced: their tempo and bass, `chord(…).voicing()` on a piano. */
export async function strudelVoicingOf(
  code: string,
  o: { bars: number; meter: MeterId; key: KeySpec },
): Promise<{ code: string; symbols: string[] } | null> {
  const res = await analyzeCode(code, { mode: "lesson", bars: o.bars, lint: null, meter: o.meter });
  if (!res.ok) return null;
  const n = normalize(res, { meter: o.meter, key: o.key });
  const view = harmonyView(n, { meter: o.meter, key: o.key, bars: o.bars });
  const barOf = (i: number) => {
    const at = view.slots[i]?.span[0];
    return at ? Math.floor(at[0] / at[1] + 1e-9) : 0;
  };
  const pattern = chordPatternOf(view.slots, barOf, o.bars);
  if (!pattern) return null;
  const tempo = /^\s*setcpm\([^)]*\)\s*$/m.exec(code)?.[0]?.trim() ?? `setcpm(${Math.round(n.cps * 240)}/4)`;
  const bass = code.split("\n").find((l) => /^\s*bass\s*:/.test(l));
  const lines = [tempo, "", `chords: chord("${pattern}").voicing().s("piano")`, ...(bass ? [bass] : [])];
  return { code: lines.join("\n"), symbols: view.slots.map((s) => s.symbol) };
}

/** Under the gate check: where the learner stands, what to fix, and the unlock moment once it is met. */
export function GateBox({
  rule,
  result,
  where,
  code,
}: {
  rule: GateRule;
  result: GradeResult | null;
  where: "lesson" | "second-chance";
  code: string | null;
}) {
  const h = useStepHost();
  const line = gateLine(result, rule, where);
  const said = result
    ? summaryOf(viewFor(result, h.rung, h.passed, h.render), result, shapeOf(h.exercise))
    : "";
  // What to fix: the grader's own findings, worst first, in the lesson's words (never the answer itself).
  const fixes =
    line.tone === "near" && result && !result.assist.revealed
      ? [
          ...(result.rubric ?? []).filter((r) => !r.ok && r.diag).map((r) => h.render(r.diag as never)),
          ...result.diagnostics.filter((d) => d.severity === "error").map((d) => h.render(d)),
        ]
          // Not again what the step's own feedback line already says.
          .filter((t, i, all) => t.trim() !== "" && all.indexOf(t) === i && t !== said)
          .slice(0, 3)
      : [];
  return (
    <section
      className={`mt-3 rounded-card border p-3 ${line.tone === "met" ? "border-accent bg-lane-in" : "border-border bg-surface"}`}
      aria-label="The voicing gate"
      aria-live="polite"
      data-testid="gate-box"
      data-tone={line.tone}
    >
      <p className="flex items-center gap-2 text-sm font-medium" data-testid="gate-title">
        <KeyRound aria-hidden className="size-4 shrink-0 text-accent" />
        {line.title}
      </p>
      <p className="mt-1 text-sm text-text-2">
        <InlineMd text={line.body} />
      </p>
      {fixes.length > 0 && (
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm" data-testid="gate-fixes">
          {fixes.map((f) => (
            <li key={f}>
              <InlineMd text={f} />
            </li>
          ))}
        </ul>
      )}
      {line.tone === "met" && where === "lesson" && code ? <GateMoment code={code} /> : null}
    </section>
  );
}

/** The unlock moment: your hand voicing and Strudel's, side by side, on the staff and to play. */
export function GateMoment({ code }: { code: string }) {
  const h = useStepHost();
  const ex = h.exercise;
  const bars =
    ex && "reference" in ex && ex.reference && "bars" in ex.reference ? (ex.reference.bars as number) : 4;
  const meter = ex?.meter ?? h.env.meter;
  const key = ex?.key ?? h.env.key;
  const [theirs, setTheirs] = useState<{ code: string; symbols: string[] } | null | "failed">(null);
  useEffect(() => {
    let live = true;
    void strudelVoicingOf(code, { bars, meter, key })
      .then((v) => {
        if (live) setTheirs(v ?? "failed");
      })
      .catch(() => {
        if (live) setTheirs("failed");
      });
    return () => {
      live = false;
    };
  }, [code, bars, meter, key]);
  return (
    <div className="mt-3 grid grid-cols-1 gap-3" data-testid="gate-moment">
      <figure className="flex min-w-0 flex-col gap-2">
        <figcaption className="flex items-center justify-between gap-2 text-sm font-medium">
          Your voicing
          <Button
            size="sm"
            variant="secondary"
            icon={<Play aria-hidden className="size-3.5" />}
            onClick={() => auditionCode(code, bars)}
            data-testid="gate-play-mine"
          >
            Play
          </Button>
        </figcaption>
        <CodeMusic code={code} bars={bars} view="staff" label="Your hand voicing on the staff" />
      </figure>
      <figure className="flex min-w-0 flex-col gap-2">
        <figcaption className="flex items-center justify-between gap-2 text-sm font-medium">
          <span>
            Strudel's <code className="font-mono text-[0.9em]">.voicing()</code>
          </span>
          <Button
            size="sm"
            variant="secondary"
            icon={<Play aria-hidden className="size-3.5" />}
            disabled={theirs === null || theirs === "failed"}
            onClick={() => theirs && theirs !== "failed" && auditionCode(theirs.code, bars)}
            data-testid="gate-play-strudel"
          >
            Play
          </Button>
        </figcaption>
        {theirs === null ? (
          <p className="text-sm text-text-3">Reading your chords…</p>
        ) : theirs === "failed" ? (
          <p className="text-sm text-text-2">
            Strudel's version could not be drawn here; you meet it next lesson.
          </p>
        ) : (
          <>
            <CodeMusic code={theirs.code} bars={bars} view="staff" label="Strudel's voicing on the staff" />
            <pre
              className="rounded-control bg-surface-2 p-2 font-mono text-xs break-all whitespace-pre-wrap"
              data-testid="gate-strudel-code"
            >
              {theirs.code.split("\n").find((l) => l.startsWith("chords:"))}
            </pre>
          </>
        )}
      </figure>
      <p className="text-sm text-text-2">
        Same chords, two hands. Where Strudel moves a note you held, listen for the difference.
      </p>
    </div>
  );
}

/** The gate box for the step on screen, or nothing when the step is not the gate check. */
export function gateBoxFor(o: {
  ownerId: string;
  step: { gateCheck?: true };
  exercise: { id: string } | undefined;
  gate: GateState | null;
  result: GradeResult | null;
  code: string | null;
}) {
  if (!o.exercise || !o.gate) return null;
  if (!isGateExercise(o.gate.rule, globalExerciseId(o.ownerId, o.exercise))) return null;
  const where = o.step.gateCheck === true ? "second-chance" : "lesson";
  // A second chance already met before this visit is never shown (the step is dropped); in this visit it is.
  return <GateBox rule={o.gate.rule} result={o.result} where={where} code={o.code} />;
}
