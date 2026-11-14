// Key presses on the page's performance clock, shared by the tap specs.
import type { Page } from "@playwright/test";

/** Presses Space at `offsets` (ms after `perfZero`, a time on the page's performance clock), in order. */
export async function tapAt(page: Page, perfZero: number, offsets: number[]): Promise<void> {
  // The offset between this process's clock and the page's performance clock, from a round trip.
  let best = { rtt: Number.POSITIVE_INFINITY, offset: 0 };
  for (let i = 0; i < 7; i++) {
    const t0 = performance.now();
    const p = await page.evaluate(() => performance.now());
    const t1 = performance.now();
    if (t1 - t0 < best.rtt) best = { rtt: t1 - t0, offset: p - (t0 + t1) / 2 };
  }
  for (const ms of offsets) {
    const due = perfZero + ms - best.offset;
    while (due - performance.now() > 12) await new Promise((r) => setTimeout(r, 4));
    while (performance.now() < due) {
      // spin the last few ms
    }
    await page.keyboard.down("Space");
    await page.keyboard.up("Space");
  }
}
