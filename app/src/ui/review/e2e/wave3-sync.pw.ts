// Wave 3 integration: the three views of the music agree while it plays. The code editor outlines the tokens
// sounding now (Strudel's pattern highlighting), the roll lights the events sounding now, the staff lights the
// same events: the notes outlined in the code are the notes lit on the roll, and the staff lights nothing the
// roll does not. Then a tutor reference to bars (`[[bars:2-2]]`) and to a note lights exactly those notes on
// the staff and flashes them in the code (the roll draws the same hover on its canvas).
import { expect, type Page, test } from "@playwright/test";
import { useUiPrefs } from "../../../../../e2e/support/ui.ts";
import { createSketch, seed } from "./support.ts";

const WB = "[data-testid=workbench]";
const NAMES = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"];
const nameOf = (midi: number) => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
/** The MIDI number inside an event id (`track|bar|onset|midi|k`, contracts §5.7). */
const midiOf = (id: string) => Number(id.split("|")[3]);

const BARS = ["c4 d4 e4 f4", "g4 a4 b4 c5", "e4 g4 b4 d5"];
const CODE = `setcpm(100/4)\n\nmel: note("<${BARS.map((b) => `[${b}]`).join(" ")}>").s("piano")\n`;

interface Lit {
  roll: string[];
  staff: string[];
  code: string[];
}
function lit(page: Page): Promise<Lit> {
  return page.evaluate(() => {
    const words = (s: string | undefined) => (s ?? "").split(" ").filter(Boolean);
    const outlined = [...document.querySelectorAll<HTMLElement>(".cm-content span[style*='outline']")].map(
      (s) => (s.textContent ?? "").trim(),
    );
    return {
      roll: words((document.querySelector("[data-testid=piano-roll]") as HTMLElement | null)?.dataset.active),
      staff: words((document.querySelector(".oak-staff-host") as HTMLElement | null)?.dataset.activeEvents),
      code: outlined,
    };
  });
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await seed(page, "after U03.L02");
  await page.close();
});

test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  // Roll and staff side by side (at 1280×800 they are tabbed, one mounted at a time).
  await page.setViewportSize({ width: 1440, height: 900 });
});

async function open(page: Page): Promise<void> {
  const id = await createSketch(page, "Three bars", CODE);
  await page.goto(`/studio/${id}`);
  await expect(page.locator(WB)).toHaveAttribute("data-analysis", "ready", { timeout: 60_000 });
  await page.getByRole("combobox", { name: "Length" }).selectOption("4");
  await expect(page.locator("[data-testid=staff-view]")).toHaveAttribute("data-status", "ready", {
    timeout: 30_000,
  });
  await expect(page.getByTestId("piano-roll")).toBeVisible();
}

test("code, roll and staff light the same music while it plays", async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  await page.getByTestId("play-toggle").click();
  await expect(page.locator(WB)).toHaveAttribute("data-playing", "1", { timeout: 20_000 });
  // Sampled every ~110 ms over about six bars. The editor's outline and the roll repaint on their own frames,
  // so at a note change one may lead the other by a frame: those samples count as `between`, and must be rare.
  const notes = new Set(BARS.join(" ").split(" "));
  let agree = 0;
  let between = 0;
  const barsSeen = new Set<number>();
  for (let i = 0; i < 60; i++) {
    const s = await lit(page);
    await page.waitForTimeout(110);
    const code = s.code.filter((t) => notes.has(t));
    if (s.roll.length === 0 || code.length === 0) continue;
    // The staff lights only what the roll lights.
    for (const id of s.staff) expect(s.roll, `${id} lit on the staff only`).toContain(id);
    const names = s.roll.map((id) => nameOf(midiOf(id)));
    const bar = Number((s.roll[0] as string).split("|")[1]) - 1;
    expect(BARS[bar % BARS.length]?.split(" ")).toEqual(expect.arrayContaining(names));
    if (names.every((n) => code.includes(n)) && code.every((t) => names.includes(t))) {
      agree++;
      barsSeen.add(bar % BARS.length);
    } else between++;
  }
  expect(agree).toBeGreaterThanOrEqual(15);
  expect(between).toBeLessThanOrEqual(agree / 3);
  expect(barsSeen.size).toBeGreaterThanOrEqual(2);
  await page.getByTestId("play-toggle").click();
  await expect(page.locator(WB)).toHaveAttribute("data-playing", "0");
});

test("a tutor reference lights its bars or its note on the roll, the staff and in the code", async ({
  page,
}) => {
  await open(page);
  const fire = (detail: Record<string, unknown>) =>
    page.evaluate((d) => {
      window.dispatchEvent(
        new CustomEvent("oak:tutor-highlight", {
          detail: { thread: { kind: "sketch", id: "x" }, seq: Date.now(), at: Date.now(), ...d },
        }),
      );
    }, detail);
  const hovered = () =>
    page.evaluate(() => ({
      staff: document.querySelectorAll(".oak-staff-host .oak-hover").length,
      code: [...document.querySelectorAll<HTMLElement>(".cm-content .oak-flash")]
        .map((s) => (s.textContent ?? "").trim())
        .filter(Boolean),
    }));
  await fire({ kind: "bars", from: 2, to: 2 });
  // Bar 2's four notes: flashed in the code (for 0.6 s), lit on the staff.
  await expect.poll(async () => (await hovered()).code.join(" "), { intervals: [50] }).toBe("g4 a4 b4 c5");
  await expect.poll(async () => (await hovered()).staff).toBe(4);
  // It fades after HIGHLIGHT_MS (2.4 s).
  await expect.poll(async () => (await hovered()).staff, { timeout: 6_000 }).toBe(0);
  await fire({ kind: "note", midi: 71 });
  // B4 sounds in bars 2 and 3.
  await expect.poll(async () => (await hovered()).staff).toBe(2);
});
