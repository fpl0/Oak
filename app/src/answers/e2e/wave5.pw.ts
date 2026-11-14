// The Wave 5 answer widgets, keyboard only (ux §7.9, §7.10): the form strip (labels and letters, then cards in
// order), the chord chart (a blues in numerals with a given bar 1, symbols in A minor with a quality change), the
// scale builder (keys from home, the degree pad with ♭ prefixes, do-based syllables), and minor everywhere: numerals
// in A minor with the raised 7th's V, the bass filter in minor (c8), the minor pad and staff, sung degrees in minor
// in Quiet mode, straight or swung. Then the lenses off, the checkpoint verb, reduced motion, and screenshots of
// every new widget in both themes and sizes.
import { expect, type Locator, type Page, test } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { shoot, useUiPrefs } from "../../../../e2e/support/ui.ts";
import { collectErrors, openGallery, SHOTS } from "./fixtures.ts";

const live = (page: Page, id: string): Locator => page.locator(`[data-live="${id}"]`);
const status = (page: Page, id: string): Locator => live(page, id).getByTestId("answer-status").first();
const press = async (page: Page, keys: readonly string[]) => {
  for (const k of keys) await page.keyboard.press(k);
};

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = collectErrors(page);
  await useUiPrefs(page, { theme: "paper" });
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

test("form: name six sections by digit, read the letters, fix one, check", async ({ page }) => {
  await openGallery(page, "?only=form-label&state=idle");
  const w = live(page, "form-label");
  const block = (i: number) => w.locator(`[data-form-block="${i}"]`);
  await expect(block(4)).toHaveAccessibleName(/^Bars 33–36: empty\. Click to hear it$/);
  await block(0).focus();
  // verse chorus verse verse bridge chorus: section 4 is wrong.
  await press(page, ["1", "2", "1", "1", "3", "2"]);
  await expect(w.getByTestId("form-reads")).toHaveText("Reads as A B A A C B");
  await page.keyboard.press("Enter");
  await expect(status(page, "form-label")).toHaveText("Section 4 has the chorus's chords: I V vi IV.");
  await expect(block(3)).toHaveAccessibleName(/^Bars 25–32: Verse, not this one/);
  await expect(block(2)).toHaveAccessibleName(/^Bars 17–24: Verse, right/);
  // ← back to section 4 (focus follows), Backspace clears it, 2 names it a chorus.
  await block(5).focus();
  await press(page, ["ArrowLeft", "ArrowLeft"]);
  await expect(block(3)).toBeFocused();
  await page.keyboard.press("Backspace");
  await expect(block(3)).toHaveAccessibleName(/^Bars 25–32: empty/);
  await page.keyboard.press("2");
  await expect(w.getByTestId("form-reads")).toHaveText("Reads as A B A B C B");
  await page.keyboard.press("Enter");
  await expect(status(page, "form-label")).toHaveText("That's it.");
  // A click selects the block (and plays it through the host); the hear button names the section.
  await expect(w.getByRole("button", { name: "Hear section 4" })).toBeVisible();
});

test("form: letters by first appearance on the letter keys; cards in the order heard", async ({ page }) => {
  await openGallery(page, "?only=form-letters&state=idle");
  const w = live(page, "form-letters");
  await w.locator('[data-form-block="0"]').focus();
  await press(page, ["a", "b", "b", "a"]);
  await page.keyboard.press("Enter");
  await expect(status(page, "form-letters")).toHaveText("Not quite: 1 part differs.");
  await w.locator('[data-form-block="1"]').focus();
  await page.keyboard.press("a");
  await expect(w.getByTestId("form-reads")).toHaveText("Reads as A A B A");
  await page.keyboard.press("Enter");
  await expect(status(page, "form-letters")).toHaveText("That's it.");

  await openGallery(page, "?only=form-order&state=idle");
  const o = live(page, "form-order");
  const options = o.getByRole("group", { name: "Sections still to place" });
  // Options keep their authored keys: 1 verse, 2 outro, 3 intro, 4 chorus. Verse first is wrong.
  await options.getByRole("button", { name: "1. Verse" }).focus();
  await press(page, ["1", "3"]);
  await expect(options.getByRole("button")).toHaveCount(2);
  // Select the intro card (2nd) and move it first with Alt+←.
  await o.locator('[data-form-card="0"]').focus();
  await page.keyboard.press("ArrowRight");
  await expect(o.locator('[data-form-card="1"]')).toBeFocused();
  await page.keyboard.press("Alt+ArrowLeft");
  await expect(o.locator('[data-form-card="0"]')).toHaveAccessibleName("1. Intro");
  await press(page, ["4", "2"]);
  await expect(o.getByText("Every section is placed.")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(status(page, "form-order")).toHaveText("That's it.");
});

test("chord chart: a 12-bar blues in numerals, bar 1 given; arrows walk the rows", async ({ page }) => {
  await openGallery(page, "?only=bar-grid-blues&state=idle");
  const w = live(page, "bar-grid-blues");
  const bar = (i: number) => w.locator(`[data-bar="${i}"]`);
  await expect(bar(0)).toHaveAccessibleName("Bar 1: given, I 7, F7");
  await bar(1).focus();
  // IV7 I7 I7 IV7 IV7 I7 I7 V7 V7 I7 V7: bar 10 is wrong.
  await press(page, ["4", "1", "1", "4", "4", "1", "1", "5", "5", "1", "5"]);
  await expect(w.getByRole("group", { name: "Chord chart, 12 bars, 12 filled" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(status(page, "bar-grid-blues")).toHaveText("Bar 10 goes down to IV7 before home.");
  await expect(bar(9)).toHaveAccessibleName("Bar 10: V 7, C7, not this one");
  // From bar 10, ↑ goes to bar 6 and ↓ back; 4 replaces bar 10.
  await bar(9).focus();
  await page.keyboard.press("ArrowUp");
  await expect(bar(5)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(bar(9)).toBeFocused();
  await page.keyboard.press("4");
  await page.keyboard.press("Enter");
  await expect(status(page, "bar-grid-blues")).toHaveText("That's it.");
  // A passed chart cannot be changed; the given bar never could.
  await bar(0).focus();
  await page.keyboard.press("Backspace");
  await expect(bar(0)).toHaveAccessibleName("Bar 1: given, I 7, F7");
  // Listening stays possible on a passed chart (the group is aria-disabled; the button itself is not).
  await expect(w.getByRole("button", { name: "Play the chart" })).toHaveJSProperty("disabled", false);
});

test("chord chart: symbols in A minor; Q turns bar 7's Em into E; the chord-symbol lens adds names", async ({
  page,
}) => {
  await openGallery(page, "?only=bar-grid-symbol&state=idle");
  const w = live(page, "bar-grid-symbol");
  await w.locator('[data-bar="0"]').focus();
  // The palette is A minor's chords: 1 Am … 5 Em, 7 G.
  await expect(w.locator('[data-chord="Em"]')).toBeVisible();
  await expect(w.locator('[data-chord="G"]')).toBeVisible();
  await press(page, ["1", "6", "3", "7", "1", "4", "5"]);
  await expect(w.locator('[data-bar="6"]')).toHaveAccessibleName("Bar 7: E minor");
  await w.locator('[data-bar="6"]').focus();
  await page.keyboard.press("q");
  await expect(w.locator('[data-bar="6"]')).toHaveAccessibleName("Bar 7: E");
  await w.locator('[data-bar="7"]').focus();
  await page.keyboard.press("1");
  await page.keyboard.press("Enter");
  await expect(status(page, "bar-grid-symbol")).toHaveText("That's it.");

  await openGallery(page, "?only=bar-grid-blues&state=correct");
  await expect(page.locator('[data-state="correct"] [data-bar="1"]')).toHaveAccessibleName(
    /^Bar 2: IV 7, B♭7/,
  );
  await openGallery(page, "?only=bar-grid-blues&state=correct&lenses=off");
  await expect(page.locator('[data-state="correct"] [data-bar="1"]')).toHaveAccessibleName(
    "Bar 2: IV 7, right",
  );
  // The submit verb comes from the host: a checkpoint saves.
  await openGallery(page, "?only=bar-grid-blues&state=idle&verb=save");
  await expect(live(page, "bar-grid-blues").getByText("save", { exact: true })).toBeVisible();
});

test("scale builder: keys from home, the built line in the scale's own letters", async ({ page }) => {
  await openGallery(page, "?only=scale-keys&state=idle");
  const w = live(page, "scale-keys");
  await w.locator('[data-midi="67"]').focus();
  await expect(w.locator('[data-midi="67"]')).toHaveAccessibleName(/^G 4, home/);
  // A is home: A S D G H = 0 2 4 7 9 semitones up, then F (5, the 4th) by mistake.
  await press(page, ["a", "s", "d", "f", "g", "h"]);
  await expect(w.getByTestId("scale-built")).toHaveText(/Your scale:\s*G\s*A\s*B\s*C\s*D\s*E/);
  await page.keyboard.press("Enter");
  await expect(status(page, "scale-keys")).toHaveText(
    "Five notes: leave out the two that sit a half step from a neighbour.",
  );
  await expect(w.locator('[data-midi="72"]')).toHaveAccessibleName(/not this one/);
  await page.keyboard.press("f");
  await page.keyboard.press("Enter");
  await expect(status(page, "scale-keys")).toHaveText("That's it.");
});

test("scale builder: degrees with ♭ prefixes; the minor's syllables are do-based", async ({ page }) => {
  await openGallery(page, "?only=scale-blues&state=idle");
  const w = live(page, "scale-blues");
  await w.locator('[data-degree="1"]').focus();
  await press(page, ["1", "-", "3", "4", "-", "5", "5", "-", "7"]);
  await expect(w.getByTestId("scale-built")).toHaveText(/A\s*1\s*C\s*♭3\s*D\s*4\s*E♭\s*♭5\s*E\s*5\s*G\s*♭7/);
  await page.keyboard.press("Backspace");
  await expect(w.locator('[data-degree="b7"]')).toHaveAttribute("aria-pressed", "false");
  await press(page, ["-", "7", "Enter"]);
  await expect(status(page, "scale-blues")).toHaveText("That's it.");

  await openGallery(page, "?only=scale-minor&state=idle");
  const m = live(page, "scale-minor");
  await expect(m.locator('[data-degree="b3"]')).toHaveAccessibleName(/^flat 3, me, C/);
  await expect(m.locator('[data-degree="b6"]')).toHaveAccessibleName(/^flat 6, le, F/);
  await expect(m.locator('[data-degree="7"]')).toHaveAccessibleName(/^7, ti, G sharp/);
  await m.locator('[data-degree="1"]').focus();
  // 6 and 7 are on the pad both ways: plain digits take the natural ones, - the flat.
  await press(page, ["1", "2", "-", "3", "4", "5", "-", "6", "7", "Enter"]);
  await expect(status(page, "scale-minor")).toHaveText("That's it.");
  // Without the solfège lens the pad prints note names, not syllables.
  await openGallery(page, "?only=scale-blues&state=idle&lenses=off");
  await expect(live(page, "scale-blues").locator('[data-degree="b3"]')).toHaveAccessibleName(/^flat 3, C/);
});

test("numerals in A minor: digits give the key's chords, + the raised 7th's V; c8 lights the bass", async ({
  page,
}) => {
  await openGallery(page, "?only=rn-minor&state=idle");
  const w = live(page, "rn-minor");
  for (const rn of ["i", "VI", "III", "iv", "iio", "v", "V", "VII", "viio"])
    await expect(w.locator(`[data-rn="${rn}"]`)).toBeVisible();
  await expect(w.locator('[data-rn="V"]')).toHaveAccessibleName("V, E, key +5");
  await w.locator('[data-rn-slot="0"]').focus();
  await press(page, ["1", "4", "5", "1", "Enter"]);
  await expect(status(page, "rn-minor")).toHaveText(
    "Bar 3 is E major (G♯ in it): the raised 7th makes V, not v.",
  );
  await w.locator('[data-rn-slot="2"]').focus();
  await press(page, ["+", "5", "Enter"]);
  await expect(status(page, "rn-minor")).toHaveText("That's it.");

  await openGallery(page, "?only=rn-minor-bass&state=idle");
  const b = live(page, "rn-minor-bass");
  const filter = b.getByTestId("rn-bass-filter");
  await expect(filter).toHaveText("Lit: the chords with bass degree 1 in them, for bar 1.");
  await b.locator('[data-rn-slot="0"]').focus();
  await press(page, ["1", "7"]);
  // Bar 3 sits on ♭6 (F): VI, iv and ii° hold it; V and v do not.
  await expect(filter).toHaveText("Lit: the chords with bass degree b6 in them, for bar 3.");
  for (const rn of ["VI", "iv", "iio"])
    await expect(b.locator(`[data-rn="${rn}"]`)).not.toHaveAttribute("data-off-bass");
  for (const rn of ["V", "v", "i"])
    await expect(b.locator(`[data-rn="${rn}"]`)).toHaveAttribute("data-off-bass", "true");
  await page.keyboard.press("6");
  // Bar 4 on 5 (E): i, III, v and V.
  await expect(b.locator('[data-rn="V"]')).not.toHaveAttribute("data-off-bass");
  await press(page, ["+", "5", "Enter"]);
  await expect(status(page, "rn-minor-bass")).toHaveText("That's it.");
});

test("minor pad and staff, sung minor in Quiet mode, straight or swung", async ({ page }) => {
  await openGallery(page, "?only=degree-minor-lens&state=idle");
  const d = live(page, "degree-minor-lens");
  await expect(d.locator('[data-degree="b6"]')).toHaveAccessibleName("flat 6, le");
  await d.locator('[data-degree="1"]').focus();
  await press(page, ["6", "Enter"]);
  await expect(status(page, "degree-minor-lens")).toHaveText("That's it.");

  await openGallery(page, "?only=staff-minor&state=idle");
  const s = live(page, "staff-minor");
  await expect(s.locator("[data-status='ready']")).toBeVisible();
  await s.getByTestId("staff-surface").focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowDown");
  await press(page, ["e", "f", "g", "a"]);
  await page.keyboard.press("Enter");
  await expect(status(page, "staff-minor")).toHaveText("The 7th of harmonic minor is raised: G♯, not G.");
  // Back to the G and sharpen it (Shift+↑ moves the note under the cursor a semitone).
  await page.keyboard.press("Home");
  await press(page, ["ArrowRight", "ArrowRight", "Shift+ArrowUp", "Enter"]);
  await expect(status(page, "staff-minor")).toHaveText("That's it.");

  await openGallery(page, "?only=sing-minor&state=idle");
  const q = live(page, "sing-minor");
  await expect(q.getByText("♭3 · me").first()).toBeVisible();
  await expect(q.getByText("5 · sol").first()).toBeVisible();

  await openGallery(page, "?only=choice-feel&state=idle");
  const c = live(page, "choice-feel");
  await c.getByRole("radio").first().focus();
  await press(page, ["2", "Enter"]);
  await expect(status(page, "choice-feel")).toHaveText("That's it.");
});

test("reduced motion: nothing on the new widgets moves for longer than 120 ms", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const id of ["bar-grid-blues", "form-label", "scale-blues"]) {
    await openGallery(page, `?only=${id}&state=correct`);
    await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
    const longest = await page.evaluate(() =>
      Math.max(
        0,
        ...[...document.querySelectorAll("[data-answer] *")].flatMap((el) => {
          const s = getComputedStyle(el);
          const ms = (v: string) => Math.max(...v.split(",").map((x) => Number.parseFloat(x) * 1000));
          return [ms(s.transitionDuration), ms(s.animationDuration)];
        }),
      ),
    );
    expect(`${id}: ${longest}`).toBe(`${id}: ${Math.min(longest, 120)}`);
  }
});

const SHOT_IDS = [
  "form-label",
  "form-order",
  "bar-grid-blues",
  "bar-grid-symbol",
  "scale-keys",
  "scale-minor",
  "rn-minor-bass",
  "staff-minor",
  "sing-minor",
] as const;

// Each example is loaded once; the size and the theme then change in place (wave5.md §7.1).
test("Wave 5 widgets: both themes, both sizes, no overflow", async ({ page }) => {
  for (const id of SHOT_IDS) {
    await openGallery(page, `?only=${id}&state=wrong,revealed`);
    for (const m of SCREENSHOT_MATRIX) {
      await page.setViewportSize({ width: m.width, height: m.height });
      await page.getByRole("radio", { name: m.theme === "paper" ? "Paper" : "Bark" }).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", m.theme);
      const overflow = await page.evaluate(() => {
        const main = document.getElementById("main");
        return {
          page: document.documentElement.scrollWidth - window.innerWidth,
          main: main ? main.scrollWidth - main.clientWidth : 0,
        };
      });
      expect(`${id} ${m.theme} ${m.width}: ${overflow.page} ${overflow.main}`).toBe(
        `${id} ${m.theme} ${m.width}: 0 0`,
      );
      await shoot(page, SHOTS, `w5-${id}`, m.theme);
    }
  }
});
