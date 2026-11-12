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
  aliases: Record<string, AliasEntry>;
  /** `<kit>_<role>` -> linear gain (Oak kits, `.bank("jazzkit")`). Absent in v1 packs. */
  kitGains?: Record<string, number | number[]>;
}

/** A curated alias in the manifest (`scripts/sounds/pack.config.ts` `OAK_ALIASES`). */
export interface AliasEntry {
  gm: string;
  upstreamIndex: number;
  font: string;
  /** Linear output gain (loudness match). */
  gain?: number;
  /** Release (s) used when the code sets none. */
  release?: number;
  /** MIDI range a by-name preload warms. */
  range?: [number, number];
}

type SoundHandle = { node?: AudioNode; [k: string]: unknown } | undefined;

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
    /** Oak aliases: the MIDI range a by-name preload warms. */
    range?: [number, number];
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

/**
 * Wrap an upstream gm_* trigger so that `n` selects among `indices` (upstream variant numbers) only.
 * `defaults` fills controls the code did not set (an alias's release).
 */
export function pinVariant(
  entry: SoundEntry,
  indices: readonly number[],
  defaults: Record<string, unknown> = {},
): OnTrigger {
  return (t, value, onended, cps) => {
    const v: HapValue = { ...value, n: indices[core.getSoundIndex(value.n, indices.length)] };
    for (const [k, d] of Object.entries(defaults)) if (v[k] === undefined) v[k] = d;
    return entry.onTrigger(t, v, onended, cps);
  };
}

/**
 * A trigger whose output passes through a fixed gain (an alias's or a kit role's level trim). The handle's
 * `node` becomes the gain node, so superdough's chain (velocity, gain, effects) follows the trim.
 */
export function withOutputGain(trigger: OnTrigger, gain: number | ((value: HapValue) => number)): OnTrigger {
  if (gain === 1) return trigger;
  return async (t, value, onended, cps) => {
    const handle = (await trigger(t, value, onended, cps)) as SoundHandle;
    const node = handle?.node;
    if (!handle || !node) return handle;
    const trim = node.context.createGain();
    trim.gain.value = typeof gain === "number" ? gain : gain(value);
    node.connect(trim);
    return { ...handle, node: trim };
  };
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
  registerOakKits();
  trimKits(manifest.kitGains ?? {});

  for (const [alias, a] of Object.entries(manifest.aliases)) {
    const original = upstream.get(a.gm);
    if (!original) throw new Error(`@oak/strudel: alias ${alias}: ${a.gm} is not in the pack`);
    const defaults = a.release !== undefined ? { release: a.release } : {};
    webaudio.registerSound(
      alias.toLowerCase(),
      withOutputGain(pinVariant(original, [a.upstreamIndex], defaults), a.gain ?? 1),
      {
        type: "soundfont",
        prebake: true,
        fonts: [a.font],
        tag: "oak",
        ...(a.range ? { range: a.range } : {}),
      },
    );
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

/** The drum roles an Oak kit maps (contracts §3.2 `snd.drum.*`). */
const KIT_ROLES = [
  "bd",
  "sd",
  "hh",
  "oh",
  "rd",
  "cr",
  "cp",
  "rim",
  "lt",
  "mt",
  "ht",
  "sh",
  "cb",
  "tb",
] as const;

/** Oak's kits (`.bank("<kit>")`); their samples come from the pack's `oak-kit-<kit>.json` maps. */
export const OAK_KITS = ["jazzkit"] as const;

/**
 * Every role an Oak kit's map does not define falls back to the default kit (uzu-drumkit), so `.bank("jazzkit")`
 * never goes silent on a role (the brushes kit has no crash; a v1 pack has no kit map at all).
 */
export function registerOakKits(): void {
  const map = webaudio.soundMap.get() as Record<string, unknown>;
  for (const kit of OAK_KITS)
    for (const role of KIT_ROLES)
      if (map[role] && !map[`${kit}_${role}`]) webaudio.soundAlias(role, `${kit}_${role}`);
}

/** The trim of one hit: a role's single gain, or the gain of the variant `n` selects (wrapping like superdough). */
export function kitGainOf(gain: number | readonly number[], n: unknown): number {
  if (typeof gain === "number") return gain;
  if (gain.length === 0) return 1;
  return gain[core.getSoundIndex(n, gain.length)] ?? 1;
}

/** Applies the manifest's per-role level trims to the kit sounds (data kept: the preloader reads it). */
export function trimKits(gains: Record<string, number | number[]>): void {
  for (const [key, gain] of Object.entries(gains)) {
    const entry = webaudio.getSound(key) as SoundEntry | undefined;
    if (!entry || gain === 1) continue;
    webaudio.registerSound(
      key,
      withOutputGain(entry.onTrigger, (v) => kitGainOf(gain, v.n)),
      entry.data ?? {},
    );
  }
}
