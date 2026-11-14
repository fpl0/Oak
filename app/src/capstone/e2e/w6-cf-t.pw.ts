// CF-T "Standard Transcription" through its four sessions on the capstone stack (5210/8810, the fake tutor), one
// test per session, each from its own seed (wave6.md §6):
// - S1 from "CF-T open (U15.L01 done)": the song chosen; the form map opens the session and the bass waits for it;
//   a wrong map is marked "not yet" and says what to listen for (never the answer); the song's own map passes and
//   writes the draft (one const per distinct section, one arrange() per part); the bass of each section passes; the
//   session finishes.
// - S2 from "C6 open" (CF-T.S1 done): the changes, section by section, pass; the session finishes.
// - S3 from "CF-T.S2 done": the tune, section by section, passes; the session finishes.
// - S4 from "after U16.L03" (CF-T.S3 done): the rubric of the last session (the four parts, the song's own
//   sections) is open on a draft without drums and met once a drum part is added; reviewed; released by keyboard.
// What is right comes from the chosen song's answer key in content/repertoire. The grading (gradeFormMap, the
// phrase matchers, the S4 rubric) is unit-tested in x1/cft.test.ts and content/core/capstones/CF-T; the release
// uses the seeded take (d9).
import { expect, type Page, test } from "@playwright/test";
import { useUiPrefs } from "../../../../e2e/support/ui.ts";
import { capstoneDef, editor, seedFirst, setCode, shots, watchErrors } from "./w5-support.ts";
import { arranged, releaseByKeyboard, type Song, songOf } from "./w6-support.ts";

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
});

const CFT = capstoneDef("CF-T");

/** Opens CF-T; picks the first song when it asks; returns the song in the workspace. */
async function openCft(page: Page): Promise<Song> {
  await page.goto("/capstone/CF-T");
  await expect(page.getByRole("heading", { level: 1, name: CFT.title })).toBeVisible({ timeout: 60_000 });
  const songs = page.getByRole("radiogroup", { name: "The song" });
  if (await songs.isVisible().catch(() => false)) await songs.getByRole("radio").first().click();
  const start = page.getByRole("button", { name: /^(Start|Continue) session \d of 4$/ });
  if (await start.isVisible().catch(() => false)) await start.click();
  await expect(page.getByTestId("capstone-workspace")).toHaveAttribute("data-kind", "transcribe", {
    timeout: 60_000,
  });
  await expect(page.getByTestId("song-source")).toBeVisible({ timeout: 60_000 });
  const id = await page.getByTestId("song-source").getAttribute("data-song");
  expect(CFT.song ?? []).toContain(id);
  return songOf(String(id));
}

/** Names section `i` of the strip from the keyboard: select the section, then type its letter. */
async function nameSection(page: Page, i: number, label: string) {
  await page.getByTestId("cft-form-map").getByTestId("form-section").nth(i).click();
  await page.keyboard.press(label);
  await expect(page.getByTestId("cft-form-map").getByTestId("form-section").nth(i)).toHaveAttribute(
    "data-label",
    label,
  );
}

const tempo = (s: Song) => `setcpm(${s.bpm}/4)`;
const rows = (page: Page, layer: string) =>
  page.getByTestId("x1-checks").locator(`[data-check^="${layer}-"]`);

async function passRows(page: Page, layer: string) {
  const r = rows(page, layer);
  await expect(r).toHaveCount(4);
  // The seed never holds what the session is to produce: every section of this layer is still to be checked.
  for (let i = 0; i < 4; i++) await expect(r.nth(i)).toHaveAttribute("data-state", /^(new|open)$/);
  for (let i = 0; i < 4; i++) {
    const row = r.nth(i);
    await row.getByTestId("check-phrase").click();
    await expect(row).toHaveAttribute("data-state", "passed", { timeout: 60_000 });
  }
}

async function finish(page: Page, n: number) {
  await page.getByTestId("finish-session").click();
  await expect(page.getByRole("status").filter({ hasText: `Session ${n} of 4 done.` })).toBeVisible({
    timeout: 30_000,
  });
}

test("CF-T session 1 from “CF-T open”: the form map first, wrong then right, the draft from it, the bass", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await seedFirst(page, ["CF-T open (U15.L01 done)"]);
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  const song = await openCft(page);
  await editor(page, "CF-T");
  const sections = song.answerKey.sections ?? [];
  expect(sections.length).toBe(4);

  // The map opens the session; the bass waits for it.
  const map = page.getByTestId("cft-form-map");
  await expect(map).toBeVisible();
  await expect(rows(page, "bass").first()).toHaveAttribute("data-state", "locked");
  // The checks are the song's sections; their letters would give the form away, so none yet.
  await expect(rows(page, "bass").first()).toContainText("Section 1 · bass");

  // Wrong: two halves. Not yet, and it says what to listen for without giving the map.
  const half = Math.floor(song.answerKey.bars / 2) + 1;
  await map.locator(`[data-testid="form-line"][data-bar="${half}"]`).click();
  await nameSection(page, 0, "A");
  await nameSection(page, 1, "B");
  await map.getByTestId("cft-form-check").click();
  const feedback = map.getByTestId("cft-form-feedback");
  await expect(feedback).toContainText(/not yet/i, { timeout: 30_000 });
  await expect(feedback).not.toContainText("AABA");
  await expect(rows(page, "bass").first()).toHaveAttribute("data-state", "locked");
  await shots(page, "cft-s1-form-wrong");

  // Right: the song's own sections. The draft is written from it.
  await map.locator(`[data-testid="form-line"][data-bar="${half}"]`).click();
  for (const s of sections.slice(1))
    await map.locator(`[data-testid="form-line"][data-bar="${s.bars[0]}"]`).click();
  await expect(map.getByTestId("form-section")).toHaveCount(sections.length);
  for (const [i, s] of sections.entries()) await nameSection(page, i, s.label);
  await map.getByTestId("cft-form-check").click();
  await expect(map.getByTestId("cft-form-state")).toHaveAttribute("data-state", "passed", {
    timeout: 30_000,
  });
  await expect(page.locator(".cm-content").first()).toContainText("bass: arrange(");
  await expect(rows(page, "bass").first()).not.toHaveAttribute("data-state", "locked");
  await expect(rows(page, "bass").nth(2)).toContainText(`Section 3 (${sections[2]?.label}) · bass`);

  // The bass, section by section.
  await setCode(page, "CF-T", `${tempo(song)}\n\nbass: ${song.answerKey.layers.bass}`);
  await passRows(page, "bass");
  await shots(page, "cft-s1-bass");
  await finish(page, 1);
  expect(errors).toEqual([]);
});

test("CF-T session 2 from “C6 open”: the changes, section by section", async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await seedFirst(page, ["C6 open"]);
  await useUiPrefs(page, { theme: "bark", motion: "off" });
  const song = await openCft(page);
  await editor(page, "CF-T");
  await expect(page.locator('[data-session="CF-T.S2"]')).toHaveAttribute("aria-current", "step");
  const l = song.answerKey.layers;
  await setCode(page, "CF-T", `${tempo(song)}\n\nbass: ${l.bass}\nchords: ${l.chords}`);
  await passRows(page, "changes");
  await shots(page, "cft-s2-changes");
  await finish(page, 2);
  expect(errors).toEqual([]);
});

test("CF-T session 3 from “CF-T.S2 done”: the tune, section by section", async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await seedFirst(page, ["CF-T.S2 done"]);
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  const song = await openCft(page);
  await editor(page, "CF-T");
  await expect(page.locator('[data-session="CF-T.S3"]')).toHaveAttribute("aria-current", "step");
  const l = song.answerKey.layers;
  await setCode(page, "CF-T", `${tempo(song)}\n\nbass: ${l.bass}\nchords: ${l.chords}\nmelody: ${l.melody}`);
  await passRows(page, "melody");
  await finish(page, 3);
  expect(errors).toEqual([]);
});

test("CF-T session 4 from “after U16.L03”: the four parts and the song's sections; reviewed; released", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await seedFirst(page, ["after U16.L03"]);
  await useUiPrefs(page, { theme: "bark", motion: "off" });
  const song = await openCft(page);
  await editor(page, "CF-T");
  await expect(page.locator('[data-session="CF-T.S4"]')).toHaveAttribute("aria-current", "step");
  const l = song.answerKey.layers;
  // The form was mapped in session 1 (in another browser): the song's sections stand on the strip, named.
  await expect(page.getByTestId("cft-form-state")).toHaveAttribute("data-state", "passed");
  await expect(page.getByTestId("cft-form-map").getByTestId("form-section")).toHaveCount(4);
  await expect(page.getByTestId("x1-checks")).toContainText("checked on the whole arrangement");
  // The seeded draft is the transcription as three whole lines: no drums, no sections yet.
  const rubric = page.getByTestId("session-rubric");
  const roles = rubric.locator('[data-rule="roles"]');
  const form = rubric.locator('[data-rule="form"]');
  await expect(roles).toHaveAttribute("data-state", "open", { timeout: 30_000 });
  await expect(form).toHaveAttribute("data-state", "open");
  // The arrangement: a drum part, and every part cut into the song's own sections.
  const sections = song.answerKey.sections ?? [];
  const groove = 's("bd ~ bd ~, ~ sd ~ sd, rd*8").gain(.4)';
  const drums = {
    consts: [...new Set(sections.map((x) => x.label))].map((x) => `const drums${x} = ${groove}`),
    track: `drums: arrange(${sections.map((x) => `[${x.bars[1] - x.bars[0] + 1}, drums${x.label}]`).join(", ")})`,
  };
  const tracks = [
    drums,
    arranged("bass", l.bass as string, sections),
    arranged("chords", l.chords as string, sections),
    arranged("mel", l.melody as string, sections),
  ];
  await setCode(
    page,
    "CF-T",
    [tempo(song), "", ...tracks.flatMap((t) => t.consts), "", ...tracks.map((t) => t.track)].join("\n"),
  );
  await expect(roles).toHaveAttribute("data-state", "met", { timeout: 30_000 });
  await expect(form).toHaveAttribute("data-state", "met");
  await shots(page, "cft-s4");
  await page.getByTestId("request-review").click();
  const review = page.getByTestId("review-summary");
  await expect(review).toBeVisible({ timeout: 60_000 });
  await expect(review.locator("[data-revision]")).toHaveCount(2);
  await releaseByKeyboard(page, song.title);
  expect(errors).toEqual([]);
});
