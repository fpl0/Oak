// The Wave 5 studio review as the learner (review:studio), on the real stack from seeds:
// - C3 written the way a beginner names things (`verseDrums`, a verse tune reused in the chorus): the form strip and
//   the checklist say what to write instead of "no difference yet" or a length read from one loop; renamed, the
//   form reads A B A B and every row reads again;
// - ladder L6 and X2: the pattern source's hidden code reaches neither the DOM, storage, the console, the network
//   nor the tutor, while the learner listens to the bass alone, checks a wrong bass and asks for a review;
// - A/B at 0.75× with a swung pattern: the code's bar lines stay within the drift gate of the recording over 8 bars,
//   and its off-beats sound at two thirds of the beat;
// - a three-minute recording on the album plays to its end and downloads whole.
import { expect, type Page, test } from "@playwright/test";
import carelessLove from "../../../../content/repertoire/careless-love/song.ts";
import frankie from "../../../../content/repertoire/frankie-and-johnny/song.ts";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { shoot, useUiPrefs } from "../../../../e2e/support/ui.ts";
import { burstOnsets } from "../../../../packages/audio/e2e/onsets.ts";
import { AB_DRIFT_GATE_BARS, AB_DRIFT_GATE_MS } from "../../../../packages/audio/src/stretch.ts";
import { NAMING } from "../../capstone/review-w5-pieces.ts";
import { makeBarBurstWav } from "../../transcribe/e2e/wav.ts";
import { stack } from "./playwright.config.ts";
import { api, blockHmr, ownProject, seed, startCapture, stopCapture, watchErrors, wavOf } from "./support.ts";

const SHOTS = new URL("./screenshots", import.meta.url).pathname;

test.beforeEach(async ({ page }) => {
  await blockHmr(page);
});

async function shots(page: Page, name: string) {
  for (const m of SCREENSHOT_MATRIX) {
    await page.setViewportSize({ width: m.width, height: m.height });
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, m.theme);
    await page.waitForTimeout(200);
    await shoot(page, SHOTS, name, m.theme);
  }
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "paper";
  });
  await page.setViewportSize({ width: 1440, height: 900 });
}

// --- C3: section names ------------------------------------------------------------------------------------

/** The hint as the page shows it: its `code` runs are elements, so the text has no backticks. */
const shown = (re: RegExp) => new RegExp(re.source.replace(/`/g, ""));

const capEditor = (cap: string) => `oak_capstone-${cap}_0_`;
async function setCapstoneCode(page: Page, cap: string, code: string) {
  await page.waitForFunction(
    (id) =>
      !!(globalThis as { __oakStrudel?: { editors: Map<string, unknown> } }).__oakStrudel?.editors.get(id),
    capEditor(cap),
    { timeout: 60_000 },
  );
  await page.evaluate(
    ([id, c]) =>
      (
        globalThis as unknown as { __oakStrudel: { editors: Map<string, { setCode(c: string): void }> } }
      ).__oakStrudel.editors
        .get(id as string)
        ?.setCode(c as string),
    [capEditor(cap), code],
  );
}

test("C3 with a beginner's section names: the strip and the checklist say what to write; renamed, it reads", async ({
  page,
}) => {
  test.setTimeout(200_000);
  const errors = watchErrors(page);
  await seed(page, "C3.S2 done");
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await page.goto("/capstone/C3");
  await expect(page.getByTestId("capstone-workspace")).toBeVisible({ timeout: 60_000 });
  const strip = page.getByTestId("form-strip");
  const row = (id: string) => page.locator(`[data-rule="${id}"]`);

  // The section first (`verseDrums`): every part reads a section named after its role, so the parts disagree.
  const sectionFirst = NAMING.find((n) => n.name.startsWith("the section first")) as (typeof NAMING)[number];
  await setCapstoneCode(page, "C3", sectionFirst.code);
  await expect(strip.getByTestId("form-hint")).toHaveText(shown(sectionFirst.hint), { timeout: 60_000 });
  await expect(strip).toContainText("The arranged parts disagree");
  await expect(row("form")).toHaveAttribute("data-state", "open");
  await expect(row("form").getByTestId("row-note")).toHaveText(shown(sectionFirst.hint));
  // The contrast row does not count axes on sections it cannot read, and the length is not read from one loop.
  await expect(row("contrast").getByTestId("contrast-axes")).toHaveCount(0);
  await expect(row("contrast")).not.toContainText("No difference yet");
  // The length is read from the arranged total even while a name disagrees (the parts agree on every section's
  // bars; wave 5 gate, `arrangedTotal`): the 48-bar song is long enough, never "one loop" long.
  await expect(row("duration")).toHaveAttribute("data-state", "met", { timeout: 15_000 });
  await expect(row("duration").getByTestId("row-unread")).toHaveCount(0);
  // The Workbench counts the song's 48 bars, not one track's 24-bar loop.
  await expect(page.getByText(/^Bars 1–16 of 48$/).first()).toBeVisible();
  await shots(page, "w5-c3-naming-section-first");

  // The verse's tune reused in the chorus: the hint names the one line to add.
  const reuse = NAMING.find((n) => n.name.startsWith("the verse's tune")) as (typeof NAMING)[number];
  await setCapstoneCode(page, "C3", reuse.code);
  await expect(strip.getByTestId("form-hint")).toHaveText(shown(reuse.hint), { timeout: 60_000 });
  await expect(strip.getByTestId("form-hint").locator("code").last()).toHaveText(
    "const melChorus = melVerse",
  );

  // Shortened names: the parts agree on "v" and "c", the brief asks for a verse and a chorus.
  const short = NAMING.find((n) => n.name.startsWith("shortened")) as (typeof NAMING)[number];
  await setCapstoneCode(page, "C3", short.code);
  await expect(strip.getByTestId("form-letters")).toHaveText("A B A B", { timeout: 60_000 });
  await expect(strip.getByTestId("form-hint")).toHaveText(shown(short.hint));
  await expect(row("form").getByTestId("row-note")).toHaveText(shown(short.hint));
  // The contrast rule finds no chorus by that name: no "no difference yet" over unlit axes.
  await expect(row("contrast").getByTestId("contrast-axes")).toHaveCount(0);
  await expect(row("contrast")).not.toContainText("No difference yet");
  await shots(page, "w5-c3-naming-short");

  // Spelled out, as the hint says: the form reads, the hint is gone, the length reads from the code again.
  await setCapstoneCode(
    page,
    "C3",
    short.code.replace(/\b(chords|bass|mel)V\b/g, "$1Verse").replace(/\b(chords|bass|mel)C\b/g, "$1Chorus"),
  );
  await expect(row("form")).toHaveAttribute("data-state", "met", { timeout: 60_000 });
  await expect(strip.getByTestId("form-hint")).toHaveCount(0);
  await expect(row("duration").getByTestId("duration-read")).toContainText("of at least 1:30");
  await expect(row("contrast")).toHaveAttribute("data-state", "met");
  // The hint's code is reachable by keyboard: the section blocks still loop with Enter.
  await strip.locator('[data-section="chorus"]').first().focus();
  await page.keyboard.press("Enter");
  await expect(strip.locator('[data-section="chorus"]').first()).toHaveAttribute("aria-pressed", "true", {
    timeout: 30_000,
  });
  expect(errors).toEqual([]);
});

// --- L6 and X2: the pattern source never leaks --------------------------------------------------------------

/** The answer key's own strings (≥ 10 characters inside quotes): none may reach the learner's side. */
function answerFragments(song: { answerKey: { code: string; layers: Record<string, string | undefined> } }) {
  const layers = Object.values(song.answerKey.layers).filter((x): x is string => typeof x === "string");
  return [...layers, song.answerKey.code].flatMap((l) =>
    [...l.matchAll(/"([^"\n]{10,})"/g)].map((m) => m[1] as string),
  );
}

function watchBodies(page: Page) {
  const bodies: { url: string; req: string; res: string }[] = [];
  page.on("requestfinished", async (r) => {
    let res = "";
    try {
      res = (await (await r.response())?.text()) ?? "";
    } catch {
      // a body that is gone (a redirect, a stream)
    }
    bodies.push({ url: r.url(), req: r.postData() ?? "", res });
  });
  const logs: string[] = [];
  page.on("console", (m) => logs.push(m.text()));
  return { bodies, logs };
}

async function expectNoLeak(page: Page, w: ReturnType<typeof watchBodies>, fragments: readonly string[]) {
  const html = await page.content();
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  for (const f of fragments) {
    expect(html.includes(f), `DOM holds ${f}`).toBe(false);
    expect(storage.includes(f), `storage holds ${f}`).toBe(false);
    expect(
      w.logs.some((l) => l.includes(f)),
      `console holds ${f}`,
    ).toBe(false);
    for (const b of w.bodies) {
      expect(b.req.includes(f), `request to ${b.url} holds ${f}`).toBe(false);
      expect(b.res.includes(f), `response of ${b.url} holds ${f}`).toBe(false);
    }
  }
  expect(html.includes("ref_"), "DOM names a reference track").toBe(false);
  for (const b of w.bodies.filter((x) => /\/api\/tutor\//.test(x.url)))
    expect(b.req, "a tutor request names a reference track").not.toContain("ref_");
}

test("L6 and X2: the hidden code reaches neither the DOM, storage, the console, the network nor the tutor", async ({
  page,
}) => {
  test.setTimeout(220_000);
  const w = watchBodies(page);
  await seed(page, "ladder L6");
  await useUiPrefs(page, { theme: "bark", motion: "off" });
  // A fresh L6 song (the seeded one holds the learner's passing code): Frankie and Johnny, from the start.
  const next = await api<{ itemId: string }>(page, "POST", "/ladder/items", {
    sessionId: null,
    gymId: null,
    level: 6,
    songId: frankie.id,
  });
  expect(next.status, JSON.stringify(next.body)).toBe(200);
  const fragments = answerFragments(frankie);
  expect(fragments.length).toBeGreaterThanOrEqual(3);
  await page.goto(`/transcribe/${next.body.itemId}`);
  await expect(page.getByTestId("transport-play")).toBeEnabled({ timeout: 60_000 });
  await expect(page.getByTestId("check")).toHaveText("Check the bass");
  const root = page.getByTestId("transcribe-project");
  await root.focus();
  // Listen to everything, then to the bass alone, then without the melody; A/B to mine and back.
  await page.keyboard.press("Space");
  await page.waitForTimeout(1500);
  await page.keyboard.press("Shift+B");
  await page.waitForTimeout(800);
  await page.keyboard.press("Shift+M");
  await page.waitForTimeout(800);
  await page.keyboard.press("o");
  await page.waitForTimeout(400);
  await page.keyboard.press("v");
  await page.waitForTimeout(400);
  await page.keyboard.press("Space");
  // The starter's bass checked: not yet, with its bars.
  await page.getByTestId("check").click();
  await expect(page.getByTestId("verdict")).toHaveText(/^The bass: not yet/, { timeout: 60_000 });
  // Ask the tutor.
  const review = page.getByTestId("request-transcription-review");
  if ((await review.count()) > 0) {
    await review.click();
    await expect
      .poll(() => w.bodies.some((b) => /\/api\/tutor\//.test(b.url)), { timeout: 30_000 })
      .toBe(true);
  }
  await expectNoLeak(page, w, fragments);

  // X2 on Careless Love: the capstone's song source plays its hidden reference the same way.
  await seed(page, "X2 open");
  const x2 = watchBodies(page);
  await page.goto("/capstone/X2");
  await expect(page.getByRole("heading", { level: 1, name: "X2 Blues Transcription" })).toBeVisible({
    timeout: 60_000,
  });
  await page
    .getByRole("radiogroup", { name: "The song" })
    .getByRole("radio", { name: carelessLove.title })
    .click();
  await page.getByRole("button", { name: /^Start session 1 of 2$/ }).click();
  const source = page.getByTestId("song-source");
  await expect(source).toBeVisible({ timeout: 60_000 });
  const play = source.getByTestId("transport-play");
  await expect(play).toBeEnabled({ timeout: 60_000 });
  await play.click();
  await page.waitForTimeout(1500);
  await play.click();
  // What the learner's own X2 draft holds is theirs (a seeded draft may hold transcribed lines).
  const state = JSON.stringify((await api(page, "GET", "/capstones/X2")).body ?? {});
  const x2Fragments = answerFragments(carelessLove).filter((f) => !state.includes(f));
  expect(x2Fragments.length).toBeGreaterThan(0);
  await expectNoLeak(page, x2, x2Fragments);
});

// --- A/B with a swung pattern ---------------------------------------------------------------------------------

const BPM = 160; // a bar is 1.5 s, 2 s at 0.75×
const LEAD = 0.5;
const RATE = 0.75;
/**
 * Swung eighths of a high blip, the bar line and its off-beat (the onset detector needs 150 ms of quiet between
 * blips, so the other six eighths rest): the bar line meets the recording, the off-beat sits at 2/3 of the beat.
 */
const SWUNG = `setcpm(${BPM}/4)\n\nblip: note("e7 e7 ~ ~ ~ ~ ~ ~").swingBy(1/3, 4).s("sine").attack(0).decay(0.03).sustain(0).gain(0.9)\n`;

test(`A/B at ${RATE}× with a swung pattern: < ${AB_DRIFT_GATE_MS} ms over ${AB_DRIFT_GATE_BARS} bars, off-beats at 2/3`, async ({
  page,
}) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await seed(page, "own-audio project");
  const id = await ownProject(page, makeBarBurstWav({ bpm: BPM, bars: 14, leadInSec: LEAD }), {
    bpm: BPM,
    downbeatS: LEAD,
    code: SWUNG,
    settings: { rate: RATE },
  });
  await page.goto(`/transcribe/${id}`);
  await expect(page.getByTestId("transport-play")).toBeEnabled({ timeout: 60_000 });
  await page.getByTestId("transcribe-project").focus();
  // A/B a few times while it plays, then both heard.
  await page.keyboard.press("Space");
  await expect(page.getByTestId("transport-play")).toHaveAccessibleName(/Pause/);
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("v");
    await page.waitForTimeout(40);
  }
  await page.keyboard.press("Space");
  await page.keyboard.press("o");
  await expect(page.getByRole("radio", { name: "Both" })).toHaveAttribute("aria-checked", "true");
  await startCapture(page, true);
  await page.keyboard.press("Space");
  const barS = (60 / BPM) * 4 * (1 / RATE);
  await page.waitForTimeout((AB_DRIFT_GATE_BARS + 1.5) * barS * 1000);
  const c = await stopCapture(page);
  await page.keyboard.press("Space");
  const src = burstOnsets(c.a, c.sr);
  const mine = burstOnsets(c.b, c.sr);
  // The code's blip nearest each bar line of the recording (within a third of a beat: the swung off-beat before
  // the bar line is a third of a beat away and is not a bar line).
  const beatS = barS / 4;
  const drift = src.flatMap((s) => {
    const near = mine.filter((m) => Math.abs(m - s) < beatS / 4);
    return near.length ? [(near[0] as number) - s] : [];
  });
  console.log(
    `[review] swung A/B drift at ${RATE}×: ${JSON.stringify(drift.map((d) => Math.round(d * 10000) / 10))}`,
  );
  expect(drift.length).toBeGreaterThanOrEqual(AB_DRIFT_GATE_BARS);
  for (const d of drift.slice(0, AB_DRIFT_GATE_BARS + 1))
    expect(Math.abs(d * 1000)).toBeLessThan(AB_DRIFT_GATE_MS);
  // The swing is played: inside a beat, the off-beat blip sits at 2/3 of the beat (±12 ms), not half way.
  const offs: number[] = [];
  for (let i = 0; i + 1 < mine.length; i++) {
    const gap = (mine[i + 1] as number) - (mine[i] as number);
    if (gap > beatS * 0.55 && gap < beatS * 0.8) offs.push(gap / beatS);
  }
  console.log(
    `[review] swung on-beat → off-beat gaps (beats): ${offs
      .slice(0, 8)
      .map((x) => x.toFixed(3))
      .join(" ")}`,
  );
  expect(offs.length).toBeGreaterThanOrEqual(AB_DRIFT_GATE_BARS - 1);
  for (const o of offs) expect(Math.abs(o - 2 / 3) * beatS * 1000).toBeLessThan(12);
  expect(errors).toEqual([]);
});

// --- the album: a three-minute recording -------------------------------------------------------------------

test("a three-minute recording on the album plays to its end and downloads whole", async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await seed(page, "C2 released");
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  const s = await api<{ sketch: { id: string } }>(page, "POST", "/sketches", {
    title: "Long Road",
    originKind: "free",
    originId: null,
    sessionId: null,
    code: 'setcpm(70/4)\nchords: chord("<C Am F G>").voicing().s("piano")\nmel: n("<0 2 4 2>").scale("C4:major").s("piano")',
    bpm: null,
    meter: "4/4",
    key: null,
    analysis: null,
    note: null,
    tutorAssisted: false,
    band: null,
    flags: { lockedTools: [], previewTools: [] },
    ranOk: true,
  });
  expect(s.status, JSON.stringify(s.body)).toBe(200);
  const t = await api<{ id: string }>(page, "POST", "/album/tracks", {
    capstoneId: null,
    side: "Bside",
    title: "Long Road",
    flavour: "flavour.pop",
    sketchId: s.body.sketch.id,
    sketchVersion: 1,
    linerNotesMd: "Three minutes on four chords.",
    theoryTags: [],
    attribution: null,
  });
  expect(t.status, JSON.stringify(t.body)).toBe(200);
  // 180 s of a quiet 220 Hz tone with a beep in its last two seconds, mono 22.05 kHz.
  const sr = 22050;
  const x = new Float32Array(180 * sr);
  for (let i = 0; i < x.length; i++)
    x[i] = (i > 178 * sr ? 0.5 : 0.2) * Math.sin((2 * Math.PI * (i > 178 * sr ? 880 : 220) * i) / sr);
  const wav = wavOf(x, sr);
  const up = await page.request.fetch(
    `${stack.apiURL}/api/album/tracks/${t.body.id}/versions/1/audio?durationS=180`,
    {
      method: "PUT",
      headers: { origin: stack.baseURL, "x-oak": "1", "content-type": "audio/wav" },
      data: wav,
      timeout: 120_000,
    },
  );
  expect(up.status(), await up.text()).toBe(200);

  await page.goto(`/album/${t.body.id}`);
  await expect(page.getByRole("heading", { level: 1, name: "Long Road" })).toBeVisible({ timeout: 60_000 });
  const audio = page.getByTestId("track-audio");
  await expect(audio).toBeVisible();
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.duration), { timeout: 30_000 })
    .toBeGreaterThan(179);
  // Its last seconds play: seek near the end and hear it run.
  await audio.evaluate((a: HTMLAudioElement) => {
    a.currentTime = 176;
    return a.play().catch(() => undefined);
  });
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime), { timeout: 15_000 })
    .toBeGreaterThan(176.5);
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.ended || a.currentTime > 179.5), {
      timeout: 15_000,
    })
    .toBe(true);
  // The download is the whole file.
  const link = page.getByTestId("download-audio");
  await expect(link).toHaveAttribute("download", /^long-road-v1\.\w+$/);
  const href = (await link.getAttribute("href")) as string;
  const bytes = await page.evaluate(async (u) => (await (await fetch(u)).arrayBuffer()).byteLength, href);
  expect(bytes).toBe(wav.length);
  await shots(page, "w5-album-three-minutes");
  expect(errors).toEqual([]);
});
