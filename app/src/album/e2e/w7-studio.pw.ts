// Wave 7 on the album (wave7.md §5.5, §7.3; the review-studio project), from seeds:
// - Side B: a released track capstone joins its own side with a cover from the same family; Side A stays as it was;
// - Export on a real album track (AC1, released with its Band): the WAV is rendered offline from what `album.source`
//   says the version plays — its code cut to two bars here (the rule of §7.3), its Band as the release stored it,
//   built in the app from the Band's state — with progress; Cancel stops it and nothing is saved; the file's length
//   is two bars plus the tail and its peak is the Band's (the learner's two bars are almost silent), under full
//   scale; a server that cannot say what the version plays gets a plain sentence, never a partial file; the
//   release recording is untouched;
// - the whole course complete: the album's heading says so, Side A and Side B as records, one Play everything.
// The request, the file name, a loop's length and every failure sentence are bun-tested (app/src/album/wave7.test.ts).
import { expect, test } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { shoot } from "../../../../e2e/support/ui.ts";
import { api, blockHmr, watchErrors } from "./support.ts";

const SHOTS = new URL("./screenshots", import.meta.url).pathname;
// The learner's part is nearly silent (gain .02): a loud file can only be the Band playing beside it.
const TWO_BARS = 'setcpm(120/4)\n\nkeys: note("<c5 ~>").s("piano").gain(.02)';
/** The Band as a release stores it (`{ bandId, flavour, mutes }`), when the seeded release kept none. */
const STORED_BAND = { bandId: "band.axis-4bar", flavour: "flavour.jazz-soul", mutes: ["drums"] };

/** Seeds a Wave 7 point, or skips naming it while the server does not have it yet. */
async function seedOrSkip(page: import("@playwright/test").Page, point: string) {
  await api(page, "PUT", "/dev/clock", { reset: true });
  const r = await api(page, "POST", "/dev/seed", { point });
  test.skip(r.status !== 200, `no seed "${point}" yet: ${JSON.stringify(r.body).slice(0, 160)}`);
}

test("Side B: AC1 on its own side; Export renders a WAV of the version with its Band, Cancel saves nothing, a failure says why", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await blockHmr(page);
  await seedOrSkip(page, "AC2 open");
  const errors = watchErrors(page);
  // What the version plays, cut to two bars for the render (the whole song is exported once, in offline.pw.ts);
  // its Band as the release stored it (a seeded release keeps none, so the stored state is put in its place).
  let served: Record<string, unknown> | null = null;
  await page.route(/\/api\/album\/tracks\/[^/]+\/versions\/\d+\/source$/, async (route) => {
    const res = await route.fetch();
    const body = (await res.json()) as Record<string, unknown>;
    const band = body.band ?? STORED_BAND;
    served = { ...body, code: TWO_BARS, band, mutes: body.band ? body.mutes : { drums: true } };
    await route.fulfill({ response: res, json: served });
  });
  await page.goto("/album");
  const sideB = page.locator("section[data-side='B']");
  await expect(sideB).toBeVisible({ timeout: 60_000 });
  await expect(sideB).toContainText("Jazz, rhythm and sound");
  const row = sideB.locator("li[data-track]").first();
  await expect(row).toBeVisible();
  await row.getByRole("link").first().click();
  await expect(page.getByTestId("export")).toBeVisible({ timeout: 60_000 });
  const audio = page.getByTestId("track-audio");
  const audioBefore = (await audio.count()) > 0 ? await audio.getAttribute("src") : null;

  // Cancel: the render stops and nothing is downloaded.
  let downloads = 0;
  page.on("download", () => downloads++);
  await page.getByTestId("export-wav").click();
  await expect(page.getByTestId("export-cancel")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("export-cancel").click();
  await expect(page.getByTestId("export-done")).toContainText("cancelled. Nothing was saved.");
  expect(downloads).toBe(0);

  // The render: progress, then a WAV of the two bars (RIFF, two channels, 2 bars at 120 BPM plus its tail).
  const download = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByTestId("export-wav").focus();
  await page.keyboard.press("Enter");
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.wav$/);
  const path = await file.path();
  const bytes = (await import("node:fs")).readFileSync(path);
  expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
  expect(bytes.subarray(8, 12).toString()).toBe("WAVE");
  expect(bytes.readUInt16LE(22)).toBe(2);
  const seconds = bytes.readUInt32LE(40) / (bytes.readUInt32LE(24) * 2 * 2);
  // Two bars at 120 BPM are 4 s; the tail rings out to −60 dB, at most the renderer's 30-second limit.
  expect(seconds).toBeGreaterThan(3.95);
  expect(seconds).toBeLessThan(34);
  expect(served).not.toBeNull();
  // The peak, from the 16-bit samples: the Band's (the learner's part alone peaks near .02), never clipped.
  let peak = 0;
  for (let i = 44; i + 1 < bytes.length; i += 2)
    peak = Math.max(peak, Math.abs(bytes.readInt16LE(i)) / 32768);
  expect(peak).toBeGreaterThan(0.1);
  expect(peak).toBeLessThan(1);
  await expect(page.getByTestId("export-done")).toContainText("The release recording stays as it is.");
  expect((await audio.count()) > 0 ? await audio.getAttribute("src") : null).toBe(audioBefore);

  // A server that cannot say what the version plays: a plain sentence, nothing saved.
  await page.unroute(/\/api\/album\/tracks\/[^/]+\/versions\/\d+\/source$/);
  await page.route(/\/api\/album\/tracks\/[^/]+\/versions\/\d+\/source$/, (route) =>
    route.fulfill({
      status: 501,
      json: { error: { code: "not_implemented", message: "album.source is not built yet" } },
    }),
  );
  await page.getByTestId("export-wav").click();
  await expect(page.getByTestId("export-error")).toHaveText(
    "Export is not available on this server yet: it cannot read what this version plays. Nothing was saved.",
  );
  expect(errors.filter((e) => !/501|Not Implemented/.test(e))).toEqual([]);
});

test("the whole course complete: the album says so, both sides as records, Play everything", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await blockHmr(page);
  await seedOrSkip(page, "whole course complete");
  await page.goto("/album");
  await expect(page.getByTestId("course-complete")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("course-complete")).toContainText("Side B the jazz, rhythm and sound tracks");
  await expect(page.getByTestId("side-a-record")).toBeVisible();
  await expect(page.getByTestId("side-b-record")).toBeVisible();
  await expect(page.getByTestId("side-b-record").locator("[data-cover]")).toHaveCount(8);
  await expect(page.getByTestId("play-everything")).toBeEnabled();
  // The covers are drawn once their music is read: the shots wait for every one of both sides.
  await expect(page.locator("[data-cover] svg[data-cover-rings]").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-cover] svg:not([data-cover-rings])")).toHaveCount(0, { timeout: 30_000 });
  // One page per state: the matrix resizes in place.
  for (const m of SCREENSHOT_MATRIX) {
    await page.setViewportSize({ width: m.width, height: m.height });
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, m.theme);
    await shoot(page, SHOTS, "w7-whole-course", m.theme);
  }
});
