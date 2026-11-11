// <WarmUp>: the session's warm-up block, and the body of /practice/review (contracts §7.4, ux §1.3). It runs
// the planned items in order — an easy win first (the anchor), then the interleaved family sets, composite
// reviews, listen blocks and fact mini-sets — and reports each one to the session store as it ends
// (`reportBlockDone`, a no-op outside a session). Once the minute budget is spent by a quarter, the rest stay
// due, with no penalty and nothing shown. A set in flight survives a reload (it resumes at its next trial).
//
//   <WarmUp batch={plan.warmup} sessionId={session.id} index={warmupIndex} />
import type { DueBatch, WarmupItem } from "@oak/api";
import { useEffect, useRef, useState } from "react";
import { reportBlockDone } from "../session/store.ts";
import { Button } from "../ui/kit/Button.tsx";
import { Card, EmptyState, Kbd, Progress } from "../ui/kit/basics.tsx";
import { ErrorState, LoadingState } from "../ui/kit/QueryState.tsx";
import { DrillRunner, type SetResult } from "./DrillRunner.tsx";
import { FactSet } from "./FactSet.tsx";
import { markItemDone } from "./inflight.ts";
import { ListenBlock } from "./ListenBlock.tsx";
import { useAfterSet, useDrillData } from "./use-drill-data.ts";
import { budgetSpent, dayOfItem, itemKey, stepOf, warmupOrder } from "./warmup-model.ts";

export interface WarmupItemReport {
  item: WarmupItem;
  drillSessionId: string | null;
  meanCredit: number | null;
  skipped: boolean;
}

export interface WarmUpProps {
  /** The planned warm-up: `SessionPlan.warmup`, or `GET /srs/due` on the review page. */
  batch: DueBatch;
  /** The session these sets count for (`currentSessionId()`), or null outside a session. */
  sessionId: string | null;
  /** The item to run (the session store's `warmupIndex`). Omit to let the warm-up keep its own place. */
  index?: number;
  /** After each item; the session store has already been told. */
  onItemDone?(report: WarmupItemReport, index: number): void;
  /** Every item ran, or the budget is spent. */
  onDone?(): void;
  /** The last set's button ("On to the lesson", "Done"). */
  doneLabel?: string;
  /** Shows the "Warm-up · set n of N" header (default true). */
  header?: boolean;
}

export function WarmUp(props: WarmUpProps) {
  const state = useDrillData();
  const afterSet = useAfterSet();
  const [items] = useState(() => warmupOrder(props.batch.items));
  const [own, setOwn] = useState(0);
  const index = props.index ?? own;
  const [listened, setListened] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const fetFirst = useRef<string | null>(null);
  const startedAt = useRef(Date.now());
  const hiddenMs = useRef(0);

  // Elapsed time with the tab visible (a hidden tab is not practising).
  useEffect(() => {
    let hiddenAt: number | null = null;
    const onVis = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt !== null) {
        hiddenMs.current += Date.now() - hiddenAt;
        hiddenAt = null;
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  if (state.status === "loading") return <LoadingState rows={3} label="Loading the warm-up" />;
  if (state.status === "error") return <ErrorState error={state.error} onRetry={state.retry} />;
  const data = state.data;

  const report = (i: number, r: Omit<WarmupItemReport, "item">) => {
    const item = items[i] as WarmupItem;
    reportBlockDone({
      block: "warmup",
      source: "drills",
      warmupItemId: item.id,
      drillSessionId: r.drillSessionId,
      meanCredit: r.meanCredit,
      ...(r.skipped ? { skipped: true } : {}),
    });
    markItemDone(dayOfItem(item.id), itemKey(item));
    props.onItemDone?.({ item, ...r }, i);
  };
  const advance = (i: number, r: Omit<WarmupItemReport, "item">) => {
    report(i, r);
    setListened(null);
    const elapsed = (Date.now() - startedAt.current - hiddenMs.current) / 1000;
    let next = i + 1;
    if (next < items.length && budgetSpent(elapsed, props.batch.budgetSec)) {
      // Leftovers stay due; the session still has to move past them.
      for (; next < items.length; next++)
        report(next, { drillSessionId: null, meanCredit: null, skipped: true });
    }
    if (next >= items.length) {
      setFinished(true);
      props.onDone?.();
    }
    setOwn(next);
  };

  if (items.length === 0)
    return (
      <EmptyState title="Nothing to warm up today">
        Your review is clear. Practise any family for fun from the Practice page.
      </EmptyState>
    );
  if (finished || index >= items.length)
    return (
      <Card className="p-6" data-testid="warmup-done">
        <h2 className="text-h3">Warm-up done</h2>
        <p className="mt-1 text-text-2">Ears are open. What comes next builds on them.</p>
      </Card>
    );

  const item = items[index] as WarmupItem;
  const step = stepOf(item, data.defs, data.profile.quiet);
  const last = index + 1 >= items.length;
  const continueLabel = last ? (props.doneLabel ?? "Done") : "Next set";
  const skip = () => advance(index, { drillSessionId: null, meanCredit: null, skipped: true });

  // Items this build cannot run (a generator still pending, a family gone from the course) are passed over.
  if (step.kind === "skip") {
    return <AutoSkip key={item.id} onSkip={skip} />;
  }

  let sungResolutions = 2;
  if (step.kind === "set") {
    const fet = step.familyIds.some((f) => data.defs.get(f)?.generator === "degree-id");
    if (fet && fetFirst.current === null) fetFirst.current = item.id;
    sungResolutions = fet && fetFirst.current === item.id ? 3 : 2;
  }

  return (
    <div className="flex flex-col gap-4" data-testid="warmup">
      {props.header !== false && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <p className="whitespace-nowrap text-sm text-text-2" data-testid="warmup-position">
              Warm-up · {index + 1} of {items.length}
            </p>
            <Progress value={index} max={items.length} label="Warm-up progress" className="max-w-56" />
          </div>
          <Button variant="ghost" size="sm" onClick={skip}>
            Skip this one
          </Button>
        </div>
      )}
      {step.kind === "listen" && (
        <ListenBlock
          key={item.id}
          data={data}
          familyId={step.familyId as never}
          level={step.level}
          seed={hash(item.id)}
          doneLabel={continueLabel}
          onDone={() => advance(index, { drillSessionId: null, meanCredit: null, skipped: false })}
        />
      )}
      {step.kind === "facts" && (
        <FactSet
          key={item.id}
          data={data}
          cardIds={step.cardIds}
          doneLabel={continueLabel}
          onDone={(results) =>
            advance(index, {
              drillSessionId: null,
              meanCredit:
                results.length === 0
                  ? null
                  : results.filter((r) => r.correct && !r.revealed).length / results.length,
              skipped: false,
            })
          }
        />
      )}
      {step.kind === "set" && step.listenFirst && listened !== item.id && (
        <ListenBlock
          key={`${item.id}-listen`}
          data={data}
          familyId={step.familyIds[0] as never}
          level={item.level ?? 1}
          seed={hash(item.id)}
          doneLabel="Start the set"
          onDone={() => setListened(item.id)}
        />
      )}
      {step.kind === "set" && (!step.listenFirst || listened === item.id) && (
        <DrillRunner
          key={`${item.id}|${step.familyIds.join(",")}`}
          data={data}
          purpose={step.purpose}
          familyIds={step.familyIds as never}
          title={step.title}
          warmupItemId={item.id}
          sessionId={props.sessionId}
          easyFirst={index === 0}
          sungResolutions={sungResolutions}
          position={null}
          continueLabel={continueLabel}
          onFinished={afterSet}
          onContinue={(r: SetResult) =>
            advance(index, { drillSessionId: r.drillSessionId, meanCredit: r.meanCredit, skipped: false })
          }
        />
      )}
      {step.kind === "set" && (
        <p className="text-sm text-text-3">
          Mixed practice feels harder; that is why it sticks. <Kbd>?</Kbd> lists the keys.
        </p>
      )}
    </div>
  );
}

/** Passes over an item once, after commit (never during render, so a double render cannot skip twice). */
function AutoSkip({ onSkip }: { onSkip(): void }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    onSkip();
  });
  return <LoadingState rows={2} />;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
