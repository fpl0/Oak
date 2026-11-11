// Example patterns for the /dev/workbench playground and the workbench tests, written in Oak's dialect
// (content/STYLE.md): a tempo line that shows the BPM, one labelled line per track, `n` + `.scale()` for
// degrees, canonical chord spellings.
import type { KeySpec, MeterId } from "@oak/content-kit";

export interface PlaygroundExample {
  id: string;
  title: string;
  code: string;
  key: KeySpec | null;
  meter: MeterId;
  bars: number;
  /** A target to compare against with A/B (played as hidden code). */
  target?: string;
}

/** The full 4-track loop: drums, chords, bass and melody over a ii–V–I–V/ii turnaround in C major. */
export const FULL_LOOP = `setcpm(92/4)

drums: s("bd [~ hh] sd [~ hh]")
chords: chord("<Dm7 G7 C^7 A7>").dict("lefthand").voicing().s("triangle").gain(.4)
bass: chord("<Dm7 G7 C^7 A7>").rootNotes(2).s("sawtooth").lpf(700).gain(.6)
mel: n("<[1 3 5 3] [4 3 ~ 1] [0 2 4 6] [4 ~ ~ ~]>").scale("C4:major").s("triangle")`;

/** 64 bars of 8 melody notes (an 8-bar degree walk) over a 7-bar bass cycle and a one-bar beat: dense and uneven. */
export const LONG_64 = `setcpm(240/4)

drums: s("bd hh sd hh")
bass: n("<${Array.from({ length: 64 }, (_, i) => (i * 3) % 7).join(" ")}>").scale("C2:major").s("sawtooth").lpf(600)
mel: n("<${Array.from(
  { length: 64 },
  (_, i) => `[${Array.from({ length: 8 }, (_, j) => (i + j * 2) % 8).join(" ")}]`,
).join(" ")}>").scale("C4:major").s("triangle")`;

export const PLAYGROUND_EXAMPLES: readonly PlaygroundExample[] = [
  {
    id: "full-loop",
    title: "Full 4-track loop (C major)",
    code: FULL_LOOP,
    key: { tonic: "C", mode: "major" },
    meter: "4/4",
    bars: 4,
    target: FULL_LOOP.replace("[4 ~ ~ ~]", "[4 3 1 ~]"),
  },
  {
    id: "degrees-d",
    title: "Degrees in D major",
    code: `setcpm(80/4)

mel: n("0 2 4 2 0 4 7 ~").scale("D4:major").s("triangle")`,
    key: { tonic: "D", mode: "major" },
    meter: "4/4",
    bars: 1,
    target: `setcpm(80/4)

mel: n("0 2 4 2 0 4 2 ~").scale("D4:major").s("triangle")`,
  },
  {
    id: "minor-line",
    title: "A minor line (♭3, ♭6, ♭7)",
    code: `setcpm(84/4)

mel: n("0 1 2 3 4 5 6 7").scale("A3:minor").s("triangle")`,
    key: { tonic: "A", mode: "minor" },
    meter: "4/4",
    bars: 1,
  },
  {
    id: "beat",
    title: "Drum lanes",
    code: `setcpm(96/4)

kick: s("bd ~ bd ~")
snare: s("~ sd ~ sd")
hats: s("hh*8").gain(.6)`,
    key: null,
    meter: "4/4",
    bars: 1,
  },
  {
    id: "waltz",
    title: "Waltz in 3/4",
    code: `setcpm(120/3)

mel: note("<[c4 e4 g4] [f4 a4 c5] [g4 b4 d5] [c5 ~ ~]>").s("triangle")
bass: note("<c3 f2 g2 c3>").s("sawtooth").lpf(600)`,
    key: { tonic: "C", mode: "major" },
    meter: "3/4",
    bars: 4,
  },
  {
    id: "jig",
    title: "Compound 6/8",
    code: `setcpm(66/2)

mel: n("0 2 4 5 4 2").scale("G4:major").s("triangle")`,
    key: { tonic: "G", mode: "major" },
    meter: "6/8",
    bars: 1,
  },
  {
    // The long-form stress case (64 bars, 8 melody notes a bar over drums and a bass): the roll, the staff
    // and the highlight clock must stay smooth and in sync (e2e/runtime-review.pw.ts).
    id: "long-64",
    title: "64 bars (stress)",
    code: LONG_64,
    key: { tonic: "C", mode: "major" },
    meter: "4/4",
    bars: 64,
  },
];
