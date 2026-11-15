// AC2 Neo-Soul Ballad (content/specs/A2.md "AC2 Neo-Soul Ballad"; contracts §2.6, §6.6): the starter the first session
// opens with and the pieces the brief's tests grade (content/capstones.ts AC2, content/advanced/capstones/AC2/ac2.test.ts).
//
// Music checked by running it (headless Strudel and the real grader in capstone mode, ac2.test.ts):
// - The starter's changes, hand-voiced, one a bar: Dmaj9 [d3,f#3,a3,c#4,e4] (D F♯ A C♯ E, the 9th on top), Em11
//   [e3,g3,a3,b3,d4] (E G A B D, the 11th inside), F♯m7 [f#3,a3,c#4,e4] (no extension) and Bm9 [b2,f#3,a3,c#4,d4]
//   (B F♯ A C♯ D, the 9th under the 3rd on top). Three bars of four carry a 9th or an 11th (75%), and the top voice
//   runs E4 D4 E4 D4: every change, the loop back included, moves two half steps.
// - The same idea in E♭ for the pop and indie pieces: E♭maj9 [eb3,g3,bb3,d4,f4], Fm11 [f3,ab3,bb3,c4,eb4], Gm7
//   [g3,bb3,d4,f4], Cm9 [c3,g3,bb3,d4,eb4]: top F4 E♭4 F4 E♭4.
// - `.swingBy(.2, 8)` on `hh*16` plays each second 16th at 3/5 of its 8th, a ratio of 3:2 (`swingRatio(.2)` = 1.5,
//   inside the brief's [1.2, 2.4]); `.swingBy(1/3, 8)` is 2:1. `.swingBy(1/3, 4)` on 16ths swings the 8ths and leaves
//   each pair of 16ths even: the right function, and no swung 16th is heard.
// - At 76 BPM a bar lasts 3.16 s: `.late(.006)` moves the snare 19 ms (a feel, inside 8–45 ms); `.late(1/32)` moves
//   it 99 ms, a displacement you hear as a new rhythm (`lateMs`).
// - The tune leans on tensions on its long notes: the 9th E over Dmaj9, the 11th A over Em11, the 9th C♯ over Bm9.

const tempo = (bpm: number) => `setcpm(${bpm}/4)`;

/** Dmaj9 Em11 F♯m7 Bm9, hand-voiced, one a bar; top voice E4 D4 E4 D4. */
export const AC2_VOICINGS = "<[d3,f#3,a3,c#4,e4] [e3,g3,a3,b3,d4] [f#3,a3,c#4,e4] [b2,f#3,a3,c#4,d4]>";
/** E♭maj9 Fm11 Gm7 Cm9, hand-voiced, one a bar; top voice F4 E♭4 F4 E♭4. */
export const AC2_VOICINGS_EB = "<[eb3,g3,bb3,d4,f4] [f3,ab3,bb3,c4,eb4] [g3,bb3,d4,f4] [c3,g3,bb3,d4,eb4]>";

/** The roots under the starter's chords, one a bar. */
export const AC2_BASS = "<d2 e2 f#2 b1>";
export const AC2_BASS_EB = "<eb2 f2 g2 c2>";
/** A choir under the Rhodes's top note: two voices a chord, quiet. */
export const AC2_CHOIR = 'pad: note("<[f#3,a3] [g3,b3] [a3,c#4] [f#3,b3]>").s("choir").gain(.25).room(.4)';

/**
 * AC2.S1 opens with this (and the brief's `code.starter` is the same): the four chords voiced by hand on the Rhodes
 * and a bass. It already meets the chord lines of the checklist, so the first session listens and adjusts; the drums
 * and the tune are session 2's.
 */
export const AC2_TEMPLATE = [
  tempo(76),
  "",
  "// Dmaj9 Em11 F#m7 Bm9, one a bar, each written note by note so you choose its top note.",
  `chords: note("${AC2_VOICINGS}").s("rhodes").gain(.7)`,
  `bass: note("${AC2_BASS}").s("upright")`,
  "// A pad under the Rhodes: the choir is yours from today.",
  "// Session 2: kick, snare and hats that swing in 16ths, and a tune.",
].join("\n");

/** Tunes, one bar per entry: long notes on chord tones and tensions, room for the chords. */
export const AC2_MELODY = {
  /**
   * Over the D changes, a question and its answer: the 9th held over Dmaj9, the 11th over Em11, the 9th over Bm9;
   * then the same opening a third higher, coming down to the root.
   */
  d: "<[e5@3 c#5] [a4@2 b4 d5] [c#5@2 a4 e4] [c#5@3 ~] [e5@2 f#5 e5] [a4@2 b4 d5] [e5@2 c#5 a4] [d5@3 ~]>",
  /** Over the E♭ changes: the 9th F over E♭maj9, the 11th B♭ over Fm11, the 9th D over Cm9. */
  eb: "<[f5@3 d5] [bb4@2 c5 eb5] [d5@2 bb4 f4] [d5@3 ~] [f5@2 g5 f5] [bb4@2 c5 eb5] [f5@2 d5 bb4] [eb5@3 ~]>",
};

export interface Ac2Parts {
  bpm?: number;
  /** The whole `kick:`, `snare:` and `hats:` lines; `null` leaves a line out. */
  kick?: string | null;
  snare?: string | null;
  hats?: string | null;
  chords?: string;
  bass?: string;
  /** The whole `pad:` line; `null` (the default) leaves it out. */
  pad?: string | null;
  /** The whole `mel:` line; `null` leaves the tune out. */
  mel?: string | null;
}

export const AC2_KICK = 'kick: s("bd ~ ~ [~ bd] ~ ~ bd ~")';
export const AC2_SNARE = 'snare: s("~ sd ~ sd").late(.006)';
export const AC2_HATS = 'hats: s("hh*16").swingBy(.2, 8).gain(.4)';

/** A ballad in the brief's shape: tempo, drums, the Rhodes, bass, a pad, the tune. */
export function ac2(p: Ac2Parts = {}): string {
  const line = (x: string | null | undefined, d: string | null) => (x === undefined ? d : x);
  return [
    tempo(p.bpm ?? 76),
    "",
    line(p.kick, AC2_KICK),
    line(p.snare, AC2_SNARE),
    line(p.hats, AC2_HATS),
    p.chords ?? `chords: note("${AC2_VOICINGS}").s("rhodes").gain(.7)`,
    p.bass ?? `bass: note("${AC2_BASS}").s("upright")`,
    line(p.pad, null),
    line(p.mel, `mel: note("${AC2_MELODY.d}").s("vibes").gain(.8)`),
  ]
    .filter((x): x is string => x !== null)
    .join("\n");
}

/** The pieces the brief's tests grade (content/capstones.ts AC2). */
export const AC2_PIECES = {
  template: AC2_TEMPLATE,
  // One passing piece per shipped flavour: a flavour never changes the rubric.
  /** jazz-soul: brushes on the jazz kit, upright, the Rhodes with a quiet choir behind it, vibes on the tune. */
  jazzSoul: ac2({
    kick: 'kick: s("bd ~ ~ [~ bd] ~ ~ bd ~").bank("jazzkit")',
    snare: 'snare: s("~ sd ~ sd").bank("jazzkit").late(.006)',
    hats: 'hats: s("hh*16").bank("jazzkit").swingBy(.2, 8).gain(.35)',
    pad: AC2_CHOIR,
  }),
  /** funk: the 909 hats swung at .2, fingerbass, a clav answering on the off-beats, at 88. */
  funk: ac2({
    bpm: 88,
    kick: 'kick: s("bd ~ ~ bd ~ ~ bd ~").bank("RolandTR909")',
    snare: 'snare: s("~ sd ~ sd").bank("RolandTR909").late(.005)',
    hats: 'hats: s("hh*16").bank("RolandTR909").swingBy(.2, 8).gain(.35)',
    bass: 'bass: note("<[d2 ~ d2 ~] [e2 ~ ~ e2] [f#2 ~ f#2 ~] [b1 ~ ~ b1]>").s("fingerbass")',
    pad: 'keys: note("<[~ f#4 ~ a4] [~ g4 ~ b4] [~ a4 ~ c#5] [~ f#4 ~ d5]>").s("clav").gain(.3)',
  }),
  /** pop: the learner's own changes in E♭, hand-voiced, a lighter swing, piano on the tune. */
  pop: ac2({
    bpm: 72,
    hats: 'hats: s("hh*16").swingBy(.15, 8).gain(.4)',
    chords: `chords: note("${AC2_VOICINGS_EB}").s("rhodes").gain(.7)`,
    bass: `bass: note("${AC2_BASS_EB}").s("fingerbass")`,
    mel: `mel: note("${AC2_MELODY.eb}").s("piano").gain(.8)`,
  }),
  /** indie: the same E♭ changes, a clean guitar on the tune, the choir wide behind, a heavier swing. */
  indie: ac2({
    bpm: 84,
    hats: 'hats: s("hh*16").swingBy(1/3, 8).gain(.35)',
    chords: `chords: note("${AC2_VOICINGS_EB}").s("rhodes").gain(.6)`,
    bass: `bass: note("${AC2_BASS_EB}").s("upright")`,
    pad: 'pad: note("<[g3,bb3] [ab3,c4] [bb3,d4] [g3,bb3]>").s("choir").gain(.25).room(.6)',
    mel: `mel: note("${AC2_MELODY.eb}").s("cleangtr").gain(.8)`,
  }),
  /** Minimal: the S1 starter with swung hats and the tune; no kick, no snare. */
  minimal: [AC2_TEMPLATE, AC2_HATS, `mel: note("${AC2_MELODY.d}").s("piano")`].join("\n"),
  /**
   * Beyond the brief, at 66: the second time round, bar 8 turns to E9sus4 (E F♯ A D, the 9th inside, top D4 held)
   * on its last two beats, a melody that climbs to the 13th, and the choir.
   */
  beyond: ac2({
    bpm: 66,
    chords:
      'chords: note("<[d3,f#3,a3,c#4,e4] [e3,g3,a3,b3,d4] [f#3,a3,c#4,e4] [b2,f#3,a3,c#4,d4] [d3,f#3,a3,c#4,e4] [e3,g3,a3,b3,d4] [f#3,a3,c#4,e4] [[b2,f#3,a3,c#4,d4] [e3,f#3,a3,d4]]>").s("rhodes").gain(.7)',
    bass: 'bass: note("<d2 e2 f#2 b1 d2 e2 f#2 [b1 e2]>").s("upright")',
    pad: AC2_CHOIR,
    mel: 'mel: note("<[e5@3 c#5] [a4@2 b4 d5] [c#5@2 a4 e4] [c#5@3 ~] [e5@3 f#5] [a5@2 g5 f#5] [e5@2 c#5 a4] [d5@2 f#5@2]>").s("vibes").gain(.8)',
  }),

  // Known-wrong pieces, one per required rule (the other rules hold).
  /** The right chords by name, voiced by the dictionary: the top note is the dictionary's, not chosen. */
  dictionary: ac2({ chords: 'chords: chord("<D^9 Em11 F#m7 Bm9>").voicing().s("rhodes").gain(.7)' }),
  /** Hand voicings whose top leaps on three of four changes: E4, A4, C♯5, then D4. */
  leaping: ac2({
    chords:
      'chords: note("<[d3,f#3,a3,c#4,e4] [e3,g3,b3,d4,a4] [f#3,a3,e4,c#5] [b2,f#3,a3,c#4,d4]>").s("rhodes").gain(.7)',
  }),
  /** Triads only, smoothly voiced: no 9th or 11th anywhere. */
  triads: ac2({
    chords: 'chords: note("<[d3,f#3,a3] [e3,g3,b3] [f#3,a3,c#4] [d3,f#3,b3]>").s("rhodes").gain(.7)',
  }),
  /** Straight 16ths on the hats. */
  straight: ac2({ hats: 'hats: s("hh*16").gain(.4)' }),
  /** The right function on the wrong grid: `.swingBy(1/3, 4)` swings 8ths, so each pair of 16ths stays even. */
  swingEighths: ac2({ hats: 'hats: s("hh*16").swingBy(1/3, 4).gain(.4)' }),
  /** Swung hats nobody hears: the hats at gain 0. */
  silentHats: ac2({ hats: 'hats: s("hh*16").swingBy(.2, 8).gain(0)' }),
  /** The chords on the piano; the Rhodes only doubles the tune. */
  piano: ac2({
    chords: `chords: note("${AC2_VOICINGS}").s("piano").gain(.7)`,
    pad: `keys: note("${AC2_MELODY.d}").s("rhodes").gain(.5)`,
  }),
  /** The Rhodes chords at gain .02, more than 24 dB under the tune: written, not heard. */
  quietRhodes: ac2({ chords: `chords: note("${AC2_VOICINGS}").s("rhodes").gain(.02)` }),
  /** The snare a 32nd of a bar late: 99 ms at 76 BPM, a displacement. The required lines hold; the feel line fails. */
  displaced: ac2({ snare: 'snare: s("~ sd ~ sd").late(1/32)' }),
  /** Four bars: the starter's loop with drums and no tune, so the piece repeats every four bars. */
  fourBars: ac2({ mel: null }),
  /** A ballad at 104 BPM. */
  fast: ac2({ bpm: 104 }),
  /** The tune written but buried: the vibes at gain .03, more than 24 dB under the band (W7 gate). */
  buriedTune: ac2({ mel: `mel: note("${AC2_MELODY.d}").s("vibes").gain(.03)` }),
} as const;
