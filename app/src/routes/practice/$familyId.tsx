// One family, free practice (focus mode; contracts §7.4 "Free practice of a card that is not due never changes
// its schedule"): choose a starting level up to the highest open one, then sets that adapt trial by trial
// toward about 85% right (Kaernbach staircase). The server logs each set as practice; a card already nearly
// due counts it as its review. A set in flight resumes after a reload.
import type { FamilyDef, FamilyId } from "@oak/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Hourglass, Lock, MicOff } from "lucide-react";
import { useId, useState } from "react";
import { DrillRunner } from "../../drills/DrillRunner.tsx";
import { inflightKey, loadInflight } from "../../drills/inflight.ts";
import {
  familyAccuracy,
  familyStatus,
  optionLabel,
  pctText,
  pendingText,
  unitOf,
} from "../../drills/model.ts";
import { type DrillData, useAfterSet, useDrillData } from "../../drills/use-drill-data.ts";
import { usePageTitle } from "../../lib/nav.ts";
import { keyScope, useHotkeys } from "../../ui/keys/KeymapProvider.tsx";
import { Button, buttonClass } from "../../ui/kit/Button.tsx";
import { Card, Chip, EmptyState, Kbd, Page } from "../../ui/kit/basics.tsx";
import { Callout, Stepper } from "../../ui/kit/Controls.tsx";
import { ErrorState, LoadingState } from "../../ui/kit/QueryState.tsx";
import { useFocusHeaderContent } from "../../ui/shell/focus-header.ts";

export const Route = createFileRoute("/practice/$familyId")({ component: FamilyPractice });

function FamilyPractice() {
  const { familyId } = Route.useParams();
  const state = useDrillData();
  const def = state.status === "ready" ? state.data.defs.get(familyId) : undefined;
  const title = def?.title ?? "Practice";
  usePageTitle(title);
  useFocusHeaderContent(title);

  return (
    <Page width="narrow">
      {state.status === "loading" ? (
        <LoadingState rows={3} label="Loading the family" />
      ) : state.status === "error" ? (
        <ErrorState error={state.error} onRetry={state.retry} />
      ) : !def ? (
        <EmptyState
          title="Unknown drill family"
          action={
            <Link to="/practice" className={buttonClass("secondary")}>
              Back to Practice
            </Link>
          }
        >
          There is no family called {familyId}.
        </EmptyState>
      ) : (
        <Family def={def} data={state.data} />
      )}
    </Page>
  );
}

function Family({ def, data }: { def: FamilyDef; data: DrillData }) {
  const st = data.states.get(def.id);
  const status = familyStatus(def, st, data.completed);
  const maxLevel = Math.max(1, Math.min(def.levels.length, st?.maxOpenLevel ?? 1));
  const key = inflightKey({ warmupItemId: null, familyIds: [def.id], purpose: "practice" });
  const [resumed] = useState(() => loadInflight(key));
  const [level, setLevel] = useState(() => Math.min(maxLevel, st?.level ?? 1));
  // The running set: its start level and a counter that remounts the runner for "Another set".
  const [run, setRun] = useState<{ n: number; level: number } | null>(() =>
    resumed ? { n: 0, level: resumed.records[0]?.level ?? resumed.session.levels[def.id] ?? 1 } : null,
  );
  const afterSet = useAfterSet();
  const back = (
    <Link to="/practice" className={buttonClass("secondary")}>
      Back to Practice
    </Link>
  );

  if (status === "pending")
    return (
      <EmptyState icon={<Hourglass aria-hidden />} title={def.title} action={back}>
        {pendingText(def, data.completed)}. Its lessons still teach it; the drills come with a later update.
      </EmptyState>
    );
  if (status === "locked")
    return (
      <EmptyState icon={<Lock aria-hidden />} title={def.title} action={back}>
        Unlocks in {unitOf(def.unlock.lesson)}, with the lesson that introduces it.
      </EmptyState>
    );
  if (def.mic === true && data.profile.quiet)
    return (
      <EmptyState
        icon={<MicOff aria-hidden />}
        title={def.title}
        action={
          <div className="flex gap-2">
            <Link to="/settings/voice" className={buttonClass("primary")}>
              Voice settings
            </Link>
            {back}
          </div>
        }
      >
        This family is sung, and Quiet mode is on. It waits, with no penalty, until the microphone is back.
      </EmptyState>
    );

  if (run)
    return (
      <DrillRunner
        key={run.n}
        data={data}
        purpose="practice"
        familyIds={[def.id as FamilyId]}
        title={def.title}
        practiceLevel={run.level}
        continueLabel="Another set"
        onFinished={afterSet}
        onContinue={(r) => setRun((cur) => ({ n: (cur?.n ?? 0) + 1, level: r.lastLevel ?? level }))}
        extraActions={() => (
          <Link to="/practice" className={buttonClass("secondary", "lg")}>
            Back to Practice
          </Link>
        )}
      />
    );
  return (
    <Setup
      def={def}
      data={data}
      level={level}
      maxLevel={maxLevel}
      setLevel={setLevel}
      onStart={() => setRun({ n: 0, level })}
    />
  );
}

function Setup({
  def,
  data,
  level,
  maxLevel,
  setLevel,
  onStart,
}: {
  def: FamilyDef;
  data: DrillData;
  level: number;
  maxLevel: number;
  setLevel(n: number): void;
  onStart(): void;
}) {
  const st = data.states.get(def.id);
  const id = useId();
  const { n, acc } = familyAccuracy(st);
  const confusions = Object.entries(st?.confusion ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const cats = def.levels[level - 1]?.categories ?? [];
  useHotkeys([
    {
      id: "practice-start",
      keys: "Enter",
      scope: "answer-pad",
      group: "Drills",
      description: "Start the set",
      when: (k) => !k.onControl && !k.inEditable,
      run: onStart,
    },
  ]);
  return (
    <div {...keyScope("answer-pad")} className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-text-2">Free practice</p>
            <h1 className="text-h2">{def.title}</h1>
          </div>
          <Chip>
            {def.trialsPerSet} trials · {def.mic ? "sung" : def.answer === "tap" ? "tapped" : "by ear"}
          </Chip>
        </div>
        <p className="text-text-2">
          Each set adapts as you go: right answers nudge it up, misses ease it back, so it stays near 85%
          right.
        </p>
        <div className="flex flex-wrap items-end gap-6">
          <div className="flex flex-col gap-1">
            <span aria-hidden className="text-sm font-medium text-text-2">
              Start at level
            </span>
            <Stepper
              id={`${id}-level`}
              label="Start at level"
              value={level}
              min={1}
              max={maxLevel}
              onChange={setLevel}
              format={(v) => `${v} of ${def.levels.length}`}
              describedBy={`${id}-cats`}
            />
          </div>
          <p id={`${id}-cats`} className="text-sm text-text-2">
            Level {level}: {cats.map(optionLabel).join(", ")}
            {maxLevel < def.levels.length && (
              <span className="block text-text-3">Higher levels open with later lessons.</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="lg" autoFocus onClick={onStart} data-testid="start-set">
            Start the set <Kbd tone="inverse">Enter</Kbd>
          </Button>
          <Link to="/practice" className={buttonClass("ghost", "lg")}>
            Back to Practice
          </Link>
        </div>
      </Card>
      {(n > 0 || confusions.length > 0) && (
        <Card className="p-4">
          <h2 className="mb-1 text-h3">Where you are</h2>
          <p className="text-text-2">
            Level {st?.level ?? 1} of {def.levels.length}
            {acc !== null && ` · ${pctText(acc)} over ${n} ${n === 1 ? "trial" : "trials"}`}
          </p>
          {confusions.length > 0 && (
            <ul className="mt-2 text-sm text-text-2">
              {confusions.map(([pair, count]) => {
                const [expected, got] = pair.split("|");
                return (
                  <li key={pair}>
                    {optionLabel(got ?? "")} heard for {optionLabel(expected ?? "")} · {count}×
                    {def.confusionTips?.[pair] ? ` · ${def.confusionTips[pair]}` : ""}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}
      {def.mic && (
        <Callout tone="info" title="This one uses the microphone">
          Headphones on. The mic opens only while you sing, and your voice never leaves this computer.
        </Callout>
      )}
    </div>
  );
}
