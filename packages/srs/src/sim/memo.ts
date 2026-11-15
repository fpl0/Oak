// The simulation's read-through cache over an `Srs` (test infrastructure speed, no behaviour). The 300-day and
// whole-course simulations ask the same pure questions about the same card on the same day several times (the
// warm-up, the review day, the forecast, the overdue scan each turn every active card into a `ReviewItem`), and
// the answers depend only on the card's state and the instant: `dayOf` on the instant, `retrievability` and
// `preview` on the card and the instant, `intervalAt` on the card and the retention. Cards are replaced, never
// mutated (every write in simulate.ts builds a new object), so a WeakMap keyed by the card object is exact.
// Measured (Wave 7 Build): one whole-course run at 25 minutes went from 4.5 s to 1.9 s, and two runs' summaries
// and session rows were byte-identical with and without the cache; sim/memo.test.ts checks every answer against
// the wrapped `Srs` over a card's life.
import type { Card, Srs } from "../types.ts";

type Preview = ReturnType<Srs["preview"]>;

export function memoSrs(srs: Srs): Srs {
  const days = new Map<number, number>();
  const recall = new WeakMap<Card, { at: number; value: number }>();
  const previews = new WeakMap<Card, { at: number; value: Preview }>();
  const intervals = new WeakMap<Card, Map<number, number>>();
  const msOf = (at: Date | string): number => (at instanceof Date ? at.getTime() : Date.parse(at));
  return {
    ...srs,
    dayOf(at) {
      const ms = msOf(at);
      const hit = days.get(ms);
      if (hit !== undefined) return hit;
      const value = srs.dayOf(at);
      if (days.size > 100_000) days.clear();
      days.set(ms, value);
      return value;
    },
    retrievability(card, now) {
      const at = now.getTime();
      const hit = recall.get(card);
      if (hit && hit.at === at) return hit.value;
      const value = srs.retrievability(card, now);
      recall.set(card, { at, value });
      return value;
    },
    preview(card, now) {
      const at = now.getTime();
      const hit = previews.get(card);
      if (hit && hit.at === at) return hit.value;
      const value = srs.preview(card, now);
      previews.set(card, { at, value });
      return value;
    },
    intervalAt(card, retention) {
      let byRetention = intervals.get(card);
      if (!byRetention) {
        byRetention = new Map();
        intervals.set(card, byRetention);
      }
      const hit = byRetention.get(retention);
      if (hit !== undefined) return hit;
      const value = srs.intervalAt(card, retention);
      byRetention.set(retention, value);
      return value;
    },
  };
}
