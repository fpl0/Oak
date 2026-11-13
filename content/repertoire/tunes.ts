// Oak's own renditions of the minor and blues songs U10, X2 and ladder L6 use (contracts §2.4, §2.8, §2.9), built
// from their registry entries (content/repertoire/index.ts) so title, year, status, provenance, key, meter, pickup
// and form are stated once. The folk songs of L5 are built by folk.ts, in degrees of a major key; these songs need
// notes outside one diatonic scale (the raised 7 of harmonic minor, a blues passing note), so a setting here is
// written in note names, one mini-notation group a bar (the pickup bar first when the song has one), with the
// harmony as chord symbols, one a bar or two (the second on beat 3).
//
// Plain rhythm (contracts §2.8: nothing before U13 needs a dot or a tie): every attack sits where the source
// transcription puts it; a dotted or tied value is cut to the longest plain value (whole, half, quarter, eighth)
// that fits before the next attack, and a rest fills the rest of its time. A half note starts on a beat, a whole
// note on beat 1, and nothing crosses a bar line. Where a source figure cannot be kept on the eighth grid, the
// setting moves the attack and says so (`moved`).
//
// The layers a transcription checks are a root bass (one note a chord) and block chords in close position over a
// fixed table of voicings, plus the melody; the full reference code is the three labelled tracks. The swing a song
// declares (`swing`, the blues) is played by the pattern source and straightened by the grader; the code itself is
// written straight, as the course writes swing (U11.L07).
//
// `verifiedBy` stays the pending marker: no human has checked these answer keys against the cited editions.
// tunes.test.ts checks each against a separate transcription (an ABC text kept in the test), attack by attack.
import { defineSong, type SongDef, type SongId, type SwingSpec } from "@oak/content-kit";
import { tempoLine } from "@oak/theory";
import { PENDING_VERIFIER } from "./fragment.ts";
import { songById } from "./index.ts";

/** Close-position voicings (root position, the root at C3–B♭3 or A2–B2) of every chord the settings name. */
export const VOICINGS: Readonly<Record<string, readonly string[]>> = {
  C: ["c3", "e3", "g3"],
  C7: ["c3", "e3", "g3", "bb3"],
  D: ["d3", "f#3", "a3"],
  Dm: ["d3", "f3", "a3"],
  E: ["e3", "g#3", "b3"],
  Em: ["e3", "g3", "b3"],
  F: ["f3", "a3", "c4"],
  G: ["g3", "b3", "d4"],
  G7: ["g3", "b3", "d4", "f4"],
  Gm: ["g3", "bb3", "d4"],
  Am: ["a2", "c3", "e3"],
  A7: ["a2", "c#3", "e3", "g3"],
  Bb: ["bb2", "d3", "f3"],
  B: ["b2", "d#3", "f#3"],
  Bm: ["b2", "d3", "f#3"],
};

/** One bar of harmony: a chord for the bar, or two (the second from beat 3 in 4/4). */
export type BarHarmony = string | readonly [string, string];

export interface NoteSetting {
  id: SongId;
  bpm: number;
  /** One mini-notation group per cycle in note names (`"[a4@2 ~ f4]"`); the pickup bar first. */
  melody: readonly string[];
  /** One entry per full bar. */
  harmony: readonly BarHarmony[];
  /** 1-based bars, inclusive, numbered from the first full bar (contracts §6.11). */
  phrases: readonly [number, number][];
  /** The song's own feel, played from R0 (the L6 blues): `{ subdivision: 8, amount: 1/3 }`. */
  swing?: SwingSpec;
  /** How Oak's plain-rhythm setting departs from the source, in words. */
  setting: string;
}

const voicing = (symbol: string): readonly string[] => {
  const v = VOICINGS[symbol];
  if (!v) throw new Error(`no voicing for ${symbol}`);
  return v;
};
/** The bass note of a chord: its root an octave below the voicing. */
const rootOf = (symbol: string): string => {
  const r = voicing(symbol)[0] as string;
  return `${r.slice(0, -1)}${Number(r.slice(-1)) - 1}`;
};
const stack = (symbol: string): string => `[${voicing(symbol).join(",")}]`;
const perBar = (h: BarHarmony, one: (s: string) => string): string =>
  typeof h === "string" ? one(h) : `[${one(h[0])} ${one(h[1])}]`;

/** The layers of a setting, each a labelled-track body without its label (as `SongDef.answerKey.layers`). */
export function noteLayers(s: NoteSetting, pickup: boolean) {
  const lead = pickup ? "~ " : "";
  return {
    melody: `note("<${s.melody.join(" ")}>").s("piano")`,
    bass: `note("<${lead}${s.harmony.map((h) => perBar(h, rootOf)).join(" ")}>").s("ebass").lpf(600)`,
    chords: `note("<${lead}${s.harmony.map((h) => perBar(h, stack)).join(" ")}>").s("piano").gain(.6)`,
  };
}

/** The lead-sheet chart: one entry per chord, at bar and beat (beat 3 for the second chord of a split bar). */
export function chartOf(harmony: readonly BarHarmony[], beatsPerBar: number) {
  return harmony.flatMap((h, i) =>
    typeof h === "string"
      ? [{ bar: i + 1, beat: 1, symbol: h }]
      : [
          { bar: i + 1, beat: 1, symbol: h[0] },
          { bar: i + 1, beat: beatsPerBar / 2 + 1, symbol: h[1] },
        ],
  );
}

export function noteSong(s: NoteSetting): SongDef {
  const entry = songById.get(s.id);
  if (!entry) throw new Error(`no repertoire entry ${s.id}`);
  const full = s.melody.length - (entry.pickup ? 1 : 0);
  if (s.harmony.length !== full) throw new Error(`${s.id}: ${full} bars, ${s.harmony.length} chords`);
  const layers = noteLayers(s, !!entry.pickup);
  const beats = Number(entry.meter.split("/")[0]);
  const code = [
    tempoLine(s.bpm, entry.meter),
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
    ...(s.swing ? { swing: s.swing } : {}),
    form: entry.form,
    answerKey: {
      bars: full,
      code,
      layers,
      chords: chartOf(s.harmony, beats),
      phrases: s.phrases.map(([a, b]) => [a, b] as [number, number]),
    },
    ...(entry.availableFrom ? { availableFrom: entry.availableFrom } : {}),
  });
}
