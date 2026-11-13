// What the learner can be spoken to in (contracts §10.8, §10.11; wave3.md §0, wave4.md §5.6): which singing
// names, interval names, chord and numeral forms they have met. Read from the introduced-terms list; rendered as
// two `<oak_context>` lines the persona follows. Anything beyond them is written once as `[[term:…]]` (a preview)
// and never built on. Pure.
import type { IntroducedTerms } from "./domain.ts";

/** The glossary terms each form waits for (content/terms.ts IDs; locked in content/ids.lock.json). */
export const VOCAB_TERMS = {
  solfege: "term.solfege",
  intervalNames: "term.interval-quality",
  triad: "term.triad",
  qualities: "term.major-triad",
  diminishedAugmented: "term.diminished-triad",
  chordSymbols: "term.chord-symbol",
  inversions: "term.inversion",
  slashChords: "term.slash-chord",
  voiceLeading: "term.voice-leading",
  numerals: "term.roman-numeral",
  function: "term.harmonic-function",
  cadence: "term.cadence",
  seventh: "term.seventh-chord",
  nonChordTones: "term.non-chord-tone",
} as const;

export type VocabForm = keyof typeof VOCAB_TERMS;
export type Vocabulary = Record<VocabForm, boolean>;

/** The term IDs known to be introduced: the whole list when the adapter sends it, else the recent ones. */
export function introducedSet(terms: IntroducedTerms): ReadonlySet<string> {
  return new Set(terms.all ?? terms.recent);
}

export function vocabularyOf(terms: IntroducedTerms): Vocabulary {
  const have = introducedSet(terms);
  const out = {} as Vocabulary;
  for (const [form, id] of Object.entries(VOCAB_TERMS)) out[form as VocabForm] = have.has(id);
  return out;
}

const yn = (b: boolean) => (b ? "yes" : "no");

/** Two context lines: what has been met, and how to write chords, numerals and singing names now. */
export function vocabularyLines(v: Vocabulary): string[] {
  const met = [
    `solfège ${yn(v.solfege)}`,
    `interval names ${yn(v.intervalNames)}`,
    `triads ${yn(v.triad)}`,
    `chord qualities ${yn(v.qualities)}`,
    `chord symbols ${yn(v.chordSymbols)}`,
    `inversions ${yn(v.inversions)}`,
    `voice leading ${yn(v.voiceLeading)}`,
    `roman numerals ${yn(v.numerals)}`,
    `function ${yn(v.function)}`,
    `cadence names ${yn(v.cadence)}`,
    `sevenths ${yn(v.seventh)}`,
    `non-chord tones ${yn(v.nonChordTones)}`,
  ];
  const forms: string[] = [];
  forms.push(
    v.solfege
      ? "sing with degree numbers, movable-do syllables allowed"
      : "sing with degree numbers only, no syllables",
  );
  if (!v.triad) forms.push("chords as notes sounding together, by degree numbers");
  else if (!v.chordSymbols)
    forms.push('chords as stacked degrees ("1-3-5 on degree 1"); [[chord:…]] only as a preview');
  else forms.push(`chords as [[chord:…]]${v.slashChords ? " with slash chords" : ", root position only"}`);
  forms.push(v.numerals ? "numerals as [[rn:…]]" : "no [[rn:…]] yet: name the chord by degree or symbol");
  if (!v.function) forms.push("function words only as a preview");
  if (!v.cadence) forms.push("cadence names only as a preview");
  return [`vocabulary: ${met.join(" · ")}`, `forms: ${forms.join("; ")}`];
}
