// Stage E ear training in the drill runner (contracts §7.3; docs/design/wave5.md §11), pure and unit-tested:
// the words of the new families (major or minor, which minor, which mode, scale colours, straight or swung, locked
// with the kick), the form widget for "label the sections", the twelve bars (the chart, the bar that is playing),
// bass-line dictation (the roots of a bass-degree trial written as code or on the bass staff, graded octave-free),
// and what the learner can hear after every answer: the thing alone, and the thing in context (a section, a bar,
// the hats, the bass with the kick, the scale, the other feel, the chord without its seventh). Music comes from
// the trial's own events and @oak/theory, never from a local table; minor is do-based (1 is home, ♭3 ♭6 ♭7).
import type { Answer, Degree, FamilyDef, FamilyState, KeySpec, NEvent, Trial } from "@oak/api";
import {
  FEEL_OPTIONS,
  formLetters,
  MINOR_OPTIONS,
  MODE_DEGREES,
  SCALE_COLOUR_OPTIONS,
  type ScaleMode,
} from "@oak/content-kit";
import { type AudioPlan, type DrillTrialResult, eventsToAudioPlan, parseMiniCode } from "@oak/drills";
import { bluesKey, degreeSemitones, labelPitch, romanText, syllableOf } from "@oak/theory";
import { rnDisplay } from "../answers/keys.ts";
import type { AnswerSpec } from "../answers/types.ts";
import { bassDegreeOf, chordSlotsOf, isBassTrial, tonicNear } from "./harmony.ts";

const onsetOf = (e: Pick<NEvent, "onset">): number => e.onset[0] / e.onset[1];
const keyOf = (trial: Trial<unknown>): KeySpec | null => {
  const k = trial.params.key as KeySpec | undefined;
  return k && typeof k.tonic === "string" && typeof k.mode === "string" ? k : null;
};
const cueBarsOf = (trial: Trial<unknown>): number => Math.max(0, Number(trial.params.cueBars ?? 0));
const barsOf = (trial: Trial<unknown>): number => Math.max(1, Number(trial.params.bars ?? 1));
const flat = (s: string): string => s.replace(/b(?=\d)/g, "♭").replace(/#(?=\d)/g, "♯");

// --- words ---------------------------------------------------------------------------------------

const MODE_WORDS: Readonly<Record<string, string>> = {
  major: "Major",
  minor: "Minor",
  dorian: "Dorian",
  phrygian: "Phrygian",
  lydian: "Lydian",
  mixolydian: "Mixolydian",
  locrian: "Locrian",
};
const MINOR_FORM_IDS = new Set(["harmonic minor", "melodic minor", "natural minor", "harmonic", "melodic"]);
const fromChoices = (list: readonly { id: string; label: string }[]): Record<string, string> =>
  Object.fromEntries(list.map((o) => [o.id, o.label]));
const MINOR_FORM_WORDS: Readonly<Record<string, string>> = {
  ...fromChoices(MINOR_OPTIONS),
  "natural minor": fromChoices(MINOR_OPTIONS).minor as string,
  natural: fromChoices(MINOR_OPTIONS).minor as string,
  harmonic: fromChoices(MINOR_OPTIONS)["harmonic minor"] as string,
  melodic: fromChoices(MINOR_OPTIONS)["melodic minor"] as string,
};
const COLOUR_WORDS = fromChoices(SCALE_COLOUR_OPTIONS);
const FEEL_WORDS: Readonly<Record<string, string>> = {
  ...fromChoices(FEEL_OPTIONS),
  straight: "Straight",
  light: "Light swing",
  hard: "Hard swing",
};
const LOCK_WORDS: Readonly<Record<string, string>> = {
  locked: "Locked with the kick",
  independent: "Its own rhythm",
};

/** Whether a set of choice IDs asks which minor (natural, harmonic or melodic). */
export const asksWhichMinor = (ids: readonly string[]): boolean => ids.some((id) => MINOR_FORM_IDS.has(id));
/** Whether a set of choice IDs asks a scale colour (pentatonic or blues). */
export const asksColour = (ids: readonly string[]): boolean => ids.some((id) => id in COLOUR_WORDS);

/**
 * The learner's word for a choice of a stage E family, or null when the shared table names it. Family-aware: the
 * same ID means different things in different families ("mixolydian" is a mode in "Which mode?", a loop in "Name the
 * loop"; "minor" is the natural minor once harmonic and melodic are on offer).
 */
export function stageEOptionLabel(generator: string, id: string, options: readonly string[]): string | null {
  if (id in COLOUR_WORDS) return COLOUR_WORDS[id] as string;
  if (generator === "key-mode" || generator === "key-minor") {
    if (asksWhichMinor(options) && MINOR_FORM_WORDS[id]) return MINOR_FORM_WORDS[id] as string;
    if (MODE_WORDS[id]) return MODE_WORDS[id] as string;
  }
  if (generator === "rhythm-swing" || generator === "rhythm-feel") return FEEL_WORDS[id] ?? null;
  if (generator === "rhythm-groove-lock") return LOCK_WORDS[id] ?? null;
  if (generator === "form-blues" && /^(?:b?[IV]+|[iv]+)7?$/.test(id)) return rnDisplay(id);
  return null;
}

/** Category names of stage E families that are levels of material, by generator ("minor" → "roots in minor keys"). */
const CATEGORY_WORDS_BY_GENERATOR: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "harmony-bass": { minor: "roots in minor keys", chromatic: "chromatic roots" },
  "harmony-progression": { minor: "progressions in minor", chromatic: "chromatic chords" },
  "form-blues": {
    "which-chord": "which chord a bar holds",
    "iv-arrival": "where IV arrives",
    "quick-change": "the quick change",
    standard: "the standard form",
    "jazz-blues": "the jazz blues",
  },
  "form-sections": {
    AABA: "AABA",
    "verse-chorus": "verse–chorus",
    "phrase-4": "four-bar phrases",
    "phrase-8": "eight-bar phrases",
    subtle: "forms with subtle repeats",
  },
  "rhythm-groove-lock": {
    locked: "a bass locked with the kick",
    independent: "a bass with its own rhythm",
    anticipating: "the bass note before the kick",
    funk: "funk sixteenths",
  },
  "key-mode": { major: "major", minor: "minor" },
  "rhythm-swing": {
    straight: "straight",
    swung: "swing (long–short)",
    light: "light swing",
    hard: "hard swing",
  },
};

/** A level's category in plain words for a stage E family, or null when the shared table names it. */
export function stageECategoryLabel(generator: string, id: string): string | null {
  return CATEGORY_WORDS_BY_GENERATOR[generator]?.[id] ?? null;
}

/** The prompt of a stage E trial when its generator gives none (or a generic one), else null. */
export function stageEPrompt(trial: Trial<unknown>, def: Pick<FamilyDef, "generator">): string | null {
  const p = trial.params;
  const options = Array.isArray(p.options) ? (p.options as unknown[]).map(String) : [];
  const ids = options.length > 0 ? options : ((trial.expected as Answer).choice ?? []);
  if (formModeOf(trial) !== null) return "Label the sections: the same music gets the same letter.";
  switch (def.generator) {
    case "key-mode":
    case "key-minor": {
      if (asksColour(ids)) return "Which scale colour is it?";
      if (asksWhichMinor(ids)) return "Which minor: natural, harmonic or melodic?";
      const levelIds = new Set([...ids, ...((trial.expected as Answer).choice ?? [])]);
      if ([...levelIds].every((id) => id === "major" || id === "minor")) return "Major or minor?";
      return "Which mode?";
    }
    case "rhythm-swing":
    case "rhythm-feel":
      return null;
    case "degree-id": {
      const k = keyOf(trial);
      const steps = Array.isArray(p.steps) ? p.steps.length : 1;
      if (!k || !/minor/.test(k.mode) || steps > 1) return null;
      return cueBarsOf(trial) > 0
        ? "After the minor cadence: which degree was the last note?"
        : "Over the minor loop: which degree was the marked note?";
    }
    default:
      return null;
  }
}

/** "Straight or swung?" when the level offers two feels, "Straight, or how much swing?" when it offers more. */
export function swingPrompt(optionCount: number): string {
  return optionCount > 2 ? "Straight, or how much swing?" : "Straight or swung?";
}

// --- form by ear: label the sections ----------------------------------------------------------------

/** A form-by-ear trial answered on the form widget: one label per section, mapped back to the family's answer. */
export interface FormMode {
  spec: Extract<AnswerSpec, { ui: "form" }>;
  /** The expected section letters (`["A", "A", "B", "A"]`). */
  expected: string[];
  /** Letters of a form → the family's own answer ID ("ABAB" → "verse-chorus"); empty for an engine `sections` trial. */
  byLetters: ReadonlyMap<string, string>;
}

const FORM_ID_LETTERS: Readonly<Record<string, string>> = { "verse-chorus": "ABAB" };
/** A form ID as letters ("verse-chorus" → "ABAB", "AABA" stays), or null when it is not a form of sections. */
export function formIdLetters(id: string): string | null {
  if (FORM_ID_LETTERS[id]) return FORM_ID_LETTERS[id] as string;
  return /^[A-E]{2,8}$/.test(id) ? formLetters(id.split("")) : null;
}

/**
 * The form widget's view of a trial: a trial that already asks for sections (`expected.sections`, `ui: "form"`),
 * or a "which form" choice whose options are all forms of equal sections (`params.sectionBars`) — labelled section
 * by section instead of picked by name. Null for any other trial (phrase-length questions stay a choice).
 */
export function formModeOf(trial: Trial<unknown>): FormMode | null {
  const p = trial.params;
  const expected = trial.expected as Answer;
  const per = Number(p.sectionBars ?? 0);
  const bars = barsOf(trial) - cueBarsOf(trial);
  if (Array.isArray(expected.sections) && expected.sections.length > 0) {
    const n = expected.sections.length;
    const sectionBars = Array.isArray(p.sectionBarsList)
      ? (p.sectionBarsList as unknown[]).map(Number)
      : Array.from({ length: n }, () => (per > 0 ? per : Math.max(1, Math.round(bars / n))));
    return {
      spec: { ui: "form", sections: n, vocabulary: "letters", input: "label", sectionBars },
      expected: formLetters(expected.sections).split(""),
      byLetters: new Map(),
    };
  }
  if (!Number.isInteger(per) || per <= 0 || bars % per !== 0) return null;
  const options = Array.isArray(p.options) ? (p.options as unknown[]).map(String) : [];
  const want = expected.choice?.[0];
  if (!want || options.length < 2) return null;
  const n = bars / per;
  const byLetters = new Map<string, string>();
  for (const id of options) {
    const letters = formIdLetters(id);
    if (!letters || letters.length !== n) return null;
    byLetters.set(letters, id);
  }
  const letters = formIdLetters(want);
  if (!letters) return null;
  return {
    spec: {
      ui: "form",
      sections: n,
      vocabulary: "letters",
      input: "label",
      sectionBars: Array.from({ length: n }, () => per),
    },
    expected: letters.split(""),
    byLetters,
  };
}

/**
 * The grader answer of section labels: the family's own choice when the labels spell one of its forms (letters
 * by first appearance, so "B B A B" is AABA), else the letters themselves (a form none of the options has, graded
 * wrong). The labels travel with it in `sections`.
 */
export function formAnswer(mode: FormMode, labels: readonly string[]): Answer {
  const letters = formLetters(labels);
  if (mode.byLetters.size === 0) return { sections: [...labels] };
  return { choice: [mode.byLetters.get(letters) ?? letters], sections: [...labels] };
}

/** Grades a `sections` answer against `expected.sections` by letters (an engine form trial). */
export function gradeSections(
  trial: Trial<unknown>,
  answer: Answer,
  rtMs: number,
  replays: number,
): DrillTrialResult {
  const want = formLetters((trial.expected as Answer).sections ?? []);
  const got = formLetters(answer.sections ?? []);
  const hits = want.split("").filter((l, i) => got[i] === l).length;
  const credit = want.length === 0 ? 0 : hits / Math.max(want.length, got.length);
  const correct = got === want;
  return {
    credit,
    correct,
    rtMs,
    replays,
    diagnostics: correct ? [] : [{ id: "id.wrong", severity: "error", params: { exp: want, got } }],
    ...(correct ? {} : { confusion: [want, got] as [string, string] }),
  };
}

export interface SectionWindow {
  /** 0-based. */
  index: number;
  /** The section's letter in the answer ("A"). */
  letter: string;
  /** First bar of the section in cycles from the start of the trial (context bars included). */
  fromBar: number;
  bars: number;
}

/** The sections of a form trial, in order, with where each one sounds. */
export function sectionsOf(trial: Trial<unknown>): SectionWindow[] {
  const mode = formModeOf(trial);
  if (!mode) return [];
  let at = cueBarsOf(trial);
  return (mode.spec.sectionBars ?? []).map((bars, index) => {
    const w = { index, letter: mode.expected[index] ?? "?", fromBar: at, bars };
    at += bars;
    return w;
  });
}

/** One section of a form trial by itself. */
export function sectionPlan(trial: Trial<unknown>, index: number): AudioPlan | null {
  const w = sectionsOf(trial)[index];
  if (!w) return null;
  return eventsToAudioPlan(trial.events, trial.cps, { fromBar: w.fromBar, bars: w.bars });
}

// --- the twelve bars ----------------------------------------------------------------------------------

export interface BarCell {
  /** 1-based bar of the passage heard. */
  bar: number;
  /** 1-based bar of the twelve-bar form (differs from `bar` when the passage starts mid-form). */
  formBar: number;
  /** The chord as a numeral in the key ("IV7"), read from the notes; null when nothing chordal sounds. */
  rn: string | null;
}
export interface BluesChart {
  cells: BarCell[];
  /** The bar the question names (1-based, passage bars), or null. */
  marked: number | null;
  /** Bars a row (4: a line of the form). */
  perRow: number;
}

/** A trial of the twelve-bar family that is heard bar by bar (which chord in bar n, where IV first arrives). */
export function isBarTrial(trial: Trial<unknown>, def: Pick<FamilyDef, "generator">): boolean {
  return (
    def.generator === "form-blues" &&
    (trial.params.barCounter === true || trial.params.ui === "bar-buttons") &&
    trial.events.length > 0
  );
}

/** The chart of a twelve-bar trial: one cell per bar, its numeral read from the chords in the key. */
export function bluesChartOf(trial: Trial<unknown>, def: Pick<FamilyDef, "generator">): BluesChart | null {
  if (!isBarTrial(trial, def)) return null;
  const key = keyOf(trial);
  const bars = barsOf(trial) - cueBarsOf(trial);
  const start = Math.max(1, Number(trial.params.startBar ?? 1));
  const slots = chordSlotsOf(trial);
  const cells: BarCell[] = Array.from({ length: bars }, (_, i) => {
    const slot = slots.find((s) => Math.floor(s.at + 1e-9) === i);
    // Read in the blues key on the same tonic, so I7 is I7 and never V7/IV (@oak/theory `bluesKey`).
    const rn = slot?.reading && key ? rnDisplay(romanText(slot.reading.chord, bluesKey(key.tonic))) : null;
    return { bar: i + 1, formBar: ((start - 1 + i) % 12) + 1, rn };
  });
  const marked = typeof trial.params.markedBar === "number" ? trial.params.markedBar : null;
  return { cells, marked, perRow: 4 };
}

/** One bar of the passage by itself (1-based). */
export function barPlan(trial: Trial<unknown>, bar: number): AudioPlan {
  return eventsToAudioPlan(trial.events, trial.cps, { fromBar: cueBarsOf(trial) + bar - 1, bars: 1 });
}

/** The bar playing `elapsedSec` after the passage started (1-based), or null before it or after it. */
export function barAt(elapsedSec: number, cps: number, bars: number): number | null {
  if (!(elapsedSec >= 0) || cps <= 0) return null;
  const bar = Math.floor(elapsedSec * cps) + 1;
  return bar >= 1 && bar <= bars ? bar : null;
}

// --- straight or swung ---------------------------------------------------------------------------------

/** Whether a feel trial was played swung (any answer but "straight"). */
export const playedSwung = (trial: Trial<unknown>): boolean =>
  ((trial.expected as Answer).choice?.[0] ?? "straight") !== "straight";

/** The beat the swing works on: a quarter, or an eighth when the hats run in sixteenths. */
function swingBeat(trial: Trial<unknown>): number {
  const perCycle = new Map<number, number>();
  for (const e of trial.events)
    if (e.track === "hats" || e.drum === "hatClosed" || e.drum === "hatOpen") {
      const c = Math.floor(onsetOf(e));
      perCycle.set(c, (perCycle.get(c) ?? 0) + 1);
    }
  const most = Math.max(0, ...perCycle.values());
  return most > 8 ? 1 / 8 : 1 / 4;
}

const RAT = 2880;
const rat = (x: number): [number, number] => [Math.round(x * RAT), RAT];

/**
 * The same groove in the other feel: a swung trial straightened (every off-beat back to the middle of its beat), a
 * straight one swung by triplets (the off-beat at two thirds of the beat). Same sounds, same bars.
 */
export function otherFeelEvents(trial: Trial<unknown>): NEvent[] {
  const beat = swingBeat(trial);
  const swung = playedSwung(trial);
  return trial.events.map((e) => {
    const t = onsetOf(e);
    const start = Math.floor(t / beat + 1e-9) * beat;
    const frac = (t - start) / beat;
    if (frac < 1e-6) return e;
    const to = swung ? 0.5 : Math.abs(frac - 0.5) < 1e-6 ? 2 / 3 : frac;
    return { ...e, onset: rat(start + to * beat) };
  });
}

/** "Hear it straight" / "Hear it swung": the other feel of a feel trial. */
export function otherFeelPlan(trial: Trial<unknown>): AudioPlan {
  return eventsToAudioPlan(otherFeelEvents(trial), trial.cps, { bars: barsOf(trial) });
}

/** Some tracks of a trial by themselves (the hats; the kick and the bass). */
export function tracksPlan(trial: Trial<unknown>, tracks: readonly string[]): AudioPlan | null {
  const events = trial.events.filter((e) => tracks.includes(e.track ?? "") || tracks.includes(e.drum ?? ""));
  if (events.length === 0) return null;
  return eventsToAudioPlan(events, trial.cps, {
    fromBar: cueBarsOf(trial),
    bars: barsOf(trial) - cueBarsOf(trial),
  });
}

// --- modes, minors and scale colours ----------------------------------------------------------------------

/** The mode or scale a key trial was played in. */
export function playedMode(trial: Trial<unknown>): ScaleMode | null {
  const k = keyOf(trial);
  return k && k.mode in MODE_DEGREES ? (k.mode as ScaleMode) : null;
}

/**
 * "The scale": the mode the trial was played in, up from its tonic to the octave and back down, in the register of
 * its tune (do-based in minor: 1 2 ♭3 4 5 ♭6 ♭7).
 */
export function scalePlan(trial: Trial<unknown>, noteSec = 0.28): AudioPlan | null {
  const key = keyOf(trial);
  const mode = playedMode(trial);
  if (!key || !mode) return null;
  const pitched = trial.events.filter((e) => e.midi !== null && (e.track === "mel" || e.track === "melody"));
  const pool = pitched.length > 0 ? pitched : trial.events.filter((e) => e.midi !== null);
  const sorted = pool.map((e) => e.midi as number).sort((a, b) => a - b);
  const centre = sorted[Math.floor(sorted.length / 2)] ?? 60;
  const tonic = tonicNear(key, centre - 5, 48, 72);
  const up = [...MODE_DEGREES[mode].map((d) => tonic + degreeSemitones(d)), tonic + 12];
  const notes = [...up, ...up.slice(0, -1).reverse()];
  return {
    events: notes.map((note, i) => ({
      at: i * noteSec,
      dur: noteSec * (i === up.length - 1 || i === notes.length - 1 ? 2 : 0.95),
      value: { s: "piano", note, gain: 0.7 },
    })),
    durationSec: notes.length * noteSec + noteSec,
    preload: ["piano"],
  };
}

/** The scale's degrees as the learner reads them ("1 2 ♭3 4 5 ♭6 ♭7"), with do-based syllables when asked. */
export function scaleText(mode: ScaleMode, syllables = false): string {
  return MODE_DEGREES[mode]
    .map((d) => {
      const shown = d.replace(/^b/, "♭").replace(/^#/, "♯");
      return syllables ? `${shown} ${syllableOf(d)}` : shown;
    })
    .join(syllables ? " · " : " ");
}

// --- degrees in minor ---------------------------------------------------------------------------------------

/** The way home of an FET trial as the learner reads it ("♭3 2 1 · me re do"), do-based in minor. */
export function wayHomeText(trial: Trial<unknown>, syllables: boolean): string | null {
  const key = keyOf(trial);
  const raw = trial.params.resolutionTargets;
  if (!key || !Array.isArray(raw) || raw.length === 0) return null;
  const labels = (raw as { midi: number }[]).map((t) => labelPitch(t.midi, key));
  const nums = labels.map((l) => l.degreeDisplay).join(" ");
  return syllables ? `${nums} · ${labels.map((l) => l.syllable).join(" ")}` : nums;
}

/** The asked note by itself (an FET trial's last note), on the trial's own sound. */
export function noteAlonePlan(trial: Trial<unknown>): AudioPlan | null {
  const cue = cueBarsOf(trial);
  const asked = trial.events
    .filter((e) => e.midi !== null && e.track === "mel" && onsetOf(e) >= cue - 1e-9)
    .sort((a, b) => onsetOf(a) - onsetOf(b))
    .at(-1);
  if (!asked) return null;
  return {
    events: [{ at: 0, dur: 1.2, value: { s: asked.s ?? "piano", note: asked.midi as number, gain: 0.8 } }],
    durationSec: 1.4,
    preload: [asked.s ?? "piano"],
  };
}

// --- a seventh against the triad ---------------------------------------------------------------------------

const SEVENTH_SEMIS: Readonly<Record<string, number>> = {
  "7": 10,
  maj7: 11,
  m7: 10,
  m7b5: 10,
  dim7: 9,
  mMaj7: 11,
};

/**
 * A lone seventh chord with its seventh taken out, then as heard: the dominant seventh (or any seventh) against
 * its triad. Null for a triad or a progression.
 */
export function withoutSeventhPlan(trial: Trial<unknown>): AudioPlan | null {
  const slots = chordSlotsOf(trial);
  if (slots.length !== 1) return null;
  const s = slots[0];
  const q = s?.reading?.quality;
  if (!s || !q || SEVENTH_SEMIS[q] === undefined) return null;
  const seventhPc = (s.reading?.chord.rootPc ?? 0) + (SEVENTH_SEMIS[q] as number);
  const triad = s.midis.filter((m) => (((m - seventhPc) % 12) + 12) % 12 !== 0);
  const sound = s.sounds.chords;
  const chord = (notes: readonly number[], at: number) =>
    notes.map((note) => ({ at, dur: 1.3, value: { s: sound, note, gain: 0.55 } }));
  return {
    events: [...chord(triad, 0), ...chord(s.midis, 1.8)],
    durationSec: 3.3,
    preload: [sound],
  };
}

// --- bass-line dictation ---------------------------------------------------------------------------------------

/**
 * A bass-line dictation (root motion first, then the line): a bass-degree trial whose line has more notes than
 * chords (the `lines` category: root, then the 5th, the octave or an approach), or an engine trial whose bass
 * track is written as code or on the staff.
 */
export function isBassLineTrial(trial: Trial<unknown>): boolean {
  if (
    trial.params.answerTrack === "bass" &&
    (trial.params.ui === "code" || trial.params.ui === "staff-input") &&
    trial.events.some((e) => e.track === "bass")
  )
    return true;
  // The engine's `lines` category names the move after each root (`params.moves`): a line, not only roots.
  return isBassTrial(trial) && Array.isArray(trial.params.moves);
}

/**
 * A bass-degree trial ("Hear the bass line") as a line to write: the bass track from the first asked bar, in the
 * trial's key and in the bass's own octave, so it can be written as `n("<0 5 3 4>").scale("C2:major")` or on the
 * bass staff. The trial itself is unchanged (its record keeps its own params).
 */
export function bassLineTrialOf(trial: Trial): Trial | null {
  if (!isBassTrial(trial)) return null;
  const key = keyOf(trial);
  if (!key) return null;
  const cue = cueBarsOf(trial);
  const bass = trial.events.filter((e) => e.track === "bass" && e.midi !== null && onsetOf(e) >= cue - 1e-9);
  if (bass.length === 0) return null;
  // The scale's octave is the bass's own: the tonic nearest the first note (any octave is graded alike).
  const first = [...bass].sort((a, b) => onsetOf(a) - onsetOf(b))[0]?.midi as number;
  const octave = Math.floor(tonicNear(key, first, 0, 127) / 12) - 1;
  return {
    ...trial,
    params: {
      ...trial.params,
      mode: "code",
      ui: "code",
      answerTrack: "bass",
      answerFromBar: cue,
      answerBars: barsOf(trial) - cue,
      answerKey: { key, octave },
      starter: `n("<>").scale("${key.tonic}${octave}:${key.mode.replace(/ /g, ":")}").s("${bass[0]?.s ?? "ebass"}")`,
    },
  };
}

/** The bass line of a bass-degree trial as the learner would write it (`n("<0 5 3 4>")`, n = degree − 1). */
export function bassLineCodeOf(trial: Trial<unknown>): string | null {
  const key = keyOf(trial);
  const degrees = (trial.expected as Answer).degrees;
  if (!key || !degrees) return null;
  const scale = (MODE_DEGREES[key.mode as ScaleMode] ?? MODE_DEGREES.major) as readonly string[];
  const steps = degrees.map((d) => scale.indexOf(d));
  if (steps.some((i) => i < 0)) return null;
  // One cell per bar: `<0 4 5 3>` for roots, `<[0 4] [5 0] …>` for a line of two notes a bar.
  const bars = Math.max(1, barsOf(trial) - cueBarsOf(trial));
  const per = steps.length % bars === 0 ? steps.length / bars : 1;
  if (per <= 1) return `n("<${steps.join(" ")}>")`;
  const cells = Array.from({ length: bars }, (_, b) => `[${steps.slice(b * per, b * per + per).join(" ")}]`);
  return `n("<${cells.join(" ")}>")`;
}

/**
 * Grades a bass line written as code (or spelled from the staff) against the bass track: onset and pitch class,
 * octave-free (a line written an octave up is the same line), F1 over the notes. Right when every note matches.
 */
export function gradeBassLine(
  line: Trial<unknown>,
  text: string,
  rtMs: number,
  replays: number,
): DrillTrialResult {
  const base = { rtMs, replays };
  const from = Number(line.params.answerFromBar ?? 0);
  const bars = Number(line.params.answerBars ?? 1);
  const target = line.events
    .filter((e) => e.track === "bass" && e.midi !== null && onsetOf(e) >= from - 1e-9)
    .map((e) => ({ t: onsetOf(e) - from, pc: (e.midi as number) % 12 }));
  const parsed = parseMiniCode(text, bars, line.params.answerKey as never);
  if (!parsed.ok)
    return {
      ...base,
      credit: 0,
      correct: false,
      diagnostics: [{ id: "eval.mini-parse", severity: "error", params: { line: 1, detail: parsed.error } }],
    };
  const got = parsed.events
    .filter((e) => e.midi !== null)
    .map((e) => ({ t: e.t, pc: (((e.midi as number) % 12) + 12) % 12 }));
  const k = (e: { t: number; pc: number }) => `${Math.round(e.t * 960)}|${e.pc}`;
  const want = new Map<string, number>();
  for (const e of target) want.set(k(e), (want.get(k(e)) ?? 0) + 1);
  let hits = 0;
  for (const e of got) {
    const n = want.get(k(e)) ?? 0;
    if (n > 0) {
      hits++;
      want.set(k(e), n - 1);
    }
  }
  const credit = target.length + got.length === 0 ? 0 : (2 * hits) / (target.length + got.length);
  const diagnostics: DrillTrialResult["diagnostics"] = [];
  if (hits < target.length)
    diagnostics.push({ id: "melody.missing-note", severity: "error", params: { n: target.length - hits } });
  if (hits < got.length)
    diagnostics.push({ id: "melody.extra-note", severity: "error", params: { n: got.length - hits } });
  return { ...base, credit, correct: credit >= 0.999, diagnostics };
}

/** The root under each chord of a bass-line trial, as degrees in its key (root motion first). */
export function rootsOf(trial: Trial<unknown>): Degree[] {
  const key = keyOf(trial);
  if (!key) return [];
  // One chord a bar under a line: the chord of each bar (a bass note on beat 3 is not a new chord, even when the
  // comping strikes again there).
  const slots = chordSlotsOf(trial);
  const perBar = Array.isArray(trial.params.moves)
    ? slots.filter(
        (s, i) => i === 0 || Math.floor(s.at + 1e-9) !== Math.floor((slots[i - 1]?.at ?? -1) + 1e-9),
      )
    : slots;
  return perBar.map((s) =>
    s.reading ? labelPitch(48 + s.reading.chord.rootPc, key).degree : bassDegreeOf(s, key),
  );
}

/** The degree pad of a bass-line trial's roots step: the key's own degrees (do-based in minor). */
export function rootsSpecOf(trial: Trial<unknown>, syllables = false): AnswerSpec | null {
  const key = keyOf(trial);
  const roots = rootsOf(trial);
  if (!key || roots.length === 0) return null;
  const base = (MODE_DEGREES[key.mode as ScaleMode] ?? MODE_DEGREES.major) as readonly Degree[];
  const set = [...new Set([...base, ...roots])].sort((a, b) => degreeSemitones(a) - degreeSemitones(b));
  return { ui: "degree-pad", set, sequenceLen: roots.length, syllables };
}

/** The roots step of a bass-line trial checked chord by chord (pass mark 0.8, like a staged step). */
export function gradeRoots(
  trial: Trial<unknown>,
  degrees: readonly string[],
): { credit: number; passed: boolean; marks: boolean[] } {
  const want = rootsOf(trial);
  const norm = (d: string | undefined) => (d ?? "").replace("♭", "b").replace("♯", "#").trim();
  const marks = want.map((w, i) => norm(degrees[i]) === w);
  const credit = want.length === 0 ? 0 : marks.filter(Boolean).length / want.length;
  return { credit, passed: credit >= 0.8 - 1e-9, marks };
}

// --- c8: the numerals that fit the bass the learner found ----------------------------------------------

/**
 * The bass under each chord as the learner settled it in the bass step (their own answer when it passed, the
 * answer when the step was shown), for the Roman-numeral palette's lit numerals — in minor keys too (♭3 ♭6 ♭7).
 */
export function foundBassOf(
  step: { answer: Answer | null; passed: boolean; revealed: boolean } | undefined,
  expected: readonly string[],
): string[] | null {
  if (!step) return null;
  if (step.revealed) return [...expected];
  if (!step.passed) return null;
  const got = step.answer?.degrees ?? [];
  return expected.map((e, i) => (got[i] as string | undefined) ?? e);
}

// --- the Practice hub: graduation reads as progress ------------------------------------------------------

/**
 * A mastered family that has graduated into its composite, said as what it is: progress. It keeps its level,
 * comes up two trials at a time in mixed practice, and comes back to its own sets only if it needs them.
 */
export function graduatedLine(
  state: FamilyState | undefined,
  def: Pick<FamilyDef, "masteryLevel">,
  compositeTitle: string,
  others: number,
): string | null {
  if (!state || state.graduatedAt === null || !state.compositeId) return null;
  if (state.level < def.masteryLevel || (state.restingSince ?? null) !== null) return null;
  const company = others === 0 ? "" : ` with ${others} ${others === 1 ? "other" : "others"}`;
  return `Graduated to ${compositeTitle}${company}: it keeps its level and comes up two trials at a time.`;
}

/** The set summary's line when a set made the family graduate (contracts §7.4). */
export function graduationNews(title: string, compositeTitle: string): string {
  return `${title} graduated: it now lives in ${compositeTitle}, two trials at a time, at the level you reached.`;
}

/** Level shown honestly: never above the highest level its lessons have opened. */
export function honestLevel(
  state: Pick<FamilyState, "level" | "maxOpenLevel"> | undefined,
  total: number,
): number {
  const level = state?.level ?? 1;
  const open = Math.max(1, state?.maxOpenLevel ?? level);
  return Math.max(1, Math.min(total, level, open));
}

export { flat as flatText };
