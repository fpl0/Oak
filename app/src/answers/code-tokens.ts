// Code text for the code-shaped answers: the blanks of a code-fill starter (`⟦id⟧`, editable-region markers
// `⟪…⟫` stripped, contracts §5.3 `CodeSpec`) and the clickable tokens of a click-code question, whose ranges are
// offsets into the CLEAN code (`CodeRange`, `to` exclusive). Pure: tested with `bun test`.
import type { CodeRange } from "@oak/api";

export type StarterPart = { kind: "text"; text: string } | { kind: "blank"; id: string };

/** `n("⟦a⟧ 2")` → text `n("`, blank `a`, text ` 2")`. Editable-region markers are dropped. */
export function starterParts(starter: string): StarterPart[] {
  const clean = starter.replace(/[⟪⟫]/g, "");
  const out: StarterPart[] = [];
  const re = /⟦([^⟧]+)⟧/g;
  let last = 0;
  for (let m = re.exec(clean); m; m = re.exec(clean)) {
    if (m.index > last) out.push({ kind: "text", text: clean.slice(last, m.index) });
    out.push({ kind: "blank", id: m[1] as string });
    last = m.index + m[0].length;
  }
  if (last < clean.length) out.push({ kind: "text", text: clean.slice(last) });
  return out;
}

/** The code a filled starter makes (what the grader evaluates). */
export function fillStarter(starter: string, blanks: Readonly<Record<string, string>>): string {
  return starterParts(starter)
    .map((p) => (p.kind === "text" ? p.text : (blanks[p.id] ?? "")))
    .join("");
}

export interface CodeToken {
  from: number;
  to: number;
  text: string;
  /** 0-based line. */
  line: number;
  kind: "word" | "number" | "atom" | "punct";
}

const TOP = /"[^"\n]*"|'[^'\n]*'|`[^`]*`|\/\/[^\n]*|[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|\n|[ \t]+|./g;
const ATOM = /[^\s[\]<>{}(),*!@:?|"'`/%]+|~/g;

/**
 * The tokens a learner can point at: words, numbers, and inside a pattern string each mini-notation atom
 * (`bd`, `~`, `c4`, `0`). Whitespace, quotes and comments are not tokens.
 */
export function codeTokens(code: string): CodeToken[] {
  const out: CodeToken[] = [];
  let line = 0;
  for (let m = TOP.exec(code); m; m = TOP.exec(code)) {
    const t = m[0];
    const at = m.index;
    if (t === "\n") {
      line++;
      continue;
    }
    if (/^[ \t]+$/.test(t) || t.startsWith("//")) continue;
    if (/^["'`]/.test(t)) {
      const inner = t.slice(1, -1);
      for (let a = ATOM.exec(inner); a; a = ATOM.exec(inner)) {
        const from = at + 1 + a.index;
        out.push({ from, to: from + a[0].length, text: a[0], line, kind: "atom" });
      }
      ATOM.lastIndex = 0;
      line += (t.match(/\n/g) ?? []).length;
      continue;
    }
    const kind = /^\d/.test(t) ? "number" : /^[A-Za-z_$]/.test(t) ? "word" : "punct";
    if (kind === "punct" && /^[.,;:(){}[\]=]$/.test(t)) continue;
    out.push({ from: at, to: at + t.length, text: t, line, kind });
  }
  TOP.lastIndex = 0;
  return out;
}

/** The token a range points at (exact match first, then the first overlapping one). */
export function tokenAt(tokens: readonly CodeToken[], range: CodeRange | null): number {
  if (!range) return -1;
  const exact = tokens.findIndex((t) => t.from === range.from && t.to === range.to);
  if (exact >= 0) return exact;
  return tokens.findIndex((t) => t.from < range.to && range.from < t.to);
}

/** Up/Down: the token on the previous/next line that has tokens, nearest in column to the current one. */
export function tokenOnLine(tokens: readonly CodeToken[], code: string, at: number, dir: -1 | 1): number {
  const cur = tokens[at];
  if (!cur) return at;
  const col = (t: CodeToken) => t.from - (code.lastIndexOf("\n", t.from - 1) + 1);
  const lines = [...new Set(tokens.map((t) => t.line))];
  const target = dir > 0 ? lines.find((l) => l > cur.line) : [...lines].reverse().find((l) => l < cur.line);
  if (target === undefined) return at;
  let best = at;
  let bestDist = Number.POSITIVE_INFINITY;
  tokens.forEach((t, i) => {
    if (t.line !== target) return;
    const d = Math.abs(col(t) - col(cur));
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}
