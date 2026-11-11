// Curated Oak sound pack definition. Shared by mirror.ts and check.ts.
// Bump PACK_VERSION whenever the file list changes: the pack is served at /sounds/<PACK_VERSION>/ and
// cached CacheFirst by the Service Worker, so a path must never change content.

export const PACK_VERSION = "v1";

/** Public URL prefix the app serves the pack from. Every rewritten `_base` starts with this. */
export const PUBLIC_ROOT = `/sounds/${PACK_VERSION}`;

/** Hosts the strudel.cc REPL prebake uses (website/src/repl/prebake.mjs: baseCDN). */
export const SAMPLE_CDN = "https://strudel.b-cdn.net";
/** Default soundfontUrl in @strudel/soundfonts/fontloader.mjs. */
export const SOUNDFONT_CDN = "https://felixroos.github.io/webaudiofontdata/sound";

/** Drum roles Oak teaches (PLAN.md 12: "The drum set includes sh, cb and tb"). */
export const DRUM_ROLES = [
  "bd",
  "sd",
  "hh",
  "oh",
  "cp",
  "rim",
  "cr",
  "rd",
  "lt",
  "mt",
  "ht",
  "sh",
  "cb",
  "tb",
] as const;

/** tidal-drum-machines banks kept (out of 71 upstream). */
export const DRUM_BANKS = ["RolandTR909", "RolandTR808", "LinnDrum", "AkaiLinn", "RolandTR707"] as const;

/**
 * Upstream banks carry up to 25 variations per role (TR808 bd/sd/cr). We keep the first N so that
 * `s("bd:0..N-1")` matches strudel.cc; higher indices wrap (superdough getSoundIndex is modulo).
 */
export const MAX_VARIANTS_PER_ROLE = 4;

export interface SampleMapSpec {
  /** file name of the map, both upstream (`${SAMPLE_CDN}/${json}`) and in the pack */
  json: string;
  /** directory below SAMPLE_CDN the REPL prebake passes as baseUrl; reused as the pack directory */
  dir: string;
  /** which keys to keep, and how many variations of each */
  keep: (key: string) => number;
}

const drumRoles = new Set<string>(DRUM_ROLES);
const drumBanks = new Set<string>(DRUM_BANKS);

export const SAMPLE_MAPS: SampleMapSpec[] = [
  // Salamander Grand Piano V3 (CC-BY 3.0, Alexander Holm) - one velocity layer, 29 pitches
  { json: "piano.json", dir: "piano/", keep: () => Number.POSITIVE_INFINITY },
  // uzu-drumkit (Unlicense): default bd/sd/hh... kit. "brk" (amen break) and "misc" are pruned.
  {
    json: "uzu-drumkit.json",
    dir: "uzu-drumkit/",
    keep: (key) => (drumRoles.has(key) ? Number.POSITIVE_INFINITY : 0),
  },
  // tidal-drum-machines: 5 banks x Oak roles x first MAX_VARIANTS_PER_ROLE files. "perc"/"misc"/"fx" pruned.
  {
    json: "tidal-drum-machines.json",
    dir: "tidal-drum-machines/machines/",
    keep: (key) => {
      const i = key.indexOf("_");
      const bank = key.slice(0, i);
      const role = key.slice(i + 1);
      return drumBanks.has(bank) && drumRoles.has(role) ? MAX_VARIANTS_PER_ROLE : 0;
    },
  },
];

/** Upstream `aliasBank` map (RolandTR909 -> TR909 ...); pruned to DRUM_BANKS. */
export const BANK_ALIAS_JSON = "tidal-drum-machines-alias.json";

/**
 * gm_* instruments and the variant indices (positions in @strudel/soundfonts/gm.mjs) that are mirrored.
 * Index 0 is always kept so plain `s("gm_xxx")` sounds like strudel.cc. The second entry is the curated
 * variant an Oak alias pins (see OAK_ALIASES). gm_electric_bass_finger index 1 is the upstream typo
 * ("0330_FluidR3_GM_sf2_fible", HTTP 404) and must never be listed.
 */
export const GM_VARIANTS: Record<string, number[]> = {
  gm_piano: [0], // 0000_JCLive
  gm_epiano1: [0, 1], // 0040_JCLive, 0040_FluidR3_GM (rhodes)
  gm_drawbar_organ: [0, 3], // 0160_JCLive (organ), 0160_FluidR3_GM
  gm_acoustic_bass: [0, 1], // 0320_JCLive, 0320_FluidR3_GM (upright)
  gm_electric_bass_finger: [0, 3], // 0330_JCLive, 0330_GeneralUserGS  (NOT 1)
  gm_electric_bass_pick: [0, 1], // 0340_JCLive (ebass), 0340_FluidR3_GM
  gm_electric_guitar_jazz: [0, 3], // 0260_JCLive (jazzgtr), 0260_FluidR3_GM
  gm_electric_guitar_clean: [0, 5], // 0270_Aspirin, 0270_Stratocaster (cleangtr)
  gm_overdriven_guitar: [0, 4], // 0290_FluidR3_GM, 0290_LesPaul (crunch)
  gm_acoustic_guitar_steel: [0], // 0253_Acoustic_Guitar
  gm_string_ensemble_1: [0, 4], // 0480_Aspirin, 0480_JCLive (strings)
  gm_brass_section: [0, 4], // 0610_JCLive (horns), 0610_GeneralUserGS
  gm_tenor_sax: [0, 3], // 0660_JCLive (tenor), 0660_GeneralUserGS
  gm_trumpet: [0, 1], // 0560_FluidR3_GM, 0560_JCLive
  gm_choir_aahs: [0, 2], // 0520_Aspirin, 0520_FluidR3_GM
  gm_vibraphone: [0, 3], // 0110_JCLive, 0110_FluidR3_GM
  gm_flute: [0, 2], // 0730_JCLive, 0730_FluidR3_GM
};

/**
 * Curated Oak instrument names -> [gm name, upstream variant index]. Written into the pack manifest so
 * the prebake and the toolbox lint read the same table. Variants are NOT auditioned yet (listening pass).
 */
export const OAK_ALIASES: Record<string, [gm: string, upstreamIndex: number]> = {
  rhodes: ["gm_epiano1", 1],
  upright: ["gm_acoustic_bass", 1],
  ebass: ["gm_electric_bass_pick", 0],
  organ: ["gm_drawbar_organ", 0],
  jazzgtr: ["gm_electric_guitar_jazz", 0],
  cleangtr: ["gm_electric_guitar_clean", 5],
  crunch: ["gm_overdriven_guitar", 4],
  strings: ["gm_string_ensemble_1", 4],
  horns: ["gm_brass_section", 0],
  tenor: ["gm_tenor_sax", 0],
};

export interface LockFile {
  path: string;
  sourceUrl: string;
  bytes: number;
  sha256: string;
  /** true when the file is generated/rewritten by mirror.ts instead of copied byte-for-byte */
  derived?: true;
}

export interface PackLock {
  packVersion: string;
  publicRoot: string;
  totalBytes: number;
  fileCount: number;
  groups: Record<string, { files: number; bytes: number }>;
  files: LockFile[];
}

export interface PackManifest {
  packVersion: string;
  publicRoot: string;
  /** sample maps to pass to superdough `samples(json, base)` */
  sampleMaps: { json: string; base: string; tag?: string }[];
  /** argument for superdough `aliasBank(url)` */
  bankAliases: string;
  /** argument for `setSoundfontUrl` (no trailing slash; loader appends `/${font}.js`) */
  soundfontUrl: string;
  /** gm name -> mirrored fonts, in upstream order */
  soundfonts: Record<string, { upstreamIndex: number; font: string }[]>;
  /** curated alias -> pinned font */
  aliases: Record<string, { gm: string; upstreamIndex: number; font: string }>;
}
