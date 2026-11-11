// Band layers (contracts §5.10): read-only backings that make a Make sound like a song. Code uses the
// labelled tracks drums: bass: chords: only, follows the key through `{{key}}` (a "C4:major" style scale
// argument) and shares the session tempo, so it carries no tempo line. Bass and chords are written as
// degrees below the tonic (`n(-14)` is two octaves down) so one code fits every key. Band code is a
// preview context: it may use locked tools, and must pass the strict lint (content/validate/bands.test.ts).
import { type BandDef, defineBand, type MeterId } from "@oak/content-kit";

const TWO_TRIADS = '"<[-7,-5,-3] [-4,-2,0]>"';
const TWO_SEVENTHS = '"<[-7,-5,-3,-1] [-4,-2,0,2]>"';
const AXIS_TRIADS = '"<[-7,-5,-3] [-3,-1,1] [-2,0,2] [-4,-2,0]>"';
const AXIS_SEVENTHS = '"<[-7,-5,-3,-1] [-3,-1,1,3] [-2,0,2,4] [-4,-2,0,2]>"';

// Production defaults (contracts §5.10; the numbers of content/flavours.ts): room 0.25 (pop) and 0.35
// (jazz-soul), the bass low-passed and centred, the chords a little left of the learner's line, and
// velocities that move within ±0.08 of 0.92 so a repeated hit never sounds pasted. The accent patterns are
// fixed, not random, so every play of a Band is the same record. Each one is spread over the slots of the
// pattern to its left (STYLE §11 rule 7): eight values for eighths, four for quarters, three for a waltz.
/** Eighth-note accents: strong on the beat, lighter between, a little lift on beats 2 and 4. */
const HUMAN_8THS = '"[1 .86 .94 .86]*2"';
/** Quarter-note piano that leans on beat 1. */
const PUMP_4 = '"1 .86 .92 .86"';
/** A chord on 1 and a lighter push on the "and" of 4, as a soul keyboard player comps. */
const PUSH = '"1 .86"';
/** One, two, three: the downbeat carries the waltz. */
const WALTZ_3 = '"1 .86 .9"';

export const bands: readonly BandDef[] = [
  defineBand({
    id: "band.two-chord-vamp",
    title: "Two-chord vamp (I–IV)",
    bars: 2,
    roles: ["drums", "bass", "chords"],
    params: { key: true, bpm: false },
    code: {
      "flavour.pop": `drums: s("bd sd [~ bd] sd, hh*8").velocity(${HUMAN_8THS}).gain(.7)\nbass: n("<-14 -11>").scale("{{key}}").s("ebass").lpf(800).gain(.9)\nchords: n(${TWO_TRIADS}).scale("{{key}}").struct("x x x x").s("piano").velocity(${PUMP_4}).gain(.4).pan(.42).room(.25)`,
      "flavour.jazz-soul": `drums: s("bd ~ sd [~ bd], rd*8").bank("jazzkit").velocity(${HUMAN_8THS}).gain(.65)\nbass: n("<[-14 -10] [-11 -7]>").scale("{{key}}").s("upright").lpf(900).gain(.9)\nchords: n(${TWO_TRIADS}).scale("{{key}}").struct("x ~ ~ [~ x]").s("rhodes").velocity(${PUSH}).gain(.45).pan(.4).room(.35)`,
      "flavour.indie": `drums: s("bd ~ sd ~, hh*8").bank("LinnDrum").gain(.7)\nbass: n("<-14 -11>").scale("{{key}}").s("ebass").lpf(750)\nchords: n(${TWO_TRIADS}).scale("{{key}}").struct("x x x x").s("cleangtr").gain(.4).room(.3)`,
      "flavour.funk": `drums: s("bd ~ sd ~, hh*16").bank("RolandTR808").gain(.7)\nbass: n("<[-14 ~ -14 -7] [-11 ~ -11 -4]>").scale("{{key}}").s("fingerbass").lpf(850)\nchords: n(${TWO_TRIADS}).scale("{{key}}").struct("~ x ~ [~ x]").s("clav").gain(.4).room(.2)`,
    },
  }),
  defineBand({
    id: "band.axis-4bar",
    title: "Four-chord loop (I–V–vi–IV)",
    bars: 4,
    roles: ["drums", "bass", "chords"],
    params: { key: true, bpm: false },
    code: {
      "flavour.pop": `drums: s("bd sd [~ bd] sd, hh*8").velocity(${HUMAN_8THS}).gain(.7)\nbass: n("<-14 -10 -9 -11>").scale("{{key}}").s("ebass").lpf(800).gain(.9)\nchords: n(${AXIS_TRIADS}).scale("{{key}}").struct("x x x x").s("piano").velocity(${PUMP_4}).gain(.4).pan(.42).room(.25)`,
      "flavour.jazz-soul": `drums: s("bd ~ sd ~, rd*8").bank("jazzkit").swingBy(1/3, 4).velocity(${HUMAN_8THS}).gain(.65)\nbass: n("<-14 -10 -9 -11>").scale("{{key}}").s("upright").lpf(900).gain(.9)\nchords: n(${AXIS_SEVENTHS}).scale("{{key}}").struct("~ x ~ x").swingBy(1/3, 4).s("rhodes").gain(.45).pan(.4).room(.35)`,
      "flavour.indie": `drums: s("bd ~ sd ~, hh*8").bank("LinnDrum").gain(.7)\nbass: n("<-14 -10 -9 -11>").scale("{{key}}").s("ebass").lpf(750)\nchords: n(${AXIS_TRIADS}).scale("{{key}}").struct("x x x x").s("cleangtr").gain(.4).room(.3)`,
      "flavour.funk": `drums: s("bd ~ sd ~, hh*16").bank("RolandTR808").gain(.7)\nbass: n("<[-14 ~ -14 -7] [-10 ~ -10 -3] [-9 ~ -9 -2] [-11 ~ -11 -4]>").scale("{{key}}").s("fingerbass").lpf(850)\nchords: n(${AXIS_SEVENTHS}).scale("{{key}}").struct("~ x ~ [~ x]").s("clav").gain(.4).room(.2)`,
    },
  }),
  // 3/4 (U01.L08 and later waltzes): the tempo line is the lesson's `setcpm(bpm/3)`, so one cycle is a bar
  // of three beats. Bass on 1, chords on 2 and 3: the "oom-pah-pah" a waltz is named by.
  defineBand({
    id: "band.waltz-vamp",
    title: "Waltz vamp (I–IV, 3/4)",
    bars: 2,
    roles: ["drums", "bass", "chords"],
    params: { key: true, bpm: false },
    code: {
      "flavour.pop": `drums: s("bd hh hh").velocity(${WALTZ_3}).gain(.7)\nbass: n("<-14 -11>").scale("{{key}}").s("ebass").lpf(800).gain(.9)\nchords: n(${TWO_TRIADS}).scale("{{key}}").struct("~ x x").s("piano").velocity(${WALTZ_3}).gain(.4).pan(.42).room(.25)`,
      "flavour.jazz-soul": `drums: s("bd [rd rd] rd").bank("jazzkit").velocity(${WALTZ_3}).gain(.65)\nbass: n("<[-14 ~ -10] [-11 ~ -7]>").scale("{{key}}").s("upright").lpf(900).gain(.9)\nchords: n(${TWO_TRIADS}).scale("{{key}}").struct("~ x x").s("rhodes").velocity(${WALTZ_3}).gain(.45).pan(.4).room(.35)`,
      "flavour.indie": `drums: s("bd hh hh").bank("LinnDrum").gain(.7)\nbass: n("<-14 -11>").scale("{{key}}").s("ebass").lpf(750)\nchords: n(${TWO_TRIADS}).scale("{{key}}").struct("~ x x").s("cleangtr").gain(.4).room(.3)`,
      "flavour.funk": `drums: s("bd [~ hh] [sd hh]").bank("RolandTR808").gain(.7)\nbass: n("<[-14 ~ -7] [-11 ~ -4]>").scale("{{key}}").s("fingerbass").lpf(850)\nchords: n(${TWO_TRIADS}).scale("{{key}}").struct("~ x [~ x]").s("clav").gain(.4).room(.2)`,
    },
  }),
];
export default bands;

/** Two-chord vamp with seventh chords, for jazz-soul and funk Makes from U03/U06 on (FLAVOUR_RULES). */
export const SEVENTH_VAMP_CHORDS = TWO_SEVENTHS;
/**
 * Bands whose bar is not four beats. BandDef carries no meter (contracts §5.10): the Band takes the
 * session's tempo line, so a lesson in 3/4 must pick a Band written in three. Content CI checks the match.
 */
export const BAND_METERS: Readonly<Record<string, MeterId>> = { "band.waltz-vamp": "3/4" };
export const bandMeter = (id: string): MeterId => BAND_METERS[id] ?? "4/4";

export const bandById: ReadonlyMap<string, BandDef> = new Map(bands.map((b) => [b.id, b] as const));
