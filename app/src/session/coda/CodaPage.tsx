// The Coda (contracts §9.3, ux §1.5): only cards whose state changed today — the sketch saved, what you can now
// do, tools unlocked (with "Try it" in Studio), skills that moved on the Oak, a tolerance change, the weekly
// rhythm — then Claude's listening note (on demand; automatic in the first week and after a capstone session,
// contracts §10.10), what's next, and "Done for today".
import type { SessionSummary } from "@oak/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { clsx } from "clsx";
import { ArrowRight, Ear } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useContent } from "../../lib/content.ts";
import { lessonTitles, titleOf } from "../../lib/content-model.ts";
import { usePageTitle } from "../../lib/nav.ts";
import {
  apiQuery,
  useBootstrap,
  useCourseProgress,
  useSkillMap,
  useTodayPlan,
  useUnlocks,
} from "../../lib/queries.ts";
import { toolLabel } from "../../lib/tool-label.ts";
import { UnlockMoment } from "../../toolbox/index.ts";
import { askListeningNote, useTutorContext } from "../../tutor/context.ts";
import { useHotkeys } from "../../ui/keys/KeymapProvider.tsx";
import { Button, buttonClass } from "../../ui/kit/Button.tsx";
import { Card, Chip, Page } from "../../ui/kit/basics.tsx";
import { Callout } from "../../ui/kit/Controls.tsx";
import { LoadingState } from "../../ui/kit/QueryState.tsx";
import { useFocusHeaderContent } from "../../ui/shell/focus-header.ts";
import {
  autoListen,
  canDoChanges,
  goalGradient,
  LEVEL_LABEL,
  skillMoves,
  TOLERANCE_LINE,
  todayLines,
  tomorrowLine,
  toolCards,
} from "../coda-model.ts";
import { useLastEnded, useRunnerNavigator, useRunnerView } from "../hooks.ts";
import { sessionRunner } from "../live.ts";
import type { EndedRecord } from "../persist.ts";
import { useSession } from "../store.ts";
import { goalLine, streakLine } from "../streak-model.ts";
import { useNextUnlockList } from "../today/Glance.tsx";
import { WeeklyRhythm } from "../today/WeeklyRhythm.tsx";

/** Server reads that a finished session changes. */
const SESSION_ENDED_KEYS = [
  "bootstrap",
  "session.today",
  "skills.map",
  "streak.get",
  "lessons.progress",
  "progress.get",
  "sketches.list",
  "unlocks.list",
  "unlocks.next",
  "cando.list",
];

const STATUS_TONE = { emerging: "amber", solid: "accent", strong: "accent", fading: "neutral" } as const;

function Section({ title, children, testId }: { title: string; children: React.ReactNode; testId: string }) {
  return (
    <Card className="p-4 animate-fade-in" data-testid={testId}>
      <h2 className="mb-2 text-h3">{title}</h2>
      {children}
    </Card>
  );
}

function SketchCard({ sketchId }: { sketchId: string }) {
  const sketch = useQuery(apiQuery("sketches.get", { params: { id: sketchId } }));
  return (
    <Section title="Sketch saved" testId="coda-sketch">
      {sketch.data ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-medium">{sketch.data.title}</span>
          <Link
            to="/studio/$sketchId"
            params={{ sketchId }}
            className="text-sm text-link underline-offset-2 hover:underline"
          >
            Open in Studio
          </Link>
        </p>
      ) : (
        <p className="text-text-2">Saved to your sketchbook.</p>
      )}
    </Section>
  );
}

function ListeningNote({ summary, sketchId }: { summary: SessionSummary; sketchId: string | null }) {
  const sketch = useQuery({
    ...apiQuery("sketches.get", { params: { id: sketchId ?? "" } }),
    enabled: !!sketchId,
  });
  const availability = useTutorContext((s) => s.availability);
  const asked = useRef(false);
  const code = sketch.data?.versions.find((v) => v.version === sketch.data?.currentVersion)?.code ?? null;
  const ask = () => {
    if (!sketchId || !code || !sketch.data) return;
    asked.current = true;
    askListeningNote({ sketchId, title: sketch.data.title, code });
  };
  // Automatic only in the first 7 days and after a capstone session (contracts §10.10); it never blocks.
  useEffect(() => {
    if (asked.current || availability !== "ready" || !code) return;
    if (autoListen(summary.listeningNote, sketchId)) ask();
  });
  if (summary.listeningNote === "off" || !sketchId) return null;
  return (
    <Section title="Claude's listening note" testId="coda-listen">
      <div className="flex flex-wrap items-center gap-3">
        {summary.listeningNote === "auto" ? (
          <p className="text-text-2">
            Claude is listening to your sketch; the note appears in the tutor panel.
          </p>
        ) : (
          <Button
            variant="secondary"
            onClick={ask}
            disabled={!code}
            icon={<Ear aria-hidden className="size-4" />}
            data-testid="ask-listen"
          >
            Ask Claude to listen
          </Button>
        )}
      </div>
      <p className="mt-2 text-sm text-text-3">Claude reads your code and score, never your audio.</p>
    </Section>
  );
}

function CodaBody({ summary, ended }: { summary: SessionSummary; ended: EndedRecord | null }) {
  const content = useContent();
  const map = useSkillMap();
  const course = useCourseProgress();
  const next = useNextUnlockList();
  const titles = lessonTitles(content.data?.syllabus ?? null);
  const name = (id: string) => content.data?.skills.nodes.find((n) => n.id === id)?.name ?? id;
  const baseline = ended?.baseline ?? { levels: [], canDo: [] };
  const reports = ended?.reports ?? [];
  const lines = todayLines(reports, (id) => titleOf(id, titles), summary.sketchesSaved.length);
  const cando = canDoChanges(summary.canDo, new Map(baseline.canDo), content.data?.candos ?? []);
  const tools = toolCards(summary.unlocks, content.data?.toolbox ?? []);
  const moves = map.data ? skillMoves(new Map(baseline.levels), map.data.nodes, name) : [];
  const nextId = course.data?.next ?? null;
  const tomorrow = tomorrowLine(summary, nextId ? { id: nextId, title: titleOf(nextId, titles) } : null);
  const gradient = next.items?.[0];
  const gradientTool = gradient ? content.data?.toolbox.find((t) => t.id === gradient.itemId) : undefined;
  const wrapped = ended?.wrappedEarly === true || reports.some((r) => r.block === "new" && !r.completed);

  // The unlock ceremony (ux §5.1) plays here once for the tools not seen yet, judged by the live unlock list so a
  // reload does not replay it; the moment marks them seen (they stay replayable from the Toolbox).
  const unlocks = useUnlocks();
  const [moment, setMoment] = useState<readonly string[] | null>(null);
  const refetched = useRef(false);
  useEffect(() => {
    if (moment !== null || !unlocks.data || unlocks.isFetching) return;
    const listed = new Map(unlocks.data.items.map((u) => [u.itemId as string, u.seen]));
    // A list from before the session ended does not know today's unlocks yet: read it again first.
    if (!refetched.current && summary.unlocks.some((u) => !listed.has(u.itemId))) {
      refetched.current = true;
      void unlocks.refetch();
      return;
    }
    setMoment(summary.unlocks.filter((u) => listed.get(u.itemId) === false).map((u) => u.itemId));
  }, [moment, unlocks, summary.unlocks]);
  const ceremony = moment !== null && moment.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-h1" data-testid="coda-title">
          {wrapped ? "A good place to stop." : "Session complete."}
        </h1>
        {lines.length > 0 && (
          <p className="mt-1 text-text-2" data-testid="coda-today">
            Today you: {lines.join(" · ")}
          </p>
        )}
      </header>

      {summary.sketchesSaved[0] && <SketchCard sketchId={summary.sketchesSaved[0]} />}

      {cando.length > 0 && (
        <Section title="What you can do now" testId="coda-cando">
          <ul className="flex flex-col gap-2">
            {cando.map((c) => (
              <li key={c.candoId} className="flex flex-wrap items-center justify-between gap-2">
                <span>{c.statement}</span>
                <span className="flex items-center gap-1.5 text-sm">
                  {c.from && (
                    <>
                      <Chip tone={STATUS_TONE[c.from]}>{c.from}</Chip>
                      <ArrowRight aria-label="now" className="size-3.5 text-text-3" />
                    </>
                  )}
                  <Chip tone={STATUS_TONE[c.to]}>{c.to}</Chip>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {ceremony && (
        <section aria-label="New in your toolbox" data-testid="coda-unlock-moment">
          <UnlockMoment toolIds={moment} onDone={() => setMoment([])} continueLabel="See the rest of today" />
        </section>
      )}

      {tools.length > 0 && !ceremony && (
        <Section
          title={tools.length === 1 ? "New in your toolbox" : "New in your toolbox"}
          testId="coda-tools"
        >
          <ul className="flex flex-col gap-3">
            {tools.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  {toolLabel(t).mono ? (
                    <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono">{toolLabel(t).text}</code>
                  ) : (
                    <span className="font-medium">{toolLabel(t).text}</span>
                  )}
                  {t.concept && <p className="mt-1 text-sm text-text-2">{t.concept}</p>}
                </div>
                <span className="flex shrink-0 items-center gap-2">
                  <Link to="/studio" search={{ try: t.id }} className={buttonClass("secondary", "sm")}>
                    Try it in Studio
                  </Link>
                  <Link
                    to="/toolbox/$toolId"
                    params={{ toolId: t.id }}
                    className={buttonClass("ghost", "sm")}
                  >
                    About it
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {moves.length > 0 && (
        <Section title="On the Oak" testId="coda-oak">
          <ul className="flex flex-col gap-1.5">
            {moves.slice(0, 6).map((m) => (
              <li key={m.skillId} className="flex flex-wrap items-center justify-between gap-2">
                <span>{m.name}</span>
                <span className="text-sm text-text-2">
                  {LEVEL_LABEL[m.from]} → <span className="text-text">{LEVEL_LABEL[m.to]}</span>
                </span>
              </li>
            ))}
          </ul>
          {moves.length > 6 && <p className="mt-1 text-sm text-text-3">and {moves.length - 6} more</p>}
          <Link
            to="/oak"
            search={{ view: "tree" }}
            className="mt-2 inline-block text-sm text-link underline-offset-2 hover:underline"
          >
            Open the Oak
          </Link>
        </Section>
      )}

      {summary.toleranceChange && <Callout tone="success" title={TOLERANCE_LINE(summary.toleranceChange)} />}

      <ListeningNote summary={summary} sketchId={summary.sketchesSaved[0] ?? null} />

      <Section title="This week" testId="coda-week">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <WeeklyRhythm streak={summary.streak} today={summary.session.day} size="lg" />
          <span className="text-text-2">
            {goalLine(summary.streak)} · {streakLine(summary.streak)}
          </span>
        </div>
      </Section>

      {(tomorrow || gradient) && (
        <Section title="Next" testId="coda-next">
          {tomorrow && <p>{tomorrow}</p>}
          {gradient && (
            <p className="text-sm text-text-2">
              {goalGradient(gradient, "")}
              <code className="font-mono">{gradientTool?.code ?? gradient.itemId}</code>
            </p>
          )}
        </Section>
      )}
    </div>
  );
}

export function CodaPage() {
  usePageTitle("Coda");
  useFocusHeaderContent("Coda");
  useRunnerNavigator();
  const navigate = useNavigate();
  const boot = useBootstrap();
  const today = useTodayPlan();
  const status = useRunnerView((v) => v.status);
  const liveSummary = useRunnerView((v) => v.summary);
  const endError = useRunnerView((v) => v.endError);
  const ended = useLastEnded();
  const inSession = useSession((s) => s.session !== null);
  const summary = liveSummary ?? ended?.summary ?? null;
  const doneRef = useRef<HTMLButtonElement>(null);

  // A reload with nothing saved here: resume the open session (it reaches the Coda again), or go home.
  useEffect(() => {
    if (summary || inSession || sessionRunner.active() || !boot.data || !today.data) return;
    const open = boot.data.openSession;
    if (open && open.day === boot.data.day) void sessionRunner.resume(open, today.data).catch(() => {});
    else void navigate({ to: "/", replace: true });
  }, [summary, inSession, boot.data, today.data, navigate]);

  // The session is over on the server: what Today, the map and Progress show has changed.
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!summary) return;
    doneRef.current?.focus();
    for (const key of SESSION_ENDED_KEYS) void queryClient.invalidateQueries({ queryKey: ["api", key] });
  }, [summary, queryClient]);

  const done = () => sessionRunner.finish();
  useHotkeys([
    {
      id: "coda-done",
      keys: "Enter",
      scope: "global",
      group: "Coda",
      description: "Done for today",
      when: (c) => !c.onControl && !c.inEditable && summary !== null,
      run: done,
    },
  ]);

  return (
    <Page width="narrow">
      {summary ? (
        <>
          <CodaBody summary={summary} ended={ended} />
          <div className={clsx("mt-6 flex flex-wrap items-center gap-2")}>
            <Button ref={doneRef} variant="primary" size="lg" onClick={done} data-testid="done-for-today">
              Done for today <kbd className="ml-1 font-mono text-[0.75rem] opacity-70">⏎</kbd>
            </Button>
            <Link
              to="/studio"
              className={buttonClass("secondary", "lg")}
              onClick={() => sessionRunner.finish(null)}
            >
              Keep playing in Studio
            </Link>
          </div>
          <p className="mt-3 text-sm text-text-3">Stopping here is good practice: spacing beats cramming.</p>
        </>
      ) : status === "end-failed" ? (
        <Callout
          tone="issue"
          title="The session didn't close"
          actions={
            <Button size="sm" variant="primary" onClick={() => sessionRunner.retryEnd()}>
              Try again
            </Button>
          }
        >
          {endError ?? "The server didn't answer."} Everything you did is saved.
        </Callout>
      ) : (
        <LoadingState rows={4} label="Closing the session" />
      )}
    </Page>
  );
}
