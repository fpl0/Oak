// The Wave 3 step surfaces in Paper and Bark at 1440×900 and 1280×800 (wave3.md §9): degree labels switching
// on (U03.L02 S1), the target's roll after a failed check (S4), the sung pattern (S8), and from the dev fixture
// the passive block, a key signature, notes with a key signature, a by-ear step after a wrong check, and a
// sight-sing. Nothing overflows sideways and at 1280×800 every primary action is on screen without scrolling.
// The fixture is a preview (nothing saved); U03.L02 is opened on a learner seeded to just before it.
import { fileURLToPath } from "node:url";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { shoot, useUiPrefs } from "../../../../e2e/support/ui.ts";
import { expect, setCode, stepIs, test } from "./support.ts";
import { FIXTURE, noOverflow, onScreen, reseedFresh, seed, setQuiet } from "./w3support.ts";

test.afterAll(async ({ request }) => {
  await reseedFresh(request);
});

const SHOTS = fileURLToPath(new URL("./screenshots", import.meta.url));
const deg = (p: string, key = "C4:major", bpm = 84) =>
  `setcpm(${bpm}/4)\n\nmel: n("${p}").scale("${key}").s("piano")`;

for (const m of SCREENSHOT_MATRIX) {
  test(`Wave 3 steps in ${m.theme} at ${m.width}x${m.height}`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: m.width, height: m.height });
    await useUiPrefs(page, { theme: m.theme });
    // A learner just before U03.L02, so its degree labels are new (and Quiet mode off).
    await seed(page, "after U02.CP");
    await setQuiet(page, false);

    await page.goto("/learn/U03.L02?step=S1");
    await stepIs(page, "S1");
    await expect(page.getByTestId("feature-moment")).toHaveAttribute("data-on", "1", { timeout: 5_000 });
    await noOverflow(page);
    await onScreen(page, "continue");
    await shoot(page, SHOTS, "w3-moment", m.theme);

    await page.goto("/learn/U03.L02?step=S4");
    await stepIs(page, "S4");
    await setCode(page, deg("<[3 3 4 5] [5 4 3 2]>"));
    await page.getByTestId("check").click();
    await expect(page.getByTestId("target-roll")).toBeVisible();
    await expect(page.getByText("Drawing…")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("workbench")).toHaveAttribute("data-analysis", "ready");
    await noOverflow(page);
    await onScreen(page, "check");
    await shoot(page, SHOTS, "w3-target-roll", m.theme);

    await page.goto("/learn/U03.L02?step=S8");
    await stepIs(page, "S8");
    await noOverflow(page);
    await onScreen(page, "check");
    await shoot(page, SHOTS, "w3-sing", m.theme);

    await page.goto(`${FIXTURE}&step=S1`);
    await stepIs(page, "S1");
    await page.getByTestId("passive-play").click();
    await expect(page.getByTestId("passive-names").locator("li")).toHaveCount(1, { timeout: 15_000 });
    await noOverflow(page);
    await onScreen(page, "continue");
    await shoot(page, SHOTS, "w3-passive", m.theme);
    await page.getByTestId("passive-play").click();

    await page.goto(`${FIXTURE}&step=S2`);
    await stepIs(page, "S2");
    await noOverflow(page);
    await onScreen(page, "check");
    await shoot(page, SHOTS, "w3-keysig", m.theme);

    await page.goto(`${FIXTURE}&step=S3`);
    await stepIs(page, "S3");
    await noOverflow(page);
    await onScreen(page, "check");
    await shoot(page, SHOTS, "w3-staff", m.theme);

    await page.goto(`${FIXTURE}&step=S4`);
    await stepIs(page, "S4");
    await setCode(page, deg("<[2 1 0 ~] [0 0 0 0 2 2 2 2]>", "C4:major", 90));
    await page.getByTestId("check").click();
    await expect(page.getByTestId("first-wrong-bar")).toBeVisible();
    await noOverflow(page);
    await onScreen(page, "check");
    await shoot(page, SHOTS, "w3-byear", m.theme);

    await page.goto(`${FIXTURE}&step=S5`);
    await stepIs(page, "S5");
    await expect(page.getByText("Drawing…")).toHaveCount(0, { timeout: 30_000 });
    await noOverflow(page);
    await onScreen(page, "check");
    await shoot(page, SHOTS, "w3-sight", m.theme);

    // Quiet mode: the sight-sing as its identify fallback.
    await setQuiet(page, true);
    await page.reload();
    await stepIs(page, "S5");
    await expect(page.getByTestId("sing-quiet-identify")).toBeVisible();
    await expect(page.getByText("Drawing…")).toHaveCount(0, { timeout: 30_000 });
    await noOverflow(page);
    await onScreen(page, "continue");
    await shoot(page, SHOTS, "w3-quiet", m.theme);
    await setQuiet(page, false);
  });
}
