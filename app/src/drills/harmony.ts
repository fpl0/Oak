// Stage D ear training in the drill runner (contracts §7.3; ux §4.5 "bass-first harmonic dictation"), pure and
// unit-tested: which trials are harmony trials, the key every one of them is heard in (the reference cadence of
// `@oak/strudel/reference` comes first, always), the chords a trial sounds (read with `@oak/theory`, never from a
// local table), the after-answer listening ("the bass alone", "the chords broken", "in context", "yours, then
// it"), the staged chord dictation (bass → quality → numerals, each step checked on its own, graded by
// degree/quality/inversion, never by string), and the sung bass line ("sing the roots, one per bar").
import type { Answer, ChordQuality, Degree, KeySpec, LearnerProfile, Trial } from "@oak/api";
import { type AudioPlan, eventsToAudioPlan, trialAudio } from "@oak/drills";
import { cadencePlan } from "@oak/strudel/reference";
import {
  type ChordReading,
  chordOfRoman,
  degreeSemitones,
  labelPitch,
  readChord,
  romanParts,
  romanText,
  toLeadSheet,
} from "@oak/theory";
import { rnDisplay } from "../answers/keys.ts";
import type { AnswerSpec, SungSummary } from "../answers/types.ts";

const mod = (n: number, m: number): number => ((n % m) + m) % m;

/** Families whose trials are chords and progressions (stage D, and the chord families after it). */
const HARMONY_FAMILY = /^fam\.(chd\.(quality-|inversion)|har\.)/;

/** A harmony trial: a chord or a progression that is heard (a silent concept trial has no events). */
export function isHarmonyTrial(trial: Trial<unknown>): boolean {
  return HARMONY_FAMILY.test(trial.family) && trial.events.length > 0;
}

/**
 * "Bass alone" before the answer (review:journey): a bass-degree trial, or the bass step of a staged chord dictation,
 * can play its bass line by itself while the learner answers. It counts as a replay (honest help, never free).
 */
export function bassAloneWhileAnswering(trial: Trial<unknown>, openStep: string | null): boolean {
  if (!isHarmonyTrial(trial)) return false;
  return isBassTrial(trial) || openStep === "bass";
}

/** The staged chord dictation family (bass → quality → numerals). */
export const isStagedTrial = (trial: Trial<unknown>): boolean =>
  trial.family === "fam.har.progression" &&
  Array.isArray((trial.expected as Answer).rn) &&
  keyParam(trial) !== null &&
  trial.events.length > 0;

/** The bass-degree family, whose roots may be sung before they are picked. */
export const isBassTrial = (trial: Trial<unknown>): boolean =>
  trial.family === "fam.har.bass" && keyParam(trial) !== null && trial.events.length > 0;

function keyParam(trial: Trial<unknown>): KeySpec | null {
  const k = trial.params.key as KeySpec | undefined;
  return k && typeof k.tonic === "string" && typeof k.mode === "string" ? k : null;
}

// --- the key every harmony trial is heard in -------------------------------------------------------

const MAJOR_TONICS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const MINOR_TONICS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];

/**
 * Where a lone chord sits in a key, per quality: semitones from the tonic to its root. A major triad is I, IV
 * or V of a major key; a minor triad ii, iii or vi; a diminished one vii°; an augmented one the III+ of
 * harmonic minor. Sevenths likewise (V7, Imaj7/IVmaj7, ii7/iii7/vi7, viiø7, the minor key's vii°7).
 */
const HOMES: Readonly<Record<string, readonly { mode: "major" | "minor"; semis: number }[]>> = {
  maj: [
    { mode: "major", semis: 0 },
    { mode: "major", semis: 5 },
    { mode: "major", semis: 7 },
  ],
  min: [
    { mode: "major", semis: 2 },
    { mode: "major", semis: 4 },
    { mode: "major", semis: 9 },
  ],
  dim: [{ mode: "major", semis: 11 }],
  aug: [{ mode: "minor", semis: 3 }],
  "7": [{ mode: "major", semis: 7 }],
  maj7: [
    { mode: "major", semis: 0 },
    { mode: "major", semis: 5 },
  ],
  m7: [
    { mode: "major", semis: 2 },
    { mode: "major", semis: 4 },
    { mode: "major", semis: 9 },
  ],
  m7b5: [{ mode: "major", semis: 11 }],
  dim7: [{ mode: "minor", semis: 11 }],
};

/** The chord quality a lone-chord trial plays (`expected.qualities`, or `params.quality` for inversions). */
function loneQuality(trial: Trial<unknown>): ChordQuality | null {
  const q = (trial.expected as Answer).qualities?.[0] ?? trial.params.quality;
  return typeof q === "string" ? (q as ChordQuality) : null;
}

/**
 * The key a harmony trial is heard in: its own key, or, for a lone chord (quality, inversion), a key the chord
 * belongs to, chosen from the trial's seed so a reload hears the same one. Null when there is nothing to place.
 */
export function contextKeyOf(trial: Trial<unknown>): KeySpec | null {
  const own = keyParam(trial);
  if (own) return own;
  const rootPc = trial.params.rootPc;
  const quality = loneQuality(trial);
  if (typeof rootPc !== "number" || !quality) return null;
  const homes = HOMES[quality] ?? HOMES.maj ?? [];
  const home = homes[mod(trial.seed, homes.length)];
  if (!home) return null;
  const pc = mod(rootPc - home.semis, 12);
  return { tonic: (home.mode === "minor" ? MINOR_TONICS : MAJOR_TONICS)[pc] as string, mode: home.mode };
}

const PC_OF: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function tonicPc(key: KeySpec): number {
  const letter = PC_OF[key.tonic[0]?.toUpperCase() ?? "C"] ?? 0;
  const acc = key.tonic.slice(1);
  return mod(letter + (acc.match(/#|♯/g)?.length ?? 0) - (acc.match(/b|♭/g)?.length ?? 0), 12);
}
const isMinorMode = (key: KeySpec): boolean => /minor|aeolian|dorian|phrygian/.test(key.mode);

/** The tonic of `key` as MIDI in [lo, lo + 11]. */
export function tonicIn(key: KeySpec, lo: number): number {
  return lo + mod(tonicPc(key) - lo, 12);
}

/** The tonic in the octave nearest `centre`, kept inside [low, high] when that octave fits. */
export function tonicNear(key: KeySpec, centre: number, low = 0, high = 127): number {
  const base = tonicIn(key, Math.round(centre) - 6);
  const cands = [base - 12, base, base + 12].filter((t) => t >= low && t <= high);
  const pool = cands.length > 0 ? cands : [base];
  return pool.reduce((best, t) => (Math.abs(t - centre) < Math.abs(best - centre) ? t : best));
}

/** The trial's tempo (BPM) from its cycles per second and meter (4/4 when it names none). */
function bpmOf(trial: Trial<unknown>): number {
  const bpm = trial.params.bpm;
  if (typeof bpm === "number" && bpm > 0) return bpm;
  return Math.round(trial.cps * 60 * 4);
}

/**
 * The reference cadence (`@oak/strudel/reference` `cadencePlan`, I–IV–V–I with its bass) that sets the key of a
 * harmony trial before it plays: the tonic between G3 and F♯4 so the chords sit in the middle of the piano.
 */
export function harmonyCuePlan(trial: Trial<unknown>): AudioPlan | null {
  if (!isHarmonyTrial(trial)) return null;
  const key = contextKeyOf(trial);
  if (!key) return null;
  return cadencePlan(tonicIn(key, 55), {
    mode: isMinorMode(key) ? "minor" : "major",
    bpm: Math.max(72, Math.min(110, bpmOf(trial))),
  });
}

/** Sung targets of a trial, as MIDI (sing trials: `singTargets`; FET resolutions: `resolutionTargets`). */
function targetMidis(trial: Trial<unknown>, key: "singTargets" | "resolutionTargets"): number[] {
  const raw = trial.params[key];
  return Array.isArray(raw)
    ? raw.map((t) => (t as { midi?: unknown }).midi).filter((m): m is number => typeof m === "number")
    : [];
}

/**
 * The reference cadence before a sung part (wave3.md gap: sung trials hear `@oak/strudel/reference`, not the
 * drills' own cue): in the trial's key, its tonic in the octave of the notes to sing, inside the learner's
 * comfortable range (contracts §8.1 rule 3: the octave heard is the octave sung).
 */
export function singCuePlan(
  trial: Trial<unknown>,
  profile?: Pick<LearnerProfile, "comfLow" | "comfHigh"> | null,
  targetsKey: "singTargets" | "resolutionTargets" = "singTargets",
  explicit?: readonly number[],
): AudioPlan | null {
  const key = keyParam(trial);
  const midis = explicit ? [...explicit] : targetMidis(trial, targetsKey);
  if (!key || midis.length === 0) return null;
  const sorted = [...midis].sort((a, b) => a - b);
  const centre = sorted[Math.floor(sorted.length / 2)] as number;
  const low = profile?.comfLow ?? 0;
  const high = profile?.comfHigh ?? 127;
  return cadencePlan(tonicNear(key, centre, low, high), {
    mode: isMinorMode(key) ? "minor" : "major",
    bpm: Math.max(72, Math.min(110, bpmOf(trial))),
  });
}

// --- the chords a trial sounds -----------------------------------------------------------------------

export interface ChordSlot {
  /** Cycles (bars) from the start of the asked passage. */
  at: number;
  /** Cycles. */
  dur: number;
  /** Sounding MIDI notes, low to high (bass first). */
  midis: number[];
  bass: number;
  /** The chord read from the notes and the bass (`@oak/theory` `readChord`), null when it is not a chord. */
  reading: ChordReading | null;
  /** The instruments that play it (chords, then bass). */
  sounds: { chords: string; bass: string | null };
}

const onsetOf = (e: { onset: readonly [number, number] }): number => e.onset[0] / e.onset[1];
const durOf = (e: { dur: readonly [number, number] }): number => e.dur[0] / e.dur[1];

/**
 * The chords of a harmony trial, in order: a lone chord from its own notes (`params.midis`, so an arpeggiated
 * stimulus still reads as one chord); a progression as one chord per onset of its chord and bass tracks (the
 * melody of a cadence phrase is not part of the chord).
 */
export function chordSlotsOf(trial: Trial<unknown>): ChordSlot[] {
  const cueBars = Number(trial.params.cueBars ?? 0);
  const pitched = trial.events.filter(
    (e) => e.midi !== null && e.track !== "mel" && onsetOf(e) >= cueBars - 1e-9,
  );
  const chordSound = pitched.find((e) => e.track !== "bass")?.s ?? "piano";
  const bassSound = pitched.find((e) => e.track === "bass")?.s ?? null;
  const own = trial.params.midis;
  if (Array.isArray(own) && own.every((m) => typeof m === "number") && own.length >= 2) {
    const midis = [...(own as number[])].sort((a, b) => a - b);
    const bass = midis[0] as number;
    const bars = Math.max(1, Number(trial.params.bars ?? 1));
    return [
      {
        at: 0,
        dur: bars,
        midis,
        bass,
        reading: readChord(midis, bass),
        sounds: { chords: chordSound, bass: null },
      },
    ];
  }
  const byOnset = new Map<number, typeof pitched>();
  for (const e of pitched) {
    const t = Math.round(onsetOf(e) * 960) / 960;
    byOnset.set(t, [...(byOnset.get(t) ?? []), e]);
  }
  return [...byOnset.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, evs]) => {
      const midis = [...new Set(evs.map((e) => e.midi as number))].sort((a, b) => a - b);
      const bassEv = evs.filter((e) => e.track === "bass").sort((a, b) => (a.midi ?? 0) - (b.midi ?? 0))[0];
      const bass = (bassEv?.midi ?? midis[0]) as number;
      return {
        at: t - cueBars,
        dur: Math.min(...evs.map(durOf)),
        midis,
        bass,
        reading: midis.length >= 2 ? readChord(midis, bass) : null,
        sounds: { chords: chordSound, bass: bassSound },
      };
    })
    .filter((s) => s.midis.length >= 2 || s.reading !== null);
}

/** The bass degree of a slot in a key (1-based, relative to the major scale: ♭3 in minor). */
export const bassDegreeOf = (slot: Pick<ChordSlot, "bass">, key: KeySpec): Degree =>
  labelPitch(slot.bass, key).degree;

/** Display of a Roman numeral read from a slot in a key ("V6", "vii°"), null when the notes are not a chord. */
export function slotRn(slots: readonly ChordSlot[], i: number, key: KeySpec): string | null {
  const r = slots[i]?.reading;
  if (!r) return null;
  const next = slots[i + 1]?.reading?.chord;
  return rnDisplay(romanText(r.chord, key, next));
}

/**
 * The lead-sheet symbol of a slot spelled in the key (C♯° in D major, never D♭°): the chord read from the notes,
 * named by its numeral, then spelled back in the key by `@oak/theory`.
 */
export function slotSymbol(slots: readonly ChordSlot[], i: number, key: KeySpec): string | null {
  const r = slots[i]?.reading;
  if (!r) return null;
  const spelled = chordOfRoman(romanText(r.chord, key, slots[i + 1]?.reading?.chord), key);
  return spelled ? toLeadSheet(spelled) : r.leadSheet;
}

export interface SlotLabel {
  /** 1-based bar the chord sounds in. */
  bar: number;
  /** The bass degree ("1", "♭7"): the course's own language, always shown. */
  degree: string;
  /** Lead-sheet symbol ("B♭/D"), when the chord-symbol lens is shown. */
  symbol: string | null;
  /** Roman numeral ("I6"), when the Roman-numeral lens is shown. */
  rn: string | null;
}

/** The answer in context: what each chord was, with the labels the chord lenses allow. */
export function slotLabels(
  trial: Trial<unknown>,
  shown: { chordSymbols: boolean; romanNumerals: boolean },
): SlotLabel[] {
  const key = contextKeyOf(trial);
  const slots = chordSlotsOf(trial);
  if (!key) return [];
  return slots.map((s, i) => ({
    bar: Math.floor(s.at + 1e-9) + 1,
    degree: bassDegreeOf(s, key).replace(/^b/, "♭").replace(/^#/, "♯"),
    symbol: shown.chordSymbols ? slotSymbol(slots, i, key) : null,
    rn: shown.romanNumerals ? slotRn(slots, i, key) : null,
  }));
}

// --- listening after the answer --------------------------------------------------------------------

/** "The bass alone": the lowest note of every chord, in time, on the bass instrument (or the piano). */
export function bassPlan(trial: Trial<unknown>): AudioPlan | null {
  const slots = chordSlotsOf(trial);
  if (slots.length === 0) return null;
  const lone = slots.length === 1;
  const step = lone ? 1.2 : 1 / trial.cps;
  const sound = slots[0]?.sounds.bass ?? "piano";
  return {
    events: slots.map((s) => ({
      at: lone ? 0 : s.at / trial.cps,
      dur: (lone ? step : (s.dur * step) / 1) * 0.9,
      value: { s: sound, note: s.bass, gain: 0.85 },
    })),
    durationSec: lone ? step : Math.max(...slots.map((s) => (s.at + s.dur) / trial.cps)),
    preload: [sound],
  };
}

/** "The chords broken": each chord's notes from the bass up, one after another, then the next chord. */
export function arpeggioPlan(trial: Trial<unknown>, noteSec = 0.2, gapSec = 0.35): AudioPlan | null {
  const slots = chordSlotsOf(trial);
  if (slots.length === 0) return null;
  const sound = slots[0]?.sounds.chords ?? "piano";
  const events: AudioPlan["events"] = [];
  let t = 0;
  for (const s of slots) {
    s.midis.forEach((note, k) => {
      events.push({
        at: t + k * noteSec,
        dur: noteSec * (s.midis.length - k) + 0.25,
        value: { s: sound, note, gain: 0.6 },
      });
    });
    t += s.midis.length * noteSec + 0.25 + gapSec;
  }
  return { events, durationSec: t, preload: [sound] };
}

/**
 * "In context": the key's cadence, the passage, and for a lone chord the way home (the tonic chord), so the
 * chord is heard doing its job in the key.
 */
export function contextPlan(trial: Trial<unknown>): AudioPlan | null {
  const cue = harmonyCuePlan(trial);
  const key = contextKeyOf(trial);
  if (!cue || !key) return null;
  const stimulus = trialAudio(trial, key).stimulus;
  const parts: AudioPlan[] = [cue, stimulus];
  if (chordSlotsOf(trial).length === 1) {
    const t = tonicIn(key, 55);
    const third = isMinorMode(key) ? 3 : 4;
    parts.push({
      events: [t - 12, t, t + third, t + 7].map((note) => ({
        at: 0,
        dur: 1.4,
        value: { s: "piano", note, gain: 0.5 },
      })),
      durationSec: 1.6,
      preload: ["piano"],
    });
  }
  return joinPlans(parts, 0.45);
}

function joinPlans(plans: readonly (AudioPlan | null)[], gapSec: number): AudioPlan {
  const events: AudioPlan["events"] = [];
  const preload = new Set<string>();
  let t = 0;
  let first = true;
  for (const p of plans) {
    if (!p || p.events.length === 0) continue;
    if (!first) t += gapSec;
    first = false;
    for (const e of p.events) events.push({ ...e, at: e.at + t });
    for (const s of p.preload) preload.add(s);
    t += p.durationSec;
  }
  return { events, durationSec: t, preload: [...preload].sort() };
}

const TONE_ROLE = (semis: number): "root" | "third" | "fifth" | "seventh" => {
  const s = mod(semis, 12);
  if (s === 0) return "root";
  if (s === 3 || s === 4) return "third";
  if (s >= 6 && s <= 8) return "fifth";
  return "seventh";
};
const QUALITY_TONES: Readonly<
  Record<string, Partial<Record<"root" | "third" | "fifth" | "seventh", number>>>
> = {
  maj: { root: 0, third: 4, fifth: 7 },
  min: { root: 0, third: 3, fifth: 7 },
  dim: { root: 0, third: 3, fifth: 6 },
  aug: { root: 0, third: 4, fifth: 8 },
  "7": { root: 0, third: 4, fifth: 7, seventh: 10 },
  maj7: { root: 0, third: 4, fifth: 7, seventh: 11 },
  m7: { root: 0, third: 3, fifth: 7, seventh: 10 },
  m7b5: { root: 0, third: 3, fifth: 6, seventh: 10 },
  dim7: { root: 0, third: 3, fifth: 6, seventh: 9 },
};

/**
 * The same voicing with another quality: every note keeps its octave and its role (root, 3rd, 5th, 7th) and
 * moves to that role in `quality`. Null when the chord has a tone the quality lacks.
 */
export function revoice(midis: readonly number[], rootPc: number, quality: ChordQuality): number[] | null {
  const tones = QUALITY_TONES[quality];
  if (!tones) return null;
  const out: number[] = [];
  for (const m of midis) {
    const role = TONE_ROLE(m - rootPc);
    const want = tones[role];
    if (want === undefined) return null;
    const base = m - mod(m - rootPc, 12);
    out.push(base + want);
  }
  return out;
}

const INVERSION_ROLES = ["root", "third", "fifth", "seventh"] as const;
const INVERSION_IDS = ["root", "first", "second", "third"] as const;

/** The chord's upper notes over the bass an inversion asks for ("first": the 3rd in the bass). */
export function withBass(
  midis: readonly number[],
  rootPc: number,
  quality: ChordQuality,
  inversion: (typeof INVERSION_IDS)[number],
): number[] | null {
  const tones = QUALITY_TONES[quality];
  const role = INVERSION_ROLES[INVERSION_IDS.indexOf(inversion)];
  const semis = role ? tones?.[role] : undefined;
  if (semis === undefined || midis.length < 2) return null;
  const sorted = [...midis].sort((a, b) => a - b);
  const upper = sorted.slice(1);
  const top = upper[0] as number;
  const pc = mod(rootPc + semis, 12);
  const bass = top - 1 - mod(top - 1 - pc, 12);
  return [bass, ...upper];
}

/**
 * "Yours, then it" for a chord: the learner's quality (or inversion) on the same chord, then the chord itself.
 * Null when the answer was right or cannot be voiced.
 */
export function chordComparePlan(trial: Trial<unknown>, got: Answer | null): AudioPlan | null {
  const midis = trial.params.midis;
  const rootPc = trial.params.rootPc;
  if (!got || !Array.isArray(midis) || typeof rootPc !== "number") return null;
  const its = [...(midis as number[])];
  let yours: number[] | null = null;
  const gotQ = got.qualities?.[0];
  const expQ = (trial.expected as Answer).qualities?.[0];
  if (gotQ && expQ && gotQ !== expQ) yours = revoice(its, rootPc, gotQ);
  const gotInv = got.choice?.[0];
  const expInv = (trial.expected as Answer).choice?.[0];
  const quality = loneQuality(trial);
  if (
    !yours &&
    gotInv &&
    expInv &&
    gotInv !== expInv &&
    quality &&
    (INVERSION_IDS as readonly string[]).includes(gotInv)
  )
    yours = withBass(its, rootPc, quality, gotInv as (typeof INVERSION_IDS)[number]);
  if (!yours) return null;
  const sound = chordSlotsOf(trial)[0]?.sounds.chords ?? "piano";
  const chord = (notes: number[], at: number) =>
    notes.map((note) => ({ at, dur: 1.3, value: { s: sound, note, gain: 0.55 } }));
  return { events: [...chord(yours, 0), ...chord(its, 1.9)], durationSec: 3.4, preload: [sound] };
}

// --- staged chord dictation: bass → quality → numerals ---------------------------------------------

export type ChordStep = "bass" | "quality" | "rn";
export const CHORD_STEPS: readonly ChordStep[] = ["bass", "quality", "rn"];
export const STEP_TITLES: Readonly<Record<ChordStep, string>> = {
  bass: "Bass",
  quality: "Quality",
  rn: "Numerals",
};
/** Pass mark of a step before the next one opens (contracts §6.6 X1, the `stagePass` default). */
export const STEP_PASS = 0.8;

export interface StagedKey {
  key: KeySpec;
  bass: Degree[];
  quality: ChordQuality[];
  rn: string[];
}

/** The three answers of a chord dictation trial, from the chords it sounds (`@oak/theory`). */
export function stagedKeyOf(trial: Trial<unknown>): StagedKey | null {
  if (!isStagedTrial(trial)) return null;
  const key = keyParam(trial) as KeySpec;
  const rn = (trial.expected as Answer).rn as string[];
  const slots = chordSlotsOf(trial);
  if (slots.length !== rn.length) return null;
  const quality = slots.map((s, i) => {
    const read = s.reading?.quality;
    if (read) return read;
    return (romanParts(rn[i] as string, key)?.quality ?? "maj") as ChordQuality;
  });
  return { key, bass: slots.map((s) => bassDegreeOf(s, key)), quality, rn };
}

const TRIADS: readonly ChordQuality[] = ["maj", "min", "dim"];
const SEVENTHS: readonly ChordQuality[] = ["maj7", "7", "m7", "m7b5", "dim7"];
const MAJOR_SET: readonly Degree[] = ["1", "2", "3", "4", "5", "6", "7"];
const MINOR_SET: readonly Degree[] = ["1", "2", "b3", "4", "5", "b6", "b7"];

/** The answer widget of one step (the answers registry's degree pad, quality pad and Roman-numeral palette). */
export function stepSpecOf(
  trial: Trial<unknown>,
  step: ChordStep,
  opts: { syllables?: boolean } = {},
): AnswerSpec | null {
  const k = stagedKeyOf(trial);
  if (!k) return null;
  const n = k.rn.length;
  if (step === "bass") {
    const base = isMinorMode(k.key) ? MINOR_SET : MAJOR_SET;
    const extra = k.bass.filter((d) => !base.includes(d));
    const set = [...base, ...extra].sort((a, b) => degreeSemitones(a) - degreeSemitones(b));
    return { ui: "degree-pad", set, sequenceLen: n, syllables: opts.syllables === true };
  }
  if (step === "quality") {
    const sevenths = k.quality.some((q) => SEVENTHS.includes(q));
    const base = sevenths ? SEVENTHS : TRIADS;
    const set = [...base, ...k.quality.filter((q) => !base.includes(q))];
    return { ui: "quality-pad", set: [...new Set(set)] };
  }
  const allow = trial.params.rnAllow;
  const ok = ["triads", "sevenths", "inversions", "secondary", "borrowed"] as const;
  const list = Array.isArray(allow)
    ? (allow.filter((a) => (ok as readonly string[]).includes(a)) as (typeof ok)[number][])
    : [];
  return { ui: "rn-palette", slots: n, allow: list.length > 0 ? list : ["triads"] };
}

export interface StepResult {
  credit: number;
  passed: boolean;
  /** One mark per chord. */
  marks: boolean[];
}

const normDegree = (d: string): string => d.replace("♭", "b").replace("♯", "#").trim();
function sameRn(a: string, b: string, key: KeySpec): boolean {
  const pa = romanParts(a, key);
  const pb = romanParts(b, key);
  if (pa && pb)
    return (
      pa.degree === pb.degree &&
      pa.alt === pb.alt &&
      pa.quality === pb.quality &&
      pa.inversion === pb.inversion
    );
  return a.replace(/\s+/g, "") === b.replace(/\s+/g, "");
}

/** One step checked chord by chord: degrees and qualities as such, numerals by (degree, quality, inversion). */
export function gradeStep(trial: Trial<unknown>, step: ChordStep, answer: Answer): StepResult {
  const k = stagedKeyOf(trial);
  if (!k) return { credit: 0, passed: false, marks: [] };
  const want: string[] = step === "bass" ? k.bass : step === "quality" ? k.quality : k.rn;
  const got: string[] =
    (step === "bass" ? answer.degrees : step === "quality" ? answer.qualities : answer.rn)?.map(String) ?? [];
  const marks = want.map((w, i) => {
    const g = got[i];
    if (g === undefined || g === "") return false;
    if (step === "bass") return normDegree(g) === normDegree(w);
    if (step === "rn") return sameRn(g, w, k.key);
    return g === w;
  });
  const credit = want.length === 0 ? 0 : marks.filter(Boolean).length / want.length;
  return { credit, passed: credit >= STEP_PASS - 1e-9, marks };
}

/** The expected answer of a step, as a grader `Answer`. */
export function stepExpected(trial: Trial<unknown>, step: ChordStep): Answer | null {
  const k = stagedKeyOf(trial);
  if (!k) return null;
  if (step === "bass") return { degrees: k.bass };
  if (step === "quality") return { qualities: k.quality };
  return { rn: k.rn };
}

// --- the sung bass line ------------------------------------------------------------------------------

export interface SungTargetSpec {
  midi: number;
  /** Seconds from the start of the response window. */
  on: number;
  off: number;
}

/**
 * Targets for singing the roots of a bass-degree trial: one per chord, at the chord's own time while the
 * chords play without their bass, each moved by octaves to the middle of the learner's comfortable range.
 */
export function bassSingTargets(
  trial: Trial<unknown>,
  profile: Pick<LearnerProfile, "comfLow" | "comfHigh">,
): SungTargetSpec[] {
  const slots = chordSlotsOf(trial);
  const mid = (profile.comfLow + profile.comfHigh) / 2;
  return slots.map((s) => {
    const midi = s.bass + 12 * Math.round((mid - s.bass) / 12);
    const on = s.at / trial.cps;
    const len = s.dur / trial.cps;
    return { midi, on: on + Math.min(0.08, 0.25 * len), off: on + len * 0.9 };
  });
}

/** The passage without its bass (what plays while the roots are sung). */
export function chordsOnlyPlan(trial: Trial<unknown>): AudioPlan {
  const cueBars = Number(trial.params.cueBars ?? 0);
  const events = trial.events.filter((e) => e.track !== "bass");
  const bars = Math.max(1, Number(trial.params.bars ?? 1) - cueBars);
  return eventsToAudioPlan(events, trial.cps, { fromBar: cueBars, bars });
}

/** The degrees heard in a sung bass line, one per chord (null where no steady note reached the mic). */
export function sungBassDegrees(trial: Trial<unknown>, notes: readonly SungSummary[]): (Degree | null)[] {
  const key = keyParam(trial);
  const n = chordSlotsOf(trial).length;
  return Array.from({ length: n }, (_, i) => {
    const m = notes[i]?.midi;
    return key && typeof m === "number" ? labelPitch(m, key).degree : null;
  });
}

/** Per-note summaries aligned one to one with `count` targets (a missing note is a miss, never dropped). */
export function alignNotes(notes: readonly SungSummary[], count: number): SungSummary[] {
  return Array.from({ length: count }, (_, i) => notes[i] ?? { midi: null, cents: null, credit: 0 });
}
