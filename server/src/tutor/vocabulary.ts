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

/** The modes whose triads are the minor key's (`MINOR_NUMERALS`); Dorian and Phrygian have their own colour chord. */
const MINOR_KEY_NUMERALS: ReadonlySet<string> = new Set(["minor", "harmonic minor", "melodic minor"]);

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
  // Wave 6: a colour mode is its parent scale with one note changed; that note is what to listen for.
  const colour = modeColourText(mode, v);
  if (colour) parts.push(colour);
  if (MINOR_KEY_NUMERALS.has(mode) && v.numerals)
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

// --- Wave 6: sevenths, rhythm II, modes, chromatic degrees, applied and borrowed chords, key changes ----------------

/**
 * The Wave 6 glossary terms each form waits for (content/terms.ts, U12–U17). One term per teaching step: the two
 * sevenths of U12.L01 arrive together, as do the half-diminished and diminished sevenths of U12.L03, the tie and the
 * dot of U13.L03, and the mode, its characteristic tone and Mixolydian of U14.L01.
 */
export const W6_TERMS = {
  majorSeventh: "term.major-seventh-chord",
  halfDiminished: "term.half-diminished",
  guideTones: "term.guide-tones",
  intervalInversion: "term.interval-inversion",
  rootless: "term.rootless-voicing",
  syncopation: "term.syncopation",
  ghostNote: "term.ghost-note",
  tie: "term.tie",
  compoundMeter: "term.compound-meter",
  triplet: "term.triplet",
  mode: "term.mode",
  dorian: "term.dorian",
  lydian: "term.lydian",
  phrygian: "term.phrygian",
  chromaticDegree: "term.chromatic-degree",
  secondaryDominant: "term.secondary-dominant",
  tonicization: "term.tonicization",
  borrowed: "term.borrowed-chord",
  mixture: "term.modal-mixture",
  picardy: "term.picardy-third",
  reharmonization: "term.reharmonization",
  modulation: "term.modulation",
  directModulation: "term.direct-modulation",
} as const;

export type W6Form = keyof typeof W6_TERMS;
export type W6Vocabulary = Record<W6Form, boolean>;

export function w6VocabularyOf(terms: IntroducedTerms): W6Vocabulary {
  const have = introducedSet(terms);
  const out = {} as W6Vocabulary;
  for (const [form, id] of Object.entries(W6_TERMS)) out[form as W6Form] = have.has(id);
  return out;
}

/**
 * The four colour modes of U14, each as its parent scale with one note changed (content-kit `MODE_CHARACTERISTIC`;
 * wave6.music.test.ts keeps them equal): the changed note is the mode's characteristic tone, and `chord` is the
 * chord that carries it (the vamp each lesson is built on).
 */
export const MODE_COLOUR: Readonly<
  Record<string, { parent: "major" | "minor"; tone: string; replaces: string; chord: string; vamp: string }>
> = {
  mixolydian: { parent: "major", tone: "b7", replaces: "7", chord: "bVII", vamp: "I bVII" },
  lydian: { parent: "major", tone: "#4", replaces: "4", chord: "II", vamp: "I II" },
  dorian: { parent: "minor", tone: "6", replaces: "b6", chord: "IV", vamp: "i IV" },
  phrygian: { parent: "minor", tone: "b2", replaces: "2", chord: "bII", vamp: "i bII" },
};

/** The term a colour mode waits for (Mixolydian arrives with `term.mode` in U14.L01). */
const MODE_TERM: Readonly<Record<string, W6Form>> = {
  mixolydian: "mode",
  dorian: "dorian",
  lydian: "lydian",
  phrygian: "phrygian",
};

/**
 * The chromatic degrees of U15.L01 with their syllables and where each leans (content-kit `CHROMATIC_DEGREES`,
 * @oak/theory `CHROMATIC_DEGREE_TABLE`; wave6.music.test.ts checks them). Raised notes lean up, lowered notes down.
 */
export const CHROMATIC_LEANS: readonly { degree: string; syllable: string; to: string }[] = [
  { degree: "#4", syllable: "fi", to: "5" },
  { degree: "b7", syllable: "te", to: "6" },
  { degree: "#5", syllable: "si", to: "6" },
  { degree: "#1", syllable: "di", to: "2" },
  { degree: "b2", syllable: "ra", to: "1" },
  { degree: "b3", syllable: "me", to: "2" },
  { degree: "b6", syllable: "le", to: "5" },
];

/** The five seventh chords of U12 as code writes them on C, with the numeral suffix Oak prints. */
export const SEVENTH_FORMS: readonly { quality: string; symbol: string; rn: string; stack: string }[] = [
  { quality: "maj7", symbol: "C^7", rn: "Imaj7", stack: "1-3-5-7" },
  { quality: "7", symbol: "C7", rn: "V7", stack: "1-3-5-b7" },
  { quality: "m7", symbol: "Cm7", rn: "ii7", stack: "1-b3-5-b7" },
  { quality: "m7b5", symbol: "Cm7b5", rn: "viiø7", stack: "1-b3-b5-b7" },
  { quality: "dim7", symbol: "Co7", rn: "viio7", stack: "1-b3-b5-bb7" },
];

/** The colour-mode part of the `scale:` line: which note changed against the parent scale, and its chord. */
export function modeColourText(mode: string | null, v: Vocabulary): string | null {
  const c = mode === null ? undefined : MODE_COLOUR[mode];
  if (!c) return null;
  const parts = [
    `${c.parent} with ${c.replaces} changed to ${c.tone}: the characteristic tone is ${c.tone}${v.solfege ? ` (${DEGREE_SYLLABLES[c.tone] ?? c.tone})` : ""}`,
  ];
  if (v.numerals) parts.push(`its colour chord is ${c.chord} (the vamp ${c.vamp})`);
  return parts.join("; ");
}

/** One entry of a key plan as the tutor reads it: the key from this 1-based bar on (0 is a pickup bar). */
export interface KeyPlanEntryLike {
  bar: number;
  key: string;
}

const NOTE_PC: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Pitch class of a key's tonic (`"Eb major"`, `"F#4:minor"`), or null. */
export function tonicPcOf(key: string | null | undefined): number | null {
  const m = /^\s*([A-Ga-g])([#b♯♭]?)/.exec(key ?? "");
  if (!m) return null;
  const acc = m[2] === "#" || m[2] === "♯" ? 1 : m[2] === "b" || m[2] === "♭" ? -1 : 0;
  return ((NOTE_PC[(m[1] as string).toUpperCase()] as number) + acc + 12) % 12;
}

/** "up 2 half steps (a whole step)", "down 5 half steps": the shortest way from one tonic to the other. */
export function keyMoveText(from: string, to: string): string | null {
  const a = tonicPcOf(from);
  const b = tonicPcOf(to);
  if (a === null || b === null) return null;
  const up = (b - a + 12) % 12;
  if (up === 0) return modeOf(from) === modeOf(to) ? null : "same home note, another mode";
  const steps = up <= 6 ? up : 12 - up;
  const dir = up <= 6 ? "up" : "down";
  const name = steps === 1 ? " (a half step)" : steps === 2 ? " (a whole step)" : "";
  return `${dir} ${steps} half step${steps === 1 ? "" : "s"}${name}`;
}

/**
 * The `key_plan:` context line of a step or piece that changes key (contracts §6.8; wave6.md §11 `key-plan`): each
 * key with the bar it starts on and how far the home note moves. Null for one key. Degrees and numerals are read in
 * the key in force at each bar, which the line says.
 */
export function keyPlanLine(plan: readonly KeyPlanEntryLike[] | null | undefined): string | null {
  const entries = [...(plan ?? [])].filter((e) => e.key.trim() !== "").sort((a, b) => a.bar - b.bar);
  const spans: KeyPlanEntryLike[] = [];
  for (const e of entries) if (spans.at(-1)?.key !== e.key) spans.push(e);
  if (spans.length < 2) return null;
  const parts = spans.map((e, i) => {
    const prev = spans[i - 1];
    if (!prev) return `${e.key} from bar ${e.bar}`;
    const move = keyMoveText(prev.key, e.key);
    return `${e.key} from bar ${e.bar}${move ? ` (${move})` : ""}`;
  });
  return `key_plan: ${parts.join(" · ")} · read degrees and numerals in the key in force at each bar`;
}

/**
 * The Wave 6 lines: what of seventh chords, guide tones, pushes, ghost notes, ties, compound meter, triplets, the
 * modes, chromatic degrees, applied and borrowed chords and key changes the learner has met, and how to name each
 * now. Empty until the learner has met any of it, unless the key on screen is a colour mode or the step has a key
 * plan (then the lines say those words are previews), so an earlier learner's context stays as it was.
 */
export function w6VocabularyLines(
  w: W6Vocabulary,
  v: Vocabulary,
  o: { key?: string | null; keyPlan?: boolean; dominantSeventh?: boolean } = {},
): string[] {
  const anyMet = Object.values(w).some(Boolean);
  const mode = modeOf(o.key);
  const modal = mode !== null && mode in MODE_COLOUR;
  if (!anyMet && !modal && !o.keyPlan) return [];
  const met = [
    `major and minor sevenths ${yn(w.majorSeventh)}`,
    `half-diminished and diminished sevenths ${yn(w.halfDiminished)}`,
    `guide tones ${yn(w.guideTones)}`,
    `interval inversion and compound intervals ${yn(w.intervalInversion)}`,
    `rootless voicings ${yn(w.rootless)}`,
    `pushes and syncopation ${yn(w.syncopation)}`,
    `ghost notes ${yn(w.ghostNote)}`,
    `ties and dotted notes ${yn(w.tie)}`,
    `compound meter ${yn(w.compoundMeter)}`,
    `triplets ${yn(w.triplet)}`,
    `modes and Mixolydian ${yn(w.mode)}`,
    `Dorian ${yn(w.dorian)}`,
    `Lydian ${yn(w.lydian)}`,
    `Phrygian ${yn(w.phrygian)}`,
    `chromatic degrees ${yn(w.chromaticDegree)}`,
    `secondary dominants ${yn(w.secondaryDominant)}`,
    `tonicization and applied vii° ${yn(w.tonicization)}`,
    `borrowed chords ${yn(w.borrowed)}`,
    `modal mixture ${yn(w.mixture)}`,
    `Picardy third ${yn(w.picardy)}`,
    `reharmonization ${yn(w.reharmonization)}`,
    `modulation and pivot chords ${yn(w.modulation)}`,
    `direct modulation ${yn(w.directModulation)}`,
  ];
  const forms: string[] = [];

  // U12: seventh chords by quality and symbol, guide tones.
  const sevenths = SEVENTH_FORMS.filter(
    (s) =>
      (s.quality === "7" && (o.dominantSeventh || w.majorSeventh)) ||
      ((s.quality === "maj7" || s.quality === "m7") && w.majorSeventh) ||
      ((s.quality === "m7b5" || s.quality === "dim7") && w.halfDiminished),
  );
  if (sevenths.length === 0) forms.push("seventh qualities beyond the triad only as a preview");
  else {
    const names = sevenths.map((s) =>
      v.chordSymbols ? `[[chord:${s.symbol}]] (${s.stack})` : `${s.quality} as ${s.stack}`,
    );
    const later = SEVENTH_FORMS.length - sevenths.length;
    forms.push(
      `seventh chords as code writes them: ${names.join(", ")}${v.numerals ? `; numerals ${sevenths.map((s) => `[[rn:${s.rn}]]`).join(" ")}` : ""}${later > 0 ? "; the other seventh qualities only as a preview" : ""}`,
    );
  }
  forms.push(
    w.guideTones
      ? "guide tones: the 3rd and 7th of each chord, named by degree of the chord and followed from chord to chord"
      : "guide tones only as a preview: say 'the 3rd and the 7th of the chord'",
  );
  if (w.rootless) forms.push('rootless voicings as .dict("lefthand"): the bass supplies the root');

  // U13: rhythm in the course's words and in code.
  forms.push(
    w.syncopation
      ? "a push (anticipation) as a note that arrives an eighth or a sixteenth early and holds over the beat: .early(1/8), .late(1/8)"
      : "pushes and syncopation only as a preview: say 'it arrives before the beat'",
  );
  forms.push(
    w.ghostNote
      ? "ghost notes as quiet hits between the accents: .velocity() with one value per step"
      : "ghost notes only as a preview",
  );
  forms.push(
    w.tie
      ? "ties and dotted notes as held lengths: @ in code (a dotted quarter is @3 of eighths; a tie over a bar line is [..]@2 inside < >)"
      : "ties and dotted notes only as a preview: say how many beats a note holds",
  );
  forms.push(
    w.compoundMeter
      ? "compound meter: 6/8 is two beats of three eighths, counted 1 la li 2 la li; tempo setcpm(bpm/2) to the dotted quarter"
      : "compound meter only as a preview: say 'beats that split in three'",
  );
  forms.push(
    w.triplet ? "triplets: three equal notes in one beat, [a b c] or .ply(3)" : "triplets only as a preview",
  );

  // U14: each mode by the one note that changed.
  const modes = Object.entries(MODE_COLOUR).map(([name, c]) => {
    const metIt = w[MODE_TERM[name] as W6Form];
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    return metIt
      ? `${label} = ${c.parent} with ${c.tone}${v.numerals ? ` (${c.vamp})` : ""}`
      : `${label} only as a preview`;
  });
  forms.push(
    w.mode
      ? `a mode by its characteristic tone, the one note changed: ${modes.join("; ")}`
      : "modes only as a preview: describe the one note that differs from major or minor, by degree",
  );

  // U15: chromatic degrees, their syllables and where they lean.
  forms.push(
    w.chromaticDegree
      ? `chromatic degrees by the degree they bend, written [[deg:#4]]${v.solfege ? `, sung ${CHROMATIC_LEANS.map((c) => `${c.degree} ${c.syllable}`).join(", ")}` : ""}; raised notes lean up (#4 to 5), lowered notes lean down (b7 to 6); in n() a raised degree is the step below with # ("3#" is #4) and a lowered one the step with b ("6b" is b7)`
      : "notes outside the key by sound and by the degree they sit next to; chromatic syllables (fi, si, di) only as a preview",
  );

  // U15–U16: applied and borrowed chords.
  forms.push(
    w.secondaryDominant
      ? `secondary dominants as [[rn:V7/V]], said "five of five": name the chord it leans into and whether it resolves there${w.tonicization ? "; applied leading-tone chords as [[rn:viio7/ii]]; tonicization" : "; applied vii° only as a preview"}`
      : "secondary dominants only as a preview: say 'the V chord of the next chord', never V/x as a known name",
  );
  forms.push(
    w.borrowed
      ? `borrowed chords as [[rn:iv]] [[rn:bVI]] [[rn:bVII]] [[rn:bIII]], each as a chord of the key with one note changed${w.mixture ? "; modal mixture" : ""}${w.picardy ? "; Picardy third (a major home chord ending a minor piece)" : ""}`
      : "borrowed chords only as a preview: say 'the IV chord with its third lowered', by degree",
  );
  if (w.reharmonization) forms.push("reharmonization: new chords under the same tune");

  // U17: key changes.
  forms.push(
    w.modulation
      ? `a key change by its two keys and the bar it happens in; a pivot chord by its numeral in both keys ("vi in C, ii in G")${w.directModulation ? "; a direct modulation (the lift) by how far it moves in half steps" : "; direct modulation only as a preview"}; in code a patterned .scale("<C4:major!8 D4:major!4>") after arrange()`
      : "key changes only as a preview: say 'the home note moves', and name both homes",
  );
  return [`vocabulary_later: ${met.join(" · ")}`, `forms_later: ${forms.join("; ")}`];
}
