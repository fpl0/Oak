// The corrections-pass standard (decision 71; AUTHORING §20.2), as a check content CI runs on every graded step
// and Make of the advanced tracks (J1–J5, R1–R3, A1.L05–L07, A2), their four checkpoints and eight capstones:
//   (a) every required rule checks what is HEARD: a code step's matcher compares sound (events, pitch classes,
//       rhythm, controls, an effect rule), never only the code's spelling; a Make's or brief's required rules
//       include one that is not about the code's shape (`uses`, `tracks`, `bars`, a tempo or a length);
//   (b) beside the reference and the unchanged starter, a WRONG ANSWER THAT USES THE RIGHT FUNCTION fails: a
//       failing test whose code calls every function the answer adds to the starter (the right call, the wrong
//       result: silent, too small, in the wrong place);
//   (c) THREE OTHER RIGHT ANSWERS pass (besides the reference; a Make's or brief's passing pieces count four);
//   (d) NO ANSWER NAMED BELOW RUNG 4: the first three hint rungs, the step's own feedback overrides and every
//       line the learner reads on a failing test leave out the code the answer adds (the shortest edit from the
//       starter to a right answer, read as the whole call it sits in).
// Non-code graded steps (choices, keys, staff, taps) need one right and one wrong answer pinned, and no rung below
// 4 that quotes the right option's label. Pure over the definitions except (d)'s graded lines, which come from the
// harness (memoized, so content:check pays for each test once).
import {
  type CapstoneDef,
  type CheckpointDef,
  type Exercise,
  flattenExercise,
  type LessonDef,
  type Matcher,
  type RubricRule,
  stripMarkers,
  type TestCase,
} from "@oak/content-kit";

/** The lessons the standard binds (contracts §2.6): every lesson of the three advanced tracks written in Wave 7. */
export function isTrackLesson(id: string): boolean {
  if (/^(J[1-5]|R[1-3]|A2)\.L\d\d$/.test(id)) return true;
  const m = /^A1\.L(\d\d)$/.exec(id);
  return m !== null && Number(m[1]) >= 5;
}
export const TRACK_CHECKPOINTS: readonly string[] = ["J.CP1", "J.CP2", "R.CP", "A.CP"];
export const TRACK_CAPSTONES: readonly string[] = ["JC1", "JC2", "JC3", "JC4", "RC1", "RC2", "AC1", "AC2"];

/** Rules about the code's shape rather than its sound: never enough on their own for a required line. */
export const SHAPE_RULES: ReadonlySet<string> = new Set([
  "uses",
  "tracks",
  "bars",
  "tempo-bpm",
  "duration-sec",
]);
const CODE_KINDS: ReadonlySet<string> = new Set(["code-modify", "code-fill", "error-hunt"]);
const OPEN_KINDS: ReadonlySet<string> = new Set(["code-make", "compose-brief"]);
/** Kinds that grade nothing (heard, run, predicted): outside the standard. */
const UNGRADED_KINDS: ReadonlySet<string> = new Set(["listen", "run-investigate", "predict", "all"]);

export interface StandardItem {
  /** "J1.L05 S4", "J.CP1 item-3", "JC1 brief". */
  where: string;
  e: Exercise;
}

/** The graded exercises of a lesson: every exercise of a `graded` step and of the Make, parts of an `all` included. */
export function lessonItems(def: LessonDef): StandardItem[] {
  const out: StandardItem[] = [];
  for (const s of def.steps) {
    if (!s.exercise || !(s.graded || s.kind === "make")) continue;
    for (const e of flattenExercise(s.exercise))
      out.push({ where: `${def.id} ${s.id}${e === s.exercise ? "" : `/${e.id}`}`, e });
  }
  return out;
}
/** A checkpoint's authored items and its Make (the generated items come from the drills, graded there). */
export function checkpointItems(def: CheckpointDef): StandardItem[] {
  return [...def.authored, def.make as Exercise].flatMap((ex) =>
    flattenExercise(ex).map((e) => ({ where: `${def.id} ${ex.id}${e === ex ? "" : `/${e.id}`}`, e })),
  );
}
export function capstoneItems(c: CapstoneDef): StandardItem[] {
  return c.brief ? [{ where: `${c.id} brief`, e: c.brief as Exercise }] : [];
}

// --- reading code ----------------------------------------------------------------------------------------------

const codeOf = (t: TestCase): string | null => ("code" in t.response ? (t.response.code as string) : null);
const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const NOT_CALLS = new Set(["if", "for", "while", "switch", "return", "function"]);
/** The functions a piece of code calls, by name (`note`, `swingBy`, `struct`). */
export function callsOf(code: string): Set<string> {
  const out = new Set<string>();
  for (const m of code.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g))
    if (!NOT_CALLS.has(m[1] as string)) out.add(m[1] as string);
  return out;
}
const minus = (a: Set<string>, b: Set<string>) => new Set([...a].filter((x) => !b.has(x)));
const covers = (code: string, need: Set<string>) => {
  const have = callsOf(code);
  return [...need].every((x) => have.has(x));
};

/** Index of the parenthesis that closes the one opened at `open`, or -1. */
function closeParen(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")" && --depth === 0) return i;
  }
  return -1;
}

/**
 * What the answer adds to the starter: the middle of `answer` once the longest common start and end are cut,
 * widened to the whole call it sits in when it is shorter than that call (a changed number reads as
 * `.swingBy(1/3, 8)`, not `8`). Null when nothing differs or the difference is too small to quote.
 */
export function answerSnippet(starter: string, answer: string): string | null {
  const a = starter;
  const b = answer;
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let q = 0;
  while (q < a.length - p && q < b.length - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++;
  let from = p;
  let to = b.length - q;
  if (to <= from) return null;
  // Whole tokens: a cut inside `F^7` or `struct` reads as the token it cuts.
  const SEP = /[\s"'`<>[\](),.;:!@*%{}|]/;
  while (from > 0 && !SEP.test(b[from - 1] as string) && !SEP.test(b[from] as string)) from--;
  while (to < b.length && to > 0 && !SEP.test(b[to] as string) && !SEP.test(b[to - 1] as string)) to++;
  // Widen to the enclosing call `.name(…)` / `name(…)` when the difference sits inside its parentheses.
  for (let i = from - 1; i >= 0; i--) {
    if (b[i] === "\n") break;
    if (b[i] === "(") {
      const close = closeParen(b, i);
      if (close >= to - 1) {
        let s = i;
        while (s > 0 && /[\w$]/.test(b[s - 1] as string)) s--;
        if (s > 0 && b[s - 1] === ".") s--;
        from = s;
        to = close + 1;
        break;
      }
    }
  }
  // A dangling start of the next call (`…).s`) is not part of the answer.
  const snip = squash(b.slice(from, to))
    .replace(/\)\.[\w$]*$/, ")")
    .replace(/^\.?[\w$]*$|^\./, (m) => (m.startsWith(".") && m.length > 1 ? m : m))
    .replace(/\.$/, "");
  return snip.replace(/[\s,;]/g, "").length >= 5 ? snip : null;
}

// --- what is heard -------------------------------------------------------------------------------------------

const ruleHeard = (r: RubricRule): boolean => !SHAPE_RULES.has(r.rule);
/** Does a matcher compare something heard? A rubric matcher needs one rule that is not about the code's shape. */
export function matcherHeard(m: Matcher): boolean {
  if (m.m === "all") return m.of.some(matcherHeard);
  if (m.m === "rubric") return (m as { rules: RubricRule[] }).rules.some(ruleHeard);
  return true;
}

// --- the checks -----------------------------------------------------------------------------------------------

export interface StandardOutcome {
  passed: boolean;
  messages?: string[];
}
export type GradeFn = (e: Exercise, t: TestCase) => Promise<StandardOutcome | null>;

const textOf = (h: unknown): string => (typeof h === "object" && h && "text" in h ? String(h.text) : "");
const lowerRungs = (e: Exercise): string[] => (e.hints ?? []).slice(0, 3).map(textOf).filter(Boolean);
const overrides = (e: Exercise): string[] => Object.values(e.feedbackText ?? {}).map(String);

/** Where a text quotes the answer (whitespace-insensitive; inside or outside backticks). */
const quotes = (text: string, snippet: string) => squash(text).includes(snippet);

export async function standardIssues(item: StandardItem, gradeFn: GradeFn): Promise<string[]> {
  const { where, e } = item;
  if (UNGRADED_KINDS.has(e.kind)) return [];
  const issues: string[] = [];
  const tests = e.tests;
  const isCode = CODE_KINDS.has(e.kind);
  const isOpen = OPEN_KINDS.has(e.kind);

  if (!isCode && !isOpen) {
    // A choice, a key, a staff, a tap: one right and one wrong answer pinned, and no low rung quoting the right label.
    // A generated item has no fixed answer to pin: its family's generator and the drills' tests answer for it.
    const generated = (e as { stimulus?: { src?: string } }).stimulus?.src === "generator";
    if (!generated && !tests.some((t) => t.expect === "pass"))
      issues.push(`${where}: no right answer is pinned as a pass`);
    if (!generated && !tests.some((t) => t.expect === "fail"))
      issues.push(`${where}: no wrong answer is pinned as a fail`);
    const correct = (e as { correct?: { choice?: string[] } }).correct?.choice ?? [];
    const options = (e as { answer?: { options?: { id: string; label?: string }[] } }).answer?.options ?? [];
    for (const o of options)
      if (correct.includes(o.id) && o.label && o.label.length >= 16)
        for (const [i, h] of lowerRungs(e).entries())
          if (squash(h).toLowerCase().includes(squash(o.label).toLowerCase()))
            issues.push(`${where}: rung ${i + 1} quotes the right answer ("${o.label}")`);
    return issues;
  }

  const starter = stripMarkers((e as { code: { starter: string } }).code.starter).code;
  const refs = isCode
    ? (e as { reference: { solutions: string[] } }).reference.solutions.map((s) => stripMarkers(s).code)
    : [];
  const passing = tests
    .filter((t) => t.expect === "pass" && codeOf(t) !== null)
    .map((t) => codeOf(t) as string);
  const failing = tests.filter((t) => t.expect === "fail" && codeOf(t) !== null && codeOf(t) !== starter);

  // (a) heard
  if (isCode && !matcherHeard((e as { matcher: Matcher }).matcher))
    issues.push(
      `${where}: the matcher checks only the code's shape (a rubric of ${[...SHAPE_RULES].join("/")})`,
    );
  if (isOpen) {
    const req = (e as { rubric: RubricRule[] }).rubric.filter((r) => r.required);
    if (req.length && !req.some(ruleHeard))
      issues.push(
        `${where}: no required rule checks what is heard (only ${req.map((r) => r.rule).join(", ")})`,
      );
  }

  // (c) three other right answers
  // The reference is the first solution; a second solution the step accepts is one of the other right answers.
  const others = passing.filter((c) => c !== refs[0] && c !== starter);
  const need = isOpen ? 4 : 3;
  if (others.length < need)
    issues.push(
      `${where}: ${others.length} right answer${others.length === 1 ? "" : "s"} pinned as passing besides the reference; the standard asks ${isOpen ? "four passing pieces" : "three other right answers"}`,
    );

  // (b) a wrong answer that uses the right function: the calls the answer adds to the starter (for a Make, the
  // right piece that adds the fewest), or, when it adds none, every call it makes.
  const candidates = isCode ? refs.slice(0, 1) : passing.filter((c) => c !== starter);
  const model = candidates
    .map((c) => ({ c, added: minus(callsOf(c), callsOf(starter)) }))
    .sort((x, y) => x.added.size - y.added.size)[0];
  if (model) {
    const needCalls = model.added.size ? model.added : callsOf(model.c);
    if (!failing.some((t) => covers(codeOf(t) as string, needCalls)))
      issues.push(
        `${where}: no failing test uses the right function${model.added.size ? ` (${[...model.added].join(", ")})` : "s"} with the wrong result`,
      );
  }

  // (d) no answer named below rung 4
  const answers = isCode ? refs : passing.filter((c) => c !== starter);
  const snippets = [
    ...new Set(
      answers.map((a) => answerSnippet(starter, a)).filter((s): s is string => s !== null && s.length <= 80),
    ),
  ];
  // A Make's answer is open: only the smallest edit that passes counts as "the answer".
  const quoted = isOpen ? snippets.sort((x, y) => x.length - y.length).slice(0, 1) : snippets;
  for (const s of quoted) {
    for (const [i, h] of lowerRungs(e).entries())
      if (quotes(h, s)) issues.push(`${where}: rung ${i + 1} names the answer \`${s}\``);
    for (const o of overrides(e))
      if (quotes(o, s)) issues.push(`${where}: a feedback override names the answer \`${s}\``);
  }
  for (const t of failing) {
    const r = await gradeFn(e, t);
    if (!r || r.passed) continue;
    for (const s of quoted)
      for (const m of r.messages ?? [])
        if (quotes(m, s))
          issues.push(
            `${where}/${t.name}: the learner reads the answer \`${s}\`: "${squash(m).slice(0, 120)}"`,
          );
  }
  return [...new Set(issues)];
}
