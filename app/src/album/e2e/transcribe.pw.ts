// The Transcription Studio as the learner, adversarially (Wave 4 review), on the real stack from seeds:
// - own audio of every shape: WAV, MP3, a mono 8 kHz file, a corrupt file and a 40-minute recording (it plays; the
//   spectrogram, which would freeze the page for seconds, is offered up to 8 minutes);
// - a half-beat loop at 0.25×, transposed and fine-tuned while it loops: the playhead never leaves the marked half
//   beat (it was widened to its whole bar whenever the learner's code was loaded), the pitch moves by the semitones
//   and cents asked, and the rendered signal has no clicks at the loop point;
// - A/B a hundred times, then the drift gate measured on the rendered signal (< 20 ms over 8 bars at 0.75×), at
//   0.25× and 1×, and inside a bar loop (the stretch's run-up started before the loop and played every pass early);
// - no click at the A/B switch;
// - a ladder item's hidden code never reaches the DOM, storage, the console, the network or the tutor;
// - hum it, Oak drafts it, with flat, sharp and wordless (legato, no consonants) takes.
import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { shoot } from "../../../../e2e/support/ui.ts";
import { burstOnsets } from "../../../../packages/audio/e2e/onsets.ts";
import { AB_DRIFT_GATE_BARS, AB_DRIFT_GATE_MS } from "../../../../packages/audio/src/stretch.ts";
import { makeBarBurstWav, makeWav } from "../../transcribe/e2e/wav.ts";
import {
  api,
  blockHmr,
  cents,
  discontinuity,
  ownProject,
  pairDrift,
  pitchAt,
  position,
  seed,
  sineWav,
  startCapture,
  stopCapture,
  watchErrors,
  wavOf,
} from "./support.ts";

const SHOTS = new URL("./screenshots", import.meta.url).pathname;
const MP3 = readFileSync(new URL("./fixtures/tone-4s.mp3", import.meta.url));

test.beforeEach(async ({ page }) => {
  await blockHmr(page);
});

async function shots(page: Page, name: string) {
  for (const m of SCREENSHOT_MATRIX) {
    await page.setViewportSize({ width: m.width, height: m.height });
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, m.theme);
    await page.waitForTimeout(150);
    await shoot(page, SHOTS, name, m.theme);
  }
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "paper";
  });
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function importFile(page: Page, name: string, mimeType: string, buffer: Buffer) {
  await page.goto("/transcribe");
  await expect(page.getByRole("heading", { level: 1, name: "Transcribe" })).toBeVisible();
  await page.getByTestId("file-input").setInputFiles({ name, mimeType, buffer });
}

async function opened(page: Page, durationText: RegExp) {
  await expect(page).toHaveURL(/\/transcribe\/tr/, { timeout: 60_000 });
  await expect(page.getByTestId("play")).toBeEnabled({ timeout: 90_000 });
  await expect(page.getByTestId("source")).toHaveAttribute("data-engine", "stretch");
  await expect(page.getByTestId("position")).toContainText(durationText);
}

test("own audio of every shape: WAV, MP3, mono 8 kHz, a corrupt file and a 40-minute recording", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await seed(page, "own-audio project");

  await importFile(page, "groove.wav", "audio/wav", makeWav({ bpm: 120, bars: 4, leadInSec: 0.5 }));
  await opened(page, /0:09\.0$/);

  await importFile(page, "tone.mp3", "audio/mpeg", MP3);
  await opened(page, /0:04\.[01]$/);
  await expect(page.getByTestId("project-title")).toHaveText("tone");

  await importFile(page, "phone memo.wav", "audio/wav", makeWav({ bpm: 120, bars: 4, sampleRate: 8000 }));
  await opened(page, /0:08\.5$/);
  // It plays (the 8 kHz file is resampled to the context's rate).
  await page.getByTestId("transcribe-project").focus();
  await page.keyboard.press("Space");
  await expect.poll(() => position(page), { timeout: 10_000 }).toBeGreaterThan(0.5);
  await page.keyboard.press("Space");

  // A file that is not audio: a calm refusal, and the learner stays where they were.
  const junk = Buffer.alloc(40_000);
  for (let i = 0; i < junk.length; i++) junk[i] = (i * 7919) & 255;
  await importFile(page, "not-really.wav", "audio/wav", junk);
  await expect(page.getByRole("alert")).toContainText("This browser can't read that file as audio.");
  await expect(page).toHaveURL(/\/transcribe$/);

  // Forty minutes (8 kHz mono, 38 MB): it opens, plays and seeks; the spectrogram says why it is not offered.
  const sr = 8000;
  const forty = new Float32Array(40 * 60 * sr);
  for (let i = 0; i < forty.length; i++) forty[i] = 0.25 * Math.sin((2 * Math.PI * 196 * i) / sr);
  await importFile(page, "forty minutes.wav", "audio/wav", wavOf(forty, sr));
  await opened(page, /40:00\.0$/);
  const id = page.url().split("/").pop() as string;
  await expect(page.getByTestId("spectrogram")).toBeDisabled();
  await expect(page.getByTestId("spectrogram-limit")).toHaveText("for recordings up to 8 minutes");
  await page.getByTestId("transcribe-project").focus();
  await page.keyboard.press("Shift+S");
  await expect(page.getByTestId("spectrogram")).toHaveAttribute("aria-pressed", "false");
  // Bars over 40 minutes: 1200 bar lines, numbered sparsely enough to read.
  await api(page, "PATCH", `/transcriptions/${id}`, { bpm: 120, meter: "4/4", downbeatS: 0 });
  await page.reload();
  await expect(page.getByTestId("play")).toBeEnabled({ timeout: 90_000 });
  await expect
    .poll(() => page.getByTestId("waveform").locator("[part~='region-content']").count(), { timeout: 20_000 })
    .toBeGreaterThan(10);
  const labels = await page.getByTestId("waveform").locator("[part~='region-content']").count();
  expect(labels, "bar numbers at fit zoom").toBeLessThan(120);
  await page.getByTestId("transcribe-project").focus();
  await page.keyboard.press("Space");
  await expect.poll(() => position(page), { timeout: 10_000 }).toBeGreaterThan(0.5);
  await page.keyboard.press("Alt+ArrowRight");
  await page.keyboard.press("Space");
  await shots(page, "forty-minutes");
  expect(errors).toEqual([]);
});

test("a half-beat loop at 0.25×, transposed and fine-tuned while it loops, stays the half beat, in tune, without clicks", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await seed(page, "own-audio project");
  // 120 BPM from 0 s: bar 3 is 4–6 s; the loop is half a beat (0.25 s) just after its first beat.
  const loop = { startS: 4.1, endS: 4.35 };
  const id = await ownProject(page, sineWav({ seconds: 20, hz: 220 }), {
    bpm: 120,
    downbeatS: 0,
    settings: { rate: 0.25, loop },
  });
  await page.goto(`/transcribe/${id}`);
  await expect(page.getByTestId("play")).toBeEnabled({ timeout: 60_000 });
  await expect(page.getByTestId("rate")).toContainText("25 %");
  // The label says what plays: the half beat, in bar 3 (it read "bar 3", a whole bar it did not play).
  await expect(page.getByTestId("loop-label")).toHaveText(/^0:04\.1–0:04\.[34] in bar 3$/);
  await page.getByTestId("transcribe-project").focus();

  await startCapture(page, false);
  await page.keyboard.press("Space");
  await expect(page.getByTestId("play")).toHaveAccessibleName(/Pause/);
  const seen: number[] = [];
  for (let i = 0; i < 14; i++) {
    seen.push(await position(page));
    await page.waitForTimeout(200);
  }
  // Transpose up two semitones and fine-tune up 10 cents while it loops.
  await page.keyboard.press("=");
  await page.keyboard.press("=");
  await page.keyboard.press("Shift+Equal");
  await page.keyboard.press("Shift+Equal");
  await expect(page.getByTestId("transcribe-transport")).toContainText("+2 st");
  await expect(page.getByTestId("transcribe-transport")).toContainText("+10¢");
  for (let i = 0; i < 14; i++) {
    seen.push(await position(page));
    await page.waitForTimeout(200);
  }
  const cap = await stopCapture(page);
  await page.keyboard.press("Space");

  // The playhead stayed on the half beat (the readout has 0.1 s steps) and moved inside it.
  for (const t of seen) {
    expect(t).toBeGreaterThanOrEqual(4.0);
    expect(t).toBeLessThanOrEqual(4.4);
  }
  expect(new Set(seen).size).toBeGreaterThan(1);
  // In tune: 220 Hz before, +2 st +10¢ after (pitch kept at 0.25×; the shift does not change the speed).
  const x = cap.a;
  const sr = cap.sr;
  const before = pitchAt(x, sr, Math.round(1.0 * sr));
  const after = pitchAt(x, sr, x.length - Math.round(0.6 * sr));
  console.log(
    `[review] half-beat loop at 0.25×: ${before.toFixed(1)} Hz, then ${after.toFixed(1)} Hz (${cents(after, before).toFixed(0)}¢)`,
  );
  expect(Math.abs(cents(before, 220))).toBeLessThan(25);
  expect(Math.abs(cents(after, before) - 210)).toBeLessThan(25);
  // No click: the worst jump of the rendered signal is a small fraction of its level (a click is a step).
  const d = discontinuity(x.subarray(Math.round(0.4 * sr)));
  console.log(`[review] worst second difference ${d.worst.toFixed(4)} at peak ${d.peak.toFixed(3)}`);
  expect(d.peak).toBeGreaterThan(0.05);
  expect(d.worst / d.peak).toBeLessThan(0.06);

  // Alt+→ moves the half beat a bar later and keeps it a half beat.
  await page.keyboard.press("Alt+ArrowRight");
  await expect(page.getByTestId("loop-label")).toHaveText(/^0:06\.1–0:06\.[34] in bar 4$/);
  await shots(page, "half-beat-loop");
  expect(errors).toEqual([]);
});

const BPM = 160; // 4/4: a bar is 1.5 s
const LEAD = 0.5;
const BLIP = `setcpm(${BPM}/4)\n\nblip: note("e7").s("sine").attack(0).decay(0.04).sustain(0).gain(0.9)\n`;

/** Plays with both sides heard and returns `code − recording` per bar line, ms. */
async function measureDrift(page: Page, seconds: number): Promise<number[]> {
  await startCapture(page, true);
  if (!/Pause/.test((await page.getByTestId("play").getAttribute("aria-label")) ?? ""))
    await page.keyboard.press("Space");
  await page.waitForTimeout(seconds * 1000);
  const c = await stopCapture(page);
  await page.keyboard.press("Space");
  return pairDrift(burstOnsets(c.a, c.sr), burstOnsets(c.b, c.sr));
}

async function openDriftProject(page: Page, settings: Record<string, unknown>, bars = 14) {
  const id = await ownProject(page, makeBarBurstWav({ bpm: BPM, bars, leadInSec: LEAD }), {
    bpm: BPM,
    downbeatS: LEAD,
    code: BLIP,
    settings,
  });
  await page.goto(`/transcribe/${id}`);
  await expect(page.getByTestId("play")).toBeEnabled({ timeout: 60_000 });
  await page.getByTestId("transcribe-project").focus();
}

test(`A/B a hundred times while it plays at 0.75×, then the gate: < ${AB_DRIFT_GATE_MS} ms over ${AB_DRIFT_GATE_BARS} bars`, async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await seed(page, "own-audio project");
  await openDriftProject(page, { rate: 0.75 }, 40);
  await page.keyboard.press("Space");
  await expect(page.getByTestId("play")).toHaveAccessibleName(/Pause/);
  for (let i = 0; i < 100; i++) {
    await page.keyboard.press("v");
    await page.waitForTimeout(30);
  }
  // A hundred switches later: still playing, on "Source" (an even count), and nothing restarted.
  await expect(page.getByTestId("play")).toHaveAccessibleName(/Pause/);
  await expect(page.getByRole("radio", { name: "Source" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("o");
  await expect(page.getByRole("radio", { name: "Both" })).toHaveAttribute("aria-checked", "true");
  const per = await measureDrift(page, (AB_DRIFT_GATE_BARS + 1) * 2);
  console.log(
    `[review] after 100 switches at 0.75×: ${JSON.stringify(per.map((d) => Math.round(d * 10) / 10))}`,
  );
  expect(per.length).toBeGreaterThanOrEqual(AB_DRIFT_GATE_BARS);
  for (const d of per.slice(0, AB_DRIFT_GATE_BARS + 1)) expect(Math.abs(d)).toBeLessThan(AB_DRIFT_GATE_MS);
  expect(errors).toEqual([]);
});

test("the drift at 0.25× and 1×, and inside a bar loop (the run-up came from before the loop)", async ({
  page,
}) => {
  test.setTimeout(210_000);
  const errors = watchErrors(page);
  await seed(page, "own-audio project");
  for (const [rate, bars] of [
    [0.25, 3],
    [1, 8],
  ] as const) {
    await openDriftProject(page, { rate });
    await page.keyboard.press("o");
    await expect(page.getByRole("radio", { name: "Both" })).toHaveAttribute("aria-checked", "true");
    const per = await measureDrift(page, ((bars + 1.2) * 1.5) / rate);
    console.log(`[review] drift at ${rate}×: ${JSON.stringify(per.map((d) => Math.round(d * 10) / 10))}`);
    expect(per.length).toBeGreaterThanOrEqual(bars);
    for (const d of per.slice(0, bars + 1)) expect(Math.abs(d)).toBeLessThan(AB_DRIFT_GATE_MS);
  }
  // Bars 2–3 looped at 0.5×: every pass of the recording meets every pass of the code.
  await openDriftProject(page, { rate: 0.5, loop: { startS: LEAD + 1.5, endS: LEAD + 4.5 } });
  await expect(page.getByTestId("loop-label")).toHaveText("bars 2–3");
  await page.keyboard.press("o");
  await expect(page.getByRole("radio", { name: "Both" })).toHaveAttribute("aria-checked", "true");
  const per = await measureDrift(page, 13);
  console.log(
    `[review] drift in a bars 2–3 loop at 0.5×: ${JSON.stringify(per.map((d) => Math.round(d * 10) / 10))}`,
  );
  // Two passes of two bar lines each.
  expect(per.length).toBeGreaterThanOrEqual(4);
  for (const d of per) expect(Math.abs(d)).toBeLessThan(AB_DRIFT_GATE_MS);
  expect(errors).toEqual([]);
});

test("no click at the A/B switch: the recording fades out and in", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await seed(page, "own-audio project");
  const id = await ownProject(page, sineWav({ seconds: 30, hz: 220 }), {
    bpm: 120,
    downbeatS: 0,
    // A labelled line the transport can switch to, silent so the recording alone is measured.
    code: `setcpm(120/4)\n\nmelody: note("c4").s("sine").gain(0)\n`,
  });
  await page.goto(`/transcribe/${id}`);
  await expect(page.getByTestId("play")).toBeEnabled({ timeout: 60_000 });
  await page.getByTestId("transcribe-project").focus();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("play")).toHaveAccessibleName(/Pause/);
  await page.waitForTimeout(800);
  await startCapture(page, false);
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("v");
    await page.waitForTimeout(130);
  }
  const cap = await stopCapture(page);
  await page.keyboard.press("Space");
  const d = discontinuity(cap.a);
  console.log(
    `[review] A/B switches: worst second difference ${d.worst.toFixed(4)} at peak ${d.peak.toFixed(3)}`,
  );
  expect(d.peak).toBeGreaterThan(0.05);
  expect(d.worst / d.peak).toBeLessThan(0.06);
  expect(errors).toEqual([]);
});

test("a ladder item's hidden code reaches neither the DOM, storage, the console, the network nor the tutor", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const bodies: { url: string; req: string; res: string }[] = [];
  page.on("requestfinished", async (r) => {
    const res = await r.response();
    let body = "";
    try {
      body = (await res?.text()) ?? "";
    } catch {
      // a body that is gone (a redirect, a stream)
    }
    bodies.push({ url: r.url(), req: r.postData() ?? "", res: body });
  });
  const logs: string[] = [];
  page.on("console", (m) => logs.push(m.text()));
  await seed(page, "ladder L3");
  await page.goto("/transcribe");
  await page.getByTestId("project-link").first().click();
  await expect(page.getByTestId("play")).toBeEnabled({ timeout: 60_000 });
  const id = page.url().split("/").pop() as string;
  const root = page.getByTestId("transcribe-project");
  await root.focus();
  // Play the source, both, mine; then break the code (its error message is shown), then ask Claude.
  await page.keyboard.press("Space");
  await page.waitForTimeout(1200);
  await page.keyboard.press("o");
  await page.waitForTimeout(400);
  await page.keyboard.press("v");
  await page.waitForTimeout(400);
  await page.keyboard.press("Space");
  await page.locator(".cm-content").first().click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText('\nbass: n("0 2 ").scale(\n');
  await root.focus();
  await page.keyboard.press("v");
  await expect(page.getByTestId("ab-blocked")).toContainText("Your code didn't run");
  await page.getByTestId("request-transcription-review").click();
  await expect
    .poll(() => bodies.some((b) => /\/api\/tutor\/reviews\/transcription/.test(b.url)), { timeout: 30_000 })
    .toBe(true);

  // The reference as the page rebuilds it from the stimulus events, and the hidden code as the server keeps it.
  const ref = await page.evaluate(async (pid) => {
    const r = await fetch(`/api/transcriptions/${pid}`, { headers: { "x-oak": "1" } });
    const p = (await r.json()) as { stimulus: { events: unknown[]; bars: number } };
    const m = (await import(/* @vite-ignore */ `${"/src/transcribe/stimulus-code.ts"}`)) as {
      stimulusCode(e: unknown[], bars: number): { code: string };
    };
    return m.stimulusCode(p.stimulus.events, p.stimulus.bars).code;
  }, id);
  const fragments = ref
    .split("\n")
    .map((l) => /"([^"]{12,})"/.exec(l)?.[1])
    .filter((f): f is string => typeof f === "string");
  expect(fragments.length).toBeGreaterThan(0);
  const html = await page.content();
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  for (const f of [...fragments, "ref_"]) {
    expect(html.includes(f), `DOM holds ${f}`).toBe(false);
    expect(storage.includes(f), `storage holds ${f}`).toBe(false);
    expect(
      logs.some((l) => l.includes(f)),
      `console holds ${f}`,
    ).toBe(false);
  }
  for (const f of fragments)
    for (const b of bodies) {
      expect(b.req.includes(f), `request to ${b.url} holds the reference`).toBe(false);
      expect(b.res.includes(f), `response of ${b.url} holds the reference`).toBe(false);
    }
  const tutor = bodies.filter((b) => /\/api\/tutor\//.test(b.url) && b.req);
  expect(tutor.length).toBeGreaterThan(0);
  for (const b of tutor) expect(b.req).not.toContain("ref_");
});

/** A fake microphone singing G4 A4 B4 G4 over and over, `cents` off; `wordless`: hummed legato with glides. */
async function fakeVoice(page: Page, o: { cents: number; wordless: boolean }) {
  await page.addInitScript((o) => {
    navigator.mediaDevices.getUserMedia = async () => {
      const ac = new AudioContext();
      const sr = ac.sampleRate;
      const n = sr * 20;
      const buf = ac.createBuffer(1, n, sr);
      const x = buf.getChannelData(0);
      const notes = [67, 69, 71, 67];
      const step = 0.625;
      let phase = 0;
      let f = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const k = Math.floor(t / step);
        const within = t - k * step;
        const target = 440 * 2 ** (((notes[k % 4] as number) - 69 + o.cents / 100) / 12);
        f = o.wordless && f > 0 ? f + (target - f) * 0.004 : target;
        phase += (2 * Math.PI * f * (1 + 0.004 * Math.sin(2 * Math.PI * 5.5 * t))) / sr;
        const env = o.wordless ? 1 : Math.max(0, Math.min(1, within / 0.03, (0.55 - within) / 0.05));
        x[i] = o.wordless
          ? 0.3 * (Math.sin(phase) + 0.15 * Math.sin(2 * phase))
          : 0.3 * env * (Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.25 * Math.sin(3 * phase));
      }
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const dest = ac.createMediaStreamDestination();
      src.connect(dest);
      src.start();
      return dest.stream;
    };
  }, o);
}

test("hum it, Oak drafts it: flat, sharp and wordless takes give the degrees sung", async ({ page }) => {
  test.setTimeout(200_000);
  await seed(page, "own-audio project");
  await api(page, "PUT", "/voice/quiet", { quiet: false, scope: "today" });
  const list = await api<{ items: { id: string; sourceKind: string }[] }>(page, "GET", "/transcriptions");
  const id = list.body.items.find((t) => t.sourceKind === "own-audio")?.id as string;
  await api(page, "PATCH", `/transcriptions/${id}`, {
    bpm: 96,
    meter: "4/4",
    key: { tonic: "G", mode: "major" },
  });
  for (const take of [
    { name: "flat", cents: -35, wordless: false, tuning: "35¢ flat" },
    { name: "sharp", cents: 35, wordless: false, tuning: "35¢ sharp" },
    { name: "wordless", cents: 0, wordless: true, tuning: null },
  ]) {
    // Init scripts run in order on every load: the newest voice is the one the page gets.
    await fakeVoice(page, take);
    await page.goto(`/transcribe/${id}`);
    await expect(page.getByTestId("play")).toBeEnabled({ timeout: 60_000 });
    await page.getByTestId("hum-open").click();
    await page.getByTestId("hum-start").click();
    const draft = page.getByTestId("hum-draft");
    await expect(draft).toBeVisible({ timeout: 40_000 });
    const text = (await page.getByRole("dialog").textContent()) ?? "";
    console.log(`[review] hum ${take.name}: ${JSON.stringify(text.split("Oak heard")[1]?.slice(0, 160))}`);
    // Only the sung degrees (G A B = 1 2 3 in G major), never one off from the flat or sharp voice.
    const heard = /Oak heard the degrees ([\d ]+)/.exec(text)?.[1]?.trim().split(" ") ?? [];
    expect(heard.length).toBeGreaterThanOrEqual(8);
    expect(heard.every((d) => ["1", "2", "3"].includes(d))).toBe(true);
    await expect(draft).toContainText('.scale("G4:major")');
    if (take.tuning) await expect(page.getByRole("dialog")).toContainText(`You sang ${take.tuning} overall`);
    await page.keyboard.press("Escape");
  }
});
