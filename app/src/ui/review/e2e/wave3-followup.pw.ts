// Wave 3 second review pass (after integration).
// 1. A tutor reference, or a note selected in the code, that points at bars on another staff page turns the
//    stopped staff to that page, so the lit notes are on screen (the staff showed bars 1–8 and lit nothing).
// 2. Album covers keep long names inside the cover: a 120-character track title and a 60-character album name
//    (both allowed by the API) ran off the cover edge (the album name to x −249), cut mid-letter. They are now
//    fitted (smaller, then cut at a word with an ellipsis) and haloed in the wood colour where they cross a ring.
import { expect, type Page, test } from "@playwright/test";
import { useUiPrefs } from "../../../../../e2e/support/ui.ts";
import { api, createSketch, SHOTS, seed } from "./support.ts";

const WB = "[data-testid=workbench]";
const STAFF = "[data-testid=staff-view]";

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
});

// Sixteen bars; bar 13 is the only bar with A5, so a note reference lands on page 2 only.
const BARS = Array.from({ length: 16 }, (_, i) =>
  i === 12 ? "a5 g5 f5 e5" : ["c4 d4 e4 f4", "g4 a4 b4 c5", "e4 g4 b4 d5", "f4 e4 d4 c4"][i % 4],
);
const CODE = `setcpm(100/4)\n\nmel: note("<${BARS.map((b) => `[${b}]`).join(" ")}>").s("piano")\n`;

function fire(page: Page, detail: Record<string, unknown>) {
  return page.evaluate((d) => {
    window.dispatchEvent(
      new CustomEvent("oak:tutor-highlight", {
        detail: { thread: { kind: "sketch", id: "x" }, seq: Date.now(), at: Date.now(), ...d },
      }),
    );
  }, detail);
}
const lit = (page: Page) => page.locator(".oak-staff-host .oak-hover").count();
const pager = (page: Page) => page.getByTestId("staff-pager").locator("span[aria-live]");

test("a reference to bars on another page turns the stopped staff to them", async ({ page }) => {
  test.setTimeout(150_000);
  await seed(page, "after U03.L02");
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await page.setViewportSize({ width: 1440, height: 900 });
  const id = await createSketch(page, "Sixteen bars", CODE);
  await page.goto(`/studio/${id}`);
  await expect(page.locator(WB)).toHaveAttribute("data-analysis", "ready", { timeout: 60_000 });
  await page.getByRole("combobox", { name: "Length" }).selectOption("16");
  await expect(page.locator(STAFF)).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
  await expect(pager(page)).toHaveText(/^Bars 1–\d+ of 16$/);

  // The tutor names bar 13: the staff turns to the page holding it and lights its four notes.
  await fire(page, { kind: "bars", from: 13, to: 13 });
  await expect(pager(page)).toContainText(/Bars \d+–\d+ of 16/);
  await expect.poll(() => lit(page), { timeout: 10_000 }).toBe(4);
  const shown = (await pager(page).textContent()) ?? "";
  const [a, b] = (/Bars (\d+)–(\d+)/.exec(shown) ?? []).slice(1).map(Number);
  expect(a).toBeLessThanOrEqual(13);
  expect(b).toBeGreaterThanOrEqual(13);
  await page.screenshot({ path: `${SHOTS}/w3f-tutor-page-turn.png` });
  // The highlight fades; turning back by hand is not undone by the old reference.
  await expect.poll(() => lit(page), { timeout: 8_000 }).toBe(0);
  await page.getByRole("button", { name: "Previous bars" }).click();
  await page.waitForTimeout(400);
  expect((await pager(page).textContent()) ?? "").not.toBe(shown);

  // A note reference (A5 sounds only in bar 13) turns there too.
  await fire(page, { kind: "note", midi: 81 });
  await expect.poll(() => lit(page), { timeout: 10_000 }).toBe(1);
  await expect(pager(page)).toHaveText(shown);

  // A note selected in the code (bar 1's first note) brings the staff back to bar 1.
  const at = await page.evaluate(() => {
    const root = document.querySelector(".cm-content") as HTMLElement;
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const i = (n.textContent ?? "").indexOf("[c4");
      if (i < 0) continue;
      const r = document.createRange();
      r.setStart(n, i + 1);
      r.setEnd(n, i + 3);
      const b = r.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    }
    return null;
  });
  expect(at).not.toBeNull();
  await page.mouse.click(at?.x ?? 0, at?.y ?? 0);
  await expect(pager(page)).toHaveText(/^Bars 1–\d+ of 16$/);
  await expect.poll(() => page.locator(".oak-staff-host .oak-selected").count()).toBeGreaterThan(0);
});

const LONG_TRACK =
  "A fairly long title for a track that someone wrote one evening after work, with some feeling in it, yes";
const WIDE_ALBUM = "W".repeat(60);

test("album covers keep a long title and a long album name inside the cover, clear of the rings", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await seed(page, "C0 released");
  const sketchId = await createSketch(page, "Long one", 'note("c4 e4 g4 c5").s("piano")');
  const made = await api<{ id: string }>(page, "POST", "/album/tracks", {
    capstoneId: null,
    side: "Bside",
    title: LONG_TRACK.slice(0, 120),
    flavour: null,
    sketchId,
    sketchVersion: 1,
    linerNotesMd: "",
    theoryTags: [],
    attribution: null,
  });
  expect(made.status, JSON.stringify(made.body)).toBe(200);
  const put = await api(page, "PUT", "/settings/albumTitle", { value: WIDE_ALBUM });
  expect(put.status, JSON.stringify(put.body)).toBe(200);

  for (const [theme, w, h] of [
    ["paper", 1440, 900],
    ["bark", 1280, 800],
  ] as const) {
    await useUiPrefs(page, { theme, motion: "off" });
    await page.setViewportSize({ width: w, height: h });
    for (const path of ["/album", `/album/${made.body.id}`]) {
      await page.goto(path);
      const covers = page.locator("svg.oak-cover:has(text)");
      await expect(covers.first()).toBeVisible({ timeout: 30_000 });
      await page.evaluate(() => document.fonts.ready);
      const boxes = await covers.evaluateAll((svgs) =>
        svgs.flatMap((svg) =>
          [...svg.querySelectorAll("text")].map((t) => {
            const b = (t as SVGTextElement).getBBox();
            return {
              text: t.textContent ?? "",
              x0: b.x,
              x1: b.x + b.width,
              end: t.getAttribute("text-anchor"),
            };
          }),
        ),
      );
      expect(boxes.length).toBeGreaterThan(0);
      for (const b of boxes) {
        expect(
          b.x0,
          `${path} ${theme}: "${b.text.slice(0, 20)}…" starts off the cover`,
        ).toBeGreaterThanOrEqual(0);
        expect(b.x1, `${path} ${theme}: "${b.text.slice(0, 20)}…" runs off the cover`).toBeLessThanOrEqual(
          1000,
        );
        // The album name (right-aligned, top) stays in the right half, over the rings' top only at its edge.
        if (b.end === "end" && b.text.startsWith("W"))
          expect(b.x0, `${path}: the album name reaches the left half`).toBeGreaterThanOrEqual(380);
      }
      // The full names are still said.
      await expect(
        page.getByRole("img", { name: new RegExp(`^Cover of ${LONG_TRACK.slice(0, 30)}`) }).first(),
      ).toBeAttached();
      await page.screenshot({
        path: `${SHOTS}/w3f-album${path === "/album" ? "" : "-track"}-${theme}-${w}.png`,
      });
    }
  }
});

test("two tracks in two keys: each staff of the grand staff draws its own signature", async ({ page }) => {
  test.setTimeout(150_000);
  await seed(page, "after U03.L02");
  const code = [
    "setcpm(90/4)",
    "",
    'mel: n("<[0 2 4 7] [7 4 2 0]>").scale("C4:major").s("piano")',
    'bass: n("<[0 2 4 0] [0 4]>").scale("<Gb2:major Db2:major>").s("gm_acoustic_bass")',
    "",
  ].join("\n");
  for (const [theme, w, h] of [
    ["paper", 1440, 900],
    ["bark", 1280, 800],
  ] as const) {
    await useUiPrefs(page, { theme, motion: "off" });
    await page.setViewportSize({ width: w, height: h });
    const id = await createSketch(page, `Two keys ${theme}`, code);
    await page.goto(`/studio/${id}`);
    await expect(page.locator(WB)).toHaveAttribute("data-analysis", "ready", { timeout: 60_000 });
    await page.getByRole("combobox", { name: "Length" }).selectOption("2");
    const staffTab = page.getByRole("tab", { name: "Staff" });
    if (await staffTab.isVisible()) await staffTab.click();
    await expect(page.locator(STAFF)).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
    await expect(page.getByTestId("staff-own-keys")).toHaveText("bass staff in G♭ major → D♭ major");
    // Signatures as drawn: per voice (abcjs-v0 treble, abcjs-v1 bass), in order along the staff.
    const sigs = await page.evaluate(() =>
      [...document.querySelectorAll(".oak-staff-host svg g.abcjs-key-signature")].map((g) => {
        const v = [...g.classList].find((c) => /^abcjs-v\d$/.test(c));
        const names = [...g.querySelectorAll("path")].map((p) => p.getAttribute("data-name"));
        return {
          v,
          x: g.getBoundingClientRect().x,
          sharps: names.filter((n) => n === "accidentals.sharp").length,
          flats: names.filter((n) => n === "accidentals.flat").length,
        };
      }),
    );
    const bass = sigs.filter((s) => s.v === "abcjs-v1").sort((a, b) => a.x - b.x);
    const treble = sigs.filter((s) => s.v === "abcjs-v0");
    expect(bass[0], JSON.stringify(sigs)).toMatchObject({ flats: 6, sharps: 0 });
    // D-flat major from bar 2 (the change also cancels G-flat's C-flat with a natural).
    expect(bass.some((s) => s.flats === 5)).toBe(true);
    for (const t of treble) expect(t.flats + t.sharps, JSON.stringify(sigs)).toBe(0);
    // The bass notes are named in their own key.
    const said = await page
      .locator(".oak-staff-host [data-oak-events]")
      .evaluateAll((els) => els.map((e) => (e.getAttribute("aria-label") ?? "").split(",")[0]));
    expect(said).toEqual(expect.arrayContaining(["Gb2", "Bb2", "Db3", "Db2", "Ab2"]));
    await page.locator(STAFF).screenshot({ path: `${SHOTS}/w3f-two-keys-${theme}-${w}.png` });
  }
});
