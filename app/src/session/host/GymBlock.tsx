// The New block of a gym day (contracts §2.5, §9.1; wave4.md §5.5): the session starts its gym session
// (`gym.start`, the learner's own GYM.nn), opens the project it holds — a ladder item drawn for that gym session, or
// the learner's own audio — and runs Transcribe's project page in place, as the capstone workspace runs inside a
// capstone day. A saved transcription version is the gym day's Make; "Finish the gym session" leads to the Coda.
import type { EndpointInput, Session, SessionPlan } from "@oak/api";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { callApi } from "../../lib/api.ts";
import { useTranscription } from "../../lib/queries.ts";
import { ProjectPage } from "../../transcribe/ProjectPage.tsx";
import { Button } from "../../ui/kit/Button.tsx";
import { Card } from "../../ui/kit/basics.tsx";
import { ErrorState, LoadingState } from "../../ui/kit/QueryState.tsx";
import { useGymDay } from "../day-hooks.ts";
import { type GymStartApi, type GymStarted, startGymOnce, versionsThisSession } from "../gym-start.ts";
import { reportBlockDone } from "../store.ts";

const gymApi: GymStartApi = {
  plan: () => callApi("gym.plan"),
  start: (body) => callApi("gym.start", { body }),
  nextItem: (body) => callApi("ladder.next", { body: body as EndpointInput<"ladder.next">["body"] }),
};

export function GymBlock({
  plan,
  session,
}: {
  plan: SessionPlan;
  session: Pick<Session, "id" | "startedAt">;
}) {
  const day = useGymDay(plan);
  const qc = useQueryClient();
  const [started, setStarted] = useState<GymStarted | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    startGymOnce(gymApi, session.id).then(
      (g) => {
        if (!live) return;
        setStarted(g);
        // Today, the gym plan and the ladder now count this gym session.
        if (g.fresh)
          for (const name of ["gym.plan", "ladder.get", "transcriptions.list", "session.today"])
            void qc.invalidateQueries({ queryKey: ["api", name] });
      },
      (e: unknown) => live && setError(e instanceof Error ? e : new Error(String(e))),
    );
    return () => {
      live = false;
    };
  }, [session.id, attempt, qc]);

  if (error)
    return (
      <ErrorState
        error={error}
        onRetry={() => {
          setError(null);
          setAttempt((n) => n + 1);
        }}
      />
    );
  if (!started) return <LoadingState rows={3} label="Opening the Transcription Gym" />;
  return <GymProject started={started} detail={day?.detail ?? null} session={session} />;
}

function GymProject({
  started,
  detail,
  session,
}: {
  started: GymStarted;
  detail: string | null;
  session: Pick<Session, "id" | "startedAt">;
}) {
  const project = useTranscription(started.projectId);
  const saved = project.data ? versionsThisSession(project.data, session.startedAt) : 0;
  const finish = () =>
    reportBlockDone({ block: "new", source: "gym", itemId: started.gymId, completed: saved > 0 });
  return (
    <div
      className="flex flex-col gap-4"
      data-testid="gym-block"
      data-gym={started.gymId}
      data-kind={started.kind}
    >
      <Card className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="min-w-0">
          <p className="text-sm text-text-2">Transcription Gym</p>
          <p className="font-medium" data-testid="gym-block-title">
            {detail ?? `${started.gymId} · ${started.kind === "ladder" ? "Ladder" : "Your own audio"}`}
          </p>
          <p className="text-sm text-text-3" data-testid="gym-block-made">
            {saved === 0
              ? started.kind === "ladder"
                ? "Check your transcription when it is ready; the saved version is today's Make."
                : "Save a version of your transcription; it is today's Make."
              : `${saved} ${saved === 1 ? "version" : "versions"} saved today.`}
          </p>
        </div>
        <Button
          variant={saved > 0 ? "primary" : "secondary"}
          onClick={finish}
          icon={<ArrowRight aria-hidden className="size-4" />}
          data-testid="gym-finish"
        >
          Finish the gym session
        </Button>
      </Card>
      {project.isPending && <LoadingState rows={4} label="Opening the project" />}
      {project.isError && <ErrorState error={project.error} onRetry={() => void project.refetch()} />}
      {project.data && <ProjectPage key={project.data.id} project={project.data} inSession />}
    </div>
  );
}
