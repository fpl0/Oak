// One view per block of the session host: the warm-up runner (drills), the lesson player and the checkpoint player
// (lesson), the capstone workspace (capstone), mounted in place. Each reports its block with `reportBlockDone`;
// the session advances (contracts §9.3). The gym day's block is GymBlock.tsx (Transcribe's project page in place).
import { type CheckpointId, checkpointRouteParam, parseCapstoneSessionId, type SessionPlan } from "@oak/api";
import { CapstoneScreen } from "../../capstone/CapstoneScreen.tsx";
import { WarmUp } from "../../drills/WarmUp.tsx";
import { CheckpointPlayer } from "../../lesson/checkpoint/CheckpointPlayer.tsx";
import { LessonPlayer } from "../../lesson/LessonPlayer.tsx";
import { LoadingState } from "../../ui/kit/index.ts";
import { nextBlock, useSession } from "../store.ts";

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
