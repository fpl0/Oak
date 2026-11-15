// A checkpoint's items before and after hand-in (docs/design/retry.md §3.2, contracts §7.6): an item may be saved
// again ("Try again", Back, the review's "Change"), and the last saved answer is the item's answer; no verdict is
// shown before hand-in, so an item cannot be repeated "until right"; after hand-in nothing in the attempt changes.
// Repeating an item can therefore never raise the score above what its last saved answers give.
import { describe, expect, test } from "bun:test";
import type { CheckpointItemSpec, GradeResult } from "@oak/api";
import { quietIn } from "../check.tsx";
import { handInItems, type ItemRecord, itemState, recordItem, scoreLocal } from "./model.ts";

const spec = (idx: number, skill: string, role: CheckpointItemSpec["role"] = "gating"): CheckpointItemSpec =>
  ({ idx, skillId: skill, role }) as unknown as CheckpointItemSpec;

const ITEMS = [
  spec(0, "deg.a"),
  spec(1, "deg.a"),
  spec(2, "deg.b"),
  spec(3, "deg.b"),
  spec(4, "voice.x", "level-setting"),
];

const save = (idx: number, score: number): ItemRecord => ({
  idx,
  score,
  skipped: false,
  response: { answer: { choice: String(score) } } as ItemRecord["response"],
  result: { status: score >= 1 ? "pass" : "fail", score } as GradeResult,
});
const skip = (idx: number): ItemRecord => ({
  idx,
  score: 0,
  skipped: true,
  response: { skipped: true },
  result: null,
});

/** Applies saves in order, as the player does, and returns the hand-in's items. */
function play(seq: readonly ItemRecord[], handedInAfter = Number.POSITIVE_INFINITY) {
  let records: ItemRecord[] = [];
  seq.forEach((r, i) => {
    records = recordItem(records, r, i >= handedInAfter);
  });
  return { records, items: handInItems(ITEMS, records) };
}

/** A tiny deterministic generator: the same sequences on every run. */
function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s / 2 ** 31;
  };
}

describe("checkpoint items: the last saved answer counts", () => {
  test("saving an item again replaces its answer: one record per item, the last one", () => {
    const { records, items } = play([save(0, 0.2), save(1, 1), save(0, 1), save(0, 0.5)]);
    expect(records.filter((r) => r.idx === 0)).toHaveLength(1);
    expect(items.map((i) => [i.idx, i.score, i.skipped])).toEqual([
      [0, 0.5, false],
      [1, 1, false],
      [2, 0, true],
      [3, 0, true],
      [4, 0, true],
    ]);
  });

  test("a skipped item can be answered later, and an answered one skipped", () => {
    expect(play([skip(2), save(2, 1)]).items[2]).toMatchObject({ score: 1, skipped: false });
    expect(play([save(2, 1), skip(2)]).items[2]).toMatchObject({ score: 0, skipped: true });
    expect(itemState(undefined)).toBe("open");
    expect(itemState(skip(1))).toBe("skipped");
    expect(itemState(save(1, 0))).toBe("answered");
  });

  test("repeating items never scores more than their last saved answers would on their own", () => {
    const rnd = lcg(7);
    for (let run = 0; run < 300; run++) {
      const seq: ItemRecord[] = [];
      const n = 1 + Math.floor(rnd() * 14);
      for (let i = 0; i < n; i++) {
        const idx = Math.floor(rnd() * ITEMS.length);
        seq.push(rnd() < 0.15 ? skip(idx) : save(idx, Math.round(rnd() * 4) / 4));
      }
      const { records, items } = play(seq);
      // The last save of each item, alone.
      const last = new Map<number, ItemRecord>();
      for (const r of seq) last.set(r.idx, r);
      const once = handInItems(ITEMS, [...last.values()]);
      expect(items).toEqual(once);
      const score = scoreLocal(ITEMS, new Map(records.map((r) => [r.idx, r])), 1);
      const scoreOnce = scoreLocal(ITEMS, last, 1);
      expect(score).toEqual(scoreOnce);
      // And never above the best single answer each item was given.
      const best = new Map<number, number>();
      for (const r of seq) if (!r.skipped) best.set(r.idx, Math.max(best.get(r.idx) ?? 0, r.score));
      for (const it of items) expect(it.score).toBeLessThanOrEqual(best.get(it.idx) ?? 0);
    }
  });

  test("a level-setting item (sung) never enters the pass score, however often it is taken", () => {
    const a = scoreLocal(
      ITEMS,
      new Map(play([save(0, 1), save(1, 1), save(2, 1), save(3, 1)]).records.map((r) => [r.idx, r])),
      1,
    );
    const b = scoreLocal(
      ITEMS,
      new Map(
        play([
          save(0, 1),
          save(1, 1),
          save(2, 1),
          save(3, 1),
          save(4, 0),
          save(4, 1),
          save(4, 0),
        ]).records.map((r) => [r.idx, r]),
      ),
      1,
    );
    expect(b.score).toBe(a.score);
    expect(b.passed).toBe(a.passed);
  });

  test("after hand-in nothing in the attempt changes", () => {
    const { items } = play([save(0, 0), save(1, 0), save(0, 1), save(1, 1)], 2);
    expect(items[0]).toMatchObject({ score: 0 });
    expect(items[1]).toMatchObject({ score: 0 });
  });

  test("no verdict is shown before hand-in: a checkpoint widget only ever says idle or checking", () => {
    expect(quietIn("checkpoint", false)).toEqual({ state: "idle" });
    expect(quietIn("checkpoint", true)).toEqual({ state: "pending" });
    expect(quietIn("lesson", false)).toBeNull();
  });
});
