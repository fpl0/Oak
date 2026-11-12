// Drills after integration, on the real Oak server from real U03 seeds (no reshaped progress): a set resumed
// from the server's record after a reload; the degree and solfège lens switches unlocked by U03.L02 and U03.L08;
// melodic dictation's top levels written on the real staff widget; a family resting in mixed practice read
// honestly on Practice and on the Oak; the passive block in Bark and under reduced motion; and the drill's
// focus-return rule leaving a closing dialog's focus alone.
import { fileURLToPath } from "node:url";
import type { Trial } from "@oak/api";
import { expect, type Page, test } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { shoot, useUiPrefs } from "../../../../e2e/support/ui.ts";
import { stack } from "./playwright.config.ts";

const SHOTS = fileURLToPath(new URL("./screenshots", import.meta.url));
const HEADERS = { "X-Oak": "1", Origin: stack.baseURL, "Content-Type": "application/json" };

function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon/i.test(m.text())) problems.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  return problems;
}

async function api(page: Page, method: "POST" | "PUT", path: string, data: unknown): Promise<void> {
  const res = await page.request.fetch(`${stack.apiURL}${path}`, { method, headers: HEADERS, data });
  expect(res.ok(), await res.text()).toBe(true);
}

async function seed(page: Page, point: string, quiet = true): Promise<void> {
  await api(page, "PUT", "/api/dev/clock", { reset: true });
  await api(page, "POST", "/api/dev/seed", { point });
  // Quiet mode on the server keeps these specs off the microphone (singing has its own suites).
  if (quiet) await api(page, "PUT", "/api/voice/quiet", { quiet: true, scope: "today" });
  await page.routeWebSocket(/.*/, () => {});
  // A new learner: nothing of the last one's sets stays in this browser.
  if (page.url().startsWith("http"))
    await page.evaluate(() => localStorage.removeItem("oak.drills.inflight.v1"));
}

async function startPractice(page: Page, familyId: string): Promise<void> {
  await page.goto(`/practice/${familyId}`);
  await expect(page.getByTestId("start-set")).toBeFocused({ timeout: 60_000 });
}

const currentTrial = (page: Page) =>
  page.evaluate(() => (globalThis as { __oakDrillTrial?: unknown }).__oakDrillTrial) as Promise<Trial>;

/** Answers the trial on screen on the degree pad, then moves on (the way home heard in Quiet mode). */
async function answerDegreeTrial(page: Page): Promise<void> {
  const t = await currentTrial(page);
  const deg = ((t.expected as { degrees?: string[] }).degrees ?? ["1"])[0] as string;
  await expect(page.getByRole("group", { name: /Your answer/ })).toBeVisible();
  await page.keyboard.press(deg.replace(/\D/g, "") || "1");
  await expect(page.getByTestId("trial-feedback")).toBeVisible();
  const next = page.getByTestId("next-trial");
  if ((await next.textContent())?.includes("Hear it home")) {
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("quiet-resolution")).toBeVisible({ timeout: 20_000 });
    await page.keyboard.press("Space");
  }
  await page.keyboard.press("Enter");
}

test("a set resumes from the server's record after a reload, not from what this browser kept", async ({
  page,
}) => {
  const problems = watch(page);
  await seed(page, "after U03.CP");
  await useUiPrefs(page, { theme: "paper" });
  await startPractice(page, "fam.deg.fet-major");
  await page.keyboard.press("Enter");
  const counter = page.getByTestId("trial-counter");
  await expect(counter).toHaveText(/Trial 1 of \d+/, { timeout: 60_000 });
  for (let i = 0; i < 3; i++) {
    await expect(counter).toHaveText(new RegExp(`Trial ${i + 1} of`));
    await answerDegreeTrial(page);
  }
  await expect(counter).toHaveText(/Trial 4 of/);
  // This browser's copy falls behind (it kept only the first answer); the server stored all three.
  const sessionId = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("oak.drills.inflight.v1") ?? "{}") as Record<
      string,
      { state: { session: { id: string }; outcomes: unknown[]; records: unknown[] } }
    >;
    const [key, entry] = Object.entries(raw)[0] as [string, (typeof raw)[string]];
    entry.state.outcomes = entry.state.outcomes.slice(0, 1);
    entry.state.records = entry.state.records.slice(0, 1);
    localStorage.setItem("oak.drills.inflight.v1", JSON.stringify({ [key]: entry }));
    return entry.state.session.id;
  });
  const read = page.waitForResponse((r) => r.url().endsWith(`/api/drills/sessions/${sessionId}`) && r.ok());
  await page.reload();
  await read;
  await expect(counter).toHaveText(/Trial 4 of/, { timeout: 60_000 });
  // The dots carry the three answers back from the server.
  await expect(page.getByRole("list", { name: "Trials" }).locator(".sr-only")).toContainText([
    "Trial 1: right",
    "Trial 2: right",
    "Trial 3: right",
  ]);
  expect(problems).toEqual([]);
});

test("the lens switches: degrees after U03.L02, solfège after U03.L08; the pad follows and the choice persists", async ({
  page,
}) => {
  await seed(page, "after U03.L02");
  await useUiPrefs(page, { theme: "paper" });
  await startPractice(page, "fam.deg.fet-major");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("trial-counter")).toHaveText(/Trial 1 of/, { timeout: 60_000 });
  await expect(page.getByTestId("lens-degrees")).toBeVisible();
  await expect(page.getByTestId("lens-solfege")).toHaveCount(0);

  await seed(page, "after U03.CP");
  await startPractice(page, "fam.deg.fet-major");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("trial-counter")).toHaveText(/Trial 1 of/, { timeout: 60_000 });
  const solfege = page.getByTestId("lens-solfege");
  await expect(page.getByTestId("lens-degrees")).toBeVisible();
  await expect(solfege).toBeVisible();
  const pad = page.getByRole("group", { name: /Your answer/ });
  if ((await solfege.getAttribute("aria-pressed")) !== "true") await solfege.click();
  await expect(solfege).toHaveAttribute("aria-pressed", "true");
  await expect(pad).toContainText("do");
  await shoot(page, SHOTS, "lenses-solfege-on", "paper");
  await solfege.click();
  await expect(solfege).toHaveAttribute("aria-pressed", "false");
  await expect(pad).not.toContainText("sol");
  // The preference is the server's `lenses` setting: a reload keeps it off.
  await page.reload();
  await expect(page.getByTestId("start-set").or(page.getByTestId("trial-counter"))).toBeVisible({
    timeout: 60_000,
  });
  if (await page.getByTestId("start-set").isVisible()) await page.keyboard.press("Enter");
  await expect(page.getByTestId("lens-solfege")).toHaveAttribute("aria-pressed", "false", {
    timeout: 60_000,
  });
  await page.getByTestId("lens-solfege").click();
  await expect(page.getByTestId("lens-solfege")).toHaveAttribute("aria-pressed", "true");
});

test("melodic dictation's top levels are written on the staff: right, then shown; both themes and sizes", async ({
  page,
}) => {
  const problems = watch(page);
  await seed(page, "after U03.CP");
  // Level 7 (minor) opens far later in the course; the family's ladder is opened here for the widget only.
  await page.route("**/api/drills/families", async (route) => {
    const res = await route.fetch();
    const body = (await res.json()) as { families: Record<string, unknown>[] };
    const st = body.families.find((f) => f.familyId === "fam.mel.dictation");
    if (st) st.maxOpenLevel = 9;
    await route.fulfill({ response: res, json: body });
  });
  await useUiPrefs(page, { theme: "paper" });
  await startPractice(page, "fam.mel.dictation");
  const level = page.getByRole("spinbutton", { name: "Start at level" });
  await level.fill("7");
  await expect(level).toHaveValue("7");
  await page.getByTestId("start-set").click();
  const counter = page.getByTestId("trial-counter");
  await expect(counter).toHaveText(/Trial 1 of/, { timeout: 60_000 });
  const staff = page.getByTestId("staff-surface");
  await expect(staff).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("This answer type is not available yet")).toHaveCount(0);
  // Write the heard line in the typed alternative (the staff draws it), then check.
  const answer = (await page.evaluate(
    () => (globalThis as { __oakDrillStaffAnswer?: string | null }).__oakDrillStaffAnswer,
  )) as string;
  expect(answer).toBeTruthy();
  await page.getByText("Type the notes instead").click();
  await page.getByRole("textbox", { name: /notes on the staff \(as text\)/ }).fill(answer);
  const notes = answer.split(" ").filter((t) => !t.startsWith("r:")).length;
  await expect(page.getByRole("list", { name: "Your notes" }).getByRole("listitem")).toHaveCount(notes);
  await shoot(page, SHOTS, "dictation-staff-answering", "paper");
  await page.getByRole("button", { name: /^Check/ }).click();
  const feedback = page.getByTestId("trial-feedback");
  await expect(feedback).toHaveAttribute("data-correct", "true", { timeout: 20_000 });
  await page.getByTestId("next-trial").click();
  // Trial 2: Show me reveals the line on the staff.
  await expect(counter).toHaveText(/Trial 2 of/);
  await expect(page.getByTestId("staff-surface")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Show me" }).click();
  await expect(page.getByTestId("staff-reveal")).toContainText("Answer:");
  await expect(page.getByTestId("trial-prompt")).toHaveText(/Write the tune on the staff/);
  // Both sizes in both themes (the theme switched in place: the reveal stays on screen).
  for (const theme of ["paper", "bark"] as const) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);
    for (const m of SCREENSHOT_MATRIX.filter((x) => x.theme === theme)) {
      await page.setViewportSize({ width: m.width, height: m.height });
      await page.waitForTimeout(300);
      const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(o).toBeLessThanOrEqual(1);
      await shoot(page, SHOTS, "dictation-staff-revealed", m.theme);
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(problems).toEqual([]);
});

test("a family resting in mixed practice reads as resting on Practice and on the Oak — never mastered, never lost", async ({
  page,
}) => {
  await seed(page, "after U03.CP");
  // The scheduler rests a stable family in its composite when the first-review bound needs a slot (decision
  // 27); which family that is depends on many days of history, so one is marked resting in the response.
  await page.route("**/api/drills/families", async (route) => {
    const res = await route.fetch();
    const body = (await res.json()) as { families: Record<string, unknown>[] };
    const st = body.families.find((f) => f.familyId === "fam.deg.fet-major");
    if (st)
      Object.assign(st, {
        level: 2,
        graduatedAt: new Date().toISOString(),
        compositeId: "fam.mix.pitch",
        restingSince: new Date().toISOString().slice(0, 10),
      });
    await route.fulfill({ response: res, json: body });
  });
  await useUiPrefs(page, { theme: "paper" });
  await page.goto("/practice");
  const card = page.locator('[data-family="fam.deg.fet-major"]');
  await expect(card).toHaveAttribute("data-status", "resting");
  await expect(card).toContainText("In mixed practice");
  await expect(card).toContainText("returns to its own sets where it left off");
  await expect(card).not.toContainText("Mastered");
  await expect(card.getByRole("link", { name: /Practise/ })).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  await shoot(page, SHOTS, "practice-resting", "paper");
  await page.goto("/practice/fam.deg.fet-major");
  await expect(page.getByTestId("family-resting")).toBeVisible({ timeout: 60_000 });
  // The Oak: the degree-hearing leaf's drills say where the family is.
  await page.goto("/oak?view=tree");
  await page.locator('[data-node="E04"]').focus();
  await page.keyboard.press("Enter");
  // The leaf keeps its own skill level; the family's row says it rests in mixed practice.
  const row = page
    .getByTestId("oak-panel")
    .getByRole("listitem")
    .filter({ hasText: "Scale degrees (major)" });
  await expect(row).toContainText("resting in mixed practice");
  await expect(row).not.toContainText(/mastered|in your reviews/i);
});

test("the passive block in Bark at both sizes and under reduced motion: named pairs, no motion needed", async ({
  page,
}) => {
  await seed(page, "after U04.L04");
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const m of SCREENSHOT_MATRIX.filter((x) => x.theme === "bark")) {
    await page.setViewportSize({ width: m.width, height: m.height });
    await useUiPrefs(page, { theme: "bark" });
    await startPractice(page, "fam.int.in-key");
    await page.keyboard.press("l");
    const block = page.getByTestId("passive-listen");
    await expect(block).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("passive-caption")).toHaveText(/→|\+|·/, { timeout: 30_000 });
    const pulsing = await page.evaluate(
      () =>
        [...document.querySelectorAll(".animate-pulse")].filter(
          (el) => getComputedStyle(el).animationName !== "none",
        ).length,
    );
    expect(pulsing).toBe(0);
    await shoot(page, SHOTS, "passive-reduced", m.theme);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
});

test("focus that falls to the page comes back to the drill, but never out of a dialog that hands it back", async ({
  page,
}) => {
  await seed(page, "after U03.CP");
  await useUiPrefs(page, { theme: "paper" });
  await startPractice(page, "fam.deg.fet-major");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("trial-counter")).toHaveText(/Trial 1 of/, { timeout: 60_000 });
  await expect(page.getByTestId("stage-text")).toHaveText("Your turn.", { timeout: 30_000 });
  // A dialog opened from a control outside the drill closes, focus falls to <body> for a moment, and the dialog
  // hands it back to its trigger itself (as React dialogs do after unmounting): the drill must not take it.
  await page.evaluate(() => {
    const w = window as unknown as { __stolen: boolean };
    w.__stolen = false;
    const trigger = document.createElement("button");
    trigger.textContent = "Open a dialog";
    trigger.id = "e2e-trigger";
    document.body.append(trigger);
    trigger.addEventListener("click", () => {
      const dialog = document.createElement("div");
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-label", "A test dialog");
      const close = document.createElement("button");
      close.textContent = "Close";
      close.addEventListener("click", () => {
        const region = document.querySelector('[data-testid="drill-runner"]');
        const steal = (e: Event) => {
          if (e.target === region) w.__stolen = true;
        };
        region?.addEventListener("focusin", steal);
        dialog.remove();
        setTimeout(() => {
          trigger.focus();
          region?.removeEventListener("focusin", steal);
        }, 150);
      });
      dialog.append(close);
      document.body.append(dialog);
      close.focus();
    });
  });
  await page.locator("#e2e-trigger").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Close" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#e2e-trigger")).toBeFocused();
  await page.waitForTimeout(300);
  await expect(page.locator("#e2e-trigger")).toBeFocused();
  expect(await page.evaluate(() => (window as unknown as { __stolen: boolean }).__stolen)).toBe(false);
  // Focus that falls to <body> with no dialog around comes back to the drill region.
  await page.waitForTimeout(600);
  await page.evaluate(() => document.getElementById("e2e-trigger")?.blur());
  await expect(page.getByTestId("drill-runner")).toBeFocused();
});
