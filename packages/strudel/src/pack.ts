// Prebake from the self-hosted sound pack (architecture §6.2, promoted from spikes/s3-sounds/src/oak-audio.ts).
// Local only: every URL comes from `<soundsRoot>/manifest.json`, which `scripts/sounds/mirror.ts` writes.
//
// Gotchas kept (docs/spikes.md, s3):
// - `samples(url, base)` registers a junk `_base` sound: fetch the JSON ourselves, delete `_base`, call
//   `samples(object, base)`.
// - `registerSoundfonts()` registers all 125 gm_* names: keep only the mirrored ones and pin `n` onto the
//   mirrored upstream indices, otherwise `s("gm_violin")` would ask for a file the pack does not have.
// - `soundAlias` cannot pin a variant and does not lower-case: curated aliases use `registerSound` with
//   a variant-pinning wrapper, lower-case keys.
// - `aliasBank` copies entries that exist at call time: it runs after the sample maps.
import * as core from "@strudel/core";
import * as draw from "@strudel/draw";
import * as mini from "@strudel/mini";
import * as soundfonts from "@strudel/soundfonts";
import * as tonal from "@strudel/tonal";
import * as webaudio from "@strudel/webaudio";

export interface PackManifest {
  packVersion: string;
  publicRoot: string;
  sampleMaps: { json: string; base: string; tag?: string }[];
  bankAliases: string;
  soundfontUrl: string;
  soundfonts: Record<string, { upstreamIndex: number; font: string }[]>;
  aliases: Record<string, { gm: string; upstreamIndex: number; font: string }>;
}

export type HapValue = Record<string, unknown> & {
  s?: unknown;
  n?: unknown;
  bank?: unknown;
  note?: unknown;
  freq?: unknown;
};
type OnTrigger = (t: number, value: HapValue, onended: () => void, cps?: number) => unknown;
export interface SoundEntry {
  onTrigger: OnTrigger;
  data?: {
    type?: string;
    samples?: unknown;
    fonts?: string[];
    prebake?: boolean;
    tag?: string;
    baseUrl?: string;
  };
}

/**
 * Visual methods Oak never lets draw on Strudel's canvas (contracts §3.1 rule 9). `scope` and `fscope`
 * are routed to Oak's own panel by the adapter; every other one is identity.
 */
export const VISUAL_METHODS = [
  "pianoroll",
  "punchcard",
  "spiral",
  "pitchwheel",
  "wordfall",
  "scope",
  "tscope",
  "fscope",
  "spectrum",
  "markcss",
] as const;

/** `.scope()` and `.fscope()` call this during an evaluation; the adapter reads it in `afterEval`. */
export const scopeRequests = new Set<"scope" | "fscope">();

/** Replaces the visual methods (and their `_x` inline variants) on `Pattern.prototype`. */
export function stubVisualMethods(Pattern: { prototype: Record<string, unknown> }): void {
  for (const name of VISUAL_METHODS) {
    const panel =
      name === "scope" || name === "tscope"
        ? "scope"
        : name === "fscope" || name === "spectrum"
          ? "fscope"
          : null;
    const stub = panel
      ? function (this: unknown) {
          scopeRequests.add(panel);
          return this;
        }
      : function (this: unknown) {
          return this;
        };
    Pattern.prototype[name] = stub;
    Pattern.prototype[`_${name}`] = stub;
  }
}

/** The unmodified gm_* entries `registerSoundfonts()` created (their closures index the FULL upstream list). */
const upstream = new Map<string, SoundEntry>();

/** Wrap an upstream gm_* trigger so that `n` selects among `indices` (upstream variant numbers) only. */
export function pinVariant(entry: SoundEntry, indices: readonly number[]): OnTrigger {
  return (t, value, onended, cps) =>
    entry.onTrigger(t, { ...value, n: indices[core.getSoundIndex(value.n, indices.length)] }, onended, cps);
}

function curateSoundfonts(manifest: PackManifest): void {
  const all = webaudio.soundMap.get() as Record<string, SoundEntry>;
  const next: Record<string, SoundEntry> = {};
  for (const [key, entry] of Object.entries(all)) {
    if (entry.data?.type !== "soundfont") {
      next[key] = entry;
      continue;
    }
    const mirrored = manifest.soundfonts[key];
    if (!mirrored) continue; // not in the pack: unregistered, so it fails loudly ("sound gm_x not found")
    upstream.set(key, entry);
    next[key] = {
      onTrigger: pinVariant(
        entry,
        mirrored.map((m) => m.upstreamIndex),
      ),
      // `data.fonts` lists exactly the mirrored fonts, in `n` order (the preloader relies on this).
      data: { ...entry.data, fonts: mirrored.map((m) => m.font) },
    };
  }
  webaudio.soundMap.set(next);
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`@oak/strudel: ${url} answered HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** A URL must stay on this origin: the pack never points at a third-party host (contracts §11.2). */
export function assertLocal(url: string): void {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) && !url.startsWith(`${globalThis.location?.origin ?? "\u0000"}/`)) {
    throw new Error(`@oak/strudel: refusing remote sound URL ${url}`);
  }
}

/**
 * Prebake: evalScope, visual stubs, synths, soundfonts restricted to the mirrored instruments, sample
 * maps, bank aliases, curated aliases. Call once per realm (the adapter memoizes it).
 */
export async function prebake(soundsRoot: string): Promise<PackManifest> {
  const root = soundsRoot.replace(/\/+$/, "");
  await core.evalScope(core, mini, tonal, draw, webaudio, soundfonts);
  stubVisualMethods(core.Pattern);
  const manifest = await fetchJson<PackManifest>(`${root}/manifest.json`);
  for (const map of manifest.sampleMaps) {
    assertLocal(map.json);
    assertLocal(map.base);
  }
  assertLocal(manifest.soundfontUrl);

  webaudio.registerSynthSounds();
  webaudio.registerZZFXSounds();
  soundfonts.setSoundfontUrl(manifest.soundfontUrl);
  soundfonts.registerSoundfonts();
  curateSoundfonts(manifest);

  await Promise.all(
    manifest.sampleMaps.map(async ({ json, base, tag }) => {
      const map = await fetchJson<Record<string, unknown>>(json);
      delete map._base;
      await webaudio.samples(map, base, tag ? { prebake: true, tag } : { prebake: true });
    }),
  );
  await webaudio.aliasBank(manifest.bankAliases);

  for (const [alias, { gm, upstreamIndex, font }] of Object.entries(manifest.aliases)) {
    const original = upstream.get(gm);
    if (!original) throw new Error(`@oak/strudel: alias ${alias}: ${gm} is not in the pack`);
    webaudio.registerSound(alias.toLowerCase(), pinVariant(original, [upstreamIndex]), {
      type: "soundfont",
      prebake: true,
      fonts: [font],
      tag: "oak",
    });
  }
  return manifest;
}

/** Every registered sound name, sorted. */
export function soundNames(): string[] {
  return Object.keys(webaudio.soundMap.get() as Record<string, unknown>).sort();
}

/**
 * Every file of the pack: manifest, maps, bank aliases, every sample of every registered sample sound
 * and every mirrored font. Bytes come from a HEAD request (local, served with `content-length`).
 */
export async function packFileUrls(soundsRoot: string, manifest: PackManifest): Promise<string[]> {
  const root = soundsRoot.replace(/\/+$/, "");
  const urls = new Set<string>([`${root}/manifest.json`, manifest.bankAliases]);
  for (const map of manifest.sampleMaps) urls.add(map.json);
  const add = (u: unknown): void => {
    if (typeof u === "string") urls.add(encodeSoundPath(u));
  };
  for (const entry of Object.values(webaudio.soundMap.get() as Record<string, SoundEntry>)) {
    const data = entry.data;
    if (data?.type !== "sample") continue;
    const samples = data.samples;
    if (Array.isArray(samples)) samples.forEach(add);
    else if (samples && typeof samples === "object")
      for (const list of Object.values(samples)) (list as unknown[]).forEach(add);
  }
  for (const fonts of Object.values(manifest.soundfonts)) {
    for (const f of fonts) urls.add(`${manifest.soundfontUrl}/${f.font}.js`);
  }
  return [...urls].filter((u) => u.startsWith(`${root}/`)).sort();
}

/** superdough's own escaping before it fetches: `encodeURI`-like, plus `#`. */
export function encodeSoundPath(path: string): string {
  return encodeURI(decodeURI(path)).replace(/#/g, "%23");
}
