import { capstoneById } from "../../../content/capstones.ts";
import type { BandSetup } from "../src/types.ts";

export const SHORT = `setcpm(120/4)
const drumsVerse = s("bd ~ sd ~").gain(.5)
const melVerse = note("c4 e4 g4 c5").s("piano").room(.2)
drums: arrange([1, drumsVerse])
mel: arrange([1, melVerse])`;
const response = capstoneById
  .get("C3")
  ?.brief?.tests?.find((t) => t.name.startsWith("pop: 100 BPM"))?.response;
const reference = response && "code" in response ? response.code : undefined;
if (!reference) throw new Error("C3's 96-second reference solution is missing");
export const C3: string = reference;

export const BAND: BandSetup = {
  band: "band.axis-8bar",
  flavour: "flavour.pop",
  followsLearnerKey: true,
  tracks: ["bass"],
  code: `const bassVerse = n("0 4").scale("{{key}}").s("ebass").lpf(700)
bass: arrange([8, bassVerse])`,
};

/**
 * Fast-changing orbit effects (carry f2): the pad's room and room size change every half bar and bar on orbit 1,
 * the arpeggio's delay time every bar on orbit 2, the bass's delay send, time and feedback every half bar on
 * orbit 3, and the pad's cutoff every beat. Four bars at 120 BPM. Measured, and left out of the comparison: a
 * drum's tail across a slice edge (a dry kick's tail slices differ by up to 1.9 dB, the capture's sub-millisecond
 * alignment) and a reverb on a low bass (a triangle C2 in `.room(.9)` differs by ±1.4 dB a bar while dry it is
 * sample-exact: the reverb's impulse is noise, seeded in the export and drawn anew by each live engine).
 */
export const ORBITS = `setcpm(120/4)
const padVerse = note("<[c3,g3,e4] [a2,e3,c4]>").s("sawtooth").lpf("<400 800 1600 3200>*4").lpq(4).room("<0 .8>*2").roomsize("<1 4>").gain(.25)
const arpVerse = note("c4 e4 g4 b4 c5 b4 g4 e4").s("triangle").delay(.6).delaytime("<.125 .1875 .25 .0625>").delayfeedback(.6).orbit(2).gain(.3)
const bassVerse = note("<c2 a1>").s("triangle").delay("<.7 0>*2").delaytime("<.1875 .125>*2").delayfeedback("<.5 .2>").orbit(3).gain(.5)
pad: arrange([4, padVerse])
arp: arrange([4, arpVerse])
bass: arrange([4, bassVerse])`;

/** Pieces an export refuses before a frame exists (bounds.ts): each would hang or never end. */
export const UNBOUNDED = [
  "setcpm(120/4)\nconst melVerse = (() => { while (true) {} return silence })()\nmel: arrange([2, melVerse])",
  'setcpm(120/4)\nconst melVerse = note("c4").fast(10 ** 9).s("piano")\nmel: arrange([2, melVerse])',
  'setcpm(120/4)\nconst melVerse = s("hh*1000000000")\nmel: arrange([2, melVerse])',
  'setcpm(120/4)\nmel: note("c4").s("piano")',
];

/** ORBITS with every changing orbit setting held at its first value (the control of the comparison). */
export const ORBITS_FROZEN = ORBITS.replace('.room("<0 .8>*2").roomsize("<1 4>")', ".room(0).roomsize(1)")
  .replace('.delaytime("<.125 .1875 .25 .0625>")', ".delaytime(.125)")
  .replace(
    '.delay("<.7 0>*2").delaytime("<.1875 .125>*2").delayfeedback("<.5 .2>")',
    ".delay(.7).delaytime(.1875).delayfeedback(.5)",
  );
