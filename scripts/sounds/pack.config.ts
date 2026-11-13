// Curated Oak sound pack definition. Shared by mirror.ts and check.ts.
// Bump PACK_VERSION whenever the file list or a derived file (manifest, maps) changes: the pack is served at
// /sounds/<PACK_VERSION>/ with `immutable` and cached CacheFirst by the Service Worker, so a path must never
// change content.
//
// v2 (Wave 3): `acgtr` alias; per-alias gain/release (loudness-matched, no click at note ends); the Oak
// jazz kit (`.bank("jazzkit")`, brushes and ride from the Roland MC-303 bank of tidal-drum-machines).
// v3 (Wave 4): `brk`, Oak's own one-bar break (scripts/sounds/brk.ts, CC0), in the `oak-rendered` map.

export const PACK_VERSION = "v3";

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
  // uzu-drumkit (Unlicense): default bd/sd/hh... kit. Its "brk" (a recording of the Amen break, whose
  // licence is not Oak's to give) and "misc" are pruned; Oak's `brk` is rendered (scripts/sounds/brk.ts).
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
 * Index 0 is always kept so plain `s("gm_xxx")` sounds like strudel.cc. The other entries are the curated
 * variants an Oak alias pins (see OAK_ALIASES). gm_electric_bass_finger index 1 is the upstream typo
 * ("0330_FluidR3_GM_sf2_fible", HTTP 404) and must never be listed.
 */
export const GM_VARIANTS: Record<string, number[]> = {
  gm_piano: [0], // 0000_JCLive
  gm_epiano1: [0, 1], // 0040_JCLive, 0040_FluidR3_GM (rhodes)
  gm_drawbar_organ: [0, 3], // 0160_JCLive (sounds an octave low), 0160_FluidR3_GM (organ)
  gm_acoustic_bass: [0, 1], // 0320_JCLive, 0320_FluidR3_GM (upright)
  gm_electric_bass_finger: [0, 3], // 0330_JCLive (fingerbass), 0330_GeneralUserGS  (NOT 1)
  gm_electric_bass_pick: [0, 1], // 0340_JCLive (ebass), 0340_FluidR3_GM
  gm_electric_guitar_jazz: [0, 3], // 0260_JCLive (jazzgtr), 0260_FluidR3_GM
  gm_electric_guitar_clean: [0], // 0270_Aspirin (cleangtr; 0270_Stratocaster sounded an octave low, +12 c)
  gm_overdriven_guitar: [0], // 0290_FluidR3_GM (crunch; 0290_LesPaul's zones above E4 die within 0.3 s)
  gm_acoustic_guitar_steel: [0, 5], // 0253_Acoustic_Guitar (−14 c at A2), 0250_LK_AcousticSteel (acgtr)
  gm_string_ensemble_1: [0], // 0480_Aspirin (strings; 0480_JCLive was +10..+13 c)
  gm_brass_section: [0, 3], // 0610_JCLive (+6..+8 c), 0610_FluidR3_GM (horns)
  gm_tenor_sax: [0, 3], // 0660_JCLive (tenor), 0660_GeneralUserGS
  gm_trumpet: [0, 1], // 0560_FluidR3_GM (trumpet), 0560_JCLive
  gm_choir_aahs: [0, 2], // 0520_Aspirin (choir; 0520_Soul_Ahhs was −5..+14 c), 0520_FluidR3_GM
  gm_clavinet: [0], // 0070_JCLive (clav)
  gm_pad_warm: [0], // 0890_JCLive (pad)
  gm_muted_trumpet: [0], // 0590_JCLive (mutetpt)
  gm_vibraphone: [0, 3], // 0110_JCLive (sounds two octaves high), 0110_FluidR3_GM (vibes)
  gm_flute: [0, 2], // 0730_JCLive, 0730_FluidR3_GM
};

/**
 * A curated Oak instrument: the gm font it pins and how it is played. Written into the pack manifest, so the
 * prebake, the preloader and the sound-quality harness read the same table.
 */
export interface AliasSpec {
  gm: string;
  /** Upstream variant index in gm.mjs (must be mirrored in GM_VARIANTS). */
  variant: number;
  /** Linear output gain: loudness-matched to the piano (sound-quality.json, ±1.5 LU). Default 1. */
  gain?: number;
  /** Release (s) when the code sets none: the soundfont default (10 ms) clicks on plucked and low notes. */
  release?: number;
  /** MIDI range a by-name preload warms, every semitone (default 36–84). */
  range?: [number, number];
}

/**
 * Curated Oak instrument names. Variants, gains and releases come from the sound-quality harness
 * (`packages/strudel/e2e/quality.pw.ts`, results in `packages/strudel/sound-quality.json`): every alias's
 * first partial within ±10 cents of equal temperament at A2/A3/A4 (A1/A2/A3 for basses), in the octave it
 * claims, no click at note ends, loudness within ±1.5 LU of the piano. Wave 4 also matches the chord
 * instruments on triads (packages/strudel/e2e/wave4.pw.ts, ±3 LU of the piano's chords): rhodes 0.56 → 0.6
 * and acgtr 2.26 → 1.95 (its chords peaked at −0.9 dBFS), both still within ±1.5 LU on a melody.
 */
export const OAK_ALIASES: Record<string, AliasSpec> = {
  rhodes: { gm: "gm_epiano1", variant: 1, gain: 0.6 },
  upright: { gm: "gm_acoustic_bass", variant: 1, range: [24, 67] },
  ebass: { gm: "gm_electric_bass_pick", variant: 0, gain: 1.13, range: [24, 67] },
  fingerbass: { gm: "gm_electric_bass_finger", variant: 0, range: [24, 67] },
  organ: { gm: "gm_drawbar_organ", variant: 3, gain: 1.46 },
  acgtr: { gm: "gm_acoustic_guitar_steel", variant: 5, gain: 1.95, range: [40, 88] },
  jazzgtr: { gm: "gm_electric_guitar_jazz", variant: 0, gain: 1.19, range: [40, 88] },
  cleangtr: { gm: "gm_electric_guitar_clean", variant: 0, gain: 0.69, range: [40, 88] },
  crunch: { gm: "gm_overdriven_guitar", variant: 0, gain: 0.58, range: [40, 88] },
  strings: { gm: "gm_string_ensemble_1", variant: 0, gain: 0.86 },
  horns: { gm: "gm_brass_section", variant: 3, range: [48, 84] },
  trumpet: { gm: "gm_trumpet", variant: 0, range: [52, 88] },
  tenor: { gm: "gm_tenor_sax", variant: 0, gain: 0.67, range: [44, 80] },
  vibes: { gm: "gm_vibraphone", variant: 3, range: [53, 89] },
  mutetpt: { gm: "gm_muted_trumpet", variant: 0, gain: 0.59, range: [52, 84] },
  clav: { gm: "gm_clavinet", variant: 0, gain: 0.72 },
  pad: { gm: "gm_pad_warm", variant: 0 },
  choir: { gm: "gm_choir_aahs", variant: 0 },
};

/** One role of an Oak kit: upstream files (paths inside the kit's sample map) and a level trim. */
export interface KitRole {
  files: string[];
  /**
   * Linear gain of every hit of this role, or one per file (in `n` order): the upstream samples are all
   * peak-normalised, so the kit's balance is set here (sound-quality.json, "jazzkit").
   */
  gain: number | number[];
}

export interface KitSpec {
  /** The upstream sample map the files come from (provenance: each file must be listed there). */
  json: string;
  /** Its directory below SAMPLE_CDN, reused in the pack (files are shared with that map's mirror). */
  dir: string;
  source: string;
  licence: string;
  roles: Partial<Record<(typeof DRUM_ROLES)[number], KitRole>>;
}

const MC303 = "RolandMC303/rolandmc303";

/**
 * Oak's own kits, `.bank("<name>")`. Roles a kit does not define fall back to the default kit (uzu-drumkit).
 * jazzkit: the brushes, ride, cross-stick and acoustic toms of the Roland MC-303 bank in tidal-drum-machines
 * (the upstream the pack already mirrors for TR-909/808/707, LinnDrum and AkaiLinn).
 */
export const OAK_KITS: Record<string, KitSpec> = {
  jazzkit: {
    json: "tidal-drum-machines.json",
    dir: "tidal-drum-machines/machines/",
    source:
      "tidal-drum-machines (github.com/ritchse/tidal-drum-machines) via strudel.b-cdn.net, Roland MC-303 bank",
    licence: "as the rest of tidal-drum-machines in this pack (redistributed by the Strudel project)",
    roles: {
      bd: { files: [`${MC303}-bd/Drybd2.wav`], gain: 0.59 },
      sd: {
        files: [`${MC303}-sd/Brushtap.wav`, `${MC303}-sd/Brushslp.wav`, `${MC303}-perc/Brushswi.wav`],
        gain: [0.76, 1.19, 0.33],
      },
      rim: { files: [`${MC303}-rim/Rimsd2.wav`, `${MC303}-rim/Rimsd1.wav`], gain: 0.43 },
      hh: { files: [`${MC303}-hh/Realch1.wav`, `${MC303}-hh/Realch2.wav`], gain: 0.59 },
      oh: { files: [`${MC303}-oh/Roomoh.wav`, `${MC303}-oh/Realoh1.wav`], gain: [0.37, 0.2] },
      rd: { files: [`${MC303}-rd/Ridecymb.wav`, `${MC303}-rd/Ridecym2.wav`], gain: [0.6, 0.5] },
      lt: { files: [`${MC303}-lt/Aclotom1.wav`], gain: 0.8 },
      mt: { files: [`${MC303}-mt/Acmidtom.wav`], gain: 0.89 },
      ht: { files: [`${MC303}-ht/Achitom1.wav`], gain: 0.78 },
      sh: { files: [`${MC303}-sh/Shaker.wav`], gain: 0.34 },
      tb: { files: [`${MC303}-tb/Tambouri.wav`], gain: 0.41 },
      cb: { files: [`${MC303}-cb/Cowbell.wav`], gain: 0.37 },
      cp: { files: [`${MC303}-cp/Realclap.wav`], gain: 0.59 },
    },
  },
};

/** The derived sample map of an Oak kit (keys `<kit>_<role>`), at the pack root. */
export const kitJson = (kit: string): string => `oak-kit-${kit}.json`;

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
  /** curated alias -> pinned font, and how it is played */
  aliases: Record<
    string,
    {
      gm: string;
      upstreamIndex: number;
      font: string;
      gain?: number;
      release?: number;
      range?: [number, number];
    }
  >;
  /** `<kit>_<role>` -> linear gain of an Oak kit's role (the kit's map is one of `sampleMaps`) */
  kitGains?: Record<string, number | number[]>;
}
