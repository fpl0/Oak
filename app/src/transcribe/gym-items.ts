// The gym's generated jazz and rhythm items (Wave 7, stages G and H after the core; gym-after-core.ts names them):
// each is Oak's own short piece in Strudel, played as a pattern source by the hidden player, and what the learner
// takes down — a chart (jazz) or a set of rhythm tasks (name what you hear, write the rhythm on a grid). Every
// item is built from @oak/theory's tables (the one chord table, `jazzBlues`, `rhythmChanges`, `claveSteps`,
// `euclid`), so a chart and the notes that sound cannot disagree; gym-items.test.ts plays each one headless and
// checks that what sounds is what the answer says. Deterministic by item id.
import type { KeySpec, MeterId } from "@oak/content-kit";
import {
  type ClaveDirection,
  type ClaveType,
  claveSteps,
  euclid,
  jazzBlues,
  onsetsOf,
  parseChordWithBass,
  rhythmChanges,
  scaleNotes,
  turnaround,
  twoFiveOne,
} from "@oak/theory";
import { type ClaveSpec, claveText, type GridFeel } from "./grid.ts";
import {
  JAZZ_FORMS,
  type JazzForm,
  jazzTonics,
  RHYTHM_ITEMS,
  type RhythmItem,
  tonicText,
} from "./gym-after-core.ts";

export { jazzTonics };

import { REF_PREFIX, type StimulusCode } from "./stimulus-code.ts";

/** A task of a rhythm item or of a lesson's rhythm lab (R3.L05 passes its own through `RhythmLab`). */
export type RhythmTask =
  | {
      kind: "identify";
      id: string;
      prompt: string;
      options: readonly { id: string; label: string }[];
      answer: string;
    }
  | {
      kind: "dictate";
      id: string;
      prompt: string;
      /** Steps a bar (8 eighths, 16 sixteenths, 7 in 7/8, 6 for three against two). */
      steps: number;
      bars: number;
      /** Step indices over all bars that sound. */
      answer: readonly number[];
      /** What a step is called in the feedback ("eighth", "16th"). */
      stepName: string;
    };

interface ItemBase {
  id: string;
  title: string;
  bpm: number;
  meter: MeterId;
  /** A declared grouping (7/8 as 2+2+3). */
  grouping: readonly number[] | null;
  bars: number;
  feel: GridFeel;
  /** The hidden player's code: labelled `ref_` lines, no tempo line. */
  stimulus: StimulusCode;
  /** Sounds to load before it plays. */
  preload: readonly string[];
}
export interface JazzGymItem extends ItemBase {
  kind: "jazz";
  key: KeySpec;
  /** The chart that sounds, one or two symbols a bar (code spelling). */
  chart: string[][];
}
export interface RhythmGymItem extends ItemBase {
  kind: "rhythm";
  /** The clave the item plays (its grid is offered once the answer is checked or shown). */
  clave: ClaveSpec | null;
  tasks: RhythmTask[];
}
export type GymItem = JazzGymItem | RhythmGymItem;

const mod = (n: number, m: number) => ((n % m) + m) % m;
const bracket = (bar: readonly string[]) => (bar.length === 1 ? (bar[0] as string) : `[${bar.join(" ")}]`);

/** The chart of a jazz form in a key, with the colours the tracks teach (a ♭9, a 13, an altered dominant, a 6/9). */
export function jazzChart(form: JazzForm, tonic: string): string[][] {
  const k = Math.max(0, jazzTonics(form).indexOf(tonic));
  switch (form) {
    case "ii-V-I": {
      const t = twoFiveOne(tonic, "major");
      const v = t.symbols[1].replace(/7$/, ["7", "13", "7b9"][k % 3] as string);
      const i = t.symbols[2].replace(/\^7$/, k % 2 === 0 ? "^7" : "69");
      return [[t.symbols[0]], [v], [i], [i]];
    }
    case "minor-ii-V-i": {
      const t = twoFiveOne(tonic, "minor", {
        dominant: k % 2 === 0 ? "7b9" : "7alt",
        tonic: k % 2 === 0 ? "m7" : "m6",
      });
      return [[t.symbols[0]], [t.symbols[1]], [t.symbols[2]], [t.symbols[2]]];
    }
    case "turnaround": {
      const bars = turnaround(tonic, "I-vi-ii-V").map((b) => [...b]);
      // Every other key the vi becomes VI7♭9, the secondary dominant into ii (U15's colour, J4.L01's sound).
      if (k % 2 === 1) {
        const vi = parseChordWithBass(bars[1]?.[0] ?? "");
        if (vi) bars[1] = [`${scaleNotes({ tonic, mode: "major" })[5]}7b9`];
      }
      return bars;
    }
    case "blues":
      return jazzBlues(tonic).map((b) => [...b]);
    case "rhythm-A":
      return rhythmChanges(tonic)
        .bars.slice(0, 8)
        .map((b) => [...b]);
  }
}

/** Two-feel bass: each bar's root then its fifth (a bar of two chords: each root), in octave 2. */
function bassLine(chart: readonly (readonly string[])[]): string {
  const names = ["c", "db", "d", "eb", "e", "f", "gb", "g", "ab", "a", "bb", "b"];
  const n = (pc: number, up = 0) => {
    const midi = 36 + mod(pc - 4, 12) + 4 + up; // E2 to E♭3: the upright's home
    return `${names[mod(midi, 12)]}${Math.floor(midi / 12) - 1}`;
  };
  return chart
    .map((bar) => {
      const roots = bar.map((s) => parseChordWithBass(s)?.bassPc ?? 0);
      if (roots.length === 2) return `[${n(roots[0] as number)} ${n(roots[1] as number)}]`;
      const r = roots[0] as number;
      return `[${n(r)} ${n(mod(r + 7, 12))}]`;
    })
    .join(" ");
}

const JAZZ_BPM: Record<JazzForm, number> = {
  "ii-V-I": 96,
  "minor-ii-V-i": 92,
  turnaround: 104,
  blues: 120,
  "rhythm-A": 132,
};

/** A jazz item: the chart on a swung trio (ride, upright two-feel, piano comping on 2 and 4). */
export function jazzItem(form: JazzForm, tonic: string): JazzGymItem {
  const chart = jazzChart(form, tonic);
  const bars = chart.length;
  const key: KeySpec = { tonic, mode: form === "minor-ii-V-i" ? "minor" : "major" };
  const changes = chart.map(bracket).join(" ");
  const code = [
    `${REF_PREFIX}drums: s("rd [rd rd] rd [rd rd], ~ hh ~ hh").swingBy(1/3, 4).gain(.45)`,
    `${REF_PREFIX}bass: note("<${bassLine(chart)}>").s("upright").gain(.8)`,
    `${REF_PREFIX}chords: chord("<${changes}>").voicing().struct("~ x ~ x").s("piano").gain(.55)`,
  ].join("\n");
  return {
    kind: "jazz",
    id: `jazz:${form}:${tonic}`,
    title: `${JAZZ_FORMS[form].title} in ${tonicText(tonic)}${key.mode === "minor" ? " minor" : ""}`,
    bpm: JAZZ_BPM[form],
    meter: "4/4",
    grouping: null,
    bars,
    feel: "swing",
    key,
    chart,
    stimulus: { code, tracks: [`${REF_PREFIX}drums`, `${REF_PREFIX}bass`, `${REF_PREFIX}chords`] },
    preload: ["rd", "hh", "upright", "piano"],
  };
}

const mini = (onsets: readonly number[], steps: number, sound: string): string =>
  Array.from({ length: steps }, (_, i) => (onsets.includes(i) ? sound : "~")).join(" ");
const barsMini = (onsets: readonly number[], steps: number, bars: number, sound: string): string =>
  bars === 1
    ? mini(onsets, steps, sound)
    : `<${Array.from(
        { length: bars },
        (_, b) =>
          `[${mini(
            onsets.filter((o) => Math.floor(o / steps) === b).map((o) => o - b * steps),
            steps,
            sound,
          )}]`,
      ).join(" ")}>`;

const FEEL_OPTIONS = [
  { id: "straight16", label: "Straight 16ths" },
  { id: "swing16", label: "Swung 16ths" },
  { id: "swing8", label: "Swung 8ths" },
  { id: "triplets", label: "Triplets" },
];
const GROUPING_OPTIONS = [
  { id: "2+2+3", label: "2+2+3" },
  { id: "2+3+2", label: "2+3+2" },
  { id: "3+2+2", label: "3+2+2" },
];
const CLAVE_OPTIONS = [
  { id: "son 3-2", label: "Son clave, 3-2" },
  { id: "son 2-3", label: "Son clave, 2-3" },
  { id: "rumba 3-2", label: "Rumba clave, 3-2" },
  { id: "rumba 2-3", label: "Rumba clave, 2-3" },
];

/** A rhythm item: a short groove and its tasks (identify first, then the grid). */
export function rhythmItem(item: RhythmItem): RhythmGymItem {
  const base = { kind: "rhythm" as const, id: `rhythm:${item}`, title: RHYTHM_ITEMS[item].title };
  switch (item) {
    case "swing-16": {
      const kick = [0, 3, 6, 10];
      return {
        ...base,
        bpm: 92,
        meter: "4/4",
        grouping: null,
        bars: 2,
        feel: "swing16",
        clave: null,
        stimulus: code([
          `hats: s("hh*16").swingBy(1/3, 8).velocity("[1 .4 .7 .4]*4").gain(.5)`,
          `kick: s("${mini(kick, 16, "bd")}").swingBy(1/3, 8)`,
          `snare: s("~ sd ~ sd")`,
        ]),
        preload: ["hh", "bd", "sd"],
        tasks: [
          {
            kind: "identify",
            id: "feel",
            prompt: "How do the hats divide the beat?",
            options: FEEL_OPTIONS,
            answer: "swing16",
          },
          {
            kind: "dictate",
            id: "kick",
            prompt: "Write the kick on the 16th grid (one bar; it repeats).",
            steps: 16,
            bars: 1,
            answer: kick,
            stepName: "16th",
          },
        ],
      };
    }
    case "odd-7": {
      const kick = [0, 2, 4];
      return {
        ...base,
        bpm: 168,
        meter: "7/8",
        grouping: [2, 2, 3],
        bars: 2,
        feel: "straight",
        clave: null,
        stimulus: code([
          `kick: s("${mini(kick, 7, "bd")}")`,
          `hats: s("hh*7").velocity("1 .5 1 .5 1 .5 .5").gain(.45)`,
          `snare: s("~ ~ ~ sd ~ ~ sd")`,
        ]),
        preload: ["hh", "bd", "sd"],
        tasks: [
          {
            kind: "identify",
            id: "grouping",
            prompt: "How are the seven eighths grouped?",
            options: GROUPING_OPTIONS,
            answer: "2+2+3",
          },
          {
            kind: "dictate",
            id: "kick",
            prompt: "Write the kick on the seven eighths of the bar.",
            steps: 7,
            bars: 1,
            answer: kick,
            stepName: "eighth",
          },
        ],
      };
    }
    case "poly-3-2": {
      return {
        ...base,
        bpm: 80,
        meter: "4/4",
        grouping: null,
        bars: 2,
        feel: "straight",
        clave: null,
        stimulus: code([`low: s("lt*2").gain(.9)`, `high: s("ht*3").gain(.7)`, `hats: s("hh*4").gain(.25)`]),
        preload: ["lt", "ht", "hh"],
        tasks: [
          {
            kind: "identify",
            id: "poly",
            prompt: "Two drums divide the bar evenly. How many hits does each play?",
            options: [
              { id: "3:2", label: "High 3, low 2" },
              { id: "2:3", label: "High 2, low 3" },
              { id: "4:3", label: "High 4, low 3" },
            ],
            answer: "3:2",
          },
          {
            kind: "dictate",
            id: "high",
            prompt: "Write the high drum on a grid of six (the bar in sixths).",
            steps: 6,
            bars: 1,
            answer: [0, 2, 4],
            stepName: "sixth",
          },
        ],
      };
    }
    case "tresillo": {
      const bass = onsetsOf(euclid(3, 8));
      return {
        ...base,
        bpm: 100,
        meter: "4/4",
        grouping: null,
        bars: 2,
        feel: "straight",
        clave: null,
        stimulus: code([
          `bass: note("<[${mini(bass, 8, "c2")}] [${mini(bass, 8, "g1")}]>").s("upright").gain(.9)`,
          `hats: s("hh*8").gain(.3)`,
          `kick: s("bd ~ ~ ~ bd ~ ~ ~")`,
        ]),
        preload: ["upright", "hh", "bd"],
        tasks: [
          {
            kind: "identify",
            id: "figure",
            prompt: "Which figure does the bass play?",
            options: [
              { id: "tresillo", label: "Tresillo (3 in 8)" },
              { id: "cinquillo", label: "Cinquillo (5 in 8)" },
              { id: "four", label: "Four on the floor" },
            ],
            answer: "tresillo",
          },
          {
            kind: "dictate",
            id: "bass",
            prompt: "Write the bass's rhythm on the eighth grid (one bar).",
            steps: 8,
            bars: 1,
            answer: bass,
            stepName: "eighth",
          },
        ],
      };
    }
    case "clave-son":
    case "clave-rumba": {
      const c: ClaveSpec =
        item === "clave-son" ? { type: "son", direction: "2-3" } : { type: "rumba", direction: "3-2" };
      const steps = claveSteps(c.type as ClaveType, c.direction as ClaveDirection);
      return {
        ...base,
        bpm: 96,
        meter: "4/4",
        grouping: null,
        bars: 2,
        feel: "straight",
        clave: c,
        stimulus: code([
          `clave: s("${barsMini(steps, 8, 2, "rim")}").gain(.9)`,
          `bass: note("<[~ ~ ~ c2 ~ ~ g1 ~] [~ ~ ~ f1 ~ ~ g1 ~]>").s("upright").gain(.7)`,
          `hats: s("hh*8").gain(.25)`,
        ]),
        preload: ["rim", "upright", "hh"],
        tasks: [
          {
            kind: "identify",
            id: "clave",
            prompt: "Which clave is it, and which way does it face?",
            options: CLAVE_OPTIONS,
            answer: `${c.type} ${c.direction}`,
          },
          {
            kind: "dictate",
            id: "clave-grid",
            prompt: "Write the clave on the two-bar eighth grid.",
            steps: 8,
            bars: 2,
            answer: steps,
            stepName: "eighth",
          },
        ],
      };
    }
    case "bell-5-8": {
      const bell = onsetsOf(euclid(5, 8, 1));
      return {
        ...base,
        bpm: 104,
        meter: "4/4",
        grouping: null,
        bars: 2,
        feel: "straight",
        clave: null,
        stimulus: code([
          `bell: s("${mini(bell, 8, "cb")}").gain(.6)`,
          `kick: s("bd ~ ~ ~ bd ~ ~ ~")`,
          `hats: s("~ hh ~ hh ~ hh ~ hh").gain(.3)`,
        ]),
        preload: ["cb", "bd", "hh"],
        tasks: [
          {
            kind: "identify",
            id: "euclid",
            prompt: "The bell spreads its hits as evenly as it can. How many in eight?",
            options: [
              { id: "3", label: "3 in 8" },
              { id: "5", label: "5 in 8" },
              { id: "7", label: "7 in 8" },
            ],
            answer: "5",
          },
          {
            kind: "dictate",
            id: "bell",
            prompt: "Write the bell on the eighth grid (it does not start on the one).",
            steps: 8,
            bars: 1,
            answer: bell,
            stepName: "eighth",
          },
        ],
      };
    }
  }
}

function code(lines: readonly string[]): StimulusCode {
  const tracks = lines.map((l) => `${REF_PREFIX}${l.slice(0, l.indexOf(":"))}`);
  return { code: lines.map((l) => `${REF_PREFIX}${l}`).join("\n"), tracks };
}

/** The item an id names (`jazz:blues:F`, `rhythm:clave-son`), or `null`. */
export function gymItemOf(id: string): GymItem | null {
  const [kind, a, b] = id.split(":");
  if (kind === "jazz" && a && b && a in JAZZ_FORMS && jazzTonics(a as JazzForm).includes(b))
    return jazzItem(a as JazzForm, b);
  if (kind === "rhythm" && a && a in RHYTHM_ITEMS) return rhythmItem(a as RhythmItem);
  return null;
}

/** Bars a second at the item's tempo (the pattern player's cps): one cycle is one bar. */
export function itemCps(item: GymItem): number {
  const units = item.meter === "7/8" ? 7 : 4;
  return item.bpm / units / 60;
}

export { claveText };
