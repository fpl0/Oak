// Helpers for the Wave 7 capstone specs (not a spec): the Wave 7 seed points (wave7.md §6), starting a track
// capstone's first session from its page by keyboard, reading a checklist row's found lines, finishing a session,
// checking and releasing, and JC4's reharmonisation of Georgia on My Mind.
import { expect, type Page } from "@playwright/test";
import { seedFirst, setCode } from "./w5-support.ts";
import { releaseByKeyboard, songOf } from "./w6-support.ts";

/** Seeds a Wave 7 point; skips the test, naming it, while the server does not have it yet. */
export async function seedPoint(page: Page, point: string): Promise<void> {
  await page.routeWebSocket(/.*/, () => {});
  await seedFirst(page, [point]);
}

/** Opens a track capstone's page and starts its first session from the keyboard (the button has the focus). */
export async function startFirstSession(page: Page, id: string): Promise<void> {
  await page.goto(`/capstone/${id}`);
  const start = page.getByRole("button", { name: /^Start session 1 of \d$/ });
  await expect(start).toBeEnabled({ timeout: 60_000 });
  // Focus and Enter in one step on the button as it is now (a re-render while the page settles can take a separate
  // focus away from it).
  await start.press("Enter");
  await expect(page.getByTestId("capstone-workspace")).toBeVisible({ timeout: 60_000 });
}

/** Puts a piece in the capstone's editor and waits for the live check to read it. */
export async function writePiece(page: Page, id: string, code: string, rowId: string): Promise<void> {
  await setCode(page, id, code);
  await expect(page.locator(`[data-rule="${rowId}"]`)).not.toHaveAttribute("data-state", "unchecked", {
    timeout: 45_000,
  });
}

/** The found lines under a checklist row. */
export const foundLines = (page: Page, rowId: string) =>
  page.locator(`[data-rule="${rowId}"] [data-testid="row-found"] li`);

/**
 * Finishes session `n` of `total` (after the draft is saved, when `saved` says the session wrote one) and waits
 * for the next one to be the current step.
 */
export async function finishSession(
  page: Page,
  id: string,
  n: number,
  total: number,
  saved = true,
): Promise<void> {
  if (saved)
    await expect(page.getByTestId("saved-state")).toContainText(/Version \d+ saved/, { timeout: 30_000 });
  const finish = page.getByTestId("finish-session");
  await expect(finish).toBeEnabled({ timeout: 30_000 });
  await finish.click();
  await expect(page.getByRole("status").filter({ hasText: `Session ${n} of ${total} done.` })).toBeVisible({
    timeout: 30_000,
  });
  if (n < total)
    await expect(page.locator(`[data-session="${id}.S${n + 1}"]`)).toHaveAttribute("aria-current", "step", {
      timeout: 30_000,
    });
}

/** The official check of the track, then the release by keyboard with a seeded take. */
export async function checkAndRelease(page: Page, title: string): Promise<void> {
  await expect(page.getByTestId("req-count")).toHaveText(/^(\d+) of \1 met$/, { timeout: 60_000 });
  await page.getByTestId("check-track").click();
  await expect(page.getByRole("status").filter({ hasText: /every requirement is met/ })).toBeVisible({
    timeout: 30_000,
  });
  await releaseByKeyboard(page, title);
}

/**
 * JC4 on Georgia on My Mind as the host sets it (its tempo, its melody layer, its changes a bar a step), with three
 * devices of the learner's own where the chart has the chords they replace: a tritone sub in bar 14, a backdoor into
 * bar 31, a passing °7 in bar 31 (content/advanced/capstones/JC4/jc4.test.ts grades the same piece).
 */
export async function georgiaReharm(): Promise<string> {
  const song = (await songOf("song.georgia-on-my-mind")) as Awaited<ReturnType<typeof songOf>> & {
    answerKey: { code: string; chords?: { bar: number; beat: number; symbol: string }[] };
  };
  const chart = song.answerKey.chords ?? [];
  const changes = Array.from({ length: song.answerKey.bars }, (_, i) => {
    const here = chart.filter((c) => c.bar === i + 1).sort((a, b) => a.beat - b.beat);
    return here.length === 1 ? (here[0]?.symbol ?? "") : `[${here.map((c) => c.symbol).join(" ")}]`;
  });
  const devices: Record<number, [string, string]> = {
    14: ["[Gm7 C7]", "[Gm7 Gb7]"],
    30: ["[Gm7 C7]", "[Bbm7 Eb7]"],
    31: ["F^7", "[F^7@3 F#o7]"],
  };
  for (const [bar, [was, now]] of Object.entries(devices)) {
    if (changes[Number(bar) - 1] !== was) throw new Error(`Georgia's chart changed under bar ${bar}`);
    changes[Number(bar) - 1] = now;
  }
  const layer = (song.answerKey.layers.melody ?? "").replace(/^[A-Za-z_$][\w$]*\s*:\s*/, "");
  return [
    song.answerKey.code.split("\n")[0] as string,
    "",
    `const changes = "<${changes.join(" ")}>"`,
    "",
    `bass: chord(changes).rootNotes(2).s("upright").lpf(900)`,
    `chords: chord(changes).voicing().s("rhodes").gain(.6)`,
    `mel: ${layer}`,
  ].join("\n");
}
