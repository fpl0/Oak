// The set summary (ux §4.1): accuracy in words and numbers, what moved (level, categories, the confusion worth
// a listen), and when the family comes back — never a count of cards. The tutor opens again here.
import type { FamilyDef, FamilyId } from "@oak/api";
import type { SetPlan } from "@oak/drills";
import { MessageCircle } from "lucide-react";
import type { ReactNode } from "react";
import { askChat } from "../tutor/context.ts";
import { Button } from "../ui/kit/Button.tsx";
import { Card } from "../ui/kit/basics.tsx";
import { ProgressRing } from "../ui/kit/Meters.tsx";
import type { DrillContext, DrillPurpose } from "./machine.ts";
import { optionLabel, summarize, summaryView } from "./model.ts";
import type { DrillData } from "./use-drill-data.ts";

export function SetSummary({
  data,
  def,
  title,
  familyIds,
  context,
  purpose,
  primary,
  extra,
}: {
  data: DrillData;
  def: FamilyDef;
  title: string;
  familyIds: readonly FamilyId[];
  context: DrillContext;
  purpose: DrillPurpose;
  primary: ReactNode;
  extra?: ReactNode;
}) {
  const level = context.session?.levels[def.id] ?? 1;
  const plan: SetPlan = {
    setId: context.session?.setId ?? "",
    family: def.id,
    level,
    trials: [],
    estSec: 0,
    preload: [],
    blockedIntro: false,
  };
  const outcomes = context.outcomes.filter(Boolean);
  const summary = summarize(plan, context.trials, context.outcomes);
  const view = summaryView({
    def: { ...def, title },
    summary,
    outcomes,
    finish: context.finish,
    purpose,
    cardLevel: level,
    before: data.states.get(def.id) ?? null,
    profile: data.profile,
  });
  const answered = outcomes.filter((o) => o.result.skipped !== true);
  const hits = answered.filter((o) => o.result.correct).length;
  const top = Object.entries(summary.confusions).sort((a, b) => b[1] - a[1])[0];
  const question = top
    ? (() => {
        const [expected, got] = top[0].split("|");
        return `How do I hear ${optionLabel(expected ?? "")} apart from ${optionLabel(got ?? "")}?`;
      })()
    : null;
  const composite = familyIds.length > 1;
  const sungTrials = outcomes.filter((o) => o.resolutionCredit !== null);

  return (
    <Card className="flex flex-col gap-5 p-6" data-testid="set-summary">
      <div className="flex flex-wrap items-center gap-5">
        <ProgressRing
          value={hits}
          max={Math.max(1, answered.length)}
          size={88}
          label={`${hits} of ${answered.length} right`}
        >
          <span className="text-lg font-semibold tabular-nums">
            {answered.length ? `${hits}/${answered.length}` : "–"}
          </span>
        </ProgressRing>
        <div className="min-w-0">
          <p className="text-sm text-text-2">Set complete</p>
          <h2 className="text-h2" data-testid="summary-title">
            {title} · {view.word}
          </h2>
          <p className="text-text-2">
            {view.accuracy} {answered.length ? "right" : ""}
            {outcomes.length > answered.length
              ? ` · ${outcomes.length - answered.length} skipped, no penalty`
              : ""}
          </p>
        </div>
      </div>
      {(view.moved.length > 0 || sungTrials.length > 0 || composite) && (
        <section aria-labelledby="moved-h">
          <h3 id="moved-h" className="mb-1.5 font-sans text-sm font-semibold text-text-2">
            What moved
          </h3>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {view.moved.map((m) => (
              <li key={m}>{m}</li>
            ))}
            {sungTrials.length > 0 && (
              <li>
                Sung home on {sungTrials.length} {sungTrials.length === 1 ? "trial" : "trials"}
                {sungTrials.filter((o) => (o.resolutionCredit ?? 0) >= 0.8).length > 0
                  ? `, ${sungTrials.filter((o) => (o.resolutionCredit ?? 0) >= 0.8).length} in tune.`
                  : "."}
              </li>
            )}
            {composite && <li>A mixed review: each family keeps its own level.</li>}
          </ul>
        </section>
      )}
      {view.next && (
        <p className="text-text-2" data-testid="summary-next">
          {view.next}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {primary}
        {extra}
        {question && (
          <Button
            variant="ghost"
            icon={<MessageCircle aria-hidden className="size-4" />}
            onClick={() => askChat(question)}
          >
            Ask Claude: {question}
          </Button>
        )}
      </div>
    </Card>
  );
}
