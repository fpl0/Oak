// Wave 7 (the jazz track): the sung lines of J1–J5 and fam.jzz.guide, each with its Quiet path.
//
//   the guide-tone line through a ii–V–I in any key, major or minor (J1.L04, J2.L01–L02)  `twoFiveOneGuideTones`
//   a tension sung over its chord: the 9, the 13 (J2.L03; deck.jzz.tensions' sung side)  `tensionTargets`,
//                                                                                          `gradeSungTensions`
//   the roots of a walking bass, one per chord, sung while the changes play (J3.L04)      `walkingRootTargets`,
//                                                                                          `gradeSungRoots`
//
// The one rule for a sung note stays `gradeSung` (contracts §8.1). What these add is the chord around the note: a
// wrong note that is another tone of the chord is said as that tone ("over G7 you sang the root, G; the 9 is a
// step above it"), and a tension sung a half step off is judged as the other note it is (the ♭9 for the 9, the
// ♭7 for the 13), never as a flat or sharp 9. Singing never gates anything (contracts §7.6, §8.5): every line has a
// pick list for Quiet mode (`QuietPick`, graded by `gradeQuietPicks` with `modality: "fallback"`).
import type { Diagnostic, LearnerProfile, SingTolerance } from "@oak/content-kit";
import {
  type CadenceMode,
  type ChordId,
  chordNotes,
  chordPcs,
  chordSymbol,
  parseChordWithBass,
  twoFiveOne,
} from "@oak/theory";
import { type GuideToneTarget, guideToneTargets, type QuietOption, type QuietPick } from "./colour-lines.ts";
import { type GradeSungOptions, gradeSung } from "./sung.ts";
import type { PitchFrame, SungResult, SungTarget } from "./types.ts";

const mod12 = (n: number) => ((Math.round(n) % 12) + 12) % 12;
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
/** The MIDI note of pitch class `pc` nearest `around` (ties go down). */
const nearestTo = (pc: number, around: number): number => {
  let m = around - mod12(around - pc);
  if (around - m > 6) m += 12;
  return m;
};
/** The pitch class of a spelled note name ("Bb", "F#"). */
const pcOfName = (name: string): number | null => {
  const c = parseChordWithBass(name);
  return c ? c.rootPc : null;
};
const centreOf = (o: { around?: number; profile?: Pick<LearnerProfile, "comfLow" | "comfHigh"> }): number =>
  o.around ?? (o.profile ? Math.round((o.profile.comfLow + o.profile.comfHigh) / 2) : 64);

// --- the ii–V–I guide-tone line in any key ---------------------------------------------------------------------

/**
 * The guide-tone line through a ii–V–I (`twoFiveOne` of @oak/theory: Dm7 G7 C^7 in C; Dm7b5 G7alt Cm7 in C minor,
 * or with the dominant J2.L02 starts from, G7b9): one note per chord, starting on the 3rd or the 7th, then the
 * nearer guide tone at each change — F, F, E in C from the 3rd; C, B, B from the 7th. Placed around the middle of the
 * learner's comfort range (or `around`), `repeat` times in a row.
 */
export function twoFiveOneGuideTones(o: {
  tonic: string;
  mode?: CadenceMode;
  dominant?: "7alt" | "7b9" | "7";
  minorTonic?: "m7" | "m6" | "mMaj7";
  start?: "third" | "seventh";
  chordSec: number;
  startAt?: number;
  around?: number;
  profile?: Pick<LearnerProfile, "comfLow" | "comfHigh">;
  hold?: number;
  repeat?: number;
}): GuideToneTarget[] {
  const cadence = twoFiveOne(o.tonic, o.mode ?? "major", {
    ...(o.dominant ? { dominant: o.dominant } : {}),
    ...(o.minorTonic ? { tonic: o.minorTonic } : {}),
  });
  const chords: string[] = [];
  for (let k = 0; k < Math.max(1, o.repeat ?? 1); k++) chords.push(...cadence.symbols);
  return guideToneTargets({
    chords,
    chordSec: o.chordSec,
    ...(o.start ? { start: o.start } : {}),
    ...(o.startAt !== undefined ? { startAt: o.startAt } : {}),
    around: centreOf(o),
    ...(o.hold !== undefined ? { hold: o.hold } : {}),
  });
}

// --- naming a note against its chord --------------------------------------------------------------------------

/** What a pitch class is over a chord, as the jazz track says it: "the root", "the 3rd", "the 9", "the ♭13". */
export function roleOver(chord: ChordId | string, pc: number): string {
  const c = asChord(chord);
  const own = new Set(chordPcs(c).map((p) => mod12(p - c.rootPc)));
  const s = mod12(pc - c.rootPc);
  const minorThird = own.has(3) && !own.has(4);
  const flatFive = own.has(6) && !own.has(7);
  const sharpFive = own.has(8) && !own.has(7) && !/alt|b13/.test(c.quality);
  const sixth = own.has(9) && /^(6|m6|69|dim7|o7)$/.test(c.quality);
  switch (s) {
    case 0:
      return "the root";
    case 1:
      return "the ♭9";
    case 2:
      return /sus2/.test(c.quality) ? "the 2nd" : "the 9";
    case 3:
      return minorThird ? "the 3rd" : "the ♯9";
    case 4:
      return "the 3rd";
    case 5:
      return /sus/.test(c.quality) && !/sus2/.test(c.quality) ? "the 4th" : "the 11";
    case 6:
      return flatFive ? "the 5th" : "the ♯11";
    case 7:
      return "the 5th";
    case 8:
      return sharpFive ? "the 5th" : "the ♭13";
    case 9:
      return sixth ? (/dim7|o7/.test(c.quality) ? "the 7th" : "the 6th") : "the 13";
    case 10:
      return "the 7th";
    default:
      return own.has(11) ? "the 7th" : "the major 7th";
  }
}

/** A tension the jazz track sings, in its ASCII spelling. */
export type SungTension = "9" | "b9" | "#9" | "11" | "#11" | "13" | "b13";
const TENSION_SEMIS: Record<SungTension, number> = {
  b9: 1,
  "9": 2,
  "#9": 3,
  "11": 5,
  "#11": 6,
  b13: 8,
  "13": 9,
};
/** A quality that holds each tension, so `chordNotes` spells it from the chord's root (E♭ for the ♭9 of D). */
const TENSION_SPELLER: Record<SungTension, string> = {
  b9: "7b9",
  "9": "9",
  "#9": "7#9",
  "11": "m11",
  "#11": "7#11",
  b13: "7b13",
  "13": "13",
};
/** "♭9", "13": a tension as the course writes it. */
export function tensionText(t: SungTension): string {
  return t.replace("b", "♭").replace("#", "♯");
}
/** The tension's note name over a chord root: the 9 of D is E, the ♭9 of A is B♭. */
export function tensionName(root: string, t: SungTension): string {
  const rootPc = pcOfName(root);
  if (rootPc === null) throw new RangeError(`@oak/pitch: not a note name: "${root}"`);
  const want = mod12(rootPc + TENSION_SEMIS[t]);
  const speller = parseChordWithBass(`${root}${TENSION_SPELLER[t]}`);
  const spelled = speller ? chordNotes(speller).find((n) => pcOfName(n) === want) : undefined;
  return spelled ?? root;
}

// --- tensions sung over a chord (J2.L03) -----------------------------------------------------------------------

export interface TensionTarget extends SungTarget {
  /** The chord as a lead sheet writes it ("G7", "Dm7"). */
  chord: string;
  chordId: ChordId;
  tension: SungTension;
  /** "the 9". */
  role: string;
  /** The note's name over this chord ("A"). */
  name: string;
  /** The chord's tones and this tension, each in the octave nearest the target, lowest first. */
  tones: { role: string; name: string; midi: number }[];
}

/**
 * Sing targets for tensions over chords: each item is one chord with the tension sung over it (the 9 over Dm7, the
 * 13 over G7), lasting `chordSec`. The note sits in the octave nearest `around` (default the middle of the comfort
 * range). The notes a half step either side are declared neighbours, so a ♭9 sung for the 9 is that note, not a
 * sharp or flat 9 (`gradeSung` gives it no credit and `gradeSungTensions` names it).
 */
export function tensionTargets(o: {
  items: readonly { chord: ChordId | string; tension: SungTension }[];
  chordSec: number;
  startAt?: number;
  around?: number;
  profile?: Pick<LearnerProfile, "comfLow" | "comfHigh">;
  /** Sung share of each chord (default 0.9). */
  hold?: number;
}): TensionTarget[] {
  const around = centreOf(o);
  const start = o.startAt ?? 0;
  const hold = Math.min(1, Math.max(0.2, o.hold ?? 0.9));
  return o.items.map((item, i) => {
    const c = asChord(item.chord);
    const midi = nearestTo(mod12(c.rootPc + TENSION_SEMIS[item.tension]), around);
    const names = chordNotes(c);
    const pcs = chordPcs(c);
    const tones = pcs
      .slice(0, 4)
      .map((pc, k) => ({ role: roleOver(c, pc), name: names[k] ?? "", midi: nearestTo(pc, midi) }))
      .filter((t) => mod12(t.midi) !== mod12(midi));
    const name = tensionName(c.root, item.tension);
    tones.push({ role: `the ${tensionText(item.tension)}`, name, midi });
    tones.sort((a, b) => a.midi - b.midi);
    return {
      midi,
      on: start + i * o.chordSec,
      off: start + (i + hold) * o.chordSec,
      chord: chordText(item.chord),
      chordId: c,
      tension: item.tension,
      role: `the ${tensionText(item.tension)}`,
      name,
      tones,
      neighbours: [
        { midi: midi - 1, kind: "diatonic" },
        { midi: midi + 1, kind: "diatonic" },
      ],
    };
  });
}

/** What was sung over one chord of a tension line or a root line. */
export interface ChordNote {
  index: number;
  chord: string;
  /** What the sung note was over the chord ("the root", "the ♭9"); `null` when nothing was heard. */
  sang: string | null;
  /** The sung note's name in the chord's spelling where it is one of the chord's tones, else a sharp name. */
  sangName: string | null;
  right: boolean;
}
export interface ChordLineResult extends SungResult {
  line: ChordNote[];
}

const SHARP_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

/**
 * Re-says each per-note line of a sung result against its chord: a note sung as another tone of the chord (or as a
 * tension a half step away) becomes `id` with the chord, the role and name sung, and the role and name asked. Credit,
 * score and pass stay `gradeSung`'s.
 */
function explainOverChords<T extends SungTarget & { chord: string; role: string; name: string }>(
  result: SungResult,
  targets: readonly T[],
  chords: readonly ChordId[],
  tonesOf: (i: number) => readonly { role: string; name: string; midi: number }[],
  id: Diagnostic["id"],
): ChordLineResult {
  const line: ChordNote[] = targets.map((t, i) => {
    const n = result.notes[i];
    const c = chords[i] as ChordId;
    if (!n || n.sungMidi === null)
      return { index: i, chord: t.chord, sang: null, sangName: null, right: false };
    const pc = mod12(n.sungMidi);
    const tone = tonesOf(i).find((x) => mod12(x.midi) === pc);
    return {
      index: i,
      chord: t.chord,
      sang: roleOver(c, pc),
      sangName: tone?.name ?? (SHARP_NAMES[pc] as string),
      right: n.credit === 1,
    };
  });
  const diagnostics: Diagnostic[] = result.diagnostics.map((d) => {
    const slot = d.where?.slot;
    const t = slot === undefined ? undefined : targets[slot];
    const n = slot === undefined ? undefined : line[slot];
    if (!t || !n) return d;
    const wrong = d.id === "sing.wrong-note" || d.id === "sing.neighbour" || d.id === "sing.plain-scale";
    if (wrong && n.sang !== null && n.sang !== t.role) {
      const sung = result.notes[slot as number]?.sungMidi ?? null;
      const semis = sung === null ? 0 : Math.round(sung - t.midi);
      return {
        id,
        severity: "error",
        dim: "pitch",
        ...(d.where ? { where: d.where } : {}),
        params: {
          i: (slot as number) + 1,
          chord: t.chord,
          gotRole: n.sang,
          got: n.sangName ?? "",
          expRole: t.role,
          exp: t.name,
          dir: semis < 0 ? "below" : "above",
          step:
            Math.abs(semis) === 1
              ? "a half step"
              : Math.abs(semis) === 2
                ? "a whole step"
                : "more than a step",
        },
      };
    }
    // Every other per-note line names the chord and the note asked.
    if (typeof d.params.expMidi === "number")
      return { ...d, params: { ...d.params, chord: t.chord, expRole: t.role, exp: t.name } };
    return d;
  });
  return { ...result, diagnostics, line };
}

/**
 * Grades sung tensions with `gradeSung` (timed: one window per chord) and names each wrong note against its chord
 * (`sing.tension`: "over G7 you sang the root (G), a whole step below the 9 (A)"). Credit, score and pass are
 * `gradeSung`'s; the octave policy is the tolerance's.
 */
export function gradeSungTensions(
  frames: readonly PitchFrame[],
  targets: readonly TensionTarget[],
  tol: SingTolerance,
  profile: LearnerProfile,
  opts: GradeSungOptions = {},
): ChordLineResult {
  const result = gradeSung(frames, targets, tol, "pitch", profile, opts);
  const chords = targets.map((t) => t.chordId);
  return explainOverChords(result, targets, chords, (i) => targets[i]?.tones ?? [], "sing.tension");
}

// --- walking-bass roots (J3.L04) -------------------------------------------------------------------------------

export interface RootTarget extends SungTarget {
  chord: string;
  chordId: ChordId;
  role: "the root";
  /** The root's name ("B♭" is "Bb"). */
  name: string;
  /** Semitones from the root before (0 on the first). */
  move: number;
  /** The chord's tones in the octave around the root, lowest first. */
  tones: { role: string; name: string; midi: number }[];
}

/**
 * Sing targets for the roots under a walking bass: one note per chord on its first beat, held for `hold` of the
 * chord. Each root is the octave nearest the root before (the smallest leap: a fourth up or a fifth down sings as a
 * fourth), the line starting a fourth above the bottom of the learner's comfort range (default C3 without a
 * profile) and folded back by an octave wherever it would leave the comfort range.
 */
export function walkingRootTargets(o: {
  chords: readonly (ChordId | string)[];
  chordSec: number;
  startAt?: number;
  /** Where the line starts (MIDI); default comfLow + 5. */
  around?: number;
  profile?: Pick<LearnerProfile, "comfLow" | "comfHigh">;
  hold?: number;
}): RootTarget[] {
  const chords = o.chords.map(asChord);
  const start = o.startAt ?? 0;
  const hold = Math.min(1, Math.max(0.2, o.hold ?? 0.9));
  const lo = o.profile?.comfLow ?? 43;
  const hi = o.profile?.comfHigh ?? 62;
  let prev: number | null = null;
  return chords.map((c, i) => {
    let midi = nearestTo(c.rootPc, prev ?? o.around ?? lo + 5);
    if (o.profile || o.around === undefined) {
      while (midi < lo) midi += 12;
      while (midi > hi && midi - 12 >= lo) midi -= 12;
    }
    const move = prev === null ? 0 : midi - prev;
    prev = midi;
    const names = chordNotes(c);
    const tones = chordPcs(c)
      .slice(0, 4)
      .map((pc, k) => ({ role: roleOver(c, pc), name: names[k] ?? "", midi: nearestTo(pc, midi + 5) }))
      .sort((a, b) => a.midi - b.midi);
    return {
      midi,
      on: start + i * o.chordSec,
      off: start + (i + hold) * o.chordSec,
      chord: chordText(o.chords[i] as ChordId | string),
      chordId: c,
      role: "the root" as const,
      name: names[0] ?? c.root,
      move,
      tones,
    };
  });
}

/**
 * Grades sung roots with `gradeSung` (timed, one window per chord) and names a wrong note that is another tone of
 * the chord (`sing.root`: "over D7 you sang the 3rd (F♯); the root is D"). Credit, score and pass are `gradeSung`'s.
 */
export function gradeSungRoots(
  frames: readonly PitchFrame[],
  targets: readonly RootTarget[],
  tol: SingTolerance,
  profile: LearnerProfile,
  opts: GradeSungOptions = {},
): ChordLineResult {
  const result = gradeSung(frames, targets, tol, "pitch", profile, opts);
  const chords = targets.map((t) => t.chordId);
  return explainOverChords(result, targets, chords, (i) => targets[i]?.tones ?? [], "sing.root");
}

// --- Quiet mode: pick the note (contracts §8.5) ----------------------------------------------------------------

const pickOf = (
  index: number,
  prompt: string,
  tones: readonly { role: string; name: string; midi: number }[],
  role: string,
): QuietPick => {
  const options: QuietOption[] = tones
    .map((x) => ({ id: x.role, label: x.role.replace(/^the /, ""), sub: x.name, midi: x.midi }))
    .sort((a, b) => a.midi - b.midi);
  return { index, prompt, options, correct: options.findIndex((x) => x.id === role) };
};

/** The Quiet path of a tension line: over each chord, which note is the tension (among the chord's tones and it). */
export function tensionQuietPicks(targets: readonly TensionTarget[]): QuietPick[] {
  return targets.map((t, i) => pickOf(i, `Over ${t.chord}: ${t.role}`, t.tones, t.role));
}
/** The Quiet path of a root line: over each chord, which of its tones is the root. */
export function rootQuietPicks(targets: readonly RootTarget[]): QuietPick[] {
  return targets.map((t, i) => pickOf(i, `Over ${t.chord}: the root`, t.tones, "the root"));
}

/**
 * Catalog texts for the ids this module adds (the grader's catalog owns what the app shows; these are the rows it is
 * sent). Slots are the diagnostics' params. The note asked is the note the step plays and shows.
 */
export const JAZZ_SING_FEEDBACK: Readonly<Record<string, string>> = {
  "sing.tension": "Note {i}, over {chord}: you sang {gotRole} ({got}), {step} {dir} {expRole} ({exp}).",
  "sing.root": "Note {i}, over {chord}: you sang {gotRole} ({got}). The bass walks from {expRole}, {exp}.",
};

/** Renders one of this module's diagnostics with `JAZZ_SING_FEEDBACK`; `null` for any other id. */
export function jazzSingText(d: Pick<Diagnostic, "id" | "params">): string | null {
  const template = JAZZ_SING_FEEDBACK[d.id];
  if (!template) return null;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(d.params[k] ?? ""));
}
