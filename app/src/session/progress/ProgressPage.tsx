// Progress (ux §2.3, §5.5): the can-do ledger by area, the course by unit, time practised, the weekly rhythm over
// the year and milestones. Honest numbers only: what the server stored, nothing projected except the pace
// estimate, which is shown as a month (contracts §9.6), never as sessions behind.
import type { CanDoEntry } from "@oak/api";
import { Link } from "@tanstack/react-router";
import { clsx } from "clsx";
import { useContent } from "../../lib/content.ts";
import { formatDate, formatMonth } from "../../lib/format.ts";
import { usePageTitle } from "../../lib/nav.ts";
import {
  useBootstrap,
  useCourseProgress,
  useProgressReport,
  useStreak,
  useTodayPlan,
  useVoiceState,
} from "../../lib/queries.ts";
import {
  Card,
  Chip,
  type ChipTone,
  EmptyState,
  Page,
  PageHeader,
  Progress,
  Skeleton,
} from "../../ui/kit/basics.tsx";
import { ErrorState, LoadingState } from "../../ui/kit/QueryState.tsx";
import { courseEdge, edgeLead } from "../edge.ts";
import {
  EVIDENCE_LABEL,
  formatMinutes,
  ledger,
  ledgerCounts,
  type MilestoneRow,
  milestoneTimeline,
  practiceTime,
  unitProgress,
} from "../progress-model.ts";
import { restsLine, streakLine, weekStatusLabel } from "../streak-model.ts";

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
  fading: "neutral",
};
const CP_LABEL = {
  locked: "checkpoint ahead",
  open: "checkpoint open",
  passed: "checkpoint passed",
  "soft-passed": "checkpoint passed",
  failed: "checkpoint: retake open",
} as const;

function CourseCard() {
  const content = useContent();
  const course = useCourseProgress();
  const plan = useTodayPlan();
  if (course.isError) return <ErrorState error={course.error} onRetry={() => void course.refetch()} />;
  if (!course.data || !content.data?.syllabus) return <LoadingState rows={3} label="Loading the course" />;
  const units = unitProgress(content.data.syllabus, course.data);
  const shown = units.filter((u, i) => u.done > 0 || u.inProgress || i < 3);
  const edge = courseEdge(
    course.data,
    content.data.syllabus,
    new Set(content.data.lessons.map((l) => l.id as string)),
    plan.data ?? null,
  );
  return (
    <Card className="p-4" data-testid="progress-course">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-h3">The course</h2>
        <span className="text-sm text-text-2">
          {course.data.mapDone} of {course.data.mapTotal} sessions on the map
        </span>
      </div>
      {edge && (
        <div
          className="mb-3 rounded-control border border-accent/40 bg-lane-in px-3 py-2"
          data-testid="progress-edge"
        >
          <p className="font-medium">You have reached the edge of what's written.</p>
          <p className="text-sm text-text-2">
            {edgeLead(edge)}{" "}
            <Link to="/practice" className="text-link underline-offset-2 hover:underline">
              Practice
            </Link>{" "}
            and{" "}
            <Link to="/studio" className="text-link underline-offset-2 hover:underline">
              Studio
            </Link>{" "}
            are open any time.
          </p>
        </div>
      )}
      <ul className="flex flex-col gap-3">
        {shown.map((u) => (
          <li key={u.unitId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1">
            <span className="truncate">
              <span className="text-text-3">{u.unitId}</span> {u.title}
            </span>
            <span className="text-sm text-text-2">
              {u.done} of {u.total} lessons
              {edge?.nextUnit?.id === u.unitId
                ? " · being written"
                : u.checkpoint
                  ? ` · ${CP_LABEL[u.checkpoint.status]}`
                  : ""}
            </span>
            <Progress
              value={u.done}
              max={u.total}
              label={`${u.unitId}: ${u.done} of ${u.total} lessons`}
              className="col-span-2"
            />
          </li>
        ))}
      </ul>
      {shown.length < units.length && (
        <Link
          to="/oak"
          search={{ view: "course" }}
          className="mt-3 inline-block text-sm text-link underline-offset-2 hover:underline"
        >
          The whole course map
        </Link>
      )}
    </Card>
  );
}

function Ledger() {
  const content = useContent();
  const report = useProgressReport();
  const voice = useVoiceState();
  const quiet = voice.data?.quiet === true;
  if (report.isError) return <ErrorState error={report.error} onRetry={() => void report.refetch()} />;
  if (content.isPending || report.isPending) return <LoadingState rows={5} label="Loading the ledger" />;
  const rows = ledger(report.data.canDo);
  return (
    <>
      {rows.size === 0 && (
        <Card>
          <EmptyState title="Nothing in the ledger yet">
            Each lesson adds a plain "I can…" here once you have shown it. Your first comes with your first
            loop.
          </EmptyState>
        </Card>
      )}
      {AREAS.map((area) => {
        const defs = content.data?.candos.filter((c) => c.area === area) ?? [];
        if (defs.length === 0) return null;
        const counts = ledgerCounts(defs, rows);
        return (
          <Card key={area} className="p-4" data-testid={`ledger-${area}`}>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
              <h2 className="text-h3">{AREA_LABEL[area]}</h2>
              <span className="text-sm text-text-3" data-testid={`ledger-${area}-counts`}>
                {counts.shown} of {counts.total} shown
                {counts.shown > 0 ? ` · ${counts.solid} solid or strong` : ""}
              </span>
            </div>
            {area === "sing" && quiet && (
              <p className="mb-1 text-sm text-text-2" data-testid="ledger-sing-quiet">
                Quiet mode is on: these wait for the microphone. Nothing else does.
              </p>
            )}
            <ul className="divide-y divide-border">
              {defs.map((d) => {
                const e = rows.get(d.id);
                const status = e?.latest.status ?? "not-yet";
                return (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className={clsx("block", !e && "text-text-2")}>{d.statement}</span>
                      {e && (
                        <span className="block text-sm text-text-3">
                          since {formatDate(e.firstAt, true)} · latest from{" "}
                          {EVIDENCE_LABEL[e.latest.evidenceKind]}
                        </span>
                      )}
                    </span>
                    <Chip tone={STATUS_TONE[status]} className="shrink-0">
                      {status === "not-yet"
                        ? area === "sing" && quiet
                          ? "waits for the mic"
                          : "not yet"
                        : status}
                    </Chip>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}
    </>
  );
}

function MilestoneItem({ m, tone }: { m: MilestoneRow; tone: "reached" | "next" | "ahead" }) {
  return (
    <li
      className={clsx(
        "flex flex-col gap-0.5",
        tone === "next" && "rounded-control border border-accent/50 bg-lane-in px-3 py-2",
      )}
      data-milestone={m.id}
      data-state={tone}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className={clsx(tone === "ahead" ? "text-text-3" : "font-medium")}>{m.title}</span>
        <span className="shrink-0 text-sm text-text-3">
          {m.reachedAt ? formatDate(m.reachedAt, true) : tone === "next" ? "next" : ""}
        </span>
      </span>
      {tone !== "ahead" && <span className="text-sm text-text-2">{m.description}</span>}
    </li>
  );
}

function Milestones({ milestones }: { milestones: readonly MilestoneRow[] }) {
  const t = milestoneTimeline(milestones);
  return (
    <div className="flex flex-col gap-3">
      {t.reached.length === 0 && t.next && (
        <p className="text-sm text-text-2">None reached yet. The first comes with your first album track.</p>
      )}
      {t.reached.length > 0 && (
        <ol className="flex flex-col gap-2" aria-label="Reached">
          {t.reached.map((m) => (
            <MilestoneItem key={m.id} m={m} tone="reached" />
          ))}
        </ol>
      )}
      {t.next && (
        <ol aria-label="Next">
          <MilestoneItem m={t.next} tone="next" />
        </ol>
      )}
      {t.ahead.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-text-2">Later ({t.ahead.length})</summary>
          <ol className="mt-2 flex flex-col gap-1.5">
            {t.ahead.map((m) => (
              <MilestoneItem key={m.id} m={m} tone="ahead" />
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

function TimeCard({ days, today }: { days: Parameters<typeof practiceTime>[0]; today: string }) {
  const t = practiceTime(days, today);
  const stats = [
    { label: "This week", value: formatMinutes(t.last7) },
    { label: "Last 4 weeks", value: formatMinutes(t.last28) },
    { label: "This year", value: formatMinutes(t.totalMinutes) },
    { label: "Days practised", value: String(t.daysPractised) },
  ];
  return (
    <Card className="p-4" data-testid="progress-time">
      <h2 className="mb-2 text-h3">Time practised</h2>
      <dl className="grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="text-sm text-text-2">{s.label}</dt>
            <dd className="font-display text-h3 tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-sm text-text-3">Active time only: a pause or an idle minute is not counted.</p>
    </Card>
  );
}

export function ProgressPage() {
  usePageTitle("Progress");
  const report = useProgressReport();
  const streak = useStreak(52);
  const lastClosed = streak.data?.weeks.filter((w) => w.status !== "open").at(-1) ?? null;
  const boot = useBootstrap();
  const today = boot.data?.day ?? null;
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
        <section aria-label="Course and can-do ledger" className="flex flex-col gap-4 lg:col-span-2">
          <CourseCard />
          <Ledger />
        </section>
        <aside className="flex flex-col gap-4" aria-label="Time, rhythm and milestones">
          {streak.data && today ? (
            <TimeCard days={streak.data.days} today={today} />
          ) : streak.isError ? null : (
            <Skeleton className="h-32 w-full" />
          )}
          <Card className="p-4" data-testid="progress-rhythm">
            <h2 className="mb-2 text-h3">Weekly rhythm</h2>
            {streak.data ? (
              <>
                <p className="mb-2 text-sm text-text-2">
                  {streakLine(streak.data.summary, lastClosed)} · longest {streak.data.summary.longestWeeks}
                  {restsLine(streak.data.summary) ? ` · ${restsLine(streak.data.summary)}` : ""}
                </p>
                {streak.data.weeks.length === 0 ? (
                  <p className="text-sm text-text-3">Your first week fills in as you practise.</p>
                ) : (
                  <ol aria-label="Weeks, oldest first" className="flex flex-wrap gap-1">
                    {streak.data.weeks.map((w) => (
                      <li
                        key={w.weekStart}
                        title={`Week of ${w.weekStart}: ${w.qualifyingDays} of ${w.goal} days, ${weekStatusLabel(w)}`}
                        className={clsx(
                          "size-3.5 rounded-sm",
                          w.status.startsWith("met")
                            ? "bg-accent"
                            : w.status === "paused"
                              ? "bg-surface-2"
                              : w.status === "open" || w.status === "tie-open"
                                ? "border border-accent/60"
                                : "bg-border",
                        )}
                      >
                        <span className="sr-only">
                          Week of {w.weekStart}: {weekStatusLabel(w)}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </>
            ) : streak.isError ? (
              <ErrorState error={streak.error} onRetry={() => void streak.refetch()} />
            ) : (
              <Skeleton className="h-16 w-full" />
            )}
          </Card>
          <Card className="p-4" data-testid="progress-milestones">
            <h2 className="mb-2 text-h3">Milestones</h2>
            {report.data ? (
              report.data.milestones.length === 0 ? (
                <p className="text-sm text-text-2">The course defines no milestones yet.</p>
              ) : (
                <Milestones milestones={report.data.milestones} />
              )
            ) : report.isError ? (
              <ErrorState error={report.error} onRetry={() => void report.refetch()} />
            ) : (
              <Skeleton className="h-20 w-full" />
            )}
          </Card>
        </aside>
      </div>
    </Page>
  );
}
