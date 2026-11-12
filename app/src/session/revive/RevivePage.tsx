// /session/revive: the Oak's "Revive" (contracts §7.10). For a drying leaf it runs exactly the sets of today's
// planned warm-up that train it (`GET /skills/revive?skillId=`), never more than the day's budget; "Revive more"
// is the explicit opt-in, with its own time shown, for the next budget-sized block of faded leaves. A set done
// here is a set done: the session's warm-up does not run it again today.
import type { DueBatch } from "@oak/api";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { WarmUp } from "../../drills/WarmUp.tsx";
import { useContent } from "../../lib/content.ts";
import { usePageTitle } from "../../lib/nav.ts";
import { useRevive } from "../../lib/queries.ts";
import { minutesOf } from "../../map/revive.ts";
import { buttonClass } from "../../ui/kit/Button.tsx";
import { Card, EmptyState, Page } from "../../ui/kit/basics.tsx";
import { ErrorState, LoadingState } from "../../ui/kit/QueryState.tsx";
import { useFocusHeaderContent } from "../../ui/shell/focus-header.ts";
import { currentSessionId } from "../store.ts";

export interface RevivePageProps {
  /** The leaf to revive, or none for every drying leaf. */
  skillId: string | null;
  /** "Revive more": the next block, faded leaves included. */
  more: boolean;
}

function BackToOak({ skillId, primary = false }: { skillId: string | null; primary?: boolean }) {
  return (
    <Link
      to="/oak"
      search={skillId ? { view: "tree", leaf: skillId } : { view: "tree" }}
      className={buttonClass(primary ? "primary" : "secondary", "lg")}
      data-testid="revive-back"
    >
      <ArrowLeft aria-hidden className="size-4" /> Back to the Oak
    </Link>
  );
}

function MoreLink({ skillId, label }: { skillId: string | null; label: string }) {
  return (
    <Link
      to="/session/revive"
      search={skillId ? { skill: skillId, more: true } : { more: true }}
      className={buttonClass("ghost", "lg")}
      data-testid="revive-more"
    >
      {label}
    </Link>
  );
}

function Run({
  batch,
  skillId,
  more,
  name,
}: {
  batch: DueBatch;
  skillId: string | null;
  more: boolean;
  name: string | null;
}) {
  const [done, setDone] = useState(false);
  if (done)
    return (
      <Card className="flex flex-col gap-4 p-6" data-testid="revive-done">
        <div>
          <p className="text-sm text-text-2">{more ? "Revive more" : "Revive"}</p>
          <h1 className="text-h2">{name ? `${name} is fresh again` : "Revived"}</h1>
          <p className="mt-1 text-text-2">
            The leaf darkens as the reviews land. Stopping here is good practice: spacing beats cramming.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <BackToOak skillId={skillId} primary />
          {!more && <MoreLink skillId={skillId} label="Revive more" />}
        </div>
      </Card>
    );
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-h3">
        {more ? "Revive more" : "Revive"}
        {name ? ` · ${name}` : ""}{" "}
        <span className="font-sans text-base font-normal text-text-2">
          ≈ {minutesOf(batch.plannedSec)} min
        </span>
      </h1>
      <WarmUp batch={batch} sessionId={currentSessionId()} doneLabel="Finish" onDone={() => setDone(true)} />
    </div>
  );
}

export function RevivePage({ skillId, more }: RevivePageProps) {
  usePageTitle(more ? "Revive more" : "Revive");
  useFocusHeaderContent(more ? "Revive more" : "Revive");
  const content = useContent();
  const batch = useRevive(skillId ?? undefined, more);
  const name = skillId ? (content.data?.skills.nodes.find((n) => n.id === skillId)?.name ?? skillId) : null;
  return (
    <Page width="narrow">
      {batch.isPending ? (
        <LoadingState rows={3} label="Planning the sets" />
      ) : batch.isError ? (
        <ErrorState error={batch.error} onRetry={() => void batch.refetch()} />
      ) : batch.data.items.length === 0 ? (
        <Card>
          <EmptyState
            title={more ? "Nothing more to revive today" : "Nothing to revive right now"}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <BackToOak skillId={skillId} primary />
                {!more && <MoreLink skillId={skillId} label="Revive more" />}
              </div>
            }
          >
            {more
              ? "Every faded leaf's reviews are done or waiting for tomorrow. Spacing does the rest."
              : "This leaf's reviews are not in today's warm-up. Revive more looks further ahead."}
          </EmptyState>
        </Card>
      ) : (
        <Run batch={batch.data} skillId={skillId} more={more} name={name} />
      )}
    </Page>
  );
}
