// The jazz track's standards, engraved from content/repertoire's own answer keys (author:repertoire writes them from
// prints of 1930 or earlier; `verified` stays false until a person checks print): each melody as a lead sheet with
// its chords, its section letters four bars a line, its key plan and its swing. An answer key that does not exist yet
// is reported as a todo by corpus.test.ts, never faked. These entries are read back from the ABC exactly as the
// golden corpus is (pitches and durations against the input), but carry no snapshot: the keys belong to another
// author and may still change.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { KeySpec, MeterId, PickupSpec, SwingSpec } from "@oak/content-kit";
import { formSectionMarks } from "../src/wave7.ts";
import type { CorpusEntry } from "./harness.ts";

/** The standards the advanced tracks read (J4.L03–L04, JC3, JC4, AC1), by repertoire folder. */
export const JAZZ_STANDARDS = [
  "i-got-rhythm",
  "georgia-on-my-mind",
  "body-and-soul",
  "sweet-georgia-brown",
  "st-louis-blues",
] as const;

interface SongShape {
  id: string;
  title: string;
  key: KeySpec;
  meter: MeterId;
  pickup?: PickupSpec;
  swing?: SwingSpec;
  keyPlan?: { bar: number; key: KeySpec }[];
  answerKey: {
    bars: number;
    code: string;
    chords?: { bar: number; beat: number; symbol: string }[];
    sections?: { label: string; bars: [number, number] }[];
  };
}

const songFile = (slug: string) =>
  fileURLToPath(new URL(`../../../content/repertoire/${slug}/song.ts`, import.meta.url));

/** Corpus entries for the standards whose answer key exists; the others by name, as todos. */
export async function standardEntries(): Promise<{ entries: CorpusEntry[]; missing: string[] }> {
  const entries: CorpusEntry[] = [];
  const missing: string[] = [];
  for (const slug of JAZZ_STANDARDS) {
    const file = songFile(slug);
    if (!existsSync(file)) {
      missing.push(slug);
      continue;
    }
    const song = ((await import(file)) as { default: SongShape }).default;
    const off = song.pickup ? 0 : 1;
    const sections = song.answerKey.sections ?? [];
    entries.push({
      name: `standard ${song.title} (${song.id}): the head as a lead sheet, four bars a line`,
      code: song.answerKey.code,
      bars: song.answerKey.bars + (song.pickup ? 1 : 0),
      meter: song.meter,
      key: song.key,
      staff: "lead",
      tracks: ["mel"],
      chordStyle: "jazz",
      ...(song.pickup ? { pickup: song.pickup } : {}),
      ...(song.swing ? { swing: song.swing } : {}),
      ...(song.keyPlan ? { keyPlan: song.keyPlan } : {}),
      ...(song.answerKey.chords
        ? { chords: song.answerKey.chords.map((c) => ({ bar: c.bar - off, beat: c.beat, symbol: c.symbol })) }
        : {}),
      ...(sections.length
        ? {
            sections: formSectionMarks(
              sections.map((s) => s.label),
              sections.map((s) => s.bars[1] - s.bars[0] + 1),
              (sections[0]?.bars[0] ?? 1) - off,
            ),
          }
        : {}),
      abcOptions: { barsPerLine: 4 },
      snapshot: false,
      expect: { ...(sections.length ? { parts: sections.map((s) => s.label) } : {}) },
    });
  }
  return { entries, missing };
}
