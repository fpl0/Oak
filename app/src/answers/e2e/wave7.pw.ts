// The Wave 7 answer widgets in the gallery (wave7.md §11), by keyboard (ux §7.9, §7.10): a jazz chord symbol read
// back in lead-sheet form, the voicing builder on the keys (named live with the VOICINGS lens, after the check
// without it) and on the grand staff, the tension pick, the numerals' jazz row with its ii–V brackets, a 7/8
// grouping, Euclidean numbers with a rotation, the clave pick, the A/B sound pick, the register map and the
// lay-back slider; then the two-lane pad's drawing. Grading lives in bun tests (jazz, rhythm7, wave7, fixtures-
// wave7): each test here opens one example once and checks it by keyboard. Last, every Wave 7 example in both
// themes at both sizes, loaded once per group, with no horizontal overflow (screenshots with OAK_ANSWERS_SHOTS=1).
import { expect, type Locator, type Page, test } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { shoot, useUiPrefs } from "../../../../e2e/support/ui.ts";
import { FIXTURE_IDS } from "../dev/fixture-ids.ts";
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

test("jazz chord: typed forgivingly, read back as a lead sheet and in glyphs", async ({ page }) => {
  await openGallery(page, "?only=jazz-chord,jazz-chord-glyphs&state=revealed");
  const w = live(page, "jazz-chord");
  const input = w.getByRole("textbox");
  await input.fill("g7");
  await page.keyboard.press("Enter");
  await expect(status(page, "jazz-chord")).toContainText("listen for the colour on top");
  await input.fill("g7(b9)");
  await expect(w.getByTestId("chord-reads")).toHaveText("Reads as G7♭9 (G 7 flat 9)");
  await page.keyboard.press("Enter");
  await expect(status(page, "jazz-chord")).toHaveText("That's it.");
  // A learner who reads charts in glyphs: built from the picker, read back as D–9 first.
  const g = live(page, "jazz-chord-glyphs");
  await g.getByRole("group", { name: "Root" }).getByRole("button", { name: "D", exact: true }).click();
  await g.getByRole("button", { name: "minor 9" }).click();
  await expect(g.getByRole("textbox")).toHaveValue("Dm9");
  await expect(g.getByTestId("chord-reads")).toHaveText("Reads as D–9, on a lead sheet Dm9 (D minor 9)");
  await g.getByRole("textbox").press("Enter");
  await expect(status(page, "jazz-chord-glyphs")).toHaveText("That's it.");
});

test("voicing builder: the VOICINGS lens names a shell as it is built; without it, after the check", async ({
  page,
}) => {
  await openGallery(page, "?only=voicing-shell,voicing-rootless&state=idle");
  const w = live(page, "voicing-shell");
  await w.locator('[data-midi="60"]').focus();
  // The typing row at octave 3: S is D3, F is F3, A is C3 … K is C4.
  await press(page, ["s", "f", "a"]);
  await expect(w.getByTestId("voicing-line")).toHaveText(
    "C3 D3 F3: 7th, root, 3rd. Not one of the named voicings of Dm7 yet.",
  );
  await press(page, ["a", "k"]);
  await expect(w.getByTestId("voicing-line")).toHaveText("D3 F3 C4: root, 3rd, 7th. A shell voicing of Dm7.");
  await page.keyboard.press("Enter");
  await expect(status(page, "voicing-shell")).toHaveText("That's it.");
  // No lens: the line waits for the check.
  const r = live(page, "voicing-rootless");
  for (const m of [59, 64, 65, 69]) await r.locator(`[data-midi="${m}"]`).click();
  await expect(r.getByTestId("voicing-line")).toHaveText("Oak names the voicing once you check.");
  await r.locator('[data-midi="69"]').focus();
  await page.keyboard.press("Enter");
  await expect(status(page, "voicing-rootless")).toHaveText("That's it.");
  await expect(r.getByTestId("voicing-line")).toHaveAttribute("data-shape", "rootless-a");
  await expect(r.getByTestId("voicing-line")).toContainText("A rootless A voicing of G7.");
});

test("voicing builder on the grand staff: drop-2, named per chord", async ({ page }) => {
  await openGallery(page, "?only=voicing-drop2&state=wrong");
  const w = live(page, "voicing-drop2");
  await expect(w.locator("[data-status='ready']")).toBeVisible();
  await w.getByText("Type the notes instead").click();
  const typed = w.locator("input[id$='-typed']");
  await typed.fill("[C4,E4,G4,B4]:1");
  await expect(w.getByTestId("voicing-line")).toHaveText(
    "Chord 1: C4 E4 G4 B4: root, 3rd, 5th, 7th. A close voicing of Cmaj7.",
  );
  await typed.fill("[G3,C4,E4,B4]:1");
  await expect(w.getByTestId("voicing-line")).toHaveAttribute("data-shape", "drop-2");
  await w.getByTestId("staff-surface").focus();
  await page.keyboard.press("Enter");
  await expect(status(page, "voicing-drop2")).toHaveText("That's it.");
  await expect(
    page.locator('[data-fixture="voicing-drop2"] [data-state="wrong"]').getByTestId("voicing-line"),
  ).toHaveAttribute("data-shape", "close");
});

test("tension pick: the chord and the note above the groups; the fact only once it is right", async ({
  page,
}) => {
  await openGallery(page, "?only=tension-pick&state=wrong,revealed");
  const w = live(page, "tension-pick");
  await expect(w.getByTestId("tension-about")).toHaveText("Over Fm7 the melody holds G");
  await w.locator('[data-option="chord-tone"]').focus();
  // Digits follow the order on screen: 1 a chord tone, 2 the 9th, 3 the 11th …
  await page.keyboard.press("3");
  await expect(w.locator('[data-option="11"]')).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(status(page, "tension-pick")).toContainText("Not quite");
  // A wrong pick never names the answer.
  await expect(w.getByTestId("tension-fact")).toHaveText("");
  await page.keyboard.press("ArrowLeft");
  await expect(w.locator('[data-option="9"]')).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Enter");
  await expect(status(page, "tension-pick")).toHaveText("That's it.");
  await expect(w.getByTestId("tension-fact")).toHaveText(
    "G over Fm7 is the 9th: a common colour on this chord.",
  );
  const revealed = page.locator('[data-fixture="tension-pick"] [data-state="revealed"]');
  await expect(revealed.getByTestId("tension-fact")).toHaveText(
    "G over Fm7 is the 9th: a common colour on this chord.",
  );
});

test("numerals: the jazz row, and brackets over what was written", async ({ page }) => {
  await openGallery(page, "?only=rn-jazz&state=idle");
  const w = live(page, "rn-jazz");
  await w.locator('[data-rn-slot="0"]').focus();
  await page.keyboard.press("Shift+Digit3");
  await w.locator('[data-rn-jazz] [data-rn="VI7"]').click();
  await page.keyboard.press("Shift+Digit2");
  await w.locator('[data-rn-jazz] [data-rn="bII7"]').click();
  await expect(w.getByTestId("rn-brackets")).toHaveText(
    "Slots 1 and 2: a ii–V. Slots 3 and 4: a ii, then the tritone sub",
  );
  await expect(w.locator('[data-rn-bracket="ii–♭II"]')).toHaveCount(2);
  await page.keyboard.press("Enter");
  await expect(status(page, "rn-jazz")).toContainText("Listen to bar 4 again");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Shift+Digit5");
  await expect(w.locator('[data-rn-bracket="ii–V"]')).toHaveCount(4);
  await page.keyboard.press("Enter");
  await expect(status(page, "rn-jazz")).toHaveText("That's it.");
});

test("grouping: a bar of 7/8 cut by 2 and 3, Backspace takes a group away", async ({ page }) => {
  await openGallery(page, "?only=grouping-78&state=revealed");
  const w = live(page, "grouping-78");
  await w.locator("[data-add='2']").focus();
  await press(page, ["Digit3", "Digit2"]);
  await expect(w.getByTestId("grouping-left")).toHaveText("3 + 2, 2 eighths left");
  // A 3 does not fit: nothing changes, and the + 3 button is off.
  await page.keyboard.press("Digit3");
  await expect(w.locator("[data-add='3']")).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Digit2");
  await page.keyboard.press("Enter");
  await expect(status(page, "grouping-78")).toHaveText("The long group comes last: short, short, long.");
  await expect(w.locator("[data-group]").first()).toHaveAccessibleName(/Group 1: 3, not this one/);
  await press(page, ["Backspace", "Backspace", "Backspace", "Digit2", "Digit2", "Digit3"]);
  await expect(w.getByTestId("grouping-left")).toHaveText("2 + 2 + 3: counted 1 2 | 1 2 | 1 2 3");
  await page.keyboard.press("Enter");
  await expect(status(page, "grouping-78")).toHaveText("That's it.");
  const revealed = page.locator('[data-fixture="grouping-78"] [data-state="revealed"]');
  await expect(revealed.getByTestId("grouping-reveal")).toContainText("Answer:");
});

test("Euclid: hits, steps and a rotation by arrows, the ring and its code live", async ({ page }) => {
  await openGallery(page, "?only=euclid-rotation&state=revealed");
  const w = live(page, "euclid-rotation");
  const hits = w.getByRole("spinbutton", { name: "Hits" });
  await hits.focus();
  await press(page, ["ArrowUp", "ArrowUp", "ArrowUp", "ArrowUp", "ArrowUp"]);
  await page.keyboard.press("Tab");
  await expect(w.getByRole("spinbutton", { name: "Steps" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(w.getByTestId("euclid-reads")).toHaveText(
    "rim(5,16) 5 hits in 16 steps, on steps 1, 4, 7, 10 and 13",
  );
  await page.keyboard.press("Enter");
  await expect(status(page, "euclid-rotation")).toContainText("Not quite");
  await page.keyboard.press("Tab");
  for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowUp");
  await expect(w.locator('[data-ring="yours"]')).toHaveAttribute("data-onsets", "0 3 6 10 13");
  await expect(w.getByTestId("euclid-reads")).toContainText("rim(5,16,10)");
  await page.keyboard.press("Enter");
  await expect(status(page, "euclid-rotation")).toHaveText("That's it.");
  const revealed = page.locator('[data-fixture="euclid-rotation"] [data-state="revealed"]');
  await expect(revealed.locator('[data-ring="answer"]')).toHaveAttribute("data-onsets", "0 3 6 10 13");
});

test("clave, A/B and the register map: picks by keyboard", async ({ page }) => {
  await openGallery(page, "?only=clave-pick,compare-bright,register-map&state=idle");
  const c = live(page, "clave-pick");
  await c.locator('[data-option="son 3-2"]').focus();
  await page.keyboard.press("Digit2");
  await page.keyboard.press("Enter");
  await expect(status(page, "clave-pick")).toHaveText("That's it.");
  await expect(c.getByTestId("clave-fact")).toHaveText(
    "Son clave, 2-3: the two-side first, then the three-side.",
  );
  await expect(c.locator('[data-option="son 2-3"] [data-clave-cells]')).toHaveAttribute(
    "data-clave-cells",
    "..x.x...x..x..x.",
  );

  const ab = live(page, "compare-bright");
  await expect(ab.getByText("Which is brighter?").first()).toBeVisible();
  await ab.locator('[data-card="A"] [role=radio]').focus();
  await page.keyboard.press("b");
  await expect(ab.locator('[data-card="B"] [role=radio]')).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Enter");
  await expect(status(page, "compare-bright")).toContainText("Not quite");
  await page.keyboard.press("a");
  await page.keyboard.press("Enter");
  await expect(status(page, "compare-bright")).toHaveText("That's it.");

  const r = live(page, "register-map");
  await r.locator('[data-cell="0:0"]').focus();
  await press(page, ["Digit1", "ArrowDown", "Digit2", "ArrowDown", "Digit4", "ArrowDown", "Digit5"]);
  await expect(r.locator('[data-cell="2:3"]')).toHaveAttribute("aria-checked", "true");
  await expect(r.locator('[data-cell="2:3"]')).toHaveAccessibleName("Pad: Mids, G3–E5");
  await page.keyboard.press("Enter");
  await expect(status(page, "register-map")).toHaveText("That's it.");
});

test("lay-back slider: milliseconds with the .late() they take at the tempo", async ({ page }) => {
  await openGallery(page, "?only=slider-layback&state=idle");
  const w = live(page, "slider-layback");
  const s = w.getByRole("slider");
  await s.focus();
  for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowLeft");
  await expect(w.getByTestId("slider-meaning")).toHaveText(
    "20 ms behind: .late(0.0075) at 90 BPM, laid back",
  );
  await expect(s).toHaveAttribute(
    "aria-valuetext",
    "20 ms, 20 ms behind: .late(0.0075) at 90 BPM, laid back",
  );
  await page.keyboard.press("Enter");
  await expect(status(page, "slider-layback")).toHaveText("That's it.");
});

test("two-lane pad: a row per lane in every bar, each lane's targets marked on its own", async ({ page }) => {
  await openGallery(page, "?only=tap-lanes&state=wrong");
  const wrong = page.locator('[data-fixture="tap-lanes"] [data-state="wrong"]');
  await expect(wrong.locator("[data-lane]")).toHaveCount(4);
  await expect(wrong.getByText("F: Left hand: the 3")).toBeVisible();
  await expect(wrong.getByText("J: Right hand: the 2")).toBeVisible();
  await expect(wrong.getByTestId("answer-status")).toContainText(
    "Left hand: the 3: 6 of 6. Right hand: the 2: 3 of 4",
  );
  // The late tap is in lane 2 only: lane 1 has no target marked off.
  await expect(wrong.locator('[data-lane="0"] .border-issue')).toHaveCount(0);
  await expect(wrong.locator('[data-lane="1"] .border-issue')).toHaveCount(1);
  await expect(live(page, "tap-lanes").getByRole("application")).toHaveAccessibleName(
    "Tap pad: F for Left hand: the 3, J for Right hand: the 2, or click",
  );
});

const W7 = FIXTURE_IDS.slice(FIXTURE_IDS.findIndex(([id]) => id === "jazz-chord")).map(([id]) => id);
const GROUPS: Record<string, readonly string[]> = {
  "jazz symbols and voicings": W7.filter((id) => /^(jazz|voicing)/.test(id)),
  "tensions and numerals": W7.filter((id) => /^(tension|rn-)/.test(id)),
  "groupings and Euclid": W7.filter((id) => /^(grouping|euclid)/.test(id)),
  "clave, taps and feel": W7.filter((id) => /^(clave|tap|slider-(swing|layback))/.test(id)),
  sound: W7.filter((id) => /^(slider-cutoff|compare|register)/.test(id)),
};

test("every Wave 7 example is in one of the walks below", () => {
  expect(W7.filter((id) => !Object.values(GROUPS).flat().includes(id))).toEqual([]);
});

for (const [group, ids] of Object.entries(GROUPS)) {
  test(`Wave 7 widgets, ${group}: both themes, both sizes, no overflow`, async ({ page }) => {
    await openGallery(page, `?only=${ids.join(",")}&state=wrong,revealed`);
    if (ids.includes("voicing-drop2"))
      await expect(page.locator('[data-live="voicing-drop2"] [data-status="ready"]')).toBeVisible();
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
      expect(`${group} ${m.theme} ${m.width}: ${overflow.page} ${overflow.main}`).toBe(
        `${group} ${m.theme} ${m.width}: 0 0`,
      );
      if (process.env.OAK_ANSWERS_SHOTS === "1")
        await shoot(page, SHOTS, `w7-${group.replace(/\W+/g, "-")}`, m.theme);
    }
  });
}
