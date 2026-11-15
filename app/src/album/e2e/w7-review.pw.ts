// The Wave 7 review of Export, as the learner (review:studio), on a released Band-backed track (AC1 from "AC2 open";
// a seeded release keeps no Band and a whole song is too long for a spec, so the version's code is cut to two bars
// and its stored Band put in place, in the track, the sketch and `album.source` alike):
// - the rendered WAV against a real-time take of the same version: the take is recorded on the track page ("Record
//   another take"), the export rendered offline; both hold the learner's near-silent two bars AND the Band, so both
//   peak far above the learner's part, within a few dB of each other, and are as long as the bars plus a tail.
//   Regression: the track page's live code played no Band, so another take of a Band-backed track lost its bass and
//   chords (peak ≈ .02) while Export kept them;
// - Cancel half-way through the render: nothing is saved, and the next Export runs whole;
// - Export while the take plays: the take keeps playing and the WAV is whole;
// - a piece that never ends: refused before any frame, in a plain sentence, nothing saved.
// Also: the whole record from "whole course complete" (each side numbered in release order, twenty distinct covers,
// Play everything A then B with the breath and never a longer silence, Side B's archive whole), and two near misses
// read in the real workspace (a tune buried under the ride; a clave an 8th late, which the clave lens called "No
// clave in `perc` yet" while perc played). The verdicts of every near miss are bun-tested (review-w7.test.ts).
// The request, the Band built for it (`versionBandOf`, `exportBandOf`), the file name and every failure sentence are
// bun-tested (app/src/capstone/export.test.ts, app/src/album/wave7.test.ts).
import { readFileSync } from "node:fs";
import { expect, type Page, type Route, test } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { JC1_BURIED, RC2_CLAVE_LATE } from "../../capstone/review-w7-pieces.ts";
import { stack } from "./playwright.config.ts";
import { api, blockHmr, watchErrors } from "./support.ts";

// The learner's part is nearly silent (gain .02): a loud take or file can only be the Band playing beside it.
const TWO_BARS = 'setcpm(120/4)\n\nkeys: note("<c5 ~>").s("piano").gain(.02)';
const STORED_BAND = { bandId: "band.axis-4bar", flavour: "flavour.jazz-soul", mutes: ["drums"] };
/** Thirty-two bars of the same: a render long enough (about a minute of audio) to be stopped half-way. */
const LONG = 'setcpm(120/4)\n\nkeys: arrange([32, note("<c5 ~>")]).s("piano").gain(.02)';
/** A loop the renderer must refuse before it starts: a billion notes a bar. */
const ENDLESS = 'setcpm(30/4)\n\nkeys: note("c4*1000000000").s("piano")';

async function json(route: Route) {
  const res = await route.fetch();
  return { res, body: (await res.json()) as Record<string, unknown> };
}

/** The version's code cut to two bars and its Band stored, wherever the page reads them. */
async function twoBarsWithBand(page: Page, sourceCode: () => string) {
  await page.route(/\/api\/album\/tracks\/[^/]+$/, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const { res, body } = await json(route);
    const versions = (body.versions as Record<string, unknown>[] | undefined) ?? [];
    await route.fulfill({
      response: res,
      json: { ...body, versions: versions.map((v) => ({ ...v, band: v.band ?? STORED_BAND })) },
    });
  });
  await page.route(/\/api\/sketches\/[^/]+$/, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const { res, body } = await json(route);
    const versions = (body.versions as Record<string, unknown>[] | undefined) ?? [];
    await route.fulfill({
      response: res,
      json: {
        ...body,
        versions: versions.map((v) => ({ ...v, code: TWO_BARS, band: v.band ?? STORED_BAND })),
      },
    });
  });
  await page.route(/\/api\/album\/tracks\/[^/]+\/versions\/\d+\/source$/, async (route) => {
    const { res, body } = await json(route);
    await route.fulfill({
      response: res,
      json: { ...body, code: sourceCode(), band: body.band ?? STORED_BAND, mutes: { drums: true } },
    });
  });
}

/** Peak and RMS (over the first `bodyS` seconds) and length of a decoded take, measured in the page. */
async function measureTake(page: Page, url: string, bodyS: number) {
  return page.evaluate(
    async ({ url, bodyS }) => {
      const bytes = await (await fetch(url, { credentials: "same-origin" })).arrayBuffer();
      const ctx = new OfflineAudioContext(1, 1, 48_000);
      const buf = await ctx.decodeAudioData(bytes);
      let peak = 0;
      let sum = 0;
      let n = 0;
      const end = Math.min(buf.length, Math.round(bodyS * buf.sampleRate));
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const x = buf.getChannelData(c);
        for (let i = 0; i < x.length; i++) {
          const v = Math.abs(x[i] as number);
          if (v > peak) peak = v;
          if (i < end) {
            sum += v * v;
            n++;
          }
        }
      }
      return { seconds: buf.duration, peak, rms: Math.sqrt(sum / Math.max(1, n)) };
    },
    { url, bodyS },
  );
}

/** The same numbers from a 16-bit stereo WAV the renderer wrote. */
function measureWav(bytes: Buffer, bodyS: number) {
  const sr = bytes.readUInt32LE(24);
  const frames = bytes.readUInt32LE(40) / 4;
  let peak = 0;
  let sum = 0;
  let n = 0;
  const end = Math.min(frames, Math.round(bodyS * sr));
  for (let f = 0; f < frames; f++)
    for (let c = 0; c < 2; c++) {
      const v = Math.abs(bytes.readInt16LE(44 + f * 4 + c * 2) / 32768);
      if (v > peak) peak = v;
      if (f < end) {
        sum += v * v;
        n++;
      }
    }
  return { seconds: frames / sr, peak, rms: Math.sqrt(sum / Math.max(1, n)) };
}

const SHOTS = new URL("./screenshots", import.meta.url).pathname;
const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-9));

test("Export against a real-time take with the Band; Cancel half-way; Export while the take plays; a piece that never ends", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await blockHmr(page);
  await api(page, "PUT", "/dev/clock", { reset: true });
  const seeded = await api(page, "POST", "/dev/seed", { point: "AC2 open" });
  expect(seeded.status).toBe(200);
  const errors = watchErrors(page);
  let sourceCode = TWO_BARS;
  await twoBarsWithBand(page, () => sourceCode);

  await page.goto("/album");
  const sideB = page.locator("section[data-side='B']");
  await expect(sideB).toBeVisible({ timeout: 60_000 });
  await sideB.locator("li[data-track]").first().getByRole("link").first().click();
  await expect(page.getByTestId("export")).toBeVisible({ timeout: 60_000 });
  const trackId = /\/album\/([^/?#]+)/.exec(page.url())?.[1] as string;
  const detail = (await api(page, "GET", `/album/tracks/${trackId}`)).body as {
    versions: { version: number; takes?: unknown[] }[];
  };
  const version = detail.versions.at(-1)?.version as number;
  const takesBefore = detail.versions.at(-1)?.takes?.length ?? 1;

  // The real-time take, recorded from the track page's live code: the two bars and the Band, once, plus the tail.
  await page.getByRole("button", { name: "Play it live" }).click();
  const record = page.getByTestId("record-version");
  await expect(record).toBeEnabled({ timeout: 60_000 });
  await record.click();
  await expect(page.getByText(/Another take of version \d+ recorded/)).toBeVisible({ timeout: 30_000 });
  const take = await measureTake(
    page,
    `/api/album/tracks/${trackId}/versions/${version}/audio?take=${takesBefore + 1}`,
    4,
  );
  console.log(
    `[review] take: ${take.seconds.toFixed(2)} s, peak ${db(take.peak).toFixed(1)} dB, rms ${db(take.rms).toFixed(1)} dB`,
  );
  // Two bars at 120 BPM are 4 s, then the recorder's 1.5 s tail; the Band, not the learner's .02, sets the level.
  expect(take.seconds).toBeGreaterThan(4.5);
  expect(take.seconds).toBeLessThan(8);
  expect(take.peak).toBeGreaterThan(0.1);

  // Cancel half-way: the render is under way when it stops; nothing is saved.
  let downloads = 0;
  page.on("download", () => downloads++);
  sourceCode = LONG;
  await page.getByTestId("export-wav").click();
  const bar = page.getByTestId("export-progress");
  await expect
    .poll(async () => Number((await bar.getAttribute("aria-valuenow").catch(() => "0")) ?? 0), {
      timeout: 30_000,
    })
    .toBeGreaterThanOrEqual(30);
  await page.getByTestId("export-cancel").click();
  await expect(page.getByTestId("export-done")).toContainText("The export was cancelled. Nothing was saved.");
  expect(downloads).toBe(0);

  // Export while the take plays: the take goes on, the WAV comes whole.
  sourceCode = TWO_BARS;
  const audio = page.getByTestId("track-audio");
  await audio.evaluate((el: HTMLAudioElement) => {
    el.loop = true;
    return el.play();
  });
  const download = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByTestId("export-wav").click();
  const file = await download;
  await expect(page.getByTestId("export-done")).toContainText(/^Saved .+\.wav \(/);
  expect(await audio.evaluate((el: HTMLAudioElement) => !el.paused && el.currentTime > 0)).toBe(true);
  await audio.evaluate((el: HTMLAudioElement) => el.pause());
  const wav = measureWav(readFileSync(await file.path()), 4);
  console.log(
    `[review] export: ${wav.seconds.toFixed(2)} s, peak ${db(wav.peak).toFixed(1)} dB, rms ${db(wav.rms).toFixed(1)} dB`,
  );
  expect(wav.seconds).toBeGreaterThan(3.95);
  expect(wav.seconds).toBeLessThan(34);
  expect(wav.peak).toBeLessThan(1);
  // The same music: the Band in both, at levels a few dB apart (the live take passes the master limiter).
  expect(Math.abs(db(wav.peak) - db(take.peak))).toBeLessThan(9);
  expect(Math.abs(db(wav.rms) - db(take.rms))).toBeLessThan(9);

  // A piece that never ends: refused before the render starts, in a plain sentence; nothing saved.
  sourceCode = ENDLESS;
  const t0 = Date.now();
  await page.getByTestId("export-wav").click();
  await expect(page.getByTestId("export-error")).toContainText("cannot be rendered in one piece", {
    timeout: 10_000,
  });
  await expect(page.getByTestId("export-error")).toContainText("Nothing was saved.");
  expect(Date.now() - t0).toBeLessThan(10_000);
  expect(downloads).toBe(1);
  expect(errors).toEqual([]);
});

// --- the whole record --------------------------------------------------------------------------------------------

const HEADERS = { origin: stack.baseURL, "x-oak": "1" };

/** The entries of a stored (uncompressed) zip: name and bytes, read from the local headers. */
function unzipStored(buf: Buffer): { name: string; data: Buffer }[] {
  const out: { name: string; data: Buffer }[] = [];
  let o = 0;
  while (o + 30 <= buf.length && buf.readUInt32LE(o) === 0x04034b50) {
    const size = buf.readUInt32LE(o + 18);
    const nameLen = buf.readUInt16LE(o + 26);
    const start = o + 30 + nameLen + buf.readUInt16LE(o + 28);
    out.push({
      name: buf.subarray(o + 30, o + 30 + nameLen).toString("utf8"),
      data: buf.subarray(start, start + size),
    });
    o = start + size;
  }
  return out;
}

test("the whole course: Side A intact, Side B in release order, twenty distinct covers, Play everything A then B with a breath and no longer silence, Side B's archive whole", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await blockHmr(page);
  await api(page, "PUT", "/dev/clock", { reset: true });
  expect((await api(page, "POST", "/dev/seed", { point: "whole course complete" })).status).toBe(200);
  const errors = watchErrors(page);
  await page.goto("/album");
  await expect(page.getByTestId("course-complete")).toBeVisible({ timeout: 60_000 });
  const a = page.getByTestId("side-a-record");
  const b = page.getByTestId("side-b-record");
  await expect(a.locator("svg[data-cover-rings]")).toHaveCount(12, { timeout: 60_000 });
  await expect(b.locator("svg[data-cover-rings]")).toHaveCount(8, { timeout: 60_000 });
  const covers = await page
    .locator("[data-cover] svg[data-cover-rings]")
    .evaluateAll((els) => els.map((e) => e.outerHTML.replace(/\s(id|aria-labelledby)="[^"]*"/g, "")));
  expect(new Set(covers).size).toBe(covers.length);
  expect(covers.length).toBeGreaterThanOrEqual(20);

  // The core record as it was; Side B numbered in the order its tracks were released.
  const album = (await (
    await page.request.fetch(`${stack.apiURL}/api/album`, { headers: HEADERS })
  ).json()) as {
    tracks: {
      id: string;
      side: string;
      trackNo: number;
      capstoneId: string | null;
      currentVersion: number;
      createdAt: string;
    }[];
  };
  const side = (s: string) => album.tracks.filter((t) => t.side === s).sort((x, y) => x.trackNo - y.trackNo);
  // Each side numbered 1…n in the order its tracks were made.
  const inReleaseOrder = (ts: { id: string; trackNo: number; createdAt: string }[]) => {
    expect(ts.map((t) => t.trackNo)).toEqual(ts.map((_, i) => i + 1));
    expect([...ts].sort((x, y) => x.createdAt.localeCompare(y.createdAt)).map((t) => t.id)).toEqual(
      ts.map((t) => t.id),
    );
  };
  const sideA = side("A");
  inReleaseOrder(sideA);
  expect(new Set(sideA.map((t) => t.capstoneId))).toEqual(
    new Set(["C0", "C1", "C2", "X1", "C3", "C4", "C5", "X2", "C6", "C7", "CF-T", "CF-A"]),
  );
  const sideB = side("B");
  inReleaseOrder(sideB);
  expect(new Set(sideB.map((t) => t.capstoneId))).toEqual(
    new Set(["JC1", "JC2", "JC3", "JC4", "RC1", "RC2", "AC1", "AC2"]),
  );

  // Played through, Side A then Side B: each track moved to its last moment; the next starts after the breath.
  await page.evaluate(() => {
    const el = document.querySelector<HTMLAudioElement>('[data-testid="everything-player"]');
    const log: { type: string; t: number; src: string }[] = [];
    (window as unknown as { __log: typeof log }).__log = log;
    for (const type of ["ended", "pause", "playing"])
      el?.addEventListener(type, () => log.push({ type, t: performance.now(), src: el.currentSrc }));
  });
  await page.getByTestId("play-everything").click();
  const now = page.getByTestId("everything-now");
  for (let i = 0; i < 20; i++) {
    const [s, no, of] = i < 12 ? ["A", i + 1, 12] : ["B", i - 11, 8];
    await expect(now).toHaveText(new RegExp(`^Side ${s} · ${no} of ${of} · `), { timeout: 15_000 });
    await page.waitForFunction(() => {
      const el = document.querySelector<HTMLAudioElement>('[data-testid="everything-player"]');
      return !!el && Number.isFinite(el.duration) && el.duration > 0 && !el.paused && el.currentTime > 0;
    });
    await page.evaluate(() => {
      const el = document.querySelector<HTMLAudioElement>('[data-testid="everything-player"]');
      if (el) el.currentTime = Math.max(0, el.duration - 0.25);
    });
  }
  await expect(page.getByTestId("play-everything-box")).toHaveAttribute("data-state", "stopped", {
    timeout: 15_000,
  });
  const log = await page.evaluate(
    () => (window as unknown as { __log: { type: string; t: number; src: string }[] }).__log,
  );
  const starts = log.filter((e) => e.type === "playing");
  const srcs = [...new Set(starts.map((e) => e.src))];
  expect(srcs).toHaveLength(20);
  const gaps: number[] = [];
  for (let i = 1; i < srcs.length; i++) {
    const end = log.filter((e) => e.src === srcs[i - 1] && (e.type === "ended" || e.type === "pause")).at(-1);
    const start = starts.find((e) => e.src === srcs[i]);
    if (end && start) gaps.push(Math.round(start.t - end.t));
  }
  console.log(`[review] A then B, track to track (ms): ${gaps.join(" ")}`);
  expect(gaps).toHaveLength(19);
  for (const g of gaps) {
    expect(g).toBeGreaterThan(1300);
    expect(g).toBeLessThan(2500);
  }

  // Side B's archive: every recording byte for byte, in running order.
  const download = page.waitForEvent("download");
  await b.getByTestId("download-side-b").click();
  const zip = unzipStored(readFileSync(await (await download).path()));
  expect(zip.map((e) => e.name.slice(0, 3))).toEqual(Array.from({ length: 8 }, (_, i) => `0${i + 1}-`));
  for (const [i, t] of sideB.entries()) {
    const served = await page.evaluate(async (url) => {
      const bytes = new Uint8Array(await (await fetch(url, { credentials: "same-origin" })).arrayBuffer());
      return bytes.length;
    }, `/api/album/tracks/${t.id}/versions/${t.currentVersion}/audio`);
    expect(served, `${t.capstoneId}'s recording`).toBeGreaterThan(1000);
    expect(zip[i]?.data.length, `${t.capstoneId} in the archive`).toBe(served);
  }
  expect(errors).toEqual([]);
});

// --- the capstone checklist, as the learner reads it ------------------------------------------------------------

/** Puts a piece in a capstone's editor (the page's own Strudel editor, as typing would). */
async function writeCode(page: Page, cap: string, code: string) {
  const id = `oak_capstone-${cap}_0_`;
  await page.waitForFunction(
    (i) =>
      !!(globalThis as { __oakStrudel?: { editors: Map<string, unknown> } }).__oakStrudel?.editors.get(i),
    id,
    { timeout: 60_000 },
  );
  await page.evaluate(
    ([i, c]) =>
      (
        globalThis as unknown as { __oakStrudel: { editors: Map<string, { setCode(c: string): void }> } }
      ).__oakStrudel.editors
        .get(i as string)
        ?.setCode(c as string),
    [id, code],
  );
}

async function openCapstone(page: Page, point: string, cap: string) {
  // Off any workspace first: a draft it still saves would land on a sketch the new seed has removed.
  if (page.url().includes("/capstone/")) await page.goto("/album");
  await api(page, "PUT", "/dev/clock", { reset: true });
  expect((await api(page, "POST", "/dev/seed", { point })).status).toBe(200);
  await page.goto(`/capstone/${cap}`);
  const start = page.getByRole("button", { name: /^Start session 1 of \d$/ });
  await expect(start).toBeEnabled({ timeout: 60_000 });
  await start.press("Enter");
  await expect(page.getByTestId("capstone-workspace")).toBeVisible({ timeout: 60_000 });
}

test("near misses in the real workspace: a buried tune is “written but not heard”; a clave an 8th late is heard as no clave on the grid", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await blockHmr(page);
  const errors = watchErrors(page);
  await openCapstone(page, "JC1 open", "JC1");
  await writeCode(page, "JC1", JC1_BURIED);
  const guides = page.locator('[data-rule="guide-tones"]');
  await expect(guides).toHaveAttribute("data-state", "open", { timeout: 45_000 });
  await expect(guides.getByTestId("row-found")).toContainText(
    // The label is shown as code, without its backticks.
    "melody is written but not heard: it is silent, or more than 24 dB under the loudest part.",
    { timeout: 45_000 },
  );
  await expect(page.locator('[data-rule="ii-v"]')).toHaveAttribute("data-state", "met");

  await openCapstone(page, "RC2 open", "RC2");
  await writeCode(page, "RC2", RC2_CLAVE_LATE);
  const clave = page.locator('[data-rule="clave"]');
  await expect(clave).toHaveAttribute("data-state", "open", { timeout: 45_000 });
  // The row's own sentence says the clave is not whole; the clave lens says what it hears (it said "No clave in
  // `perc` yet", backticks and all, while perc played five hits a bar), and shows the hits off the clave's cells.
  await expect(clave).toContainText("bars 1–2 do not hold the whole son clave 3-2");
  const card = page.getByTestId("clave-card");
  await expect(card.getByTestId("clave-heard")).toHaveText("Heard: no son or rumba clave on the grid", {
    timeout: 45_000,
  });
  await expect(card.getByRole("list", { name: /^Your perc/ }).getByText(/outside the clave/)).toHaveCount(5);
  // The card in both themes at both sizes (one page, resized in place).
  for (const m of SCREENSHOT_MATRIX) {
    await page.setViewportSize({ width: m.width, height: m.height });
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, m.theme);
    await card.screenshot({ path: `${SHOTS}/w7-review-clave-${m.theme}-${m.width}x${m.height}.png` });
  }
  expect(errors).toEqual([]);
});
