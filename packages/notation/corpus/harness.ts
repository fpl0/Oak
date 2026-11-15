// Test harness for the golden corpus: evaluates a Strudel pattern headlessly (Strudel 1.2.6 through
// @oak/grader/testing), turns the haps into NEvents the way the grader normalizes them, notates them and
// checks the ABC with abcjs.parseOnly (no DOM). Used only by tests.
import type { KeySpec, MeterId, NEvent, PickupSpec, Rat, SwingSpec } from "@oak/content-kit";
import { parseRat, R } from "@oak/content-kit";
import { evalHeadless } from "@oak/grader/testing";
import { METERS, meterWith } from "@oak/theory";
import translateChordJs from "abcjs/src/write/creation/translate-chord.js";

const translateChord = translateChordJs;

import {
  type AbcOptions,
  type AnnotationSet,
  compingInput,
  type HarmonyLabelInput,
  harmonyLabels,
  keyChangesOf,
  type ModalSignatureStyle,
  type NotationInput,
  type NotationWarning,
  notate,
  type ScoreRhythm,
  type StaffKind,
  staffHostInput,
  type TrackSwingInput,
  withIds,
} from "../src/index.ts";

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
  romans?: NotationInput["romans"];
  keyChanges?: NotationInput["keyChanges"];
  trackKeys?: NotationInput["trackKeys"];
  startBar?: number;
  endsPiece?: boolean;
  /** Abc options (bars per line, bar numbers). */
  abcOptions?: AbcOptions;
  labels?: NotationInput["labels"];
  annotations?: AnnotationSet;
  trackClefs?: NotationInput["trackClefs"];
  splitMidi?: number;
  /**
   * Simulates the grader's `_oakChord` shim: the chord symbol of each cycle; a list splits the cycle into equal
   * parts (`["Ab", "Bb"]`: two chords in the bar).
   */
  chordByBar?: (string | string[])[];
  /** Tracks the chord symbols belong to (default: every pitched track). */
  chordTracks?: string[];
  /** Only these tracks are notated (a lead sheet's melody; `leadSheetInput` takes the melody's events only). */
  tracks?: string[];
  tempoBpm?: number;
  /** Wave 5: section marks (`sectionMarks`) and blue-note spelling. */
  sections?: NotationInput["sections"];
  blues?: boolean;
  // --- Wave 6 -------------------------------------------------------------------------------------------------
  /** The grid the lesson declares, in steps per bar (`NotationInput.grid`). */
  grid?: number;
  /**
   * Engrave as a staff host does (d5, `staffHostInput`): altered scale steps take the name the code wrote, and a
   * measured swing (`hostSwing`, the shape of the grader's `swingView`) is printed straight under "Swing 8ths".
   */
  host?: boolean;
  hostSwing?: TrackSwingInput[];
  /** Chords with their numerals as the grader's `chromaticHarmonyView` lists them (1-based bars): `harmonyLabels`. */
  harmony?: HarmonyLabelInput[];
  /** A key plan (1-based bars; content-kit `KeyPlanEntry`): `keyChangesOf`, with the modal signature style. */
  keyPlan?: { bar: number; key: KeySpec }[];
  modal?: ModalSignatureStyle;
  // --- Wave 7 -------------------------------------------------------------------------------------------------
  /** Chord symbols in jazz glyphs (`NotationInput.chordStyle`). */
  chordStyle?: NotationInput["chordStyle"];
  /** Engrave this track's attacks as slash comping (`compingInput`) under `chords`. */
  comping?: string;
  showGrouping?: boolean;
  brackets?: NotationInput["brackets"];
  polyTuplets?: NotationInput["polyTuplets"];
  cycleAccents?: NotationInput["cycleAccents"];
  ghosts?: boolean;
  trackVoices?: boolean;
  /** False: read back and checked, but no snapshot (an answer key another author still edits). */
  snapshot?: boolean;
  /** Golden facts: the note list of each (staff, voice), bars joined by " | ". */
  expect: {
    /** Wave 7: the texts abcjs parsed above the top staff (bracket texts), in order. */
    above?: string[];
    /** Wave 7: how many elements carry an accent. */
    accents?: number;
    /** Wave 7: `ghostMarks` as "drum@onset". */
    ghosts?: string[];
    /** Wave 7: the time signature as written (`M:` line). */
    meter?: string;
    /** Wave 6: what `scoreRhythm` must report (the fields given). */
    rhythm?: Partial<ScoreRhythm>;
    /** Wave 6: the key signatures written inside the tune, in order of first appearance per change (`[K:…]`). */
    keyMarks?: string[];
    /** Wave 6: `drawnLabels` of the top staff's first voice in time order: "F#4=♯4/fi". */
    drawn?: string[];
    /** Wave 6: `guideToneMarks` in time order: "F4=third/Dm7". */
    guide?: string[];
    voices?: Record<string, string>;
    key?: KeySpec | null;
    approximate?: boolean;
    warnings?: NotationWarning["code"][];
    /** Substrings the ABC must contain. */
    abc?: string[];
    staves?: string[];
    /** Chord symbols as abcjs draws them (what the learner sees: its chord translation applied). */
    chordTexts?: string[];
    /** Roman numerals as abcjs parses them (annotations below the staff). */
    romanTexts?: string[];
    /** Bar numbers abcjs prints at the start of each system after the first (`%%barnumbers 0`). */
    barNumbers?: number[];
    /** Wave 5: the section labels abcjs parsed (part titles), in order. */
    parts?: string[];
    /** Wave 5: spelled pitch names of the top staff's first voice in time order, one per head ("Eb4"). */
    names?: string[];
  };
}

/** The grader's effective gain (`NEvent.gain`): (gain ?? 0.8) · (velocity ?? 1) · (postgain ?? 1). */
function effectiveGain(v: Record<string, unknown>): number {
  const n = (x: unknown, d: number) => (typeof x === "number" && Number.isFinite(x) ? x : d);
  return n(v.gain, 0.8) * n(v.velocity, 1) * n(v.postgain, 1);
}

export async function eventsOf(
  e: Pick<CorpusEntry, "code" | "bars" | "chordByBar" | "chordTracks" | "tracks" | "startBar">,
): Promise<NEvent[]> {
  const r = await evalHeadless(e.code, (e.startBar ?? 0) + e.bars);
  const haps = e.tracks ? r.events.filter((h) => e.tracks?.includes(h.track)) : r.events;
  const raw = haps.map((h): Omit<NEvent, "id"> => {
    const onset = parseRat(h.begin);
    const dur = R.sub(parseRat(h.end), onset);
    const note = h.note;
    const isN = h.scale !== null;
    const inBar = e.chordByBar?.[R.floor(onset)];
    const part = Array.isArray(inBar)
      ? inBar[Math.min(inBar.length - 1, Math.floor(R.toNum(R.frac(onset)) * inBar.length + 1e-9))]
      : inBar;
    const chordSymbol = !e.chordTracks || e.chordTracks.includes(h.track) ? part : undefined;
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
      gain: effectiveGain(h.value),
      ...(h.scale ? { scaleCtx: h.scale } : {}),
      locs: h.locations.map((l) => ({ from: l.start, to: l.end })),
    };
  });
  return withIds(raw);
}

export function inputOf(e: CorpusEntry, events: NEvent[]): NotationInput {
  const base = baseInputOf(e, events);
  const plan = e.keyPlan
    ? keyChangesOf(e.keyPlan, {
        ...(e.pickup ? { pickup: true } : {}),
        ...(e.modal ? { modal: e.modal } : {}),
      })
    : {};
  const labels = e.harmony ? harmonyLabels(e.harmony, e.pickup ? { pickup: true } : {}) : {};
  const comp = e.comping
    ? compingInput(events, {
        track: e.comping,
        meter: base.meter,
        bars: e.bars,
        ...(e.startBar !== undefined ? { startBar: e.startBar } : {}),
        ...(e.chords ? { chords: e.chords } : {}),
      })
    : null;
  const input: NotationInput = {
    ...base,
    ...plan,
    ...labels,
    ...(e.grid !== undefined ? { grid: e.grid } : {}),
    ...(comp ? { events: comp.events, staff: comp.staff, slashes: comp.slashes ?? false } : {}),
  };
  return e.host
    ? staffHostInput(input, { code: e.code, ...(e.hostSwing ? { swing: e.hostSwing } : {}) })
    : input;
}
function baseInputOf(e: CorpusEntry, events: NEvent[]): NotationInput {
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
    ...(e.annotations ? { annotations: e.annotations } : {}),
    ...(e.trackClefs ? { trackClefs: e.trackClefs } : {}),
    ...(e.splitMidi !== undefined ? { splitMidi: e.splitMidi } : {}),
    ...(e.tempoBpm ? { tempoBpm: e.tempoBpm } : {}),
    ...(e.romans ? { romans: e.romans } : {}),
    ...(e.keyChanges ? { keyChanges: e.keyChanges } : {}),
    ...(e.trackKeys ? { trackKeys: e.trackKeys } : {}),
    ...(e.startBar !== undefined ? { startBar: e.startBar } : {}),
    ...(e.endsPiece !== undefined ? { endsPiece: e.endsPiece } : {}),
    ...(e.sections ? { sections: e.sections } : {}),
    ...(e.blues !== undefined ? { blues: e.blues } : {}),
    ...(e.chordStyle ? { chordStyle: e.chordStyle } : {}),
    ...(e.showGrouping ? { showGrouping: true } : {}),
    ...(e.brackets ? { brackets: e.brackets } : {}),
    ...(e.polyTuplets ? { polyTuplets: e.polyTuplets } : {}),
    ...(e.cycleAccents ? { cycleAccents: e.cycleAccents } : {}),
    ...(e.ghosts ? { ghosts: true } : {}),
    ...(e.trackVoices ? { trackVoices: true } : {}),
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
  /**
   * Every chord symbol (`default`) and annotation below (`below`) abcjs parsed, with its staff, voice and onset in
   * whole notes from the start of the tune (tuplets applied).
   */
  labels: { si: number; vi: number; onset: number; text: string; position: string }[];
  /** The bar numbers abcjs will print at the start of each system (`staff.barNumber`, staff 0). */
  barNumbers: number[];
  /** Part labels (sections) abcjs parsed, with the staff and voice they stand in, in order. */
  parts: { si: number; vi: number; title: string }[];
  /** Every barline abcjs parsed on staff 0 voice 0, by type (`bar_thin`, `bar_thin_thin`, `bar_thin_thick`). */
  barTypes: string[];
  /** Wave 7: per staff, per voice: the notehead style of each note element ("rhythm" for a slash, "" otherwise). */
  styles: string[][][];
  /** Wave 7: per staff, per voice: whether each note element carries an accent. */
  accents: boolean[][][];
  /** Wave 7: the time signature abcjs parsed (`2+2+3/8`). */
  meter: string;
}
/** Parses with abcjs (headless) and returns what the renderer will see. */
export function checkAbc(abc: string): AbcCheck {
  const tune = abcjs.parseOnly(abc)[0];
  const barTotals: number[][][] = [];
  const classes: string[][][] = [];
  const lyrics: (string | null)[] = [];
  const chordTexts: string[] = [];
  const labels: AbcCheck["labels"] = [];
  const barNumbers: number[] = [];
  const parts: AbcCheck["parts"] = [];
  const barTypes: string[] = [];
  const styles: string[][][] = [];
  const accents: boolean[][][] = [];
  const clock: number[][] = [];
  for (const line of tune.lines) {
    const n0 = line.staff?.[0]?.barNumber;
    if (typeof n0 === "number") barNumbers.push(n0);
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
        const stStaff = styles[si] ?? [];
        styles[si] = stStaff;
        const acStaff = accents[si] ?? [];
        accents[si] = acStaff;
        const st = stStaff[vi] ?? [];
        stStaff[vi] = st;
        const ac = acStaff[vi] ?? [];
        acStaff[vi] = ac;
        let total = 0;
        let mult = 1;
        let left = 0;
        clock[si] ??= [];
        let t = clock[si]?.[vi] ?? 0;
        // biome-ignore lint/suspicious/noExplicitAny: abcjs element
        for (const el of voice as any[]) {
          if (el.el_type === "part") parts.push({ si, vi, title: el.title });
          if (el.el_type === "bar") {
            if (si === 0 && vi === 0) barTypes.push(el.type);
            totals.push(Math.round(total * 1e9) / 1e9);
            total = 0;
          } else if (el.el_type === "note") {
            if (el.startTriplet) {
              mult = el.tripletMultiplier;
              left = el.tripletR;
            }
            const d = el.duration * (left > 0 ? mult : 1);
            total += d;
            if (left > 0) left--;
            if (!el.rest) {
              cls.push(el.extraClass ?? "");
              st.push(el.style ?? "");
              ac.push((el.decoration ?? []).includes("accent"));
            }
            if (si === 0 && vi === 0 && !el.rest)
              lyrics.push(el.lyric?.map((l: { syllable: string }) => l.syllable).join("") ?? null);
            for (const c of el.chord ?? []) {
              // What abcjs draws: its own chord translation (it cuts a "/" that starts no bass note), the
              // division slash Oak writes for one (`abcChordText`) read back as the slash it looks like.
              const drawn =
                c.position === "default" ? translateChord(c.name, false, false).replace(/∕/g, "/") : c.name;
              if (c.position === "default") chordTexts.push(drawn);
              if (c.position === "default" || c.position === "below" || c.position === "above")
                labels.push({ si, vi, onset: Math.round(t * 1e9) / 1e9, text: drawn, position: c.position });
            }
            t += d;
          }
        }
        (clock[si] as number[])[vi] = t;
      });
    });
  }
  const m0 = tune.lines[0]?.staff?.[0]?.meter?.value?.[0];
  return {
    styles,
    accents,
    meter: m0 ? `${m0.num}/${m0.den}` : "",
    warnings: tune.warnings ?? [],
    barTotals,
    classes,
    lyrics,
    chordTexts,
    labels,
    barNumbers,
    parts,
    barTypes,
  };
}

const LETTERS = "CDEFGAB";
const NATURAL = [0, 2, 4, 5, 7, 9, 11];
const ALT: Record<string, number> = { sharp: 1, flat: -1, natural: 0, dblsharp: 2, dblflat: -2 };

/** One sounding note (or chord, or drum stroke) read back from the ABC: times in whole notes from the start. */
export interface ReadNote {
  onset: number;
  dur: number;
  /** MIDI numbers low to high (pitched staves); empty on a percussion staff. */
  midis: number[];
  /** Heads of the element (percussion: one per drum). */
  heads: number;
}
/**
 * Reads an ABC tune back into sounding notes, independently of the emitter: abcjs.parseOnly gives the
 * elements; the ABC rules are applied here (the key signature holds in every octave, an accidental holds
 * for the rest of its bar in its octave, a tie continues the pitch it comes from, tuplets scale lengths),
 * and tie chains become one note. Per staff (index in the tune) and voice.
 */
export function readBack(abc: string): { staves: { perc: boolean; voices: ReadNote[][] }[] } {
  const tune = abcjs.parseOnly(abc)[0];
  const staves: { perc: boolean; voices: ReadNote[][] }[] = [];
  const time: number[][] = [];
  const open: Map<string, { note: ReadNote; midi: number }>[][] = [];
  for (const line of tune.lines) {
    // biome-ignore lint/suspicious/noExplicitAny: abcjs parse tree
    (line.staff ?? []).forEach((staff: any, si: number) => {
      const st = staves[si] ?? { perc: staff.clef?.type === "perc", voices: [] };
      staves[si] = st;
      const sig0: Record<string, number> = {};
      for (const a of staff.key?.accidentals ?? []) sig0[String(a.note).toUpperCase()] = ALT[a.acc] ?? 0;
      // biome-ignore lint/suspicious/noExplicitAny: abcjs element
      staff.voices.forEach((voice: any[], vi: number) => {
        // An inline key change (`[K:G]`) replaces the signature from where it stands.
        let sig: Record<string, number> = { ...sig0 };
        const notes = st.voices[vi] ?? [];
        st.voices[vi] = notes;
        time[si] ??= [];
        open[si] ??= [];
        let t = time[si]?.[vi] ?? 0;
        const ties = open[si]?.[vi] ?? new Map<string, { note: ReadNote; midi: number }>();
        (open[si] as Map<string, { note: ReadNote; midi: number }>[])[vi] = ties;
        let bar = new Map<string, number>();
        let mult = 1;
        let left = 0;
        for (const el of voice) {
          if (el.el_type === "bar") {
            bar = new Map();
            continue;
          }
          if (el.el_type === "key") {
            // The new signature governs from here, also inside a bar (Oak restates any letter an earlier
            // accidental of the bar altered, so either reading of a mid-bar change gives the same pitches).
            sig = {};
            for (const a of el.accidentals ?? []) sig[String(a.note).toUpperCase()] = ALT[a.acc] ?? 0;
            bar = new Map();
            continue;
          }
          if (el.el_type !== "note") continue;
          if (el.startTriplet) {
            mult = el.tripletMultiplier;
            left = el.tripletR;
          }
          const dur = el.duration * (left > 0 ? mult : 1);
          if (left > 0) left--;
          if (el.rest) {
            t += dur;
            continue;
          }
          const pitches: { midi: number; step: string; tieIn: boolean; tieOut: boolean }[] = (
            el.pitches ?? []
          ).map((p: { pitch: number; accidental?: string; endTie?: boolean; startTie?: unknown }) => {
            const letter = LETTERS[((p.pitch % 7) + 7) % 7] as string;
            const oct = 4 + Math.floor(p.pitch / 7);
            const step = `${letter}${oct}`;
            let alt: number;
            const from = p.endTie ? ties.get(step) : undefined;
            if (p.accidental) {
              alt = ALT[p.accidental] ?? 0;
              bar.set(step, alt);
            } else alt = bar.get(step) ?? sig[letter] ?? 0;
            // A tie continues the pitch it comes from (its accidental is not restated over the bar line).
            const midi =
              from && !p.accidental
                ? from.midi
                : (oct + 1) * 12 + (NATURAL[LETTERS.indexOf(letter)] as number) + alt;
            return { midi, step, tieIn: !!p.endTie, tieOut: !!p.startTie };
          });
          const midis = st.perc ? [] : pitches.map((p) => p.midi).sort((a, b) => a - b);
          const prev = pitches.every((p) => p.tieIn) ? ties.get(pitches[0]?.step ?? "")?.note : undefined;
          let note: ReadNote;
          if (prev && Math.abs(prev.onset + prev.dur - t) < 1e-9) {
            prev.dur += dur;
            note = prev;
          } else {
            note = { onset: t, dur, midis, heads: pitches.length };
            notes.push(note);
          }
          for (const p of pitches) {
            if (p.tieOut) ties.set(p.step, { note, midi: p.midi });
            else ties.delete(p.step);
          }
          t += dur;
        }
        (time[si] as number[])[vi] = t;
      });
    });
  }
  return { staves };
}

export async function runEntry(e: CorpusEntry) {
  const events = await eventsOf(e);
  const input = inputOf(e, events);
  const { score, abc } = notate(input, e.abcOptions);
  return { events, input, score, abc, check: checkAbc(abc.abc) };
}

export const W = (meter: MeterId): Rat => [METERS[meter].num, METERS[meter].den];
