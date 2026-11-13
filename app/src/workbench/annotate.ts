// The lens lines under the staff (Wave 3, docs/design/wave3.md §3.1/§4.3): degree numbers, solfège syllables and
// note names, one ABC lyric line (`w:`) each, under every pitched staff of the score (both staves of a grand
// staff). The text of each engraved note comes from the Workbench's own per-event labels, so every note is read
// in the key of its own track and bar (a patterned `.scale("<C4:major G4:major>")` labels bar 2 in G), which a
// single score-wide key cannot do. Pure: the ABC of `toAbc` with the lines inserted after each voice's music.
import type { AbcOptions, AbcResult, Score, Voice } from "@oak/notation";
import { padLine, toAbc } from "@oak/notation";
import type { PitchLabel } from "./music.ts";

export interface AnnotationKinds {
  degree: boolean;
  solfege: boolean;
  noteName: boolean;
}

export type AnnotationKind = keyof AnnotationKinds;
export const ANNOTATION_ORDER: readonly AnnotationKind[] = ["degree", "solfege", "noteName"];
export const NO_ANNOTATIONS: AnnotationKinds = { degree: false, solfege: false, noteName: false };

export function anyAnnotation(k: AnnotationKinds): boolean {
  return k.degree || k.solfege || k.noteName;
}

/** The texts of one engraved note or chord (chord members low to high). */
export type AnnotationTexts = Partial<Record<AnnotationKind, string>>;

/** One note's (or one chord's) texts from its events' labels; a chord's members are joined by a tie (`~`). */
export function annotationText(
  labels: readonly (PitchLabel | null)[],
  kinds: AnnotationKinds,
): AnnotationTexts {
  const ls = labels.filter((l): l is PitchLabel => l !== null);
  const join = (xs: (string | undefined)[]) => {
    const v = xs.filter((x): x is string => !!x);
    return v.length ? v.join("~") : undefined;
  };
  const out: AnnotationTexts = {};
  const degree = kinds.degree ? join(ls.map((l) => l.degree?.label)) : undefined;
  const solfege = kinds.solfege ? join(ls.map((l) => l.degree?.syllable)) : undefined;
  // A chord's names: the lowest with its octave, the members above it by letter alone ("E♭4~G♭~B♭"), so four
  // chords a bar fit under the staff at the narrowest width (c5); one note keeps its full name.
  const noteName = kinds.noteName
    ? join(ls.map((l, i) => (i === 0 || ls.length === 1 ? l.display : l.display.replace(/-?\d+$/, ""))))
    : undefined;
  if (degree) out.degree = degree;
  if (solfege) out.solfege = solfege;
  if (noteName) out.noteName = noteName;
  return out;
}

/** A lyric token ABC reads as one syllable: no spaces, hyphens, underscores, stars or bars. */
function token(text: string): string {
  return text.replace(/\s+/g, "~").replace(/[-_*|\\]/g, "");
}

function lyricLine(
  voice: Voice,
  from: number,
  to: number,
  kind: AnnotationKind,
  textOf: (n: number, eventIds: readonly string[]) => AnnotationTexts,
): string | null {
  const parts: string[] = [];
  let any = false;
  for (let bi = from; bi < to; bi++) {
    const toks: string[] = [];
    for (const it of voice.bars[bi]?.items ?? []) {
      if (it.kind === "rest") continue;
      const text = it.n !== null && !it.tieFromPrev ? textOf(it.n, it.eventIds)[kind] : undefined;
      if (text) {
        toks.push(token(text));
        any = true;
      } else toks.push("*");
    }
    parts.push(toks.join(" "));
  }
  return any ? `w:${parts.join(" | ")}` : null;
}

/**
 * `toAbc(score, opts)` with one lyric line per active annotation kind under every voice of every pitched staff
 * (but a second voice on the numerals' staff), systems grouped as `toAbc` lays them out (a pickup bar rides on
 * the first). The idMap is untouched (links stay exact). If the ABC is not laid out as expected, the staff is
 * returned without annotations rather than misaligned.
 */
export function annotateAbc(
  score: Score,
  opts: AbcOptions,
  kinds: AnnotationKinds,
  textOf: (n: number, eventIds: readonly string[]) => AnnotationTexts,
): AbcResult {
  const abc = toAbc(score, opts);
  const active = ANNOTATION_ORDER.filter((k) => kinds[k]);
  if (active.length === 0) return abc;
  const lines = abc.abc.replace(/\n$/, "").split("\n");
  const kIdx = lines.findIndex((l) => l.startsWith("K:"));
  if (kIdx < 0) return abc;
  // The lines read in the sans face abcjs uses for texts over the notes, as `toAbc`'s own annotation lines do:
  // abcjs's lyric default is bold Times, where syllables under quarter notes run together ("domisolmi").
  const head = lines.slice(0, kIdx + 1);
  if (!head.some((l) => l.startsWith("%%vocalfont"))) head.splice(kIdx, 0, "%%vocalfont Helvetica 12");
  const body = lines.slice(kIdx + 1);
  const voices = score.staves.flatMap((s, si) => s.voices.map((v, vi) => ({ s, si, v, vi })));
  const multi = voices.length > 1;
  const perLine = Math.max(1, opts.barsPerLine ?? 4);
  const nBars = score.staves[0]?.voices[0]?.bars.length ?? 0;
  const out: string[] = [];
  let i = 0;
  // Systems as `toAbc` lays them out: a pickup bar does not count towards the first system's bars.
  const span = (from: number) => (from === 0 && score.pickup ? perLine + 1 : perLine);
  for (let from = 0; from < nBars; from += span(from)) {
    const to = Math.min(nBars, from + span(from));
    for (const { s, v, vi } of voices) {
      if (multi) {
        if (body[i] !== `V:${v.id}`) return abc;
        out.push(body[i++] as string);
      }
      const music = body[i++];
      if (music === undefined || music.startsWith("w:") || music.startsWith("V:")) return abc;
      // Every voice of a staff gets its lines (a chord under a tune is labelled too). abcjs keeps room under a
      // staff for its first voice's lyric lines only and sets the numerals under them, so a later voice's lines
      // would print over the numerals (the Wave 4 review; c5). As `toAbc` does, the first voice is padded with a
      // blank line for each line the later voices of its staff carry: the numerals stay under the staff, below
      // every lens line (closer: raising them above the staff ran them into the chord symbols and the stems).
      out.push(music);
      while (body[i]?.startsWith("w:")) out.push(body[i++] as string);
      if (s.clef !== "perc") {
        let own = 0;
        for (const k of active) {
          const w = lyricLine(v, from, to, k, textOf);
          if (w) {
            out.push(w);
            own++;
          }
        }
        if (vi === 0 && own > 0) {
          const later = s.voices.slice(1).length;
          for (let n = 0; n < later * own; n++) out.push(padLine(v, from, to));
        }
      }
    }
  }
  if (i !== body.length) return abc;
  return { ...abc, abc: `${[...head, ...out].join("\n")}\n` };
}

/** A voice's numeral annotations (`"_IV"`, below the staff) written above it instead (`"^IV"`). */
export function raiseNumerals(music: string): string {
  return music.replace(/"_([^"]*)"/g, '"^$1"');
}
