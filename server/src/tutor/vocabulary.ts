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

// --- Wave 5: bass lines, form, minor, pentatonic and blues, the sound side lessons ---------------------------------

/**
 * The Wave 5 glossary terms each form waits for (content/terms.ts, U08–U11 and A1.L01–L04). The bass roles root,
 * fifth and octave need no term of their own: root (U05.L01) and the interval words came first.
 */
export const W5_TERMS = {
  approachTone: "term.approach-tone",
  grooveLock: "term.groove-lock",
  verseChorus: "term.verse",
  form: "term.form",
  bridge: "term.bridge",
  energyCurve: "term.energy-curve",
  naturalMinor: "term.natural-minor",
  relativeMinor: "term.relative-minor",
  aeolian: "term.aeolian",
  harmonicMinor: "term.harmonic-minor",
  melodicMinor: "term.melodic-minor",
  pentatonic: "term.pentatonic",
  blueNote: "term.blue-note",
  bluesScale: "term.blues-scale",
  dominantSeventh: "term.dominant-seventh",
  twelveBar: "term.twelve-bar-blues",
  quickChange: "term.quick-change",
  turnaround: "term.turnaround",
  swing: "term.swing",
  shuffle: "term.shuffle",
  harmonics: "term.harmonic-series",
  filter: "term.filter",
  envelope: "term.envelope",
  delay: "term.delay",
} as const;

export type W5Form = keyof typeof W5_TERMS;
export type W5Vocabulary = Record<W5Form, boolean>;

export function w5VocabularyOf(terms: IntroducedTerms): W5Vocabulary {
  const have = introducedSet(terms);
  const out = {} as W5Vocabulary;
  for (const [form, id] of Object.entries(W5_TERMS)) out[form as W5Form] = have.has(id);
  return out;
}

/**
 * The scales Oak teaches, as Strudel names them and as content keys name them, with their degrees spelled against
 * the major scale (do-based in minor: 1 is home, ♭3 ♭6 ♭7). The same table as content-kit `MODE_DEGREES`
 * (vocabulary.music.test.ts keeps them equal; the tutor imports no package).
 */
export const MODE_DEGREES: Readonly<Record<string, readonly string[]>> = {
  major: ["1", "2", "3", "4", "5", "6", "7"],
  minor: ["1", "2", "b3", "4", "5", "b6", "b7"],
  "harmonic minor": ["1", "2", "b3", "4", "5", "b6", "7"],
  "melodic minor": ["1", "2", "b3", "4", "5", "6", "7"],
  dorian: ["1", "2", "b3", "4", "5", "6", "b7"],
  phrygian: ["1", "b2", "b3", "4", "5", "b6", "b7"],
  lydian: ["1", "2", "3", "#4", "5", "6", "7"],
  mixolydian: ["1", "2", "3", "4", "5", "6", "b7"],
  locrian: ["1", "b2", "b3", "4", "b5", "b6", "b7"],
  "major pentatonic": ["1", "2", "3", "5", "6"],
  "minor pentatonic": ["1", "b3", "4", "5", "b7"],
  blues: ["1", "b3", "4", "b5", "5", "b7"],
};

/** Movable-do, do-based in minor (content-kit `DEGREE_SYLLABLES`). */
export const DEGREE_SYLLABLES: Readonly<Record<string, string>> = {
  "1": "do",
  "#1": "di",
  b2: "ra",
  "2": "re",
  "#2": "ri",
  b3: "me",
  "3": "mi",
  "4": "fa",
  "#4": "fi",
  b5: "se",
  "5": "sol",
  "#5": "si",
  b6: "le",
  "6": "la",
  "#6": "li",
  b7: "te",
  "7": "ti",
};

/**
 * The diatonic triads of the minor key in Oak's numerals (@oak/theory `romanText` of `minorKeyChords`): natural
 * minor, with V and vii° from harmonic minor (raised 7). vocabulary.music.test.ts checks them against @oak/theory.
 */
export const MINOR_NUMERALS = {
  natural: ["i", "ii°", "III", "iv", "v", "VI", "VII"],
  harmonic: ["V", "vii°"],
} as const;

/** Strudel scale names (`.scale("A3:harmonic:minor")`, `"C4:major:pentatonic"`) to Oak's mode names. */
const STRUDEL_SCALES: Readonly<Record<string, string>> = {
  major: "major",
  ionian: "major",
  minor: "minor",
  aeolian: "minor",
  "harmonic minor": "harmonic minor",
  "melodic minor": "melodic minor",
  dorian: "dorian",
  phrygian: "phrygian",
  lydian: "lydian",
  mixolydian: "mixolydian",
  locrian: "locrian",
  "major pentatonic": "major pentatonic",
  "minor pentatonic": "minor pentatonic",
  blues: "blues",
  "minor blues": "blues",
};

/** The mode a key text (`"A harmonic minor"`) or a Strudel scale (`"A3:harmonic:minor"`) names, or null. */
export function modeOf(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = text.trim();
  const colon = t.indexOf(":");
  const name = (
    colon >= 0 ? t.slice(colon + 1).replace(/:/g, " ") : t.replace(/^[A-Ga-g][#b♯♭]?-?\d*\s+/, "")
  )
    .trim()
    .toLowerCase();
  return STRUDEL_SCALES[name] ?? (name in MODE_DEGREES ? name : null);
}

/** Modes whose third is ♭3: the minor family, sung and numbered do-based. */
const MINOR_FAMILY = new Set(["minor", "harmonic minor", "melodic minor", "dorian", "phrygian", "locrian"]);

export function isMinorMode(mode: string | null): boolean {
  return mode !== null && MINOR_FAMILY.has(mode);
}

/**
 * The `scale:` context line for the step's key when it is not plain major (wave5.md §10 item 12): the degrees of
 * its mode, do-based syllables once solfège is met, and in the minor family the numerals of the key once Roman
 * numerals are met. Null for major or no key.
 */
export function keyScaleLine(key: string | null | undefined, v: Vocabulary): string | null {
  const mode = modeOf(key);
  if (mode === null || mode === "major") return null;
  const degrees = MODE_DEGREES[mode] ?? [];
  const parts = [`scale: ${mode}`, `degrees ${degrees.join(" ")}`];
  if (v.solfege)
    parts.push(`sung ${degrees.map((d) => DEGREE_SYLLABLES[d] ?? d).join(" ")} (do-based: 1 is do)`);
  if (mode === "melodic minor") parts.push("descending as natural minor: b7 b6");
  if (isMinorMode(mode) && v.numerals)
    parts.push(
      `numerals ${MINOR_NUMERALS.natural.join(" ")}; ${MINOR_NUMERALS.harmonic.join(" and ")} with the raised 7`,
    );
  if (mode === "blues" || mode === "minor pentatonic")
    parts.push("in n() these scales count their own notes, so n is not degree - 1 here");
  if (mode === "major pentatonic") parts.push("in n() this scale counts its own five notes");
  return parts.join(" · ");
}

/**
 * The Wave 5 lines: what of bass lines, form, minor, blues, swing and the sound lessons the learner has met, and
 * how to name each now. Empty until the learner has met any of it and the key is plain major, so an early
 * learner's context stays as it was.
 */
export function w5VocabularyLines(w: W5Vocabulary, v: Vocabulary, key?: string | null): string[] {
  const anyMet = Object.values(w).some(Boolean);
  const mode = modeOf(key);
  if (!anyMet && (mode === null || mode === "major")) return [];
  const met = [
    `approach tones ${yn(w.approachTone)}`,
    `groove lock ${yn(w.grooveLock)}`,
    `verse and chorus ${yn(w.verseChorus)}`,
    `song form ${yn(w.form)}`,
    `bridge ${yn(w.bridge)}`,
    `energy curve ${yn(w.energyCurve)}`,
    `natural minor ${yn(w.naturalMinor)}`,
    `relative and parallel minor ${yn(w.relativeMinor)}`,
    `harmonic minor ${yn(w.harmonicMinor)}`,
    `melodic minor ${yn(w.melodicMinor)}`,
    `pentatonic ${yn(w.pentatonic)}`,
    `blue notes ${yn(w.blueNote)}`,
    `blues scale ${yn(w.bluesScale)}`,
    `dominant sevenths ${yn(w.dominantSeventh)}`,
    `12-bar blues ${yn(w.twelveBar)}`,
    `quick change ${yn(w.quickChange)}`,
    `turnaround ${yn(w.turnaround)}`,
    `swing ${yn(w.swing)}`,
    `shuffle ${yn(w.shuffle)}`,
    `harmonics ${yn(w.harmonics)}`,
    `filters ${yn(w.filter)}`,
    `envelopes ${yn(w.envelope)}`,
    `delay ${yn(w.delay)}`,
  ];
  const forms: string[] = [];
  forms.push(
    `bass notes by role: root, fifth, octave${w.approachTone ? ", approach tone" : "; approach tones only as a preview"}${w.grooveLock ? "; groove lock with the kick" : ""}`,
  );
  forms.push(
    w.verseChorus
      ? `sections by the names the section ribbon prints (Verse, Chorus 2${w.bridge ? ", Bridge" : ""})${w.form ? ", and as letters by first appearance (A B A B)" : ""}`
      : "sections as bar ranges and as the part that returns; verse and chorus only as a preview",
  );
  if (w.naturalMinor)
    forms.push(
      `minor degrees 1 2 b3 4 5 b6 b7 written [[deg:b3]]${v.solfege ? ", sung do re me fa sol le te (do-based minor: 1 is do)" : ""}${v.numerals ? "; minor numerals i iv v VI VII, V and vii° with the raised 7" : ""}; never relabel a minor piece in its relative major`,
    );
  else forms.push("minor keys only as a preview: describe them by sound and by degrees b3 b6 b7");
  if (!w.harmonicMinor || !w.melodicMinor)
    forms.push(
      `${[!w.harmonicMinor && "harmonic minor", !w.melodicMinor && "melodic minor"].filter(Boolean).join(" and ")} only as a preview`,
    );
  forms.push(
    w.pentatonic
      ? `pentatonic as degrees (major 1 2 3 5 6, minor 1 b3 4 5 b7)${w.blueNote ? "; blue notes b3 b5 b7" : "; blue notes only as a preview"}`
      : "pentatonic and blues scales only as a preview",
  );
  forms.push(
    w.dominantSeventh
      ? `dominant sevenths as ${v.chordSymbols ? "[[chord:C7]]" : "stacked degrees 1-3-5-b7"}${v.numerals ? " and [[rn:V7]]" : ""}`
      : "dominant sevenths only as a preview",
  );
  if (w.twelveBar)
    forms.push(
      `a 12-bar chorus counted bars 1-12 from the first full bar${w.quickChange ? "; quick change" : ""}${w.turnaround ? "; turnaround" : ""}`,
    );
  forms.push(
    w.swing ? "swing as long-short eighths (shuffle)" : "swing only as a preview: describe it as long-short",
  );
  const sound = [
    w.harmonics && "harmonics",
    w.filter && "filter and cutoff",
    w.envelope && "envelope",
    w.delay && "delay",
  ]
    .filter(Boolean)
    .join(", ");
  forms.push(
    sound
      ? `sound words: ${sound}; other sound controls only as a preview`
      : "sound controls only as a preview",
  );
  return [`vocabulary_more: ${met.join(" · ")}`, `forms_more: ${forms.join("; ")}`];
}
