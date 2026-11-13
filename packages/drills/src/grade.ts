// Trial grading: identification answers (choice, degree pad, quality pad, RN palette, number, text,
// keyboard, staff), code answers (mini-notation and `note`/`n` strings, parsed by the same pattern model
// the generators print), taps (`gradeTaps`) and sung notes (`gradeSung`) from @oak/pitch.
import type {
  Answer,
  Diagnostic,
  FamilyDef,
  KeySpec,
  LearnerProfile,
  LevelParams,
  SingMode,
  SingTolerance,
  TapTolerance,
  Trial,
  TrialResult,
} from "@oak/content-kit";
import type { SungTarget } from "@oak/pitch";
import { parseRN, rnToChord } from "@oak/theory";
import { parsePc } from "./kernel.ts";
import { parseMiniCode } from "./mini.ts";
import { pitch } from "./pitch-seam.ts";
import type { TrialResponse } from "./types.ts";

/** A trial result with the sung accuracy a `DrillTrialRecord.centsError` stores (production trials only). */
export interface DrillTrialResult extends TrialResult {
  /** Mean |cents| of the graded sung notes; `null` when nothing was sung. */
  centsError?: number | null;
  /** The response was skipped (`Shift+S`): no evidence, no penalty. */
  skipped?: boolean;
}

const wrong = (exp: string, got: string, extra: Record<string, string | number> = {}): Diagnostic => ({
  id: "id.wrong",
  severity: "error",
  dim: "choice",
  params: { exp, got, ...extra },
});

/** Text normalization for typed answers: note names, chord symbols, intervals, keys, Roman numerals. */
export function normalizeAnswerText(text: string): string {
  return (
    text
      .trim()
      .replace(/♯/g, "#")
      .replace(/♭/g, "b")
      .replace(/𝄫/g, "bb")
      .replace(/𝄪/g, "##")
      .replace(/°/g, "o")
      .replace(/ø/g, "ø")
      // The half-diminished sign as some fonts and keyboards give it (∅, Ø).
      .replace(/[∅Ø]/g, "ø")
      // Figures as Oak prints them (V⁶, I⁶₄, V⁷): the same numbers written on the line.
      .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]/g, (c) => String("⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉".indexOf(c) % 10))
      .replace(/\s+/g, " ")
  );
}
/** Note-name answers ignore the case of the letter: "eb", "Eb" and "E♭" are the same answer. */
function sameText(expected: string, got: string, kind: string | undefined): boolean {
  const a = normalizeAnswerText(expected);
  const b = normalizeAnswerText(got);
  if (a === b) return true;
  // Only a note letter's case is free: "m3" and "M3" (minor and major 3rd) stay different answers.
  if ((kind === "note" || kind === "key") && /^[a-g]/i.test(a) && /^[a-g]/i.test(b)) {
    const cap = (s: string): string => (s.length > 0 ? s[0]?.toUpperCase() + s.slice(1) : s);
    return (
      cap(a).replace(/ (major|minor)$/i, (m) => m.toLowerCase()) ===
      cap(b).replace(/ (major|minor)$/i, (m) => m.toLowerCase())
    );
  }
  if (kind === "pc") {
    try {
      return parsePc(a).pc === parsePc(b).pc;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Two Roman numerals name the same chord in `key`: compared as (degree, alteration, quality, inversion) and the
 * applied target's root, never as strings (contracts §6.6, wave4.md §10 item 11), the same way the grader's
 * `sameRn` and the drills runner's step checks (`romanParts`) read them. "vii°" and "viio", "V6/5" and "V65"
 * are one answer; "II" is not "ii". Without a key, or when either side does not parse, the normalized texts
 * are compared.
 */
export function sameRnAnswer(expected: string, got: string, key: KeySpec | null): boolean {
  const same = normalizeAnswerText(expected) === normalizeAnswerText(got);
  if (!key) return same;
  const a = parseRN(normalizeAnswerText(expected), key);
  const b = parseRN(normalizeAnswerText(got), key);
  if (!a || !b) return same;
  if (a.degree !== b.degree || a.alt !== b.alt || a.quality !== b.quality || a.inversion !== b.inversion)
    return false;
  if (!a.of !== !b.of) return false;
  return !a.of || !b.of || rnToChord(a.of, key).rootPc === rnToChord(b.of, key).rootPc;
}
const keyParam = (v: unknown): KeySpec | null =>
  v &&
  typeof v === "object" &&
  typeof (v as KeySpec).tonic === "string" &&
  typeof (v as KeySpec).mode === "string"
    ? (v as KeySpec)
    : null;

/**
 * A sequence typed into one box ("F C G D A E B", "G, A, B"): split on spaces and commas when the key
 * expects several items and the response is a single string.
 */
export function splitTyped(
  expected: readonly string[] | undefined,
  got: readonly string[] | undefined,
): string[] | undefined {
  if (!expected || !got || expected.length < 2 || got.length !== 1) return got ? [...got] : undefined;
  return (got[0] as string)
    .trim()
    .split(/[\s,]+/)
    .filter((t) => t.length > 0);
}

function positional<T>(
  expected: readonly T[],
  got: readonly T[] | undefined,
  same: (a: T, b: T) => boolean,
): { credit: number; firstMiss: number } {
  if (!got || expected.length === 0) return { credit: 0, firstMiss: 0 };
  let hits = 0;
  let firstMiss = -1;
  expected.forEach((e, i) => {
    const g = got[i];
    if (g !== undefined && same(e, g)) hits++;
    else if (firstMiss < 0) firstMiss = i;
  });
  // Extra answers beyond the expected length cost like misses.
  const denom = Math.max(expected.length, got.length);
  return { credit: hits / denom, firstMiss };
}

/**
 * Grades an identification answer against `expected`. Every field present in `expected` is graded; the
 * credit is the mean over fields. Sequences earn positional partial credit; a single choice is all or nothing.
 */
export function gradeAnswer(
  trial: Trial<Answer>,
  response: TrialResponse,
  def?: Pick<FamilyDef, "confusionTips">,
): DrillTrialResult {
  const base = { rtMs: response.rtMs, replays: response.replays };
  if (response.skipped) return { ...base, credit: 0, correct: false, diagnostics: [], skipped: true };
  const exp = trial.expected;
  const got = response.answer ?? {};
  const textKind = typeof trial.params.textKind === "string" ? trial.params.textKind : undefined;
  const scores: number[] = [];
  const diagnostics: Diagnostic[] = [];
  let confusion: [string, string] | undefined;
  const note = (e: string, g: string): void => {
    confusion ??= [e, g];
    diagnostics.push(wrong(e, g));
  };
  if (exp.choice) {
    const e = [...exp.choice].sort();
    const g = [...(got.choice ?? [])].sort();
    const ok = e.length === g.length && e.every((x, i) => x === g[i]);
    scores.push(ok ? 1 : 0);
    if (!ok) note(e.join("+"), g.join("+") || "—");
  }
  const seq = <T extends string | number>(
    e: readonly T[] | undefined,
    g: readonly T[] | undefined,
    same: (a: T, b: T) => boolean = (a, b) => a === b,
  ): void => {
    if (!e) return;
    const r = positional(e, g, same);
    scores.push(r.credit);
    if (r.credit < 1) {
      const i = Math.max(0, r.firstMiss);
      note(String(e[i] ?? "—"), String(g?.[i] ?? "—"));
    }
  };
  seq(exp.degrees, got.degrees);
  seq(exp.qualities, got.qualities);
  const rnKey = keyParam(trial.params.key);
  seq(exp.rn, got.rn, (a, b) => sameRnAnswer(a, b, rnKey));
  seq(exp.text, splitTyped(exp.text, got.text), (a, b) => sameText(a, b, textKind));
  if (exp.midi) {
    const pcOnly = trial.params.pcOnly === true;
    seq(exp.midi, got.midi, (a, b) => (pcOnly ? (((a - b) % 12) + 12) % 12 === 0 : a === b));
  }
  if (exp.number !== undefined) {
    const ok = got.number === exp.number;
    scores.push(ok ? 1 : 0);
    if (!ok) note(String(exp.number), String(got.number ?? "—"));
  }
  if (exp.stages) {
    for (const [stage, e] of Object.entries(exp.stages)) {
      const g = got.stages?.[stage as keyof typeof exp.stages];
      seq(e as string[], g as string[] | undefined, (a, b) =>
        stage === "rn" ? sameRnAnswer(a, b, rnKey) : normalizeAnswerText(a) === normalizeAnswerText(b),
      );
    }
  }
  const credit = scores.length === 0 ? 0 : scores.reduce((s, x) => s + x, 0) / scores.length;
  if (confusion && def?.confusionTips) {
    const tip = def.confusionTips[`${confusion[0]}|${confusion[1]}`];
    if (tip)
      diagnostics.push({
        id: "id.confusion",
        severity: "info",
        params: { a: confusion[0], b: confusion[1], n: 1, tip },
      });
  }
  return {
    ...base,
    credit,
    correct: credit >= 0.999,
    diagnostics,
    ...(confusion ? { confusion } : {}),
  };
}

// --- taps ---------------------------------------------------------------------------------------

/**
 * Tap trials store `params.tapTargets`: seconds from the start of the response window (for an echo, the
 * bar after the stimulus; for tap-along, the stimulus itself). `response.taps` are on the same clock,
 * already minus the calibrated latency.
 */
export function gradeTapTrial(
  trial: Trial<Answer>,
  response: TrialResponse,
  profile: LearnerProfile,
): DrillTrialResult {
  const base = { rtMs: response.rtMs, replays: response.replays };
  if (response.skipped) return { ...base, credit: 0, correct: false, diagnostics: [], skipped: true };
  const targets = (trial.params.tapTargets as number[] | undefined) ?? [];
  const levels = typeof trial.params.levels === "number" ? trial.params.levels : trial.level;
  let minIoi = Number.POSITIVE_INFINITY;
  for (let i = 1; i < targets.length; i++)
    minIoi = Math.min(minIoi, (targets[i] as number) - (targets[i - 1] as number));
  const minIoiMs = Number.isFinite(minIoi) ? minIoi * 1000 : 500;
  const tol: TapTolerance = {
    windowMs: pitch.tapWindowMs(minIoiMs, trial.level, levels, profile),
    tempo: "locked",
    forgiveOffset: trial.level <= 2,
    passF1: 0.9,
    passTiming: 0.5,
  };
  const res = pitch.gradeTaps(response.taps ?? [], targets, tol, profile, { level: trial.level, levels });
  return { ...base, credit: res.score, correct: res.pass, diagnostics: res.diagnostics };
}

// --- singing ------------------------------------------------------------------------------------

/**
 * Sung trials store `params.singTargets` (MIDI already inside the comfort range, on/off in seconds from
 * the start of the response window) and `params.singMode`.
 */
export function gradeSungTrial(
  trial: Trial<Answer>,
  response: TrialResponse,
  profile: LearnerProfile,
  targetsKey = "singTargets",
  modeKey = "singMode",
): DrillTrialResult {
  const base = { rtMs: response.rtMs, replays: response.replays };
  if (response.skipped)
    return { ...base, credit: 0, correct: false, diagnostics: [], skipped: true, centsError: null };
  const targets = (trial.params[targetsKey] as SungTarget[] | undefined) ?? [];
  const mode = (trial.params[modeKey] as SingMode | undefined) ?? "pitch";
  const tol: SingTolerance = {
    cents: "learner",
    octave: targets.length > 1 ? "global" : "per-note",
    driftCompCents: 30,
    minCoverage: 0.4,
    passHitRate: 0.8,
  };
  const res = pitch.gradeSung(response.frames ?? [], targets, tol, mode, profile);
  const graded = res.notes.filter((n) => n.cents !== null).map((n) => Math.abs(n.cents as number));
  const centsError = graded.length === 0 ? null : graded.reduce((s, x) => s + x, 0) / graded.length;
  return { ...base, credit: res.score, correct: res.pass, diagnostics: res.diagnostics, centsError };
}

// --- code answers -------------------------------------------------------------------------------

/**
 * A code answer: the learner's string is parsed with the pattern model (`parseMiniCode`) and its onsets
 * (and pitches, when the trial has them) are compared with the expected events of `params.answerTrack`.
 * `answer.midi` is accepted too: the app may evaluate the code with the grader and send the pitches.
 */
export function gradeCodeTrial(trial: Trial<Answer>, response: TrialResponse): DrillTrialResult {
  const base = { rtMs: response.rtMs, replays: response.replays };
  if (response.skipped) return { ...base, credit: 0, correct: false, diagnostics: [], skipped: true };
  const track = (trial.params.answerTrack as string | undefined) ?? null;
  const fromBar = typeof trial.params.answerFromBar === "number" ? trial.params.answerFromBar : 0;
  const bars = typeof trial.params.answerBars === "number" ? trial.params.answerBars : 1;
  const target = trial.events
    .filter((e) => (track === null || e.track === track) && e.onset[0] / e.onset[1] >= fromBar)
    .map((e) => ({ t: e.onset[0] / e.onset[1] - fromBar, midi: e.midi }));
  const text = response.answer?.text?.[0];
  let got: { t: number; midi: number | null }[] | null = null;
  if (text !== undefined) {
    const parsed = parseMiniCode(text, bars, trial.params.answerKey as never);
    if (!parsed.ok) {
      return {
        ...base,
        credit: 0,
        correct: false,
        diagnostics: [
          { id: "eval.mini-parse", severity: "error", params: { line: 1, detail: parsed.error } },
        ],
      };
    }
    got = parsed.events;
  } else if (response.answer?.midi) {
    const midis = response.answer.midi;
    got = target.map((t, i) => ({ t: t.t, midi: midis[i] ?? null }));
  }
  if (!got) return { ...base, credit: 0, correct: false, diagnostics: [wrong("code", "—")] };
  const pitched = target.some((t) => t.midi !== null);
  const key = (e: { t: number; midi: number | null }): string =>
    `${Math.round(e.t * 960)}${pitched ? `|${e.midi}` : ""}`;
  const want = new Map<string, number>();
  for (const e of target) want.set(key(e), (want.get(key(e)) ?? 0) + 1);
  let hits = 0;
  const diagnostics: Diagnostic[] = [];
  for (const e of got) {
    const k = key(e);
    const n = want.get(k) ?? 0;
    if (n > 0) {
      hits++;
      want.set(k, n - 1);
    }
  }
  const f1 = target.length + got.length === 0 ? 1 : (2 * hits) / (target.length + got.length);
  if (hits < target.length)
    diagnostics.push({
      id: pitched ? "melody.missing-note" : "rhythm.missing",
      severity: "error",
      params: { n: target.length - hits },
    });
  if (hits < got.length)
    diagnostics.push({
      id: pitched ? "melody.extra-note" : "rhythm.extra",
      severity: "error",
      params: { n: got.length - hits },
    });
  return { ...base, credit: f1, correct: f1 >= 0.999, diagnostics };
}

/** Dispatch on the trial's answer mode (`params.mode`): tap, sing, code, or an identification answer. */
export function gradeDefault<L extends LevelParams>(
  trial: Trial<Answer>,
  response: TrialResponse,
  profile: LearnerProfile,
  def: FamilyDef<L>,
): DrillTrialResult {
  switch (trial.params.mode) {
    case "tap":
      return gradeTapTrial(trial, response, profile);
    case "sing":
      return gradeSungTrial(trial, response, profile);
    case "code":
      return gradeCodeTrial(trial, response);
    default:
      return gradeAnswer(trial, response, def);
  }
}
