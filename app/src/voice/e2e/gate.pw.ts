// The pitch gate in the browser: the reel of corpus clips plays through Chromium's fake microphone into the app's
// own mic graph (`app/src/lib/mic.ts` → @oak/audio's AudioWorklet → @oak/pitch's detector), while Strudel plays a
// loop on the same AudioContext. The frames the worklet posted are scored against the same truth the Bun gate
// uses (`@oak/pitch/gate`), clip by clip: ≥ 95 % of voiced frames within ±25 cents, octave errors < 2 %, no
// voice reported in silence, room noise or bleed.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PitchFrame } from "@oak/pitch";
import { formatGateTable, GATE } from "@oak/pitch/gate";
import { expect, test } from "@playwright/test";
import { fakeMic, GENERATED, noHmr, watchErrors } from "./helpers.ts";
import { alignReel, type ReelMeta, reelClips, scoreReel } from "./reel.ts";

test.use({ launchOptions: { args: fakeMic("reel.wav") } });

const LOOP = `setcpm(96/4)

drums: s("bd ~ sd ~")
hats: s("hh*8").gain(.5)
keys: n("<0 2 4 2>").scale("C3:major").s("piano")`;

interface Take {
  frames: PitchFrame[];
  openedAt: number;
  sampleRate: number;
  /** Master-bus RMS readings while the take ran: Strudel was really playing. */
  output: number[];
  outcome: { ok: boolean };
}

test("the AudioWorklet path passes the pitch gate on the corpus reel while Strudel plays", async ({
  page,
}) => {
  const meta = JSON.parse(readFileSync(resolve(GENERATED, "reel.json"), "utf8")) as ReelMeta;
  await noHmr(page);
  const problems = watchErrors(page);
  await page.goto("/settings/audio");
  await expect(page.getByRole("heading", { name: "Output" })).toBeVisible();
  const take = await page.evaluate(
    async ({ code, seconds, urls }): Promise<Take> => {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      // The app's own modules, by their dev-server URLs: the same instances the app uses.
      const { getOak } = (await import(/* @vite-ignore */ urls.oak)) as typeof import("../../lib/oak.ts");
      const { openMic } = (await import(/* @vite-ignore */ urls.mic)) as typeof import("../../lib/mic.ts");
      const oak = await getOak();
      await oak.unlock();
      await oak.preload(oak.soundsIn(code));
      const player = oak.createPatternPlayer();
      const outcome = await player.load(code, { bars: 4, cps: 0 });
      player.setLoop({ fromBar: 0, bars: 4 });
      await player.play();
      await sleep(400);
      const session = await openMic({});
      const openedAt = oak.ctx.currentTime;
      const output: number[] = [];
      const until = performance.now() + seconds * 1000;
      while (performance.now() < until) {
        await sleep(250);
        output.push(oak.master.level().rms);
      }
      const frames = session.frames();
      session.close();
      player.stop();
      return { frames, openedAt, sampleRate: oak.ctx.sampleRate, output, outcome: { ok: outcome.ok } };
    },
    { code: LOOP, seconds: meta.duration + 0.5, urls: { oak: "/src/lib/oak.ts", mic: "/src/lib/mic.ts" } },
  );
  expect(take.outcome.ok).toBe(true);
  // Strudel played through the whole take.
  expect(take.output.filter((r) => r > 1e-3).length / take.output.length).toBeGreaterThan(0.9);
  // One frame per 512-sample hop of the context's own rate.
  expect(take.frames.length).toBeGreaterThan(meta.duration * (take.sampleRate / 512) * 0.95);

  const clips = reelClips();
  const offset = alignReel(take.frames, clips, meta, take.openedAt - 0.5, take.openedAt + 1.5);
  const report = scoreReel(take.frames, clips, meta, offset);
  console.log(
    `\nPitch gate in Chromium (fake mic → AudioWorklet, Strudel playing; context ${take.sampleRate} Hz, ` +
      `file start ${(offset - take.openedAt).toFixed(3)} s after the mic opened):\n${formatGateTable(report)}\n`,
  );
  expect(report.failures).toEqual([]);
  expect(report.overall.within).toBeGreaterThanOrEqual(GATE.minWithin);
  expect(report.overall.octave).toBeLessThan(GATE.maxOctave);
  expect(report.overall.falseVoiced).toBeLessThanOrEqual(GATE.maxFalseVoiced);
  expect(report.recallGated).toBeGreaterThanOrEqual(GATE.minRecall);
  expect(problems).toEqual([]);
});
