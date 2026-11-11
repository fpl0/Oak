// The offline render frame of the audibility harness (promoted from spikes/s3-sounds/src/render.ts).
// One render per frame instance: superdough 1.3.0 keeps module-global node pools that are never cleared,
// so a second OfflineAudioContext in the same realm throws a cross-context connect error.
import * as core from "@strudel/core";
import { transpiler } from "@strudel/transpiler";
import * as webaudio from "@strudel/webaudio";
import { prebake } from "../pack.ts";

export interface RenderRequest {
  type: "render";
  id: number;
  code: string;
  seconds: number;
  cycles: number;
  cps: number;
  sampleRate: number;
}

/** Deterministic renders: superdough's reverb impulse response is Math.random() noise, so seed it. */
function seedRandom(): void {
  let seed = 0x0a4c5eed;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function renderOffline(req: RenderRequest, soundsRoot: string) {
  const ctx = new OfflineAudioContext(2, Math.ceil(req.seconds * req.sampleRate), req.sampleRate);
  webaudio.setAudioContext(ctx);
  webaudio.setSuperdoughAudioController(null); // lazily rebuilt for the offline context
  await webaudio.initAudio({ maxPolyphony: 128 });
  await prebake(soundsRoot);
  const { pattern } = (await core.evaluate(req.code, transpiler)) as { pattern: Strudel.Pattern };
  const haps = pattern
    .queryArc(0, req.cycles, { _cps: req.cps })
    .filter((h) => h.hasOnset())
    .sort((a, b) => Number(a.whole?.begin.valueOf()) - Number(b.whole?.begin.valueOf()));
  for (const hap of haps) {
    (hap as unknown as { ensureObjectValue(): void }).ensureObjectValue();
    const begin = Number(hap.whole?.begin.valueOf());
    const dur = Number((hap as unknown as { duration: { valueOf(): number } }).duration.valueOf());
    // Awaiting makes sample and soundfont sources safe offline: time does not advance until startRendering.
    await webaudio.superdough(hap.value, begin / req.cps, dur / req.cps, req.cps, begin);
  }
  // Reverb builds its impulse response asynchronously; rendering before that gives a false "no-op".
  const orbits = Object.values(webaudio.getSuperdoughAudioController().nodes ?? {}) as {
    reverbNode?: ConvolverNode;
  }[];
  const deadline = performance.now() + 5000;
  while (orbits.some((o) => o.reverbNode && !o.reverbNode.buffer)) {
    if (performance.now() > deadline) throw new Error("reverb impulse response was never generated");
    await new Promise((r) => setTimeout(r, 5));
  }
  const rendered = await ctx.startRendering();
  return {
    left: rendered.getChannelData(0).slice(),
    right: rendered.getChannelData(1).slice(),
    haps: haps.length,
  };
}

/** Call from the frame page's entry module. */
export function installRenderFrame(soundsRoot: string): void {
  seedRandom();
  const logs: string[] = [];
  webaudio.setLogger((message: unknown) => logs.push(String(message)));
  window.addEventListener("message", async (event) => {
    if (event.source !== window.parent || event.data?.type !== "render") return;
    const req = event.data as RenderRequest;
    try {
      const { left, right, haps } = await renderOffline(req, soundsRoot);
      window.parent.postMessage({ type: "rendered", id: req.id, left, right, haps, logs }, location.origin, [
        left.buffer,
        right.buffer,
      ]);
    } catch (err) {
      window.parent.postMessage(
        { type: "rendered", id: req.id, error: String((err as Error)?.message ?? err), logs },
        location.origin,
      );
    }
  });
  window.parent.postMessage({ type: "ready" }, location.origin);
}
