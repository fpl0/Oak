// The simulation's read-through cache (sim/memo.ts) answers exactly what the `Srs` it wraps answers: the same
// learner day for every instant, the same recall, preview and interval for every card at every instant, asked
// once or many times, and a new answer for a card replaced by its review.
import { describe, expect, test } from "bun:test";
import { createSrs, DECISION_2 } from "../index.ts";
import type { Card } from "../types.ts";
import { memoSrs } from "./memo.ts";

const srs = await createSrs({ factRetention: DECISION_2.factRetention });
const memo = memoSrs(srs);
const DAY = 86_400_000;
const start = new Date("2027-01-04T09:00:00Z");
const at = (days: number, hours = 0) => new Date(start.getTime() + days * DAY + hours * 3_600_000);

describe("memoSrs: the same answers as the Srs it wraps", () => {
  test("dayOf, retrievability, preview and intervalAt over a card's whole life, asked twice each", () => {
    let card: Card = srs.createCard("family", "fam.jzz.ii-v", start);
    let checked = 0;
    for (let day = 0; day < 120; day++) {
      for (const h of [0, 7, 20]) {
        const now = at(day, h);
        for (let k = 0; k < 2; k++) {
          expect(memo.dayOf(now)).toBe(srs.dayOf(now));
          expect(memo.dayOf(now.toISOString())).toBe(srs.dayOf(now.toISOString()));
          expect(memo.retrievability(card, now)).toBe(srs.retrievability(card, now));
          expect(memo.preview(card, now)).toEqual(srs.preview(card, now));
          expect(memo.intervalAt(card, 0.9)).toBe(srs.intervalAt(card, 0.9));
          expect(memo.intervalAt(card, 0.85)).toBe(srs.intervalAt(card, 0.85));
          checked++;
        }
      }
      // Review the card whenever it is due: a new card object, never the cached one mutated.
      if (srs.isDue(card, at(day))) {
        const next = srs.rate(card, ((day % 4) + 1) as 1 | 2 | 3 | 4, at(day)).card;
        expect(next).not.toBe(card);
        card = next;
        expect(memo.intervalAt(card, 0.9)).toBe(srs.intervalAt(card, 0.9));
      }
    }
    expect(checked).toBe(720);
  });
});
