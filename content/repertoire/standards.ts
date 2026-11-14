// Oak's own renditions of the 1920s standards (contracts §2.8, §6.12; content/specs/CF.md "The three standards"):
// the three CF-T songs of ladder L8 (Five Foot Two, Ain't She Sweet, Bye Bye Blackbird) and Sweet Georgia Brown
// (U15.L05, ladder L6). Each `song.ts` is built from its registry entry (content/repertoire/index.ts), so title,
// year, status, provenance, key, meter, pickup and form are stated once.
//
// A setting is the tune in note names, one mini-notation group per bar; a group that ends in `@2` spans two bars,
// which is how a note tied over a bar line is written (`"[e4@7 ~]@2"`: an E held for seven beats). From U13 on
// the tunes keep their real rhythm: ties, dots and syncopation are in, eighths written straight (the song
// declares `swing`, the pattern source swings them and the grader straightens them, contracts §6.10). The harmony
// is one chord symbol a bar, or two (the second from beat 3), in the palette the learner can write at CF-T.S1:
// triads, the five seventh qualities and diminished sevenths (no sixth, ninth or suspended chord: a source's C6 is
// set as C, a D9 as D7, and the setting note says so).
//
// From those come the four layers of the rendition (CF.md "The source and its realism"): drums on a ride and a
// backbeat, a two-feel bass (two half notes a bar: the root, then the fifth; in a bar of two chords, each root),
// comping chords on beats 2 and 4 in close position (`.struct("~ x ~ x")`), and the tune. The tune and the bass are
// written as the learner writes them, in degrees over the key (`n` is degree − 1; a note outside the key is a
// degree and a sign, `n("4#")` for ♯5), the chords in note names. The voicings come from @oak/theory
// (`parseChordSymbol`, `chordPcs`), so a chord symbol and its notes cannot disagree.
//
// `verifiedBy` stays the pending marker: no human has checked these answer keys against the cited prints.
// standards.test.ts checks each against a separate transcription (an ABC text kept in the test), attack by attack.
import { defineSong, type SongDef, type SongId, type SwingSpec } from "@oak/content-kit";
import { chordPcs, parseChordSymbol, tempoLine } from "@oak/theory";
import { PENDING_VERIFIER } from "./fragment.ts";
import { songById } from "./index.ts";
import { type BarHarmony, chartOf } from "./tunes.ts";

/** Swing 8ths, as every standard declares (CF.md: "Oak's rendition swings its eighths"). */
export const SWING_8THS: SwingSpec = { subdivision: 8, amount: 1 / 3 };

export interface StandardSetting {
  id: SongId;
  bpm: number;
  /** One mini-notation group per bar in note names; `@n` after a group's closing bracket spans n bars. */
  melody: readonly string[];
  /** One entry per bar. */
  harmony: readonly BarHarmony[];
  /** The sections in order (the form map's answer), 1-based bars inclusive; also the phrases unless given. */
  sections: readonly { label: string; bars: [number, number] }[];
  /** Phrases when they are not the sections (the L6 song cuts 4-bar lines). */
  phrases?: readonly [number, number][];
  /** How Oak's setting departs from its source, in words. */
  setting: string;
}

// Names by pitch class: sharps for the raised notes of applied dominants (F♯, C♯, G♯), flats for E♭ and B♭; a
// chord on a flat root is spelled in flats.
const SHARP = ["c", "c#", "d", "eb", "e", "f", "f#", "g", "g#", "a", "bb", "b"] as const;
const FLAT = ["c", "db", "d", "eb", "e", "f", "gb", "g", "ab", "a", "bb", "b"] as const;
const nameOf = (midi: number, flats: boolean): string =>
  `${(flats ? FLAT : SHARP)[midi % 12]}${Math.floor(midi / 12) - 1}`;

function chordOf(symbol: string) {
  const c = parseChordSymbol(symbol);
  if (!c) throw new Error(`not a chord symbol: ${symbol}`);
  return { pcs: chordPcs(c) as number[], flats: /^[A-G]b/.test(symbol) };
}

/** Close position, root position, the root between G2 and F♯3: `Abo7` → ab2 b2 d3 f3. */
export function voicingOf(symbol: string): string[] {
  const { pcs, flats } = chordOf(symbol);
  const out: number[] = [];
  for (const pc of pcs) {
    const prev = out.at(-1);
    let m = 43 + ((pc - 7 + 12) % 12);
    if (prev !== undefined) while (m <= prev) m += 12;
    out.push(m);
  }
  return out.map((m) => nameOf(m, flats));
}

/** The bass of one chord for a span: its root between C2 and B2, then its fifth (`["c2", "g2"]`). */
export function rootAndFifth(symbol: string): [string, string] {
  const { pcs, flats } = chordOf(symbol);
  const root = 36 + (pcs[0] as number);
  // chordPcs lists root, third, fifth (and seventh): the fifth is the third entry, diminished in o7 and m7b5.
  const fifth = root + (((pcs[2] as number) - (pcs[0] as number) + 12) % 12);
  return [nameOf(root, flats), nameOf(fifth, flats)];
}

const LETTERS = "cdefgab";
const MAJOR = [0, 2, 4, 5, 7, 9, 11] as const;
function parseNote(name: string): { step: number; midi: number } {
  const m = /^([a-g])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`not a note name: ${name}`);
  const letter = LETTERS.indexOf(m[1] as string);
  const oct = Number(m[3]);
  const acc = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  return { step: letter + 7 * oct, midi: 12 * (oct + 1) + (MAJOR[letter] as number) + acc };
}
/**
 * A note name as an `n` value over a major key whose tonic sits at `octave` (`.scale("F4:major")`): 0-based
 * degree, with `#` or `b` for a note outside the key (`degreeOf("f#4", "F", 4)` → `"0#"`, `"b4"` → `"3#"`).
 */
export function degreeOf(note: string, tonic: string, octave: number): string {
  const n = parseNote(note);
  const t = parseNote(`${tonic.toLowerCase()}${octave}`);
  const deg = n.step - t.step;
  const diatonic = t.midi + 12 * Math.floor(deg / 7) + (MAJOR[((deg % 7) + 7) % 7] as number);
  const acc = n.midi - diatonic;
  if (Math.abs(acc) > 1) throw new Error(`${note} is more than a half step from a degree of ${tonic} major`);
  return `${deg}${acc === 1 ? "#" : acc === -1 ? "b" : ""}`;
}
/** Every note name of a mini-notation string as an `n` value (rests, weights and brackets kept). */
export const toDegrees = (mini: string, tonic: string, octave: number): string =>
  mini.replace(/([a-g](?:#|b)?-?\d)/g, (name) => degreeOf(name, tonic, octave));

/** How many bars a melody group spans (`"[e4@7 ~]@2"` → 2). */
export const barsOfGroup = (group: string): number => {
  const m = /\]@(\d+)$/.exec(group.trim());
  return m ? Number(m[1]) : 1;
};

const stack = (symbol: string): string => `[${voicingOf(symbol).join(",")}]`;

/** The four layers of a setting, each a labelled-track body without its label (as `SongDef.answerKey.layers`). */
export function standardLayers(s: StandardSetting, tonic: string) {
  const bass = s.harmony.map((h) =>
    typeof h === "string"
      ? `[${rootAndFifth(h).join(" ")}]`
      : `[${rootAndFifth(h[0])[0]} ${rootAndFifth(h[1])[0]}]`,
  );
  const comp = s.harmony.map((h) => (typeof h === "string" ? stack(h) : `[${stack(h[0])} ${stack(h[1])}]`));
  return {
    drums: 's("bd ~ bd ~, ~ sd ~ sd, rd*8").gain(.4)',
    bass: `n("<${toDegrees(bass.join(" "), tonic, 2)}>").scale("${tonic}2:major").s("upright")`,
    chords: `note("<${comp.join(" ")}>").struct("~ x ~ x").s("jazzgtr").gain(.5)`,
    melody: `n("<${toDegrees(s.melody.join(" "), tonic, 4)}>").scale("${tonic}4:major").s("piano")`,
  };
}

export function standardSong(s: StandardSetting): SongDef {
  const entry = songById.get(s.id);
  if (!entry) throw new Error(`no repertoire entry ${s.id}`);
  if (entry.pickup) throw new Error(`${s.id}: standards.ts writes no pickup bar`);
  const bars = s.harmony.length;
  const tuneBars = s.melody.reduce((n, g) => n + barsOfGroup(g), 0);
  if (tuneBars !== bars) throw new Error(`${s.id}: ${tuneBars} bars of tune, ${bars} of harmony`);
  let next = 1;
  for (const sec of s.sections) {
    if (sec.bars[0] !== next) throw new Error(`${s.id}: the sections leave a gap at bar ${next}`);
    next = sec.bars[1] + 1;
  }
  if (next - 1 !== bars) throw new Error(`${s.id}: the sections end at bar ${next - 1}`);
  if (entry.key.mode !== "major") throw new Error(`${s.id}: standards.ts writes major keys`);
  const layers = standardLayers(s, entry.key.tonic);
  const code = [
    tempoLine(s.bpm, entry.meter),
    "",
    `drums: ${layers.drums}`,
    `bass: ${layers.bass}`,
    `chords: ${layers.chords}`,
    `mel: ${layers.melody}`,
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
    swing: SWING_8THS,
    form: entry.form,
    answerKey: {
      bars,
      code,
      layers,
      chords: chartOf(s.harmony, Number(entry.meter.split("/")[0])),
      phrases: (s.phrases ?? s.sections.map((x) => x.bars)).map(([a, b]) => [a, b] as [number, number]),
      sections: s.sections.map((x) => ({ label: x.label, bars: [x.bars[0], x.bars[1]] as [number, number] })),
    },
    ...(entry.availableFrom ? { availableFrom: entry.availableFrom } : {}),
  });
}
