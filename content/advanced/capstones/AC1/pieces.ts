// AC1 One Tune, Two Genres (content/specs/A2.md "AC1 One Tune, Two Genres"; contracts §2.6, §6.6): the starter and
// the pieces the brief's tests grade (content/capstones.ts AC1, content/advanced/capstones/AC1/ac1.test.ts).
//
// The tunes are the two the brief offers, each as the repertoire's answer key has it (US public domain):
// - Sweet Georgia Brown (B. Bernie, M. Pinkard and K. Casey, 1925), the 32-bar chorus in F
//   (content/repertoire/sweet-georgia-brown/song.ts): A B A C, eight bars a section.
// - St. Louis Blues (W. C. Handy, 1914), the first 12-bar strain in G (content/repertoire/st-louis-blues/song.ts),
//   played twice. Two identical choruses are one 12-bar period to the grader, so the brief asks for twelve bars.
//
// Music checked by running it (headless Strudel and the real grader in capstone mode, ac1.test.ts):
// - The melody below, in note names, plays exactly the notes and onsets of the answer key's melody layer (written
//   there as degrees of F major). Note names keep the altered notes (F♯ over D7, B over G7, C♯ in the turnaround)
//   readable before chromatic `n` steps, which a learner may not have when AC1 opens (U15.L01).
// - The changes, one entry a bar: D7 ×4 | G7 ×4 | C7 ×4 | F F [F C7] F A7 | D7 ×4 | G7 ×3 [G7 A7] | Dm A7 Dm A7 |
//   F D7 [G7 C7] F. The answer key's F^7 bars are written F: a major seventh is not needed to arrange the tune, and
//   AC1 may open before the sevenths by name (U12).
// - Swing: `.swingBy(1/3, 4)` swings the 8ths (2:1); the swung version swings its tune, bass and drums alike. The
//   grader reads the tune's notes on the straightened grid (the brief declares swung 8ths), so a swung tune is still
//   the song's.
// - Each version shapes one sound with an A1 control at a value that is heard: vibrato with depth, a filter envelope
//   over a cutoff, crush below 7 bits, a phaser with depth, a big room. `.vib(5).vibmod(0)` and `.crush(16)` are the
//   right functions at values nothing hears.

const tempo = (bpm: number) => `setcpm(${bpm}/4)`;

/** The tune, one entry a bar (`@2` spans two bars), as the answer key's melody layer plays it. */
export const SGB_BARS: readonly string[] = [
  // A, over D7: D E F♯~ D | A F♯ B~ A | D' A F♯ D~ (held into bar 4)
  "[d4 e4@2 f#4@4 d4]",
  "[a4 f#4@2 b4@4 a4]",
  "[d5@4 a4 f#4@2 d4@7 ~@2]@2",
  // over G7, the same notes with F natural
  "[d4 e4@2 f4@4 d4]",
  "[a4 f4@2 b4@4 g4]",
  "[d5@4 b4 a4@2 g4@7 ~@2]@2",
  // B, over C7, then F
  "[c4 d4@2 e4@4 c4]",
  "[g4 e4@2 a4@4 g4]",
  "[c5@4 g4 e4@2 c4@3 c4 d4@2 c4 d4@2]@2",
  "[a4@10 c4 d4@2 c4 d4@2]@2",
  "[a4@6 a4@2]",
  "[g4@6 ~@2]",
  // A again; its last note is shorter (A7 enters on beat 3 of bar 24)
  "[d4 e4@2 f#4@4 d4]",
  "[a4 f#4@2 b4@4 a4]",
  "[d5@4 a4 f#4@2 d4@7 ~@2]@2",
  "[d4 e4@2 f4@4 d4]",
  "[a4 f4@2 b4@4 g4]",
  "[d5@4 b4 a4@2 g4@5 ~@4]@2",
  // C, over Dm and A7, then the turnaround
  "[a4@3 a4@3 ~@2]",
  "[g4 e4@2 a4@3 a4@2]",
  "[a4@3 a4@3 ~@2]",
  "[g4 e4@2 a4@3 ~@2]",
  "[c4 d4@2 f4@2 c4@3]",
  "[c5 c#5@2 d5@2 a4@3]",
  "[g4@4 c5 a4@2 f4@5 ~@4]@2",
];

/** St. Louis Blues, the 12-bar strain, one entry a bar, as its answer key plays it (G; ♭3 is B♭, ♯5 below is D♯). */
export const SLB_BARS: readonly string[] = [
  "[b4 d5 b4 g4@2 ~@3]",
  "[~ d#4 e4 g4 bb4 a4@2 ~]",
  "g4",
  "~",
  "[~ e4 g4 a4@2 ~@3]",
  "[~ e4 g4 a4 bb4 a4@2 ~]",
  "g4",
  "~",
  "[f#4 a4 f#4 d4@2 ~@3]",
  "[~@2 bb4 bb4 bb4 a4@2 ~]",
  "g4",
  "~",
];
/** Its changes, one chord a bar: I IV7 I I7 | IV IV7 I I | V7 V7 I I. */
export const SLB_CHANGES: readonly string[] = "G C7 G G7 C C7 G G D7 D7 G G".split(" ");
/** Two choruses of the strain: 24 bars. */
export const slbTune = (): string => `<${[...SLB_BARS, ...SLB_BARS].join(" ")}>`;
export const slbChanges = (): string => `<${[...SLB_CHANGES, ...SLB_CHANGES].join(" ")}>`;

/** The changes, one entry a bar, 32 bars. */
export const SGB_CHANGES: readonly string[] = [
  ..."D7 D7 D7 D7 G7 G7 G7 G7 C7 C7 C7 C7 F".split(" "),
  "[F C7]",
  ..."F A7 D7 D7 D7 D7 G7 G7 G7".split(" "),
  "[G7 A7]",
  ..."Dm A7 Dm A7 F D7".split(" "),
  "[G7 C7]",
  "F",
];

/** How many bars an entry spans (`"[…]@2"` → 2). */
const span = (entry: string) => Number(/\]@(\d+)$/.exec(entry)?.[1] ?? 1);

/** The first `bars` bars of the tune as a `<…>` pattern (16: the A and B sections; 32: the chorus). */
export function sgbTune(bars = 32): string {
  const out: string[] = [];
  let n = 0;
  for (const e of SGB_BARS) {
    if (n >= bars) break;
    out.push(e);
    n += span(e);
  }
  return `<${out.join(" ")}>`;
}
/** The first `bars` bars of the changes. */
export const sgbChanges = (bars = 32): string => `<${SGB_CHANGES.slice(0, bars).join(" ")}>`;

/**
 * AC1.S1 and AC1.S2 open with this (the brief's `code.starter`): the tune at the song's own tempo over its changes
 * on a plain piano, nothing arranged yet. Each version replaces the tempo, the sounds and the parts around the tune.
 */
export const AC1_TEMPLATE = [
  tempo(200),
  "",
  "// Sweet Georgia Brown (1925): the 32-bar chorus in F, A B A C. The tune stays note for note; the rest is yours.",
  `const changes = "${sgbChanges()}"`,
  "",
  `mel: note("${sgbTune()}").s("piano")`,
  'chords: chord(changes).voicing().s("piano").gain(.5)',
  "// drums:, bass: and the parts of your genre; one sound shaped with a filter envelope, grit, movement, FM or room.",
].join("\n");

export interface Ac1Parts {
  bpm: number;
  bars?: number;
  /** Appended to every line (`.swingBy(1/3, 4)` for a swung version). */
  feel?: string;
  drums: string;
  /** The bass line's body after `bass: ` (default the roots of `changes`). */
  bass: string;
  /** The chords line's body after `chords: `. */
  chords: string;
  /** The tune's sound and its own controls, after `note(tune)`. */
  mel: string;
  /** The tune itself (default Sweet Georgia Brown's first `bars` bars). */
  tune?: string;
  /** The changes (default Sweet Georgia Brown's first `bars` bars). */
  changes?: string;
  extra?: string[];
}

/** One version: tempo, `changes`, drums, bass, chords and the tune, every line with the version's feel. */
export function ac1(p: Ac1Parts): string {
  const bars = p.bars ?? 32;
  const feel = p.feel ?? "";
  return [
    tempo(p.bpm),
    "",
    `const changes = "${p.changes ?? sgbChanges(bars)}"`,
    "",
    `drums: ${p.drums}${feel}`,
    `bass: ${p.bass}${feel}`,
    `chords: ${p.chords}${feel}`,
    `mel: note("${p.tune ?? sgbTune(bars)}")${p.mel}${feel}`,
    ...(p.extra ?? []),
  ].join("\n");
}

const SWUNG = ".swingBy(.2, 4)";

/** The versions, each one side of the album track. */
export const AC1_VERSIONS = {
  /** jazz-soul at 132, swung: ride and brushes' pattern, upright walking the roots, Rhodes, the tune on a piano with vibrato. */
  jazzSoul: ac1({
    bpm: 132,
    feel: SWUNG,
    drums: 's("[bd ~ ~ ~] [~ sd ~ ~], rd [rd rd] rd [rd rd]").gain(.5)',
    bass: 'chord(changes).rootNotes(2).s("upright")',
    chords: 'chord(changes).voicing().struct("~ x ~ x").s("rhodes").gain(.5)',
    mel: '.s("piano").vib(4).vibmod(.15)',
  }),
  /** funk at 104, straight: the 909 in 16ths, a filter-enveloped fingerbass, organ stabs, the tune on a sawtooth. */
  funk: ac1({
    bpm: 104,
    drums: 's("bd ~ ~ bd ~ ~ bd ~, ~ sd ~ sd, hh*16").bank("RolandTR909").gain(.6)',
    bass: 'chord(changes).rootNotes(2).struct("x ~ x x ~ x ~ x").s("fingerbass").lpf(300).lpenv(3).lpd(.15)',
    chords: 'chord(changes).voicing().struct("~ x ~ ~ ~ x ~ ~").s("organ").gain(.4)',
    mel: '.s("sawtooth").lpf(1800).gain(.5)',
  }),
  /** pop at 112, straight: the 808 with crushed hats, piano chords on every beat, the tune on the Rhodes. */
  pop: ac1({
    bpm: 112,
    drums: 's("bd ~ bd ~, ~ sd ~ sd").bank("RolandTR808")',
    bass: 'chord(changes).rootNotes(2).s("ebass")',
    chords: 'chord(changes).voicing().struct("x x x x").s("piano").gain(.45)',
    mel: '.s("rhodes")',
    extra: ['hats: s("hh*8").bank("RolandTR808").crush(6).gain(.4)'],
  }),
  /** indie at 140, straight: acoustic guitar strummed in 8ths through a phaser, crunchy lead, a big room on the snare. */
  indie: ac1({
    bpm: 140,
    drums: 's("bd ~ [~ bd] ~, ~ sd ~ sd, hh*8").room(.5).roomsize(6)',
    bass: 'chord(changes).rootNotes(2).s("fingerbass")',
    chords: 'chord(changes).voicing().struct("x*8").s("acgtr").phaser(2).gain(.4)',
    mel: '.s("crunch").gain(.5)',
  }),
};

/** Two versions of St. Louis Blues, two choruses each. */
export const AC1_SLB = {
  /** jazz-soul at 126, lightly swung: upright, Rhodes on 2 and 4, the tune on a piano with vibrato. */
  jazzSoul: ac1({
    bpm: 126,
    feel: SWUNG,
    changes: slbChanges(),
    tune: slbTune(),
    drums: 's("[bd ~ ~ ~] [~ sd ~ ~], rd [rd rd] rd [rd rd]").gain(.5)',
    bass: 'chord(changes).rootNotes(2).s("upright")',
    chords: 'chord(changes).voicing().struct("~ x ~ x").s("rhodes").gain(.5)',
    mel: '.s("piano").vib(4).vibmod(.15)',
  }),
  /** indie at 92, straight: crunchy guitar chords through a phaser, acoustic guitar on the tune, a big room. */
  indie: ac1({
    bpm: 92,
    changes: slbChanges(),
    tune: slbTune(),
    drums: 's("bd ~ [~ bd] ~, ~ sd ~ sd, hh*8").room(.5).roomsize(6)',
    bass: 'chord(changes).rootNotes(2).s("fingerbass")',
    chords: 'chord(changes).voicing().struct("x ~ x ~").s("crunch").phaser(2).gain(.35)',
    mel: '.s("acgtr")',
  }),
};

/** The other pieces the tests grade. */
export const AC1_PIECES = {
  template: AC1_TEMPLATE,
  ...AC1_VERSIONS,
  /** jazz-soul with the tune an octave lower: the same pitch classes, still the song's. */
  jazzSoulLow: AC1_VERSIONS.jazzSoul.replace(
    /mel: note\("([^"]+)"\)/,
    (_m, t: string) =>
      `mel: note("${t.replace(/([a-g]#?)(\d)/g, (_x, n: string, o: string) => `${n}${Number(o) - 1}`)}")`,
  ),
  /** funk with only the A and B sections: sixteen bars, enough for the brief. */
  funk16: ac1({
    bpm: 104,
    bars: 16,
    drums: 's("bd ~ ~ bd ~ ~ bd ~, ~ sd ~ sd, hh*16").bank("RolandTR909").gain(.6)',
    bass: 'chord(changes).rootNotes(2).struct("x ~ x x ~ x ~ x").s("fingerbass").lpf(300).lpenv(3).lpd(.15)',
    chords: 'chord(changes).voicing().struct("~ x ~ ~ ~ x ~ ~").s("organ").gain(.4)',
    mel: '.s("sawtooth").lpf(1800).gain(.5)',
  }),
  /** WRONG: two notes of the tune moved (bar 2's B and A become G and F). */
  tuneChanged: AC1_VERSIONS.jazzSoul.replace("[a4 f#4@2 b4@4 a4] [d5@4", "[a4 f#4@2 g4@4 f4] [d5@4"),
  /** WRONG beside `pop` (112, straight): the funk version at 124, twelve BPM away and straight too. */
  funkNear: AC1_VERSIONS.funk.replace("setcpm(104/4)", "setcpm(124/4)"),
  /** WRONG (no shaped sound): the funk version with its filter envelope taken off. */
  funkPlain: AC1_VERSIONS.funk.replace(".lpf(300).lpenv(3).lpd(.15)", ""),
  /** WRONG, the right function: vibrato with no depth, nothing heard. */
  funkNoDepth: AC1_VERSIONS.funk
    .replace(".lpf(300).lpenv(3).lpd(.15)", "")
    .replace('.s("sawtooth").lpf(1800)', '.s("sawtooth").lpf(1800).vib(5).vibmod(0)'),
  /** WRONG, the right function: crush at 16 bits, where the sound already is. */
  funkCrush16: AC1_VERSIONS.funk
    .replace(".lpf(300).lpenv(3).lpd(.15)", "")
    .replace('.s("sawtooth").lpf(1800)', '.s("sawtooth").lpf(1800).crush(16)'),
  /** WRONG, the right function: FM on a sampled piano, which FM does not reach. */
  funkFmPiano: AC1_VERSIONS.funk
    .replace(".lpf(300).lpenv(3).lpd(.15)", "")
    .replace('.s("sawtooth").lpf(1800)', '.s("piano").fm(4)'),
  /** WRONG: the jazz-soul version again, 30 BPM slower and straight: the same sounds as the other side. */
  jazzSoulAgain: AC1_VERSIONS.jazzSoul.replace("setcpm(132/4)", "setcpm(102/4)").replaceAll(SWUNG, ""),
  /** WRONG: eight bars of the tune and the changes. */
  short: ac1({
    bpm: 104,
    bars: 8,
    drums: 's("bd ~ ~ bd ~ ~ bd ~, ~ sd ~ sd, hh*16").bank("RolandTR909").gain(.6)',
    bass: 'chord(changes).rootNotes(2).struct("x ~ x x ~ x ~ x").s("fingerbass").lpf(300).lpenv(3).lpd(.15)',
    chords: 'chord(changes).voicing().struct("~ x ~ ~ ~ x ~ ~").s("organ").gain(.4)',
    mel: '.s("sawtooth").lpf(1800).gain(.5)',
  }),
};

/**
 * The brief's tests in content CI (content/capstones.ts AC1): each piece is version one, graded beside Sweet Georgia
 * Brown's melody and beside `AC1_VERSIONS.jazzSoul` as version two (content/validate/owners.ts
 * `BRIEF_OTHER_VERSION`), as the workspace grades a save of one version beside the other.
 */
export const AC1_BRIEF_PIECES = {
  funk: AC1_VERSIONS.funk,
  pop: AC1_VERSIONS.pop,
  indie: AC1_VERSIONS.indie,
  /** funk with the tune an octave lower: the same pitch classes, still the song's. */
  funkLow: AC1_VERSIONS.funk.replace(
    /mel: note\("([^"]+)"\)/,
    (_m, t: string) =>
      `mel: note("${t.replace(/([a-g]#?)(\d)/g, (_x, n: string, o: string) => `${n}${Number(o) - 1}`)}")`,
  ),
  template: AC1_TEMPLATE,
  /** WRONG beside jazzSoul: the same version an octave lower, the same tempo, feel and sounds. */
  sameAsOther: AC1_PIECES.jazzSoulLow,
  noDepth: AC1_PIECES.funkNoDepth,
  crush16: AC1_PIECES.funkCrush16,
  fmPiano: AC1_PIECES.funkFmPiano,
  short: AC1_PIECES.short,
  /** WRONG: the funk version with two notes of bar 2 moved (B and A become G and F). */
  tuneChanged: AC1_VERSIONS.funk.replace("[a4 f#4@2 b4@4 a4] [d5@4", "[a4 f#4@2 g4@4 f4] [d5@4"),
};
