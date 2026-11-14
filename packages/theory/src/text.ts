// Normalizers for learners' typed fact answers (exercises §3.9): one canonical string per answer.
import type { KeySpec, ScaleMode } from "@oak/content-kit";
import { parseChordWithBass, toCode } from "./chords.ts";
import { parseInterval } from "./intervals.ts";
import { accidentalText, nameOf, parsePcName } from "./pitch.ts";
import { formatRN, parseRN } from "./roman.ts";
import type { NoteTextKind } from "./types.ts";

const NOTE_TEXT =
  /^([A-Ga-g])(?:-(?=sharp|flat|natural))?\s*(##|x|#|♯|sharp|bb|b|♭|flat|♮|natural)?\s*(-?\d)?$/i;
const ACC_WORD: Record<string, number> = {
  "##": 2,
  x: 2,
  "#": 1,
  "♯": 1,
  sharp: 1,
  bb: -2,
  b: -1,
  "♭": -1,
  flat: -1,
  "♮": 0,
  natural: 0,
};

function normalizeNote(text: string): string | null {
  const m = NOTE_TEXT.exec(text.trim());
  if (!m) return null;
  const acc = ACC_WORD[(m[2] ?? "").toLowerCase()] ?? ACC_WORD[m[2] ?? ""] ?? 0;
  return `${(m[1] as string).toUpperCase()}${accidentalText(acc)}${m[3] ?? ""}`;
}

const INTERVAL_WORDS: [RegExp, string][] = [
  [/^(perfect|perf|p)\s*/i, "P"],
  [/^(major|maj)\s*/i, "M"],
  [/^(minor|min)\s*/i, "m"],
  [/^(augmented|aug)\s*/i, "A"],
  [/^(diminished|dim)\s*/i, "d"],
];
/** Interval words that carry no quality letter: the canonical names a drill or exercise also uses. */
const BARE_INTERVALS: Record<string, string> = {
  tt: "TT",
  tritone: "TT",
  unison: "P1",
  octave: "P8",
  "perfect unison": "P1",
  "perfect octave": "P8",
};
function normalizeIntervalText(text: string): string | null {
  let t = text.trim();
  const bare = BARE_INTERVALS[t.toLowerCase().replace(/\s+/g, " ")];
  if (bare) return bare;
  // Strudel's own form, as written in `.transpose("3M")` (number first; a sign is a direction, not a name).
  const strudel = /^[-+]?(\d{1,2})(P|M|m|A|d)$/.exec(t);
  if (strudel) return parseInterval(`${strudel[2]}${strudel[1]}`) ? `${strudel[2]}${strudel[1]}` : null;
  let q: string | null = null;
  for (const [re, letter] of INTERVAL_WORDS) {
    if (re.test(t) && !/^[Mm]\d/.test(t)) {
      q = letter;
      t = t.replace(re, "");
      break;
    }
  }
  if (q === null) {
    const m = /^(P|M|m|A|d)\s*/.exec(t);
    if (!m) return null;
    q = m[1] as string;
    t = t.slice(m[0].length);
  }
  const ORD: Record<string, string> = {
    unison: "1",
    second: "2",
    third: "3",
    fourth: "4",
    fifth: "5",
    sixth: "6",
    seventh: "7",
    octave: "8",
    ninth: "9",
    tenth: "10",
    eleventh: "11",
    twelfth: "12",
    thirteenth: "13",
  };
  t = t
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+$/, (w) => ORD[w] ?? w);
  const n = /^(\d{1,2})(st|nd|rd|th)?$/i.exec(t);
  if (!n) return null;
  const name = `${q}${n[1]}`;
  return parseInterval(name) ? name : null;
}

const MODE_WORDS: [RegExp, ScaleMode][] = [
  [/^(harmonic\s*minor)$/i, "harmonic minor"],
  [/^(melodic\s*minor)$/i, "melodic minor"],
  [/^(major\s*pentatonic)$/i, "major pentatonic"],
  [/^(minor\s*pentatonic)$/i, "minor pentatonic"],
  [/^(major|maj|ionian|M)$/, "major"],
  [/^(major|maj|ionian)$/i, "major"],
  [/^(minor|min|aeolian|m)$/, "minor"],
  [/^(minor|min|aeolian)$/i, "minor"],
  [/^dorian$/i, "dorian"],
  [/^phrygian$/i, "phrygian"],
  [/^lydian$/i, "lydian"],
  [/^mixolydian$/i, "mixolydian"],
  [/^locrian$/i, "locrian"],
  [/^blues$/i, "blues"],
];
/** "Eb major", "c# minor", "F#m", "Am", "Bb", "D dorian", "C4:major" → a key, or `null`. */
export function parseKeyText(text: string): KeySpec | null {
  const t = text
    .trim()
    .replace(/♭/g, "b")
    .replace(/♯/g, "#")
    .replace(
      /^([A-Ga-g])[\s-]*(sharp|flat)\b/i,
      (_, l: string, w: string) => `${l}${/^s/i.test(w) ? "#" : "b"}`,
    )
    .replace(/^([A-Ga-g](?:#|b)?)-?\d+:/, "$1:");
  const m = /^([A-Ga-g](?:##|bb|#|b)?)\s*[:\s]?\s*(.*)$/.exec(t);
  if (!m) return null;
  const tonic = parsePcName(m[1] as string);
  if (!tonic) return null;
  const rest = (m[2] ?? "").replace(/:/g, " ").trim();
  if (rest === "") return { tonic: nameOf(tonic), mode: "major" };
  for (const [re, mode] of MODE_WORDS) if (re.test(rest)) return { tonic: nameOf(tonic), mode };
  return null;
}

/** Normalizes a learner's text answer for comparison (exercises §3.9): "e♭" → "Eb", "CΔ7" → "C^7", "vii°" → "viio". */
export function normalizeText(kind: NoteTextKind, text: string): string | null {
  switch (kind) {
    case "note":
      return normalizeNote(text);
    case "interval":
      return normalizeIntervalText(text);
    case "key": {
      const k = parseKeyText(text);
      return k ? `${k.tonic} ${k.mode}` : null;
    }
    case "chord": {
      // A forgiving entry: "g/b", "c#m/e" and "Cmaj7/g" read as G/B, C#m/E and Cmaj7/G (root and bass letters).
      const t = text
        .trim()
        // A bare triangle is the major seventh (CΔ = Cmaj7), as the jazz glyph is written; with a number after
        // it (CΔ7, CΔ9) the chord table reads it already.
        .replace(/[∆Δ△](?!\d)/g, "^7")
        .replace(/^([a-g])/, (c) => c.toUpperCase())
        .replace(/\/\s*([a-g])(?=[#b♯♭]?\s*$)/, (_, c: string) => `/${c.toUpperCase()}`);
      const c = parseChordWithBass(t);
      if (!c) return null;
      return c.bassPc === c.rootPc ? toCode(c) : `${toCode(c)}/${c.bass ?? ""}`;
    }
    case "rn": {
      const rn = parseRN(text.trim(), { tonic: "C", mode: "major" });
      return rn ? formatRN(rn) : null;
    }
  }
}
