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
// The loop's sevenths voiced close and low (Cmaj7 C E G B, G7 B D F G, Am7 A C E G, Fmaj7 F A C E), so
// even in B, where the tonic sits highest, the top voice stays under the tune's register.
const AXIS_SEVENTHS = '"<[-7,-5,-3,-1] [-8,-6,-4,-3] [-9,-7,-5,-3] [-4,-2,0,2]>"';
// The four-note chords of jazz-soul (U03 on) and funk (U06 on) over I and IV are sixth chords: C6 is
// C E G A, F6 is F A C D (voiced D F A C over the F in the bass). A major seventh would put B under a
// melody resting on 1 and E under one resting on 4: a half step below the tune's note, the harshest clash
// there is, on exactly the notes U03 teaches the learner to land on. The 6th is the jazz player's tonic
// colour for that reason. V keeps its seventh (G7: B D F G), the chord that leans home.
const [I6, IV6] = ["[-7,-5,-3,-2]", "[-6,-4,-2,0]"];
const TWO_SIXTHS = `"<${I6} ${IV6}>"`;
// An eight-bar phrase that closes: I IV I V (an open half) | I IV V I (home). Voiced close to I so every
// chord change moves each note by a step at most: IV is C F A (C stays), V is B D G (G stays, B leans up
// to C). With four notes: C6 C E G A, F6 D F A C, G7 B D F G.
const [I3, IV3, V3] = ["[-7,-5,-3]", "[-7,-4,-2]", "[-8,-6,-3]"];
const V7 = "[-8,-6,-4,-3]";
const PHRASE_TRIADS = `"<${I3} ${IV3} ${I3} ${V3} ${I3} ${IV3} ${V3} ${I3}>"`;
const PHRASE_FOURS = `"<${I6} ${IV6} ${I6} ${V7} ${I6} ${IV6} ${V7} ${I6}>"`;
const PHRASE_ROOTS = '"<-14 -11 -14 -10 -14 -11 -10 -14>"';

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
/** The four-chord loop (schema lessons, U06 on): sevenths and swing in jazz-soul, sevenths in funk. */
const axis = (f: Flavour): string => {
  switch (f) {
    case "flavour.pop":
      return layers(f, { ...POP_4, ...PIANO_4, bass: '"<-14 -10 -9 -11>"', chords: AXIS_TRIADS });
    case "flavour.jazz-soul":
      return layers(f, {
        drums: "bd ~ sd ~, rd*8",
        drumsVelocity: HUMAN_8THS,
        bass: '"<-14 -10 -9 -11>"',
        chords: AXIS_SEVENTHS,
        struct: "~ x ~ x",
        chordsVelocity: '"1 .86"',
        swing: SWING_4,
      });
    case "flavour.indie":
      return layers(f, { ...INDIE_4, ...PIANO_4, bass: '"<-14 -10 -9 -11>"', chords: AXIS_TRIADS });
    case "flavour.funk":
      return layers(f, {
        ...FUNK_4,
        ...STAB,
        // Octave pop on I, then root and fifth: an octave pop on vi would climb past E4 in B.
        bass: '"<[-14 ~ -14 -7] [-10 ~ -10 -6] [-9 ~ -9 -5] [-11 ~ -11 -7]>"',
        chords: AXIS_SEVENTHS,
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
    code: each(axis),
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
  defineBand({
    id: "band.waltz-vamp",
    title: "Waltz vamp (I–IV, 3/4)",
    bars: 2,
    roles: ["drums", "bass", "chords"],
    params: { key: true, bpm: false },
    code: each((f) => waltz(f, EARLY)),
  }),
];
export default bands;

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
/**
 * Bands whose bar is not four beats. BandDef carries no meter (contracts §5.10): the Band takes the
 * session's tempo line, so a lesson in 3/4 must pick a Band written in three. Content CI checks the match.
 */
export const BAND_METERS: Readonly<Record<string, MeterId>> = { "band.waltz-vamp": "3/4" };
export const bandMeter = (id: string): MeterId => BAND_METERS[id] ?? "4/4";

export const bandById: ReadonlyMap<string, BandDef> = new Map(bands.map((b) => [b.id, b] as const));
