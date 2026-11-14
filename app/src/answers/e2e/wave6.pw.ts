// The Wave 6 answer widgets, by keyboard (ux §7.9, §7.10): rhythm II on the staff (a dot, a tie over the bar line,
// triplets, 6/8, a rhythm on one line), grids of 6 and 24 steps, a real tap take in 6/8, the seventh chords (the
// quality pad, forgiving names, the keyboard, the guide-tone pick, compound intervals), numerals with sevenths,
// "V7 of …", borrowed chords, a mode's own chords and a pivot chord in two keys, the mode pick and the scale that
// starts from a scale, the chromatic degree pad, where a key changes on a bar timeline, and the form map. Then
// reduced motion and the lenses off. Every test opens one gallery example and checks it right.
import { expect, type Locator, type Page, test } from "@playwright/test";
import { useUiPrefs } from "../../../../e2e/support/ui.ts";
import { collectErrors, openGallery } from "./fixtures.ts";

const live = (page: Page, id: string): Locator => page.locator(`[data-live="${id}"]`);
const status = (page: Page, id: string): Locator => live(page, id).getByTestId("answer-status").first();
const typed = (page: Page, id: string): Locator => live(page, id).locator("input[id$='-typed']");
const press = async (page: Page, keys: readonly string[]) => {
  for (const k of keys) await page.keyboard.press(k);
};
const staff = async (page: Page, id: string): Promise<Locator> => {
  const w = live(page, id);
  await expect(w.locator("[data-status='ready']")).toBeVisible();
  await w.getByTestId("staff-surface").focus();
  return w;
};

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = collectErrors(page);
  await useUiPrefs(page, { theme: "paper" });
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

test("staff: a dotted quarter, then a tie over the bar line by T, untied and tied again", async ({
  page,
}) => {
  await openGallery(page, "?only=staff-rhythm&state=idle,revealed");
  const w = await staff(page, "staff-rhythm");
  const say = w.getByTestId("staff-say");
  await expect(w.getByTestId("staff-length")).toHaveText("Next note: quarter");
  // Down to E4, a dotted quarter, an eighth, two quarters; then (wrongly) a new A in bar 2.
  await press(page, ["ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown", ".", "e"]);
  await expect(say).toHaveText("E4, dotted quarter, bar 1 beat 1");
  await press(page, ["3", "f"]);
  await expect(say).toHaveText("F4, eighth, bar 1 the and of beat 2");
  await press(page, ["4", "g", "a", "a", "g", "5", "e"]);
  await expect(typed(page, "staff-rhythm")).toHaveValue("E4:4. F4:8 G4:4 A4:4 | A4:4 G4:4 E4:2");
  await page.keyboard.press("Enter");
  await expect(status(page, "staff-rhythm")).toHaveText(
    "The A at the end of bar 1 is held into bar 2: one note, tied over the bar line.",
  );
  await expect(w.getByTestId("staff-reveal")).toContainText(
    "check its pitch, where it starts and how long it is",
  );
  // Back to the A on beat 4 and tie it to the A after it.
  await page.keyboard.press("Home");
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
  await expect(say).toHaveText("On A4, quarter, bar 1 beat 4");
  const tie = w.locator('[data-rhythm-tool="tie"]');
  await expect(tie).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("t");
  await expect(say).toHaveText("Tied: one note, held across.");
  await expect(typed(page, "staff-rhythm")).toHaveValue("E4:4. F4:8 G4:4 A4:4~ | A4:4 G4:4 E4:2");
  await expect(tie).toHaveAttribute("aria-pressed", "true");
  const notes = w.getByRole("list", { name: "Your notes" });
  await expect(notes.getByRole("listitem")).toHaveCount(6);
  await expect(notes.getByRole("listitem").nth(3)).toHaveText("A4, quarter, tied on, bar 1 beat 4");
  // T again unties; the Tie button ties it back.
  await page.keyboard.press("t");
  await expect(say).toHaveText("Tie removed: two notes again.");
  await expect(notes.getByRole("listitem")).toHaveCount(7);
  await tie.click();
  await expect(tie).toHaveAttribute("aria-pressed", "true");
  await expect(w.getByTestId("staff-surface")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(status(page, "staff-rhythm")).toHaveText("That's it.");
  // A revealed rhythm is spelled value by value, the tie and the bar line included.
  const revealed = page.locator('[data-fixture="staff-rhythm"] [data-state="revealed"]');
  await expect(revealed.getByTestId("staff-reveal-rhythm")).toBeVisible();
  await expect(revealed.getByTestId("staff-reveal")).toContainText(
    "E4 dotted quarter, F4 eighth, G4 quarter, A4 quarter tied on, bar line, A4 quarter, G4 quarter, E4 half",
  );
});

test("staff: triplets one value at a time with ; and a rhythm on one line with N", async ({ page }) => {
  await openGallery(page, "?only=staff-triplets&state=idle");
  const w = await staff(page, "staff-triplets");
  const say = w.getByTestId("staff-say");
  const triplet = w.locator('[data-rhythm-tool="triplet"]');
  await press(page, ["ArrowUp", ";"]);
  await expect(triplet).toHaveAttribute("aria-pressed", "true");
  await expect(w.getByTestId("staff-length")).toHaveText("Next note: eighth-note triplet, three to a beat");
  // The first letter writes the whole bracket; the next two change its second and third notes.
  await page.keyboard.press("c");
  await expect(typed(page, "staff-triplets")).toHaveValue("C5:8t C5:8t C5:8t r:4 r:2");
  await expect(say).toHaveText(/^A triplet from bar 1 beat 1: three eighth-note triplet notes on C5\./);
  await press(page, ["d", "e"]);
  await expect(typed(page, "staff-triplets")).toHaveValue("C5:8t D5:8t E5:8t r:4 r:2");
  await page.keyboard.press("ArrowLeft");
  await expect(say).toHaveText("On E5, eighth-note triplet, bar 1 beat 1, third of three");
  await page.keyboard.press("ArrowRight");
  // Back to plain values (the Triplet button this time), then three quarters.
  await triplet.click();
  await expect(triplet).toHaveAttribute("aria-pressed", "false");
  await press(page, ["4", "g", "e", "c"]);
  await expect(typed(page, "staff-triplets")).toHaveValue("C5:8t D5:8t E5:8t G5:4 E5:4 C5:4");
  await page.keyboard.press("Enter");
  await expect(status(page, "staff-triplets")).toHaveText("That's it.");

  await openGallery(page, "?only=staff-rhythm-line&state=idle");
  const r = await staff(page, "staff-rhythm-line");
  // A dotted quarter, an eighth, a triplet (N three times), a quarter: all on the middle line.
  await press(page, [".", "n", "3", "n", ";", "n", "n", "n", ";", "4", "n"]);
  await expect(typed(page, "staff-rhythm-line")).toHaveValue("B4:4. B4:8 B4:8t B4:8t B4:8t B4:4");
  await page.keyboard.press("ArrowUp");
  await expect(r.getByTestId("staff-say")).toHaveText(
    "This answer is about the rhythm: every note sits on the same line.",
  );
  await page.keyboard.press("Enter");
  await expect(status(page, "staff-rhythm-line")).toHaveText("That's it.");
});

test("6/8: the staff counts the dotted quarter; the grid is 1 la li; 24 steps count trip let", async ({
  page,
}) => {
  await openGallery(page, "?only=staff-68&state=idle");
  const w = await staff(page, "staff-68");
  await press(page, ["ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown", ".", "e", "3", "e", "f", "g"]);
  await press(page, ["4", ".", "a", "g"]);
  await expect(w.getByTestId("staff-say")).toHaveText("G4, dotted quarter, bar 2 beat 2");
  await expect(typed(page, "staff-68")).toHaveValue("E4:4. E4:8 F4:8 G4:8 | A4:4. G4:4.");
  const notes = w.getByRole("list", { name: "Your notes" });
  await expect(notes.getByRole("listitem").nth(2)).toHaveText("F4, eighth, bar 1 beat 2, second of three");
  await page.keyboard.press("Enter");
  await expect(status(page, "staff-68")).toHaveText("That's it.");

  await openGallery(page, "?only=grid-68&state=idle");
  const g = live(page, "grid-68");
  await expect(g.locator("thead th span[aria-hidden]")).toHaveText([
    "1",
    "la",
    "li",
    "2",
    "la",
    "li",
    "1",
    "la",
    "li",
    "2",
    "la",
    "li",
  ]);
  await expect(g.locator('[data-cell="0:1"]')).toHaveAccessibleName("Hit at la of beat 1, bar 1");
  await expect(g.locator('[data-cell="0:9"]')).toHaveAccessibleName("Hit at 2 of beat 2, bar 2");
  await g.locator('[data-cell="0:0"]').focus();
  // Hits on 1 and 2 of both bars, and the eighth before the last bar line.
  await press(page, ["x", "ArrowRight", "ArrowRight", "ArrowRight", "x"]);
  await press(page, [
    "ArrowRight",
    "ArrowRight",
    "ArrowRight",
    "x",
    "ArrowRight",
    "ArrowRight",
    "ArrowRight",
    "x",
  ]);
  await press(page, ["ArrowRight", "ArrowRight", "x", "Enter"]);
  await expect(status(page, "grid-68")).toHaveText("That's it.");

  await openGallery(page, "?only=grid-24&state=idle");
  const t = live(page, "grid-24");
  await expect(t.locator("[data-cell]")).toHaveCount(24);
  await expect(t.locator('[data-cell="0:1"]')).toHaveAccessibleName("Hit at trip of beat 1, bar 1");
  await expect(t.locator('[data-cell="0:3"]')).toHaveAccessibleName("Hit at & of beat 1, bar 1");
});

test("pointer: a click writes a triplet, a drag between two noteheads ties them; Swing 8ths over the staff", async ({
  page,
}) => {
  await openGallery(page, "?only=staff-triplets&state=idle");
  const w = await staff(page, "staff-triplets");
  await w.locator('[data-rhythm-tool="triplet"]').click();
  // The top space of the treble staff (E5), at the start of bar 1.
  const box = await w.evaluate((root) => {
    const lines = (root.querySelector("g.abcjs-staff") as Element).getBoundingClientRect();
    const extras = [...root.querySelectorAll(".abcjs-staff-extra")].map(
      (e) => e.getBoundingClientRect().right,
    );
    return { top: lines.top, sp: lines.height / 4, x0: Math.max(...extras) };
  });
  await page.mouse.click(box.x0 + 14, box.top + box.sp / 2);
  await expect(typed(page, "staff-triplets")).toHaveValue("E5:8t E5:8t E5:8t r:4 r:2");
  // A click on the second note selects it; a letter changes that value only.
  const second = await w.locator(".abcjs-notehead").nth(1).boundingBox();
  if (!second) throw new Error("no second notehead");
  await page.mouse.click(second.x + second.width / 2, second.y + second.height / 2);
  await expect(w.getByTestId("staff-say")).toHaveText(
    "Selected E5, eighth-note triplet, bar 1 beat 1, second of three",
  );
  await page.keyboard.press("g");
  await expect(typed(page, "staff-triplets")).toHaveValue("E5:8t G5:8t E5:8t r:4 r:2");

  await openGallery(page, "?only=staff-rhythm&state=idle");
  const r = await staff(page, "staff-rhythm");
  // Two A4 quarters on beats 3 and 4 of bar 1 and one on beat 1 of bar 2; drag from the second to the third.
  await press(page, ["ArrowDown", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "a", "a", "a"]);
  await expect(typed(page, "staff-rhythm")).toHaveValue("r:2 A4:4 A4:4 | A4:4 r:4 r:2");
  const heads = r.locator(".abcjs-notehead");
  await expect(heads).toHaveCount(3);
  const from = await heads.nth(1).boundingBox();
  const to = await heads.nth(2).boundingBox();
  if (!from || !to) throw new Error("noteheads missing");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(typed(page, "staff-rhythm")).toHaveValue("r:2 A4:4 A4:4~ | A4:4 r:4 r:2");
  await expect(r.getByTestId("staff-say")).toHaveText("Tied: one note, held across.");

  // A swung answer is written straight under "Swing 8ths", set as a quiet note about the feel.
  await openGallery(page, "?only=staff-swing&state=idle");
  const sw = await staff(page, "staff-swing");
  const swing = sw.locator(".oak-si-host").getByText("Swing 8ths");
  await expect(swing).toBeVisible();
  expect(await swing.evaluate((el) => getComputedStyle(el).fontSize)).toBe("13px");
});

/** Waits for the take to start, then taps Space at each target (in bars from bar 1). */
async function tapTake(page: Page, id: string, onsets: readonly number[], barSec: number): Promise<void> {
  const pad = page.locator(`[data-live="${id}"] [data-start-at]`);
  await expect(pad).toHaveAttribute("data-start-at", /\d/, { timeout: 30_000 });
  await page.evaluate(
    async ({ id, onsets, barSec }) => {
      const host = document.querySelector<HTMLElement>(`[data-live="${id}"] [data-start-at]`);
      const surface = host?.querySelector<HTMLElement>("[data-tap-surface]");
      const ctx = (globalThis as unknown as { __oakStrudel?: { ctx: AudioContext } }).__oakStrudel?.ctx;
      if (!host || !surface || !ctx) throw new Error("tap pad or audio context missing");
      const startAt = Number(host.dataset.startAt);
      // The performance time at which the output clock reads `t`, from a FRESH timestamp pair each time it is
      // asked (as the tap input maps a tap): a pair taken once, just after the context started, can lag by a
      // tenth of a second and would move every tap by that much.
      const perfOf = (t: number) => {
        const ts = ctx.getOutputTimestamp();
        const pair =
          (ts.performanceTime ?? 0) > 0
            ? { perf: ts.performanceTime ?? 0, ctx: ts.contextTime ?? 0 }
            : { perf: performance.now(), ctx: ctx.currentTime };
        return pair.perf + (t - pair.ctx) * 1000;
      };
      // One tap after another: sleep towards its time in short steps, then spin for the last milliseconds, so a
      // timer that fires late on a busy machine does not move the tap (the take itself is what is measured).
      for (const bars of [...onsets].sort((x, y) => x - y)) {
        const target = startAt + bars * barSec;
        for (;;) {
          const left = perfOf(target) - performance.now();
          if (left <= 12) break;
          await new Promise<void>((resolve) => setTimeout(resolve, Math.min(left - 12, 50)));
        }
        const at = perfOf(target);
        while (performance.now() < at) {
          /* spin */
        }
        surface.dispatchEvent(
          new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true, cancelable: true }),
        );
      }
    },
    { id, onsets: [...onsets], barSec },
  );
}

test("tap in 6/8: a dotted-quarter count-in, real taps on 1 la li 2; a missed push is named", async ({
  page,
}) => {
  await openGallery(page, "?only=tap-68&state=idle");
  const w = live(page, "tap-68");
  const phase = w.getByTestId("tap-phase");
  await expect(phase).toHaveText("1 bar of 6/8 at 60 BPM (the dotted quarter), after a 1-bar count-in.");
  // The pad draws two beats of three.
  await expect(w.locator("[data-tap-surface]")).toContainText("1lali2lali");
  await w.getByRole("button", { name: "Start tapping" }).focus();
  await page.keyboard.press("Enter");
  await expect(phase).toHaveText(/Count-in|Tap now/, { timeout: 30_000 });
  // One bar of 6/8 at 60 to the dotted quarter lasts two seconds.
  await tapTake(page, "tap-68", [0, 1 / 6, 2 / 6, 0.5], 2);
  await expect(phase).toHaveText("4 taps recorded.", { timeout: 10_000 });
  await page.keyboard.press("Enter");
  await expect(status(page, "tap-68")).toHaveText("That's it.");

  // A stored take that tapped beat 3 on the beat instead of the push before it: the miss is named by its count.
  await openGallery(page, "?only=tap-push&state=wrong");
  const stored = page.locator('[data-fixture="tap-push"] [data-state="wrong"]');
  await expect(stored.getByTestId("answer-status")).toHaveText("2 of 3 hits matched, 1 extra. Missed: 2 &.");
  await expect(stored.locator("[data-tap-surface] span.rotate-45")).toHaveCount(3);
});

test("seventh chords: the quality pad, forgiving names, the keyboard, guide tones, an interval past the octave", async ({
  page,
}) => {
  await openGallery(page, "?only=quality-sevenths&state=idle");
  const q = live(page, "quality-sevenths");
  await expect(q.locator('[data-quality="m7b5"]')).toHaveAccessibleName("4. half-diminished 7th");
  await expect(q.locator('[data-quality="m7b5"]')).toContainText("m7♭5 · ø7");
  await expect(q.locator('[data-quality="dim7"]')).toContainText("°7");
  await q.getByRole("radio").first().focus();
  await press(page, ["4", "Enter"]);
  await expect(status(page, "quality-sevenths")).toHaveText("That's it.");

  await openGallery(page, "?only=text-chord-seventh&state=idle");
  const c = live(page, "text-chord-seventh");
  const reads = c.getByTestId("chord-reads");
  // A step about sevenths shows their row from the start.
  await expect(c.locator('[data-quality="m7b5"]')).toBeVisible();
  const field = c.getByRole("textbox");
  await field.fill("BΔ");
  await expect(reads).toHaveText("Reads as Bmaj7 (B major 7)");
  await field.fill("Bo7");
  await expect(reads).toHaveText("Reads as B°7 (B diminished 7)");
  await field.fill("Bø");
  await expect(reads).toHaveText("Reads as Bm7♭5 (B minor 7 flat 5)");
  await field.press("Enter");
  await expect(status(page, "text-chord-seventh")).toHaveText("That's it.");

  await openGallery(page, "?only=keyboard-seventh&state=idle");
  const k = live(page, "keyboard-seventh");
  for (const m of [53, 57, 60, 64]) await k.locator(`[data-midi="${m}"]`).click();
  await expect(k.getByTestId("chord-name")).toHaveText(". Fmaj7: F major 7th, root position");
  await page.keyboard.press("Enter");
  await expect(status(page, "keyboard-seventh")).toHaveText("That's it.");

  await openGallery(page, "?only=guide-tones&state=idle");
  const g = live(page, "guide-tones");
  await g.locator('[data-midi="62"]').click();
  await g.locator('[data-midi="65"]').click();
  // Nothing is named before the check.
  await expect(g.getByTestId("guide-tones")).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(g.getByTestId("guide-tones")).toHaveText(
    ". D, the 5th of G7: not a guide tone · F, the 7th of G7",
  );
  await g.locator('[data-midi="62"]').click();
  await g.locator('[data-midi="71"]').click();
  await page.keyboard.press("Enter");
  await expect(status(page, "guide-tones")).toHaveText("That's it.");
  await expect(g.getByTestId("guide-tones")).toHaveText(". F, the 7th of G7 · B, the 3rd of G7");

  await openGallery(page, "?only=text-interval-compound&state=idle");
  const i = live(page, "text-interval-compound");
  await i.locator('[data-num="3"]').focus();
  await press(page, ["3", "Shift+M"]);
  await expect(i.locator("p[id$='-reads']")).toHaveText("Reads as M3 (major third)");
  await page.keyboard.press("o");
  await expect(i.locator("[data-octave]")).toHaveAttribute("aria-pressed", "true");
  await expect(i.locator("p[id$='-reads']")).toHaveText("Reads as M10 (major tenth): an octave plus M3");
  await page.keyboard.press("Enter");
  await expect(status(page, "text-interval-compound")).toHaveText("That's it.");
});

test("numerals: sevenths, V7 of V by / and by the picker, borrowed chords, a mode's ♭VII, a pivot in two keys", async ({
  page,
}) => {
  await openGallery(page, "?only=rn-sevenths&state=idle");
  const s = live(page, "rn-sevenths");
  await s.locator("[data-rn]").first().focus();
  await press(page, ["Shift+1", "Shift+6", "Shift+2", "Shift+5"]);
  await expect(s.locator('[data-rn-slot="0"]')).toHaveAccessibleName("Bar 1: I major 7");
  await page.keyboard.press("Enter");
  await expect(status(page, "rn-sevenths")).toHaveText("That's it.");

  await openGallery(page, "?only=rn-applied&state=idle");
  const a = live(page, "rn-applied");
  await a.locator("[data-rn]").first().focus();
  // V7, then "of 5": the chord in the slot becomes V7 of V.
  await press(page, ["1", "Shift+5", "/", "5"]);
  await expect(a.locator('[data-rn-slot="1"]')).toHaveAccessibleName("Bar 2: V 7 of V");
  // The same by the picker: the kind (V7), then what it leans on.
  await page.keyboard.press("Backspace");
  await expect(a.locator('[data-rn-slot="1"]')).toHaveAccessibleName("Bar 2: empty");
  const ofV = a.locator('[data-rn-of="V"]');
  await expect(ofV).toHaveAccessibleName("V 7 of V, D7, key slash then 5");
  await ofV.click();
  await expect(a.locator('[data-rn-slot="1"]')).toHaveAccessibleName("Bar 2: V 7 of V");
  await press(page, ["Shift+5", "1", "Enter"]);
  await expect(status(page, "rn-applied")).toHaveText("That's it.");

  await openGallery(page, "?only=rn-colours&state=idle");
  const c = live(page, "rn-colours");
  await c.locator("[data-rn]").first().focus();
  // G E7 Am Cm | G E♭ F G: I, V7 of ii, ii, iv (IV turned minor), I, ♭VI, ♭VII, I.
  await press(page, ["1", "/", "2", "2", "4", "m", "1", "-", "6", "-", "7", "1"]);
  await expect(c.locator('[data-rn-slot="1"]')).toHaveAccessibleName("Bar 2: V 7 of ii");
  await expect(c.locator('[data-rn-slot="3"]')).toHaveAccessibleName("Bar 4: iv");
  await expect(c.locator('[data-rn-slot="5"]')).toHaveAccessibleName("Bar 6: flat VI");
  await page.keyboard.press("Enter");
  await expect(status(page, "rn-colours")).toHaveText("That's it.");

  await openGallery(page, "?only=rn-mixolydian&state=idle");
  const m = live(page, "rn-mixolydian");
  await expect(m.locator('[data-rn="bVII"]')).toHaveAccessibleName("flat VII, F, key 7");
  await m.locator("[data-rn]").first().focus();
  await press(page, ["1", "7", "4", "Enter"]);
  await expect(status(page, "rn-mixolydian")).toHaveText("That's it.");

  await openGallery(page, "?only=rn-pivot&state=idle");
  const p = live(page, "rn-pivot");
  const key = p.getByTestId("rn-palette-key");
  await expect(key).toHaveText("In C major: pick from the chords of C major.");
  await expect(p.locator('[data-rn="vi"]')).toHaveAccessibleName("vi, Am, key 6");
  await p.locator("[data-rn]").first().focus();
  await page.keyboard.press("6");
  // The second slot is read in G major: the palette follows it, and Am is ii there.
  await expect(key).toHaveText("In G major: pick from the chords of G major.");
  await expect(p.locator('[data-rn="ii"]')).toHaveAccessibleName("ii, Am, key 2");
  await press(page, ["2", "Enter"]);
  await expect(status(page, "rn-pivot")).toHaveText("That's it.");
});

test("modes and chromatic degrees: the one changed note, a scale one note from major, fi and te", async ({
  page,
}) => {
  await openGallery(page, "?only=choice-mode&state=idle");
  const c = live(page, "choice-mode");
  const fact = c.getByTestId("choice-fact");
  await c.getByRole("radio").first().focus();
  await expect(fact).toHaveText("");
  await press(page, ["4", "Enter"]);
  // A wrong pick is told what it is itself, never the answer.
  await expect(fact).toHaveText(
    "Your pick: Dorian is natural minor with one note changed: ♭6 becomes ♮6. From G: E♭ becomes E.",
  );
  await press(page, ["2", "Enter"]);
  await expect(status(page, "choice-mode")).toHaveText("That's it.");
  await expect(fact).toHaveText(
    "Mixolydian is major with one note changed: 7 becomes ♭7. From G: F♯ becomes F.",
  );

  await openGallery(page, "?only=scale-from&state=idle");
  const s = live(page, "scale-from");
  const move = s.getByTestId("scale-move");
  // The builder opens holding G major.
  await expect(s.locator("[data-degree][aria-pressed='true']")).toHaveCount(7);
  await expect(move).toHaveText("This is G major. Move one note to make the new scale.");
  await s.locator('[data-degree="1"]').focus();
  await page.keyboard.press("7");
  await expect(move).toHaveText("7 is out. Put in the note that takes its place, a half step away.");
  await press(page, ["-", "7"]);
  await expect(move).toHaveText("From major: 7 lowered a half step: ♭7.");
  await page.keyboard.press("Enter");
  await expect(status(page, "scale-from")).toHaveText("That's it.");
  await expect(move).toHaveText("From major: 7 lowered a half step: ♭7. That is Mixolydian.");

  await openGallery(page, "?only=degree-chromatic&state=idle");
  const d = live(page, "degree-chromatic");
  await expect(d.locator("[data-pad-layout='chromatic']")).toBeVisible();
  await expect(d.locator('[data-degree="#4"]')).toHaveAccessibleName("sharp 4, fi");
  await expect(d.locator('[data-degree="b7"]')).toHaveAccessibleName("flat 7, te");
  // ♯4 stands above and between 4 and 5.
  const box = async (deg: string) =>
    (await d.locator(`[data-degree="${deg}"]`).boundingBox()) as {
      x: number;
      y: number;
      width: number;
    };
  const [four, fi, five] = [await box("4"), await box("#4"), await box("5")];
  expect(fi.y).toBeLessThan(four.y);
  expect(fi.x).toBeGreaterThan(four.x);
  expect(fi.x).toBeLessThan(five.x);
  await d.locator('[data-degree="1"]').focus();
  await press(page, ["+", "4", "Enter"]);
  await expect(status(page, "degree-chromatic")).toHaveText("That's it.");

  await openGallery(page, "?only=degree-chromatic-seq&state=idle");
  const q = live(page, "degree-chromatic-seq");
  await q.locator('[data-degree="1"]').focus();
  await press(page, ["5", "+", "4", "5", "1", "Enter"]);
  await expect(status(page, "degree-chromatic-seq")).toHaveText("That's it.");
});

test("a key change on the bar timeline, and the pivot chord's two names", async ({ page }) => {
  await openGallery(page, "?only=key-change-bars&state=idle");
  const b = live(page, "key-change-bars");
  const line = b.getByTestId("key-change-line");
  await expect(line).toHaveText("It starts in C major. Where does the new key begin?");
  await b.getByRole("radio").first().focus();
  await page.keyboard.press("4");
  // Before the check the line restates the pick; the new key is not named.
  await expect(line).toHaveText("C major until bar 3, a new key from bar 4.");
  await expect(b.locator("[data-strip-bar][data-new-key]")).toHaveCount(5);
  await expect(b.getByRole("radio", { name: "Bar 4, the new key begins here" })).toBeChecked();
  await page.keyboard.press("Enter");
  await expect(status(page, "key-change-bars")).toHaveText(/^Bar 4 still ends on C's own chords\./);
  await press(page, ["ArrowRight", "Enter"]);
  await expect(status(page, "key-change-bars")).toHaveText("That's it.");
  await expect(line).toHaveText("From bar 5: C major to D major: up a whole step.");
  await expect(b.locator("[data-strip-bar][data-new-key]")).toHaveCount(4);

  // The drill's question (bars and "none") is the same timeline.
  await openGallery(page, "?only=key-change-choice&state=idle");
  const c = live(page, "key-change-choice");
  await expect(c.locator("[data-choice-layout='bars']")).toBeVisible();
  // On the timeline a digit is the bar's own number and 0 is "No key change" (Wave 6 review).
  await expect(c.locator('[data-option="none"]')).toHaveAccessibleName("0. No key change");
  await c.locator('[data-option="none"]').focus();
  await page.keyboard.press("0");
  await expect(c.getByTestId("key-change-line")).toHaveText("C major all the way: no key change.");
  await page.keyboard.press("5");
  await expect(c.locator('[data-option="5"]')).toHaveAccessibleName("5. Bar 5, the new key begins here");
  await page.keyboard.press("Enter");
  await expect(status(page, "key-change-choice")).toHaveText("That's it.");
  await expect(c.getByTestId("key-change-line")).toHaveText(
    "From bar 5: C major to D major: up a whole step.",
  );

  await openGallery(page, "?only=choice-pivot&state=idle");
  const p = live(page, "choice-pivot");
  await p.getByRole("radio").first().focus();
  await press(page, ["2", "Enter"]);
  await expect(p.getByTestId("choice-fact")).toHaveText(
    "Your pick: D7 belongs to G major only: it is its V7.",
  );
  await press(page, ["1", "Enter"]);
  await expect(status(page, "choice-pivot")).toHaveText("That's it.");
  await expect(p.getByTestId("choice-fact")).toHaveText(
    "Am is vi in C major and ii in G major: both keys own it, so it can be the pivot.",
  );
});

test("the form map: cut the strip, join and cut again, name the sections, keyboard only", async ({
  page,
}) => {
  await openGallery(page, "?only=form-map&state=idle,revealed");
  const w = live(page, "form-map");
  const summary = w.getByTestId("form-map-summary");
  const bar = (n: number) => w.locator(`[data-map-bar="${n}"]`);
  await expect(summary).toHaveText("One section of 32 bars so far. Cut it where a new section begins.");
  // The letters offered do not say how many different sections the tune has.
  await expect(w.locator("[data-form-option]")).toHaveCount(4);
  await bar(1).focus();
  for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowRight");
  await expect(bar(9)).toBeFocused();
  await page.keyboard.press("x");
  await expect(summary).toHaveText("2 sections: 8 + 24 bars");
  await expect(bar(9)).toHaveAccessibleName(
    "Bar 9, a section starts here. In bars 9–32, not named. Press to join it to the section before",
  );
  // Down a row to bar 25, cut; back to 17, cut, join, cut again.
  await press(page, ["ArrowDown", "x"]);
  await expect(bar(25)).toBeFocused();
  for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowLeft");
  await press(page, ["x", "x"]);
  await expect(summary).toHaveText("3 sections: 8 + 16 + 8 bars");
  await page.keyboard.press("x");
  await expect(summary).toHaveText("4 sections: 8 + 8 + 8 + 8 bars");
  // Check is not open yet, and says which section has no name (the host's line; here the answer is skipped).
  await press(page, ["Home", "a"]);
  await expect(bar(9)).toBeFocused();
  await press(page, ["a", "b", "a"]);
  await expect(w.getByTestId("form-reads")).toContainText("Reads as A A B A");
  await expect(w.locator('[data-map-section="2"]').first()).toHaveAccessibleName("Bars 17–24: B");
  await page.keyboard.press("Enter");
  await expect(status(page, "form-map")).toHaveText("That's it.");
  // A reveal draws the answer's sections under the learner's, in place.
  const revealed = page.locator('[data-fixture="form-map"] [data-state="revealed"]');
  await expect(revealed.getByText("Answer, bars 9–16:")).toHaveCount(1);
});

test("reduced motion, the lenses off and the checkpoint verb on the new widgets", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const id of ["form-map", "staff-triplets", "key-change-bars", "rn-applied"]) {
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
  // Lenses off: the chromatic pad keeps its two rows and drops the syllables; the applied picker drops its symbols.
  await openGallery(page, "?only=degree-chromatic&state=idle&lenses=off");
  const d = live(page, "degree-chromatic");
  await expect(d.locator("[data-pad-layout='chromatic']")).toBeVisible();
  await expect(d.locator('[data-degree="#4"]')).toHaveAccessibleName("sharp 4");
  await openGallery(page, "?only=rn-applied&state=idle&lenses=off");
  await expect(live(page, "rn-applied").locator('[data-rn-of="V"]')).toHaveAccessibleName(
    "V 7 of V, key slash then 5",
  );
  // A checkpoint saves: the staff's rhythm keys are still listed, and Enter says "save".
  await openGallery(page, "?only=staff-rhythm&state=idle&verb=save");
  await expect(live(page, "staff-rhythm")).toContainText("save");
  await expect(live(page, "staff-rhythm").locator('[data-rhythm-tool="tie"]')).toBeVisible();
});
