// A tiny deterministic stand-in for the grader host. It understands one pattern per line:
// `label: n("0 2 4").scale("D4:dorian")`, `note("c4 e4")`, `s("bd ~ sd")` or `chord("C Am")`, one bar per cycle.
// Enough to tell silent code from sounding code and a right note from a wrong one. Test code only.
import type { EvalEvent, EvalResult, EvalTrack, GradeSnapshot, RawIssue } from "../domain.ts";
import type { CompareRequest, CompareResult, EvalRequest, GraderPort } from "../ports.ts";

const MODES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
};
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const LETTER: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

function noteName(midi: number): string {
  return `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

function parseScale(line: string): { root: number; steps: number[] } {
  const m = /\.scale\("([A-Ga-g])([#b]?)(\d)?:([a-z]+)"\)/.exec(line);
  if (!m) return { root: 60, steps: MODES.major as number[] };
  const pc = (LETTER[(m[1] as string).toLowerCase()] ?? 0) + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
  return {
    root: 12 * (Number(m[3] ?? 3) + 1) + pc,
    steps: MODES[m[4] as string] ?? (MODES.major as number[]),
  };
}

interface Voice {
  label: string;
  events: Omit<EvalEvent, "bar">[];
}

function parseLine(line: string, index: number): Voice | null {
  const m = /^\s*(?:([A-Za-z_$][\w$]*)\s*:)?\s*(n|note|s|sound|chord)\(\s*"([^"]*)"\s*\)/.exec(line);
  if (!m) return null;
  const tokens = (m[3] as string).split(/[\s,]+/).filter((t) => t !== "");
  const scale = parseScale(line);
  const events: Omit<EvalEvent, "bar">[] = [];
  tokens.forEach((tok, i) => {
    if (tok === "~") return;
    const at = { beat: Math.round((1 + (i * 4) / tokens.length) * 100) / 100, durBeats: 4 / tokens.length };
    if (m[2] === "n") {
      const n = Number(tok);
      if (!Number.isInteger(n)) return;
      const deg = ((n % 7) + 7) % 7;
      const midi = scale.root + (scale.steps[deg] as number) + 12 * Math.floor(n / 7);
      events.push({ ...at, pitch: noteName(midi), degree: String(deg + 1), sound: null, chord: null });
    } else if (m[2] === "chord") {
      events.push({ ...at, pitch: null, degree: null, sound: null, chord: tok.replace(/[<>[\]]/g, "") });
    } else if (m[2] === "note") {
      events.push({ ...at, pitch: tok, degree: null, sound: null, chord: null });
    } else {
      events.push({ ...at, pitch: null, degree: null, sound: tok.replace(/[*/].*$/, ""), chord: null });
    }
  });
  return { label: m[1] ?? `$${index}`, events };
}

function voices(code: string): Voice[] | null {
  const out: Voice[] = [];
  for (const line of code.split("\n")) {
    if (line.trim() === "" || line.trim().startsWith("//")) continue;
    const v = parseLine(line, out.length);
    if (v === null) return null;
    out.push(v);
  }
  return out.length > 0 ? out : null;
}

export class FakeGrader implements GraderPort {
  /** Every evaluation and comparison that reached the grader, for "was it ever run?" assertions. */
  readonly evaluated: EvalRequest[] = [];
  readonly compared: CompareRequest[] = [];
  /** Method names that count as locked tools, mapped to their tool IDs. */
  locked: Record<string, string> = { voicing: "tb.voicing" };
  /** Authored results: `ref + "\n" + learnerCode` -> grade. */
  readonly grades = new Map<string, GradeSnapshot>();
  /** Reference solution per exercise ID. */
  readonly exercises = new Map<string, string>();

  async evaluate(req: EvalRequest, _signal: AbortSignal): Promise<EvalResult> {
    this.evaluated.push(req);
    const vs = voices(req.code);
    const lockedTools = Object.entries(this.locked)
      .filter(([name]) => req.code.includes(`.${name}(`))
      .map(([, id]) => id);
    if (vs === null) {
      const error = { kind: "eval", message: "fake grader: no pattern it understands", line: 1 };
      return { ok: false, error, tempo: null, tracks: [], warnings: [], lockedTools };
    }
    const tracks: EvalTrack[] = vs.map((v) => {
      const events: EvalEvent[] = [];
      for (let b = 0; b < req.bars; b++)
        for (const e of v.events) events.push({ ...e, bar: req.fromBar + b });
      return {
        label: v.label,
        role: v.events.some((e) => e.sound) ? "drums" : "melody",
        totalEvents: events.length,
        events,
      };
    });
    return {
      ok: true,
      error: null,
      tempo: { cps: 0.375, bpm: 90, meter: "4/4" },
      tracks,
      warnings: [],
      lockedTools,
    };
  }

  async compare(req: CompareRequest, _signal: AbortSignal): Promise<CompareResult> {
    this.compared.push(req);
    let targetCode: string;
    if (req.target.kind === "exercise") {
      const authored = this.grades.get(`${req.target.ref}\n${req.learnerCode}`);
      if (authored) return { ok: true, grade: authored };
      const solution = this.exercises.get(req.target.ref);
      if (solution === undefined)
        return { ok: false, error: { kind: "unknown-exercise", message: "no such exercise", line: null } };
      targetCode = solution;
    } else {
      targetCode = req.target.code;
    }
    const mine = voices(req.learnerCode)?.[0];
    const theirs = voices(targetCode)?.[0];
    if (!mine || !theirs)
      return {
        ok: false,
        error: { kind: "eval", message: "fake grader: no pattern it understands", line: 1 },
      };

    const issues: RawIssue[] = [];
    const shared = Math.min(mine.events.length, theirs.events.length);
    for (let i = 0; i < shared; i++) {
      const got = mine.events[i] as Omit<EvalEvent, "bar">;
      const want = theirs.events[i] as Omit<EvalEvent, "bar">;
      if (got.pitch === want.pitch && got.sound === want.sound) continue;
      issues.push({
        where: { track: mine.label, bar: req.fromBar, beat: got.beat, code: null },
        severity: "error",
        feedback: "melody.wrong-degree",
        direction: null,
        concept: "scale degrees",
        what: "This note is not the one the target has here.",
        fix: `Use ${want.pitch ?? want.sound} here.`,
        expected: `${want.pitch ?? want.sound}`,
        got: `${got.pitch ?? got.sound}`,
      });
    }
    const total = Math.max(mine.events.length, theirs.events.length, 1);
    const missing = Math.max(0, theirs.events.length - mine.events.length);
    const extra = Math.max(0, mine.events.length - theirs.events.length);
    const score = Math.round(((total - issues.length - missing - extra) / total) * 100) / 100;
    return {
      ok: true,
      grade: {
        status: score === 1 ? "pass" : "fail",
        score,
        dims: { melody: score },
        counts: { missing, extra, wrong: issues.length },
        issues,
        warnings: [],
      },
    };
  }
}
