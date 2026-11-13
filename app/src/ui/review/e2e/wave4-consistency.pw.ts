// Wave 4 consistency pass over the shell pages built in Waves 2–3: every page in both themes at both reference
// sizes, read for one product (one page width per kind of page, one heading scale, buttons that read as buttons,
// AA contrast of the text tokens on their surfaces, visible focus). Also Today's done card in Bark: its secondary
// buttons must read as live buttons on the card, not as greyed-out ones.
import { expect, type Page, test } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../../e2e/support/stack.ts";
import { shoot, useUiPrefs } from "../../../../../e2e/support/ui.ts";
import { api, SHOTS, seed } from "./support.ts";

test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
});

const PAGES: readonly { name: string; path: string; ready: (p: Page) => Promise<void> }[] = [
  {
    name: "today",
    path: "/",
    ready: (p) => expect(p.getByTestId("today-card")).toBeVisible({ timeout: 20_000 }),
  },
  { name: "practice", path: "/practice", ready: (p) => expect(p.locator("main h1")).toBeVisible() },
  { name: "studio", path: "/studio", ready: (p) => expect(p.locator("main")).toContainText(/Sketch/i) },
  { name: "transcribe", path: "/transcribe", ready: (p) => expect(p.locator("main h1")).toBeVisible() },
  { name: "album", path: "/album", ready: (p) => expect(p.getByTestId("album-title")).toBeVisible() },
  { name: "toolbox", path: "/toolbox", ready: (p) => expect(p.locator("main h1")).toBeVisible() },
  { name: "progress", path: "/progress", ready: (p) => expect(p.locator("main h1")).toBeVisible() },
  {
    name: "settings-audio",
    path: "/settings/audio",
    ready: (p) => expect(p.locator("main h2").first()).toBeVisible(),
  },
  {
    name: "settings-learning",
    path: "/settings/learning",
    ready: (p) => expect(p.locator("main h2").first()).toBeVisible(),
  },
  {
    name: "settings-appearance",
    path: "/settings/appearance",
    ready: (p) => expect(p.locator("main h2").first()).toBeVisible(),
  },
  {
    name: "settings-data",
    path: "/settings/data",
    ready: (p) => expect(p.locator("main h2").first()).toBeVisible(),
  },
];

/** WCAG contrast of two CSS colours (rgb/rgba over an opaque backdrop). */
function contrast(fg: number[], bg: number[]): number {
  const lum = (c: number[]) => {
    const [r, g, b] = c.slice(0, 3).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x) as [number, number];
  return (a + 0.05) / (b + 0.05);
}

const rgb = (s: string) => (s.match(/[\d.]+/g) ?? []).map(Number);

test("every shell page in both themes at both sizes: no horizontal overflow, one page width, h1 once", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await seed(page, "after U04.CP");
  for (const m of SCREENSHOT_MATRIX) {
    await page.setViewportSize({ width: m.width, height: m.height });
    await useUiPrefs(page, { theme: m.theme, motion: "off" });
    for (const pg of PAGES) {
      await page.goto(pg.path);
      await pg.ready(page);
      await page.waitForTimeout(150);
      const facts = await page.evaluate(() => {
        const main = document.getElementById("main") as HTMLElement;
        const h1 = [...main.querySelectorAll("h1")].filter((h) => h.offsetParent !== null);
        return {
          overflow: main.scrollWidth - main.clientWidth,
          h1: h1.length,
        };
      });
      expect([pg.name, facts.overflow]).toEqual([pg.name, expect.any(Number)]);
      expect(facts.overflow, `${pg.name} overflows horizontally`).toBeLessThanOrEqual(0);
      expect(facts.h1, `${pg.name} has one visible h1`).toBeLessThanOrEqual(1);
      await shoot(page, SHOTS, `w4-pass-${pg.name}`, m.theme);
    }
  }
});

test("text tokens meet AA on every surface in both themes", async ({ page }) => {
  await seed(page, "after U04.CP");
  for (const theme of ["paper", "bark"] as const) {
    await useUiPrefs(page, { theme, motion: "off" });
    await page.goto("/settings/about");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const pairs = await page.evaluate(() => {
      const probe = (v: string) => {
        const el = document.createElement("span");
        el.style.color = `var(${v})`;
        document.body.append(el);
        const c = getComputedStyle(el).color;
        el.remove();
        return c;
      };
      const fg = ["--oak-text", "--oak-text-2", "--oak-text-3", "--oak-link", "--oak-issue", "--oak-accent"];
      const bg = ["--oak-bg", "--oak-surface", "--oak-surface-2"];
      return fg.flatMap((f) => bg.map((b) => ({ f, b, fc: probe(f), bc: probe(b) })));
    });
    for (const p of pairs) {
      const ratio = contrast(rgb(p.fc), rgb(p.bc));
      expect(ratio, `${theme}: ${p.f} on ${p.b} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test("Today's done card: its buttons read as live buttons in Bark and Paper, and take focus visibly", async ({
  page,
}) => {
  await seed(page, "onboarded");
  // Onboarding finished "yesterday": step the clock back so today is that day, and done.
  await api(page, "PUT", "/dev/clock", { advanceDays: -1 });
  for (const m of SCREENSHOT_MATRIX) {
    await page.setViewportSize({ width: m.width, height: m.height });
    await useUiPrefs(page, { theme: m.theme, motion: "off" });
    await page.goto("/");
    await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", "done", { timeout: 20_000 });
    const studio = page.getByRole("link", { name: "Keep playing in Studio" });
    await expect(studio).toBeVisible();
    const look = await studio.evaluate((el) => {
      const card = el.closest("[data-testid=today-card]") as HTMLElement;
      const s = getComputedStyle(el);
      return {
        bg: s.backgroundColor,
        fg: s.color,
        border: s.borderTopColor,
        card: getComputedStyle(card).backgroundColor,
        opacity: s.opacity,
      };
    });
    expect(look.opacity).toBe("1");
    // The label is AA on the button, and the button is set off from the card (a fill or border that differs).
    expect(
      contrast(rgb(look.fg), rgb(look.bg === "rgba(0, 0, 0, 0)" ? look.card : look.bg)),
    ).toBeGreaterThanOrEqual(4.5);
    expect(contrast(rgb(look.border), rgb(look.card))).toBeGreaterThanOrEqual(1.6);
    await studio.focus();
    const outline = await studio.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe("none");
    await shoot(page, SHOTS, "w4-today-done", m.theme);
  }
});
