// S3 spike: the pieces the production @oak/strudel adapter should copy.
//   prebake()            local-only sound registration (samples, soundfonts, bank aliases, Oak aliases)
//   preload()/preloadPattern()  warm sample + soundfont buffers before playback
//   installMasterBus()   limiter + analyser + MediaStream tap after superdough's destinationGain
//
// Everything Strudel-facing is imported from @strudel/webaudio (which re-exports superdough) so there is
// exactly one superdough instance. Never import "superdough/*.mjs" source files: they are second copies.

import { getSoundIndex } from "@strudel/core";
import { getFontBufferSource, registerSoundfonts, setSoundfontUrl } from "@strudel/soundfonts";
import {
  aliasBank,
  getAudioContext,
  getSampleBuffer,
  getSound,
  getSuperdoughAudioController,
  registerSound,
  registerSynthSounds,
  registerZZFXSounds,
  samples,
  soundAlias,
  soundMap,
} from "@strudel/webaudio";

export interface PackManifest {
  packVersion: string;
  publicRoot: string;
  sampleMaps: { json: string; base: string; tag?: string }[];
  bankAliases: string;
  soundfontUrl: string;
  soundfonts: Record<string, { upstreamIndex: number; font: string }[]>;
  aliases: Record<string, { gm: string; upstreamIndex: number; font: string }>;
}

type HapValue = Record<string, unknown> & { s?: string; n?: number; bank?: string; note?: string | number };
type OnTrigger = (t: number, value: HapValue, onended: () => void, cps?: number) => unknown;
interface SoundEntry {
  onTrigger: OnTrigger;
  data: { type?: string; samples?: unknown; fonts?: string[]; prebake?: boolean; tag?: string };
}

export const PACK_ROOT = "/sounds/v1";

let prebaked: Promise<PackManifest> | undefined;

/** One shared, idempotent prebake promise (StrudelMirror calls `prebake` per editor). */
export function prebake(root = PACK_ROOT): Promise<PackManifest> {
  prebaked ??= doPrebake(root);
  return prebaked;
}

async function doPrebake(root: string): Promise<PackManifest> {
  const manifest = (await fetch(`${root}/manifest.json`).then((r) => r.json())) as PackManifest;

  // 1. synths (no network)
  registerSynthSounds();
  registerZZFXSounds();

  // 2. soundfonts: point the loader at the pack, register all 125 gm_* names, then keep ONLY mirrored
  //    fonts. Without this step `s("gm_violin")` or `s("gm_piano:7")` would fetch a file we do not have.
  setSoundfontUrl(manifest.soundfontUrl);
  registerSoundfonts();
  curateSoundfonts(manifest);

  // 3. sample maps. We fetch the JSON ourselves and strip `_base` before handing the object to
  //    samples(): the string form `samples(url, base)` registers a junk sound literally named "_base".
  await Promise.all(
    manifest.sampleMaps.map(async ({ json, base, tag }) => {
      const map = (await fetch(json).then((r) => r.json())) as Record<string, unknown>;
      delete map._base;
      await samples(map, base, { prebake: true, tag });
    }),
  );

  // 4. bank aliases (RolandTR909 -> TR909 ...). Must run AFTER the samples are registered: aliasBank
  //    copies the sound entries that exist at call time.
  await aliasBank(manifest.bankAliases);

  // 5. curated Oak instrument names, each pinned to one font variant
  for (const [alias, { gm, upstreamIndex, font }] of Object.entries(manifest.aliases)) {
    const original = upstream.get(gm);
    if (!original) throw new Error(`[oak] alias ${alias}: ${gm} is not registered`);
    registerSound(alias, pinVariant(original, [upstreamIndex]), {
      type: "soundfont",
      prebake: true,
      fonts: [font],
      tag: "oak",
    });
  }
  return manifest;
}

/** the unmodified gm_* entries registerSoundfonts() created (their closures index the FULL upstream list) */
const upstream = new Map<string, SoundEntry>();

/** Wrap an upstream gm_* trigger so that `n` selects among `indices` (upstream variant numbers) only. */
function pinVariant(entry: SoundEntry, indices: number[]): OnTrigger {
  return (t, value, onended, cps) =>
    entry.onTrigger(t, { ...value, n: indices[getSoundIndex(value.n, indices.length)] }, onended, cps);
}

function curateSoundfonts(manifest: PackManifest) {
  const all = soundMap.get() as Record<string, SoundEntry>;
  const next: Record<string, SoundEntry> = {};
  for (const [key, entry] of Object.entries(all)) {
    if (entry.data?.type !== "soundfont") {
      next[key] = entry;
      continue;
    }
    const mirrored = manifest.soundfonts[key];
    if (!mirrored) continue; // not in the pack: unregister so it fails loudly ("sound gm_x not found")
    upstream.set(key, entry);
    next[key] = {
      onTrigger: pinVariant(
        entry,
        mirrored.map((m) => m.upstreamIndex),
      ),
      // data.fonts now lists exactly the mirrored fonts, in `n` order (the preloader relies on this)
      data: { ...entry.data, fonts: mirrored.map((m) => m.font) },
    };
  }
  soundMap.set(next);
}

// ---------------------------------------------------------------------------------------------
// Preloader
// ---------------------------------------------------------------------------------------------

export interface PreloadReport {
  warmed: number;
  synths: number;
  missing: string[];
  ms: number;
}

/** Warm the buffer one hap value will need. Mirrors what superdough does at trigger time. */
async function warmValue(value: HapValue): Promise<"warmed" | "synth" | "missing"> {
  let { s } = value;
  if (typeof s !== "string" || ["-", "~", "_"].includes(s)) return "synth";
  if (value.bank) s = `${value.bank}_${s}`;
  const sound = getSound(s) as SoundEntry | undefined;
  if (!sound) return "missing";
  const { type, samples: bank, fonts } = sound.data ?? {};
  if (type === "sample") {
    // resolves url (pitched maps pick the closest note), fetches + decodes, caches by url
    await getSampleBuffer({ ...value, s }, bank);
    return "warmed";
  }
  if (type === "soundfont" && fonts?.length) {
    const font = fonts[getSoundIndex(value.n, fonts.length)];
    // fetches + evals the font once, then decodes the zone for this exact midi pitch (cached per pitch)
    await getFontBufferSource(font, value, getAudioContext());
    return "warmed";
  }
  return "synth"; // oscillators, zzfx, noise: nothing to load
}

async function warmAll(values: HapValue[]): Promise<PreloadReport> {
  const t0 = performance.now();
  const report: PreloadReport = { warmed: 0, synths: 0, missing: [], ms: 0 };
  const seen = new Set<string>();
  const unique = values.filter((v) => {
    const key = JSON.stringify([v.bank, v.s, v.n, v.note, v.freq]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  await Promise.all(
    unique.map(async (v) => {
      const r = await warmValue(v);
      if (r === "warmed") report.warmed++;
      else if (r === "synth") report.synths++;
      else report.missing.push(String(v.bank ? `${v.bank}_${v.s}` : v.s));
    }),
  );
  report.ms = Math.round(performance.now() - t0);
  return report;
}

/**
 * preload(["piano", "rhodes", "RolandTR909_bd", "hh:2"], ["c3", "e3", 67])
 * Each sound is warmed at every pitch (pitches only matter for pitched samples and soundfonts).
 */
export function preload(sounds: string[], pitches: (string | number)[] = ["c3"]): Promise<PreloadReport> {
  const values: HapValue[] = [];
  for (const spec of sounds) {
    const [s, n] = spec.split(":");
    for (const note of pitches) values.push({ s, n: n === undefined ? 0 : Number(n), note });
  }
  return warmAll(values);
}

/** Exact preload: query the pattern and warm precisely the (s, n, note) combinations it will trigger. */
export function preloadPattern(
  pattern: { queryArc: (b: number, e: number) => { value: HapValue; hasOnset: () => boolean }[] },
  fromCycle = 0,
  toCycle = 4,
): Promise<PreloadReport> {
  const values = pattern
    .queryArc(fromCycle, toCycle)
    .filter((h) => h.hasOnset() && h.value && typeof h.value === "object")
    .map((h) => h.value);
  return warmAll(values);
}

// ---------------------------------------------------------------------------------------------
// Master bus
// ---------------------------------------------------------------------------------------------

export interface MasterBus {
  limiter: DynamicsCompressorNode;
  /** undoes the DynamicsCompressor's built-in makeup gain so quiet material passes at unity */
  trim: GainNode;
  /** post-limiter (what the speakers and the recorder get) */
  analyser: AnalyserNode;
  /** pre-limiter (superdough's raw mix) */
  preAnalyser: AnalyserNode;
  tap: MediaStreamAudioDestinationNode;
  /** how many times the bus was (re)attached to a fresh destinationGain */
  attachCount: () => number;
}

export const LIMITER = { threshold: -3, knee: 0, ratio: 20, attack: 0.003, release: 0.1 } as const;

/**
 * Web Audio spec, DynamicsCompressorNode "makeup gain": (1 / curve(1.0)) ** 0.6, applied to everything,
 * even below threshold. For a hard knee curve(0 dBFS) = threshold + (0 - threshold) / ratio (in dB).
 */
export function limiterMakeupDb({ threshold, ratio }: { threshold: number; ratio: number }): number {
  const fullRangeDb = threshold - threshold / ratio;
  return -fullRangeDb * 0.6;
}

/**
 * superdough graph tail (1.3.0): orbits -> channelMerger -> destinationGain -> ctx.destination.
 * We re-route: destinationGain -> limiter -> trim -> { ctx.destination, analyser, MediaStream tap }.
 * resetGlobalEffects() rebuilds destinationGain (SuperdoughOutput.reset -> initializeAudio), so we hook
 * initializeAudio on the output instance and re-attach automatically.
 */
export function installMasterBus(ctx: AudioContext): MasterBus {
  const limiter = new DynamicsCompressorNode(ctx, LIMITER);
  const trim = new GainNode(ctx, { gain: 10 ** (-limiterMakeupDb(LIMITER) / 20) });
  const analyser = new AnalyserNode(ctx, { fftSize: 2048, smoothingTimeConstant: 0 });
  const preAnalyser = new AnalyserNode(ctx, { fftSize: 2048, smoothingTimeConstant: 0 });
  const tap = ctx.createMediaStreamDestination();
  limiter.connect(trim);
  trim.connect(ctx.destination);
  trim.connect(analyser);
  trim.connect(tap);

  let attached = 0;
  const output = getSuperdoughAudioController().output;
  const attach = () => {
    output.destinationGain.disconnect(); // was: -> ctx.destination
    output.destinationGain.connect(limiter);
    output.destinationGain.connect(preAnalyser);
    attached++;
  };
  const initializeAudio = output.initializeAudio.bind(output);
  output.initializeAudio = () => {
    initializeAudio();
    attach();
  };
  attach();
  return { limiter, trim, analyser, preAnalyser, tap, attachCount: () => attached };
}

/** RMS + peak of the analyser's current time-domain window. */
export function level(analyser: AnalyserNode): { rms: number; peak: number } {
  const buf = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  let peak = 0;
  for (const x of buf) {
    sum += x * x;
    peak = Math.max(peak, Math.abs(x));
  }
  return { rms: Math.sqrt(sum / buf.length), peak };
}

/** Poll the analyser for `ms` and return the loudest window. */
export async function measure(analyser: AnalyserNode, ms: number): Promise<{ rms: number; peak: number; windows: number }> {
  const end = performance.now() + ms;
  let rms = 0;
  let peak = 0;
  let windows = 0;
  while (performance.now() < end) {
    const l = level(analyser);
    rms = Math.max(rms, l.rms);
    peak = Math.max(peak, l.peak);
    windows++;
    await new Promise((r) => setTimeout(r, 20));
  }
  return { rms, peak, windows };
}

/** Record the master bus for `ms` via MediaRecorder on the tap. */
export function record(tap: MediaStreamAudioDestinationNode, ms: number): Promise<Blob> {
  const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
  const recorder = new MediaRecorder(tap.stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  return new Promise((resolve, reject) => {
    recorder.onerror = (e) => reject(e);
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType }));
    recorder.start();
    setTimeout(() => recorder.stop(), ms);
  });
}

export { soundAlias, soundMap, getSound };
