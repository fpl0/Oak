import type { BandSetup } from "../src/types.ts";
import type {} from "./offline-test.ts";

const short = async (code: string) => {
  const w = window.__offline;
  await w.seed(code);
  const progress: number[] = [];
  const a = await w.renderPiece({ code, onProgress: (p) => progress.push(p) });
  const b = await w.renderPiece({ code });
  const same =
    a.left.length === b.left.length &&
    a.left.every((x, i) => Object.is(x, b.left[i])) &&
    a.right.every((x, i) => Object.is(x, b.right[i]));
  const diffs = a.left.map((x, i) => Math.abs(x - (b.left[i] ?? 0)));
  let maxDiff = 0;
  let count = 0;
  for (const d of diffs) {
    maxDiff = Math.max(maxDiff, d);
    if (d !== 0) count++;
  }
  const firstDiff = diffs.findIndex((x) => x !== 0);
  const wav = a.wav();
  return {
    same,
    maxDiff,
    count,
    firstDiff,
    peak: a.peak,
    rms: a.rms,
    duration: a.durationS,
    piece: a.pieceDurationS,
    tail: a.tailS,
    frames: a.left.length,
    wavBytes: wav.byteLength,
    mime: a.wavBlob().type,
    missing: a.missingSounds,
    progress,
    framesLeft: document.querySelectorAll("[data-oak-offline]").length,
  };
};

const c3 = async (code: string) => {
  const w = window.__offline;
  const editor = await w.seed(code);
  const t = performance.now();
  const out = await w.renderPiece({ code });
  const ms = performance.now() - t;
  const played = await editor.play();
  if (!played.ok) throw new Error(JSON.stringify(played));
  const live = await w.capture(0, 4);
  editor.stop();
  const offline = w.envelope(out.left, out.right, out.sampleRate, 1 / out.cps, 4);
  return {
    ms,
    seconds: out.pieceDurationS,
    bars: out.bars,
    peak: out.peak,
    offline,
    live: live.rms,
    late: live.late,
    deltaDb: offline.map((x, i) => 20 * Math.log10(x / (live.rms[i] ?? 1))),
    skips: w.logs.filter((line) => /skip|not found|late|behind/i.test(line)),
  };
};

const band = async ({ band }: { band: BandSetup }) => {
  const w = window.__offline;
  const code =
    'setcpm(120/4)\nconst melVerse = n("0 2").scale("D4:minor").s("piano").gain(.15)\nmel: arrange([1, melVerse])';
  await w.seed(code, band);
  const a = await w.renderPiece({ code, band });
  const b = await w.renderPiece({ code, band, mutes: { muted: new Set(["band.bass"]), solo: null } });
  const c = await w.renderPiece({ code });
  return {
    bars: a.bars,
    missing: a.missingSounds,
    delta: a.left.some((x, i) => x !== b.left[i]),
    mutedSame: b.left.length === c.left.length && b.left.every((x, i) => x === c.left[i]),
  };
};

const abort = async ({ code, short }: { code: string; short: string }) => {
  const w = window.__offline;
  await w.seed(short);
  const controller = new AbortController();
  window.__offlineContexts = [];
  let abortedAt = 0;
  let progressAtAbort = 0;
  let error = "";
  try {
    await w.renderPiece({
      code,
      signal: controller.signal,
      onProgress: (p) => {
        if (p >= 0.2 && !controller.signal.aborted) {
          progressAtAbort = p;
          abortedAt = performance.now();
          controller.abort();
        }
      },
    });
  } catch (e) {
    error = (e as { code: string }).code;
  }
  const ms = performance.now() - abortedAt;
  const framesLeft = document.querySelectorAll("[data-oak-offline]").length;
  const contexts = window.__offlineContexts;
  delete window.__offlineContexts;
  // Wait for a state transition, never a fixed delay. The graph's next barrier must suspend it.
  await Promise.all(
    contexts.map((ctx) =>
      ctx.state !== "running"
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            ctx.addEventListener(
              "statechange",
              () => {
                if (ctx.state !== "running") resolve();
              },
              { once: true },
            );
          }),
    ),
  );
  const stoppedMs = performance.now() - abortedAt;
  const positions = contexts.map((ctx) => ctx.currentTime);
  const out = await w.renderPiece({ code: short });
  return {
    error,
    ms,
    stoppedMs,
    stopped: contexts.every((ctx, i) => ctx.state !== "running" && ctx.currentTime === positions[i]),
    progressAtAbort,
    framesLeft,
    nextPeak: out.peak,
  };
};

const concurrent = async (code: string) => {
  const w = window.__offline;
  const liveCode = 'setcpm(60)\nmel: note("c4").s("sine").gain(.3).attack(.01).release(.1)';
  const editor = await w.seed(liveCode);
  const reference = await w.renderPiece({ code });
  await editor.play();
  const baseline = await w.capture(1, 2);
  const from = Math.ceil(w.oak.transport.cycle()) + 1;
  const capture = w.capture(from, 4);
  const begins = w.oak.transport.timeOfCycle(from);
  await new Promise<void>((resolve) => {
    const check = () => {
      if (w.ctx.currentTime >= begins) resolve();
      else requestAnimationFrame(check);
    };
    check();
  });
  const actual = await w.renderPiece({ code });
  const live = await capture;
  const playing = editor.playing;
  const state = w.ctx.state;
  const source = editor.getCode();
  editor.stop();
  let maxDiff = 0;
  let firstDiff = -1;
  for (let i = 0; i < reference.left.length; i++) {
    const d = Math.abs((reference.left[i] ?? 0) - (actual.left[i] ?? 0));
    maxDiff = Math.max(maxDiff, d);
    if (d !== 0 && firstDiff === -1) firstDiff = i;
  }
  return {
    maxDiff,
    firstDiff,
    frames: [reference.left.length, actual.left.length],
    playing,
    state,
    source,
    late: live.late,
    baseline: baseline.rms,
    concurrent: live.rms,
    deltaDb: live.rms.map((x) => 20 * Math.log10(x / (baseline.rms[1] ?? 1))),
    same:
      reference.left.length === actual.left.length &&
      reference.left.every((x, i) => x === actual.left[i]) &&
      reference.right.every((x, i) => x === actual.right[i]),
    skips: w.logs.filter((line) => /skip|not found|late|behind/i.test(line)),
  };
};

const failures = async () => {
  const w = window.__offline;
  const codes = [
    "setcpm(120/4)\nconst melVerse = nope()\nmel: arrange([1, melVerse])",
    "setcpm(120/4)\nmel: arrange([1, silence])",
    'setcpm(120/4)\nconst melVerse = s("missing_oak_sound")\nmel: arrange([1, melVerse])',
    'setcpm(120/4)\nconst melVerse = note("c4")\nmel: arrange([129, melVerse])',
  ];
  const failures = [];
  for (const code of codes) {
    try {
      await w.renderPiece({ code });
    } catch (error) {
      failures.push((error as { code: string }).code);
    }
  }
  for (const request of [
    { code: codes[0] as string, timeoutMs: 1 },
    { code: codes[0] as string, signal: AbortSignal.abort() },
  ]) {
    try {
      await w.renderPiece(request);
    } catch (error) {
      failures.push((error as { code: string }).code);
    }
  }
  return { failures, frames: document.querySelectorAll("[data-oak-offline]").length };
};

/**
 * Wave 7 (carry f2): a piece that could never end is refused before a frame exists, so the page never hangs.
 * Each refusal is timed and the frames ever appended are counted (a MutationObserver, not the frames left).
 */
const bounds = async (pieces: string[]) => {
  const w = window.__offline;
  let framesMade = 0;
  const observer = new MutationObserver((records) => {
    for (const r of records)
      for (const n of r.addedNodes)
        if (n instanceof HTMLIFrameElement && "oakOffline" in n.dataset) framesMade++;
  });
  observer.observe(document.body, { childList: true, subtree: true });
  const out = [];
  for (const code of pieces) {
    const t = performance.now();
    try {
      await w.renderPiece({ code });
      out.push({ code: "rendered", message: "", ms: performance.now() - t });
    } catch (error) {
      const e = error as { code: string; message: string };
      out.push({ code: e.code, message: e.message, ms: performance.now() - t });
    }
  }
  observer.disconnect();
  return { refusals: out, framesMade };
};

/**
 * Wave 7 (carry f2): effects that change fast on shared orbits, against the live engine. Every orbit holds ONE
 * reverb and ONE delay whose settings the last note wrote; the offline render queues notes as time advances, so
 * each beat must carry its own settings, as live. Compared per eighth of a bar over four bars.
 */
const orbits = async ({ code, frozen }: { code: string; frozen: string }) => {
  const w = window.__offline;
  const editor = await w.seed(code);
  const out = await w.renderPiece({ code });
  // The control: the same piece with every orbit setting held at its first value, as a renderer that queued the
  // whole song first would play it. The comparison must tell it from the live engine.
  const still = await w.renderPiece({ code: frozen });
  const played = await editor.play();
  if (!played.ok) throw new Error(JSON.stringify(played));
  const live = await w.capture(0, 4);
  editor.stop();
  const bar = 1 / out.cps;
  const slices = (left: Float32Array, right: Float32Array, rate: number) =>
    w.envelope(left, right, rate, bar / 8, 32);
  const offline = slices(out.left, out.right, out.sampleRate);
  const liveSlices = slices(live.left, live.right, w.ctx.sampleRate);
  const frozenSlices = slices(still.left, still.right, still.sampleRate);
  return {
    frozenDeltaDb: frozenSlices.map((x, i) => 20 * Math.log10(x / (liveSlices[i] ?? 1))),
    bars: out.bars,
    late: live.late,
    offline,
    live: liveSlices,
    deltaDb: offline.map((x, i) => 20 * Math.log10(x / (liveSlices[i] ?? 1))),
    barDeltaDb: w
      .envelope(out.left, out.right, out.sampleRate, bar, 4)
      .map((x, i) => 20 * Math.log10(x / (live.rms[i] ?? 1))),
    skips: w.logs.filter((line) => /skip|not found|late|behind/i.test(line)),
  };
};

export const offlineChecks = { short, c3, band, abort, concurrent, failures, bounds, orbits };
declare global {
  interface Window {
    __offlineChecks: typeof offlineChecks;
  }
}
