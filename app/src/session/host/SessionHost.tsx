// /session: the session host. It shows the calm header and the block the learner is in — the warm-up (drills),
// the recap after a break, the New block (lesson, checkpoint, capstone, gym or light session), the Make or the
// Quick sketch — and hands over to the Coda. It is a focus route: the shell's focus header carries "Today". Nothing auto-advances into another lesson: the next block comes
// only from the current one reporting (contracts §9.3). A reload or a visit elsewhere resumes here.
import { useNavigate } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLessonPublic } from "../../lesson/public.ts";
import { useContent } from "../../lib/content.ts";
import { lessonTitles } from "../../lib/content-model.ts";
import { usePageTitle } from "../../lib/nav.ts";
import { useBootstrap, useSessionDay, useTodayPlan } from "../../lib/queries.ts";
import { ownOpenSession } from "../../lib/tab-session.ts";
import { useHotkeys } from "../../ui/keys/KeymapProvider.tsx";
import { Button } from "../../ui/kit/Button.tsx";
import { Card, Kbd, Page } from "../../ui/kit/basics.tsx";
import { ErrorState, LoadingState } from "../../ui/kit/QueryState.tsx";
import { useRunnerNavigator, useRunnerView } from "../hooks.ts";
import { itemTitle as titleOf } from "../titles.ts";

const useRunnerViewState = () => sessionRunner.view.getState();

import { useCapstoneDay, useCapstoneDaySettled, useCapstoneDef, useCftDay } from "../day-hooks.ts";
import { sessionRunner } from "../live.ts";
import { resumeDecision } from "../resume-once.ts";
import { useSession } from "../store.ts";
import { CapstoneView, CheckpointView, LessonView, WarmupView } from "./BlockViews.tsx";
import { CapstoneResume } from "./CapstoneResume.tsx";
import { GymBlock } from "./GymBlock.tsx";
import { RecapCard } from "./RecapCard.tsx";
import { PAUSE_KEY_LABEL, PAUSE_KEYS, SessionHeader } from "./SessionHeader.tsx";
import { SketchBlock } from "./SketchBlock.tsx";

function Paused() {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div
      className="absolute inset-0 z-10 flex items-start justify-center bg-bg/85 pt-16"
      data-testid="paused"
    >
      <Card className="flex max-w-md flex-col items-center gap-3 p-6 text-center">
        <h2 className="text-h2">Paused</h2>
        <p className="text-text-2">Your place is kept. Nothing counts while you're away.</p>
        <Button
          ref={ref}
          variant="primary"
          size="lg"
          onClick={() => sessionRunner.resumeClock()}
          icon={<Play aria-hidden className="size-4" />}
          data-testid="resume"
        >
          Resume <Kbd tone="inverse">{PAUSE_KEY_LABEL}</Kbd>
        </Button>
      </Card>
    </div>
  );
}

function Body() {
  const plan = useSession((s) => s.plan);
  const session = useSession((s) => s.session);
  const block = useSession((s) => s.block);
  const warmupIndex = useSession((s) => s.warmupIndex);
  const last = useSession((s) => s.reports.at(-1));
  const recapDone = useRunnerView((v) => v.recapDone);
  // A later capstone session resumes by playing the draft from the top (CapstoneResume), once per session.
  const capstone = useCapstoneDay(plan);
  const capDef = useCapstoneDef(capstone?.capstoneId ?? null);
  const capstoneSettled = useCapstoneDaySettled(plan);
  const cft = useCftDay(plan);
  const [resumed, setResumed] = useState(false);
  if (!plan || !session || !block) return null;
  const sessionId = session.id;
  switch (block) {
    case "warmup":
      return <WarmupView plan={plan} index={warmupIndex} sessionId={sessionId} />;
    case "new": {
      if (plan.returning?.recap && !recapDone)
        return <RecapCard plan={plan} onContinue={() => sessionRunner.recapShown()} />;
      switch (plan.kind) {
        case "lesson":
          return <LessonView plan={plan} />;
        case "checkpoint":
          return <CheckpointView plan={plan} />;
        case "capstone": {
          const showResume = resumeDecision(session.id, capstoneSettled, capstone?.resume === true);
          if (showResume === null) return <LoadingState rows={2} label="Opening the capstone" />;
          if (showResume && capstone && !resumed)
            return (
              <CapstoneResume
                day={capstone}
                sessionId={session.id}
                kind={capDef?.kind ?? null}
                where={cft?.where ?? null}
                onContinue={() => setResumed(true)}
              />
            );
          return <CapstoneView plan={plan} />;
        }
        case "gym":
          return <GymBlock plan={plan} session={session} />;
        case "light":
          return (
            <SketchBlock
              mode="light"
              lessonId={plan.main?.light?.lessonId ?? null}
              constraint={plan.main?.light?.constraint ?? null}
            />
          );
        default:
          return null;
      }
    }
    case "make": {
      if (plan.kind === "keepalive") return <SketchBlock mode="riff" />;
      const lessonGoesOn = last?.block === "new" && last.completed;
      // The mounted lesson player does its own Make, and its own Quick sketch after "Wrap up" (it hears the
      // session's wrap through the store); it stays mounted from the New block.
      if (plan.kind === "lesson") return <LessonView plan={plan} />;
      if (plan.kind === "checkpoint" && lessonGoesOn) return <CheckpointView plan={plan} />;
      return <SketchBlock mode="quick" lessonId={null} />;
    }
    case "coda":
      return <LoadingState rows={2} label="Closing the session" />;
  }
}

export function SessionHost() {
  usePageTitle("Session");
  useRunnerNavigator();
  const navigate = useNavigate();
  const boot = useBootstrap();
  const today = useTodayPlan();
  const content = useContent();
  const plan = useSession((s) => s.plan);
  const live = useSession((s) => s.session !== null);
  const paused = useRunnerView((v) => v.paused);
  const titles = lessonTitles(content.data?.syllabus ?? null);
  // The lesson player's own "Wrap up" opens its Quick sketch: the session follows (block → Make, wrapped early).
  // At the 15-minute split the midpoint is planned, not a wrap-up.
  const lessonWrapping = useLessonPublic((s) => s.lesson?.status === "wrapping");
  const block = useSession((s) => s.block);
  useEffect(() => {
    if (lessonWrapping && block === "new" && plan?.kind === "lesson" && plan.main?.splitPart !== "A")
      sessionRunner.wrapUp();
  }, [lessonWrapping, block, plan]);

  useHotkeys([
    {
      id: "session-pause",
      keys: PAUSE_KEYS,
      scope: "global",
      group: "Session",
      description: "Pause or resume the session",
      when: () => live && block !== null && block !== "coda",
      run: () => (useRunnerViewState().paused ? sessionRunner.resumeClock() : sessionRunner.pause()),
    },
  ]);

  // No session in this tab (a reload, a bookmark): resume the one THIS tab left open today, or go back to Today.
  // d21: another tab's open session is never joined (`ownOpenSession`); while today's sessions load, wait.
  const day = useSessionDay();
  useEffect(() => {
    if (sessionRunner.active() || !boot.data || !today.data) return;
    if (day.isPending) return;
    const open = day.data ? ownOpenSession(day.data) : null;
    if (open && open.day === boot.data.day) void sessionRunner.resume(open, today.data).catch(() => {});
    else void navigate({ to: "/", replace: true });
  }, [boot.data, today.data, navigate, day.isPending, day.data]);

  if (!live || !plan) {
    if (boot.isError)
      return (
        <Page>
          <ErrorState error={boot.error} onRetry={() => void boot.refetch()} />
        </Page>
      );
    return (
      <Page>
        <LoadingState rows={4} label="Opening your session" />
      </Page>
    );
  }
  const title = plan.main?.light
    ? titleOf(plan.main.light.lessonId, titles)
    : plan.mapItemId
      ? titleOf(plan.mapItemId, titles)
      : plan.title;

  return (
    <Page width="full" className="flex flex-col gap-4">
      <SessionHeader title={title} lessonHasWrap={plan.kind === "lesson"} />
      <div className="relative min-h-[50vh]">
        <div inert={paused} aria-hidden={paused || undefined}>
          <Body />
        </div>
        {paused && <Paused />}
      </div>
    </Page>
  );
}
