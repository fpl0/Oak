// What abcjs 6.7.2 cannot draw as written, found by execution (abcjs-limits.test.ts pins every row), and
// what @oak/notation does about it. A limit the engraver can meet in content raises an `abcjs-limit`
// warning on the Score, so content CI (check 9, "Notation": any warning is an issue) tells the author at
// build time instead of the learner seeing a wrong staff at runtime.
import { keySig } from "./theory-port.ts";
import type { NotationWarning, Score } from "./types.ts";

export interface AbcjsLimit {
  id: string;
  /** What abcjs does with it (verified in abcjs-limits.test.ts). */
  abcjs: string;
  /** What the emitter writes instead. */
  fallback: string;
  /** Whether the Score carries a warning (`abcjs-limit` unless stated), which content CI reports. */
  warns: NotationWarning["code"] | null;
}

export const ABCJS_LIMITS: readonly AbcjsLimit[] = [
  {
    id: "theoretical-key",
    abcjs:
      "K: with more than seven accidentals (G♯, D♯, F♭ major …) is silently drawn as another key: K:G# shows four flats, K:Fb none.",
    fallback:
      "the signature is written out explicitly (K:C exp ^^f ^c …), so the staff is right, and the Score warns: no lesson should be in a theoretical key.",
    warns: "abcjs-limit",
  },
  {
    id: "same-step-chord",
    abcjs:
      "a chord with two notes on one staff step ([=F^F]) is drawn as two heads on top of each other with both accidentals stacked: unreadable.",
    fallback: "written as given; the Score warns so content spells the chord on different steps.",
    warns: "abcjs-limit",
  },
  {
    id: "long-tuplet",
    abcjs: "tuplets with more than 9 notes ((11:8:11 …) do not parse: the ratio becomes a warning.",
    fallback: "the bar is snapped to the grid (Score.approximate).",
    warns: "tuplet-too-long",
  },
  {
    id: "nested-tuplet",
    abcjs: "no nested tuplets: a tuplet inside a tuplet takes the outer ratio only.",
    fallback: "the quantizer writes the inner group at the outer ratio or snaps it (mixed-tuplets).",
    warns: "mixed-tuplets",
  },
  {
    id: "five-voices",
    abcjs: "voices are drawn, but more than four on one staff collide (stems, rests).",
    fallback: "at most four voices per staff; a fifth line is cut (overlap-cut).",
    warns: "overlap-cut",
  },
  {
    id: "far-ledger-lines",
    abcjs:
      "notes far outside the staff (more than about five ledger lines) are drawn, but run into the lyrics, annotations and the other staff.",
    fallback: "written as given; the Score warns (out-of-range) so content picks the clef or the octave.",
    warns: "out-of-range",
  },
  {
    id: "cautionary-accidental",
    abcjs: "no syntax for a cautionary accidental in parentheses.",
    fallback: "courtesy accidentals are printed as plain accidentals.",
    warns: null,
  },
  {
    id: "class-in-chord",
    abcjs:
      "a !class=…! decoration inside chord brackets is dropped, and only the last of several decorations survives.",
    fallback: "one decoration per element, before the brackets, holding every class.",
    warns: null,
  },
  {
    id: "voice-id-underscore",
    abcjs: "a voice id containing _ in %%score is rejected.",
    fallback: "voice ids are S1, S1v2, RH, LH, DR, DRv2.",
    warns: null,
  },
  {
    id: "lyric-per-element",
    abcjs:
      "a lyric line gives one syllable per note element (a chord is one element); spaces, - and _ split or extend syllables.",
    fallback:
      "a chord's annotation is one syllable joined with ~ (shown as a space); - _ * | are stripped from the text.",
    warns: null,
  },
  {
    id: "annotation-above",
    abcjs: 'several "^text" annotations on one note are joined into one text, stacked with line breaks.',
    fallback: "annotations above the staff are one stacked text per note (degree, solfège, name).",
    warns: null,
  },
];

/** The `abcjs-limit` warnings of a Score (theoretical key, same-step chords). Pure. */
export function abcjsLimitWarnings(score: Pick<Score, "key" | "staves">): NotationWarning[] {
  const out: NotationWarning[] = [];
  if (score.key) {
    const ks = keySig(score.key);
    if (ks.notes.length > 7)
      out.push({
        code: "abcjs-limit",
        bar: 0,
        message: `${score.key.tonic} ${score.key.mode} is a theoretical key (${ks.notes.length} accidentals): written with an explicit signature`,
      });
  }
  for (const s of score.staves) {
    if (s.clef === "perc") continue;
    for (const v of s.voices)
      for (const b of v.bars)
        for (const it of b.items) {
          if (it.kind !== "chord" || it.tieFromPrev) continue;
          const steps = it.pitches.map((p) => `${p.letter}${p.oct}`);
          if (new Set(steps).size < steps.length)
            out.push({
              code: "abcjs-limit",
              bar: b.index,
              message: `a chord holds two notes on one staff step (${it.pitches.map((p) => p.name).join(" ")})`,
            });
        }
  }
  return out;
}
