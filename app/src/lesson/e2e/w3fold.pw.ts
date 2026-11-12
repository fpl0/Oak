// Integration surfaces in Paper and Bark: U03.L09 S5's sight-sing keeps the staff and the Sing button above the
// step footer at 1280×720 (the review found both below the fold), with no syllables or degrees written out
// before the take; and, at 1440×900 and 1280×800, the wrong-answer states this integration reworded: an ear step
// on the degree pad ("Not this one yet"), a key signature out of order, the drawn melody of U03.L10 S2 (three or
// four degrees long), and a U04.CP "Intervals in a key" item with its pad.
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { shoot, useUiPrefs } from "../../../../e2e/support/ui.ts";
import { expect, stepIs, test } from "./support.ts";
import { noOverflow, reseedFresh, seed, setQuiet } from "./w3support.ts";

test.describe.configure({ mode: "serial" });
test.afterAll(async ({ request }) => {
  await reseedFresh(request);
});

const SHOTS = fileURLToPath(new URL("./screenshots", import.meta.url));

/** The element's bottom is above the step footer's top, and on screen. */
async function aboveFooter(page: Page, what: ReturnType<Page["locator"]>, label: string) {
  const box = await what.boundingBox();
  const footer = await page.getByTestId("step-footer").boundingBox();
  const vp = page.viewportSize();
  expect(box, `${label} is drawn`).not.toBeNull();
  if (!box || !vp) return;
  expect(box.y, `${label} starts on screen`).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height, `${label} above the footer`).toBeLessThanOrEqual(footer ? footer.y : vp.height);
}

for (const theme of ["paper", "bark"] as const) {
  test(`U03.L09 S5 at 1280x720 in ${theme}: the staff and Sing above the fold, nothing given away`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 720 });
    await useUiPrefs(page, { theme });
    await seed(page, "after U03.L08");
    await setQuiet(page, false);
    await page.goto("/learn/U03.L09?step=S5");
    await stepIs(page, "S5");
    await expect(page.getByText("Drawing…")).toHaveCount(0, { timeout: 30_000 });
    const staff = page.getByTestId("lesson-step").locator("svg").first();
    await aboveFooter(page, staff, "the staff");
    await aboveFooter(page, page.getByRole("button", { name: "Sing", exact: true }), "Sing");
    await expect(page.getByTestId("sing-targets")).toHaveCount(0);
    await noOverflow(page);
    await shoot(page, SHOTS, "w3-sight-fold", theme);
  });
}

for (const m of SCREENSHOT_MATRIX) {
  test(`reworded wrong-answer states in ${m.theme} at ${m.width}x${m.height}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: m.width, height: m.height });
    await useUiPrefs(page, { theme: m.theme });
    await seed(page, "after U03.L09");
    await setQuiet(page, false);

    // U03.L10 S2: a drawn melody of three or four degrees, one wrong.
    await page.goto("/learn/U03.L10?step=S2");
    await stepIs(page, "S2");
    const want = await page.evaluate(
      () =>
        (globalThis as unknown as { __oakLesson: { trial(): { degrees: string[] } } }).__oakLesson.trial()
          .degrees,
    );
    const step = page.getByTestId("lesson-step");
    for (const [i, d] of want.entries())
      await step
        .locator(`[data-degree="${i === 0 ? (d === "1" ? "2" : "1") : d}"]`)
        .first()
        .click();
    await page.getByTestId("check").click();
    await expect(page.getByTestId("step-feedback")).toContainText("Not this one yet. Listen again");
    await noOverflow(page);
    await shoot(page, SHOTS, "w3-dictation-wrong", m.theme);

    // U03.L06 S4 on a learner who has just reached it: the key signature written out of order.
    await seed(page, "after U03.L05");
    await page.goto("/learn/U03.L06?step=S4");
    await stepIs(page, "S4");
    await page.getByTestId("keysig-surface").focus();
    for (const k of ["#", "C", "F"]) await page.keyboard.press(k);
    await page.keyboard.press("ControlOrMeta+Shift+Enter");
    await expect(page.getByTestId("step-feedback")).toContainText("out of order");
    await noOverflow(page);
    await shoot(page, SHOTS, "w3-keysig-wrong", m.theme);
  });
}

test("U04.CP 'Intervals in a key' has a pad to answer on, in both themes", async ({ page }) => {
  test.setTimeout(180_000);
  await seed(page, "U04.CP due");
  await setQuiet(page, false);
  for (const theme of ["paper", "bark"] as const) {
    await useUiPrefs(page, { theme });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/checkpoint/U04");
    const start = page.getByTestId("start-checkpoint");
    await expect(start.or(page.getByTestId("lesson-step"))).toBeVisible({ timeout: 30_000 });
    if (await start.isVisible()) await start.click();
    for (let i = 0; i < 12; i++) {
      await expect(page.getByTestId("lesson-step")).toBeVisible({ timeout: 30_000 });
      if (((await page.getByTestId("step-title").textContent()) ?? "").includes("Intervals in a key")) break;
      // Any other item: answered through the player's own path, to move on.
      await page.evaluate(async () => {
        const d = (
          globalThis as unknown as {
            __oakCheckpoint: {
              kind(): string;
              expected(): unknown;
              exercise(): { tests?: { expect: string; response: unknown }[] };
              answer(r: unknown): Promise<void>;
            };
          }
        ).__oakCheckpoint;
        const pass = d.exercise()?.tests?.find((t) => t.expect === "pass")?.response;
        await d.answer(d.kind() === "family" ? { answer: d.expected() } : (pass ?? { skipped: true }));
      });
    }
    await expect(page.getByTestId("step-title")).toContainText("Intervals in a key");
    await expect(page.getByTestId("lesson-step").locator("[data-degree]")).not.toHaveCount(0);
    await noOverflow(page);
    await shoot(page, SHOTS, "w3-cp-intervals", theme);
  }
});

test("lens keys pressed mid-step leave the step as it was: the content's labels hold, nothing remounts", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await seed(page, "after U03.L08");
  await setQuiet(page, false);
  await page.goto("/learn/U03.L09?step=S2");
  await stepIs(page, "S2");
  const snap = () =>
    page.evaluate(() =>
      (
        globalThis as unknown as { __oakLesson: { snapshot(): { code: string | null } | null } }
      ).__oakLesson.snapshot(),
    );
  await page.getByTestId("check").click();
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "fail");
  const before = await snap();
  // The Workbench's lens switches are not offered inside a step (the content decides its labels)...
  await expect(page.locator('[data-testid^="lens-"]')).toHaveCount(0);
  // ...and their keys, pressed on the transport, change nothing: the verdict and the code stay.
  await page.getByTestId("play-toggle").first().focus();
  for (const k of ["d", "s", "Shift+N", "Shift+K", "Shift+C"]) await page.keyboard.press(k);
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "fail");
  expect(await snap()).toEqual(before);
  await expect(page.locator('[data-testid^="lens-"]')).toHaveCount(0);
});
