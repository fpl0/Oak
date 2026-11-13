// Helpers for the Wave 4 lesson specs: the dev fixture of the Wave 4 step shapes (U05.L99, preview: nothing is
// saved), opened as a learner who finished U04.
import type { Page } from "@playwright/test";
import { seed, setQuiet } from "./w3support.ts";

export const FIXTURE4 = "/learn/U05.L99?preview=true";

/** Opens the fixture at a step, as a learner who finished U04 (the fixture plays with the tools of U05.L06). */
export async function openFixture(page: Page, step?: string): Promise<void> {
  await seed(page, "after U04.CP");
  await setQuiet(page, false);
  await page.goto(step ? `${FIXTURE4}&step=${step}` : FIXTURE4);
}
