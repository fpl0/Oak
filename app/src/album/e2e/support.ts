// Shared steps of the studio review specs (Transcribe, the capstone flow and the album, driven as the learner):
// direct calls to this stack's server, seeding, generated recordings, and sample-accurate captures of what Oak sends
// to the speakers (the master bus), so timing, pitch and clicks are measured on the rendered signal.
import { expect, type Page } from "@playwright/test";
import { stack } from "./playwright.config.ts";

const HEADERS = { "content-type": "application/json", origin: stack.baseURL, "x-oak": "1" };

export async function api<T = unknown>(page: Page, method: string, path: string, body?: unknown) {
  const res = await page.request.fetch(`${stack.apiURL}/api${path}`, {
    method,
    headers: HEADERS,
    ...(body === undefined ? {} : { data: JSON.stringify(body) }),
    timeout: 170_000,
  });
  return { status: res.status(), body: (await res.json().catch(() => null)) as T };
}

/** Wipes the learner and fast-forwards to `point` (wave4.md §6). */
export async function seed(page: Page, point: string, extra: Record<string, unknown> = {}): Promise<void> {
  await api(page, "PUT", "/dev/clock", { reset: true });
  const r = await api(page, "POST", "/dev/seed", { point, ...extra });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
}

/** Every console error and page error of a page (Strudel's one line per failed evaluation is allowed). */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    if (/\[eval\]|evaluation error|Outdated Optimize Dep/.test(m.text())) return;
    errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

/** Blocks Vite's HMR socket: other engineers' edits must not reload the page mid-test. */
export async function blockHmr(page: Page): Promise<void> {
  await page.routeWebSocket(/.*/, () => {});
}

// --- recordings -------------------------------------------------------------------------------------------

/** A 16-bit mono WAV of `x` at `sr`. */
export function wavOf(x: Float32Array, sr: number): Buffer {
  const n = x.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++)
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i] as number)) * 32767), 44 + i * 2);
  return buf;
}

/** A steady sine: the cleanest signal to hear a click or measure a pitch on. */
export function sineWav(o: { seconds: number; hz: number; sr?: number; amp?: number }): Buffer {
  const sr = o.sr ?? 44100;
  const x = new Float32Array(Math.round(o.seconds * sr));
  for (let i = 0; i < x.length; i++) x[i] = (o.amp ?? 0.3) * Math.sin((2 * Math.PI * o.hz * i) / sr);
  return wavOf(x, sr);
}

/** Uploads a recording and opens it as an own-audio project with its bars (and code, and saved player settings). */
export async function ownProject(
  page: Page,
  wav: Buffer,
  o: {
    bpm: number;
    downbeatS: number;
    code?: string;
    settings?: Record<string, unknown>;
    title?: string;
    /** The project's meter (default 4/4): 12/8 counts dotted quarters, four to the bar. */
    meter?: string;
  },
): Promise<string> {
  const up = await page.request.fetch(`${stack.apiURL}/api/audio?name=review.wav`, {
    method: "POST",
    headers: { origin: stack.baseURL, "x-oak": "1", "content-type": "audio/wav" },
    data: wav,
    timeout: 120_000,
  });
  expect(up.status(), await up.text()).toBe(200);
  const audioId = ((await up.json()) as { id: string }).id;
  const made = await api<{ id: string }>(page, "POST", "/transcriptions", {
    sourceKind: "own-audio",
    audioId,
    songId: null,
    title: o.title ?? "Review take",
    artist: null,
    ladderLevel: null,
    templateId: null,
  });
  expect(made.status, JSON.stringify(made.body)).toBe(200);
  const id = made.body.id;
  const p = await api(page, "PATCH", `/transcriptions/${id}`, {
    bpm: o.bpm,
    meter: o.meter ?? "4/4",
    downbeatS: o.downbeatS,
    key: { tonic: "C", mode: "major" },
  });
  expect(p.status, JSON.stringify(p.body)).toBe(200);
  if (o.code) {
    const v = await api(page, "POST", `/transcriptions/${id}/versions`, {
      sessionId: null,
      code: o.code,
      result: null,
      ranOk: true,
    });
    expect(v.status, JSON.stringify(v.body)).toBe(200);
  }
  if (o.settings) {
    const s = await api(page, "PUT", `/transcriptions/${id}/settings`, o.settings);
    expect(s.status, JSON.stringify(s.body)).toBe(200);
  }
  return id;
}

// --- capturing the master bus ------------------------------------------------------------------------------

/**
 * Starts recording Oak's master output on the page. `split`: two bands (below 1 kHz in `a`, above 1.8 kHz in `b`),
 * so a recording of low bursts and code of high blips are told apart; otherwise `a` is the plain signal.
 * The adapter is found through the module the app itself loaded (a re-served module would be a second instance).
 */
export async function startCapture(page: Page, split: boolean): Promise<void> {
  await page.evaluate(async (split) => {
    const urls = performance
      .getEntriesByType("resource")
      .map((e) => e.name)
      .filter((u) => /packages\/strudel\/src\/index\.ts/.test(u))
      .reverse();
    type Oak = { ctx: AudioContext; master: { analyser: AudioNode } };
    // The app's own instance first (app/src/lib/oak.ts publishes it on the dev server). The resource list keeps only
    // the first 250 entries, so on a page that loads more modules the strudel module may not be listed at all.
    let oak: Oak | null = (globalThis as { __oakStrudel?: Oak }).__oakStrudel ?? null;
    for (const u of oak ? [] : urls) {
      try {
        oak = ((await import(/* @vite-ignore */ u)) as { getOakStrudel(): Oak }).getOakStrudel();
        break;
      } catch {
        // another copy of the module: try the next
      }
    }
    if (!oak) throw new Error("the page has no Oak adapter yet");
    const ctx = oak.ctx;
    const w = window as unknown as Record<string, unknown>;
    if (!w.__reviewCaptureReady) {
      const src = `class ReviewCapture extends AudioWorkletProcessor {
        constructor() { super(); this.on = true; this.port.onmessage = () => { this.on = false; this.port.postMessage({ done: true }); }; }
        process(inputs) { const i = inputs[0]; if (this.on && i && i.length > 0) this.port.postMessage({ a: i[0].slice(0), b: (i[1] || i[0]).slice(0) }); return true; }
      }
      registerProcessor("review-capture", ReviewCapture);`;
      await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
      w.__reviewCaptureReady = true;
    }
    const node = new AudioWorkletNode(ctx, "review-capture", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 2,
      channelCountMode: "explicit",
      outputChannelCount: [2],
    });
    const merge = ctx.createChannelMerger(2);
    const tapped: AudioNode[] = [merge];
    if (split) {
      const band = (type: BiquadFilterType, hz: number, ch: number) => {
        const f1 = ctx.createBiquadFilter();
        const f2 = ctx.createBiquadFilter();
        f1.type = f2.type = type;
        f1.frequency.value = f2.frequency.value = hz;
        oak.master.analyser.connect(f1);
        f1.connect(f2).connect(merge, 0, ch);
        tapped.push(f1, f2);
      };
      band("lowpass", 1000, 0);
      band("highpass", 1800, 1);
    } else {
      const mono = ctx.createGain();
      mono.channelCount = 1;
      mono.channelCountMode = "explicit";
      oak.master.analyser.connect(mono);
      mono.connect(merge, 0, 0);
      mono.connect(merge, 0, 1);
      tapped.push(mono);
    }
    merge.connect(node);
    const sink = ctx.createGain();
    sink.gain.value = 0;
    node.connect(sink).connect(ctx.destination);
    const a: Float32Array[] = [];
    const b: Float32Array[] = [];
    node.port.onmessage = (e: MessageEvent) => {
      const d = e.data as { a?: Float32Array; b?: Float32Array };
      if (d.a && d.b) {
        a.push(d.a);
        b.push(d.b);
      }
    };
    w.__reviewCapture = {
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
              for (const n of tapped) n.disconnect();
              resolve();
            }
          };
          node.port.postMessage("stop");
        }),
    };
  }, split);
}

/** Stops the capture and returns both channels. */
export async function stopCapture(page: Page): Promise<{ sr: number; a: Float32Array; b: Float32Array }> {
  const r = await page.evaluate(async () => {
    const c = (window as unknown as Record<string, unknown>).__reviewCapture as {
      sampleRate: number;
      a: Float32Array[];
      b: Float32Array[];
      stop(): Promise<void>;
    };
    await c.stop();
    const enc = (xs: Float32Array[]) => {
      const out = new Float32Array(xs.reduce((n, x) => n + x.length, 0));
      let o = 0;
      for (const x of xs) {
        out.set(x, o);
        o += x.length;
      }
      const u8 = new Uint8Array(out.buffer);
      let s = "";
      for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode(...u8.subarray(i, i + 8192));
      return btoa(s);
    };
    return { sr: c.sampleRate, a: enc(c.a), b: enc(c.b) };
  });
  const dec = (s: string) => {
    const b = Buffer.from(s, "base64");
    return new Float32Array(b.buffer, b.byteOffset, b.length / 4);
  };
  return { sr: r.sr, a: dec(r.a), b: dec(r.b) };
}

// --- measuring --------------------------------------------------------------------------------------------

/**
 * The worst jump of a signal against its own slope (the largest |second difference|), and the signal's peak. A
 * steady sine has a second difference of peak·(2πf/sr)²; a click is a step many times that.
 */
export function discontinuity(x: Float32Array): { worst: number; peak: number } {
  let worst = 0;
  let peak = 0;
  for (let i = 2; i < x.length; i++) {
    const d = Math.abs((x[i] as number) - 2 * (x[i - 1] as number) + (x[i - 2] as number));
    if (d > worst) worst = d;
    const v = Math.abs(x[i] as number);
    if (v > peak) peak = v;
  }
  return { worst, peak };
}

/** The fundamental (Hz) of a steady tone by autocorrelation over 60–1000 Hz, on a 0.2 s window at `from`. */
export function pitchAt(x: Float32Array, sr: number, from: number): number {
  const n = Math.round(0.2 * sr);
  const seg = x.subarray(from, from + n);
  const lo = Math.floor(sr / 1000);
  const hi = Math.ceil(sr / 60);
  let best = lo;
  let bestR = Number.NEGATIVE_INFINITY;
  const r = (lag: number) => {
    let s = 0;
    for (let i = 0; i + lag < seg.length; i++) s += (seg[i] as number) * (seg[i + lag] as number);
    return s / (seg.length - lag);
  };
  // The unbiased autocorrelation of a steady tone peaks as high at 2T, 3T… as at its period T, so the global
  // maximum can land an octave low (seen at the gate: 110 Hz for a 220 Hz tone). Take the first local peak within
  // 90 % of the highest one: the period, not a multiple of it.
  const rs: number[] = [];
  for (let lag = lo; lag <= hi + 1; lag++) rs.push(r(lag));
  const top = Math.max(...rs);
  for (let i = 1; i < rs.length - 1; i++) {
    const v = rs[i] as number;
    if (v >= 0.9 * top && v >= (rs[i - 1] as number) && v >= (rs[i + 1] as number)) {
      best = lo + i;
      bestR = v;
      break;
    }
  }
  if (bestR === Number.NEGATIVE_INFINITY) {
    best = lo + rs.indexOf(top);
    bestR = top;
  }
  // Parabolic refinement around the peak.
  const y0 = r(best - 1);
  const y1 = bestR;
  const y2 = r(best + 1);
  const shift = (y0 - y2) / (2 * (y0 - 2 * y1 + y2) || 1);
  return sr / (best + shift);
}

export const cents = (hz: number, ref: number) => 1200 * Math.log2(hz / ref);

/** Pairs each of `mine`'s onsets with the nearest of `src` (within 0.4 s): `mine − src` in ms. */
export function pairDrift(src: readonly number[], mine: readonly number[]): number[] {
  const out: number[] = [];
  for (const m of mine) {
    let best: number | null = null;
    for (const x of src)
      if (Math.abs(x - m) < 0.4 && (best === null || Math.abs(x - m) < Math.abs(best - m))) best = x;
    if (best !== null) out.push((m - best) * 1000);
  }
  return out;
}

/** Seconds on the position readout ("0:04.1 / 0:20.0"). */
export async function position(page: Page): Promise<number> {
  const text = (await page.getByTestId("position").textContent()) ?? "";
  const [m, s] = (text.split(" / ")[0] ?? "0:0").split(":");
  return Number(m) * 60 + Number(s);
}

// --- the editor -----------------------------------------------------------------------------------------------

/**
 * Puts `code` in an editor (`__oakStrudel.editors`) and keeps it there: a workspace loads the saved draft into its
 * editor after the editor exists, and a draft that arrives after the code was set replaces it (a cold dev server
 * is slow enough for that). The code is set again until it has held for a second.
 */
export async function setEditorCode(page: Page, editor: string, code: string): Promise<void> {
  type Editors = { __oakStrudel?: { editors: Map<string, { getCode(): string; setCode(c: string): void }> } };
  await page.waitForFunction((id) => !!(globalThis as Editors).__oakStrudel?.editors.get(id), editor, {
    timeout: 60_000,
  });
  const set = () =>
    page.evaluate(
      ([id, c]) => (globalThis as Editors).__oakStrudel?.editors.get(id as string)?.setCode(c as string),
      [editor, code],
    );
  const held = () =>
    page.evaluate(
      ([id, c]) => (globalThis as Editors).__oakStrudel?.editors.get(id as string)?.getCode() === c,
      [editor, code],
    );
  for (let i = 0; i < 10; i++) {
    await set();
    await page.waitForTimeout(1000);
    if (await held()) return;
  }
  throw new Error(`the code did not stay in ${editor}`);
}
