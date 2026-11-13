// The Wave 4 A/B gate on the real Transcribe page (wave4.md §3.4, PLAN W4): the learner's own recording through the
// stretch engine and the learner's Strudel code in the page's own hidden pattern player, overlaid with `O` and
// played with Space at 0.75×, drift less than 20 ms over 8 bars. Measured on the audio Oak sends to the speakers:
// the recording has a 440 Hz burst on every bar line, the code a 2.6 kHz sine blip on every bar; the master bus is
// split by frequency into two channels, captured sample-accurately, and the onsets compared bar by bar.
import { expect, type Page, test } from "@playwright/test";
import { burstOnsets } from "../../../../packages/audio/e2e/onsets.ts";
import {
  AB_DRIFT_GATE_BARS,
  AB_DRIFT_GATE_MS,
  AB_DRIFT_GATE_RATE,
} from "../../../../packages/audio/src/stretch.ts";
import { stack } from "./playwright.config.ts";
import { api, seed } from "./support.ts";
import { makeBarBurstWav } from "./wav.ts";

test.use({ launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } });

test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
});

const BPM = 160; // 4/4: a bar is 1.5 s, 2 s at 0.75×
const LEAD_IN = 0.5;

const CODE = `setcpm(${BPM}/4)

blip: note("e7").s("sine").attack(0).decay(0.04).sustain(0).gain(0.9)
`;

async function makeProject(page: Page): Promise<string> {
  const up = await page.request.fetch(`${stack.apiURL}/api/audio?name=drift-gate.wav`, {
    method: "POST",
    headers: { origin: stack.baseURL, "x-oak": "1", "content-type": "audio/wav" },
    data: makeBarBurstWav({ bpm: BPM, bars: AB_DRIFT_GATE_BARS + 4, leadInSec: LEAD_IN }),
  });
  expect(up.status(), await up.text()).toBe(200);
  const audioId = ((await up.json()) as { id: string }).id;
  const made = await api<{ id: string }>(page, "POST", "/transcriptions", {
    sourceKind: "own-audio",
    audioId,
    songId: null,
    title: "Drift gate",
    artist: null,
    ladderLevel: null,
    templateId: null,
  });
  expect(made.status, JSON.stringify(made.body)).toBe(200);
  const id = made.body.id;
  const patched = await api(page, "PATCH", `/transcriptions/${id}`, {
    bpm: BPM,
    meter: "4/4",
    downbeatS: LEAD_IN,
    key: { tonic: "C", mode: "major" },
  });
  expect(patched.status, JSON.stringify(patched.body)).toBe(200);
  const v = await api(page, "POST", `/transcriptions/${id}/versions`, {
    sessionId: null,
    code: CODE,
    result: null,
    ranOk: true,
  });
  expect(v.status, JSON.stringify(v.body)).toBe(200);
  const s = await api(page, "PUT", `/transcriptions/${id}/settings`, { rate: AB_DRIFT_GATE_RATE });
  expect(s.status, JSON.stringify(s.body)).toBe(200);
  return id;
}

/** Splits Oak's master output into a low band (the recording) and a high band (the code) and records both. */
async function startCapture(page: Page): Promise<void> {
  await page.evaluate(async () => {
    type Oak = { ctx: AudioContext; master: { analyser: AudioNode } };
    // The app's own adapter: published by app/src/lib/oak.ts in a development build (the dev server and the runner's
    // development bundle) once the transport has made it, which it has before Play is enabled.
    const oak =
      (globalThis as { __oakStrudel?: Oak }).__oakStrudel ??
      (await (
        (await import(/* @vite-ignore */ `${"/src/lib/oak.ts"}`)) as { getOak(): Promise<Oak> }
      ).getOak());
    const ctx = oak.ctx;
    const src = `class OakDriftCapture extends AudioWorkletProcessor {
      constructor() { super(); this.on = true; this.port.onmessage = () => { this.on = false; this.port.postMessage({ done: true }); }; this.sent = false; }
      process(inputs) {
        const i = inputs[0];
        if (this.on && i && i.length > 0) {
          if (!this.sent) { this.port.postMessage({ start: currentFrame }); this.sent = true; }
          const a = i[0], b = i[1] || i[0];
          this.port.postMessage({ a: a.slice(0), b: b.slice(0) });
        }
        return true;
      }
    }
    registerProcessor("oak-drift-capture", OakDriftCapture);`;
    const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
    await ctx.audioWorklet.addModule(url);
    const band = (type: BiquadFilterType, hz: number) => {
      const f1 = ctx.createBiquadFilter();
      const f2 = ctx.createBiquadFilter();
      f1.type = f2.type = type;
      f1.frequency.value = f2.frequency.value = hz;
      f1.connect(f2);
      return { input: f1, output: f2 };
    };
    const low = band("lowpass", 1000);
    const high = band("highpass", 1800);
    oak.master.analyser.connect(low.input);
    oak.master.analyser.connect(high.input);
    const merge = ctx.createChannelMerger(2);
    low.output.connect(merge, 0, 0);
    high.output.connect(merge, 0, 1);
    const node = new AudioWorkletNode(ctx, "oak-drift-capture", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 2,
      channelCountMode: "explicit",
      outputChannelCount: [2],
    });
    merge.connect(node);
    const sink = ctx.createGain();
    sink.gain.value = 0;
    node.connect(sink).connect(ctx.destination);
    const a: Float32Array[] = [];
    const b: Float32Array[] = [];
    const w = window as unknown as Record<string, unknown>;
    w.__oakDrift = {
      sampleRate: ctx.sampleRate,
      a,
      b,
      stop: () =>
        new Promise<void>((resolve) => {
          node.port.onmessage = (e: MessageEvent) => {
            const d = e.data as { a?: Float32Array; b?: Float32Array; done?: boolean };
            if (d.a && d.b) {
              a.push(d.a);
              b.push(d.b);
            }
            if (d.done) {
              node.disconnect();
              merge.disconnect();
              resolve();
            }
          };
          node.port.postMessage("stop");
        }),
    };
    node.port.onmessage = (e: MessageEvent) => {
      const d = e.data as { a?: Float32Array; b?: Float32Array };
      if (d.a && d.b) {
        a.push(d.a);
        b.push(d.b);
      }
    };
  });
}

/** Stops the capture and returns the onsets of both bands, seconds from the start of the capture. */
async function stopCapture(page: Page): Promise<{ source: number[]; mine: number[] }> {
  const fn = burstOnsets.toString();
  return page.evaluate(async (src) => {
    const w = window as unknown as {
      __oakDrift: { sampleRate: number; a: Float32Array[]; b: Float32Array[]; stop(): Promise<void> };
    };
    await w.__oakDrift.stop();
    const join = (xs: Float32Array[]) => {
      const out = new Float32Array(xs.reduce((n, x) => n + x.length, 0));
      let o = 0;
      for (const x of xs) {
        out.set(x, o);
        o += x.length;
      }
      return out;
    };
    // The onset detector shared with packages/audio/e2e, rebuilt on the page from its source.
    const onsets = new Function(`return (${src});`)() as (x: Float32Array, sr: number) => number[];
    const sr = w.__oakDrift.sampleRate;
    return { source: onsets(join(w.__oakDrift.a), sr), mine: onsets(join(w.__oakDrift.b), sr) };
  }, fn);
}

test(`A/B on the Transcribe page: own audio and the learner's code drift < ${AB_DRIFT_GATE_MS} ms over ${AB_DRIFT_GATE_BARS} bars at ${AB_DRIFT_GATE_RATE}×`, async ({
  page,
}) => {
  test.setTimeout(180_000);
  await seed(page, "own-audio project");
  const id = await makeProject(page);
  await page.goto(`/transcribe/${id}`);
  await expect(page.getByTestId("transport-play")).toBeEnabled({ timeout: 30_000 });
  await expect(page.getByTestId("transport-rate")).toContainText("75 %");
  await expect(page.getByTestId("source")).toHaveAttribute("data-engine", "stretch");
  await page.getByTestId("transcribe-project").focus();
  // Overlay: the recording and the code together.
  await page.keyboard.press("o");
  await expect(page.getByRole("radio", { name: "Both" })).toHaveAttribute("aria-checked", "true", {
    timeout: 15_000,
  });
  await startCapture(page);
  await page.keyboard.press("Space");
  await expect(page.getByTestId("transport-play")).toHaveAccessibleName(/Pause/);
  const barReal = (4 * 60) / BPM / AB_DRIFT_GATE_RATE;
  await page.waitForTimeout((AB_DRIFT_GATE_BARS + 1.5) * barReal * 1000);
  const on = await stopCapture(page);
  await page.keyboard.press("Space");

  // Pair bar by bar: each of the code's blips with the recording's burst nearest to it. Bar 0 of the code must
  // meet bar 0 of the recording (a whole bar out would also pair closely, so the first pair is checked).
  const perBar: number[] = [];
  const pairs: [number, number][] = [];
  on.mine.forEach((m, mi) => {
    let si = -1;
    on.source.forEach((x, k) => {
      if (Math.abs(x - m) < 0.4 && (si < 0 || Math.abs(x - m) < Math.abs((on.source[si] as number) - m)))
        si = k;
    });
    if (si >= 0) {
      perBar.push((m - (on.source[si] as number)) * 1000);
      pairs.push([mi, si]);
    }
  });
  expect(pairs[0], `the first blip meets the first burst: ${JSON.stringify(on)}`).toEqual([0, 0]);
  const bars = perBar.slice(0, AB_DRIFT_GATE_BARS + 1);
  const drift = bars.reduce((w, d) => Math.max(w, Math.abs(d)), 0);
  console.log(
    `[transcribe] A/B drift on the page at ${AB_DRIFT_GATE_RATE}×: ${drift.toFixed(2)} ms over ${bars.length - 1} bars (per bar, code − recording: ${JSON.stringify(bars.map((d) => Math.round(d * 100) / 100))}; onsets heard: recording ${on.source.length}, code ${on.mine.length})`,
  );
  // Every bar line 0–8 heard on both sides…
  expect(bars).toHaveLength(AB_DRIFT_GATE_BARS + 1);
  // …and THE GATE.
  expect(drift).toBeLessThan(AB_DRIFT_GATE_MS);
});
