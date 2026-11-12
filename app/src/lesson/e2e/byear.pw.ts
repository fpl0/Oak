// By-ear transcription and passive listening (the dev fixture of the Wave 3 step kinds): the source plays with
// its code, roll and staff hidden, at full speed or slower, looped or once, with the rule of what counts shown
// first and the Workbench's A/B against your code; a wrong second bar says the first wrong note is in bar 2; the
// tune written in another key passes (any key counts) and only then the source's roll and staff appear. The
// passive block plays its stream, names each pair as it plays, and finishes without asking anything.
import { expect, setCode, stepIs, test } from "./support.ts";
import { FIXTURE } from "./w3support.ts";

const T = "setcpm(90/4)\n\n";
const deg = (p: string, key = "C4:major") => `${T}mel: n("${p}").scale("${key}").s("piano")`;

test("by ear: hidden source, rates and loop, first wrong bar, any key passes, then the source appears", async ({
  page,
}) => {
  await page.goto(`${FIXTURE}&step=S4`);
  await stepIs(page, "S4");
  const panel = page.getByTestId("by-ear");
  await expect(panel).toHaveAttribute("data-accepts", "any-key");
  await expect(page.getByTestId("by-ear-rule")).toContainText("any key");
  // Nothing of the source is on screen: no roll, no staff, no code.
  await expect(page.getByTestId("source-revealed")).toHaveCount(0);
  await expect(page.locator(".cm-content")).not.toContainText("0 0 0 0 1 1 1 1");

  // The source plays at full speed, then slower, and stops.
  const play = page.getByTestId("play-source");
  await play.click();
  await expect(play).toHaveAttribute("data-playing", "1", { timeout: 15_000 });
  await page.getByTestId("rate-0.75").click();
  await expect(page.getByTestId("rate-0.75")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("loop-source").click();
  await expect(page.getByTestId("loop-source")).toHaveAttribute("aria-pressed", "false");
  await play.click();
  await expect(play).toHaveAttribute("data-playing", "0");
  // The Workbench offers A/B between your code and the tune.
  await expect(page.getByText("The tune", { exact: false }).first()).toBeVisible();

  // A wrong second bar: the first wrong note is in bar 2.
  await setCode(page, deg("<[2 1 0 ~] [0 0 0 0 2 2 2 2]>"));
  await page.getByTestId("check").click();
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "fail");
  await expect(page.getByTestId("first-wrong-bar")).toHaveAttribute("data-bar", "2");
  await expect(page.getByTestId("first-wrong-bar")).toContainText("bar 2");
  await expect(page.getByTestId("source-revealed")).toHaveCount(0);

  // The tune in G (any key counts): a pass, and the source's roll and staff appear to compare.
  await setCode(page, deg("<[2 1 0 ~] [0 0 0 0 1 1 1 1]>", "G4:major"));
  await page.getByTestId("check").click();
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "pass");
  await expect(page.getByTestId("source-revealed")).toBeVisible();
  await expect(page.getByTestId("continue")).toBeEnabled();
});

test("passive listening: three pairs named as they play, nothing asked, done at the end", async ({
  page,
}) => {
  await page.goto(`${FIXTURE}&step=S1`);
  await stepIs(page, "S1");
  const block = page.getByTestId("passive");
  await expect(block).toHaveAttribute("data-items", "3");
  await expect(page.getByTestId("check")).toHaveCount(0);
  await expect(page.getByTestId("continue")).toBeEnabled();
  await page.getByTestId("passive-play").click();
  await expect(page.getByTestId("passive-progress")).toHaveText(/1 of 3/, { timeout: 15_000 });
  await expect(page.getByTestId("passive-names").locator("li")).toHaveCount(1);
  await expect(page.getByTestId("passive-names")).toContainText(
    /(major|minor|perfect|augmented|diminished) \d/,
  );
  await expect(page.getByTestId("passive-done")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("passive-names").locator("li")).toHaveCount(3);
  await expect(page.getByTestId("continue")).toHaveText(/Continue/);
});
