// A fact mini-set (contracts §7.4: up to 10 due fact cards): each card is answered by typing, or flipped to see
// the answer (a flip counts as revealed: Again). Each card is one `POST /srs/review`, at its FIRST answer; the
// server rates it (wrong → Again; right but slow → Hard; right within fastRtMs → Easy; else Good). After any
// answer "Try again" asks the same card again as practice: the verdict is shown, nothing is posted
// (docs/design/retry.md §3.3; the rule is `factStep` in retry.ts).
import type { Answer, FactCardDef, FactDeck } from "@oak/api";
import { gradeFactCard } from "@oak/drills";
import { notate, parseNoteList } from "@oak/notation";
import { renderStaff } from "@oak/notation/render";
import { METERS } from "@oak/theory";
import { useEffect, useId, useRef, useState } from "react";
import { callApi } from "../lib/api.ts";
import { idempotencyKey } from "../lib/idempotency.ts";
import { Button } from "../ui/kit/Button.tsx";
import { Card, Kbd } from "../ui/kit/basics.tsx";
import { ProgressRing } from "../ui/kit/Meters.tsx";
import { ResultActions } from "../ui/kit/ResultActions.tsx";
import { type FactCardState, type FactEvent, factLine, factSitting, factStart, factStep } from "./retry.ts";
import type { DrillData } from "./use-drill-data.ts";

export interface FactResult {
  cardId: string;
  correct: boolean;
  revealed: boolean;
  rtMs: number;
}

/** The browser's storage, or null where it is blocked (a private window, a preview). */
function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function findFactCard(
  decks: readonly FactDeck[],
  cardId: string,
): { deck: FactDeck; card: FactCardDef } | null {
  for (const deck of decks) {
    const card = deck.cards.find((c) => c.id === cardId);
    if (card) return { deck, card };
  }
  return null;
}

function answerText(a: Answer): string {
  return (a.text ?? a.choice ?? (a.number !== undefined ? [String(a.number)] : []))
    .join(" ")
    .replace(/b(?=$|\s)/g, "♭")
    .replace(/#/g, "♯");
}

function FactStaff({ clef, notes }: { clef: "treble" | "bass"; notes: string[] }) {
  const host = useRef<HTMLDivElement>(null);
  const abc = (() => {
    try {
      const events = parseNoteList(notes.map((n) => `${n}:1`).join(" "));
      return notate({ events, meter: METERS["4/4"], key: null, bars: notes.length, staff: clef }).abc.abc;
    } catch {
      return null;
    }
  })();
  useEffect(() => {
    const el = host.current;
    if (!el || !abc) return;
    void renderStaff(el, abc).catch(() => {});
    return () => el.replaceChildren();
  }, [abc]);
  if (!abc) return <p className="text-text-2">{notes.join(" ")}</p>;
  return <div ref={host} className="w-64 text-text" role="img" aria-label={`A note on the ${clef} staff`} />;
}

export function FactSet({
  data,
  cardIds,
  onDone,
  doneLabel,
  sittingId = null,
}: {
  data: DrillData;
  cardIds: readonly string[];
  onDone(results: FactResult[]): void;
  doneLabel: string;
  /** The sitting these cards belong to (the warm-up item's id): a card is rated once in it, reloads included. */
  sittingId?: string | null;
}) {
  const cards = cardIds
    .map((id) => findFactCard(data.content.decks, id))
    .filter((c): c is { deck: FactDeck; card: FactCardDef } => c !== null);
  const [sitting] = useState(() => factSitting(sittingId, browserStorage()));
  const startOf = (i: number) => factStart(sitting.first(cards[i]?.card.id ?? ""));
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [fact, setFact] = useState<FactCardState>(() => startOf(0));
  const state = fact.phase;
  const [results, setResults] = useState<FactResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const shownAt = useRef(performance.now());
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const cur = cards[index];

  // The answer field has the focus while asking; once answered, the result row moves it (to Next card).
  useEffect(() => {
    if (state === "asking") input.current?.focus();
  }, [state]);

  if (cards.length === 0)
    return (
      <Card className="p-6">
        <p className="text-text-2">These fact cards are not in this version of the course any more.</p>
        <Button className="mt-3" variant="primary" onClick={() => onDone([])}>
          {doneLabel}
        </Button>
      </Card>
    );
  if (index >= cards.length) {
    const right = results.filter((r) => r.correct && !r.revealed).length;
    return (
      <Card className="flex flex-col gap-4 p-6" data-testid="fact-summary">
        <div className="flex items-center gap-4">
          <ProgressRing
            value={right}
            max={results.length}
            size={72}
            label={`${right} of ${results.length} right`}
          >
            <span className="font-semibold tabular-nums">
              {right}/{results.length}
            </span>
          </ProgressRing>
          <div>
            <p className="text-sm text-text-2">Facts done</p>
            <h2 className="text-h3">
              {right === results.length
                ? "All of them, from memory."
                : "The ones you flipped come back sooner."}
            </h2>
          </div>
        </div>
        <Button variant="primary" size="lg" className="self-start" autoFocus onClick={() => onDone(results)}>
          {doneLabel} <Kbd tone="inverse">Enter</Kbd>
        </Button>
      </Card>
    );
  }
  const { deck, card } = cur as { deck: FactDeck; card: FactCardDef };

  /**
   * Applies an event; the card's first answer in the sitting is its one review (posted), every later one is
   * practice. A card answered before a reload (or in another tab) keeps that first answer in the summary.
   */
  const apply = (e: FactEvent) => {
    const r = factStep(fact, e);
    setFact(r.state);
    if (r.post) void record(r.post.correct, r.post.revealed);
    else if (fact.phase === "asking" && r.state.phase !== "asking" && fact.tries === 0) {
      const first = sitting.first(card.id);
      if (first) setResults((rs) => [...rs, { cardId: card.id, ...first, rtMs: 0 }]);
    }
  };
  const record = async (correct: boolean, revealed: boolean) => {
    const rtMs = Math.round(performance.now() - shownAt.current);
    setResults((r) => [...r, { cardId: card.id, correct, revealed, rtMs }]);
    sitting.record(card.id, { correct, revealed });
    const key = idempotencyKey();
    try {
      await callApi("srs.review", {
        body: {
          // One key per answered card: a double submit (two tabs, a retry) counts once (wave3.md §5.2).
          idempotencyKey: key,
          cardId: card.id,
          drillSessionId: null,
          outcome: {
            meanCredit: correct && !revealed ? 1 : 0,
            medianRtMs: rtMs,
            extraReplays: 0,
            hintRung: 0,
            revealed,
            playedLevel: null,
            meanAbsCents: null,
          },
        },
      });
      setError(null);
    } catch {
      setError("This answer could not be saved; the card stays due.");
    }
  };
  const check = () => {
    if (!typed.trim()) return;
    const r = gradeFactCard(card, { text: [typed.trim()] }, performance.now() - shownAt.current);
    apply({ type: "answer", correct: r.correct });
  };
  const flip = () => apply({ type: "flip" });
  const retry = () => {
    apply({ type: "retry" });
    setTyped("");
    shownAt.current = performance.now();
  };
  const advance = () => {
    setIndex((i) => i + 1);
    setTyped("");
    setFact(startOf(index + 1));
    shownAt.current = performance.now();
  };

  return (
    <Card className="flex flex-col gap-4 p-6" data-testid="fact-card">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-text-2">
          {deck.title} · card {index + 1} of {cards.length}
        </p>
      </div>
      <div className="flex min-h-28 flex-col items-center justify-center gap-2 text-center">
        {card.prompt.text && <p className="text-h3">{card.prompt.text}</p>}
        {card.prompt.staff && (
          <>
            <p className="text-text-2">Name the note.</p>
            <FactStaff clef={card.prompt.staff.clef} notes={card.prompt.staff.notes} />
          </>
        )}
      </div>
      {state === "asking" ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            check();
          }}
        >
          <label htmlFor={id} className="flex flex-col gap-1 text-sm text-text-2">
            Your answer
            <input
              ref={input}
              id={id}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="h-10 w-56 rounded-control border border-border bg-surface px-3 text-base text-text"
            />
          </label>
          <Button type="submit" variant="primary" disabled={!typed.trim()}>
            Check <Kbd tone="inverse">Enter</Kbd>
          </Button>
          <Button variant="ghost" onClick={flip}>
            Flip the card
          </Button>
        </form>
      ) : null}
      {/* One live region for the card, on the page before its verdict and filled by it (docs/design/retry.md
          §2.3): a region added together with its content is not announced before the focus reaches Next card. */}
      <div className={state === "asking" ? "sr-only" : "flex flex-col gap-3"}>
        <p role="status" className="font-medium" data-testid="fact-verdict">
          {state === "asking"
            ? ""
            : state === "right"
              ? `That's it: ${answerText(card.answer)}.`
              : state === "wrong"
                ? `It is ${answerText(card.answer)}. It comes back soon.`
                : `${answerText(card.answer)}. It comes back soon.`}
        </p>
        {error && state !== "asking" && <p className="text-sm text-issue">{error}</p>}
      </div>
      {/* Mounted for the whole card (not with the verdict), so the row sees each new result arrive and moves the
          focus to Next card; while asking it is empty. */}
      <ResultActions
        resultKey={state === "asking" ? null : `${index}:${fact.tries}`}
        onRetry={state === "asking" ? null : retry}
        retryFocus={() => input.current}
        onContinue={state === "asking" ? null : advance}
        continueLabel={index + 1 < cards.length ? "Next card" : "Finish"}
        continueKeys="Enter"
        line={factLine(fact)}
      />
    </Card>
  );
}
