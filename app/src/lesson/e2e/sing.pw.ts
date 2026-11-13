// Sung steps: U03.L02 S8 against the real server with Chromium's fake microphone singing a steady middle C (the
// chords set home and a bar counts in, the take runs, each target says how it went: the two 1s on the note, the
// 3s and the 5 not, the attempt is stored, and Continue is open throughout: singing never gates); then Quiet mode
// (server state): S8 becomes "hear it in your head, then press Space", and the dev fixture's sight-sing becomes
// its identify equivalent, with nothing recorded.
import { expect, stepIs, test } from "./support.ts";
import { api, FIXTURE, fakeMicSingingC, reseedFresh, seed, setQuiet } from "./w3support.ts";

test.afterAll(async ({ request }) => {
  await reseedFresh(request);
});

test.use({ launchOptions: { args: fakeMicSingingC() } });
test.describe.configure({ mode: "serial" });
test.afterEach(async ({ page }) => {
  await setQuiet(page, false);
});

test("U03.L02 S8 with the fake microphone: the take, per-target marks, stored, never gating", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await seed(page, "after U02.CP");
  await setQuiet(page, false);
  await page.goto("/learn/U03.L02?step=S8");
  await stepIs(page, "S8");
  await expect(page.getByTestId("quiet-chip")).toHaveCount(0);
  await expect(page.getByTestId("sing-targets").locator("li")).toHaveCount(5);
  await expect(page.getByTestId("sing-how")).toContainText("chords set home");
  await expect(page.getByTestId("continue")).toBeEnabled();

  await page.getByRole("button", { name: "Sing", exact: true }).click();
  await expect(page.getByTestId("sing-phase")).toHaveText(/Done/, { timeout: 60_000 });
  const marks = page.getByTestId("sing-targets").locator("li");
  await expect(marks.nth(0)).toHaveAttribute("data-mark", "on");
  await expect(marks.nth(4)).toHaveAttribute("data-mark", "on");
  await expect(marks.nth(2)).not.toHaveAttribute("data-mark", "on");
  await page.getByTestId("check").click();
  const fb = page.getByTestId("step-feedback");
  await expect(fb).toHaveAttribute("data-status", /fail|pass/);
  // The take read back in words (the walk of U03.L02 no longer takes one: this is U03.L02 S8's take): clean, and a
  // take that missed names the note that went wrong (walk.ts singStep's read-back).
  const said = ((await fb.textContent()) ?? "").trim();
  expect(said.length, "the take is read back").toBeGreaterThan(8);
  expect(said, "no raw IDs").not.toMatch(/\btb\.|\bfam\.|\bcd\.|\bterm\.|[{}]|undefined|NaN|\[object/);
  if ((await fb.getAttribute("data-status")) === "fail")
    expect(said, "names the note").toMatch(/Note \d|note \d|Hold each note|noise|voice/);
  const s8 = await api<{ attempts: number }>(page, "GET", "/lessons/U03.L02/steps/S8");
  expect(s8.body?.attempts).toBe(1);
  await expect(page.getByTestId("continue")).toBeEnabled();
});

test("Quiet mode: U03.L02 S8 is heard inside, Space says so, nothing is recorded", async ({ page }) => {
  await seed(page, "after U02.CP");
  await setQuiet(page, true);
  await page.goto("/learn/U03.L02?step=S8");
  await stepIs(page, "S8");
  await expect(page.getByTestId("quiet-chip")).toBeVisible();
  await expect(page.getByTestId("sing-quiet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sing", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("continue")).toHaveText(/Skip/);
  await page.getByTestId("step-title").focus();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("heard-it-done")).toBeVisible();
  await expect(page.getByTestId("continue")).toHaveText(/Continue/);
  const s8 = await api<{ attempts: number }>(page, "GET", "/lessons/U03.L02/steps/S8");
  expect(s8.body?.attempts ?? 0).toBe(0);
  await setQuiet(page, false);
});

test("Quiet mode: a sight-sing with an identify fallback asks for the degrees instead", async ({ page }) => {
  await setQuiet(page, true);
  await page.goto(`${FIXTURE}&step=S5`);
  await stepIs(page, "S5");
  const box = page.getByTestId("sing-quiet-identify");
  await expect(box).toBeVisible();
  // The staff to read is still shown; the targets are on syllables with their numbers.
  await expect(page.getByTestId("sing-targets")).toContainText("do");
  for (const d of ["1", "3", "2", "2", "1"]) await box.locator(`[data-degree="${d}"]`).click();
  await page.getByTestId("quiet-check").click();
  await expect(page.getByTestId("quiet-verdict")).toContainText("It goes do re mi re do");
  await expect(page.getByTestId("continue")).toBeEnabled();
  await setQuiet(page, false);
});
