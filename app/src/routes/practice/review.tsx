// Today's review (focus mode; contracts §7.4): the same budget as a session warm-up, then "a little more" in
// budget-sized blocks up to 12 minutes in total. Each block is the planner's batch, frozen when it starts, run
// by <WarmUp>. Raw due counts are never shown.
import type { DueBatch } from "@oak/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { doneItems } from "../../drills/inflight.ts";
import { WarmUp } from "../../drills/WarmUp.tsx";
import { dayOfItem, itemKey } from "../../drills/warmup-model.ts";
import { callApi } from "../../lib/api.ts";
import { usePageTitle } from "../../lib/nav.ts";
import { useDue } from "../../lib/queries.ts";
import { currentSessionId } from "../../session/store.ts";
import { Button, buttonClass } from "../../ui/kit/Button.tsx";
import { Card, EmptyState, Kbd, Page } from "../../ui/kit/basics.tsx";
import { ErrorState, LoadingState } from "../../ui/kit/QueryState.tsx";
import { useFocusHeaderContent } from "../../ui/shell/focus-header.ts";

export const Route = createFileRoute("/practice/review")({ component: Review });

/** "A little more" stops offering blocks past 12 minutes of planned review in total (contracts §7.4). */
const REVIEW_MAX_SEC = 720;

/** Drops items already finished today (a reload re-plans; the anchor would otherwise come back). */
function withoutDone(batch: DueBatch): DueBatch {
  const first = batch.items[0];
  if (!first) return batch;
  const done = doneItems(dayOfItem(first.id));
  return { ...batch, items: batch.items.filter((i) => !done.has(itemKey(i))) };
}

function Review() {
  usePageTitle("Today's review");
  useFocusHeaderContent("Today's review");
  const due = useDue();
  return (
    <Page width="narrow">
      {due.isPending ? (
        <LoadingState rows={3} label="Planning today's review" />
      ) : due.isError ? (
        <ErrorState error={due.error} onRetry={() => void due.refetch()} />
      ) : (
        <Blocks first={withoutDone(due.data)} />
      )}
    </Page>
  );
}

function Blocks({ first }: { first: DueBatch }) {
  const [blocks, setBlocks] = useState<DueBatch[]>([first]);
  const [done, setDone] = useState(false);
  const [more, setMore] = useState<{ loading: boolean; error: string | null }>({
    loading: false,
    error: null,
  });
  const planned = blocks.reduce((s, b) => s + b.plannedSec, 0);
  const current = blocks[blocks.length - 1] as DueBatch;
  const canMore = current.moreAvailable && planned + current.budgetSec <= REVIEW_MAX_SEC + 1;

  const littleMore = async () => {
    setMore({ loading: true, error: null });
    try {
      const next = await callApi("srs.due", { query: { more: "1" } });
      if (next.items.length === 0) {
        setMore({ loading: false, error: "That was everything for today." });
        return;
      }
      setBlocks((b) => [...b, next]);
      setDone(false);
      setMore({ loading: false, error: null });
    } catch {
      setMore({ loading: false, error: "The next block could not be planned. Try again in a moment." });
    }
  };

  if (blocks.length === 1 && first.items.length === 0)
    return (
      <EmptyState
        title="Nothing due right now"
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link to="/practice" className={buttonClass("primary")}>
              Practise a family
            </Link>
            <Link to="/" className={buttonClass("secondary")}>
              Back to Today
            </Link>
          </div>
        }
      >
        Your ears are fresh. Come back tomorrow, or practise a family for fun.
      </EmptyState>
    );

  if (done)
    return (
      <Card className="flex flex-col gap-4 p-6" data-testid="review-done">
        <div>
          <p className="text-sm text-text-2">Today's review</p>
          <h1 className="text-h2">Review done</h1>
          <p className="mt-1 text-text-2">Stopping here is good practice: spacing beats cramming.</p>
        </div>
        {more.error && <p className="text-sm text-text-2">{more.error}</p>}
        <div className="flex flex-wrap gap-2">
          <Link to="/" className={buttonClass("primary", "lg")}>
            Back to Today
          </Link>
          {canMore && !more.error && (
            <Button size="lg" loading={more.loading} onClick={() => void littleMore()}>
              A little more <Kbd>≈ {Math.max(1, Math.round(current.budgetSec / 60))} min</Kbd>
            </Button>
          )}
          <Link to="/practice" className={buttonClass("ghost", "lg")}>
            Practice
          </Link>
        </div>
      </Card>
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-h3">{blocks.length === 1 ? current.label : "A little more"}</h1>
      </div>
      <WarmUp
        key={blocks.length}
        batch={current}
        sessionId={currentSessionId()}
        doneLabel="Finish the review"
        onDone={() => setDone(true)}
      />
    </div>
  );
}
