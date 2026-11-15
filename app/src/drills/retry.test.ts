import { describe, expect, test } from "bun:test";
import { PRACTICE_LINE } from "../lib/retry.ts";
import {
  drillLine,
  drillResultKey,
  FACT_SITTINGS_KEY,
  FACT_START,
  type FactCardState,
  type FactEvent,
  factLine,
  factSitting,
  factStart,
  factStep,
} from "./retry.ts";

/** Runs events through a fact card and collects the reviews it would post. */
function play(events: FactEvent[]): {
  state: FactCardState;
  posts: { correct: boolean; revealed: boolean }[];
} {
  let state = FACT_START;
  const posts: { correct: boolean; revealed: boolean }[] = [];
  for (const e of events) {
    const r = factStep(state, e);
    state = r.state;
    if (r.post) posts.push(r.post);
  }
  return { state, posts };
}

describe("a fact card: one review per card per sitting (docs/design/retry.md §3.3)", () => {
  test("the first answer is the review; Try again answers again and posts nothing", () => {
    const { state, posts } = play([
      { type: "answer", correct: false },
      { type: "retry" },
      { type: "answer", correct: true },
      { type: "retry" },
      { type: "answer", correct: false },
    ]);
    expect(posts).toEqual([{ correct: false, revealed: false }]);
    expect(state).toEqual({ phase: "wrong", recorded: true, tries: 2 });
  });

  test("Flip the card is the first answer (Again); a right answer after it is practice", () => {
    const { state, posts } = play([{ type: "flip" }, { type: "retry" }, { type: "answer", correct: true }]);
    expect(posts).toEqual([{ correct: false, revealed: true }]);
    expect(state.phase).toBe("right");
  });

  test("a right first answer is posted once; a flip after Try again posts nothing", () => {
    const { posts } = play([{ type: "answer", correct: true }, { type: "retry" }, { type: "flip" }]);
    expect(posts).toEqual([{ correct: true, revealed: false }]);
  });

  test("Try again before an answer and a second answer without Try again change nothing", () => {
    expect(factStep(FACT_START, { type: "retry" })).toEqual({ state: FACT_START, post: null });
    const once = factStep(FACT_START, { type: "answer", correct: true });
    expect(factStep(once.state, { type: "answer", correct: false })).toEqual({
      state: once.state,
      post: null,
    });
    expect(factStep(once.state, { type: "flip" }).post).toBeNull();
  });

  test("the next card starts fresh: its first answer is posted", () => {
    const { posts } = play([
      { type: "answer", correct: true },
      { type: "next" },
      { type: "answer", correct: false },
    ]);
    expect(posts).toHaveLength(2);
  });

  test("the line: none while asking; practice once the card has its review", () => {
    expect(factLine(FACT_START)).toBeNull();
    expect(factLine({ phase: "right", recorded: true, tries: 0 })).toBe(PRACTICE_LINE);
  });
});

describe("the drill runner's result row", () => {
  test("a new key for each result: the trial, the take and the resolution", () => {
    expect(drillResultKey({ index: 0, retries: 0, state: "running" })).toBeNull();
    const keys = [
      drillResultKey({ index: 0, retries: 0, state: "trial" }),
      drillResultKey({ index: 0, retries: 1, state: "trial" }),
      drillResultKey({ index: 0, retries: 1, state: "resolution" }),
      drillResultKey({ index: 1, retries: 0, state: "trial" }),
    ];
    expect(new Set(keys).size).toBe(4);
  });

  test("once a trial is answered, every further take is practice, said in one line", () => {
    expect(drillLine("running")).toBeNull();
    expect(drillLine("trial")).toBe(PRACTICE_LINE);
    expect(drillLine("resolution")).toBe(PRACTICE_LINE);
  });
});

/** A Map behind the Storage methods the sitting uses (one per "browser"). */
function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    raw: m,
  };
}

/** One page's fact set over some cards: answers each once (wrong first), retries once, returns the posts. */
function sitting(id: string, storage: ReturnType<typeof memoryStorage> | null, cards: string[]) {
  const s = factSitting(id, storage);
  const posts: string[] = [];
  for (const card of cards) {
    let st = factStart(s.first(card));
    for (const e of [
      { type: "answer", correct: false },
      { type: "retry" },
      { type: "answer", correct: true },
    ] as FactEvent[]) {
      const r = factStep(st, e);
      st = r.state;
      if (r.post) {
        posts.push(card);
        s.record(card, r.post);
      }
    }
  }
  return posts;
}

describe("a fact card is rated once per sitting, reloads and second tabs included", () => {
  test("a reload starts the set over: the cards already answered post nothing again", () => {
    const store = memoryStorage();
    expect(sitting("2026-11-15:w:3", store, ["fact.a", "fact.b"])).toEqual(["fact.a", "fact.b"]);
    // The page reloads (a new sitting object, the same storage): the session resumes the same warm-up item.
    expect(sitting("2026-11-15:w:3", store, ["fact.a", "fact.b", "fact.c"])).toEqual(["fact.c"]);
    // Five answers of one card in one sitting are one review (the streak's fact set counts reviews).
    for (let i = 0; i < 5; i++) expect(sitting("2026-11-15:w:3", store, ["fact.a"])).toEqual([]);
  });

  test("the first answer is kept for the summary; a new sitting (another item, another day) rates again", () => {
    const store = memoryStorage();
    sitting("2026-11-15:w:3", store, ["fact.a"]);
    expect(factSitting("2026-11-15:w:3", store).first("fact.a")).toEqual({ correct: false, revealed: false });
    expect(sitting("2026-11-16:w:1", store, ["fact.a"])).toEqual(["fact.a"]);
  });

  test("blocked or broken storage: the rule holds for the page, and nothing throws", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    const s = factSitting("x", throwing);
    expect(s.first("fact.a")).toBeNull();
    s.record("fact.a", { correct: true, revealed: false });
    expect(s.first("fact.a")).toEqual({ correct: true, revealed: false });
    expect(sitting("x", null, ["fact.a"])).toEqual(["fact.a"]);
    const garbage = memoryStorage();
    garbage.setItem(FACT_SITTINGS_KEY, "{not json");
    expect(factSitting("x", garbage).first("fact.a")).toBeNull();
  });

  test("only the newest sittings are kept", () => {
    const store = memoryStorage();
    for (let d = 0; d < 40; d++) sitting(`day-${d}`, store, ["fact.a"]);
    const kept = JSON.parse(store.raw.get(FACT_SITTINGS_KEY) ?? "{}") as { order: string[] };
    expect(kept.order.length).toBeLessThanOrEqual(24);
    expect(kept.order.at(-1)).toBe("day-39");
  });
});
