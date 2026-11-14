// AST constraints of a code step (contracts §5.4), checked on the source text and the evaluation. This is
// the grade pipeline's own checker; a caller with the toolbox-aware lint passes `toolsUsed` so that
// `must-use` / `must-not-use` resolve toolbox IDs exactly as the lint does.
import type { AstConstraint, Diagnostic, FeedbackId, MeterId, ParamValues } from "@oak/content-kit";
import { stripMarkers } from "@oak/content-kit";
import { METERS } from "@oak/theory";
import { diag, toolText } from "../feedback/catalog.ts";

export interface ConstraintInput {
  code: string;
  /** The exercise starter with its markers (for token diffs and editable regions). */
  starter: string;
  params: ParamValues;
  meter: MeterId;
  /** From the evaluation: BPM, and whether the code set a tempo at all. */
  bpm?: number;
  cpsSet?: boolean;
  /** Labelled tracks of the evaluation. */
  tracks?: string[];
  toolsUsed?: (code: string) => { id: string }[];
  /** A toolbox entry's code form, for messages (`toolText`). */
  toolCode?: (id: string) => string | null;
}
export type ConstraintRow = { id: string; ok: boolean; diag?: Diagnostic };

/** JS-ish tokens; string contents are split into their own tokens so a changed digit inside `n("…")` counts. */
export function tokens(code: string): string[] {
  return code.match(/[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|[^\s\w]/g) ?? [];
}
function lcs(a: readonly string[], b: readonly string[]): number {
  let prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const row = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++)
      row[j] =
        a[i - 1] === b[j - 1]
          ? (prev[j - 1] as number) + 1
          : Math.max(prev[j] as number, row[j - 1] as number);
    prev = row;
  }
  return prev[b.length] as number;
}
/** Tokens changed between two codes: a substitution counts once. */
export function changedTokens(before: string, after: string): number {
  const a = tokens(before);
  const b = tokens(after);
  const common = lcs(a, b);
  return Math.max(a.length - common, b.length - common);
}
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whether `code` differs from the starter only inside its ⟪⟫ regions (whitespace-insensitive at the edges). */
export function editsOnlyRegions(starter: string, code: string): boolean {
  const clean = stripMarkers(starter);
  if (!clean.editable) return true;
  const fixed: string[] = [];
  let last = 0;
  for (const r of clean.editable) {
    fixed.push(clean.code.slice(last, r.from));
    last = r.to;
  }
  fixed.push(clean.code.slice(last));
  // A fixed word that stands beside a region, with white space between them, must still end (or begin) there:
  // `B ⟪Em⟫` answered `Bm E` changes the fixed B, it does not edit the region after it. Punctuation delimits
  // itself (`[1, ⟪0, 0, 0⟫]` may be written tight), and white space is free everywhere else.
  const WORD = /[\w#]/;
  const pattern = fixed
    .map((s, i) => {
      const t = s.trim();
      if (t === "") return "";
      const lead = i > 0 && /^\s/.test(s) && WORD.test(t.charAt(0)) ? "(?<![\\w#])" : "";
      const trail =
        i < fixed.length - 1 && /\s$/.test(s) && WORD.test(t.charAt(t.length - 1)) ? "(?![\\w#])" : "";
      return `${lead}${esc(t).replace(/\s+/g, "\\s*")}${trail}`;
    })
    .join("[\\s\\S]*?");
  return new RegExp(`^\\s*${pattern}\\s*$`).test(code);
}

/** Top-level arguments of the first call `fn(…)` in the code, as source text. */
export function callArgs(code: string, fn: string): string[] | null {
  const m =
    new RegExp(`(?:^|[^\\w$.])\\.?${esc(fn)}\\s*\\(`).exec(code) ??
    new RegExp(`\\.${esc(fn)}\\s*\\(`).exec(code);
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 0;
  let cur = "";
  const out: string[] = [];
  let quote: string | null = null;
  for (; i < code.length; i++) {
    const ch = code[i] as string;
    if (quote) {
      cur += ch;
      if (ch === quote && code[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    if (ch === ")" || ch === "]" || ch === "}") {
      if (depth === 0) break;
      depth--;
    }
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
/** String literals passed to the given functions (`n("…")`, `.note("…")`). */
function stringArgsOf(code: string, fns: readonly string[]): string[] {
  const out: string[] = [];
  const re = new RegExp(`(?:^|[^\\w$])(?:${fns.map(esc).join("|")})\\s*\\(\\s*(["\`])([^"\`]*)\\1`, "g");
  for (const m of code.matchAll(re)) out.push(m[2] as string);
  return out;
}
const RANDOM_FNS = [
  "rand",
  "irand",
  "perlin",
  "degrade",
  "degradeBy",
  "sometimes",
  "sometimesBy",
  "often",
  "rarely",
  "almostNever",
  "almostAlways",
  "someCycles",
  "someCyclesBy",
  "choose",
  "chooseCycles",
  "wchoose",
  "shuffle",
  "scramble",
  "randcat",
  "wrandcat",
];

function usesTool(code: string, tool: string, toolsUsed?: ConstraintInput["toolsUsed"]): number {
  if (toolsUsed) return toolsUsed(code).filter((t) => t.id === tool).length;
  const last = tool.split(".").pop() ?? tool;
  if (tool === "tb.mini.euclid") return (code.match(/\(\s*\d+\s*,\s*\d+/g) ?? []).length;
  // A sound (d6: `must-use` accepts a SoundId): its name inside the string of `s()` / `sound()` / `bank()`.
  if (tool.startsWith("snd."))
    return stringArgsOf(code, ["s", "sound", "bank"])
      .flatMap((x) => x.split(/[\s[\]<>,~*/!@:().?|]+/))
      .filter((tok) => tok === last).length;
  if (tool.startsWith("tb.mini.")) {
    const op: Record<string, RegExp> = {
      mult: /\*/g,
      div: /\//g,
      replicate: /!/g,
      elongate: /@/g,
      alt: /</g,
      sub: /\[/g,
      stack: /,/g,
      rest: /~/g,
      degrade: /\?/g,
      random: /\|/g,
      poly: /\{/g,
      range: /\.\./g,
    };
    const re = op[last];
    return re
      ? (stringArgsOf(code, ["s", "n", "note", "sound", "chord", "struct"]).join(" ").match(re)?.length ?? 0)
      : 0;
  }
  return (code.match(new RegExp(`(?:^|[^\\w$])\\.?${esc(last)}\\s*\\(`, "g")) ?? []).length;
}

/** Checks every constraint; each row carries its diagnostic when it fails. */
export function checkConstraints(
  constraints: readonly AstConstraint[],
  input: ConstraintInput,
): ConstraintRow[] {
  return constraints.map((c, i) => {
    const id = c.id ?? `${c.c}-${i + 1}`;
    const fail = (fallback: FeedbackId, params: Record<string, string | number>): ConstraintRow => ({
      id,
      ok: false,
      diag: diag(c.feedback ?? fallback, params, undefined, "constraints"),
    });
    switch (c.c) {
      case "must-use": {
        const tools = Array.isArray(c.tool) ? c.tool : [c.tool];
        const n = tools.reduce((a, t) => a + usesTool(input.code, t, input.toolsUsed), 0);
        return n >= (c.min ?? 1)
          ? { id, ok: true }
          : fail("code.must-use", { tool: tools.map((t) => toolText(t, input.toolCode)).join(" or ") });
      }
      case "must-not-use": {
        const tools = Array.isArray(c.tool) ? c.tool : [c.tool];
        const hit = tools.find((t) => usesTool(input.code, t, input.toolsUsed) > 0);
        return !hit
          ? { id, ok: true }
          : fail("code.must-not-use", { tool: toolText(hit, input.toolCode), why: c.why ?? "" });
      }
      case "arg-matches": {
        const args = callArgs(input.code, c.fn);
        const got = args?.[c.argIndex];
        if (got !== undefined && new RegExp(c.pattern).test(got)) return { id, ok: true };
        // Not called at all: say to call it, rather than "`scale()`: this needs …" with nothing inside.
        if (got === undefined && !c.feedback) return fail("code.must-call", { fn: c.fn });
        return got !== undefined && new RegExp(c.pattern).test(got)
          ? { id, ok: true }
          : fail("code.arg-mismatch", {
              fn: c.fn,
              got: got ?? "",
              expected: `an argument matching ${c.pattern}`,
            });
      }
      case "labels": {
        const labels = (input.tracks ?? []).filter(
          (t) => t !== "main" && !t.startsWith("$") && !t.startsWith("band."),
        );
        const okMin = c.min === undefined || labels.length >= c.min;
        const okMax = c.max === undefined || labels.length <= c.max;
        const okNames = !c.names || c.names.every((nm) => labels.includes(nm));
        return okMin && okMax && okNames
          ? { id, ok: true }
          : fail("code.labels", { min: c.min ?? c.names?.length ?? 1 });
      }
      case "no-note-names": {
        const within = c.within ?? ["n", "note"];
        const hit = stringArgsOf(input.code, within)
          .flatMap((s) => s.split(/[\s[\]<>,~*/!@:().]+/))
          .find((tok) => /^[a-gA-G](#|b|s|f)?-?\d?$/.test(tok));
        return hit === undefined ? { id, ok: true } : fail("code.no-note-names", { text: hit });
      }
      case "no-randomness": {
        const fn = RANDOM_FNS.find((f) =>
          new RegExp(`(?:^|[^\\w$])\\.?${f}\\s*\\(|(?:^|[^\\w$])${f}(?![\\w$])`).test(input.code),
        );
        const mini = stringArgsOf(input.code, ["s", "n", "note", "sound", "chord", "struct"]).some((s) =>
          /\?|\|/.test(s),
        );
        return !fn && !mini
          ? { id, ok: true }
          : fail("code.no-randomness", { fn: fn ?? (mini ? "`?` / `|`" : "") });
      }
      case "max-changed-tokens": {
        const n = changedTokens(stripMarkers(input.starter).code, input.code);
        return n <= c.n ? { id, ok: true } : fail("code.too-many-changes", { n, max: c.n });
      }
      case "edit-only-regions":
        return editsOnlyRegions(input.starter, input.code) ? { id, ok: true } : fail("code.edit-outside", {});
      case "tempo": {
        const want = typeof c.bpm === "number" ? c.bpm : Number(input.params[c.bpm.param]);
        const tol = c.tol ?? 1;
        const got = input.bpm ?? 0;
        if (Math.abs(got - want) <= tol) return { id, ok: true };
        const beats = METERS[input.meter].unitsPerBar;
        if (Math.abs(got - want * beats) <= tol * beats)
          return fail("code.tempo-factor", { got: Math.round(got), expected: want, beats });
        return fail("code.tempo", { got: Math.round(got * 10) / 10, expected: want, beats });
      }
      case "max-chars":
        return input.code.length <= c.n
          ? { id, ok: true }
          : fail("code.max-chars", { n: input.code.length, max: c.n });
      default:
        return {
          id,
          ok: false,
          diag: diag("rubric.unknown", { rule: (c as { c: string }).c }, undefined, "constraints"),
        };
    }
  });
}
