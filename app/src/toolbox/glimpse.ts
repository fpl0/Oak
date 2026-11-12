// What a feature looks like at its unlock moment (Wave 3, ux §5.1 "the unlock ceremony shows the tool working"):
// the degree labels and the solfège lines under the first bars of their own toolbox demos, the key-signature
// panel in the keysig demo's key, the circle lit with the keys the circle demo visits. Pure data plus the ABC;
// glimpse.test.ts checks every phrase against the demo played by headless Strudel.
import type { KeySpec } from "@oak/content-kit";
import { buildScore, parseNoteList } from "@oak/notation";
import { METERS } from "@oak/theory";
import { type AnnotationKinds, annotateAbc, annotationText } from "../workbench/annotate.ts";
import { pitchLabel } from "../workbench/music.ts";

export type Glimpse =
  | { kind: "staff"; key: KeySpec; notes: string; bars: number; lines: AnnotationKinds; caption: string }
  | { kind: "key-panel"; key: KeySpec; caption: string }
  | { kind: "circle"; key: KeySpec; keys: KeySpec[]; caption: string };

const C: KeySpec = { tonic: "C", mode: "major" };

/** The features whose unlock moment and tool page show them at work. */
export const GLIMPSES: Readonly<Record<string, Glimpse>> = {
  // n("<[0 2 4 2] [3 1 0 ~]>").scale("C4:major")
  "tb.feature.degree-labels": {
    kind: "staff",
    key: C,
    notes: "C4:4 E4:4 G4:4 E4:4 | F4:4 D4:4 C4:4 r:4",
    bars: 2,
    lines: { degree: true, solfege: false, noteName: false },
    caption: "Every note numbered by its degree: 1 is home.",
  },
  // n("<[0 1 2 [3 2]] [4 2 0 ~]>").scale("C4:major")
  "tb.feature.solfege": {
    kind: "staff",
    key: C,
    notes: "C4:4 D4:4 E4:4 F4:8 E4:8 | G4:4 E4:4 C4:4 r:4",
    bars: 2,
    lines: { degree: true, solfege: true, noteName: false },
    caption: "Do is home in every key: the syllables move with the tune.",
  },
  // n("<[0 2 4 6] [7 [6 4] 5 ~]>").scale("D4:major")
  "tb.feature.keysig": {
    kind: "key-panel",
    key: { tonic: "D", mode: "major" },
    caption: "D major's two sharps, written once at the start of the line.",
  },
  // n("0 2 4 2").scale("<C4:major F4:major Bb3:major Eb4:major>")
  "tb.feature.circle": {
    kind: "circle",
    key: C,
    keys: [C, { tonic: "F", mode: "major" }, { tonic: "Bb", mode: "major" }, { tonic: "Eb", mode: "major" }],
    caption: "C, F, B♭, E♭: each step anticlockwise adds a flat.",
  },
};

export function glimpseOf(toolId: string): Glimpse | null {
  return GLIMPSES[toolId] ?? null;
}

/** The ABC of a staff glimpse (its notes in its key, its lines under them) and each note's base degree. */
export function glimpseStaff(g: Extract<Glimpse, { kind: "staff" }>): {
  abc: string;
  heads: { n: number; degrees: number[] }[];
} {
  const events = parseNoteList(g.notes, { meter: METERS["4/4"] });
  const score = buildScore({ events, meter: METERS["4/4"], key: g.key, bars: g.bars, staff: "treble" });
  const midiOf = new Map(events.map((e) => [e.id, e.midi] as const));
  const labelOf = (id: string) => {
    const m = midiOf.get(id);
    return m === null || m === undefined ? null : pitchLabel(m, g.key);
  };
  const out = annotateAbc(score, { barsPerLine: 4 }, g.lines, (_n, ids) =>
    annotationText(ids.map(labelOf), g.lines),
  );
  return {
    abc: out.abc,
    heads: out.idMap.map((e) => ({
      n: e.n,
      degrees: e.eventIds.map((id) => labelOf(id)?.degree?.num ?? 0).filter((d) => d > 0),
    })),
  };
}

/** The ABC of a staff glimpse. */
export function glimpseAbc(g: Extract<Glimpse, { kind: "staff" }>): string {
  return glimpseStaff(g).abc;
}
