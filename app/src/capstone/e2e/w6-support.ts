// Helpers for the Wave 6 capstone specs and the Wave 6 journeys (not a spec): the release by keyboard with a seeded
// take; a CF-T standard from content/repertoire; a transcribed layer cut into the song's sections.
import { expect, type Page } from "@playwright/test";
import { seedTake } from "./seeded-take.ts";

/**
 * Opens the release dialog, names the track, records the seeded take and releases, all from the keyboard. For a
 * track after the first: the dialog does not ask for the album's name.
 */
export async function releaseByKeyboard(page: Page, title: string) {
  const release = page.getByTestId("release");
  await expect(release).toBeEnabled({ timeout: 30_000 });
  await release.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: /Release to the album|Release a new version/ });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.getByLabel("Title").fill(title);
  // Not the album's first track: the album is not named again (a learner who kept "Oak Sessions" included).
  await expect(dialog.getByLabel("Album name")).toHaveCount(0);
  await seedTake(page);
  await dialog.getByTestId("record-take").focus();
  await page.keyboard.press("Enter");
  await expect(dialog.getByTestId("take-audio")).toBeVisible({ timeout: 30_000 });
  await dialog.getByTestId("confirm-release").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("release-ceremony")).toBeVisible({ timeout: 30_000 });
}

export interface AnswerKey {
  bars: number;
  layers: Record<string, string>;
  sections?: { label: string; bars: [number, number] }[];
}
export interface Song {
  id: string;
  title: string;
  bpm: number;
  answerKey: AnswerKey;
}
export async function songOf(id: string): Promise<Song> {
  const mod = (await import(`../../../../content/repertoire/${id.replace(/^song\./, "")}/song.ts`)) as {
    default: Song;
  };
  return mod.default;
}

/**
 * The learner's arrangement of a 32-bar layer (`n("<bar bar …>").rest`): its bars cut into the song's sections,
 * one const per section (`bassA`, `bassA2`, `bassB`, `bassA3`), and one `arrange()` for the track.
 */
export function arranged(
  part: string,
  body: string,
  sections: readonly { label: string; bars: [number, number] }[],
) {
  const open = body.indexOf('("<');
  const close = body.indexOf('>")', open);
  const head = body.slice(0, open + 3);
  const tail = body.slice(close);
  const tokens: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of body.slice(open + 3, close)) {
    if (ch === "[") depth++;
    if (ch === "]") depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (cur) tokens.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) tokens.push(cur);
  const weight = (t: string) => Number(/\]@(\d+)$|^[^[\]]*@(\d+)$/.exec(t)?.slice(1).find(Boolean) ?? 1);
  const seen = new Map<string, number>();
  const consts: string[] = [];
  const parts: string[] = [];
  let at = 0;
  for (const sec of sections) {
    const n = (seen.get(sec.label) ?? 0) + 1;
    seen.set(sec.label, n);
    const name = `${part}${sec.label}${n > 1 ? n : ""}`;
    const len = sec.bars[1] - sec.bars[0] + 1;
    const mine: string[] = [];
    let bars = 0;
    while (bars < len && at < tokens.length) {
      const t = tokens[at++] as string;
      mine.push(t);
      bars += weight(t);
    }
    consts.push(`const ${name} = ${head}${mine.join(" ")}${tail}`);
    parts.push(`[${len}, ${name}]`);
  }
  return { consts, track: `${part}: arrange(${parts.join(", ")})` };
}
