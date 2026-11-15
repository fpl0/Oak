// The retry policy in the drill surfaces that decide it on the client (docs/design/retry.md §3.3): a warm-up fact
// card is rated once per sitting, at its first answer ("Flip the card" is that answer: Again); "Try again" lets the
// learner answer the same card again and see the verdict, and posts nothing. And what the drill runner's result
// row shows: the identity of the result on screen (the kit moves the focus when it changes) and its one line.
// Pure: unit-tested in retry.test.ts.
import { retryLine } from "../lib/retry.ts";

export type FactPhase = "asking" | "right" | "wrong" | "flipped";

export interface FactCardState {
  phase: FactPhase;
  /** The card's review was posted (its first answer): later answers are practice. */
  recorded: boolean;
  /** "Try again" presses on this card. */
  tries: number;
}

export type FactEvent =
  | { type: "answer"; correct: boolean }
  | { type: "flip" }
  | { type: "retry" }
  /** The next card. */
  | { type: "next" };

/** What to post for this event: the card's one review, or nothing. */
export interface FactPost {
  correct: boolean;
  revealed: boolean;
}

export const FACT_START: FactCardState = { phase: "asking", recorded: false, tries: 0 };

/** One step of a fact card. `post` is the review to send (only the card's first answer has one). */
export function factStep(s: FactCardState, e: FactEvent): { state: FactCardState; post: FactPost | null } {
  switch (e.type) {
    case "answer": {
      if (s.phase !== "asking") return { state: s, post: null };
      const phase = e.correct ? "right" : "wrong";
      return {
        state: { ...s, phase, recorded: true },
        post: s.recorded ? null : { correct: e.correct, revealed: false },
      };
    }
    case "flip":
      if (s.phase !== "asking") return { state: s, post: null };
      return {
        state: { ...s, phase: "flipped", recorded: true },
        post: s.recorded ? null : { correct: false, revealed: true },
      };
    case "retry":
      return s.phase === "asking"
        ? { state: s, post: null }
        : { state: { ...s, phase: "asking", tries: s.tries + 1 }, post: null };
    case "next":
      return { state: FACT_START, post: null };
  }
}

/** A card's first answer in a sitting, as it was posted. */
export interface FactFirst {
  correct: boolean;
  revealed: boolean;
}

/**
 * The cards of one sitting (a warm-up item: its id carries the day) that already have their one review. It
 * outlives the page, because the session resumes a warm-up item after a reload — and the fact set with it, from
 * its first card — and a second tab runs its own: without it the same card would be rated (and counted for the
 * streak's review set) again by a later answer of the same sitting. Kept in the browser's storage (per learner,
 * this machine); when storage is unavailable it lives as long as the page.
 */
export interface FactSitting {
  first(cardId: string): FactFirst | null;
  record(cardId: string, first: FactFirst): void;
}

/** Storage key, and how many sittings it keeps (the newest). */
export const FACT_SITTINGS_KEY = "oak.facts.sittings";
const KEEP_SITTINGS = 24;

type SittingsStore = { order: string[]; cards: Record<string, Record<string, FactFirst>> };

export function factSitting(
  sittingId: string | null,
  storage: Pick<Storage, "getItem" | "setItem"> | null,
): FactSitting {
  const local = new Map<string, FactFirst>();
  const read = (): SittingsStore => {
    try {
      const raw = storage?.getItem(FACT_SITTINGS_KEY);
      const v = raw ? (JSON.parse(raw) as SittingsStore) : null;
      return v && Array.isArray(v.order) && v.cards && typeof v.cards === "object"
        ? v
        : { order: [], cards: {} };
    } catch {
      return { order: [], cards: {} };
    }
  };
  return {
    first(cardId) {
      const here = local.get(cardId);
      if (here) return here;
      if (sittingId === null) return null;
      return read().cards[sittingId]?.[cardId] ?? null;
    },
    record(cardId, first) {
      local.set(cardId, first);
      if (sittingId === null || storage === null) return;
      try {
        const s = read();
        const order = [...s.order.filter((id) => id !== sittingId), sittingId].slice(-KEEP_SITTINGS);
        const cards: SittingsStore["cards"] = {};
        for (const id of order) cards[id] = s.cards[id] ?? {};
        cards[sittingId] = { ...cards[sittingId], [cardId]: first };
        storage.setItem(FACT_SITTINGS_KEY, JSON.stringify({ order, cards }));
      } catch {
        // Storage full or blocked: the page still keeps the rule for as long as it lives.
      }
    },
  };
}

/** A card's state when it comes up: already answered in this sitting (before a reload, in another tab) or not. */
export function factStart(first: FactFirst | null): FactCardState {
  return first === null ? FACT_START : { ...FACT_START, recorded: true };
}

/** The line under a fact card's result row: its next answer is always practice (it was rated once). */
export function factLine(s: FactCardState): string | null {
  return s.phase === "asking" ? null : retryLine({ surface: "fact-card", counted: s.recorded });
}

/** Which result the drill runner's row stands for (docs/design/retry.md §2.2). */
export type DrillRowState =
  /** A trial or its resolution is being answered or taken: no result on screen. */
  | "running"
  /** The trial's verdict (first answer or a practice take). */
  | "trial"
  /** The sung resolution's verdict. */
  | "resolution";

/**
 * The identity of the result on screen, or null while there is none: a new value for each new result (the kit
 * moves the focus to Continue when it changes) — the trial, which take, and which part of the trial.
 */
export function drillResultKey(o: { index: number; retries: number; state: DrillRowState }): string | null {
  return o.state === "running" ? null : `${o.index}:${o.retries}:${o.state}`;
}

/**
 * The line under the drill runner's row: once a trial has its first answer every further take is practice (the
 * first answer grades the card, contracts §7.2; the first sung resolution feeds `fam.deg.resolve`, §8.3).
 */
export function drillLine(state: DrillRowState): string | null {
  if (state === "running") return null;
  return retryLine({ surface: state === "resolution" ? "sung-resolution" : "drill-trial", counted: true });
}
