// Helpers of the Wave 4 journey review (review:journey): the learner's harmony lessons, ear training, gym and
// capstone days on this suite's real stack (Vite 5221, API 8821, the scripted fake tutor). Every spec starts from a
// dev seed (wave4.md §6) and blocks Vite's HMR socket, so another engineer's save cannot remount a step mid-test.
import { type APIRequestContext, expect, type Locator, type Page } from "@playwright/test";
import { tryAgainIfShown } from "../journey/lesson-walk.ts";
import { api } from "./support.ts";

export { tryAgainIfShown };

/** Seeds a named point (`mic: false` gives a learner without a mic: Quiet mode, reason no-mic). */
export const seedPoint = (request: APIRequestContext, point: string, o: { mic?: boolean } = {}) =>
  api<{ point: string; done: string[] }>(request, "POST", "/api/dev/seed", { point, ...o });

/** Quiet mode on or off for today (`PUT /api/voice/quiet`). */
export const setQuiet = (request: APIRequestContext, quiet: boolean) =>
  api(request, "PUT", "/api/voice/quiet", { quiet, scope: "today" });

/** Cuts Vite's HMR socket (answered locally), as the lesson and capstone suites do. */
export async function quietHmr(page: Page): Promise<void> {
  await page.routeWebSocket(/^ws:\/\/127\.0\.0\.1:\d+\/(\?.*)?$/, (ws) => {
    ws.send(JSON.stringify({ type: "connected" }));
  });
}

export const step = (page: Page): Locator => page.getByTestId("lesson-step");

/** Opens a lesson at a step and waits for it (the first visit compiles the route: allow for it). */
export async function openStep(page: Page, lessonId: string, stepId: string): Promise<void> {
  await page.goto(`/learn/${lessonId}?step=${stepId}`);
  await expect(step(page)).toHaveAttribute("data-step", stepId, { timeout: 60_000 });
}

/** The keyboard step's chord builder: picks these MIDI notes by mouse, after clearing. */
export async function buildChord(page: Page, midis: readonly number[]): Promise<void> {
  // A verdict on screen: the answer is changed through Try again (docs/design/retry.md §2.5).
  await tryAgainIfShown(page);
  const s = step(page);
  const clear = s.getByRole("button", { name: "Clear", exact: true });
  if (await clear.isEnabled()) await clear.click();
  for (const m of midis) await s.locator(`[data-midi="${m}"]`).click();
}

export interface Active {
  id: string;
  text: string;
  tag: string;
  ring: boolean;
  midi: string | null;
  rn: string | null;
  slot: string | null;
  /** "editor" inside the code editor, else the nearest `data-keyscope`. */
  scope: string;
  editable: boolean;
  option: string | null;
}

/** What has focus: its test id, its label or text, and whether a focus ring is drawn on it. */
export const active = (page: Page): Promise<Active> =>
  page.evaluate(() => {
    const e = document.activeElement as HTMLElement | null;
    if (!e || e === document.body)
      return {
        id: "body",
        text: "",
        tag: "body",
        ring: false,
        midi: null,
        rn: null,
        slot: null,
        scope: "",
        editable: false,
        option: null,
      };
    const ringed = (n: Element | null) => {
      if (!n) return false;
      const cs = getComputedStyle(n);
      return (
        (cs.outlineStyle !== "none" && Number.parseFloat(cs.outlineWidth) > 0) ||
        (cs.boxShadow !== "none" && cs.boxShadow !== "")
      );
    };
    const cm = e.closest(".cm-editor");
    return {
      id: e.dataset.testid ?? "",
      text: (e.getAttribute("aria-label") || e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80),
      tag: e.tagName.toLowerCase(),
      ring:
        ringed(e) ||
        (cm !== null && (ringed(cm.parentElement) || ringed(cm.parentElement?.parentElement ?? null))),
      midi: e.getAttribute("data-midi"),
      rn: e.getAttribute("data-rn"),
      slot: e.getAttribute("data-rn-slot"),
      scope: cm ? "editor" : ((e.closest("[data-keyscope]") as HTMLElement | null)?.dataset.keyscope ?? ""),
      editable: e.isContentEditable || e.tagName === "INPUT" || e.tagName === "TEXTAREA",
      option: e.getAttribute("data-option") ?? (e.hasAttribute("data-degree") ? "degree" : null),
    };
  });

/** Tab (or Shift+Tab) until the focused control matches; asserts that it shows a focus ring. */
export async function tabTo(
  page: Page,
  match: (a: Active) => boolean,
  what: string,
  o: { back?: boolean; max?: number } = {},
): Promise<Active> {
  for (let i = -1; i < (o.max ?? 60); i++) {
    if (i >= 0) await page.keyboard.press(o.back ? "Shift+Tab" : "Tab");
    const a = await active(page);
    if (match(a)) {
      expect(a.ring, `focus ring on ${what} (${a.id || a.text})`).toBe(true);
      return a;
    }
  }
  throw new Error(`Tab never reached ${what}`);
}

export const byId = (id: string) => (a: Active) => a.id === id;
export const byText = (r: RegExp) => (a: Active) => r.test(a.text);

/** Check from anywhere, the documented chord (contracts §11.9): Mod+Shift+Enter. */
export async function checkStep(page: Page, status: RegExp): Promise<void> {
  await page.keyboard.press("ControlOrMeta+Shift+Enter");
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", status, { timeout: 30_000 });
}

/** Tabs to the step's Continue and presses Enter; the next step (or the Make) opens. */
export async function continueStep(page: Page): Promise<void> {
  await expect(page.getByTestId("continue")).toBeEnabled({ timeout: 30_000 });
  const from = await step(page).getAttribute("data-step");
  await tabTo(page, byId("continue"), "Continue");
  await page.keyboard.press("Enter");
  await expect(step(page)).not.toHaveAttribute("data-step", from ?? "", { timeout: 30_000 });
}

/** Tabs into the code editor and replaces its text (select all, then the text inserted as one input). */
export async function typeCode(page: Page, code: string): Promise<void> {
  await tabTo(page, (a) => a.editable && a.scope === "editor", "the code editor");
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.insertText(code);
  await page.keyboard.press("Escape");
}

/** A region-locked editor: the caret lands at the end of the boxed region; Shift+Left over the old text. */
export async function typeRegion(page: Page, old: string, next: string): Promise<void> {
  await tabTo(page, (a) => a.editable && a.scope === "editor", "the code editor");
  for (let i = 0; i < old.length; i++) await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.insertText(next);
  await expect(page.locator(".cm-content").first()).toContainText(next);
  await page.keyboard.press("Escape");
}
