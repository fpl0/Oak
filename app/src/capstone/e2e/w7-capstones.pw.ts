// Wave 7 track capstones in the workspace (wave7.md §4.4, §7.3; the capstone project): each from its seed, the
// checklist rows and cards the brief needs, read from the grader's views of the piece in the editor. What the
// readers say is pinned with the real grader in wave7.test.ts and tracks.test.ts; here each card is seen to draw,
// to follow an edit and to answer the keyboard, once. The pieces are e2e/w7-pieces.ts. One capstone of each track
// goes on to its release (JC1 and RC2 over both sessions, AC1 in its last with both versions) and JC4 through its
// three sessions (S1 and S2 from "JC4 open", S3 and the release from "JC4.S2 done"), each released to Side B with a
// seeded take: the one real-time take per capstone whose brief needs it belongs to the journey (d9).
import { expect, test } from "@playwright/test";
import { JC3_PIECES } from "../../../../content/advanced/capstones/JC3/pieces.ts";
import { rule, ruleId, setCode, shots, watchErrors } from "./w5-support.ts";
import {
  AC2_BALLAD,
  AC2_MIX_TWO_BARS,
  JC1_BALLAD,
  JC1_ONE_KEY,
  JC3_AABA,
  RC2_CLAVE,
  RC2_CROSSED,
} from "./w7-pieces.ts";
import {
  checkAndRelease,
  finishSession,
  foundLines,
  georgiaReharm,
  seedPoint,
  startFirstSession,
  writePiece,
} from "./w7-support.ts";

test("JC1: the keys the ii–Vs reach and the guide tones, each with its bars; one key only stays open", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await seedPoint(page, "JC1 open");
  const errors = watchErrors(page);
  const chain = ruleId("JC1", "custom", (r) => r.fn === "ii-v-chain");
  const guides = ruleId("JC1", "guide-tones");
  test.skip(!chain || !guides, "JC1's brief reads neither the ii–V chain nor guide tones");
  await startFirstSession(page, "JC1");
  await writePiece(page, "JC1", JC1_BALLAD, chain as string);
  await expect(foundLines(page, chain as string).first()).toHaveText(
    "Keys reached: C major, E♭ major, A minor (3 of 3).",
    { timeout: 45_000 },
  );
  await expect(foundLines(page, guides as string).first()).toHaveText(
    "A 3rd or a 7th on 12 of 12 chord changes.",
  );
  // A bar chip is a button: the A-minor ii–V's bars light on the roll and the staff.
  const minor = foundLines(page, chain as string).filter({ hasText: "into A minor" });
  await expect(minor.getByTestId("found-anchor")).toHaveText("Bars 9–10");
  await minor.getByTestId("found-anchor").focus();
  await page.keyboard.press("Enter");
  await shots(page, "w7-jc1");
  // The right function, the wrong result: every ii–V into C. The row is open; its own line says one key.
  await setCode(page, "JC1", JC1_ONE_KEY);
  await expect(page.locator(`[data-rule="${chain}"]`)).toHaveAttribute("data-state", "open", {
    timeout: 45_000,
  });
  await expect(page.locator(`[data-rule="${chain}"]`)).toContainText("1 key");
  // Back to the ballad: session 1 ends, session 2 meets the brief and the track joins Side B.
  await setCode(page, "JC1", JC1_BALLAD);
  await expect(rule(page, chain as string)).toHaveAttribute("data-state", "met", { timeout: 45_000 });
  await finishSession(page, "JC1", 1, 2);
  // Session 2 adds the head on its own line: offered while the draft has none, added by the learner's click.
  await setCode(page, "JC1", JC1_BALLAD.replace(/\nmelody:[^\n]*/, ""));
  await page.getByTestId("session-lines-add").click();
  await expect(page.locator(".cm-content").first()).toContainText('mel: note("~").s("vibes")');
  await expect(page.getByTestId("session-lines")).toHaveCount(0);
  await setCode(page, "JC1", JC1_BALLAD);
  await checkAndRelease(page, "Three Keys");
  await expect(page.getByTestId("release-ceremony")).toContainText("Side B");
  expect(errors).toEqual([]);
});

test("JC3: the AABA plan, the bridge's chords, read from the sections; a tune of your own passes", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await seedPoint(page, "JC3 open");
  const form = ruleId("JC3", "form");
  test.skip(!form, "JC3's brief has no form rule");
  await startFirstSession(page, "JC3");
  await writePiece(page, "JC3", JC3_AABA, form as string);
  const plan = page.getByTestId("form-plan");
  await expect(plan.locator("li[data-state='ok']")).toHaveCount(4, { timeout: 45_000 });
  await expect(plan.locator("li[data-letter='B']")).toContainText("The bridge");
  await expect(page.getByTestId("bridge-chords")).toHaveText("The bridge plays D7 G7 C7 F7.");
  // W7 gate (decision 80): with no I Got Rhythm key the tune is judged against J4.L04's head, so a head of the
  // learner's own meets every line (the course can be completed); J4.L04's head in every A does not.
  const original = ruleId("JC3", "custom", (r) => r.fn === "contrafact") as string;
  await setCode(page, "JC3", JC3_PIECES.oldHead);
  await expect(rule(page, original)).toHaveAttribute("data-state", "open", { timeout: 45_000 });
  await setCode(page, "JC3", JC3_PIECES.reference);
  await expect(rule(page, original)).toHaveAttribute("data-state", "met", { timeout: 45_000 });
  await expect(page.getByTestId("req-count")).toHaveText(/^(\d+) of \1 met$/, { timeout: 45_000 });
});

test("RC2: the clave lens names the direction it hears; the same hits turned round read 2-3", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await seedPoint(page, "RC2 open");
  const clave = ruleId("RC2", "clave");
  test.skip(!clave, "RC2's brief has no clave rule");
  await startFirstSession(page, "RC2");
  await writePiece(page, "RC2", RC2_CLAVE, clave as string);
  const card = page.getByTestId("clave-card");
  await expect(card.getByTestId("clave-heard")).toHaveText("Heard: Son clave 3-2, 8 bars from bar 1", {
    timeout: 45_000,
  });
  // The learner's two bars sit on the clave's cells: 0 3 6 | 10 12.
  const mine = card.getByRole("list", { name: /^Your perc/ });
  await expect(mine.locator("li[data-on='true']")).toHaveCount(5);
  await setCode(page, "RC2", RC2_CROSSED);
  await expect(card.getByTestId("clave-heard")).toHaveText("Heard: Son clave 2-3, 2 bars from bar 1", {
    timeout: 45_000,
  });
  await expect(page.locator(`[data-rule="${clave}"]`)).toHaveAttribute("data-state", "open");
  // The groove again: session 1 ends, session 2 meets the brief, released to Side B.
  await setCode(page, "RC2", RC2_CLAVE);
  await expect(rule(page, clave as string)).toHaveAttribute("data-state", "met", { timeout: 45_000 });
  await finishSession(page, "RC2", 1, 2);
  await checkAndRelease(page, "Son of Eight");
  await expect(page.getByTestId("release-ceremony")).toContainText("Side B");
});

test("JC4 from “JC4 open”: S1's analysis shown, then S2's reharmonisation with the melody locked and the devices named", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await seedPoint(page, "JC4 open");
  const errors = watchErrors(page);
  await page.goto("/capstone/JC4");
  // Georgia on My Mind is picked (the one standard with an answer key); session 1 is the analysis.
  const start = page.getByRole("button", { name: /^Start session 1 of 3$/ });
  await expect(start).toBeEnabled({ timeout: 60_000 });
  await start.click();
  await expect(page.getByTestId("capstone-workspace")).toBeVisible({ timeout: 60_000 });
  const analysis = page.getByTestId("jc4-analysis");
  await expect(analysis).toBeVisible({ timeout: 60_000 });
  // Finishing waits for the analysis: one empty check (it does not pass), then shown (grading it is transcribe's).
  await expect(page.getByTestId("finish-session")).toBeDisabled();
  await analysis.getByTestId("analysis-check").click();
  await expect(page.getByTestId("jc4-analysis-done")).toHaveCount(0);
  await analysis.getByTestId("analysis-reveal").click();
  await expect(page.getByTestId("jc4-analysis-done")).toContainText("The analysis is shown.");
  await finishSession(page, "JC4", 1, 3, false);
  // Session 2: the reharmonisation card reads the draft; three devices of the learner's own with the tune kept.
  const card = page.getByTestId("reharm-card");
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(card.getByTestId("melody-locked")).toBeVisible();
  await setCode(page, "JC4", await georgiaReharm());
  await expect(card.getByTestId("device-tally")).toContainText(/[34] different devices of 3/, {
    timeout: 45_000,
  });
  await expect(card.getByTestId("melody-touched")).toHaveCount(0);
  await finishSession(page, "JC4", 2, 3);
  await expect(page.getByTestId("voice-leading-card")).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test("AC2: choir opens with session 1; the swing as a ratio, the snare's lean in ms, each chord's voicing; the mix measured part by part", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await seedPoint(page, "AC2 open");
  await page.goto("/capstone/AC2");
  await expect(page.getByText(/Starting this session unlocks/)).toContainText("choir", { timeout: 60_000 });
  const swing = ruleId("AC2", "swing");
  test.skip(!swing, "AC2's brief has no swing rule");
  await startFirstSession(page, "AC2");
  await writePiece(page, "AC2", AC2_BALLAD, swing as string);
  await expect(foundLines(page, swing as string)).toContainText(
    ["`hats`: swung 16ths, 1.5 : 1.", "`snare` sits 20 ms behind the grid (a lean you feel)."].map((t) =>
      t.replaceAll("`", ""),
    ),
    { timeout: 45_000 },
  );
  await expect(page.getByTestId("voicings-card")).toContainText("Bar 3, F♯m7: close, top E4.");
  // The mix step (the last session): each part rendered alone and measured; a pad 34 dB down is not heard.
  await finishSession(page, "AC2", 1, 3);
  await finishSession(page, "AC2", 2, 3, false);
  await setCode(page, "AC2", AC2_MIX_TWO_BARS);
  const mix = page.getByTestId("mix-card");
  // From the code first (gain against the loudest part), then from the renders.
  await expect(mix.getByTestId("mix-levels").locator("li[data-track='pad']")).toHaveAttribute(
    "data-heard",
    "false",
    { timeout: 45_000 },
  );
  await mix.getByTestId("mix-measure-parts").click();
  const parts = mix.getByTestId("mix-parts");
  await expect(mix.getByTestId("mix-parts-progress")).toBeVisible();
  // Five offline renders (the mix, then each part alone) of two bars.
  await expect(parts.locator("li[data-part]")).toHaveCount(4, { timeout: 45_000 });
  await expect(parts.locator("li[data-part='pad']")).toContainText("Not heard");
  await expect(parts.locator("li[data-part='chords']")).not.toContainText("Not heard");
  await shots(page, "w7-ac2-mix");
});

test("JC4.S3: the melody line is locked, every device is named with its bar", async ({ page }) => {
  test.setTimeout(120_000);
  await seedPoint(page, "JC4.S2 done");
  await page.goto("/capstone/JC4");
  const card = page.getByTestId("reharm-card");
  // Georgia on My Mind has its answer key: the card draws (never "still being written" while the song loads).
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("jc4-no-song")).toHaveCount(0);
  await expect(card.getByTestId("melody-locked")).toBeVisible();
  await expect(card.getByTestId("device-tally")).toContainText(/\d different devices? of 3/, {
    timeout: 45_000,
  });
  await expect(card.locator("[data-testid='reharm-devices'] li").first()).toContainText(/^Bars? \d+/);
  // Typing in the melody line changes nothing; the chords line takes the edit.
  const line = page.locator(".cm-line", { hasText: /^mel(ody)?:/ }).first();
  await line.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" x");
  await expect(line).not.toContainText(" x");
  await expect(card.getByTestId("melody-touched")).toHaveCount(0);
  await shots(page, "w7-jc4-s3");
  // The last session: three devices of the learner's own with the tune kept meet the brief; released to Side B.
  await setCode(page, "JC4", await georgiaReharm());
  await checkAndRelease(page, "Georgia, Again");
  await expect(page.getByTestId("release-ceremony")).toContainText("Side B");
});

test("AC1: two versions side by side; A/B at matched loudness keeps the place in the tune", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await seedPoint(page, "AC1.S2 done");
  await page.goto("/capstone/AC1");
  const bar = page.getByTestId("versions-bar");
  await expect(bar).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("version-tab-a")).toBeEnabled();
  await expect(page.getByTestId("version-tab-b")).toBeEnabled();
  // The tabs answer the arrow keys.
  await page.getByTestId("version-tab-a").click();
  await expect(page.getByTestId("capstone-workspace")).toHaveAttribute("data-version", "a");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("capstone-workspace")).toHaveAttribute("data-version", "b", {
    timeout: 30_000,
  });
  // Both versions rendered offline, then A and B at the same loudness.
  await page.getByTestId("compare-a").click();
  await expect(page.getByTestId("compare-note")).toContainText(
    /Matched in loudness|already play at the same loudness/,
    {
      timeout: 90_000,
    },
  );
  await expect(page.getByTestId("compare-a")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("compare-b").click();
  await expect(page.getByTestId("compare-b")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("compare-a")).toHaveAttribute("aria-pressed", "false");
  await shots(page, "w7-ac1");
  // Session 3: both versions meet the brief, so the track is released with version one (version two is added
  // to the same track from its own tab; bun-tested in tracks.test.ts).
  await checkAndRelease(page, "One Tune");
  await expect(page.getByTestId("release-ceremony")).toContainText("Side B");
});
