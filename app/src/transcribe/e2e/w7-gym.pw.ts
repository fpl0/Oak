// Wave 7 in Transcribe, from the "core complete" seed (CF-T released): the gym after the core, its generated jazz
// chart and rhythm item, and a standard's analysis stage (JC4.S1's pieces, through the gym's analysis page). What
// the checks say is proven by bun tests (jazz-chart, analysis, rhythm-lab, gym-items: every text, every wrong
// answer); here the page proves that the source plays and moves, that each check marks its bars on the page and
// says its sentence there, and that the keyboard reaches every control. One page load per test.
import { expect, type Page, test } from "@playwright/test";
import blackbird from "../../../../content/repertoire/bye-bye-blackbird/song.ts";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { shoot } from "../../../../e2e/support/ui.ts";
import { chartSlots, revealedAnalysis } from "../analysis.ts";
import { analysisSourceOf } from "../analysis-source.ts";
import { jazzChart } from "../gym-items.ts";
import { seed } from "./support.ts";

const SHOTS = new URL("./screenshots", import.meta.url).pathname;
/** The screenshot matrix runs on request (OAK_TRANSCRIBE_SHOTS=1): the runner's budget pays for assertions only. */
const SHOOT = process.env.OAK_TRANSCRIBE_SHOTS === "1";

test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
});

async function shots(page: Page, name: string) {
  if (!SHOOT) return;
  for (const s of SCREENSHOT_MATRIX) {
    await page.setViewportSize({ width: s.width, height: s.height });
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), s.theme);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await shoot(page, SHOTS, name, s.theme);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "paper"));
}

const position = async (page: Page) => {
  const t = ((await page.getByTestId("position").textContent()) ?? "").split(" / ")[0] ?? "0:0";
  const [m, s] = t.split(":");
  return Number(m) * 60 + Number(s);
};

test("a jazz chart from the gym: it plays; a wrong extension is named on its bar; the right chart passes", async ({
  page,
}) => {
  await seed(page, "core complete");
  await page.goto("/transcribe");
  // The gym goes on after the core: its card offers what it serves next.
  await expect(page.getByTestId("gym-after-core")).toBeVisible();
  await expect(page.getByTestId("gym-choice").first()).toBeVisible();
  await page.goto("/transcribe?item=jazz:blues:F");
  await expect(page.getByRole("heading", { level: 1, name: "Jazz blues in F" })).toBeVisible();
  // The source plays and moves, with the swung grid named.
  await expect(page.getByTestId("swing-label")).toHaveText("Swing 8ths");
  const play = page.getByTestId("transport-play");
  await expect(play).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId("pattern-source").focus();
  await page.keyboard.press("Space");
  await expect.poll(() => position(page), { timeout: 10_000 }).toBeGreaterThan(0.2);
  await page.keyboard.press("Space");

  // The chart by keyboard: Tab through the cells, typed in glyphs and code alike. Bar 8 is D7 in the jazz blues;
  // the learner writes an altered colour that is not there.
  const want = jazzChart("blues", "F");
  const cells = page.getByTestId("chart-cell");
  await cells.first().focus();
  for (let i = 0; i < want.length; i++) {
    const text = i === 7 ? "D7#9" : (want[i] as string[]).join(" ").replace("Bo7", "B°7");
    await page.keyboard.insertText(text);
    if (i < want.length - 1) await page.keyboard.press("Tab");
  }
  await expect(page.getByTestId("chart-bar").nth(5)).toContainText("B°7");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("chart-summary")).toHaveText(
    "11 of 12 bars right. That passes; the marked bar is worth another listen.",
  );
  await expect(page.getByTestId("chart-bar").nth(7)).toHaveAttribute("data-mark", "issue");
  await expect(page.getByTestId("chart-notes")).toHaveText(
    "Bar 8: the chord underneath is right; the ♯9 you wrote isn't the colour on top.",
  );
  // The timeline marks the same bar.
  await expect(page.getByTestId("bar-timeline").locator("[data-mark='issue']")).toHaveCount(1);
  await shots(page, "w7-jazz-chart-wrong");

  await cells.nth(7).fill("D7");
  await page.getByTestId("chart-check").click();
  await expect(page.getByTestId("chart-summary")).toHaveText("12 of 12 bars right. That's the chart.");
  await expect(page.getByTestId("gym-done")).toContainText("won't serve this one again for two weeks");
});

test("a rhythm item: the clave is named and written; a wrong answer counts without placing; right shows the clave grid", async ({
  page,
}) => {
  await seed(page, "core complete");
  await page.goto("/transcribe?item=rhythm:clave-son");
  await expect(page.getByRole("heading", { level: 1, name: "Son clave" })).toBeVisible();
  await expect(page.getByTestId("transport-play")).toBeEnabled({ timeout: 30_000 });
  // K lays the two-bar clave grid over the bars (son 3-2 first): a listening aid, not the answer.
  await page.getByTestId("pattern-source").focus();
  await page.keyboard.press("k");
  await expect(page.getByTestId("clave-label")).toHaveText("Son clave, 3-2");
  await page.keyboard.press("Space");
  await expect.poll(() => position(page), { timeout: 10_000 }).toBeGreaterThan(0.2);
  await page.keyboard.press("Space");

  // Wrong: the right figure facing the wrong way (3-2 written for a 2-3 clave).
  const lab = page.getByTestId("rhythm-lab");
  await lab.getByText("Son clave, 3-2", { exact: true }).click();
  await expect(page.getByRole("radio", { name: "Son clave, 3-2" })).toBeChecked();
  const steps = page.getByTestId("step");
  for (const s of [0, 3, 6, 10, 12]) await steps.nth(s).click();
  await page.getByTestId("rhythm-check").click();
  await expect(page.getByTestId("rhythm-summary")).toHaveText("0 of 2 right.");
  await expect(page.getByTestId("rhythm-task-result").nth(1)).toHaveText(
    "Bar 1: 3 hits where nothing sounds, 2 hits missing. Bar 2: 2 hits where nothing sounds, 3 hits missing.",
  );
  await expect(page.getByTestId("step-bar").first()).toHaveAttribute("data-mark", "issue");
  await shots(page, "w7-rhythm-wrong");

  // Right, by keyboard on the grid: arrows walk the steps, Space sets a hit.
  // The choice by keyboard: the radio group's arrows move from 3-2 to 2-3.
  await page.getByRole("radio", { name: "Son clave, 3-2" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Son clave, 2-3" })).toBeChecked();
  for (const s of [0, 3, 6, 10, 12]) await steps.nth(s).click();
  await steps.first().focus();
  for (const s of [2, 4, 8, 11, 14]) {
    await steps.nth(s).focus();
    await page.keyboard.press("Space");
  }
  await expect(steps.nth(14)).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("rhythm-check").click();
  await expect(page.getByTestId("rhythm-summary")).toHaveText("2 of 2 right. You heard it.");
  await expect(page.getByTestId("clave-label")).toHaveText("Son clave, 2-3");
  await expect(page.getByTestId("clave-strokes").first().locator("span.rounded-full")).toHaveCount(2);
});

test("a standard's analysis: wrong numerals and a missing bracket marked per bar; the right analysis and form pass", async ({
  page,
}) => {
  await seed(page, "core complete");
  await page.goto("/transcribe?analyse=song.bye-bye-blackbird");
  await expect(
    page.getByRole("heading", { level: 1, name: "Bye Bye Blackbird: the analysis" }),
  ).toBeVisible();
  await expect(page.getByTestId("transport-play")).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId("pattern-source").focus();
  await page.keyboard.press("Space");
  await expect.poll(() => position(page), { timeout: 10_000 }).toBeGreaterThan(0.2);
  await page.keyboard.press("Space");

  const source = analysisSourceOf(blackbird);
  const right = revealedAnalysis(source);
  const slots = chartSlots(source);
  const bar3 = slots.findIndex((s) => s.bar === 3);
  const inputs = page.getByTestId("analysis-numeral");
  await expect(inputs).toHaveCount(slots.length);
  for (let i = 0; i < slots.length; i++)
    await inputs.nth(i).fill(i === bar3 ? "IV" : (right.numerals[i] as string));
  const brackets = page.getByTestId("analysis-bracket");
  for (const b of right.brackets) if (b !== bar3) await brackets.nth(b).click();
  // The form, A A B A, by keyboard on the strip: the arrows walk the bar lines, Enter cuts, a letter names.
  await page.getByTestId("form-strip").focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("a");
  for (const l of ["a", "b", "a"]) {
    for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await page.keyboard.press(l);
  }
  await expect(page.getByTestId("form-map")).toHaveAttribute("data-form", "AABA");

  await page.getByTestId("analysis-check").click();
  await expect(page.getByTestId("analysis-summary")).toHaveText(
    "31 of 32 bars right. That passes; the marked bar is worth another look.",
  );
  await expect(page.getByTestId("analysis-bar").nth(2)).toHaveAttribute("data-mark", "issue");
  await expect(page.getByTestId("analysis-notes")).toHaveText(
    [
      "Bar 3, first chord: that numeral's root isn't this chord's root, counted from F major.",
      "Bar 3: look again for a ii–V moving through this bar.",
    ].join(""),
  );
  await expect(page.getByTestId("analysis-form-text")).toHaveText("The form is right.");
  await shots(page, "w7-analysis-wrong");

  // Right: the numeral by keyboard (Enter checks), the bracket by Space.
  await inputs.nth(bar3).fill(right.numerals[bar3] as string);
  await brackets.nth(bar3).focus();
  await page.keyboard.press("Space");
  await inputs.nth(bar3).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("analysis-summary")).toHaveText(
    "32 of 32 bars right. The analysis is right.",
  );
  await expect(page.getByTestId("analysis-bar").nth(2)).toHaveAttribute("data-mark", "ok");
});
