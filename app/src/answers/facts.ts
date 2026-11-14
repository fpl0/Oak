// What a pick is shown to mean once it has been answered (Wave 6): the one changed note of a mode (U14), the two
// names of a pivot chord and the distance of a key change (U17), the place of a picked note in a chord (the
// guide-tone pick, U12.L05), and how a built scale differs from the scale it started from (`scale-builder.from`).
// Every fact comes from `@oak/theory` and `@oak/content-kit`; nothing here knows an answer, and a widget shows
// these lines only after a check (never before: wave6.md §10 item 15). Pure: tested with `bun test`.
import type { Choice, Degree, KeySpec } from "@oak/api";
import { MODE_CHARACTERISTIC, MODE_DEGREES, type ScaleMode } from "@oak/content-kit";
import {
  chordPcs,
  guideTones,
  keyDisplay,
  keyDistance,
  modeColour,
  parseChordWithBass,
  pivotChords,
  romanText,
  toLeadSheet,
} from "@oak/theory";
import { degreeDisplay } from "./normalize.ts";
import { degreeParts, degreeSemis, nameDisplay, spellDegreeName } from "./scale.ts";

const COLOUR = MODE_CHARACTERISTIC as Readonly<
  Record<string, { parent: "major" | "minor"; tone: Degree; replaces: Degree }>
>;

/** A degree as it stands against its parent scale: a natural that undoes a flat prints with its sign (♮6). */
function toneDisplay(tone: Degree, replaces: Degree): string {
  return tone.length === 1 && replaces.length > 1 ? `♮${tone}` : degreeDisplay(tone);
}

/** True when every option is a mode the course names (`MODE_OPTIONS` ids): the "which mode" pick. */
export function isModeChoice(options: readonly Choice[]): boolean {
  return (
    options.length > 0 && options.every((o) => o.id in MODE_DEGREES) && options.some((o) => o.id in COLOUR)
  );
}

/**
 * The one changed note of a mode, in words: "Mixolydian is major with one note changed: 7 becomes ♭7. From G:
 * F♯ becomes F." The parent scales themselves say what they are. `null` for a scale that is not a mode pick.
 */
export function modeFact(mode: string, tonic?: string | null): string | null {
  if (mode === "major") return "Major: the scale itself, nothing changed.";
  if (mode === "minor") return "Natural minor: the scale itself, nothing changed (♭3 ♭6 ♭7).";
  const c = COLOUR[mode];
  const info = modeColour(mode as ScaleMode);
  if (!c || !info) return null;
  const was = degreeDisplay(c.replaces);
  const now = toneDisplay(c.tone, c.replaces);
  const parent = c.parent === "major" ? "major" : "natural minor";
  let text = `${info.name} is ${parent} with one note changed: ${was} becomes ${now}.`;
  if (tonic) {
    const from = spellDegreeName(tonic, c.replaces);
    const to = spellDegreeName(tonic, c.tone);
    if (from && to) text += ` From ${nameDisplay(tonic)}: ${nameDisplay(from)} becomes ${nameDisplay(to)}.`;
  }
  return text;
}

// --- key changes (U17) ------------------------------------------------------------------------------

/**
 * True when a single choice is a place in the music: every option is a bar, labelled as one ("Bar 5", id `"5"`),
 * or `"none"` ("no key change"), as `fam.har.modulation` asks it. Such a choice is drawn as a bar timeline. A
 * choice among plain numbers (how many beats, which degree) is not one: its labels do not say "Bar".
 */
export function isBarChoice(options: readonly Choice[]): boolean {
  const isBar = (o: Choice) => /^\d+$/.test(o.id) && new RegExp(`^bar ${o.id}$`, "i").test(o.label.trim());
  return options.filter(isBar).length >= 2 && options.every((o) => o.id === "none" || isBar(o));
}

const RELATION_WORDS: Record<string, string> = {
  same: "the same key",
  relative: "its relative key: the same notes, another home",
  parallel: "the parallel key: the same home, another scale",
  dominant: "the key of its V, one sharp further on",
  subdominant: "the key of its IV, one flat further on",
  "up-half": "up a half step",
  "up-step": "up a whole step",
  "down-step": "down a whole step",
};

/** "C major to D major: up a whole step." The distance of a key change, in the words U17 uses. */
export function keyChangeFact(from: KeySpec, to: KeySpec): string {
  const d = keyDistance(from, to);
  const how =
    RELATION_WORDS[d.relation] ?? `${Math.abs(d.semitones)} half steps ${d.semitones >= 0 ? "up" : "down"}`;
  return `${keyDisplay(from)} to ${keyDisplay(to)}: ${how}.`;
}

/** True when every option reads as a chord symbol (the pivot-chord pick). */
export function isChordChoice(options: readonly Choice[]): boolean {
  return options.length > 0 && options.every((o) => chordOfOption(o) !== null);
}

function chordOfOption(o: Choice) {
  const text = /^[A-G][#b]?/.test(o.id) ? o.id : o.label;
  try {
    return parseChordWithBass(text.replace(/♭/g, "b").replace(/♯/g, "#"));
  } catch {
    return null;
  }
}

const rnShown = (rn: string) =>
  rn
    .replace(/^b/, "♭")
    .replace(/^#/, "♯")
    .replace(/o(?=\d*$)/, "°");

/**
 * What a chord is in the two keys of a modulation: "Am is vi in C major and ii in G major: both keys own it, so it
 * can be the pivot." A chord only one key owns says which ("D7 belongs to G major only: it is its V7."), and a
 * chord neither owns says so. `null` when the option is not a chord.
 */
export function pivotFact(option: Choice, from: KeySpec, to: KeySpec): string | null {
  const chord = chordOfOption(option);
  if (!chord) return null;
  const name = toLeadSheet(chord);
  const shared = pivotChords(from, to).find(
    (p) => p.chord.rootPc === chord.rootPc && p.chord.quality === chord.quality,
  );
  if (shared)
    return `${name} is ${rnShown(shared.from)} in ${keyDisplay(from)} and ${rnShown(shared.to)} in ${keyDisplay(to)}: both keys own it, so it can be the pivot.`;
  const inKey = (key: KeySpec): string | null => {
    const pcs = new Set(MODE_DEGREES[key.mode].map((d) => (tonicPc(key) + degreeSemis(d)) % 12));
    if (!(chordPcs(chord) as number[]).every((pc) => pcs.has(pc))) return null;
    return rnShown(romanText(chord, key));
  };
  const a = inKey(from);
  const b = inKey(to);
  if (a && !b) return `${name} belongs to ${keyDisplay(from)} only: it is its ${a}.`;
  if (b && !a) return `${name} belongs to ${keyDisplay(to)} only: it is its ${b}.`;
  if (a && b) return `${name} is ${a} in ${keyDisplay(from)} and ${b} in ${keyDisplay(to)}.`;
  return `${name} belongs to neither key.`;
}

function tonicPc(key: KeySpec): number {
  const m = /^([A-G])(#{0,2}|b{0,2})$/.exec(key.tonic);
  if (!m) return 0;
  const base = [0, 2, 4, 5, 7, 9, 11]["CDEFGAB".indexOf(m[1] as string)] ?? 0;
  const acc = m[2] ?? "";
  return (((base + (acc.startsWith("#") ? acc.length : -acc.length)) % 12) + 12) % 12;
}

// --- the guide-tone pick (U12.L05) --------------------------------------------------------------------

const MEMBER = ["the root", "the 3rd", "the 5th", "the 7th"] as const;

/**
 * The place of each picked key in a chord: "B, the 3rd of G7" · "F, the 7th of G7" · "D, the 5th: not a guide
 * tone" · "A is not in G7". The guide tones are the 3rd and the 7th (`@oak/theory` `guideTones`).
 */
export function guideToneFacts(
  midis: readonly number[],
  chordSymbol: string,
): { midi: number; text: string; guide: boolean }[] | null {
  let chord: ReturnType<typeof parseChordWithBass> = null;
  try {
    chord = parseChordWithBass(chordSymbol);
  } catch {
    chord = null;
  }
  if (!chord) return null;
  const name = toLeadSheet(chord);
  const g = guideTones(chord);
  const pcs = chordPcs(chord) as number[];
  const names = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  return midis.map((midi) => {
    const pc = ((midi % 12) + 12) % 12;
    const tone = g.third?.pc === pc ? g.third : g.seventh?.pc === pc ? g.seventh : null;
    const note = tone ? nameDisplay(tone.name) : (names[pc] as string);
    const at = pcs.indexOf(pc);
    if (tone)
      return {
        midi,
        guide: true,
        text: `${note}, ${tone.role === "third" ? "the 3rd" : "the 7th"} of ${name}`,
      };
    if (at >= 0)
      return {
        midi,
        guide: false,
        text: `${note}, ${MEMBER[at] ?? "a chord note"} of ${name}: not a guide tone`,
      };
    return { midi, guide: false, text: `${note} is not in ${name}` };
  });
}

// --- a scale built from another scale (U14, `scale-builder.from`) --------------------------------------

export interface ScaleMove {
  /** The degree of the starting scale that is gone. */
  from: Degree;
  /** What stands in its place, as a degree against the major scale. */
  to: Degree;
  direction: "raised" | "lowered";
  /** "7 lowered a half step: ♭7" */
  text: string;
}

/**
 * How a built scale differs from the scale it started from, when exactly one note moved by a half step: from
 * major, 7 → ♭7 (lowered); from minor, ♭6 → 6 (raised). `null` when nothing moved, or more than one note did.
 */
export function scaleMove(from: readonly string[], now: readonly string[]): ScaleMove | null {
  const a = new Map(from.map((d) => [degreeSemis(d), d]));
  const b = new Set(now.map((d) => degreeSemis(d)));
  const gone = [...a.keys()].filter((s) => !b.has(s));
  const added = [...b].filter((s) => !a.has(s));
  if (gone.length !== 1 || added.length !== 1) return null;
  const was = a.get(gone[0] as number) as string;
  const diff = (((added[0] as number) - (gone[0] as number) + 18) % 12) - 6;
  if (Math.abs(diff) !== 1) return null;
  const p = degreeParts(was);
  if (!p) return null;
  const alt = p.alt + diff;
  if (Math.abs(alt) > 1) return null;
  const to = `${alt < 0 ? "b" : alt > 0 ? "#" : ""}${p.num}` as Degree;
  const direction = diff > 0 ? "raised" : "lowered";
  return {
    from: was as Degree,
    to,
    direction,
    text: `${degreeDisplay(was)} ${direction} a half step: ${toneDisplay(to, was as Degree)}`,
  };
}

/** The mode a set of degrees is, among the scales the course names, for the builder's line ("That is Mixolydian."). */
export function scaleNameOf(degrees: readonly string[]): string | null {
  const key = [...new Set(degrees.map((d) => degreeSemis(d)))].sort((x, y) => x - y).join(",");
  for (const mode of ["major", "minor", "mixolydian", "dorian", "lydian", "phrygian"] as const) {
    const want = MODE_DEGREES[mode]
      .map((d) => degreeSemis(d))
      .sort((x, y) => x - y)
      .join(",");
    if (want === key) return mode === "minor" ? "natural minor" : (modeColour(mode)?.name ?? mode);
  }
  return null;
}
