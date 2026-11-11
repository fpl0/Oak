// Sound randomization pools (exercises §4.1) as Oak sound IDs, and their Strudel names. Levels name their
// instruments as `SoundId[]`; a generator picks one per trial (randomization code I) and one drum kit
// per trial (code D).
import type { SoundId } from "@oak/content-kit";

export const KEYS1: SoundId[] = ["snd.piano"];
export const KEYS2: SoundId[] = [...KEYS1, "snd.rhodes", "snd.organ"];
export const KEYS3: SoundId[] = [...KEYS2, "snd.cleangtr", "snd.jazzgtr", "snd.wave.triangle"];
export const BASS: SoundId[] = ["snd.ebass", "snd.upright"];
export const LEAD: SoundId[] = ["snd.piano", "snd.tenor", "snd.horns", "snd.cleangtr", "snd.wave.square"];
/** Chord instruments for the cadence context of ear families (sustained, clear attack). */
export const CADENCE_SOUNDS: readonly string[] = ["piano", "rhodes"];

/** Drum kits: `null` is the default (uzu) kit, the rest are full bank names. */
export const KITS: readonly (string | null)[] = [
  null,
  "RolandTR909",
  "RolandTR808",
  "LinnDrum",
  "AkaiLinn",
  "RolandTR707",
];
/** Early kits only: before U01.L09 the learner has heard the default kit, the 909 and the 808. */
export const EARLY_KITS: readonly (string | null)[] = [null, "RolandTR909", "RolandTR808"];
export const CLICKS: readonly string[] = ["rim", "cp", "hh"];

/** Strudel sound name of an Oak sound ID: `snd.piano` → `piano`, `snd.wave.sine` → `sine`, `snd.drum.bd` → `bd`. */
export function soundName(id: SoundId): string {
  const parts = id.split(".");
  return parts[parts.length - 1] as string;
}
/** The preload key superdough uses for a drum in a bank: `RolandTR909_bd`. */
export const drumKey = (s: string, bank: string | null | undefined): string => (bank ? `${bank}_${s}` : s);
