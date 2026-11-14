// What U14, U16 and U17 add to the key panel and the circle (Wave 6): the modes on the piece's tonic with their
// colour tones, the chords the parallel key lends (borrowed chords), and the code lifted by a half or a whole step
// (a direct modulation) to hear before writing it. Every fact comes from `@oak/theory`; nothing is shown before
// its lesson (a mode from its scale's unlock, a borrowed chord from the U16 lesson that teaches it, the lift from
// U17.L02). Pure: tested in wave6.test.ts.
import type { KeySpec } from "@oak/content-kit";
import {
  borrowedChords,
  type ChordId,
  characteristicTonesOf,
  chordPcs,
  dorianFour,
  keyDisplay,
  modeColour,
  parallelKey,
  parentMajor,
  picardy,
  TAUGHT_MODES,
  type TaughtMode,
  toLeadSheet,
  transposeKey,
} from "@oak/theory";
import { rnDisplay } from "./harmony.ts";
import { glyph, moveKey, sameKey, scaleTokens } from "./key-tools.ts";

/** The toolbox row that teaches each mode (`null`: always known). */
export const MODE_TOOLS: Readonly<Record<TaughtMode, string | null>> = {
  lydian: "scale.lydian",
  major: null,
  mixolydian: "scale.mixolydian",
  dorian: "scale.dorian",
  minor: "scale.minor",
  phrygian: "scale.phrygian",
};

export interface ModeRow {
  mode: TaughtMode;
  key: KeySpec;
  /** "G Mixolydian", "G major". */
  name: string;
  /** "♭7", "♯4"; empty for major and minor. */
  colour: string;
  /** The colour note's name in this key: "F". */
  tone: string;
  /** "major" modes have a major 3rd, "minor" modes a minor one. */
  family: "major" | "minor";
  here: boolean;
}

const isTaught = (mode: string): mode is TaughtMode => (TAUGHT_MODES as readonly string[]).includes(mode);
const COLOUR: readonly TaughtMode[] = ["lydian", "mixolydian", "dorian", "phrygian"];

/**
 * The modes on the key's tonic, brightest first, each with its colour note: the unlocked ones, plus the piece's own
 * (the code names it). `[]` until a colour mode is unlocked or the piece is in one, and for keys that are not one
 * of the six taught modes (harmonic minor, a pentatonic, a blues).
 */
export function modeRows(current: KeySpec | null, unlocked: ReadonlySet<string> | null): ModeRow[] {
  if (!current || !isTaught(current.mode)) return [];
  const open = (m: TaughtMode): boolean => {
    const tool = MODE_TOOLS[m];
    return m === current.mode || tool === null || unlocked === null || unlocked.has(tool);
  };
  if (!COLOUR.some((m) => open(m))) return [];
  return TAUGHT_MODES.filter(open).map((mode) => {
    const key: KeySpec = { tonic: current.tonic, mode };
    const c = modeColour(mode);
    const colour = COLOUR.includes(mode);
    return {
      mode,
      key,
      name: keyDisplay(key),
      colour: colour ? (c?.colour ?? "") : "",
      tone: colour
        ? characteristicTonesOf(key)
            .map((t) => glyph(t.name))
            .join(" ")
        : "",
      family: c?.family ?? "major",
      here: mode === current.mode,
    };
  });
}

/** One sentence about the mode the piece is in: what changed against major or minor, and whose notes it shares. */
export function modeSentence(current: KeySpec | null): string | null {
  if (!current || !isTaught(current.mode) || !COLOUR.includes(current.mode)) return null;
  const c = modeColour(current.mode);
  const tone = characteristicTonesOf(current)[0];
  if (!c || !tone) return null;
  const base = c.family === "major" ? "major" : "minor";
  const how: Record<string, string> = {
    mixolydian: "a lowered 7",
    lydian: "a raised 4",
    dorian: "a raised 6",
    phrygian: "a lowered 2",
  };
  const parent = parentMajor(current);
  return `${c.name} is ${base} with ${how[current.mode]}: ${glyph(tone.name)} (${tone.display}) is its colour note. It uses the notes of ${keyDisplay(parent)} with ${glyph(current.tonic)} as home.`;
}

export interface LentChord {
  /** "♭VI". */
  rn: string;
  /** "A♭". */
  symbol: string;
  /** The chord from its root, close position, to hear it. */
  midis: number[];
  /** What it changes in the key: "♭6 ♭3". */
  lowered: string;
}

export interface Lending {
  /** The key the chords come from: the parallel minor of a major key. */
  from: KeySpec;
  /** "C minor lends". */
  title: string;
  chords: LentChord[];
}

function closePosition(chord: ChordId): number[] {
  const root = 48 + chord.rootPc;
  return chordPcs(chord).map((pc) => root + ((pc - chord.rootPc + 12) % 12));
}

const prettyDegree = (d: string) => d.replace(/^b/, "♭").replace(/^#/, "♯");

/**
 * The chords the parallel key lends (U16): in a major key iv, ♭VI, ♭VII and ♭III from the parallel minor, each
 * from the lesson that teaches it; in a minor key the major home chord (Picardy third) and the major IV (U16.L04).
 * `null` when none is taught yet or the key is neither major nor minor.
 */
export function lending(key: KeySpec | null, taught: (lesson: string) => boolean): Lending | null {
  if (!key) return null;
  if (key.mode === "major") {
    const chords = borrowedChords(key)
      // The course names four borrowed chords (contracts §2.3 U16); ii° is not one of them.
      .filter((b) => b.rn !== "iio" && taught(b.lesson))
      .map((b) => ({
        rn: rnDisplay(b.rn, key) ?? b.rn,
        symbol: toLeadSheet(b.chord),
        midis: closePosition(b.chord),
        lowered: b.lowered.map(prettyDegree).join(" "),
      }));
    if (chords.length === 0) return null;
    const from = parallelKey(key);
    return { from, title: `${keyDisplay(from)} lends`, chords };
  }
  if (key.mode === "minor" && taught("U16.L04")) {
    const p = picardy(key);
    const d = dorianFour(key);
    const from = parallelKey(key);
    return {
      from,
      title: `From the major side`,
      chords: [
        {
          rn: p.rn,
          symbol: toLeadSheet(p.chord),
          midis: closePosition(p.chord),
          lowered: `raised 3 (${glyph(p.raised.name)}): the Picardy third`,
        },
        {
          rn: d.rn,
          symbol: toLeadSheet(d.chord),
          midis: closePosition(d.chord),
          lowered: `raised 6 (${glyph(d.raised.name)}): the Dorian IV`,
        },
      ],
    };
  }
  return null;
}

export interface Lift {
  /** The code with every plain `.scale()` key played `bars` bars as written, then `bars` bars lifted. */
  code: string;
  from: KeySpec;
  to: KeySpec;
  /** The loop the lifted code needs: twice the piece. */
  bars: number;
  /** The `.scale()` argument of the first line, as U17.L02 writes it: `<C4:major!4 D4:major!4>`. */
  plan: string;
}

/** Why a piece cannot be lifted here, in a sentence; `null` when it can. */
export function liftProblem(code: string, pieceKey: KeySpec | null): string | null {
  if (!pieceKey) return "The code has no key yet: write the notes with n() and .scale() to lift them.";
  const tokens = scaleTokens(code);
  if (tokens.length === 0) return "Only notes written as n() with .scale() can be lifted here.";
  if (/\barrange\s*\(/.test(code))
    return "This song is arranged in sections: write the lift into the last section's .scale() yourself.";
  if (plainScaleCalls(code).length === 0) return "This code already changes key in its .scale().";
  return null;
}

const SCALE_CALL = /\.scale\(\s*(["'`])([^"'`]*)\1\s*\)/g;
const PLAIN_KEY = /^\s*[A-Ga-g](?:##|bb|#|b)?-?\d?:[A-Za-z]+(?::[A-Za-z]+)*\s*$/;

/** The `.scale("C4:major")` calls whose argument is one key (not a pattern): the text range of each argument. */
export function plainScaleCalls(code: string): { from: number; to: number; text: string }[] {
  const out: { from: number; to: number; text: string }[] = [];
  SCALE_CALL.lastIndex = 0;
  for (let m = SCALE_CALL.exec(code); m; m = SCALE_CALL.exec(code)) {
    const inner = m[2] as string;
    if (!PLAIN_KEY.test(inner)) continue;
    const from = m.index + m[0].indexOf(m[1] as string) + 1;
    out.push({ from, to: from + inner.length, text: inner.trim() });
  }
  return out;
}

/**
 * The piece played once as written and once lifted by `semitones` (a direct modulation, U17.L02): every plain
 * `.scale("X")` becomes `.scale("<X!bars Y!bars>")`, Y the same scale a half or a whole step up. Chords named by
 * letter do not move (as in every key preview). `null` when the code cannot be lifted (`liftProblem`).
 */
export function liftCode(
  code: string,
  pieceKey: KeySpec | null,
  bars: number,
  semitones: number,
): Lift | null {
  if (!pieceKey || liftProblem(code, pieceKey) !== null) return null;
  const calls = plainScaleCalls(code);
  const n = Math.max(1, Math.floor(bars));
  let out = "";
  let at = 0;
  let plan = "";
  for (const c of calls) {
    const own = scaleTokens(`.scale("${c.text}")`)[0]?.key;
    if (!own) return null;
    // The whole piece moves by the same interval: a bass a fifth below the tune stays a fifth below it.
    const to = transposeKey(own, semitones);
    const moved = moveKey(`.scale("${c.text}")`, own, to);
    const lifted = moved.code ? scaleTokens(moved.code)[0]?.text : undefined;
    if (!lifted || moved.shift !== semitones) return null;
    const arg = `<${c.text}!${n} ${lifted}!${n}>`;
    if (!plan && sameKey(own, pieceKey)) plan = arg;
    out += code.slice(at, c.from) + arg;
    at = c.to;
  }
  out += code.slice(at);
  return { code: out, from: pieceKey, to: transposeKey(pieceKey, semitones), bars: n * 2, plan: plan || "" };
}
