// S3 spike lab page. Exposes window.oak for the Playwright scripts in tests/.
import * as core from "@strudel/core";
import * as mini from "@strudel/mini";
import * as soundfonts from "@strudel/soundfonts";
import * as tonal from "@strudel/tonal";
import { transpiler } from "@strudel/transpiler";
import * as webaudio from "@strudel/webaudio";
import {
  getSound,
  installMasterBus,
  level,
  type MasterBus,
  measure,
  type PackManifest,
  prebake,
  preload,
  preloadPattern,
  record,
  soundAlias,
  soundMap,
} from "./oak-audio.ts";
import { audible, audibleTable, noiseFloorDb, renderInFrame } from "./audibility.ts";
import { packUrls, precachePack, swStats } from "./sw-client.ts";

const { initAudio, setAudioContext, webaudioRepl, setLogger, resetGlobalEffects, getSuperdoughAudioController } = webaudio;

interface LogEntry {
  t: number;
  message: string;
}

const logs: LogEntry[] = [];
const errors: string[] = [];
let ctx: AudioContext;
let bus: MasterBus;
let repl: ReturnType<typeof webaudioRepl>;
let manifest: PackManifest;

// @strudel/webaudio routed superdough's logger to core's logger at import time. core's logger drops a
// message that repeats within 1 s, so we tee superdough's logger to see every "skip hap" line.
setLogger((message: string, type?: string, data?: unknown) => {
  logs.push({ t: performance.now(), message: String(message) });
  core.logger(message, type, data);
});

// everything that reaches core's logger (scheduler errors such as "sound x not found" land here only)
const coreLogs: LogEntry[] = [];
document.addEventListener("strudel.log", (e) => {
  coreLogs.push({ t: performance.now(), message: String((e as CustomEvent).detail?.message) });
});

async function boot(options: { serviceWorker?: boolean } = {}) {
  if (options.serviceWorker && "serviceWorker" in navigator) {
    await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    // first load: wait until this page is actually controlled (sw.js calls clients.claim())
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((r) => navigator.serviceWorker.addEventListener("controllerchange", () => r(), { once: true }));
    }
  }
  // one Oak-owned context, no forced sampleRate
  ctx = new AudioContext({ latencyHint: "interactive" });
  setAudioContext(ctx);
  await ctx.resume();
  await initAudio({ maxPolyphony: 128 });
  await core.evalScope(core, mini, tonal, webaudio, soundfonts);
  manifest = await prebake();
  bus = installMasterBus(ctx);
  repl = webaudioRepl({
    audioContext: ctx,
    transpiler,
    onEvalError: (err: Error) => errors.push(`eval: ${err.message}`),
  });
  return {
    state: ctx.state,
    sampleRate: ctx.sampleRate,
    maxChannelCount: ctx.destination.maxChannelCount,
    packVersion: manifest.packVersion,
    controlled: !!navigator.serviceWorker?.controller,
  };
}

/** evaluate + start. With { preload: n } the first n cycles are warmed before the scheduler starts. */
async function play(code: string, options: { preload?: number } = {}) {
  await repl.evaluate(code, false);
  let report: unknown;
  if (options.preload) report = await preloadPattern(repl.state.pattern, 0, options.preload);
  const startedAt = performance.now();
  repl.start();
  return { startedAt, report };
}

const api = {
  boot,
  play,
  stop: () => repl.stop(),
  preload,
  measure: (ms: number) => measure(bus.analyser, ms),
  /** pre-limiter and post-limiter levels over the same window */
  async measureBoth(ms: number) {
    // sample both analysers at the same instants; report max window (peaks) and the energy average
    const end = performance.now() + ms;
    const acc = { pre: { sq: 0, rms: 0, peak: 0 }, post: { sq: 0, rms: 0, peak: 0 } };
    let windows = 0;
    while (performance.now() < end) {
      for (const [key, node] of [["pre", bus.preAnalyser], ["post", bus.analyser]] as const) {
        const l = level(node);
        acc[key].sq += l.rms ** 2;
        acc[key].rms = Math.max(acc[key].rms, l.rms);
        acc[key].peak = Math.max(acc[key].peak, l.peak);
      }
      windows++;
      await new Promise((r) => setTimeout(r, 15));
    }
    return {
      pre: { rms: acc.pre.rms, peak: acc.pre.peak },
      post: { rms: acc.post.rms, peak: acc.post.peak },
      gainDb: 10 * Math.log10(acc.post.sq / acc.pre.sq),
      reductionDb: bus.limiter.reduction,
      windows,
    };
  },
  setTrim(gain: number) {
    bus.trim.gain.value = gain;
  },
  async record(ms: number) {
    const blob = await record(bus.tap, ms);
    // decode what we recorded to prove it is real, non-silent audio
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const data = decoded.getChannelData(0);
    let sum = 0;
    for (const x of data) sum += x * x;
    return {
      size: blob.size,
      type: blob.type,
      decodedSeconds: decoded.duration,
      decodedChannels: decoded.numberOfChannels,
      decodedRms: Math.sqrt(sum / data.length),
    };
  },
  logs: (since = 0) => logs.filter((l) => l.t >= since).map((l) => l.message),
  coreLogs: (since = 0) => coreLogs.filter((l) => l.t >= since).map((l) => l.message),
  errors: () => errors,
  now: () => performance.now(),
  sounds() {
    const all = soundMap.get() as Record<string, { data: { type?: string; fonts?: string[]; samples?: unknown } }>;
    const byType: Record<string, number> = {};
    for (const e of Object.values(all)) byType[e.data?.type ?? "?"] = (byType[e.data?.type ?? "?"] ?? 0) + 1;
    return { total: Object.keys(all).length, byType, names: Object.keys(all) };
  },
  sound(name: string) {
    const s = getSound(name);
    return s ? { type: s.data?.type, fonts: s.data?.fonts, samples: s.data?.samples, tag: s.data?.tag } : null;
  },
  /** superdough's own alias API, for the "does soundAlias work with soundfonts" check */
  soundAlias: (original: string, alias: string) => soundAlias(original, alias),
  exports: () => ({
    registerSynthSounds: typeof webaudio.registerSynthSounds,
    registerZZFXSounds: typeof webaudio.registerZZFXSounds,
    aliasBank: typeof webaudio.aliasBank,
    soundAlias: typeof webaudio.soundAlias,
    registerSound: typeof webaudio.registerSound,
    loadBuffer: typeof webaudio.loadBuffer,
    getSampleBuffer: typeof webaudio.getSampleBuffer,
    getSampleBufferSource: typeof webaudio.getSampleBufferSource,
    getLoadedBuffer: typeof webaudio.getLoadedBuffer,
    getSuperdoughAudioController: typeof webaudio.getSuperdoughAudioController,
    setSuperdoughAudioController: typeof webaudio.setSuperdoughAudioController,
    SuperdoughAudioController: typeof webaudio.SuperdoughAudioController,
    renderPatternAudio: typeof webaudio.renderPatternAudio,
    registerSoundfonts: typeof soundfonts.registerSoundfonts,
    setSoundfontUrl: typeof soundfonts.setSoundfontUrl,
    getFontBufferSource: typeof soundfonts.getFontBufferSource,
    getFontPitch: typeof soundfonts.getFontPitch,
    destinationGain: getSuperdoughAudioController().output.destinationGain?.constructor.name,
  }),
  /** what the string form of samples() does with `_base` (expected: registers a junk "_base" sound) */
  async junkBaseProbe() {
    await webaudio.samples("/sounds/v1/piano.json", "/sounds/v1/piano/");
    const junk = getSound("_base");
    const result = junk ? junk.data.samples : null;
    const all = { ...soundMap.get() };
    delete all._base;
    soundMap.set(all);
    return result;
  },
  /** master bus must survive resetGlobalEffects() */
  resetGlobalEffects() {
    const before = bus.attachCount();
    resetGlobalEffects();
    return { before, after: bus.attachCount() };
  },
  bus: () => ({
    attachCount: bus.attachCount(),
    reduction: bus.limiter.reduction,
    trimGain: bus.trim.gain.value,
    limiter: {
      threshold: bus.limiter.threshold.value,
      ratio: bus.limiter.ratio.value,
      channelCount: bus.limiter.channelCount,
      channelCountMode: bus.limiter.channelCountMode,
    },
    tapTracks: bus.tap.stream.getAudioTracks().length,
  }),
  audible,
  audibleTable,
  noiseFloorDb,
  /** two different offline renders in ONE realm would hit the node-pool bug; this probes a single frame */
  async renderStats(code: string) {
    const r = await renderInFrame(code);
    let sum = 0;
    for (const x of r.left) sum += x * x;
    return { haps: r.haps, rms: Math.sqrt(sum / r.left.length), samples: r.left.length, logs: r.logs };
  },
  /** probe: N offline renders in ONE realm (no fresh iframe in between) */
  async sameRealmProbe(code: string, repeat: number) {
    try {
      const r = await renderInFrame(code, 2.5, 1, 1, repeat);
      let sum = 0;
      for (const x of r.left) sum += x * x;
      return { ok: true, rms: Math.sqrt(sum / r.left.length), logs: r.logs.filter((l) => /error/i.test(l)) };
    } catch (err) {
      return { ok: false, error: String((err as Error).message) };
    }
  },
  swStats,
  precachePack: () => precachePack(manifest),
  packUrls: () => packUrls(manifest),
};

declare global {
  interface Window {
    oak: typeof api;
  }
}
window.oak = api;
document.getElementById("boot")?.addEventListener("click", () => void boot().then((r) => console.log("booted", r)));
