// Today (ux §1.4): one decision — start the session — with enough state around it to make returning feel
// worthwhile. Data: GET /session/today (the plan), /bootstrap (profile, streak, unlocks), /skills/map (the
// mini Oak), /sketches (last sketch).
import type { SessionPlan, StreakSummary, WarmupItem } from "@oak/api";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { clsx } from "clsx";
import { ArrowRight, Play, Sprout } from "lucide-react";
import { useMemo } from "react";
import { useContent } from "../lib/content.ts";
import { lessonTitles, titleOf } from "../lib/content-model.ts";
import { formatDate } from "../lib/format.ts";
import { usePageTitle } from "../lib/nav.ts";
import {
  apiQuery,
  useBootstrap,
  useSessionStart,
  useSketches,
  useSkillMap,
  useTodayPlan,
  useTutorWarm,
} from "../lib/queries.ts";
import { routeOfItem, routeOfPlan } from "../lib/session-route.ts";
import { AcornIcon, LeafIcon, RestIcon, TieIcon } from "../ui/icons/index.tsx";
import { useHotkeys } from "../ui/keys/KeymapProvider.tsx";
import { Button, buttonClass } from "../ui/kit/Button.tsx";
import { Card, Chip, Page, Skeleton } from "../ui/kit/basics.tsx";
import { ErrorState, LoadingState } from "../ui/kit/QueryState.tsx";
import { toast } from "../ui/kit/Toast.tsx";

export const Route = createFileRoute("/")({
  loader: ({ context }) => {
    // Warm the cache; the page renders its own loading states, so failures are not awaited here.
    void context.queryClient.prefetchQuery(apiQuery("session.today", {}));
    void context.queryClient.prefetchQuery(apiQuery("bootstrap"));
  },
  component: Today,
});

const WARMUP_LABEL: Record<WarmupItem["kind"], string> = {
  anchor: "anchor",
  repair: "repair set",
  "family-set": "ear set",
  "composite-set": "mixed set",
  "concept-set": "concept set",
  "fact-set": "facts",
  "blocked-intro": "new family",
  listen: "listening",
};

function warmupSummary(items: WarmupItem[]): string {
  const counts = new Map<string, number>();
  for (const i of items) counts.set(WARMUP_LABEL[i.kind], (counts.get(WARMUP_LABEL[i.kind]) ?? 0) + 1);
  return [...counts].map(([k, n]) => `${n} ${k}${n > 1 && !k.endsWith("s") ? "s" : ""}`).join(" · ");
}

function WeeklyRhythm({ streak }: { streak: StreakSummary }) {
  const days = streak.thisWeek.days;
  const slots = Array.from({ length: 7 }, (_, i) => days[i] ?? null);
  return (
    <div className="flex items-center gap-3">
      <ol
        aria-label={`This week: ${streak.thisWeek.qualifyingDays} of ${streak.thisWeek.goal} days`}
        className="flex items-end gap-1.5"
      >
        {slots.map((d, i) => {
          const state = !d
            ? "future"
            : d.qualified
              ? d.source === "rest" || d.source === "banked-rest"
                ? "rest"
                : "note"
              : "empty";
          return (
            <li
              key={i}
              className="flex flex-col items-center gap-0.5"
              title={d ? `${d.day}: ${d.source ?? "—"}` : undefined}
            >
              {state === "rest" ? (
                <RestIcon size={16} className="text-text-3" />
              ) : (
                <span
                  aria-hidden
                  className={clsx(
                    "block h-3 w-3.5 -rotate-12 rounded-[50%] border-[1.5px]",
                    state === "note"
                      ? "border-accent bg-accent"
                      : state === "empty"
                        ? "border-text-3"
                        : "border-border border-dashed",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
      <span className="whitespace-nowrap text-sm text-text-2">
        {streak.thisWeek.qualifyingDays}/{streak.thisWeek.goal} this week
      </span>
      {streak.repair && (
        <Chip tone="amber" title={`Any practice before ${formatDate(streak.repair.until)} repairs last week`}>
          <TieIcon size={14} /> tie open
        </Chip>
      )}
    </div>
  );
}

function Setlist({ plan, titles }: { plan: SessionPlan; titles: Map<string, string> }) {
  const warmMin = Math.round(plan.warmup.plannedSec / 60);
  const rows: { n: number; label: string; detail: string }[] = [];
  if (plan.warmup.items.length)
    rows.push({
      n: rows.length + 1,
      label: `Warm-up · ${warmMin} min`,
      detail: warmupSummary(plan.warmup.items),
    });
  if (plan.main) {
    const what = plan.main.light
      ? `Light lesson: ${titleOf(plan.main.light.lessonId, titles)} — ${plan.main.light.constraint}`
      : plan.main.resumeStep
        ? `Resume ${titleOf(plan.mapItemId, titles)} at step ${plan.main.resumeStep.replace(/^S/, "")}`
        : plan.title;
    rows.push({ n: rows.length + 1, label: `New · ${Math.round(plan.main.estMinutes)} min`, detail: what });
  }
  rows.push({ n: rows.length + 1, label: "Coda · 1 min", detail: "What changed today, and what's next" });
  return (
    <ol className="flex flex-col divide-y divide-border">
      {rows.map((r) => (
        <li key={r.n} className="flex gap-4 py-3">
          <span className="w-5 shrink-0 text-right font-display text-h3 text-text-3">{r.n}</span>
          <div className="min-w-0">
            <p className="font-medium">{r.label}</p>
            <p className="text-text-2">{r.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Today() {
  usePageTitle("Today");
  const navigate = useNavigate();
  const bootstrap = useBootstrap();
  const plan = useTodayPlan();
  const map = useSkillMap();
  const sketches = useSketches();
  const content = useContent();
  const start = useSessionStart();
  const warm = useTutorWarm();
  const titles = useMemo(() => lessonTitles(content.data?.syllabus ?? null), [content.data]);

  const onStart = async () => {
    const p = plan.data;
    if (!p) return;
    try {
      await start.mutateAsync({
        body: { kind: p.kind, mapItemId: p.mapItemId, targetMinutes: p.targetMinutes },
      });
      // Warms the tutor's prompt cache in the background; the tutor is optional, so failures are ignored.
      warm.mutate(undefined as never, { onError: () => {} });
      void navigate(routeOfPlan(p));
    } catch (e) {
      toast.error("The session didn't start", e instanceof Error ? e.message : undefined);
    }
  };
  useHotkeys([
    {
      id: "today-start",
      keys: "Enter",
      scope: "global",
      group: "Today",
      description: "Start session",
      when: (ctx) => !ctx.onControl && !!plan.data,
      run: () => void onStart(),
    },
  ]);

  if (bootstrap.isError && plan.isError)
    return (
      <Page>
        <ErrorState error={bootstrap.error} onRetry={() => void bootstrap.refetch()} />
      </Page>
    );

  const b = bootstrap.data;
  const firstRun = b && !b.profile.onboardedAt;
  const drying = map.data?.nodes.filter((n) => n.drying).length ?? 0;
  const lastSketch = sketches.data?.items[0];
  const unseen = b?.unlocks.filter((u) => !u.seen).length ?? 0;

  return (
    <Page>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-h1">
            {b
              ? new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(new Date(`${b.day}T12:00:00`))
              : "Today"}
          </h1>
          <p className="text-text-2">
            {b ? `Day ${b.streak.totalDays + (b.streak.todayQualified ? 0 : 1)} of practice` : " "}
          </p>
        </div>
        {b ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <WeeklyRhythm streak={b.streak} />
            <Chip tone="accent" title="Weeks in a row that met your weekly goal">
              {b.streak.weeks} ⁀ week{b.streak.weeks === 1 ? "" : "s"}
            </Chip>
          </div>
        ) : (
          <Skeleton className="h-6 w-64" />
        )}
      </header>

      {firstRun && (
        <Card className="mb-6 flex items-center justify-between gap-4 p-4">
          <div>
            <p className="font-medium">Welcome to Oak.</p>
            <p className="text-text-2">Ten minutes to set up sound and your voice, then your first loop.</p>
          </div>
          <Link to="/onboarding/$step" params={{ step: "1" }} className={buttonClass("primary", "lg")}>
            Begin <ArrowRight aria-hidden className="size-4" />
          </Link>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        <section aria-labelledby="setlist-h" className="lg:col-span-8">
          <Card className="p-5">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h2 id="setlist-h" className="text-h2">
                {plan.data?.main?.resumeStep
                  ? "Pick up where you left off"
                  : plan.data?.returning
                    ? "Welcome back. We'll ease in."
                    : "Your setlist for today"}
              </h2>
              {plan.data && <span className="text-sm text-text-3">{plan.data.targetMinutes} min</span>}
            </div>
            {plan.isPending ? (
              <LoadingState rows={3} label="Planning today" />
            ) : plan.isError ? (
              <ErrorState error={plan.error} onRetry={() => void plan.refetch()} />
            ) : (
              <>
                {plan.data.note && <p className="mb-2 text-text-2">{plan.data.note}</p>}
                <Setlist plan={plan.data} titles={titles} />
                <div className="mt-4 flex justify-center">
                  <Button
                    variant="primary"
                    size="lg"
                    loading={start.isPending}
                    onClick={() => void onStart()}
                    icon={<Play aria-hidden className="size-4" />}
                    data-testid="start-session"
                  >
                    Start session <kbd className="ml-1 font-mono text-[0.75rem] opacity-70">⏎</kbd>
                  </Button>
                </div>
              </>
            )}
          </Card>
          {plan.data && plan.data.alternatives.length > 0 && (
            <nav aria-label="Other ways today" className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-sm text-text-2">Other ways today:</span>
              {plan.data.alternatives.map((a) => (
                <Link
                  key={`${a.kind}:${a.mapItemId ?? ""}`}
                  {...(a.kind === "studio" ? { to: "/studio" as const } : routeOfItem(a.mapItemId))}
                  className={buttonClass("secondary", "sm")}
                >
                  {a.title}
                </Link>
              ))}
              <Link to="/studio" className={buttonClass("ghost", "sm")}>
                Studio
              </Link>
            </nav>
          )}
        </section>

        <aside className="flex flex-col gap-4 lg:col-span-4" aria-label="At a glance">
          <Card className="p-4">
            <h2 className="mb-1 flex items-center gap-2 font-sans text-sm font-semibold text-text-2">
              <AcornIcon size={16} /> Toolbox
            </h2>
            {b ? (
              <p>
                {b.unlocks.length} tools unlocked
                {unseen > 0 && <span className="text-text-2"> · {unseen} new</span>}{" "}
                <Link to="/toolbox" className="text-link">
                  Open
                </Link>
              </p>
            ) : (
              <Skeleton className="h-5 w-40" />
            )}
          </Card>
          <Card className="p-4">
            <h2 className="mb-1 flex items-center gap-2 font-sans text-sm font-semibold text-text-2">
              <LeafIcon size={16} /> The Oak
            </h2>
            {map.data ? (
              <p>
                {map.data.nodes.filter((n) => n.level === "mastered" || n.level === "practiced").length}{" "}
                leaves grown
                {drying > 0 && (
                  <>
                    {" · "}
                    {drying} drying.{" "}
                    <Link to="/practice/review" className="text-link">
                      Revive ({Math.max(1, Math.round(map.data.reviveSec / 60))} min)
                    </Link>
                  </>
                )}
              </p>
            ) : map.isError ? (
              <p className="text-text-3">Not available.</p>
            ) : (
              <Skeleton className="h-5 w-40" />
            )}
          </Card>
          <Card className="p-4">
            <h2 className="mb-1 flex items-center gap-2 font-sans text-sm font-semibold text-text-2">
              <Sprout aria-hidden className="size-4" /> Last sketch
            </h2>
            {lastSketch ? (
              <Link to="/studio/$sketchId" params={{ sketchId: lastSketch.id }} className="text-link">
                {lastSketch.title}
              </Link>
            ) : sketches.isPending ? (
              <Skeleton className="h-5 w-32" />
            ) : (
              <p className="text-text-3">Your sketchbook fills up one session at a time.</p>
            )}
          </Card>
          {plan.data?.tutorNote && (
            <Card className="p-4">
              <h2 className="mb-1 font-sans text-sm font-semibold text-text-2">Claude's note</h2>
              <p className="text-text-2">{plan.data.tutorNote}</p>
            </Card>
          )}
        </aside>
      </div>
    </Page>
  );
}
