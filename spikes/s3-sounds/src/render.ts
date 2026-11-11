// Offline render frame (one render per frame instance, then the frame is thrown away).
//
// Why a frame per render: superdough 1.3.0 keeps module-global node pools (nodePools.mjs: filter,
// compressor, supersaw, wavetable) that are NOT cleared between contexts, so a second OfflineAudioContext in
// the same realm can be handed a BiquadFilter that belongs to the previous context. A fresh realm has
// fresh pools, a fresh soundMap and a fresh worklet registration.
import * as core from "@strudel/core";
import * as mini from "@strudel/mini";
import * as soundfonts from "@strudel/soundfonts";
import * as tonal from "@strudel/tonal";
import { transpiler } from "@strudel/transpiler";
import * as webaudio from "@strudel/webaudio";
import { prebake } from "./oak-audio.ts";

const { initAudio, setAudioContext, setSuperdoughAudioController, getSuperdoughAudioController, superdough, setLogger } =
  webaudio;

// Deterministic renders: superdough's generated reverb impulse response (reverbGen.mjs) is Math.random()
// noise, so seed it. (Worklet-side noise sources have their own generators and stay random.)
let seed = 0x0a4c5eed;
Math.random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export interface RenderRequest {
  type: "render";
  id: number;
  code: string;
  seconds: number;
  cycles: number;
  cps: number;
  sampleRate: number;
  /** probe only: render this many times in the SAME realm (expected to break in superdough 1.3.0) */
  repeat?: number;
}

const logs: string[] = [];
setLogger((message: string) => logs.push(String(message)));

async function renderOffline(req: RenderRequest) {
  const length = Math.ceil(req.seconds * req.sampleRate);
  const ctx = new OfflineAudioContext(2, length, req.sampleRate);
  // setAudioContext BEFORE anything touches getAudioContext(); null controller => superdough lazily builds a
  // SuperdoughAudioController for the offline context on first use (the class itself is not exported).
  setAudioContext(ctx);
  setSuperdoughAudioController(null);
  await initAudio({ maxPolyphony: 128 }); // loads the worklets into the offline context
  await core.evalScope(core, mini, tonal, webaudio, soundfonts);
  await prebake();

  const { pattern } = await core.evaluate(req.code, transpiler);
  const haps = pattern
    .queryArc(0, req.cycles, { _cps: req.cps })
    .filter((h: any) => h.hasOnset())
    .sort((a: any, b: any) => a.whole.begin.valueOf() - b.whole.begin.valueOf());
  for (const hap of haps) {
    hap.ensureObjectValue();
    const begin = hap.whole.begin.valueOf();
    // awaiting is what makes sample/soundfont sources safe offline: time does not advance until startRendering
    await superdough(hap.value, begin / req.cps, hap.duration.valueOf() / req.cps, req.cps, begin);
  }
  // room: createReverb() builds its impulse response ASYNCHRONOUSLY (a nested OfflineAudioContext) and only
  // then assigns convolver.buffer. Rendering before that yields a silent reverb, i.e. a false "no-op".
  const orbits = Object.values(getSuperdoughAudioController().nodes) as { reverbNode?: ConvolverNode }[];
  const deadline = performance.now() + 5000;
  while (orbits.some((o) => o.reverbNode && !o.reverbNode.buffer)) {
    if (performance.now() > deadline) throw new Error("reverb impulse response was never generated");
    await new Promise((r) => setTimeout(r, 5));
  }
  const rendered = await ctx.startRendering();
  return { left: rendered.getChannelData(0).slice(), right: rendered.getChannelData(1).slice(), haps: haps.length };
}

window.addEventListener("message", async (event) => {
  if (event.source !== window.parent || event.data?.type !== "render") return;
  const req = event.data as RenderRequest;
  try {
    let out = await renderOffline(req);
    for (let i = 1; i < (req.repeat ?? 1); i++) out = await renderOffline(req);
    const { left, right, haps } = out;
    window.parent.postMessage({ type: "rendered", id: req.id, left, right, haps, logs }, location.origin, [
      left.buffer,
      right.buffer,
    ]);
  } catch (err) {
    window.parent.postMessage({ type: "rendered", id: req.id, error: String((err as Error)?.message ?? err), logs }, location.origin);
  }
});
window.parent.postMessage({ type: "ready" }, location.origin);
