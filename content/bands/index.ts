// Band layers (contracts §5.10): read-only backings that make a Make sound like a song. Code uses the
// labelled tracks drums: bass: chords: only, follows the key through `{{key}}` (a "C4:major" style scale
// argument) and shares the session tempo, so it carries no tempo line. Bass and chords are written as
// degrees below the tonic (`n(-14)` is two octaves down) so one code fits every key. Band code is a
// preview context: it may use locked tools, and must pass the strict lint (content/validate/bands.test.ts).
//
// Two things change with the course, per flavour (content/flavours.ts FLAVOUR_RULES, contracts §5.10):
// jazz-soul plays triads and straight eighths in U01–U02 and four-note chords with swung eighths from U03
// on; funk adds four-note chords from U06. BandDef holds one code per flavour (the earliest stage), so the
// later stages live in BAND_STAGES and `bandCodeAt` picks the one a session has reached. Every player of a
// Band (lesson, checkpoint, Studio, capstone) should ask `bandCodeAt` rather than read `code[flavour]`.
import {
  type BandDef,
  type BandId,
  defineBand,
  type FlavourId,
  type LessonId,
  type MeterId,
} from "@oak/content-kit";
import { flavourById } from "../flavours.ts";

const TWO_TRIADS = '"<[-7,-5,-3] [-4,-2,0]>"';
const TWO_SEVENTHS = '"<[-7,-5,-3,-1] [-4,-2,0,2]>"';
const AXIS_TRIADS = '"<[-7,-5,-3] [-3,-1,1] [-2,0,2] [-4,-2,0]>"';
// The four-note chords of jazz-soul (U03 on) and funk (U06 on) over I and IV are sixth chords: C6 is
// C E G A, F6 is F A C D (voiced D F A C over the F in the bass). A major seventh would put B under a
// melody resting on 1 and E under one resting on 4: a half step below the tune's note, the harshest clash
// there is, on exactly the notes U03 teaches the learner to land on. The 6th is the jazz player's tonic
// colour for that reason. V keeps its seventh (G7: B D F G), the chord that leans home.
const [I6, IV6] = ["[-7,-5,-3,-2]", "[-6,-4,-2,0]"];
const TWO_SIXTHS = `"<${I6} ${IV6}>"`;
// The four-chord loop with four notes, voiced close and low so that even in B, where the tonic sits highest,
// the top voice stays under the tune's register: C6 (C E G A), G7 (B D F G), Am7 (A C E G), F6 (D F A C over
// the F in the bass, voiced C D F A here). I and IV take the 6th for the reason above: Cmaj7 and Fmaj7 put B
// under a tune on 1 and E under a tune on 4, and the U07 hooks land on exactly those notes. Every change,
// the turn from F6 back to C6 included, moves each voice by three half steps at most.
/** F6 voiced low and close, C D F A: it shares C and A with C6 and three notes with G7. */
const IV6_LOW = "[-7,-6,-4,-2]";
const AXIS_FOURS = `"<${I6} [-8,-6,-4,-3] [-9,-7,-5,-3] ${IV6_LOW}>"`;
/** The major-seventh loop the Band does not use under a tune (see above): Cmaj7 G7 Am7 Fmaj7. */
const AXIS_MAJOR_SEVENTHS = '"<[-7,-5,-3,-1] [-8,-6,-4,-3] [-9,-7,-5,-3] [-4,-2,0,2]>"';
// An eight-bar phrase that closes: I IV I V (an open half) | I IV V I (home). Voiced close to I so every
// chord change moves each note by a step at most: IV is C F A (C stays), V is B D G (G stays, B leans up
// to C). With four notes: C6 C E G A, F6 D F A C, G7 B D F G.
const [I3, IV3, V3] = ["[-7,-5,-3]", "[-7,-4,-2]", "[-8,-6,-3]"];
const V7 = "[-8,-6,-4,-3]";
const PHRASE_TRIADS = `"<${I3} ${IV3} ${I3} ${V3} ${I3} ${IV3} ${V3} ${I3}>"`;
const PHRASE_FOURS = `"<${I6} ${IV6} ${I6} ${V7} ${I6} ${IV6} ${V7} ${I6}>"`;
const PHRASE_ROOTS = '"<-14 -11 -14 -10 -14 -11 -10 -14>"';
// Doo-wop, I vi IV V, and three-chord rock, I IV V IV (U06.L07, C2), voiced close to I so each change moves a
// voice by a step at most: vi is C E A (E and C stay), IV is C F A, V is B D G. With four notes, vi is Am7
// voiced from its root (A C E G; voiced from C it would be C6 note for note) and the rest as above.
const [VI3, VI7] = ["[-7,-5,-2]", "[-9,-7,-5,-3]"];
const DOOWOP_TRIADS = `"<${I3} ${VI3} ${IV3} ${V3}>"`;
const DOOWOP_FOURS = `"<${I6} ${VI7} ${IV6_LOW} ${V7}>"`;
const ROCK_TRIADS = `"<${I3} ${IV3} ${V3} ${IV3}>"`;
const ROCK_FOURS = `"<${I6} ${IV6_LOW} ${V7} ${IV6_LOW}>"`;

// Production defaults (contracts §5.10): room, the bass low-pass and the chords' pan come from the kit
// (content/flavours.ts), so a Band and its flavour never disagree; the bass stays centred. Velocities move
// within ±0.08 of 0.92 so a repeated hit never sounds pasted. The accent patterns are fixed, not random,
// so every play of a Band is the same record. Each one is spread over the slots of the pattern to its left
// (STYLE §11 rule 7): sixteen values for sixteenths, eight for eighths, four for quarters, three for a waltz.
/** Sixteenth-note accents for the funk hats: the beat, then three lighter. */
const HUMAN_16THS = '"[1 .86 .94 .86]*4"';
/** Eighth-note accents: strong on the beat, lighter between, a little lift on beats 2 and 4. */
const HUMAN_8THS = '"[1 .86 .94 .86]*2"';
/** Quarter-note piano that leans on beat 1. */
const PUMP_4 = '"1 .86 .92 .86"';
/** A chord on 1 and a lighter push on an offbeat, as a soul keyboard player comps. */
const PUSH = '"1 .86"';
/** One, two, three: the downbeat carries the waltz. */
const WALTZ_3 = '"1 .86 .9"';
/** Triplets (doo-wop's 12/8): each beat's first of three leans, the other two lighter. */
const TRIPLETS = '"[1 .86 .9]*4"';
/** Swung eighths (contracts §5.10: amount 1/3): the second eighth of each beat lands on the last triplet. */
const SWING_4 = ".swingBy(1/3, 4)";
const SWING_3 = ".swingBy(1/3, 3)";

type Flavour = "flavour.pop" | "flavour.jazz-soul" | "flavour.indie" | "flavour.funk";
interface Kit {
  bank: string;
  bass: string;
  chords: string;
  drumsGain: number;
  bassGain: number;
  chordsGain: number;
}
const KITS: Record<Flavour, Kit> = {
  "flavour.pop": { bank: "", bass: "ebass", chords: "piano", drumsGain: 0.7, bassGain: 0.9, chordsGain: 0.4 },
  "flavour.jazz-soul": {
    bank: "jazzkit",
    bass: "upright",
    chords: "rhodes",
    drumsGain: 0.65,
    bassGain: 0.9,
    chordsGain: 0.45,
  },
  "flavour.indie": {
    bank: "LinnDrum",
    bass: "ebass",
    chords: "cleangtr",
    drumsGain: 0.7,
    bassGain: 0.9,
    chordsGain: 0.4,
  },
  "flavour.funk": {
    bank: "RolandTR808",
    bass: "fingerbass",
    chords: "clav",
    drumsGain: 0.7,
    bassGain: 0.9,
    chordsGain: 0.4,
  },
};
/** A number as Strudel code is written in this repo: `.4`, not `0.4`. */
const num = (x: number): string => String(x).replace(/^0\./, ".");
const production = (f: Flavour) => {
  const kit = flavourById.get(f);
  if (!kit) throw new Error(`no flavour kit ${f}`);
  return kit.production;
};

interface Parts {
  /** Drum mini-notation and its accents. */
  drums: string;
  drumsVelocity: string;
  /** Bass and chord degree patterns (quoted), below the tonic. */
  bass: string;
  chords: string;
  struct: string;
  chordsVelocity: string;
  /** `.swingBy(…)` for drums and chords, or "". */
  swing?: string;
}
/** One flavour's code: three labelled tracks with the kit's sounds and production numbers. */
function layers(f: Flavour, p: Parts): string {
  const k = KITS[f];
  const prod = production(f);
  const swing = p.swing ?? "";
  const bank = k.bank ? `.bank("${k.bank}")` : "";
  return [
    `drums: s("${p.drums}")${bank}${swing}.velocity(${p.drumsVelocity}).gain(${num(k.drumsGain)})`,
    `bass: n(${p.bass}).scale("{{key}}").s("${k.bass}").lpf(${prod.bassLpf}).gain(${num(k.bassGain)})`,
    `chords: n(${p.chords}).scale("{{key}}").struct("${p.struct}")${swing}.s("${k.chords}").velocity(${p.chordsVelocity}).gain(${num(k.chordsGain)}).pan(${num(prod.pan.chords ?? 0.42)}).room(${num(prod.room)})`,
  ].join("\n");
}

// The grooves each kit plays, in four and in three.
const POP_4 = { drums: "bd sd [~ bd] sd, hh*8", drumsVelocity: HUMAN_8THS };
const JAZZ_4 = { drums: "bd ~ sd [~ bd], rd*8", drumsVelocity: HUMAN_8THS };
const INDIE_4 = { drums: "bd ~ sd ~, hh*8", drumsVelocity: HUMAN_8THS };
const FUNK_4 = { drums: "bd ~ sd ~, hh*16", drumsVelocity: HUMAN_16THS };
const PIANO_4 = { struct: "x x x x", chordsVelocity: PUMP_4 };
const COMP = { struct: "x ~ ~ [~ x]", chordsVelocity: PUSH };
/**
 * Swung, the push moves to the "and" of 3: a push on the "and" of 4, delayed to the last triplet, would
 * ring over the bar line into the next chord.
 */
const COMP_SWUNG = { struct: "x ~ [~ x] ~", chordsVelocity: PUSH };
const STAB = { struct: "~ x ~ [~ x]", chordsVelocity: PUSH };

/** The two-chord vamp (I–IV, a bar each) in every kit, with the given chords for jazz-soul and funk. */
const vamp = (f: Flavour, chords: { jazz: string; funk: string }, swing = ""): string => {
  switch (f) {
    case "flavour.pop":
      return layers(f, { ...POP_4, ...PIANO_4, bass: '"<-14 -11>"', chords: TWO_TRIADS });
    case "flavour.jazz-soul":
      return layers(f, {
        ...JAZZ_4,
        ...(swing ? COMP_SWUNG : COMP),
        bass: '"<[-14 -10] [-11 -7]>"',
        chords: chords.jazz,
        swing,
      });
    case "flavour.indie":
      return layers(f, { ...INDIE_4, ...PIANO_4, bass: '"<-14 -11>"', chords: TWO_TRIADS });
    case "flavour.funk":
      return layers(f, {
        ...FUNK_4,
        ...STAB,
        bass: '"<[-14 ~ -14 -7] [-11 ~ -11 -4]>"',
        chords: chords.funk,
      });
  }
};
/** The waltz vamp: bass on 1, chords on 2 and 3 (funk pushes the last one onto the "and" of 3). */
const waltz = (f: Flavour, chords: { jazz: string; funk: string }, swing = ""): string => {
  switch (f) {
    case "flavour.pop":
      return layers(f, {
        drums: "bd hh hh",
        drumsVelocity: WALTZ_3,
        bass: '"<-14 -11>"',
        chords: TWO_TRIADS,
        struct: "~ x x",
        chordsVelocity: WALTZ_3,
      });
    case "flavour.jazz-soul":
      return layers(f, {
        drums: "bd [rd rd] rd",
        drumsVelocity: WALTZ_3,
        bass: '"<[-14 ~ -10] [-11 ~ -7]>"',
        chords: chords.jazz,
        struct: "~ x x",
        chordsVelocity: WALTZ_3,
        swing,
      });
    case "flavour.indie":
      return layers(f, {
        drums: "bd hh hh",
        drumsVelocity: WALTZ_3,
        bass: '"<-14 -11>"',
        chords: TWO_TRIADS,
        struct: "~ x x",
        chordsVelocity: WALTZ_3,
      });
    case "flavour.funk":
      return layers(f, {
        drums: "bd [~ hh] [sd hh]",
        drumsVelocity: WALTZ_3,
        bass: '"<[-14 ~ -7] [-11 ~ -4]>"',
        chords: chords.funk,
        struct: "~ x [~ x]",
        chordsVelocity: WALTZ_3,
      });
  }
};
/** The eight-bar phrase (only from U03.L11, so jazz-soul is already in four-note chords and swing). */
const phrase = (f: Flavour, funkChords: string): string => {
  switch (f) {
    case "flavour.pop":
      return layers(f, { ...POP_4, ...PIANO_4, bass: PHRASE_ROOTS, chords: PHRASE_TRIADS });
    case "flavour.jazz-soul":
      return layers(f, {
        ...JAZZ_4,
        ...COMP_SWUNG,
        bass: PHRASE_ROOTS,
        chords: PHRASE_FOURS,
        swing: SWING_4,
      });
    case "flavour.indie":
      return layers(f, { ...INDIE_4, ...PIANO_4, bass: PHRASE_ROOTS, chords: PHRASE_TRIADS });
    case "flavour.funk":
      return layers(f, { ...FUNK_4, ...STAB, bass: PHRASE_ROOTS, chords: funkChords });
  }
};
/**
 * The four-chord loop (schema lessons, U06 on; its drums and bass from U05). `fours` are the jazz-soul and funk
 * chords and `swing` the jazz-soul feel of the stage being written (FLAVOUR_RULES).
 */
const axis = (f: Flavour, fours: { jazz: string; funk: string } = AXIS_EARLY, swing = SWING_4): string => {
  switch (f) {
    case "flavour.pop":
      return layers(f, { ...POP_4, ...PIANO_4, bass: '"<-14 -10 -9 -11>"', chords: AXIS_TRIADS });
    case "flavour.jazz-soul":
      return layers(f, {
        drums: "bd ~ sd ~, rd*8",
        drumsVelocity: HUMAN_8THS,
        bass: '"<-14 -10 -9 -11>"',
        chords: fours.jazz,
        struct: "~ x ~ x",
        chordsVelocity: '"1 .86"',
        swing,
      });
    case "flavour.indie":
      return layers(f, { ...INDIE_4, ...PIANO_4, bass: '"<-14 -10 -9 -11>"', chords: AXIS_TRIADS });
    case "flavour.funk":
      return layers(f, {
        ...FUNK_4,
        ...STAB,
        // Octave pop on I, then root and fifth: an octave pop on vi would climb past E4 in B.
        bass: '"<[-14 ~ -14 -7] [-10 ~ -10 -6] [-9 ~ -9 -5] [-11 ~ -11 -7]>"',
        chords: fours.funk,
      });
  }
};
// The first stage keeps the loop as Wave 2 wrote it (content/validate/bands.test.ts pins it): jazz-soul swung
// with major sevenths, which no lesson plays (the loop arrives in U05, after the U03 stage below); funk in
// triads until U06.
const AXIS_EARLY = { jazz: AXIS_MAJOR_SEVENTHS, funk: AXIS_TRIADS };

/** Doo-wop, I vi IV V: a fifties ballad's 12/8, the piano striking every triplet, the bass on 1 and 3. */
const DOOWOP_DRUMS = { drums: "bd ~ sd ~, [hh hh hh]*4", drumsVelocity: TRIPLETS };
const DOOWOP_COMP = { struct: "[x x x]*4", chordsVelocity: TRIPLETS };
const DOOWOP_BASS = '"<[-14 -14] [-9 -9] [-11 -11] [-10 -10]>"';
const doowop = (f: Flavour, fours: { jazz: string; funk: string } = DOOWOP_EARLY): string => {
  switch (f) {
    case "flavour.pop":
      return layers(f, { ...DOOWOP_DRUMS, ...DOOWOP_COMP, bass: DOOWOP_BASS, chords: DOOWOP_TRIADS });
    case "flavour.jazz-soul":
      // Already in threes: the triplets are the lilt, so no swing is added on top.
      return layers(f, {
        drums: "bd ~ sd ~, [rd rd rd]*4",
        drumsVelocity: TRIPLETS,
        ...DOOWOP_COMP,
        bass: DOOWOP_BASS,
        chords: fours.jazz,
      });
    case "flavour.indie":
      return layers(f, { ...DOOWOP_DRUMS, ...DOOWOP_COMP, bass: DOOWOP_BASS, chords: DOOWOP_TRIADS });
    case "flavour.funk":
      return layers(f, {
        ...DOOWOP_DRUMS,
        struct: "[~ x x]*4",
        chordsVelocity: TRIPLETS,
        bass: '"<[-14 ~ -14 -7] [-9 ~ -9 -5] [-11 ~ -11 -7] [-10 ~ -10 -6]>"',
        chords: fours.funk,
      });
  }
};
const DOOWOP_EARLY = { jazz: DOOWOP_TRIADS, funk: DOOWOP_TRIADS };

/** Three-chord rock, I IV V IV: straight eighths, the bass pumping the root. */
const ROCK_BASS = '"<[-14*8] [-11*8] [-10*8] [-11*8]>"';
const rock = (f: Flavour, fours: { jazz: string; funk: string } = ROCK_EARLY, swing = ""): string => {
  switch (f) {
    case "flavour.pop":
      return layers(f, { ...POP_4, ...PIANO_4, bass: ROCK_BASS, chords: ROCK_TRIADS });
    case "flavour.jazz-soul":
      return layers(f, {
        ...JAZZ_4,
        ...(swing ? COMP_SWUNG : COMP),
        // Root, then the 5th; under V the 5th is taken below, so the bass never climbs into G7's B.
        bass: '"<[-14 -10] [-11 -7] [-10 -13] [-11 -7]>"',
        chords: fours.jazz,
        swing,
      });
    case "flavour.indie":
      // The guitar strums eighths with the hats; the bass holds the roots under it.
      return layers(f, {
        ...INDIE_4,
        struct: "x*8",
        chordsVelocity: HUMAN_8THS,
        bass: ROCK_BASS,
        chords: ROCK_TRIADS,
      });
    case "flavour.funk":
      return layers(f, {
        ...FUNK_4,
        ...STAB,
        // Octave pop on I, then root and fifth: an octave pop on V would climb past E4 in B.
        bass: '"<[-14 ~ -14 -7] [-11 ~ -11 -7] [-10 ~ -10 -6] [-11 ~ -11 -7]>"',
        chords: fours.funk,
      });
  }
};
const ROCK_EARLY = { jazz: ROCK_TRIADS, funk: ROCK_TRIADS };

// ---- Wave 5 (U08–U11, C3–C5) ---------------------------------------------------------------------------------
//
// Two new ways of writing a Band, both for the units that leave major:
//
// 1. Semitones above the tonic. A minor loop or a 12-bar blues must sound the same in every key and every mode
//    a step names (A minor, A harmonic minor, C blues, C minor pentatonic): a degree like `n(5)` means a
//    different note in each, and the dominant seventh of a blues has a ♭7 no major scale owns. So these Bands
//    write each part as half steps from the tonic, `note("<-24 -28>")`, and add the tonic the key names,
//    `.add(n("0").scale("{{key}}"))`. Only the tonic of `{{key}}` counts; the Band still follows the learner's
//    key (its `.scale()` is rewritten like any other) and the register fold (packages/strudel bandOctave).
//    Offsets are written for a tonic of C4 = 0, as every Band is "written in C": the bass's lowest root is
//    two octaves down (−24), the chords sit in the octave below the tonic.
// 2. Sections. A Band written as section consts with one `arrange()` per labelled track (STYLE §10) follows
//    the learner's form: packages/strudel band-form.ts rewrites its `arrange()` to the learner's sections, each
//    played by the Band's section of the same type (contracts §6.3). Its own form, when the learner has none,
//    is verse chorus verse chorus.
//
// Every Wave 5 Band arrives after U03 and U06, so jazz-soul and funk play their four-note chords from the
// first stage and need no `BAND_STAGES`; jazz-soul swings. A Band under a bass line the learner writes plays
// without its bass (`tracks`), and its chords stay out of the bass's octave (content/bands/index.test.ts).

/** The tonic a semitone Band adds to every note: only the tonic of `{{key}}` counts, never its mode. */
const TONIC = 'n("0").scale("{{key}}")';

interface SemiParts {
  drums: string;
  drumsVelocity: string;
  /** Half steps from the tonic (C4 = 0), quoted mini-notation. */
  bass: string;
  chords: string;
  struct: string;
  chordsVelocity: string;
  /** `.swingBy(…)` for drums and chords, or "". */
  swing?: string;
  /** `.swingBy(…)` for the bass: a shuffle's bass swings its eighths. */
  bassSwing?: string;
}
/** One flavour's code with its parts in half steps from the tonic (see the comment above). */
function semiLayers(f: Flavour, p: SemiParts): string {
  const k = KITS[f];
  const prod = production(f);
  const swing = p.swing ?? "";
  const bank = k.bank ? `.bank("${k.bank}")` : "";
  return [
    `drums: s("${p.drums}")${bank}${swing}.velocity(${p.drumsVelocity}).gain(${num(k.drumsGain)})`,
    `bass: note(${p.bass}).add(${TONIC})${p.bassSwing ?? ""}.s("${k.bass}").lpf(${prod.bassLpf}).gain(${num(k.bassGain)})`,
    `chords: note(${p.chords}).add(${TONIC}).struct("${p.struct}")${swing}.s("${k.chords}").velocity(${p.chordsVelocity}).gain(${num(k.chordsGain)}).pan(${num(prod.pan.chords ?? 0.42)}).room(${num(prod.room)})`,
  ].join("\n");
}

// The Aeolian loop, i–VI–III–VII (Am F C G in A minor; written in C minor: Cm A♭ E♭ B♭), U10 on, C4.
// Roots: i two octaves down, VI a major 3rd under it, III a minor 3rd over it, VII a whole step under it, so
// the bass steps down to VI and back up through III to VII, never leaping past a 4th. The chords are voiced
// close round the tonic an octave down, each change moving a voice by two half steps at most:
// Cm C E♭ G, A♭ C E♭ A♭ (C and E♭ stay), E♭ B♭ E♭ G, B♭ B♭ D F.
const AEOLIAN_ROOTS = ["-24", "-28", "-21", "-26"] as const;
const AEOLIAN_TRIADS = '"<[-12,-9,-5] [-12,-9,-4] [-14,-9,-5] [-14,-10,-7]>"';
// With four notes (jazz-soul, funk): Cm7 B♭ C E♭ G, A♭6 C E♭ F A♭, E♭add9 B♭ E♭ F G, and B♭ with its root on
// top (B♭ D F B♭). No major 7th anywhere: an E♭maj7 or A♭maj7 would put D or G a half step under a tune on
// ♭3 or ♭6, the two notes minor is made of (me and le).
const AEOLIAN_FOURS = '"<[-14,-12,-9,-5] [-12,-9,-7,-4] [-14,-9,-7,-5] [-14,-10,-7,-2]>"';
const aeolianBass = (cell: (root: number) => string) =>
  `"<${AEOLIAN_ROOTS.map((r) => cell(Number(r))).join(" ")}>"`;
/** A minor ballad's band: a slow piano in pop, Rhodes and a swung ride in jazz-soul, an eighth-note pulse in indie. */
const aeolian = (f: Flavour): string => {
  switch (f) {
    case "flavour.pop":
      return semiLayers(f, {
        ...POP_4,
        ...PIANO_4,
        bass: aeolianBass((r) => `${r}`),
        chords: AEOLIAN_TRIADS,
      });
    case "flavour.jazz-soul":
      // Root, then the 5th above it; under III the 5th is taken below, so the bass stays under the chords.
      return semiLayers(f, {
        drums: "bd ~ sd ~, rd*8",
        drumsVelocity: HUMAN_8THS,
        bass: '"<[-24 -17] [-28 -21] [-21 -26] [-26 -19]>"',
        chords: AEOLIAN_FOURS,
        struct: "~ x ~ x",
        chordsVelocity: '"1 .86"',
        swing: SWING_4,
      });
    case "flavour.indie":
      // The driving eighth-note bass of an indie ballad (U10.L05) under a strummed guitar.
      return semiLayers(f, {
        ...INDIE_4,
        struct: "x*8",
        chordsVelocity: HUMAN_8THS,
        bass: aeolianBass((r) => `[${r}*8]`),
        chords: AEOLIAN_TRIADS,
      });
    case "flavour.funk":
      // Root, root, then the octave pop and the 5th under it.
      return semiLayers(f, {
        ...FUNK_4,
        ...STAB,
        bass: aeolianBass((r) => `[${r} ~ ${r} ${r + 12}]`),
        chords: AEOLIAN_FOURS,
      });
  }
};

// The twelve-bar blues (U11.L05 on, C5): I7 IV7 V7 in C are C7 F7 G7. Written in half steps, so it is the same
// blues in C blues, C major or C minor pentatonic. Every flavour plays dominant sevenths: the blues is made of
// them (contracts §6.6 C5), whatever the kit's chord depth elsewhere. Voiced close and voice-led round C4:
// C7 E G B♭ C, F7 E♭ F A C (E to E♭, G to F, B♭ to A), G7 F G B D (E to F, B♭ to B, C to D).
const DOM7: Readonly<Record<"I" | "IV" | "V", string>> = {
  I: "[-8,-5,-2,0]",
  IV: "[-9,-7,-3,0]",
  V: "[-7,-5,-1,2]",
};
/** Roots two octaves down: C2, F2, G2. */
const BLUES_ROOT: Readonly<Record<"I" | "IV" | "V", number>> = { I: -24, IV: -19, V: -17 };
type Step = "I" | "IV" | "V";
/** The standard twelve bars, and the quick change (IV in bar 2). Bar 12 is V: the turnaround to the top. */
const STANDARD: readonly Step[] = ["I", "I", "I", "I", "IV", "IV", "I", "I", "V", "IV", "I", "V"];
const QUICK: readonly Step[] = ["I", "IV", "I", "I", "IV", "IV", "I", "I", "V", "IV", "I", "V"];
/**
 * The bass of each bar from its root `r`: the boogie-woogie line up and back (root, 3rd, 5th, 6th, ♭7, 6th, 5th,
 * 3rd) in swung eighths, or a walk in quarters that climbs from the root when the chord changes (root, 3rd, 5th,
 * 6th) and comes back down from the ♭7 when it stays (♭7, 6th, 5th, 3rd), so every change lands on its root.
 */
type BassCell = (r: number, changed: boolean) => string;
const BOOGIE: BassCell = (r) => `[${[0, 4, 7, 9, 10, 9, 7, 4].map((x) => r + x).join(" ")}]`;
const WALK: BassCell = (r, changed) =>
  `[${(changed ? [0, 4, 7, 9] : [10, 9, 7, 4]).map((x) => r + x).join(" ")}]`;
/** Root, root, 5th, 5th, 6th, 6th, 5th, 5th: the rock-and-roll shuffle bass. */
const ROCK_SHUFFLE: BassCell = (r) => `[${[0, 0, 7, 7, 9, 9, 7, 7].map((x) => r + x).join(" ")}]`;
const FUNK_SHUFFLE: BassCell = (r) => `[${r} ~ ${r + 7} ${r + 10} ~ ${r + 9} ${r + 7} ~]`;
const bluesBass = (plan: readonly Step[], cell: BassCell) =>
  `"<${plan.map((s, i) => cell(BLUES_ROOT[s], i === 0 || plan[i - 1] !== s)).join(" ")}>"`;
const bluesChords = (plan: readonly Step[]) => `"<${plan.map((s) => DOM7[s]).join(" ")}>"`;
/**
 * A shuffle in every kit. The drums keep to quarter notes, kick and snare only: the hats, or the ride, are the
 * learner's (U11.L07 and C5 swing them), so the Band's drums sit under straight or swung hats alike and never
 * flam against them. The swing is in the bass's eighths and the chords' push.
 */
const blues = (f: Flavour, plan: readonly Step[]): string => {
  const chords = bluesChords(plan);
  switch (f) {
    case "flavour.pop":
      return semiLayers(f, {
        drums: "bd ~ sd ~",
        drumsVelocity: PUMP_4,
        bass: bluesBass(plan, BOOGIE),
        bassSwing: SWING_4,
        chords,
        struct: "~ x ~ x",
        chordsVelocity: PUSH,
      });
    case "flavour.jazz-soul":
      return semiLayers(f, {
        drums: "bd ~ sd ~",
        drumsVelocity: PUMP_4,
        bass: bluesBass(plan, WALK),
        chords,
        ...COMP_SWUNG,
        swing: SWING_4,
      });
    case "flavour.indie":
      return semiLayers(f, {
        drums: "bd bd sd ~",
        drumsVelocity: PUMP_4,
        bass: bluesBass(plan, ROCK_SHUFFLE),
        bassSwing: SWING_4,
        chords,
        struct: "~ x ~ x",
        chordsVelocity: PUSH,
      });
    case "flavour.funk":
      return semiLayers(f, {
        drums: "bd ~ sd bd",
        drumsVelocity: PUMP_4,
        bass: bluesBass(plan, FUNK_SHUFFLE),
        bassSwing: SWING_4,
        chords,
        ...COMP_SWUNG,
        swing: SWING_4,
      });
  }
};

// A song in sections (U09 on, C3): verse I vi IV V (the doo-wop order, C Am F G), chorus IV V I I (F G C C),
// the harmony U09.L02 teaches. Written in degrees like the major loops, with the same close voicings. The
// chorus lifts on three counts at once: the snare moves from beat 3 to 2 and 4, the hats double, the bass
// drives eighths and the chords strike twice as often. A learner's intro or bridge is played by the verse
// (band-form.ts finds no section of that type and falls back to its kin).
const SECTION_FORM = (role: string) =>
  `arrange([4, ${role}Verse], [4, ${role}Chorus], [4, ${role}Verse], [4, ${role}Chorus])`;
const VERSE_TRIADS = DOOWOP_TRIADS;
const CHORUS_TRIADS = `"<${IV3} ${V3} ${I3} ${I3}>"`;
const VERSE_FOURS = DOOWOP_FOURS;
const CHORUS_FOURS = `"<${IV6_LOW} ${V7} ${I6} ${I6}>"`;
interface SectionParts {
  drums: [string, string];
  drumsVelocity: string;
  bass: [string, string];
  chords: [string, string];
  struct: [string, string];
  chordsVelocity: string;
  swing?: string;
}
function sectionLayers(f: Flavour, p: SectionParts): string {
  const k = KITS[f];
  const prod = production(f);
  const swing = p.swing ?? "";
  const bank = k.bank ? `.bank("${k.bank}")` : "";
  return [
    `const drumsVerse = s("${p.drums[0]}")`,
    `const drumsChorus = s("${p.drums[1]}")`,
    `const bassVerse = n(${p.bass[0]})`,
    `const bassChorus = n(${p.bass[1]})`,
    `const chordsVerse = n(${p.chords[0]}).struct("${p.struct[0]}")`,
    `const chordsChorus = n(${p.chords[1]}).struct("${p.struct[1]}")`,
    "",
    `drums: ${SECTION_FORM("drums")}${bank}${swing}.velocity(${p.drumsVelocity}).gain(${num(k.drumsGain)})`,
    `bass: ${SECTION_FORM("bass")}.scale("{{key}}").s("${k.bass}").lpf(${prod.bassLpf}).gain(${num(k.bassGain)})`,
    `chords: ${SECTION_FORM("chords")}.scale("{{key}}")${swing}.s("${k.chords}").velocity(${p.chordsVelocity}).gain(${num(k.chordsGain)}).pan(${num(prod.pan.chords ?? 0.42)}).room(${num(prod.room)})`,
  ].join("\n");
}
const VERSE_ROOTS = '"<-14 -9 -11 -10>"';
const CHORUS_EIGHTHS = '"<[-11*8] [-10*8] [-14*8] [-14*8]>"';
const sections = (f: Flavour): string => {
  switch (f) {
    case "flavour.pop":
      return sectionLayers(f, {
        drums: ["bd ~ sd ~, hh*8", "bd sd [~ bd] sd, hh*16"],
        drumsVelocity: HUMAN_16THS,
        bass: [VERSE_ROOTS, CHORUS_EIGHTHS],
        chords: [VERSE_TRIADS, CHORUS_TRIADS],
        struct: ["x x x x", "x*8"],
        chordsVelocity: PUMP_4,
      });
    case "flavour.jazz-soul":
      return sectionLayers(f, {
        drums: ["bd ~ sd ~, rd*4", "bd ~ sd [~ bd], rd*8"],
        drumsVelocity: HUMAN_8THS,
        // Root and 5th in the verse (under V the 5th below), walking roots and 5ths in the chorus.
        bass: [
          '"<[-14 -10] [-9 -12] [-11 -7] [-10 -13]>"',
          '"<[-11 -7 -11 -7] [-10 -13 -10 -13] [-14 -10 -14 -10] [-14 -10 -14 -10]>"',
        ],
        chords: [VERSE_FOURS, CHORUS_FOURS],
        struct: ["~ x ~ x", "x ~ [~ x] ~"],
        chordsVelocity: PUSH,
        swing: SWING_4,
      });
    case "flavour.indie":
      return sectionLayers(f, {
        drums: ["bd ~ sd ~, hh*8", "bd [~ bd] sd [~ bd], hh*16"],
        drumsVelocity: HUMAN_16THS,
        bass: [VERSE_ROOTS, CHORUS_EIGHTHS],
        chords: [VERSE_TRIADS, CHORUS_TRIADS],
        struct: ["x x x x", "x*8"],
        chordsVelocity: HUMAN_8THS,
      });
    case "flavour.funk":
      return sectionLayers(f, {
        drums: ["bd ~ sd ~, hh*16", "bd [~ bd] sd [~ bd], hh*16"],
        drumsVelocity: HUMAN_16THS,
        bass: [
          '"<[-14 ~ -14 -7] [-9 ~ -9 -5] [-11 ~ -11 -7] [-10 ~ -10 -6]>"',
          '"<[-11 -11 -7 -11] [-10 -10 -6 -10] [-14 -14 -7 -14] [-14 -14 -7 -14]>"',
        ],
        chords: [VERSE_FOURS, CHORUS_FOURS],
        struct: ["~ x ~ [~ x]", "[~ x]*4"],
        chordsVelocity: PUSH,
      });
  }
};

const FLAVOURS: readonly Flavour[] = ["flavour.pop", "flavour.jazz-soul", "flavour.indie", "flavour.funk"];
const each = (code: (f: Flavour) => string): Record<FlavourId, string> =>
  Object.fromEntries(FLAVOURS.map((f) => [f, code(f)])) as Record<FlavourId, string>;
const EARLY = { jazz: TWO_TRIADS, funk: TWO_TRIADS };

export const bands: readonly BandDef[] = [
  defineBand({
    id: "band.two-chord-vamp",
    title: "Two-chord vamp (I–IV)",
    bars: 2,
    roles: ["drums", "bass", "chords"],
    params: { key: true, bpm: false },
    code: each((f) => vamp(f, EARLY)),
  }),
  defineBand({
    id: "band.axis-4bar",
    title: "Four-chord loop (I–V–vi–IV)",
    bars: 4,
    roles: ["drums", "bass", "chords"],
    params: { key: true, bpm: false },
    code: each((f) => axis(f)),
  }),
  // U03.L11 and the U03 checkpoint: an 8-bar melody that pauses on the open half (bar 4, V) and lands home
  // on I in bar 8, so a melody's ending can be heard against the harmony that ends the phrase.
  defineBand({
    id: "band.phrase-8bar",
    title: "Eight-bar phrase (I–IV–I–V, I–IV–V–I)",
    bars: 8,
    roles: ["drums", "bass", "chords"],
    params: { key: true, bpm: false },
    code: each((f) => phrase(f, PHRASE_TRIADS)),
  }),
  // 3/4 (U01.L08 and later waltzes): the tempo line is the lesson's `setcpm(bpm/3)`, so one cycle is a bar
  // of three beats. Bass on 1, chords on 2 and 3: the "oom-pah-pah" a waltz is named by.
  // U06.L07 and C2: the two other loops from the records, each one chord a bar.
  defineBand({
    id: "band.doo-wop",
    title: "Doo-wop (I–vi–IV–V, in threes)",
    bars: 4,
    roles: ["drums", "bass", "chords"],
    params: { key: true, bpm: false },
    code: each((f) => doowop(f)),
  }),
  defineBand({
    id: "band.three-chord",
    title: "Three-chord rock (I–IV–V–IV)",
    bars: 4,
    roles: ["drums", "bass", "chords"],
    params: { key: true, bpm: false },
    code: each((f) => rock(f)),
  }),
  defineBand({
    id: "band.waltz-vamp",
    title: "Waltz vamp (I–IV, 3/4)",
    bars: 2,
    roles: ["drums", "bass", "chords"],
    params: { key: true, bpm: false },
    code: each((f) => waltz(f, EARLY)),
  }),
  // Wave 5. U10 on and C4: the minor loop of the records, in any minor key (the step's tonic; see TONIC).
  defineBand({
    id: "band.aeolian-4bar",
    title: "Aeolian loop (i–VI–III–VII)",
    bars: 4,
    roles: ["drums", "bass", "chords"],
    params: { key: true, bpm: false },
    code: each((f) => aeolian(f)),
  }),
  // U11.L05 on, U11.CP and C5: twelve bars of shuffle, the standard form and the quick change (IV in bar 2).
  defineBand({
    id: "band.blues-12bar",
    title: "12-bar shuffle (standard)",
    bars: 12,
    roles: ["drums", "bass", "chords"],
    params: { key: true, bpm: false },
    code: each((f) => blues(f, STANDARD)),
  }),
  defineBand({
    id: "band.blues-12bar-qc",
    title: "12-bar shuffle (quick change)",
    bars: 12,
    roles: ["drums", "bass", "chords"],
    params: { key: true, bpm: false },
    code: each((f) => blues(f, QUICK)),
  }),
  // U09 on, U09.CP and C3: verse and chorus, following the learner's own sections (band-form.ts).
  defineBand({
    id: "band.sections",
    title: "Verse and chorus (I–vi–IV–V, IV–V–I–I)",
    bars: 16,
    roles: ["drums", "bass", "chords"],
    params: { key: true, bpm: false },
    code: each((f) => sections(f)),
  }),
];
export default bands;

/**
 * Bands written in half steps above the tonic (see TONIC): the same harmony whatever the mode of the key, so
 * they serve minor, blues and pentatonic steps. Every other Band is written in degrees of a major key and plays
 * its bass and chords only under a major key (content/bands/index.test.ts).
 */
export const TONIC_BANDS: ReadonlySet<string> = new Set([
  "band.aeolian-4bar",
  "band.blues-12bar",
  "band.blues-12bar-qc",
]);
/** Bands written in sections: they follow the learner's `arrange()` (packages/strudel band-form.ts). */
export const SECTION_BANDS: ReadonlySet<string> = new Set(["band.sections"]);
/** The harmony each Wave 5 Band plays, one chord a bar, in C (or C minor for the Aeolian loop). */
export const BAND_CHANGES: Readonly<Record<string, readonly string[]>> = {
  "band.aeolian-4bar": ["Cm", "Ab", "Eb", "Bb"],
  "band.blues-12bar": STANDARD.map((s) => ({ I: "C7", IV: "F7", V: "G7" })[s]),
  "band.blues-12bar-qc": QUICK.map((s) => ({ I: "C7", IV: "F7", V: "G7" })[s]),
  "band.sections": ["C", "Am", "F", "G", "F", "G", "C", "C", "C", "Am", "F", "G", "F", "G", "C", "C"],
};

/**
 * A later stage of one Band in one flavour: from `from` on (in every legal order), the Band plays `code`
 * instead of `BandDef.code[flavour]`. Stages of one flavour are listed in course order.
 */
export interface BandStage {
  from: LessonId;
  code: string;
  /** What changes, for the Listen QA and the liner notes. */
  what: string;
}
const JAZZ_FROM: LessonId = "U03.L01";
const FUNK_FROM: LessonId = "U06.L01";
const SIXTHS_SWING = "four-note chords (C6, F6) and swung eighths";
export const BAND_STAGES: Readonly<Record<string, Partial<Record<FlavourId, readonly BandStage[]>>>> = {
  "band.two-chord-vamp": {
    "flavour.jazz-soul": [
      {
        from: JAZZ_FROM,
        code: vamp("flavour.jazz-soul", { jazz: TWO_SIXTHS, funk: TWO_TRIADS }, SWING_4),
        what: SIXTHS_SWING,
      },
    ],
    "flavour.funk": [
      {
        from: FUNK_FROM,
        code: vamp("flavour.funk", { jazz: TWO_TRIADS, funk: TWO_SIXTHS }),
        what: "four-note chords (C6, F6)",
      },
    ],
  },
  "band.waltz-vamp": {
    "flavour.jazz-soul": [
      {
        from: JAZZ_FROM,
        code: waltz("flavour.jazz-soul", { jazz: TWO_SIXTHS, funk: TWO_TRIADS }, SWING_3),
        what: SIXTHS_SWING,
      },
    ],
    "flavour.funk": [
      {
        from: FUNK_FROM,
        code: waltz("flavour.funk", { jazz: TWO_TRIADS, funk: TWO_SIXTHS }),
        what: "four-note chords (C6, F6)",
      },
    ],
  },
  "band.axis-4bar": {
    "flavour.jazz-soul": [
      {
        from: JAZZ_FROM,
        code: axis("flavour.jazz-soul", { jazz: AXIS_FOURS, funk: AXIS_TRIADS }, SWING_4),
        what: "four-note chords (C6, G7, Am7, F6) and swung eighths",
      },
    ],
    "flavour.funk": [
      {
        from: FUNK_FROM,
        code: axis("flavour.funk", { jazz: AXIS_TRIADS, funk: AXIS_FOURS }),
        what: "four-note chords (C6, G7, Am7, F6)",
      },
    ],
  },
  "band.doo-wop": {
    "flavour.jazz-soul": [
      {
        from: JAZZ_FROM,
        code: doowop("flavour.jazz-soul", { jazz: DOOWOP_FOURS, funk: DOOWOP_TRIADS }),
        what: "four-note chords (C6, Am7, F6, G7)",
      },
    ],
    "flavour.funk": [
      {
        from: FUNK_FROM,
        code: doowop("flavour.funk", { jazz: DOOWOP_TRIADS, funk: DOOWOP_FOURS }),
        what: "four-note chords (C6, Am7, F6, G7)",
      },
    ],
  },
  "band.three-chord": {
    "flavour.jazz-soul": [
      {
        from: JAZZ_FROM,
        code: rock("flavour.jazz-soul", { jazz: ROCK_FOURS, funk: ROCK_TRIADS }, SWING_4),
        what: "four-note chords (C6, F6, G7) and swung eighths",
      },
    ],
    "flavour.funk": [
      {
        from: FUNK_FROM,
        code: rock("flavour.funk", { jazz: ROCK_TRIADS, funk: ROCK_FOURS }),
        what: "four-note chords (C6, F6, G7)",
      },
    ],
  },
  "band.phrase-8bar": {
    "flavour.funk": [
      { from: FUNK_FROM, code: phrase("flavour.funk", PHRASE_FOURS), what: "four-note chords (C6, F6, G7)" },
    ],
  },
};

/**
 * The code a Band plays in a flavour at a point of the course. `reached(from)` says whether the session
 * being played is at or after `from` in every legal order: pass
 * `(from) => atOrBefore(courseGraph(), from, sessionId)` (content/lib/course.ts). A flavour the Band does
 * not have falls back to pop, as the lesson player does.
 */
export function bandCodeAt(
  band: BandDef | BandId | string,
  flavour: FlavourId | string,
  reached: (from: LessonId) => boolean,
): string {
  const def = typeof band === "string" ? bandById.get(band) : band;
  if (!def) throw new Error(`no band ${String(band)}`);
  const f = (def.code[flavour as FlavourId] ? flavour : "flavour.pop") as FlavourId;
  let code = def.code[f] ?? "";
  for (const s of BAND_STAGES[def.id]?.[f] ?? []) if (reached(s.from)) code = s.code;
  return code;
}

/** Two-chord vamp with four-note chords, for jazz-soul and funk from U03/U06 on (FLAVOUR_RULES). */
export const SEVENTH_VAMP_CHORDS = TWO_SIXTHS;
/** The major-seventh vamp the jazz-soul Band does not use under a tune that rests on 1 and 4 (see above). */
export const MAJOR_SEVENTH_VAMP_CHORDS = TWO_SEVENTHS;
/** The four-chord loop with four notes, as the jazz-soul (U03 on) and funk (U06 on) Bands play it. */
export const AXIS_FOUR_CHORDS = AXIS_FOURS;
/** The major-seventh loop those Bands do not use under a tune (Cmaj7 G7 Am7 Fmaj7). */
export const AXIS_MAJOR_SEVENTH_CHORDS = AXIS_MAJOR_SEVENTHS;
/**
 * Bands whose bar is not four beats. BandDef carries no meter (contracts §5.10): the Band takes the
 * session's tempo line, so a lesson in 3/4 must pick a Band written in three. Content CI checks the match.
 */
export const BAND_METERS: Readonly<Record<string, MeterId>> = { "band.waltz-vamp": "3/4" };
export const bandMeter = (id: string): MeterId => BAND_METERS[id] ?? "4/4";

export const bandById: ReadonlyMap<string, BandDef> = new Map(bands.map((b) => [b.id, b] as const));
