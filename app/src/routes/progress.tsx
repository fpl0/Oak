// Progress (ux §2.3, §5.5): the can-do ledger grouped by area, milestones, weekly rhythm history and pace.
import type { CanDoEntry } from "@oak/api";
import { createFileRoute } from "@tanstack/react-router";
import { clsx } from "clsx";
import { useContent } from "../lib/content.ts";
import { formatDate, formatMonth } from "../lib/format.ts";
import { usePageTitle } from "../lib/nav.ts";
import { useProgressReport, useStreak } from "../lib/queries.ts";
import { Card, Chip, type ChipTone, Page, PageHeader, Skeleton } from "../ui/kit/basics.tsx";
import { ErrorState, LoadingState } from "../ui/kit/QueryState.tsx";

export const Route = createFileRoute("/progress")({ component: ProgressPage });

const AREAS = ["hear", "read", "write", "compose", "transcribe", "sing", "code"] as const;
const AREA_LABEL: Record<(typeof AREAS)[number], string> = {
  hear: "Hear",
  read: "Read",
  write: "Write",
  compose: "Compose",
  transcribe: "Transcribe",
  sing: "Sing",
  code: "Code",
};
const STATUS_TONE: Record<CanDoEntry["status"] | "not-yet", ChipTone> = {
  "not-yet": "neutral",
  emerging: "amber",
  solid: "accent",
  strong: "accent",
  fading: "issue",
};

function ProgressPage() {
  usePageTitle("Progress");
  const content = useContent();
  const report = useProgressReport();
  const streak = useStreak(52);
  // The ledger is a status history: the current status of a can-do is its latest row.
  const latest = new Map<string, CanDoEntry>();
  const first = new Map<string, string>();
  for (const e of report.data?.canDo ?? []) {
    const prev = latest.get(e.candoId);
    if (!prev || prev.at < e.at) latest.set(e.candoId, e);
    const f = first.get(e.candoId);
    if (!f || e.at < f) first.set(e.candoId, e.at);
  }
  return (
    <Page>
      <PageHeader
        title="Progress"
        sub={
          report.data?.paceEstimate
            ? `At ${report.data.paceEstimate.sessionsPerWeek} sessions a week you'll finish the core around ${formatMonth(report.data.paceEstimate.coreDoneBy)}.`
            : "What you can do now, in plain words."
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <section aria-label="Can-do ledger" className="flex flex-col gap-4 lg:col-span-2">
          {report.isError && <ErrorState error={report.error} onRetry={() => void report.refetch()} />}
          {content.isPending || report.isPending ? (
            <LoadingState rows={5} />
          ) : (
            AREAS.map((area) => {
              const defs = content.data?.candos.filter((c) => c.area === area) ?? [];
              if (defs.length === 0) return null;
              return (
                <Card key={area} className="p-4">
                  <h2 className="mb-2 text-h3">{AREA_LABEL[area]}</h2>
                  <ul className="divide-y divide-border">
                    {defs.map((d) => {
                      const e = latest.get(d.id);
                      const status = e?.status ?? "not-yet";
                      return (
                        <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                          <span className={clsx(!e && "text-text-2")}>{d.statement}</span>
                          <span className="flex shrink-0 items-center gap-2">
                            {e && (
                              <span className="text-sm text-text-3">{formatDate(first.get(d.id), true)}</span>
                            )}
                            <Chip tone={STATUS_TONE[status]}>
                              {status === "not-yet" ? "not yet" : status}
                            </Chip>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              );
            })
          )}
        </section>
        <aside className="flex flex-col gap-4" aria-label="Milestones and rhythm">
          <Card className="p-4">
            <h2 className="mb-2 text-h3">Milestones</h2>
            {report.data ? (
              report.data.milestones.length === 0 ? (
                <p className="text-text-2">Your first milestone is the first loop.</p>
              ) : (
                <ol className="flex flex-col gap-1.5">
                  {report.data.milestones.map((m) => (
                    <li
                      key={m.id}
                      className={clsx("flex justify-between gap-2", !m.reachedAt && "text-text-3")}
                    >
                      <span>{m.id}</span>
                      <span className="text-sm">{m.reachedAt ? formatDate(m.reachedAt, true) : "ahead"}</span>
                    </li>
                  ))}
                </ol>
              )
            ) : (
              <Skeleton className="h-20 w-full" />
            )}
          </Card>
          <Card className="p-4">
            <h2 className="mb-2 text-h3">Weekly rhythm</h2>
            {streak.data ? (
              <>
                <p className="mb-2 text-sm text-text-2">
                  {streak.data.summary.weeks} weeks in a row · longest {streak.data.summary.longestWeeks} ·{" "}
                  {streak.data.summary.bankedRests} rest
                  {streak.data.summary.bankedRests === 1 ? "" : "s"} banked
                </p>
                <ol aria-label="Weeks, oldest first" className="flex flex-wrap gap-1">
                  {streak.data.weeks.map((w) => (
                    <li
                      key={w.weekStart}
                      title={`${w.weekStart}: ${w.qualifyingDays}/${w.goal} (${w.status})`}
                      className={clsx(
                        "size-3 rounded-sm",
                        w.status.startsWith("met")
                          ? "bg-accent"
                          : w.status === "paused"
                            ? "bg-surface-2"
                            : w.status === "missed"
                              ? "bg-border"
                              : "bg-accent-2/60",
                      )}
                    >
                      <span className="sr-only">
                        Week of {w.weekStart}: {w.status}
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            ) : streak.isError ? (
              <p className="text-text-3">Not available.</p>
            ) : (
              <Skeleton className="h-16 w-full" />
            )}
          </Card>
        </aside>
      </div>
    </Page>
  );
}
