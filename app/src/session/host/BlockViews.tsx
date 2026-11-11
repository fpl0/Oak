// One view per block of the session host: the warm-up runner (drills), the lesson player and the checkpoint player
// (lesson), the capstone workspace (capstone), mounted in place. Each reports its block with `reportBlockDone`;
// the session advances (contracts §9.3). Only the Transcription Gym is handed to its own route (`RouteHandoff`).
import { type CheckpointId, checkpointRouteParam, parseCapstoneSessionId, type SessionPlan } from "@oak/api";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useEffect, useRef } from "react";
import { CapstoneScreen } from "../../capstone/CapstoneScreen.tsx";
import { WarmUp } from "../../drills/WarmUp.tsx";
import { CheckpointPlayer } from "../../lesson/checkpoint/CheckpointPlayer.tsx";
import { LessonPlayer } from "../../lesson/LessonPlayer.tsx";
import type { Target } from "../../lib/session-route.ts";
import { Button } from "../../ui/kit/Button.tsx";
import { Card, LoadingState } from "../../ui/kit/index.ts";
import { nextBlock, useSession } from "../store.ts";

/** Hands the block to its own route (replace: Back returns to where the learner was before the session). */
export function RouteHandoff({ to, what }: { to: Target; what: string }) {
  const navigate = useNavigate();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void navigate({ ...(to as { to: "/" }), replace: true });
  }, [navigate, to]);
  return (
    <Card className="mx-auto flex max-w-xl flex-col items-start gap-3 p-6" data-testid="route-handoff">
      <h2 className="text-h3">Opening {what}…</h2>
      <p className="text-text-2">
        It opens in its own player. The session keeps your time and brings you back.
      </p>
      <Button
        variant="secondary"
        onClick={() => void navigate({ ...(to as { to: "/" }) })}
        icon={<ArrowRight aria-hidden className="size-4" />}
      >
        Open {what}
      </Button>
    </Card>
  );
}

export function WarmupView({
  plan,
  index,
  sessionId,
}: {
  plan: SessionPlan;
  index: number;
  sessionId: string;
}) {
  if (!plan.warmup.items[index]) return <LoadingState rows={2} label="Next set" />;
  // The warm-up may stop early when its minute budget is spent (the rest stay due): then move on.
  const onDone = () => {
    const s = useSession.getState();
    if (s.block === "warmup" && s.plan) s.enter(nextBlock("warmup", s.plan) ?? "coda");
  };
  const next = plan.kind === "lesson" || plan.kind === "light" ? "On to the lesson" : "Continue";
  return (
    <WarmUp
      batch={plan.warmup}
      sessionId={sessionId}
      index={index}
      onDone={onDone}
      doneLabel={next}
      header={false}
    />
  );
}

export function LessonView({ plan }: { plan: SessionPlan }) {
  const lessonId = plan.mapItemId ?? "";
  // The player reads the session (id, split part, wrap) from the session store itself.
  return <LessonPlayer key={lessonId} lessonId={lessonId} step={plan.main?.resumeStep ?? undefined} />;
}

export function CheckpointView({ plan }: { plan: SessionPlan }) {
  const cpId = plan.mapItemId ?? "";
  return <CheckpointPlayer key={cpId} unitId={checkpointRouteParam(cpId as CheckpointId)} />;
}

export function CapstoneView({ plan }: { plan: SessionPlan }) {
  const parsed = plan.mapItemId ? parseCapstoneSessionId(plan.mapItemId) : null;
  const capstoneId = parsed?.capstone ?? plan.mapItemId ?? "";
  return <CapstoneScreen key={capstoneId} id={capstoneId} />;
}
