// Practice hub (ux §2.3, contracts §7.3–7.4): today's review, then every drill family grouped by ear-training
// stage with its state — locked ("Unlocks in U04"), arriving later (its generator is not built yet), open with
// its level and recall, or mastered. Raw due counts are never shown (§7.4 Display).

import { EAR_STAGES } from "@content/families.ts";
import type { FamilyDef } from "@oak/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { clsx } from "clsx";
import { Check, Hourglass, Lock, Mic } from "lucide-react";
import {
  type FamilyStatus,
  familyAccuracy,
  familyStatus,
  groupByStage,
  pctText,
  pendingText,
  recallOf,
  unitOf,
} from "../../drills/model.ts";
import { type DrillData, useDrillData } from "../../drills/use-drill-data.ts";
import { usePageTitle } from "../../lib/nav.ts";
import { useDue } from "../../lib/queries.ts";
import { buttonClass } from "../../ui/kit/Button.tsx";
import { Card, Chip, EmptyState, Page, PageHeader } from "../../ui/kit/basics.tsx";
import { ErrorState, LoadingState } from "../../ui/kit/QueryState.tsx";

export const Route = createFileRoute("/practice/")({ component: PracticeHub });

/** "Unlocks in U04", or the lesson itself once its unit has begun ("Unlocks at U01.L04"). */
function lockedText(def: FamilyDef, completed: ReadonlySet<string>): string {
  const unit = unitOf(def.unlock.lesson);
  const begun = [...completed].some((l) => unitOf(l) === unit);
  return begun ? `Unlocks at ${def.unlock.lesson}` : `Unlocks in ${unit}`;
}

function recallTone(r: number | null): string {
  if (r === null) return "border border-text-3";
  if (r >= 0.9) return "bg-accent";
  if (r >= 0.75) return "bg-accent-2";
  return "bg-issue";
}

const STATUS_CHIP: Record<FamilyStatus, { label: string; tone: "neutral" | "accent" | "amber" }> = {
  pending: { label: "Later", tone: "neutral" },
  locked: { label: "Locked", tone: "neutral" },
  unlocked: { label: "Open", tone: "accent" },
  mastered: { label: "Mastered", tone: "amber" },
};

function FamilyCard({ def, data }: { def: FamilyDef; data: DrillData }) {
  const state = data.states.get(def.id);
  const status = familyStatus(def, state, data.completed);
  const card = data.cards.get(def.id);
  const recall = recallOf(card);
  const { n, acc } = familyAccuracy(state);
  const playable = status === "unlocked" || status === "mastered";
  const quietBlocked = playable && def.mic === true && data.profile.quiet;
  const chip = STATUS_CHIP[status];
  return (
    <Card
      className={clsx("flex flex-col gap-2 p-4", !playable && "bg-surface-2/60")}
      data-testid="family-card"
      data-family={def.id}
      data-status={status}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className={clsx("font-sans text-base font-semibold", !playable && "text-text-2")}>{def.title}</h3>
        <span className="flex shrink-0 items-center gap-2">
          {def.mic && <Mic aria-label="Uses the microphone" className="size-4 text-text-3" />}
          {playable && (
            <span
              className={clsx("size-2.5 rounded-full", recallTone(recall))}
              title={recall === null ? "Not scheduled yet" : `Recall ${pctText(recall)}`}
              aria-label={recall === null ? "Not scheduled yet" : `Recall ${pctText(recall)}`}
              role="img"
            />
          )}
          <Chip tone={chip.tone}>{chip.label}</Chip>
        </span>
      </div>
      {status === "locked" && (
        <p className="flex items-center gap-1.5 text-sm text-text-2">
          <Lock aria-hidden className="size-3.5" /> {lockedText(def, data.completed)}
        </p>
      )}
      {status === "pending" && (
        <p className="flex items-center gap-1.5 text-sm text-text-2">
          <Hourglass aria-hidden className="size-3.5" /> {pendingText(def, data.completed)}
        </p>
      )}
      {playable && (
        <>
          <p className="text-sm text-text-2">
            {status === "mastered" && <Check aria-hidden className="mr-1 inline size-3.5 text-accent" />}
            Level {state?.level ?? 1} of {def.levels.length}
            {acc !== null
              ? ` · ${pctText(acc)} over ${n} ${n === 1 ? "trial" : "trials"}`
              : " · not practised yet"}
          </p>
          {quietBlocked ? (
            <p className="text-sm text-text-3">Quiet mode is on: this one waits for the microphone.</p>
          ) : (
            <Link
              to="/practice/$familyId"
              params={{ familyId: def.id }}
              className={buttonClass("secondary", "sm", "self-start")}
              aria-label={`Practise ${def.title}`}
            >
              Practise
            </Link>
          )}
        </>
      )}
    </Card>
  );
}

function PracticeHub() {
  usePageTitle("Practice");
  const due = useDue();
  const state = useDrillData();
  const hasReview = (due.data?.items.length ?? 0) > 0;

  return (
    <Page>
      <PageHeader
        title="Practice"
        sub={due.data ? due.data.label : due.isPending ? "\u00a0" : undefined}
        actions={
          hasReview ? (
            <Link to="/practice/review" className={buttonClass("primary", "lg")}>
              Start today's review
            </Link>
          ) : undefined
        }
      />
      <p className="mb-6 max-w-[70ch] text-sm text-text-2">
        Free practice adapts to keep you near 85% right. Extra practice doesn't change your schedule unless a
        family is nearly due.
      </p>
      {state.status === "loading" ? (
        <LoadingState rows={4} label="Loading families" />
      ) : state.status === "error" ? (
        <ErrorState error={state.error} onRetry={state.retry} />
      ) : (
        <Stages data={state.data} />
      )}
    </Page>
  );
}

function Stages({ data }: { data: DrillData }) {
  const groups = groupByStage(data.content.families, EAR_STAGES);
  if (groups.length === 0)
    return <EmptyState title="No drill families yet">Families open as lessons introduce them.</EmptyState>;
  const anyOpen = groups.some((g) =>
    g.families.some((d) =>
      ["unlocked", "mastered"].includes(familyStatus(d, data.states.get(d.id), data.completed)),
    ),
  );
  return (
    <div className="flex flex-col gap-8">
      {!anyOpen && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-text-2">
            Families open as lessons introduce them. The first ones arrive with the opening lessons.
          </p>
          <Link to="/" className={buttonClass("secondary")}>
            Go to Today
          </Link>
        </Card>
      )}
      {groups.map((g) => {
        const open = g.families.filter((d) =>
          ["unlocked", "mastered"].includes(familyStatus(d, data.states.get(d.id), data.completed)),
        ).length;
        return (
          <section key={g.key} aria-labelledby={`stage-${g.key}`} data-testid={`stage-${g.key}`}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 id={`stage-${g.key}`} className="text-h3">
                  {g.title}
                </h2>
                <p className="text-sm text-text-2">{g.sub}</p>
              </div>
              <span className="text-sm text-text-3">
                {open} of {g.families.length} open
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.families.map((d) => (
                <FamilyCard key={d.id} def={d} data={data} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
