// Specimens of the result actions (docs/design/retry.md §2), for review and for kit/e2e/retry.pw.ts: one live
// exercise that is judged, retried and continued from the keyboard; one live take (the shape of a sung or tapped
// exercise and a set-up measurement); and every state of the row side by side. It needs no router and no server:
// it is mounted on its own with `mountKitRetry`. Nothing here plays sound or grades music: the specimens show the
// states an owner passes in.
import { type ReactNode, StrictMode, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  CHECKPOINT_LINE,
  MEASURE_LINE,
  PRACTICE_LINE,
  REVEALED_LINE,
  retryLine,
} from "../../../lib/retry.ts";
import { KeymapProvider } from "../../keys/KeymapProvider.tsx";
import { Button } from "../Button.tsx";
import { Card, type RailStep, StepRail } from "../basics.tsx";
import { ResultActions } from "../ResultActions.tsx";

function Specimen({
  id,
  title,
  sub,
  children,
}: {
  id: string;
  title: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3" data-kit-section={id}>
      <div>
        <h2 id={id} className="text-h3">
          {title}
        </h2>
        {sub && <p className="text-sm text-text-2">{sub}</p>}
      </div>
      <Card className="flex flex-col gap-5 p-4">{children}</Card>
    </section>
  );
}

function Caption({ children }: { children: ReactNode }) {
  return <p className="text-[0.75rem] font-medium tracking-wide text-text-3 uppercase">{children}</p>;
}

// --- a live judged exercise: pick, Check, Try again, Continue ----------------------------------------------

const OPTIONS = [
  { id: "a", text: "Degree 1: home" },
  { id: "b", text: "Degree 5" },
  { id: "c", text: "Degree 7" },
] as const;

function LivePick() {
  const [picked, setPicked] = useState<string | null>(null);
  const [result, setResult] = useState<{ n: number; pass: boolean } | null>(null);
  const [counted, setCounted] = useState(false);
  const [checks, setChecks] = useState(0);
  const [moved, setMoved] = useState(false);
  const first = useRef<HTMLButtonElement>(null);
  const check = () => {
    if (picked === null) return;
    const pass = picked === "a";
    setChecks((n) => n + 1);
    setResult({ n: checks + 1, pass });
    if (pass) setCounted(true);
  };
  if (moved)
    return (
      <div className="flex flex-col gap-2" data-testid="live-pick-done">
        <p>On to the next step. That last check was number {checks}.</p>
        <div>
          <Button
            onClick={() => {
              setMoved(false);
              setResult(null);
              setPicked(null);
            }}
          >
            Back to the question
          </Button>
        </div>
      </div>
    );
  return (
    <div className="flex flex-col gap-4" data-testid="live-pick">
      <fieldset className="flex flex-col gap-2" disabled={result !== null}>
        <legend className="mb-1 font-medium">Which degree does the tune end on?</legend>
        <div className="flex flex-wrap gap-2" data-testid="live-options">
          {OPTIONS.map((o, i) => (
            <button
              key={o.id}
              ref={i === 0 ? first : undefined}
              type="button"
              aria-pressed={picked === o.id}
              onClick={() => setPicked(o.id)}
              className="rounded-control border border-control-border bg-control px-3 py-1.5 text-sm aria-pressed:border-accent aria-pressed:bg-accent/10 disabled:opacity-60"
            >
              {o.text}
            </button>
          ))}
        </div>
      </fieldset>
      {result && (
        <p
          role="status"
          data-testid="live-verdict"
          data-status={result.pass ? "pass" : "fail"}
          className={result.pass ? "text-success" : "text-text"}
        >
          {result.pass
            ? "That's it: the tune walks home to 1."
            : "Not quite: the last note is lower. Listen to the last bar again."}
        </p>
      )}
      <ResultActions
        testId="live-pick-actions"
        resultKey={result?.n ?? null}
        onRetry={() => {
          setResult(null);
          setPicked(null);
        }}
        retryFocus={() => first.current}
        onContinue={() => setMoved(true)}
        continueDisabled={!counted}
        continueNote="Pass the check, or show the answer, to go on."
        line={result ? retryLine({ surface: "lesson-step", counted }) : null}
        action={
          result === null && (
            <Button variant="primary" onClick={check} disabled={picked === null} data-testid="live-check">
              Check
            </Button>
          )
        }
      />
    </div>
  );
}

// --- a live take: Start, listening, a result, Try again ----------------------------------------------------

function LiveTake() {
  const [phase, setPhase] = useState<"ready" | "running" | "result">("ready");
  const [takes, setTakes] = useState(0);
  const [done, setDone] = useState(false);
  const start = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const begin = () => {
    setPhase("running");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setTakes((n) => n + 1);
      setPhase("result");
    }, 400);
  };
  return (
    <div className="flex flex-col gap-3" data-testid="live-take" data-phase={phase}>
      <p className="text-text-2">Sing the note back and hold it for a moment.</p>
      {phase === "running" && (
        <p role="status" data-testid="take-running">
          Listening…
        </p>
      )}
      {phase === "result" && (
        <p role="status" data-testid="take-result">
          That note is 1: home. Take {takes}.
        </p>
      )}
      {done && <p data-testid="take-done">Moved on to the next step.</p>}
      <ResultActions
        testId="live-take-actions"
        shortcut={false}
        resultKey={phase === "result" ? takes : null}
        onRetry={phase === "result" ? begin : null}
        onContinue={phase === "result" ? () => setDone(true) : null}
        line={phase === "result" && takes > 1 ? PRACTICE_LINE : null}
        action={
          phase === "ready" && (
            <Button ref={start} variant="primary" onClick={begin} data-testid="take-start">
              Play the note
            </Button>
          )
        }
      />
    </div>
  );
}

// --- every state of the row ---------------------------------------------------------------------------------

const noop = () => {};

function States() {
  const still = { shortcut: false, focusOnResult: false } as const;
  return (
    <div className="grid gap-5 lg:grid-cols-2" data-testid="retry-states">
      <div className="flex flex-col gap-2" data-state="before">
        <Caption>Before a result: Check, no Try again</Caption>
        <ResultActions
          {...still}
          testId="state-before"
          resultKey={null}
          onRetry={noop}
          onContinue={null}
          action={<Button variant="primary">Check</Button>}
        />
      </div>
      <div className="flex flex-col gap-2" data-state="fail">
        <Caption>After a wrong answer: Continue held</Caption>
        <ResultActions
          {...still}
          testId="state-fail"
          resultKey={1}
          onRetry={noop}
          onContinue={noop}
          continueDisabled
          continueNote="Pass the check, or show the answer, to go on."
        />
      </div>
      <div className="flex flex-col gap-2" data-state="pass">
        <Caption>After a right answer: the next take is practice</Caption>
        <ResultActions
          {...still}
          testId="state-pass"
          resultKey={2}
          onRetry={noop}
          onContinue={noop}
          continueKeys="Enter"
          line={PRACTICE_LINE}
        />
      </div>
      <div className="flex flex-col gap-2" data-state="revealed">
        <Caption>After the answer was shown</Caption>
        <ResultActions
          {...still}
          testId="state-revealed"
          resultKey={3}
          onRetry={noop}
          onContinue={noop}
          continueDisabled
          line={REVEALED_LINE}
        />
      </div>
      <div className="flex flex-col gap-2" data-state="posting">
        <Caption>While a check posts or a take runs</Caption>
        <ResultActions
          {...still}
          testId="state-busy"
          resultKey={4}
          onRetry={noop}
          retryDisabled
          onContinue={noop}
          continueDisabled
        />
      </div>
      <div className="flex flex-col gap-2" data-state="checkpoint">
        <Caption>A checkpoint item: saved, never judged on screen</Caption>
        <ResultActions
          {...still}
          testId="state-checkpoint"
          resultKey={5}
          onRetry={noop}
          onContinue={noop}
          continueLabel="Next item"
          line={CHECKPOINT_LINE}
        />
      </div>
      <div className="flex flex-col gap-2" data-state="measurement">
        <Caption>A set-up measurement, with Set up later</Caption>
        <ResultActions
          {...still}
          testId="state-measure"
          resultKey={6}
          onRetry={noop}
          onContinue={noop}
          line={MEASURE_LINE}
        >
          <Button variant="ghost">Set up later</Button>
        </ResultActions>
      </div>
      <div className="flex flex-col gap-2" data-state="drill">
        <Caption>A drill trial, with its auditions</Caption>
        <ResultActions
          {...still}
          testId="state-drill"
          resultKey={7}
          onRetry={noop}
          onContinue={noop}
          continueLabel="Next trial"
          continueKeys="Enter"
          line={PRACTICE_LINE}
        >
          <Button variant="ghost">Hear it again</Button>
          <Button variant="ghost">Hear the answer</Button>
        </ResultActions>
      </div>
    </div>
  );
}

// --- onboarding's progress: the rail with its position text and visitable dots -----------------------------

const RAIL: RailStep[] = [
  { id: "welcome", label: "Welcome", state: "done" },
  { id: "loop", label: "Your first loop", state: "done" },
  { id: "tutor", label: "Your tutor", state: "skipped" },
  { id: "mic", label: "Microphone", state: "current", sub: "2 of 3: a quiet moment" },
  { id: "range", label: "Your voice", state: "todo" },
  { id: "coda", label: "Done for today", state: "todo" },
];

function RailSpecimen() {
  const [visited, setVisited] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2" data-testid="rail-specimen">
      <StepRail steps={RAIL} label="Set-up steps" position onVisit={setVisited} />
      <p className="text-sm text-text-2" data-testid="rail-visited">
        {visited === null ? "Done and skipped dots open their step." : `Opened: ${visited}.`}
      </p>
    </div>
  );
}

export function KitRetry() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6" aria-label="Result actions">
      <header className="flex flex-col gap-1">
        <h1 className="text-h1">UI kit · Result actions</h1>
        <p className="max-w-[70ch] text-text-2">
          Every judged exercise offers Try again after any result, immediately before the primary action, with
          one key ({"⌥R / Alt+R"}). When the next take cannot change what was recorded, one line says so.
        </p>
      </header>
      <Specimen
        id="kit-retry-pick"
        title="A judged answer"
        sub="Pick, Check, then Try again or Continue. Continue opens once a check passes; every later check is practice."
      >
        <LivePick />
      </Specimen>
      <Specimen
        id="kit-retry-take"
        title="A take"
        sub="A sung or tapped take, or a set-up measurement: any take can be taken again."
      >
        <LiveTake />
      </Specimen>
      <Specimen id="kit-retry-states" title="Every state of the row">
        <States />
      </Specimen>
      <Specimen
        id="kit-retry-rail"
        title="Onboarding progress"
        sub="Where the learner is, in words; finished and skipped steps can be opened again."
      >
        <RailSpecimen />
      </Specimen>
    </main>
  );
}

export function mountKitRetry(host: HTMLElement): () => void {
  const root = createRoot(host);
  root.render(
    <StrictMode>
      <KeymapProvider focusRoute={() => true}>
        <KitRetry />
      </KeymapProvider>
    </StrictMode>,
  );
  return () => root.unmount();
}
