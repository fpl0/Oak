// The kit gallery (/dev/kit) in both themes at both reference sizes, keyboard use of the new controls, reduced
// motion, and the stack itself: the Vite proxy on a non-default port reaches its own API, whose fake tutor streams.
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../../e2e/support/stack.ts";
import { shoot, useUiPrefs } from "../../../../../e2e/support/ui.ts";

const SHOTS = fileURLToPath(new URL("./screenshots", import.meta.url));

for (const m of SCREENSHOT_MATRIX) {
  test(`gallery renders in ${m.theme} at ${m.width}x${m.height}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
    await page.setViewportSize({ width: m.width, height: m.height });
    await useUiPrefs(page, { theme: m.theme });
    await page.goto("/dev/kit");
    await expect(page.getByRole("heading", { level: 1, name: "UI kit" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", m.theme);
    // Nothing overflows the page horizontally.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await shoot(page, SHOTS, "kit", m.theme);
    expect(errors).toEqual([]);
  });
}

test("the new controls work from the keyboard", async ({ page }) => {
  await useUiPrefs(page, { theme: "paper" });
  await page.goto("/dev/kit");
  const target = page.getByRole("radiogroup", { name: "Daily target" });
  await target.getByRole("radio", { name: "20 min" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(target.getByRole("radio", { name: "25 min" })).toHaveAttribute("aria-checked", "true");
  await expect(target.getByRole("radio", { name: "25 min" })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(target.getByRole("radio", { name: "15 min" })).toHaveAttribute("aria-checked", "true");
  // Disabled segments are skipped.
  const view = page.getByRole("radiogroup", { name: "Map view" });
  await view.getByRole("radio", { name: "Course" }).click();
  await page.keyboard.press("ArrowRight");
  await expect(view.getByRole("radio", { name: "Tree" })).toHaveAttribute("aria-checked", "true");

  const goal = page.getByRole("spinbutton", { name: "Weekly goal" });
  await page.getByRole("button", { name: "Increase Weekly goal" }).click();
  await page.getByRole("button", { name: "Increase Weekly goal" }).click();
  await expect(goal).toHaveValue("7");
  await expect(page.getByRole("button", { name: "Increase Weekly goal" })).toBeDisabled();
  await goal.focus();
  await page.keyboard.press("ArrowDown");
  await expect(goal).toHaveValue("6");

  // The theme switch in the header flips <html data-theme>.
  await page.getByRole("radiogroup", { name: "Theme" }).getByRole("radio", { name: "Bark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "bark");

  // The wrap-up callout's actions are real buttons; Dismiss removes it and a button brings it back.
  const wrap = page.getByRole("status").filter({ hasText: "That's 20 minutes" });
  await wrap.getByRole("button", { name: "Keep going" }).click();
  await expect(wrap).toHaveCount(0);
  await page.getByRole("button", { name: "Show the wrap-up line again" }).click();
  await expect(wrap).toBeVisible();

  // Meters expose their value as text.
  await expect(page.getByRole("meter", { name: "Ear-to-voice aim" })).toHaveAttribute(
    "aria-valuetext",
    "±35¢",
  );
  const mic = page.getByRole("meter", { name: "Microphone level" }).first();
  await expect(mic).toHaveAttribute("aria-valuetext", "60%");
});

test("reduced motion is honoured", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dev/kit");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
});

test("this stack's API answers through its own Vite proxy, and the fake tutor streams", async ({ page }) => {
  await page.goto("/dev/kit");
  const health = await page.evaluate(async () => {
    const r = await fetch("/api/health", { headers: { "X-Oak": "1" } });
    return r.json();
  });
  expect(health).toMatchObject({ ok: true, dev: true, tutor: "ready", tutorBackend: "claude-cli" });
  const sse = await page.evaluate(async () => {
    const r = await fetch("/api/tutor/chat", {
      method: "POST",
      headers: { "X-Oak": "1", "content-type": "application/json" },
      body: JSON.stringify({
        thread: { subjectKind: "general", subjectId: "general" },
        kind: "chat",
        userText: "What does n mean? #card",
      }),
    });
    return { status: r.status, text: await r.text() };
  });
  expect(sse.status).toBe(200);
  const events = [...sse.text.matchAll(/^event: (\w+)/gm)].map((x) => x[1]);
  expect(events[0]).toBe("meta");
  expect(events).toContain("text");
  expect(events.at(-1)).toBe("done");
  // The card ran through Oak's real card validation (strict lint, 4-bar evaluation) and was shown.
  expect(events).toContain("card");
});
