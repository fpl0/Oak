// Band layers (contracts §5.10): read-only backings that make a Make sound like a song. Code uses the
// labelled tracks drums: bass: chords: only, follows the key through `{{key}}` (a "C4:major" style scale
// argument) and shares the session tempo, so it carries no tempo line. Bass and chords are written as
// degrees below the tonic (`n(-14)` is two octaves down) so one code fits every key. Band code is a
// preview context: it may use locked tools, and must pass the strict lint (content/validate/bands.test.ts).
import { type BandDef, defineBand } from "@oak/content-kit";

const TWO_TRIADS = '"<[-7,-5,-3] [-4,-2,0]>"';
const TWO_SEVENTHS = '"<[-7,-5,-3,-1] [-4,-2,0,2]>"';
const AXIS_TRIADS = '"<[-7,-5,-3] [-3,-1,1] [-2,0,2] [-4,-2,0]>"';
const AXIS_SEVENTHS = '"<[-7,-5,-3,-1] [-3,-1,1,3] [-2,0,2,4] [-4,-2,0,2]>"';

export const bands: readonly BandDef[] = [
  defineBand({
    id: "band.two-chord-vamp",
    title: "Two-chord vamp (I–IV)",
    bars: 2,
    roles: ["drums", "bass", "chords"],
    params: { key: true, bpm: false },
    code: {
      "flavour.pop": `drums: s("bd ~ sd ~, hh*8").gain(.7)\nbass: n("<-14 -11>").scale("{{key}}").s("ebass").lpf(800)\nchords: n(${TWO_TRIADS}).scale("{{key}}").struct("~ x ~ x").s("piano").gain(.45).room(.25)`,
      "flavour.jazz-soul": `drums: s("bd ~ sd ~, rd*8").bank("jazzkit").gain(.7)\nbass: n("<-14 -11>").scale("{{key}}").s("upright").lpf(900)\nchords: n(${TWO_TRIADS}).scale("{{key}}").struct("~ x ~ x").s("rhodes").gain(.45).room(.35)`,
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
      "flavour.pop": `drums: s("bd ~ sd ~, hh*8").gain(.7)\nbass: n("<-14 -10 -9 -11>").scale("{{key}}").s("ebass").lpf(800)\nchords: n(${AXIS_TRIADS}).scale("{{key}}").struct("~ x ~ x").s("piano").gain(.45).room(.25)`,
      "flavour.jazz-soul": `drums: s("bd ~ sd ~, rd*8").bank("jazzkit").swingBy(1/3, 4).gain(.7)\nbass: n("<-14 -10 -9 -11>").scale("{{key}}").s("upright").lpf(900)\nchords: n(${AXIS_SEVENTHS}).scale("{{key}}").struct("~ x ~ x").swingBy(1/3, 4).s("rhodes").gain(.45).room(.35)`,
      "flavour.indie": `drums: s("bd ~ sd ~, hh*8").bank("LinnDrum").gain(.7)\nbass: n("<-14 -10 -9 -11>").scale("{{key}}").s("ebass").lpf(750)\nchords: n(${AXIS_TRIADS}).scale("{{key}}").struct("x x x x").s("cleangtr").gain(.4).room(.3)`,
      "flavour.funk": `drums: s("bd ~ sd ~, hh*16").bank("RolandTR808").gain(.7)\nbass: n("<[-14 ~ -14 -7] [-10 ~ -10 -3] [-9 ~ -9 -2] [-11 ~ -11 -4]>").scale("{{key}}").s("fingerbass").lpf(850)\nchords: n(${AXIS_SEVENTHS}).scale("{{key}}").struct("~ x ~ [~ x]").s("clav").gain(.4).room(.2)`,
    },
  }),
];
export default bands;

/** Two-chord vamp with seventh chords, for jazz-soul and funk Makes from U03/U06 on (FLAVOUR_RULES). */
export const SEVENTH_VAMP_CHORDS = TWO_SEVENTHS;
export const bandById: ReadonlyMap<string, BandDef> = new Map(bands.map((b) => [b.id, b] as const));
