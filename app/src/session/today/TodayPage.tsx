// Today (ux §1.4): one decision — start the session — with enough around it to make returning worthwhile: the
// setlist from the server's plan, the weekly rhythm (rests, ties, goal weeks), the next unlock, the Oak and the
// album at a glance, the last sketch and Claude's one-line note. States: first run, a session open, done for
// today, a paused week, a free rest day, welcome back (3+ days), a light session (10+), checkpoint, capstone,
// gym and review days (today-model.ts).
import { OakApiError, type SessionPlan } from "@oak/api";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Leaf, Play } from "lucide-react";
import { useContent } from "../../lib/content.ts";
import { lessonTitles, titleOf } from "../../lib/content-model.ts";
import { usePageTitle } from "../../lib/nav.ts";
import {
  useBootstrap,
  useCourseProgress,
  useOnboarding,
  useProfileUpdate,
  useSessionDay,
  useStreak,
  useTodayPlan,
  useTutorWarm,
  useVoiceLadder,
  useVoiceState,
} from "../../lib/queries.ts";
import { routeOfItem } from "../../lib/session-route.ts";
import { useHotkeys } from "../../ui/keys/KeymapProvider.tsx";
import { Button, buttonClass } from "../../ui/kit/Button.tsx";
import { Card, Chip, Page, Skeleton } from "../../ui/kit/basics.tsx";
import { Callout } from "../../ui/kit/Controls.tsx";
import { ErrorState, LoadingState } from "../../ui/kit/QueryState.tsx";
import { toast } from "../../ui/kit/Toast.tsx";
import { type CourseEdge, courseEdge, edgeShort } from "../edge.ts";
import { useLastEnded, useRunnerNavigator, useRunnerView } from "../hooks.ts";
import { sessionRunner } from "../live.ts";
import { daysLine, goalLine, repairLine, restsLine, streakLine } from "../streak-model.ts";
import {
  keepAlivePlan,
  looserTolerance,
  type SetlistRow,
  type TodayView,
  todayView,
} from "../today-model.ts";
import { AlbumStrip, LastSketchCard, NextUnlockCard, OakGlanceCard, TutorNoteCard } from "./Glance.tsx";
import { WeeklyRhythm } from "./WeeklyRhythm.tsx";

function amountOf(r: SetlistRow): string {
  return r.unit === "s" ? `${r.amount} s` : `${r.amount} min`;
}

function Setlist({ rows }: { rows: SetlistRow[] }) {
  return (
    <ol className="flex flex-col divide-y divide-border" data-testid="setlist">
      {rows.map((r, i) => (
        <li key={r.key} className="flex gap-4 py-3" data-row={r.key}>
          <span aria-hidden className="w-5 shrink-0 text-right font-display text-h3 leading-6 text-text-3">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {r.label} <span className="font-normal text-text-2">· {amountOf(r)}</span>
            </p>
            <p className="text-text-2">{r.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Header({ boot }: { boot: ReturnType<typeof useBootstrap> }) {
  const streak = useStreak(2);
  const b = boot.data;
  const lastClosed = streak.data?.weeks.filter((w) => w.status !== "open").at(-1) ?? null;
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div>
        <h1 className="text-h1">
          {b
            ? new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(new Date(`${b.day}T12:00:00`))
            : "Today"}
        </h1>
        <p className="text-sm text-text-2">{b ? daysLine(b.streak) : " "}</p>
      </div>
      {b ? (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <WeeklyRhythm streak={b.streak} today={b.day} />
          <div className="flex flex-col">
            <span className="text-sm text-text-2" data-testid="goal-line">
              {goalLine(b.streak)}
            </span>
            {restsLine(b.streak) && <span className="text-sm text-text-3">{restsLine(b.streak)}</span>}
          </div>
          <Chip tone="accent" title="Weeks in a row that met your weekly goal" data-testid="streak-chip">
            {streakLine(b.streak, lastClosed)}
          </Chip>
        </div>
      ) : (
        <Skeleton className="h-8 w-72" />
      )}
    </header>
  );
}

function PrimaryAction({
  view,
  plan,
  onStart,
  onResume,
  starting,
}: {
  view: TodayView;
  plan: SessionPlan;
  onStart(p: SessionPlan): void;
  onResume(): void;
  starting: boolean;
}) {
  const onboarding = useOnboarding();
  if (!view.primary) return null;
  if (view.primary.action === "onboarding")
    return (
      <Link
        to="/onboarding/$step"
        params={{ step: onboarding.data?.step ?? "welcome" }}
        className={buttonClass("primary", "lg")}
        data-testid="begin-onboarding"
      >
        Begin <ArrowRight aria-hidden className="size-4" />
      </Link>
    );
  const resume = view.primary.action === "resume";
  return (
    <Button
      variant="primary"
      size="lg"
      loading={starting}
      onClick={() => (resume ? onResume() : onStart(plan))}
      icon={<Play aria-hidden className="size-4" />}
      data-testid="start-session"
    >
      {view.primary.label} <kbd className="ml-1 font-mono text-[0.75rem] opacity-70">⏎</kbd>
    </Button>
  );
}

function DoneCard({
  plan,
  titles,
  edge,
  hasCoda,
  onStart,
}: {
  plan: SessionPlan;
  titles: Map<string, string>;
  edge: CourseEdge | null;
  /** Today's Coda can be shown (a session ended today has a summary; onboarding's Coda was its own). */
  hasCoda: boolean;
  onStart(): void;
}) {
  const next = plan.mapItemId
    ? titleOf(plan.mapItemId, titles)
    : plan.kind === "review"
      ? edge
        ? `a review day. ${edgeShort(edge)}.`
        : "a review day"
      : null;
  return (
    <div className="flex flex-col gap-4" data-testid="today-done">
      {next && (
        <p>
          <span className="text-text-2">Next time: </span>
          <span className="font-medium">
            {next}
            {plan.main?.resumeStep ? `, from step ${plan.main.resumeStep.replace(/^S/, "")}` : ""}
          </span>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {hasCoda && (
          <Link to="/session/coda" className={buttonClass("secondary", "md")} data-testid="see-coda">
            Today's Coda
          </Link>
        )}
        <Link to="/studio" className={buttonClass("secondary", "md")}>
          Keep playing in Studio
        </Link>
        <Link to="/practice" className={buttonClass("secondary", "md")}>
          Free practice
        </Link>
        <Button variant="ghost" onClick={onStart}>
          Start another session
        </Button>
      </div>
    </div>
  );
}

export function TodayPage() {
  usePageTitle("Today");
  useRunnerNavigator();
  const boot = useBootstrap();
  const plan = useTodayPlan();
  const content = useContent();
  const warm = useTutorWarm();
  const profile = useProfileUpdate();
  const setLadder = useVoiceLadder();
  const sessionDay = useSessionDay();
  const voice = useVoiceState();
  const progress = useCourseProgress();
  const ended = useLastEnded();
  const starting = useRunnerView((v) => v.starting);
  const qc = useQueryClient();
  const titles = lessonTitles(content.data?.syllabus ?? null);
  const stepsOf = (id: string) => content.data?.lessons.find((l) => l.id === id)?.steps.length ?? null;
  const edge = courseEdge(
    progress.data,
    content.data?.syllabus ?? null,
    new Set((content.data?.lessons ?? []).map((l) => l.id as string)),
    plan.data ?? null,
  );
  const ladder = voice.data?.ladder ?? null;
  const lastEnded = ended ? { ...ended, endedAt: ended.summary?.session.endedAt ?? null } : null;

  const view =
    plan.data && boot.data
      ? todayView({
          plan: plan.data,
          boot: boot.data,
          lastEnded,
          // The server's record of today (wave3.md §5.1); while it loads (or offline) the bootstrap and this
          // browser's last ended session decide, as in Wave 2.
          server: sessionDay.data ?? null,
          titleOf: (id) => titleOf(id, titles),
          stepsOf,
          edge,
          ladder: ladder ? { cents: ladder.cents, offerLoosen: ladder.offerLoosen } : null,
        })
      : null;
  // Today's Coda exists when a session with a summary ended today: the server's record, or this browser's.
  const hasCoda =
    !!sessionDay.data?.summarySessionId ||
    (!!ended?.summary &&
      !!boot.data &&
      (ended.day === boot.data.day || ended.summary.session.day === boot.data.day));

  const onStart = async (p: SessionPlan) => {
    try {
      await sessionRunner.start(p);
      // The open session is now on the server: a Back to Today (or Today in another tab) must offer to resume
      // it, not to start a second one, so the bootstrap's `openSession` and today's sessions are read again.
      void qc.invalidateQueries({ queryKey: ["api", "bootstrap"] });
      void qc.invalidateQueries({ queryKey: ["api", "session.day"] });
      // Warms the tutor's prompt cache in the background; the tutor is optional, so failures are ignored.
      warm.mutate(undefined as never, { onError: () => {} });
    } catch (e) {
      toast.error("The session didn't start", e instanceof Error ? e.message : undefined);
    }
  };
  const onResume = async () => {
    const open = sessionDay.data?.open ?? boot.data?.openSession;
    if (!open || !plan.data) return;
    try {
      await sessionRunner.resume(open, plan.data);
    } catch (e) {
      toast.error("The session didn't resume", e instanceof Error ? e.message : undefined);
    }
  };
  const loosenFrom = ladder?.cents ?? boot.data?.profile.singToleranceCents ?? 70;
  const loosen = async () => {
    if (loosenFrom >= 70) return;
    try {
      // The ladder is the only writer of the tolerance in Auto (wave3.md §5.3): the one-tap loosen goes to
      // `PUT /voice/ladder { mode: "loosen" }`, and the answer says where the ladder now stands. Only a server
      // without the voice endpoints (501) gets the Wave 2 profile write.
      let to: number;
      try {
        const state = await setLadder.mutateAsync({ body: { mode: "loosen" } });
        to = state.ladder.cents;
      } catch (e) {
        if (!(e instanceof OakApiError && e.code === "not_implemented")) throw e;
        to = looserTolerance(loosenFrom);
        await profile.mutateAsync({ body: { singToleranceCents: to as 35 | 50 | 70 } });
      }
      toast.success(`Singing is checked at ±${to}¢ now.`);
    } catch (e) {
      toast.error("That didn't save", e instanceof Error ? e.message : undefined);
    }
  };

  useHotkeys([
    {
      id: "today-start",
      keys: "Enter",
      scope: "global",
      group: "Today",
      description: "Start or resume the session",
      when: (ctx) =>
        !ctx.onControl &&
        !ctx.inEditable &&
        !!view?.primary &&
        view.primary.action !== "onboarding" &&
        !starting,
      run: () => {
        if (!view?.primary || !plan.data) return;
        if (view.primary.action === "resume") void onResume();
        else void onStart(plan.data);
      },
    },
  ]);

  if (boot.isError && plan.isError)
    return (
      <Page>
        <ErrorState error={boot.error} onRetry={() => void boot.refetch()} />
      </Page>
    );

  const b = boot.data;
  return (
    <Page>
      <Header boot={boot} />
      <div className="grid gap-6 lg:grid-cols-12">
        <section aria-labelledby="setlist-h" className="flex flex-col gap-4 lg:col-span-8">
          <Card className="p-5" data-testid="today-card" data-state={view?.state}>
            {plan.isError ? (
              <ErrorState error={plan.error} onRetry={() => void plan.refetch()} />
            ) : !view || !plan.data ? (
              <LoadingState rows={4} label="Planning today" />
            ) : (
              <>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <h2 id="setlist-h" className="text-h2">
                    {view.heading}
                  </h2>
                  {view.state !== "done" && view.state !== "first-run" && (
                    <span className="shrink-0 text-sm text-text-3">{view.length}</span>
                  )}
                </div>
                {view.lead && <p className="mb-2 max-w-[62ch] text-text-2">{view.lead}</p>}
                {view.state === "done" ? (
                  <DoneCard
                    plan={plan.data}
                    titles={titles}
                    edge={edge}
                    hasCoda={hasCoda}
                    onStart={() => void onStart(plan.data)}
                  />
                ) : view.state === "first-run" ? (
                  <div className="mt-4">
                    <PrimaryAction
                      view={view}
                      plan={plan.data}
                      onStart={onStart}
                      onResume={onResume}
                      starting={starting}
                    />
                  </div>
                ) : (
                  <>
                    {view.state !== "in-session" && <Setlist rows={view.rows} />}
                    <div className="mt-4 flex flex-col items-center gap-2">
                      <PrimaryAction
                        view={view}
                        plan={plan.data}
                        onStart={(p) => void onStart(p)}
                        onResume={() => void onResume()}
                        starting={starting}
                      />
                      {view.keepAlive && (
                        <button
                          type="button"
                          className="text-sm text-link underline-offset-2 hover:underline"
                          onClick={() => void onStart(keepAlivePlan(plan.data))}
                          data-testid="keep-alive"
                        >
                          Short on time? A Keep-alive: one easy set, about 2 minutes
                        </button>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </Card>
          {view?.restDay && (
            <Callout tone="success" title="This week's goal is met">
              Today is a free rest. Playing is welcome, and nothing is lost by resting.
            </Callout>
          )}
          {b?.streak.repair && view?.state !== "first-run" && (
            <Callout tone="attention" title="An open tie on last week">
              {repairLine(b.streak.repair, b.profile.timezone)}
            </Callout>
          )}
          {view?.offerLoosen && b && (
            <Callout
              tone="info"
              title="Ease into singing again?"
              actions={
                <Button
                  size="sm"
                  onClick={() => void loosen()}
                  loading={profile.isPending || setLadder.isPending}
                  data-testid="loosen"
                >
                  Check singing at ±{looserTolerance(loosenFrom as 25 | 35 | 50 | 70)}¢
                </Button>
              }
            >
              One step looser for now. It tightens again as your voice settles; nothing changes unless you
              choose it.
            </Callout>
          )}
          {/* The done card carries its own ways on (Studio, free practice): never twice. */}
          {plan.data &&
            view &&
            view.state !== "first-run" &&
            view.state !== "in-session" &&
            view.state !== "done" && (
              <nav aria-label="Other ways today" className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-text-2">Other ways today:</span>
                {plan.data.alternatives
                  // The main item itself is not "another way" (a capstone day listed its own capstone again).
                  .filter((a) => !(a.mapItemId !== null && a.mapItemId === plan.data.mapItemId))
                  .map((a) => (
                    <Link
                      key={`${a.kind}:${a.mapItemId ?? ""}`}
                      {...(a.kind === "studio" ? { to: "/studio" as const } : routeOfItem(a.mapItemId))}
                      className={buttonClass("secondary", "sm")}
                    >
                      {a.title}
                    </Link>
                  ))}
                <Link to="/practice" className={buttonClass("ghost", "sm")}>
                  Practice
                </Link>
                {/* A review day's plan names Studio itself (the server's alternative); never twice. */}
                {!plan.data.alternatives.some((a) => a.kind === "studio") && (
                  <Link to="/studio" className={buttonClass("ghost", "sm")}>
                    Studio
                  </Link>
                )}
              </nav>
            )}
        </section>

        <aside className="flex flex-col gap-4 lg:col-span-4" aria-label="At a glance">
          <NextUnlockCard />
          <OakGlanceCard />
          <AlbumStrip />
          <LastSketchCard />
          {plan.data?.tutorNote && <TutorNoteCard note={plan.data.tutorNote} />}
          {!b && <Skeleton className="h-24 w-full" />}
          <p className="flex items-center gap-1.5 text-sm text-text-3">
            <Leaf aria-hidden className="size-3.5" /> Spacing beats cramming: a little most days grows the
            Oak.
          </p>
        </aside>
      </div>
    </Page>
  );
}
