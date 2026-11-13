// Wave 3 carry-overs of the capstone and the album, on the capstone stack (5210/8810, fake tutor), each test from
// a dev seed:
// - inside a session the "Checked version N: every requirement is met" notice stays: the workspace no longer
//   remounts when the server links the draft its first save created; the first release names the album;
// - after the first release a review's `tryCode` applies in the editor (revision mode, contracts §10.7);
// - the album's name is renamed in place from the keyboard and printed on every cover;
// - a version whose code does not run still gets a readable 56 px (and 48 px) thumbnail, grown from its seed.
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { capstones } from "../../../../content/capstones.ts";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { PREFS_KEY, shoot, useUiPrefs } from "../../../../e2e/support/ui.ts";
import { stack } from "./playwright.config.ts";
import { seedTake } from "./seeded-take.ts";

const SHOTS = fileURLToPath(new URL("./screenshots", import.meta.url));
const H = { "content-type": "application/json", origin: stack.baseURL, "x-oak": "1" };
const C0 = capstones.find((c) => c.id === "C0");
const REFERENCE = (() => {
  const t = C0?.brief?.tests.find((x) => x.name === "four bars, tom fill in bar 4");
  if (!t || !("code" in t.response)) throw new Error("C0 reference test missing");
  return t.response.code;
})();
const EDITOR = "oak_capstone-C0_0_";

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
});

async function api<T>(page: Page, method: string, path: string, data?: unknown): Promise<T> {
  const res = await page.request.fetch(`${stack.apiURL}/api${path}`, {
    method,
    headers: H,
    ...(data === undefined ? {} : { data }),
  });
  expect(res.ok(), `${method} ${path}: ${res.status()}`).toBe(true);
  return (await res.json()) as T;
}

async function seed(page: Page, point: string) {
  await api(page, "PUT", "/dev/clock", { reset: true });
  await api(page, "POST", "/dev/seed", { point });
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    // Strudel's one error per failed evaluation; Vite's re-optimise; endpoints other engineers still build (501).
    if (/\[eval\]|evaluation error|Outdated Optimize Dep|status of 501 \(Not Implemented\)/.test(m.text()))
      return;
    errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

const editor = (page: Page) =>
  page.waitForFunction(
    (id) =>
      !!(globalThis as { __oakStrudel?: { editors: Map<string, unknown> } }).__oakStrudel?.editors.get(id),
    EDITOR,
    { timeout: 60_000 },
  );

async function setCode(page: Page, code: string) {
  await editor(page);
  await page.evaluate(
    ([id, c]) =>
      (
        globalThis as unknown as { __oakStrudel: { editors: Map<string, { setCode(c: string): void }> } }
      ).__oakStrudel.editors
        .get(id as string)
        ?.setCode(c as string),
    [EDITOR, code],
  );
}

const getCode = (page: Page) =>
  page.evaluate(
    (id) =>
      (
        globalThis as unknown as { __oakStrudel: { editors: Map<string, { getCode(): string }> } }
      ).__oakStrudel.editors
        .get(id)
        ?.getCode() ?? null,
    EDITOR,
  );

test("in a session the check's notice stays on screen, and the first release names the album", async ({
  page,
}) => {
  test.setTimeout(200_000);
  const errors = watchErrors(page);
  await seed(page, "C0 ready");
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await page.goto("/");
  await page.getByTestId("start-session").click();
  await expect(page).toHaveURL(/\/session/);
  // The warm-up is the drills engineer's; this test is about the capstone block, so its sets are reported skipped.
  await page.waitForFunction(
    () =>
      (window as unknown as { __oakSession?: { state(): { block: string | null } } }).__oakSession?.state()
        .block === "warmup",
    null,
    { timeout: 60_000 },
  );
  await page.evaluate(() => {
    const o = (
      window as unknown as {
        __oakSession: {
          state(): { plan: { warmup: { items: { id: string }[] } } };
          report(r: unknown): void;
        };
      }
    ).__oakSession;
    for (const it of o.state().plan.warmup.items)
      o.report({
        block: "warmup",
        source: "drills",
        warmupItemId: it.id,
        drillSessionId: null,
        meanCredit: null,
        skipped: true,
      });
  });
  const workspace = page.getByTestId("capstone-workspace");
  await expect(workspace).toBeVisible({ timeout: 60_000 });
  await editor(page);
  // No draft exists yet in a session: the first save creates it and the check makes the server link it.
  expect((await api<{ sketchId: string | null }>(page, "GET", "/capstones/C0")).sketchId).toBeNull();
  await page.evaluate(() => {
    const ws = document.querySelector('[data-testid="capstone-workspace"]');
    (window as unknown as { __remounts: number }).__remounts = 0;
    if (ws)
      new MutationObserver(() => {
        if (ws.textContent?.includes("Opening your draft"))
          (window as unknown as { __remounts: number }).__remounts++;
      }).observe(ws, { childList: true, subtree: true, characterData: true });
  });
  await setCode(page, REFERENCE);
  await expect(page.getByTestId("req-count")).toHaveText(/(\d+) of \1 met/, { timeout: 60_000 });
  await page.getByTestId("check-track").click();
  const notice = page
    .getByRole("status")
    .filter({ hasText: /Checked version \d+: every requirement is met/ });
  await expect(notice).toBeVisible({ timeout: 30_000 });
  await expect(notice).toContainText("It's ready to release when you are.");
  await expect
    .poll(async () => (await api<{ sketchId: string | null }>(page, "GET", "/capstones/C0")).sketchId)
    .not.toBeNull();
  // Still there once the linked draft has arrived, and the workspace never unmounted.
  await page.waitForTimeout(1500);
  await expect(notice).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __remounts: number }).__remounts)).toBe(0);

  // The first release: the dialog asks for the album's name too.
  await page.getByTestId("release").click();
  const dialog = page.getByRole("dialog", { name: "Release to the album" });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  const name = dialog.getByLabel("Album name");
  await expect(name).toHaveValue("Oak Sessions");
  await name.fill("Night Loops");
  // A seeded take (seeded-take.ts): the recorder's own window, uploaded through the release path.
  await seedTake(page);
  await dialog.getByTestId("record-take").click();
  await expect(dialog.getByTestId("take-audio")).toBeVisible({ timeout: 30_000 });
  await dialog.getByTestId("confirm-release").click();
  const ceremony = page.getByTestId("release-ceremony");
  await expect(ceremony).toBeVisible({ timeout: 30_000 });
  await expect(
    ceremony.locator("svg.oak-cover text").filter({ hasText: "NIGHT LOOPS" }).first(),
  ).toBeAttached();
  await page.goto("/album");
  await expect(page.getByTestId("album-title")).toHaveText("Night Loops");
  expect(errors).toEqual([]);
});

test("after the first release, a review's try-it code applies in the editor", async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await seed(page, "C0 released");
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await page.addInitScript((key) => {
    const cur = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(key, JSON.stringify({ ...cur, tutorOpen: true }));
  }, PREFS_KEY);
  await page.goto("/capstone/C0");
  await expect(page.getByText("On the album")).toBeVisible({ timeout: 60_000 });
  await editor(page);
  const done = await page.evaluate(async () => {
    const res = await fetch("/api/tutor/reviews/capstone", {
      method: "POST",
      headers: { "X-Oak": "1", "Content-Type": "application/json" },
      body: JSON.stringify({
        thread: { subjectKind: "capstone", subjectId: "C0" },
        kind: "review-capstone",
        userText: "Please review my draft.",
      }),
    });
    return (await res.text()).includes("event: done");
  });
  expect(done).toBe(true);
  await page.reload();
  await expect(page.getByText("On the album")).toBeVisible({ timeout: 60_000 });
  await editor(page);
  const review = page.getByTestId("tutor-chat").getByTestId("review").last();
  await expect(review).toBeVisible({ timeout: 30_000 });
  const card = review.getByTestId("code-card").first();
  await expect(card).toHaveAttribute("data-apply", "applicable");
  await expect(card.getByTestId("preview-only")).toHaveCount(0);
  const before = await getCode(page);
  await card.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByText("One change in the editor. Undo with ⌘Z.")).toBeVisible();
  const after = await getCode(page);
  expect(after).not.toBe(before);
  await expect(card.getByRole("button", { name: "Apply again" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("the album's name: renamed in place from the keyboard, printed on the covers, back to the default", async ({
  page,
}) => {
  await seed(page, "C0 released");
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await page.goto("/album");
  const title = page.getByTestId("album-title");
  await expect(title).toHaveText("Oak Sessions");
  await page.getByTestId("rename-album").focus();
  await page.keyboard.press("Enter");
  const input = page.getByLabel("Album name");
  await expect(input).toBeFocused();
  await page.keyboard.type("Draft");
  await page.keyboard.press("Escape");
  await expect(title).toHaveText("Oak Sessions");
  await expect(page.getByTestId("rename-album")).toBeFocused();
  // Escape inside the field closes the field, not the page.
  await expect(page).toHaveURL(/\/album$/);

  await page.keyboard.press("Enter");
  await input.fill("  Kitchen   Tapes ");
  await page.keyboard.press("Enter");
  await expect(title).toHaveText("Kitchen Tapes");
  await expect(page.getByTestId("rename-album")).toBeFocused();
  await expect(
    page.locator("svg.oak-cover text").filter({ hasText: "KITCHEN TAPES" }).first(),
  ).toBeAttached();
  await page.reload();
  await expect(title).toHaveText("Kitchen Tapes");

  await page.getByTestId("rename-album").click();
  await input.fill("");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(title).toHaveText("Oak Sessions");
});

test("a version whose code does not run keeps a readable thumbnail, grown from its seed", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await seed(page, "C0 released");
  const album = await api<{ tracks: { id: string }[] }>(page, "GET", "/album");
  const trackId = album.tracks[0]?.id as string;
  const detail = await api<{ versions: { sketchId: string }[] }>(page, "GET", `/album/tracks/${trackId}`);
  const sketchId = detail.versions[0]?.sketchId as string;
  const added = await api<{ sketch: { currentVersion: number } }>(
    page,
    "POST",
    `/sketches/${sketchId}/versions`,
    {
      sessionId: null,
      code: 'drums: s("bd sd [hh hh"',
      bpm: null,
      meter: "4/4",
      key: null,
      analysis: null,
      note: null,
      tutorAssisted: false,
      band: null,
      flags: { lockedTools: [], previewTools: [] },
      ranOk: false,
    },
  );
  await api(page, "POST", `/album/tracks/${trackId}/versions`, {
    sketchId,
    sketchVersion: added.sketch.currentVersion,
    linerNotesMd: "A take that does not run yet.",
    theoryTags: [],
    attribution: null,
  });

  for (const m of SCREENSHOT_MATRIX) {
    await page.setViewportSize({ width: m.width, height: m.height });
    await useUiPrefs(page, { theme: m.theme, motion: "off" });
    await page.goto("/album");
    const thumb = page.locator(`[data-track="${trackId}"] svg.oak-cover`);
    await expect(thumb).toHaveAttribute("aria-label", /grown from its seed/, { timeout: 60_000 });
    await expect(thumb).toHaveAttribute("width", "56");
    // Its bar lines draw at least ~0.85 px at 56 px: stroke-width in cover units ≥ 1000 / 56 × 0.85.
    const widest = await thumb.evaluate((svg) =>
      Math.max(
        0,
        ...[...svg.querySelectorAll("path")].map((p) => Number(p.getAttribute("stroke-width") ?? 0)),
      ),
    );
    expect(widest).toBeGreaterThanOrEqual(15);
    await shoot(page, SHOTS, "w3-album-seed-thumb", m.theme);
  }
  await page.goto(`/album/${trackId}`);
  const versions = page
    .locator("section[aria-labelledby=trk-versions]")
    .or(page.getByRole("region", { name: "Versions" }));
  await expect(versions.locator("svg.oak-cover").first()).toHaveAttribute(
    "aria-label",
    /v2, grown from its seed/,
    {
      timeout: 60_000,
    },
  );
  await expect(versions.locator("svg.oak-cover").nth(1)).toHaveAttribute("aria-label", /v1: \d+ rings/);
  await shoot(page, SHOTS, "w3-track-seed-thumb", "bark");
});
