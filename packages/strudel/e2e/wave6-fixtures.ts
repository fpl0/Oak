// Music the Wave 6 sound specs play (wave6.pw.ts), checked in headless Strudel by wave6-fixtures.test.ts.
import type { BarChords } from "../src/early-jazz.ts";

/** The five seventh-chord qualities of U12 as code suffixes (STYLE §5.1), brightest to darkest. */
export const SEVENTH_SUFFIXES = ["^7", "7", "m7", "m7b5", "o7"] as const;
/** Pairs one half step apart in one voice: the distinctions U12.L02 and U12.L03 teach by ear. */
export const HALF_STEP_PAIRS = [
  ["^7", "7"],
  ["7", "m7"],
  ["m7", "m7b5"],
  ["m7b5", "o7"],
] as const;

/** The sounds U12 comps on: the electric piano, the organ, the guitars and the pad; the piano is the reference. */
export const SEVENTH_SOUNDS = ["piano", "rhodes", "organ", "jazzgtr", "cleangtr", "pad"] as const;

/**
 * The three ways U12 voices a seventh chord: the default dictionary (U12.L01's `chord(changes).voicing()`), the
 * close stack from the root (U06.L10's `n("[0,2,4,6]")`, U12.L01 S3's note list) and the rootless left hand of
 * U12.L06. `{sym}` is the chord symbol; the close stack is written in half steps above C3.
 */
export const CLOSE_STACKS: Readonly<Record<(typeof SEVENTH_SUFFIXES)[number], readonly number[]>> = {
  "^7": [48, 52, 55, 59],
  "7": [48, 52, 55, 58],
  m7: [48, 51, 55, 58],
  m7b5: [48, 51, 54, 58],
  o7: [48, 51, 54, 57],
};
export const SEVENTH_VOICINGS = [
  { id: "default", code: (q: string) => `chord("C${q}").voicing()` },
  {
    id: "close",
    code: (q: string) => `note("[${CLOSE_STACKS[q as keyof typeof CLOSE_STACKS].join(",")}]")`,
  },
  { id: "lefthand", code: (q: string) => `chord("C${q}").dict("lefthand").voicing()` },
] as const;

/** Every kit a flavour plays, with the snare, hat and kick a ghost-note groove uses (`bank` "" is the default kit). */
export const KITS = [
  { id: "default", bank: "" },
  { id: "jazzkit", bank: "jazzkit" },
  { id: "LinnDrum", bank: "LinnDrum" },
  { id: "RolandTR808", bank: "RolandTR808" },
  { id: "RolandTR909", bank: "RolandTR909" },
] as const;
export const bankOf = (bank: string): string => (bank ? `.bank("${bank}")` : "");

/**
 * U13.L02's hook (content/specs/U13.ts FUNK, at 96 BPM): kick, a snare whose three small hits between the backbeats
 * are ghost notes, accented sixteenth hats, the finger bass and the Rhodes over Dm7–G7. One velocity per step, as
 * the lesson teaches (`.velocity()` takes its rhythm from the pattern on its left). `ghost` is the ghost notes'
 * velocity; 0 leaves them out (the snare plays its backbeats alone). The snare is the second line.
 */
export const GHOST_STEPS = "~ ~ ~ ~ sd ~ ~ sd ~ sd ~ ~ sd ~ ~ sd";
export const ghostVelocity = (ghost: number): string =>
  `1 1 1 1 1 1 1 ${ghost} 1 ${ghost} 1 1 1 1 1 ${ghost}`.replace(/\b0\./g, ".");
/** The backbeats only: the same groove with the ghost notes taken out. */
export const BACKBEAT_STEPS = "~ ~ ~ ~ sd ~ ~ ~ ~ ~ ~ ~ sd ~ ~ ~";
export const ghostGroove = (bank: string, ghost: number): string =>
  [
    `stack(`,
    `  s("${ghost > 0 ? GHOST_STEPS : BACKBEAT_STEPS}")${bankOf(bank)}${ghost > 0 ? `.velocity("${ghostVelocity(ghost)}")` : ""},`,
    `  s("hh*16")${bankOf(bank)}.velocity("[1 .4 .7 .4]*4").gain(.5),`,
    `  s("bd ~ ~ ~ ~ ~ bd ~ ~ ~ bd ~ ~ ~ ~ ~")${bankOf(bank)},`,
    `  chord("<Dm7 G7>").rootNotes(2).struct("x ~ ~ ~ ~ ~ x ~ ~ ~ x ~ ~ ~ ~ ~").s("fingerbass").lpf(800),`,
    `  chord("<Dm7 G7>").voicing().struct("~ x ~ ~ x ~ ~ ~").s("rhodes").gain(.5)`,
    `)`,
  ].join("\n");
/** Sixteenth steps of the bar on which a ghost note falls (0-based), and the backbeats. */
export const GHOST_AT = [7, 9, 15] as const;
export const BACKBEAT_AT = [4, 12] as const;
/** U13.L02's tempo: 96 BPM in 4/4. */
export const GHOST_CPS = 96 / 240;

/** The pitched sounds whose ghost and accent levels a learner sets with `.velocity()` in U13. */
export const VELOCITY_SOUNDS = [
  "piano",
  "rhodes",
  "clav",
  "cleangtr",
  "organ",
  "ebass",
  "fingerbass",
  "upright",
] as const;

// Changes of the three CF-T standards as they are commonly played, each 32 bars in four eights. The answer keys
// are author:repertoire's (content/repertoire); these are the sound engineer's test material for the early-jazz
// backing (src/early-jazz.ts), not a transcription of the prints.
/** Five Foot Two, Eyes of Blue (1925), in C: A A B A, the A section a chain of dominants. */
export const FIVE_FOOT_TWO_A: BarChords[] = ["C", "E7", "A7", "A7", "D7", "G7", "C", "G7"];
const FIVE_A2: BarChords[] = ["C", "E7", "A7", "A7", "D7", "G7", "C", "C"];
const FIVE_B: BarChords[] = ["E7", "E7", "A7", "A7", "D7", "D7", "G7", "G7"];
export const FIVE_FOOT_TWO: BarChords[] = [...FIVE_FOOT_TWO_A, ...FIVE_A2, ...FIVE_B, ...FIVE_A2];
/** Ain't She Sweet (1927), in C: A A B A, two chords in most bars of the A section. */
const SWEET_A: BarChords[] = [
  ["C", "C#o7"],
  ["Dm7", "G7"],
  ["C", "C#o7"],
  ["Dm7", "G7"],
  ["C", "E7"],
  ["A7", "A7"],
  ["D7", "G7"],
  "C",
];
const SWEET_B: BarChords[] = ["F", "F", "C", "C", "F", "F", "C", ["Dm7", "G7"]];
export const AINT_SHE_SWEET: BarChords[] = [...SWEET_A, ...SWEET_A, ...SWEET_B, ...SWEET_A];
/** Bye Bye Blackbird (1926), in F. */
export const BYE_BYE_BLACKBIRD: BarChords[] = [
  ...["F", "F", "Gm7", "C7", "F", "F", "Gm7", "C7"],
  ...["F", "Fo7", "Gm7", "C7", "Gm7", "C7", "F", "F"],
  ...["F7", "F7", "E7", "Eb7", "D7", "D7", "Gm7", "C7"],
  ...["F", "F", "Am7b5", "D7", "Gm7", "C7", "F", "F"],
];
export const CFT_CHANGES: Readonly<Record<string, readonly BarChords[]>> = {
  "Five Foot Two": FIVE_FOOT_TWO,
  "Ain't She Sweet": AINT_SHE_SWEET,
  "Bye Bye Blackbird": BYE_BYE_BLACKBIRD,
};
/** The standards' tempo in the backing tests: a medium two-beat, 132 BPM. */
export const CFT_BPM = 132;

// The Core Finale single (CF-A, content/specs/CF.ts): a song of more than two minutes with a bridge and four
// devices, as a learner might release it, for the long-piece specs (no dropout, CPU headroom, the warm-ahead of
// the sounds the bridge and the last chorus bring). Intro 4, verse 8, chorus 8, verse 8, chorus 8, bridge 8, the
// last chorus a whole step up 8, outro 4: 56 bars, 134.4 s at 100 BPM. Every track is one `arrange()` in degrees,
// the key plan after it (STYLE §10, contracts §6.8 item 4), so the lift moves every pitched track at bar 45.
// Devices: the push (chords `.early(1/8)` in the chorus), ghost notes (`.velocity()` on the snare), an applied
// dominant and a borrowed iv in the bridge (E7 → Am, F → Fm → C), the lift.
export const CFA_BPM = 100;
export const CFA_SECTIONS = [
  ["intro", 4],
  ["verse", 8],
  ["chorus", 8],
  ["verse", 8],
  ["chorus", 8],
  ["bridge", 8],
  ["chorus2", 8],
  ["outro", 4],
] as const;
export const CFA_BARS = CFA_SECTIONS.reduce((n, [, bars]) => n + bars, 0);
/** Bar (0-based cycle) where each section starts. */
export const cfaStart = (name: string): number => {
  let at = 0;
  for (const [n, bars] of CFA_SECTIONS) {
    if (n === name) return at;
    at += bars;
  }
  throw new Error(`no section ${name}`);
};
/** Sounds a section brings that no earlier section plays: what the warm-ahead must have decoded by then. */
export const CFA_FIRST_IN: Readonly<Record<string, readonly string[]>> = {
  bridge: ["strings"],
  chorus2: ["horns", "cr"],
};

type Track = { label: string; parts: Partial<Record<string, string>>; tail: string; plan?: number };
const TRACKS: Track[] = [
  {
    label: "kick",
    parts: {
      intro: 's("bd ~ ~ ~ bd ~ ~ ~")',
      verse: 's("bd ~ ~ bd ~ ~ bd ~")',
      chorus: 's("bd ~ bd ~ bd ~ bd ~")',
      bridge: 's("bd ~ ~ ~ ~ ~ ~ ~")',
      chorus2: 's("bd ~ bd ~ bd ~ bd ~")',
      outro: 's("bd ~ ~ ~ ~ ~ ~ ~")',
    },
    tail: "",
  },
  {
    label: "snare",
    parts: {
      verse: 's("~ ~ ~ ~ sd ~ ~ sd ~ sd ~ ~ sd ~ ~ sd").velocity("1 1 1 1 1 1 1 .3 1 .3 1 1 1 1 1 .3")',
      chorus: 's("~ sd ~ sd")',
      bridge: 's("~ ~ ~ sd")',
      chorus2: 's("~ sd ~ [sd sd]")',
    },
    tail: "",
  },
  {
    label: "hats",
    parts: {
      intro: 's("hh*8").velocity("[1 .6]*4").gain(.4)',
      verse: 's("hh*16").velocity("[1 .4 .7 .4]*4").gain(.45)',
      chorus: 's("[~ oh]*4").gain(.4)',
      chorus2: 's("[~ oh]*4, <cr ~ ~ ~>").gain(.4)',
      outro: 's("hh*8").velocity("[1 .6]*4").gain(.4)',
    },
    tail: "",
  },
  {
    label: "bass",
    parts: {
      intro: 'n("<0 5 3 4>")',
      verse: 'n("<[0 ~ 0 4] [5 ~ 5 4] [3 ~ 3 2] [4 ~ 4 6]>")',
      chorus: 'n("<[3*4] [4*4] [0*4] [5*4]>")',
      bridge: 'n("<[5 ~ 5 ~] [2 ~ 2 ~] [5 ~ 5 ~] [3 ~ 3 ~] [3 ~ 3 ~] [0 ~ 0 4] [5 ~ 5 ~] [4 ~ 4 ~]>")',
      chorus2: 'n("<[3*4] [4*4] [0*4] [5*4]>")',
      outro: 'n("<0 3 4 0>")',
    },
    tail: '.s("ebass").lpf(800).gain(.9)',
    plan: 2,
  },
  {
    label: "chords",
    parts: {
      intro: 'n("<[0,2,4] [5,7,9] [3,5,7] [4,6,8]>")',
      verse: 'n("<[0,2,4] [5,7,9] [3,5,7] [4,6,8]>").struct("x ~ x ~")',
      chorus: 'n("<[3,5,7] [4,6,8] [0,2,4] [5,7,9]>").struct("x x x x").early(1/8)',
      // Am, E7 (V7/vi) back to Am, F, Fm (iv), C, Am, G
      bridge: 'n("<[5,7,9] [1,2,4#,6] [5,7,9] [3,5,7] [3,5b,7] [0,2,4] [5,7,9] [4,6,8]>")',
      chorus2: 'n("<[3,5,7] [4,6,8] [0,2,4] [5,7,9]>").struct("x x x x").early(1/8)',
      outro: 'n("<[0,2,4] [3,5,7] [4,6,8] [0,2,4]>")',
    },
    tail: '.s("rhodes").gain(.5).room(.25)',
    plan: 3,
  },
  {
    label: "pad",
    parts: { bridge: 'n("<[5,7,9] [1,2,4#,6] [5,7,9] [3,5,7] [3,5b,7] [0,2,4] [5,7,9] [4,6,8]>")' },
    tail: '.s("strings").gain(.3)',
    plan: 3,
  },
  {
    label: "horns",
    parts: { chorus2: 'n("<[~ [7,9] ~ [7,9]] [~ [8,10] ~ [8,10]] [~ [7,9] ~ [7,9]] [~ [9,11] ~ [9,11]]>")' },
    tail: '.s("horns").gain(.35)',
    plan: 4,
  },
  {
    label: "mel",
    parts: {
      verse: 'n("<[4 ~ 2 4] [5 ~ 4 2] [3 ~ 2 0] [1 ~ ~ ~]>")',
      chorus: 'n("<[7 ~ 6 7] [8 ~ 7 5] [7 ~ 4 2] [4 ~ ~ ~]>")',
      bridge: 'n("<[5 ~ 4 5] [6 ~ 4# ~] [7 ~ 5 4] [3 ~ 5 ~] [5b ~ 3 ~] [4 ~ 2 0] [2 ~ 4 5] [6 ~ ~ ~]>")',
      chorus2: 'n("<[7 ~ 6 7] [8 ~ 7 5] [7 ~ 4 2] [4 ~ ~ ~]>")',
    },
    tail: '.s("piano").gain(.8)',
    plan: 4,
  },
];
const cap = (s: string): string => `${s[0]?.toUpperCase()}${s.slice(1)}`;

/**
 * The single as code. `bpm` changes the tempo line only (a faster run plays the same bars); `from` (a bar) starts
 * the piece there by moving every track early, key plan included, so a spec can play the bridge and the lift
 * without waiting through the verses.
 */
export function cfaArrangement(bpm = CFA_BPM, from = 0): string {
  const lift = cfaStart("chorus2");
  const consts: string[] = [];
  const lines: string[] = [];
  for (const t of TRACKS) {
    for (const [name, body] of Object.entries(t.parts)) consts.push(`const ${t.label}${cap(name)} = ${body}`);
    const sections = CFA_SECTIONS.map(([name, bars]) =>
      t.parts[name] ? `[${bars}, ${t.label}${cap(name)}]` : `[${bars}, silence]`,
    );
    const plan =
      t.plan === undefined ? "" : `.scale("<C${t.plan}:major!${lift} D${t.plan}:major!${CFA_BARS - lift}>")`;
    const start = from > 0 ? `.early(${from})` : "";
    lines.push(`${t.label}: arrange(${sections.join(", ")})${plan}${t.tail}${start}`);
  }
  return [`setcpm(${bpm}/4)`, ...consts, ...lines].join("\n");
}

/**
 * The sounds U12–U17 unlock, at the pitches their lessons play them (content/specs): the jazz guitar's left-hand
 * comping around middle C (U12.L06), the clean guitar's sixteenth chords (U13.L02), the trumpet and the horns'
 * stabs over applied chords (U15.L05), the tenor sax on Aura Lee (U16.L05, B♭3 to F5). MIDI numbers.
 */
export const W6_TUNING: Readonly<Record<string, readonly number[]>> = {
  jazzgtr: [55, 62, 69],
  cleangtr: [57, 64, 71],
  trumpet: [60, 67, 74],
  horns: [55, 62, 67],
  tenor: [58, 65, 77],
};
