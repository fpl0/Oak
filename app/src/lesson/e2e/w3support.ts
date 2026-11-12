// Helpers for the Wave 3 lesson specs: the dev seed (POST /api/dev/seed), Quiet mode on the server, the dev
// fixture of the Wave 3 step kinds, a fake microphone singing a steady note, and the no-overflow check.
import { mkdirSync, writeFileSync } from "node:fs";
import type { APIRequestContext, Page } from "@playwright/test";
import { REPO_ROOT } from "../../../../e2e/support/stack.ts";
import { stack } from "./playwright.config.ts";
import { expect } from "./support.ts";

const H = { "X-Oak": "1", "Content-Type": "application/json", Origin: stack.baseURL };

/** `POST /api/dev/seed`: the learner as the default order leaves them at `point` (wave3.md §5.5). */
export async function seed(page: Page, point: string): Promise<void> {
  const r = await page.request.post(`${stack.apiURL}/api/dev/seed`, {
    headers: H,
    data: { point },
    timeout: 120_000,
  });
  expect(r.ok(), `seed ${point}: ${r.status()} ${await r.text()}`).toBe(true);
}

/**
 * Back to a fresh learner after a spec that seeded one: the suite's other specs share the data dir and expect
 * the state it started with (nothing done, U01.CP not open).
 */
export async function reseedFresh(request: APIRequestContext): Promise<void> {
  const r = await request.post(`${stack.apiURL}/api/dev/seed`, {
    headers: H,
    data: { point: "fresh" },
    timeout: 120_000,
  });
  expect(r.ok(), `seed fresh: ${r.status()}`).toBe(true);
}

export async function api<T>(page: Page, method: "GET" | "PUT" | "POST", path: string, data?: unknown) {
  const r = await page.request.fetch(`${stack.apiURL}/api${path}`, {
    method,
    headers: H,
    ...(data !== undefined ? { data } : {}),
  });
  return { status: r.status(), body: (r.ok() ? await r.json() : null) as T | null };
}

/**
 * Quiet mode on (or off) on the server: `voice.quiet` for today once the server builds it, the profile's flag
 * until then (the player reads `voice.get` first and falls back to the profile).
 */
export async function setQuiet(page: Page, quiet: boolean): Promise<void> {
  const v = await api(page, "PUT", "/voice/quiet", { quiet, scope: "today" });
  if (v.status === 200) return;
  const p = await api(page, "PUT", "/profile", { quiet });
  expect(p.status, "PUT /profile quiet").toBe(200);
}

/** The dev fixture lesson of the Wave 3 step kinds (preview: nothing is saved). */
export const FIXTURE = "/learn/U04.L99?preview=true";

export async function noOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

export async function onScreen(page: Page, testId: string): Promise<void> {
  const box = await page.getByTestId(testId).first().boundingBox();
  const vp = page.viewportSize();
  expect(box, `${testId} on screen`).not.toBeNull();
  if (box && vp) {
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
  }
}

const MIC_DIR = `${REPO_ROOT}/test-results/lesson-w3-mic`;

/** A WAV of one steady sine (after 0.3 s of silence), for Chromium's fake capture device. */
function wav(hz: number, seconds: number, sampleRate = 48000): Uint8Array {
  return wavOf(seconds, sampleRate, (t) => 0.5 * Math.sin(2 * Math.PI * hz * t));
}

/**
 * A mono 16-bit WAV of `seconds` (after 0.3 s of silence) whose sample at time `t` (seconds from the end of the
 * lead-in) is `at(t)`, clipped to full scale.
 */
function wavOf(seconds: number, sampleRate: number, at: (t: number) => number): Uint8Array {
  const lead = Math.round(0.3 * sampleRate);
  const n = lead + Math.round(seconds * sampleRate);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const t = i - lead;
    const s = t < 0 ? 0 : Math.max(-1, Math.min(1, at(t / sampleRate)));
    v.setInt16(44 + i * 2, Math.round(s * 32767), true);
  }
  return new Uint8Array(buf);
}

/** Chromium flags for a fake microphone playing `file` (written under test-results/). */
function micFlags(file: string, data: Uint8Array): string[] {
  mkdirSync(MIC_DIR, { recursive: true });
  writeFileSync(`${MIC_DIR}/${file}`, data);
  return [
    "--autoplay-policy=no-user-gesture-required",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${MIC_DIR}/${file}`,
  ];
}

/** A pseudo-random generator with a fixed seed: the same noise on every run. */
function noise(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 2 ** 31 - 1;
  };
}

/**
 * The takes the pitch tracker cannot grade, or grades with a warning (wave3 take quality): a silent room, a loud
 * room with no pitch in it (broadband noise), only short blips (120 ms beeps), and a voice so loud the input
 * clips (a C4 driven three times past full scale).
 */
export const FAKE_TAKES = {
  silent: () =>
    micFlags(
      "silent.wav",
      wavOf(20, 48000, () => 0),
    ),
  noisy: () => {
    const r = noise(7);
    return micFlags(
      "noisy.wav",
      wavOf(20, 48000, () => 0.35 * r()),
    );
  },
  blips: () =>
    micFlags(
      "blips.wav",
      wavOf(20, 48000, (t) => (t % 0.6 < 0.12 ? 0.5 * Math.sin(2 * Math.PI * 261.6256 * t) : 0)),
    ),
  clipped: () =>
    micFlags(
      "clipped.wav",
      wavOf(20, 48000, (t) => 3 * Math.sin(2 * Math.PI * 261.6256 * t)),
    ),
} as const;

/** Chromium flags for a fake microphone singing a steady middle C (261.63 Hz) for 20 s. */
export function fakeMicSingingC(): string[] {
  mkdirSync(MIC_DIR, { recursive: true });
  const file = `${MIC_DIR}/sing-c4.wav`;
  writeFileSync(file, wav(261.6256, 20));
  return [
    "--autoplay-policy=no-user-gesture-required",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${file}`,
  ];
}
