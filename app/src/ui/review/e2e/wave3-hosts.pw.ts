// Wave 3 integration: the staff in every host that draws one, at 1280×800 with its lens lines on. Bars per line
// follow the host's width once text sits under the notes, so a narrow host with names and busy bars could stack
// eight one-bar systems; a page now holds at most four systems (two grand staves) and the staff pages with the
// playhead. Checked on every U03–U04 lesson step that shows a staff, the U03 and U04 checkpoints, and Studio.
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { LessonDef } from "@oak/content-kit";
import { expect, type Page, test } from "@playwright/test";
import { api, createSketch, SHOTS, seed } from "./support.ts";

const REPO = resolve(import.meta.dirname, "../../../../..");
const VIEW = { width: 1280, height: 800 };
/** At most this share of the window for one staff (its header and pager included). */
const MAX_SHARE = 0.62;

interface StaffBox {
  height: number;
  systems: number;
  staves: number;
  lines: number;
}

/** Every rendered staff host on the page: its height and how many systems and staff lines it drew. */
function staves(page: Page): Promise<StaffBox[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-testid=staff-view]")]
      .filter((v) => v.dataset.status === "ready" && v.getBoundingClientRect().height > 0)
      .map((v) => {
        const svg = v.querySelector(".oak-staff-host svg");
        const groups = svg ? [...svg.querySelectorAll("g.abcjs-staff")] : [];
        const lineOf = (g: Element) => [...g.classList].find((c) => /^abcjs-l\d+$/.test(c)) ?? "";
        const systems = new Set(groups.map(lineOf)).size;
        return {
          height: Math.round(v.getBoundingClientRect().height),
          systems,
          staves: groups.length,
          lines: svg
            ? new Set([...svg.querySelectorAll(".abcjs-lyric tspan, .abcjs-lyric")].map(() => 1)).size
            : 0,
        };
      }),
  );
}

/**
 * Puts the first Workbench on its staff: the Staff tab and then Both when the views are tabbed, as they are at
 * 1280×800; side by side, the staff is already there. Yields the view shown each time the staff is ready.
 */
async function showStaff(page: Page): Promise<string[]> {
  const wb = page.locator("[data-testid=workbench]").first();
  if ((await wb.count()) === 0) return [];
  await expect(wb).toHaveAttribute("data-analysis", /ready|none/, { timeout: 60_000 });
  const ready = async () => {
    const v = page.locator("[data-testid=staff-view]").first();
    if ((await v.count()) === 0) return false;
    await expect(v).toHaveAttribute("data-status", /ready|error/, { timeout: 30_000 });
    await page.waitForTimeout(250);
    return true;
  };
  const out: string[] = [];
  const tabs = ["staff", "both"];
  if ((await wb.getByTestId("tab-staff").count()) === 0) return (await ready()) ? ["side by side"] : [];
  for (const tab of tabs) {
    const t = wb.getByTestId(`tab-${tab}`);
    if ((await t.count()) === 0) continue;
    await t.click();
    if (await ready()) out.push(tab);
  }
  return out;
}

function lessonsOf(unit: string): string[] {
  return readdirSync(resolve(REPO, "content/core", unit))
    .filter((d) => /^L\d\d$/.test(d))
    .sort()
    .map((l) => `${unit}.${l}`);
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await seed(page, "U04.CP due");
  await api(page, "PUT", "/settings/lenses", { value: { degrees: true, solfege: true, noteNames: true } });
  await page.close();
});

test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
  await page.setViewportSize(VIEW);
});

for (const unit of ["U03", "U04"])
  test(`${unit} lesson steps: no staff takes more than ${MAX_SHARE * 100}% of a 1280×800 window`, async ({
    page,
  }) => {
    test.setTimeout(220_000);
    const tall: string[] = [];
    const seen: string[] = [];
    for (const id of lessonsOf(unit)) {
      const [u, l] = id.split(".") as [string, string];
      const def = ((await import(resolve(REPO, "content/core", u, l, "lesson.ts"))) as { default: LessonDef })
        .default;
      for (const step of def.steps.filter((s) => s.ui.panels.staff)) {
        await page.goto(`/learn/${id}?step=${step.id}`);
        await expect(page.getByTestId("lesson-step")).toHaveAttribute("data-step", step.id, {
          timeout: 60_000,
        });
        for (const tab of await showStaff(page)) {
          for (const s of await staves(page)) {
            seen.push(`${id} ${step.id} ${tab} ${s.height}px ${s.systems} systems`);
            if (s.height > VIEW.height * MAX_SHARE)
              tall.push(`${id} ${step.id} (${tab}): ${s.height}px, ${s.systems} systems`);
          }
        }
      }
    }
    console.log(seen.join("\n"));
    expect(seen.length).toBeGreaterThan(0);
    expect(tall).toEqual([]);
  });

test("Studio: busy bars with every lens on stay within the window, paging with the playhead", async ({
  page,
}) => {
  const bar = (d: string) => `[${d}]`;
  const bars = ["0 1 2 3 4 5 6 7", "7 6 5 4 3 2 1 0", "0 2 4 6 7 5 3 1", "1 3 5 7 6 4 2 0"]
    .map(bar)
    .join(" ");
  const code = `setcpm(90/4)

mel: n("<${bars} ${bars}>").scale("<C4:major G4:major F4:major D4:major>").s("piano")`;
  const id = await createSketch(page, "Busy bars", code);
  await page.goto(`/studio/${id}`);
  const wb = page.locator("[data-testid=workbench]");
  await expect(wb).toHaveAttribute("data-analysis", "ready", { timeout: 60_000 });
  await expect(wb).toHaveAttribute("data-lenses", "degree solfege noteName");
  for (const length of ["8", "16"]) {
    await page.getByRole("combobox", { name: "Length" }).selectOption(length);
    await expect(wb).toHaveAttribute("data-analysis", "ready", { timeout: 60_000 });
    expect(await showStaff(page)).not.toEqual([]);
    const all = await staves(page);
    console.log(length, JSON.stringify(all));
    for (const s of all) {
      expect(s.height).toBeLessThanOrEqual(VIEW.height * MAX_SHARE);
      expect(s.systems).toBeLessThanOrEqual(4);
    }
    // More bars than one page holds: the staff pages, and the pager names the bars on screen.
    await expect(page.getByTestId("staff-pager").first()).toContainText(`of ${length}`);
    await page
      .getByTestId("staff-view")
      .first()
      .screenshot({ path: `${SHOTS}/w3-hosts-studio-staff-${length}-1280x800.png` });
  }
});

for (const unit of ["U03", "U04"])
  test(`${unit}.CP: every item's staff fits a 1280×800 window`, async ({ page }) => {
    test.setTimeout(200_000);
    await seed(page, `${unit}.CP due`);
    await api(page, "PUT", "/settings/lenses", { value: { degrees: true, solfege: true, noteNames: true } });
    await page.goto(`/checkpoint/${unit}`);
    await page.getByTestId("start-checkpoint").click();
    const seen: string[] = [];
    const tall: string[] = [];
    for (let i = 0; i < 30; i++) {
      const progress = page.getByTestId("checkpoint-progress");
      await expect(progress.or(page.getByTestId("hand-in"))).toBeVisible({ timeout: 60_000 });
      if (!(await progress.isVisible())) break;
      await page.waitForTimeout(300);
      // Staves drawn outside a Workbench (staff cards, a staff to read): their engraved height.
      for (const h of await page.evaluate(() =>
        [...document.querySelectorAll("#main svg")]
          .filter((svg) => svg.querySelector("g.abcjs-staff") && !svg.closest("[data-testid=staff-view]"))
          .map((svg) => Math.round(svg.getBoundingClientRect().height)),
      )) {
        seen.push(`${unit}.CP item ${i + 1} static staff ${h}px`);
        if (h > VIEW.height * MAX_SHARE) tall.push(`item ${i + 1} (static): ${h}px`);
      }
      for (const tab of await showStaff(page)) {
        for (const s of await staves(page)) {
          seen.push(`${unit}.CP item ${i + 1} ${tab} ${s.height}px ${s.systems} systems`);
          if (s.height > VIEW.height * MAX_SHARE) tall.push(`item ${i + 1} (${tab}): ${s.height}px`);
        }
      }
      const skip = page.getByTestId("skip-item");
      if ((await skip.count()) === 0) break; // the Make: the last item
      const before = await progress.textContent();
      await skip.click();
      await expect(page.getByTestId("checkpoint-progress").or(page.getByTestId("hand-in"))).not.toHaveText(
        before ?? "",
      );
    }
    console.log(seen.join("\n"));
    expect(tall).toEqual([]);
  });
