// Fixed unit sprigs, in the 1600 × 1000 illustration (ux §5.2).
// A sprig's start and step never depend on how many other units have been written.
// New units require a new anchor; existing anchors are part of the learner's spatial memory.
export type OakLimb = "roots" | "trunk" | "harmony" | "line" | "form" | "colour" | "jazz" | "sound";
export interface OakAnchor {
  limb: OakLimb;
  start: readonly [number, number];
  step: readonly [number, number];
  join: readonly [number, number];
}

// biome-ignore format: keep the authored geometry easy to scan
export const OAK_ANCHORS: Readonly<Record<string, OakAnchor>> = {
  U00: { limb: "trunk", start: [805, 665], step: [-38, 0], join: [805, 700] },
  U01: { limb: "roots", start: [740, 770], step: [-30, 4], join: [800, 710] },
  U02: { limb: "trunk", start: [718, 615], step: [-30, -3], join: [797, 645] },
  U03: { limb: "trunk", start: [863, 585], step: [30, -3], join: [807, 590] },
  U04: { limb: "trunk", start: [814, 519], step: [-31, -2], join: [800, 540] },
  U05: { limb: "harmony", start: [676, 425], step: [-30, 1], join: [760, 460] },
  U06: { limb: "harmony", start: [598, 308], step: [-30, 2], join: [658, 385] },
  U07: { limb: "line", start: [950, 437], step: [30, -1], join: [878, 472] },
  U08: { limb: "line", start: [1250, 503], step: [31, -2], join: [1090, 436] },
  U09: { limb: "form", start: [795, 325], step: [2, -42], join: [800, 390] },
  U10: { limb: "colour", start: [970, 325], step: [31, -3], join: [890, 370] },
  U11: { limb: "colour", start: [1090, 201], step: [30, -3], join: [1015, 280] },
  U12: { limb: "harmony", start: [180, 340], step: [-31, 1], join: [320, 345] },
  U13: { limb: "roots", start: [882, 790], step: [31, 5], join: [817, 716] },
  U14: { limb: "colour", start: [1330, 330], step: [32, -2], join: [1180, 300] },
  U15: { limb: "harmony", start: [242, 245], step: [-35, -8], join: [420, 346] },
  U16: { limb: "harmony", start: [280, 440], step: [-35, 3], join: [420, 346] },
  U17: { limb: "harmony", start: [245, 548], step: [-35, -3], join: [340, 439] },
  J1: { limb: "jazz", start: [587, 205], step: [30, -7], join: [670, 320] },
  J2: { limb: "jazz", start: [498, 157], step: [-31, -3], join: [585, 225] },
  J3: { limb: "jazz", start: [329, 165], step: [-32, -4], join: [460, 163] },
  J4: { limb: "jazz", start: [582, 74], step: [-32, -5], join: [585, 225] },
  J5: { limb: "jazz", start: [710, 82], step: [-34, -2], join: [690, 202] },
  R1: { limb: "roots", start: [445, 928], step: [-34, -3], join: [530, 799] },
  R2: { limb: "roots", start: [1110, 918], step: [34, 1], join: [1035, 815] },
  R3: { limb: "roots", start: [690, 930], step: [-30, 0], join: [750, 780] },
  A1: { limb: "sound", start: [938, 175], step: [30, -9], join: [895, 275] },
  A2: { limb: "sound", start: [1112, 96], step: [32, -4], join: [1030, 148] },
};

// Display attachment, not an unlock table. Derived from capstones.ts opensAfter:
// X2 follows C5; CF-A follows C7; advanced checkpoints close J2/J5/R3/A2.
export const OAK_CAPSTONE_UNITS: Readonly<Record<string, string>> = {
  C0: "U01",
  C1: "U02",
  C2: "U07",
  X1: "U07",
  C3: "U09",
  C4: "U10",
  C5: "U11",
  X2: "U11",
  C6: "U14",
  C7: "U17",
  "CF-A": "U17",
  "CF-T": "U15",
  JC1: "J2",
  JC2: "J4",
  JC3: "J5",
  JC4: "J5",
  RC1: "R3",
  RC2: "R3",
  AC1: "A2",
  AC2: "A2",
};
