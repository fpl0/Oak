// Test harness for the golden corpus: evaluates a Strudel pattern headlessly (Strudel 1.2.6 through
// @oak/grader/testing), turns the haps into NEvents the way the grader normalizes them, notates them and
// checks the ABC with abcjs.parseOnly (no DOM). Used only by tests.
import type { KeySpec, MeterId, NEvent, PickupSpec, Rat, SwingSpec } from "@oak/content-kit";
import { parseRat, R } from "@oak/content-kit";
import { evalHeadless } from "@oak/grader/testing";
import { METERS, meterWith } from "@oak/theory";
import { type NotationInput, type NotationWarning, notate, type StaffKind, withIds } from "../src/index.ts";

export interface CorpusEntry {
  name: string;
  code: string;
  bars: number;
  meter?: MeterId;
  grouping?: number[];
  key?: KeySpec;
  staff?: StaffKind;
  split?: "register" | "track";
  swing?: SwingSpec;
  pickup?: PickupSpec;
  chords?: NotationInput["chords"];
  labels?: NotationInput["labels"];
  /** Simulates the grader's `_oakChord` shim: the chord symbol of each cycle. */
  chordByBar?: string[];
  /** Tracks the chord symbols belong to (default: every pitched track). */
  chordTracks?: string[];
  tempoBpm?: number;
  /** Golden facts: the note list of each (staff, voice), bars joined by " | ". */
  expect: {
    voices?: Record<string, string>;
    key?: KeySpec | null;
    approximate?: boolean;
    warnings?: NotationWarning["code"][];
    /** Substrings the ABC must contain. */
    abc?: string[];
    staves?: string[];
    /** Chord symbols as abcjs parses them (what the learner sees). */
    chordTexts?: string[];
  };
}

export async function eventsOf(
  e: Pick<CorpusEntry, "code" | "bars" | "chordByBar" | "chordTracks">,
): Promise<NEvent[]> {
  const r = await evalHeadless(e.code, e.bars);
  const raw = r.events.map((h): Omit<NEvent, "id"> => {
    const onset = parseRat(h.begin);
    const dur = R.sub(parseRat(h.end), onset);
    const note = h.note;
    const isN = h.scale !== null;
    const chordSymbol =
      !e.chordTracks || e.chordTracks.includes(h.track) ? e.chordByBar?.[R.floor(onset)] : undefined;
    return {
      track: h.track,
      onset,
      dur,
      midi: h.midi,
      pitchSource:
        h.midi === null
          ? "none"
          : chordSymbol
            ? "voicing"
            : isN
              ? "n-scale"
              : typeof note === "string"
                ? "note-str"
                : "note-num",
      ...(typeof note === "string" && !isN && !chordSymbol ? { written: note } : {}),
      ...(chordSymbol && h.midi !== null ? { chordSymbol } : {}),
      ...(h.s ? { s: h.s } : {}),
      gain: 0.8,
      ...(h.scale ? { scaleCtx: h.scale } : {}),
      locs: h.locations.map((l) => ({ from: l.start, to: l.end })),
    };
  });
  return withIds(raw);
}

export function inputOf(e: CorpusEntry, events: NEvent[]): NotationInput {
  const meter = e.grouping ? meterWith(e.meter ?? "4/4", e.grouping) : METERS[e.meter ?? "4/4"];
  return {
    events,
    meter,
    key: e.key ?? null,
    bars: e.bars,
    staff: e.staff ?? "auto",
    ...(e.split ? { split: e.split } : {}),
    ...(e.swing ? { swing: e.swing } : {}),
    ...(e.pickup ? { pickup: e.pickup } : {}),
    ...(e.chords ? { chords: e.chords } : {}),
    ...(e.labels ? { labels: e.labels } : {}),
    ...(e.tempoBpm ? { tempoBpm: e.tempoBpm } : {}),
  };
}

// biome-ignore lint/suspicious/noExplicitAny: abcjs is CommonJS; its parse tree is untyped here
const abcjsMod: any = await import("abcjs");
const abcjs = abcjsMod.default ?? abcjsMod;

export interface AbcCheck {
  warnings: string[];
  /** Per staff, per voice: sounding length of each bar in whole notes (tuplets applied). */
  barTotals: number[][][];
  /** Per staff, per voice: the class value of each note element (rests excluded). */
  classes: string[][][];
  /** Lyrics per note element of staff 0 voice 0. */
  lyrics: (string | null)[];
  chordTexts: string[];
}
/** Parses with abcjs (headless) and returns what the renderer will see. */
export function checkAbc(abc: string): AbcCheck {
  const tune = abcjs.parseOnly(abc)[0];
  const barTotals: number[][][] = [];
  const classes: string[][][] = [];
  const lyrics: (string | null)[] = [];
  const chordTexts: string[] = [];
  for (const line of tune.lines) {
    (line.staff ?? []).forEach((staff: { voices: unknown[][] }, si: number) => {
      staff.voices.forEach((voice, vi) => {
        const staffTotals = barTotals[si] ?? [];
        const staffClasses = classes[si] ?? [];
        barTotals[si] = staffTotals;
        classes[si] = staffClasses;
        const totals = staffTotals[vi] ?? [];
        const cls = staffClasses[vi] ?? [];
        staffTotals[vi] = totals;
        staffClasses[vi] = cls;
        let total = 0;
        let mult = 1;
        let left = 0;
        // biome-ignore lint/suspicious/noExplicitAny: abcjs element
        for (const el of voice as any[]) {
          if (el.el_type === "bar") {
            totals.push(Math.round(total * 1e9) / 1e9);
            total = 0;
          } else if (el.el_type === "note") {
            if (el.startTriplet) {
              mult = el.tripletMultiplier;
              left = el.tripletR;
            }
            total += el.duration * (left > 0 ? mult : 1);
            if (left > 0) left--;
            if (!el.rest) cls.push(el.extraClass ?? "");
            if (si === 0 && vi === 0 && !el.rest)
              lyrics.push(el.lyric?.map((l: { syllable: string }) => l.syllable).join("") ?? null);
            for (const c of el.chord ?? []) if (c.position === "default") chordTexts.push(c.name);
          }
        }
      });
    });
  }
  return { warnings: tune.warnings ?? [], barTotals, classes, lyrics, chordTexts };
}

export async function runEntry(e: CorpusEntry) {
  const events = await eventsOf(e);
  const input = inputOf(e, events);
  const { score, abc } = notate(input);
  return { events, input, score, abc, check: checkAbc(abc.abc) };
}

export const W = (meter: MeterId): Rat => [METERS[meter].num, METERS[meter].den];
