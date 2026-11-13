// Oak's own renditions of the whole folk tunes U07, X1 and ladder L5 use (contracts §2.4, §2.8, §2.9): a
// `song.ts` per song, built from its registry entry (content/repertoire/index.ts), so title, year, status,
// provenance, key, meter, pickup and form are stated once.
//
// A setting is the tune in degrees (`n`, one cycle a bar, the pickup bar first when the song has one), the
// harmony as one Roman numeral a bar, and the phrases. From those come the three layers a transcription
// checks (melody, a root bass, block chords), the full reference code and the lead-sheet chart. Every
// setting is in plain rhythm, because X1 and the L5 gym come before U13 (contracts §2.8: no dots, no ties,
// nothing over a bar line); `setting` says in words where it departs from the source. The harmony is Oak's
// plain accompaniment in diatonic triads, one a bar (`harmony` below says where a source differs), not a
// transcription of any printed accompaniment.
//
// `verifiedBy` is required by the schema. No human has checked these answer keys against the cited
// editions yet: every registry entry stays `verified: false` and every song says "pending". The notes are
// cross-checked by songs.test.ts against a transcription written separately in 1-based degrees and beats,
// and against the notes of a second, independent edition in its own key.
import { defineSong, type SongDef, type SongId } from "@oak/content-kit";
import { PENDING_VERIFIER } from "./fragment.ts";
import { songById } from "./index.ts";

/** Diatonic triads of a major key, by numeral: the scale step of the root (0-based, as `n` counts). */
export const NUMERALS = { I: 0, ii: 1, iii: 2, IV: 3, V: 4, vi: 5 } as const;
export type Numeral = keyof typeof NUMERALS;

const SUFFIX: Record<Numeral, string> = { I: "", ii: "m", iii: "m", IV: "", V: "", vi: "m" };
/** The major scales Oak's renditions use, letter by letter (code spelling, STYLE §5.1). */
const SCALES: Record<string, readonly string[]> = {
  C: ["C", "D", "E", "F", "G", "A", "B"],
  D: ["D", "E", "F#", "G", "A", "B", "C#"],
  F: ["F", "G", "A", "Bb", "C", "D", "E"],
  G: ["G", "A", "B", "C", "D", "E", "F#"],
};

/** The chord symbol of a numeral in a major key: `ii` in F is `Gm`. */
export function symbolOf(tonic: string, rn: Numeral): string {
  const scale = SCALES[tonic];
  if (!scale) throw new Error(`no scale table for ${tonic} major`);
  return `${scale[NUMERALS[rn]]}${SUFFIX[rn]}`;
}

export interface FolkSetting {
  id: SongId;
  bpm: number;
  /** One mini-notation group per cycle, in degrees − 1 over the tonic at octave 4; the pickup bar first. */
  melody: readonly string[];
  /** One numeral per full bar (the pickup bar has no chord). */
  harmony: readonly Numeral[];
  /** 1-based bars, inclusive, numbered from the first full bar (contracts §6.11). */
  phrases: readonly [number, number][];
  /** How Oak's plain-rhythm setting departs from the source, in words. */
  setting: string;
}

const beatsPerBar = (meter: string): number => Number(meter.split("/")[0]);
export const tempoOf = (bpm: number, meter: string): string => `setcpm(${bpm}/${beatsPerBar(meter)})`;

/** The layers of a setting, each a labelled-track body without its label (as `SongDef.answerKey.layers`). */
export function folkLayers(s: FolkSetting, tonic: string, pickup: boolean) {
  const lead = pickup ? "~ " : "";
  const roots = s.harmony.map((rn) => NUMERALS[rn]);
  return {
    melody: `n("<${s.melody.join(" ")}>").scale("${tonic}4:major").s("piano")`,
    bass: `n("<${lead}${roots.join(" ")}>").scale("${tonic}2:major").s("ebass").lpf(600)`,
    chords: `n("<${lead}${roots.map((r) => `[${r},${r + 2},${r + 4}]`).join(" ")}>").scale("${tonic}3:major").s("piano").gain(.6)`,
  };
}

export function folkSong(s: FolkSetting): SongDef {
  const entry = songById.get(s.id);
  if (!entry) throw new Error(`no repertoire entry ${s.id}`);
  if (entry.key.mode !== "major") throw new Error(`${s.id}: folk settings are written for major keys`);
  const full = s.melody.length - (entry.pickup ? 1 : 0);
  if (s.harmony.length !== full) throw new Error(`${s.id}: ${full} bars, ${s.harmony.length} chords`);
  const layers = folkLayers(s, entry.key.tonic, !!entry.pickup);
  const code = [
    tempoOf(s.bpm, entry.meter),
    "",
    `mel: ${layers.melody}`,
    `bass: ${layers.bass}`,
    `chords: ${layers.chords}`,
  ].join("\n");
  return defineSong({
    id: entry.id,
    title: entry.title,
    year: entry.year,
    status: entry.status,
    provenance: entry.provenance,
    verifiedBy: PENDING_VERIFIER,
    key: entry.key,
    meter: entry.meter,
    bpm: s.bpm,
    ...(entry.pickup ? { pickup: entry.pickup } : {}),
    form: entry.form,
    answerKey: {
      bars: full,
      code,
      layers,
      chords: s.harmony.map((rn, i) => ({ bar: i + 1, beat: 1, symbol: symbolOf(entry.key.tonic, rn) })),
      phrases: s.phrases.map(([a, b]) => [a, b] as [number, number]),
    },
    ...(entry.availableFrom ? { availableFrom: entry.availableFrom } : {}),
  });
}
