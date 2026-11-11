// Leak markers: helpers for the tests that prove the redaction matrix (contracts §10.5, "Cassette
// test"). Given a step and a grade: which strings must not appear below which level, and does a
// haystack (a request body, a tool result, a stdin prompt, an SSE frame) hold one of them.
// Both backends' tests use these against what they actually send. One production use: the
// compare_haps executor checks a grader error message against them before passing it on.
import type { GradeSnapshot, Rung, StepSource } from "./domain.ts";
import { MIN_LEVEL } from "./redaction.ts";

export function normalizeWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** String literals of a snippet, whitespace-normalized, at least `minLength` long. */
export function miniNotationLiterals(code: string, minLength = 8): string[] {
  const out = new Set<string>();
  for (const m of code.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"|`([^`]*)`/g)) {
    const lit = normalizeWs(m[1] ?? m[2] ?? "");
    if (lit.length >= minLength) out.add(lit);
  }
  return [...out];
}

export interface LeakMarker {
  /** What was found, for the failure message. */
  label: string;
  text: string;
  /** Lowest level at which this text may appear. */
  minLevel: Rung;
}

export function leakMarkers(step: StepSource, grade: GradeSnapshot | null = null): LeakMarker[] {
  const out: LeakMarker[] = [];
  const add = (label: string, text: string | null | undefined, minLevel: Rung) => {
    const t = normalizeWs(text ?? "");
    if (t.length > 0) out.push({ label, text: t, minLevel });
  };
  // A literal the learner is shown anyway (in the starter code or the prompt) is not a secret.
  const shown = normalizeWs([step.starterCode ?? "", step.prompt, ...step.constraints].join(" "));
  for (const s of step.solutions) {
    add("solution", s, MIN_LEVEL.solution);
    for (const lit of miniNotationLiterals(s)) {
      if (!shown.includes(lit)) add("solution-literal", lit, MIN_LEVEL.solution);
    }
  }
  for (const m of step.knownMistakes) {
    add("wrong-variant-code", m.variantCode, MIN_LEVEL.variantCode);
    add("known-mistake", m.description, MIN_LEVEL.knownMistakes);
  }
  if (step.hints) {
    add("hint-nudge", step.hints[0], MIN_LEVEL.hintNudge);
    add("hint-pointer", step.hints[1], MIN_LEVEL.hintPointer);
    add("hint-partial", step.hints[2], MIN_LEVEL.hintPartial);
    add("hint-reveal", step.hints[3], MIN_LEVEL.hintReveal);
  }
  grade?.issues.forEach((issue, i) => {
    const fixLevel = i === 0 ? MIN_LEVEL.fixFirst : MIN_LEVEL.fixAll;
    add(`issue${i + 1}.what`, issue.what, MIN_LEVEL.what);
    add(`issue${i + 1}.concept`, issue.concept, MIN_LEVEL.concept);
    add(`issue${i + 1}.fix`, issue.fix, fixLevel);
    add(`issue${i + 1}.expected`, issue.expected, fixLevel);
  });
  return out;
}

/**
 * Undo up to three layers of JSON string escaping, so text nested as JSON inside JSON (a tool
 * result inside a request body) is searched as plain text.
 */
export function decodeNested(haystack: string): string {
  let s = haystack;
  for (let i = 0; i < 3; i++) {
    const next = s
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
      .replace(/\\([nrt])/g, " ")
      .replace(/\\(["\\/])/g, "$1");
    if (next === s) break;
    s = next;
  }
  return s;
}

/** Labels of every marker that appears in `haystack` although `level` is below its allowance. */
export function findLeaks(haystack: string, markers: readonly LeakMarker[], level: Rung): string[] {
  const text = normalizeWs(decodeNested(haystack));
  const found = new Set<string>();
  for (const m of markers) {
    if (level < m.minLevel && text.includes(m.text)) found.add(`${m.label}: ${m.text}`);
  }
  return [...found];
}

/** Keys that must not occur in a tool result or context block below their level. */
export function forbiddenKeys(level: Rung): string[] {
  const keys: string[] = [];
  if (level < MIN_LEVEL.what) keys.push('"what"', '"feedback"', '"direction"', '"concept"');
  if (level < MIN_LEVEL.fixFirst) keys.push('"fix"', '"expected"', '"got"');
  return keys;
}
