// Wave 6: the sung lines of U12–U15 and their Quiet path.
//
//   chromatic degrees (U15.L01: fi, si, di, te …)   `chromaticTargets`
//   a mode's colour tone (U14: ♭7, the raised 6, ♯4, ♭2) `modalTargets`
//   a guide-tone line over a progression (U12.L05)    `guideToneTargets`, `gradeGuideTones`
//
// The one rule for a sung note stays `gradeSung` (contracts §8.1). What these targets add is the note a half step
// away that a learner sings in the target's place — the key's own note beside a chromatic degree (fa for fi), the
// plain scale's note beside a mode's colour (the minor ♭6 for Dorian's 6) — so that slip is judged as the other
// note it is and explained (`SungTarget.neighbours`, `sing.neighbour`, `sing.plain-scale`), and, for a guide-tone
// line, which chord tone was sung instead (`sing.guide-tone`, `sing.guide-tone-other`).
//
// Quiet mode (contracts §8.5) never opens the microphone: every line here has a pick list (`quietPicks`): per note
// the target among the notes it is confused with, each with the MIDI note the host plays, graded by
// `gradeQuietPicks` with `modality: "fallback"` (no evidence for the voice nodes, no penalty, nothing gated).
import type { Degree, Diagnostic, KeySpec, LearnerProfile, SingTolerance } from "@oak/content-kit";
import {
  type ChordId,
  characteristicTonesOf,
  chordNotes,
  chordPcs,
  chordSymbol,
  chromaticDegree,
  guideToneLine,
  keyDisplay,
  labelPitch,
  modeFamilyKey,
  parseChordWithBass,
  scalePcs,
  syllableOf,
} from "@oak/theory";
import { type DegreeNote, type DegreeTarget, degreeSemitones, degreeText } from "./degrees.ts";
import { type GradeSungOptions, gradeSung } from "./sung.ts";
import type { PitchFrame, SungNeighbour, SungResult, SungTarget } from "./types.ts";

const mod12 = (n: number) => ((Math.round(n) % 12) + 12) % 12;
const MAJOR_SEMIS = [0, 2, 4, 5, 7, 9, 11] as const;

// --- chromatic degrees (U15.L01) -------------------------------------------------------------------------------

/** A sung target that knows what it leans to and what it is mistaken for. */
export interface ColourTarget extends DegreeTarget {
  /** The note is outside the key's own scale (a chromatic degree), or is the mode's colour tone. */
  colour: "chromatic" | "mode" | null;
  /** Chromatic degrees: the degree it leans on to (♯4 → 5, ♭7 → 6), with its syllable and pitch. */
  resolvesTo?: { degree: Degree; syllable: string; midi: number };
  /** Colour tones: the plain scale it departs from ("D minor") and that scale's own note here. */
  plain?: { scale: string; degree: Degree; syllable: string; midi: number };
}

/**
 * Sing targets for a line with chromatic degrees (contracts §2.3 U15.L01; the syllables are chromatic solfège:
 * di ri fi si li up, te le se me ra down). Like `degreeTargets`; in addition every note outside the key's scale
 * names the key's own notes a half step either side as its `neighbours` (♯4 in C: F and G) and the degree it
 * leans to (`resolvesTo`), so `gradeSung` reads fa-for-fi as fa.
 */
export function chromaticTargets(o: {
  key: KeySpec;
  tonicMidi: number;
  notes: readonly DegreeNote[];
  startAt?: number;
}): ColourTarget[] {
  const start = o.startAt ?? 0;
  const own = new Set(scalePcs(o.key) as number[]);
  return o.notes.map((n) => {
    const midi = o.tonicMidi + degreeSemitones(n.degree) + 12 * (n.octave ?? 0);
    const t: ColourTarget = {
      midi,
      on: start + n.at,
      off: start + n.at + n.dur,
      degree: n.degree,
      syllable: syllableOf(n.degree),
      colour: null,
    };
    if (own.has(mod12(midi))) return t;
    t.colour = "chromatic";
    const neighbours: SungNeighbour[] = [];
    for (const d of [-1, 1])
      if (own.has(mod12(midi + d))) neighbours.push({ midi: midi + d, kind: "diatonic" });
    if (neighbours.length > 0) t.neighbours = neighbours;
    const info = chromaticDegree(n.degree);
    if (info) {
      // The resolution is the diatonic neighbour in the direction of the lean: up for a raised note.
      const to = midi + (info.raised ? 1 : -1);
      t.resolvesTo = { degree: info.resolvesTo, syllable: syllableOf(info.resolvesTo), midi: to };
    }
    return t;
  });
}

// --- modal colour tones (U14) ----------------------------------------------------------------------------------

/**
 * Sing targets for a line in a mode (U14.L03 Drunken Sailor bar 6, U14.L06): degrees are relative to major as
 * everywhere ("b7" in Mixolydian, "6" in Dorian, "#4" in Lydian, "b2" in Phrygian). Each colour tone of the mode
 * (`characteristicTonesOf`) names as its neighbour the note the plain scale has there — major for Mixolydian and
 * Lydian, natural minor for Dorian and Phrygian — which is the note a learner falls back to: 7 for ♭7, ♭6 for
 * the raised 6, 4 for ♯4, 2 for ♭2.
 */
export function modalTargets(o: {
  key: KeySpec;
  tonicMidi: number;
  notes: readonly DegreeNote[];
  startAt?: number;
}): ColourTarget[] {
  const start = o.startAt ?? 0;
  const colours = new Map(characteristicTonesOf(o.key).map((c) => [c.degree, c]));
  const family = modeFamilyKey(o.key);
  const plainSemis = family.mode === "minor" ? [0, 2, 3, 5, 7, 8, 10] : MAJOR_SEMIS;
  return o.notes.map((n) => {
    const midi = o.tonicMidi + degreeSemitones(n.degree) + 12 * (n.octave ?? 0);
    const t: ColourTarget = {
      midi,
      on: start + n.at,
      off: start + n.at + n.dur,
      degree: n.degree,
      syllable: syllableOf(n.degree),
      colour: null,
    };
    if (!colours.has(n.degree)) return t;
    const number = Number(/[1-7]/.exec(n.degree)?.[0] ?? "1");
    const semis = plainSemis[number - 1] as number;
    const plainMidi = midi + (semis - mod12(degreeSemitones(n.degree)));
    // Plain major and minor have no note that departs from themselves.
    if (plainMidi !== midi) {
      t.colour = "mode";
      const plainDegree = labelPitch(o.tonicMidi + semis, family).degree;
      t.neighbours = [{ midi: plainMidi, kind: "parallel" }];
      t.plain = {
        scale: keyDisplay(family),
        degree: plainDegree,
        syllable: syllableOf(plainDegree),
        midi: plainMidi,
      };
    }
    return t;
  });
}

/**
 * A sung result named for a chromatic or modal line: every per-note diagnostic gets the target's own degree and
 * syllable (`expDeg`, `expSyl`), what was sung in the key (`gotDeg`, `gotSyl`), and, on the neighbour lines, where
 * the note leans (`leanDeg`, `leanSyl`) or which plain scale the sung note belongs to (`plain`, `mode`). Credit,
 * score and pass are `gradeSung`'s.
 */
export function explainColourResult(
  result: SungResult,
  key: KeySpec,
  targets: readonly ColourTarget[],
): SungResult {
  const named = (d: Diagnostic): Diagnostic => {
    const slot = d.where?.slot;
    const t = slot === undefined ? undefined : targets[slot];
    const p = d.params;
    const extra: Record<string, string | number> = {};
    if (typeof p.expMidi === "number") {
      const exp = t ? t.degree : labelPitch(Math.round(p.expMidi), key).degree;
      extra.expDeg = degreeText(exp);
      extra.expSyl = syllableOf(exp);
    }
    if (typeof p.gotMidi === "number" && Number.isFinite(p.gotMidi)) {
      // The note sung, named in the plain scale when that is what it is (the minor ♭6, "le").
      const plain = t?.plain && mod12(p.gotMidi) === mod12(t.plain.midi) ? t.plain.degree : null;
      const got = plain ?? labelPitch(Math.round(p.gotMidi), key).degree;
      extra.gotDeg = degreeText(got);
      extra.gotSyl = syllableOf(got);
    }
    if (d.id === "sing.neighbour" && t?.resolvesTo) {
      extra.leanDeg = degreeText(t.resolvesTo.degree);
      extra.leanSyl = t.resolvesTo.syllable;
    }
    if (d.id === "sing.plain-scale" && t?.plain) {
      extra.plain = t.plain.scale;
      extra.mode = keyDisplay(key);
    }
    return Object.keys(extra).length > 0 ? { ...d, params: { ...p, ...extra } } : d;
  };
  return { ...result, diagnostics: result.diagnostics.map(named) };
}

// --- guide-tone lines (U12.L05) --------------------------------------------------------------------------------

export type ChordToneRole = "root" | "third" | "fifth" | "seventh";
const ROLE_WORDS: Record<ChordToneRole, string> = {
  root: "root",
  third: "3rd",
  fifth: "5th",
  seventh: "7th",
};
/** "3rd", "7th": a chord tone as the course says it. */
export function chordToneWord(role: ChordToneRole): string {
  return ROLE_WORDS[role];
}

export interface GuideToneTarget extends SungTarget {
  /** The chord as a lead sheet writes it ("Dm7", "Cmaj7"). */
  chord: string;
  role: "third" | "seventh";
  /** The note's name as the chord spells it ("F", "B♭" is "Bb"). */
  name: string;
  /** Semitones moved from the note before (0 on the first chord; negative: down). */
  move: number;
  /** The chord's other guide tone, nearest this one; `null` for a triad or a sus chord. */
  other: { role: "third" | "seventh"; name: string; midi: number } | null;
  /** Every tone of the chord with its role, each in the octave nearest the target. */
  tones: { role: ChordToneRole; name: string; midi: number }[];
}

const asChord = (c: ChordId | string): ChordId => {
  if (typeof c !== "string") return c;
  const parsed = parseChordWithBass(c);
  if (!parsed) throw new RangeError(`@oak/pitch: not a chord symbol: "${c}"`);
  return parsed;
};
const chordText = (c: ChordId | string): string => {
  if (typeof c === "string") return chordSymbol(c, "lead-sheet") ?? c;
  const notes = chordNotes(c);
  return `${notes[0] ?? c.root}${c.quality === "maj" ? "" : c.quality}`;
};
const nearestTo = (pc: number, around: number): number => {
  let m = around - mod12(around - pc);
  if (around - m > 6) m += 12;
  return m;
};

/**
 * Sing targets for the guide-tone line through a progression (`guideToneLine` of @oak/theory: start on the 3rd or
 * the 7th, then at each change the nearer guide tone, a common tone first): one note per chord, each chord
 * lasting `chordSec` from `startAt` (or the `times` given). The line is placed around `around` (a MIDI note;
 * default the middle of the learner's comfort range when `profile` is given, else E4) and may be moved again by
 * octaves with `fitToRange`. A chord with no guide tone ends the line there.
 */
export function guideToneTargets(o: {
  chords: readonly (ChordId | string)[];
  start?: "third" | "seventh";
  around?: number;
  profile?: Pick<LearnerProfile, "comfLow" | "comfHigh">;
  startAt?: number;
  /** Seconds each chord lasts. */
  chordSec: number;
  /** Sung part of each chord, as a share of `chordSec` (default 0.9: a breath before the change). */
  hold?: number;
}): GuideToneTarget[] {
  const chords = o.chords.map(asChord);
  const around = o.around ?? (o.profile ? Math.round((o.profile.comfLow + o.profile.comfHigh) / 2) : 64);
  const line = guideToneLine(chords, { ...(o.start ? { start: o.start } : {}), around });
  const start = o.startAt ?? 0;
  const hold = Math.min(1, Math.max(0.2, o.hold ?? 0.9));
  const out: GuideToneTarget[] = [];
  line.forEach((step, i) => {
    if (!step) return;
    const chord = chords[i] as ChordId;
    const names = chordNotes(chord);
    const pcs = chordPcs(chord);
    const roles: ChordToneRole[] = ["root", "third", "fifth", "seventh"];
    const tones = pcs.slice(0, 4).map((pc, k) => ({
      role: roles[k] as ChordToneRole,
      name: names[k] ?? "",
      midi: nearestTo(pc, step.midi),
    }));
    const otherRole = step.role === "third" ? "seventh" : "third";
    const otherTone = tones.find((t) => t.role === otherRole);
    // A triad's "7th" slot does not exist; a sixth chord's fourth tone is not a guide tone.
    const hasSeventh = /7|9|11|13/.test(chord.quality);
    const other =
      otherTone && (otherRole === "third" || hasSeventh)
        ? { role: otherRole as "third" | "seventh", name: otherTone.name, midi: otherTone.midi }
        : null;
    out.push({
      midi: step.midi,
      on: start + i * o.chordSec,
      off: start + (i + hold) * o.chordSec,
      chord: chordText(o.chords[i] as ChordId | string),
      role: step.role,
      name: step.name,
      move: step.move,
      other,
      tones: hasSeventh ? tones : tones.slice(0, 3),
    });
  });
  return out;
}

/** What was sung over one chord of a guide-tone line. */
export interface GuideToneNote {
  index: number;
  chord: string;
  /** The line's note here. */
  role: "third" | "seventh";
  /** The chord tone sung (its pitch class, any octave), `other` for a note outside the chord, `null` when missed. */
  sang: ChordToneRole | "other" | null;
  /** The sung note was the chord's other guide tone and was accepted in the line's place (`acceptOther`). */
  swapped: boolean;
}
export interface GuideToneResult extends SungResult {
  line: GuideToneNote[];
  /** The targets the grade used: the line, with any accepted other guide tone swapped in. */
  targets: GuideToneTarget[];
}

/**
 * Grades a sung guide-tone line with `gradeSung` (mode `guide-tones`: one timed window per chord) and says, for
 * each note that missed, which chord tone it was: `sing.guide-tone` ("over Dm7 you sang the root, D; the guide
 * tone is the 3rd, F") or, for the chord's other guide tone, `sing.guide-tone-other`. With `acceptOther` the
 * other guide tone counts in the line's place (the 7th where the line takes the 3rd is still a guide tone): the
 * take is graded again against that note, by the same rule, and the line is marked `swapped`.
 */
export function gradeGuideTones(
  frames: readonly PitchFrame[],
  targets: readonly GuideToneTarget[],
  tol: SingTolerance,
  profile: LearnerProfile,
  opts: GradeSungOptions & { acceptOther?: boolean } = {},
): GuideToneResult {
  const { acceptOther, ...sungOpts } = opts;
  let used = [...targets];
  let result = gradeSung(frames, used, tol, "guide-tones", profile, sungOpts);
  const roleOf = (t: GuideToneTarget, sungMidi: number | null): ChordToneRole | "other" | null => {
    if (sungMidi === null) return null;
    const pc = mod12(sungMidi);
    return t.tones.find((x) => mod12(x.midi) === pc)?.role ?? "other";
  };
  const swapped = new Set<number>();
  if (acceptOther) {
    const next = used.map((t, i) => {
      const n = result.notes[i];
      if (!n || n.credit === 1 || n.sungMidi === null || !t.other) return t;
      if (roleOf(t, n.sungMidi) !== t.other.role) return t;
      swapped.add(i);
      return {
        ...t,
        midi: t.other.midi,
        role: t.other.role,
        name: t.other.name,
        other: { role: t.role, name: t.name, midi: t.midi },
      };
    });
    if (swapped.size > 0) {
      used = next;
      result = gradeSung(frames, used, tol, "guide-tones", profile, sungOpts);
    }
  }
  const diagnostics: Diagnostic[] = [];
  const line: GuideToneNote[] = used.map((t, i) => {
    const n = result.notes[i];
    const sang = n ? roleOf(t, n.sungMidi) : null;
    return { index: i, chord: t.chord, role: t.role, sang, swapped: swapped.has(i) };
  });
  for (const d of result.diagnostics) {
    const slot = d.where?.slot;
    const t = slot === undefined ? undefined : used[slot];
    const n = slot === undefined ? undefined : line[slot];
    // A wrong note that is another tone of the chord is explained as that tone.
    if (d.id === "sing.wrong-note" && t && n && n.sang !== null && n.sang !== "other" && n.sang !== t.role) {
      const tone = t.tones.find((x) => x.role === n.sang);
      diagnostics.push({
        id: n.sang === t.other?.role ? "sing.guide-tone-other" : "sing.guide-tone",
        severity: n.sang === t.other?.role ? "warn" : "error",
        dim: "pitch",
        ...(d.where ? { where: d.where } : {}),
        params: {
          ...d.params,
          chord: t.chord,
          gotRole: ROLE_WORDS[n.sang],
          got: tone?.name ?? String(d.params.got ?? ""),
          expRole: ROLE_WORDS[t.role],
          exp: t.name,
        },
      });
    } else if (t && typeof d.params.expMidi === "number") {
      // Every other per-note line names the chord and the line's note as the chord spells it.
      diagnostics.push({
        ...d,
        params: { ...d.params, chord: t.chord, expRole: ROLE_WORDS[t.role], exp: t.name },
      });
    } else diagnostics.push(d);
  }
  return { ...result, diagnostics, line, targets: used };
}

// --- Quiet mode: pick the note (contracts §8.5) ----------------------------------------------------------------

export interface QuietOption {
  /** Stable within its pick: "target", "below", "above", "plain", or a chord-tone role. */
  id: string;
  /** What the button says: "♯4", "the 3rd". */
  label: string;
  /** Under it: the syllable or the note name ("fi", "F"). */
  sub: string;
  /** The note the host plays when the option is auditioned. */
  midi: number;
}
export interface QuietPick {
  /** Index of the note in the line. */
  index: number;
  /** What is being asked, for the heading: "Note 2", "Over Dm7". */
  prompt: string;
  /** In pitch order, lowest first. */
  options: QuietOption[];
  /** Index into `options` of the line's own note. */
  correct: number;
}

/**
 * The Quiet path of a chromatic or modal line: one pick per note that has something to confuse it with — the
 * target between the key's own notes a half step either side (4, ♯4, 5), or the mode's colour tone beside the
 * plain scale's note (♭6 and 6 in Dorian). Notes with nothing beside them are not asked.
 */
export function colourQuietPicks(targets: readonly ColourTarget[], key: KeySpec): QuietPick[] {
  const out: QuietPick[] = [];
  targets.forEach((t, index) => {
    if (!t.neighbours || t.neighbours.length === 0) return;
    const options: QuietOption[] = [
      { id: "target", label: degreeText(t.degree), sub: t.syllable, midi: t.midi },
    ];
    for (const n of t.neighbours) {
      const midi = n.midi + 12 * Math.round((t.midi - n.midi) / 12);
      const degree =
        n.kind === "parallel" && t.plain ? t.plain.degree : labelPitch(Math.round(midi), key).degree;
      options.push({
        id: n.kind === "parallel" ? "plain" : midi < t.midi ? "below" : "above",
        label: degreeText(degree),
        sub: syllableOf(degree),
        midi,
      });
    }
    options.sort((a, b) => a.midi - b.midi);
    out.push({
      index,
      prompt: `Note ${index + 1}`,
      options,
      correct: options.findIndex((x) => x.id === "target"),
    });
  });
  return out;
}

/** The Quiet path of a guide-tone line: over each chord, which of its tones the line takes. */
export function guideToneQuietPicks(targets: readonly GuideToneTarget[]): QuietPick[] {
  return targets.map((t, index) => {
    const options: QuietOption[] = t.tones
      .map((x) => ({ id: x.role, label: `the ${ROLE_WORDS[x.role]}`, sub: x.name, midi: x.midi }))
      .sort((a, b) => a.midi - b.midi);
    return {
      index,
      prompt: `Over ${t.chord}`,
      options,
      correct: options.findIndex((x) => x.id === t.role),
    };
  });
}

export interface QuietPickResult {
  /** Always `fallback`: no voice was heard, so nothing here is evidence for a voice node (contracts §8.5). */
  modality: "fallback";
  score: number;
  /** Every pick right. Never gates anything. */
  pass: boolean;
  marks: { index: number; ok: boolean; picked: QuietOption | null; correct: QuietOption }[];
}
/** Grades the picks of a Quiet line: `answers[k]` is the option index chosen for `picks[k]` (`null`: none). */
export function gradeQuietPicks(
  picks: readonly QuietPick[],
  answers: readonly (number | null | undefined)[],
): QuietPickResult {
  const marks = picks.map((p, k) => {
    const a = answers[k];
    const picked = a === null || a === undefined ? null : (p.options[a] ?? null);
    return {
      index: p.index,
      ok: a === p.correct,
      picked,
      correct: p.options[p.correct] as QuietOption,
    };
  });
  const right = marks.filter((m) => m.ok).length;
  return {
    modality: "fallback",
    score: picks.length > 0 ? right / picks.length : 0,
    pass: picks.length > 0 && right === picks.length,
    marks,
  };
}

/**
 * Catalog texts for the ids Wave 6 adds to sung feedback (the grader's catalog owns what the app shows; these are
 * the rows it was sent, and what a host without the catalog can print). Slots are the diagnostics' params after
 * `explainColourResult` / `gradeGuideTones`.
 */
export const COLOUR_FEEDBACK: Readonly<Record<string, string>> = {
  "sing.neighbour":
    "Note {i}: you sang {gotDeg} ({gotSyl}), the key's own note. {expDeg} ({expSyl}) is a half step {dir} it, leaning on to {leanDeg}.",
  "sing.plain-scale":
    "Note {i}: you sang {gotDeg} ({gotSyl}), the note of plain {plain}. The colour of {mode} is {expDeg} ({expSyl}), a half step {dir}.",
  "sing.neighbour-close":
    "Note {i} ({expDeg}) counted, but it was {cents}¢ {dir}: closer to {gotDeg} than to {expDeg}.",
  "sing.guide-tone":
    "Note {i}, over {chord}: you sang the {gotRole} ({got}). The guide tone here is the {expRole} ({exp}).",
  "sing.guide-tone-other":
    "Note {i}, over {chord}: you sang the {gotRole} ({got}), the chord's other guide tone. This line takes the {expRole} ({exp}), the smaller step.",
};

/** Renders one of this module's diagnostics with `COLOUR_FEEDBACK`; `null` for any other id. */
export function colourFeedbackText(d: Pick<Diagnostic, "id" | "params">): string | null {
  const template = COLOUR_FEEDBACK[d.id];
  if (!template) return null;
  return template
    .replace(/\{(\w+)\}/g, (_, k: string) => String(d.params[k] ?? ""))
    .replace(/, leaning on to \./, ".")
    .replace(/\s{2,}/g, " ");
}
