// Mini-notation reader for the lint: the operators a pattern string uses (each maps to a `tb.mini.*`
// tool) and its atoms with absolute code offsets. Parsed with @strudel/mini's own `mini2ast` (the parser
// the transpiler uses), with a tokenizer fallback when the string does not parse.
import { type MiniNode, miniAst } from "../runtime/strudel.ts";

export const MINI_OPS = [
  "seq",
  "repeat",
  "slow",
  "rest",
  "sub",
  "elongate",
  "hold",
  "replicate",
  "alt",
  "stack",
  "maybe",
  "polymeter",
  "euclid",
  "euclid-rot",
  "range",
  "choice",
  "tail",
  "feet",
] as const;
export type MiniOp = (typeof MINI_OPS)[number];

/** How each operator is written: also the `matches` strings a toolbox entry may use for it. */
export const MINI_OP_SYMBOLS: Readonly<Record<MiniOp, readonly string[]>> = {
  seq: [" ", "a b"],
  repeat: ["*", "x*n"],
  slow: ["/", "x/n"],
  rest: ["~", "-"],
  sub: ["[]", "[ ]", "[a b]"],
  elongate: ["@", "x@n"],
  hold: ["_"],
  replicate: ["!", "x!n"],
  alt: ["<>", "< >", "<a b>"],
  stack: [",", "a, b"],
  maybe: ["?", "x?"],
  polymeter: ["{}", "%", "{a b c}%n"],
  euclid: ["(k,n)", "x(k,n)"],
  "euclid-rot": ["(k,n,r)", "x(k,n,r)"],
  range: ["..", "a .. b"],
  choice: ["|"],
  tail: [":"],
  feet: ["."],
};

export interface MiniUse {
  op: MiniOp;
  start: number;
  end: number;
}
export interface MiniAtom {
  text: string;
  start: number;
  end: number;
}
export interface MiniInfo {
  ops: MiniUse[];
  atoms: MiniAtom[];
  /** The string does not parse as mini-notation (the transpiler will throw). */
  error: string | null;
}

/** `content` is the text between the quotes; `contentStart` its absolute offset in the code. */
export function readMini(content: string, contentStart: number): MiniInfo {
  const info: MiniInfo = { ops: [], atoms: [], error: null };
  let root: MiniNode;
  try {
    root = miniAst(content);
  } catch (e) {
    info.error = String((e as { message?: unknown }).message ?? e);
    fallback(content, contentStart, info);
    return info;
  }
  // Offsets in the AST are relative to the opening quote.
  const abs = (n: MiniNode | undefined): [number, number] => {
    const s = n?.location_?.start.offset ?? 1;
    const e = n?.location_?.end.offset ?? content.length + 1;
    return [contentStart + s - 1, contentStart + e - 1];
  };
  const add = (op: MiniOp, n: MiniNode | undefined) => {
    const [start, end] = abs(n);
    info.ops.push({ op, start, end });
  };
  const visit = (node: MiniNode | null | undefined, parent: MiniNode | null, within = ""): void => {
    if (!node || typeof node !== "object") return;
    switch (node.type_) {
      case "atom": {
        const text = String(node.source_ ?? "");
        const [start] = abs(node);
        const trimmed = text.trim();
        info.atoms.push({ text: trimmed, start, end: start + trimmed.length });
        if (trimmed === "~" || trimmed === "-") add("rest", node);
        return;
      }
      case "pattern": {
        const align = node.arguments_?.alignment;
        const kids = Array.isArray(node.source_) ? (node.source_ as MiniNode[]) : [];
        // The items of `<a b>` and `{a b c}` are alternatives and steps, not a sequence.
        const listed = within === "polymeter_slowcat" || within === "polymeter";
        if (align === "fastcat" && kids.length >= 2 && !listed) add("seq", parent ?? node);
        else if (align === "stack") add("stack", parent ?? node);
        else if (align === "polymeter_slowcat") add("alt", parent ?? node);
        else if (align === "polymeter") add("polymeter", parent ?? node);
        else if (align === "rand") add("choice", parent ?? node);
        else if (align === "feet") add("feet", parent ?? node);
        const steps = node.arguments_?.stepsPerCycle;
        if (steps) visit(steps, null);
        for (const k of kids) visit(k, null, String(align ?? ""));
        return;
      }
      case "element": {
        const src = node.source_ as MiniNode | undefined;
        if (src?.type_ === "pattern") {
          const [start] = abs(node);
          const opening = content[start - contentStart];
          // `[c4,e4]` is the stack operator alone: brackets around a single stack are not a subdivision.
          if (opening === "[" && src.arguments_?.alignment !== "stack") add("sub", node);
        }
        for (const op of node.options_?.ops ?? []) {
          const args = op.arguments_ ?? {};
          switch (op.type_) {
            case "stretch":
              add(args.type === "slow" ? "slow" : "repeat", node);
              if (args.amount && typeof args.amount === "object") visit(args.amount, null);
              break;
            case "replicate":
              add("replicate", node);
              break;
            case "degradeBy":
              add("maybe", node);
              break;
            case "bjorklund":
              add(args.rotation ? "euclid-rot" : "euclid", node);
              visit(args.pulse, null);
              visit(args.step, null);
              if (args.rotation) visit(args.rotation, null);
              break;
            case "range":
              add("range", node);
              visit(args.element, null);
              break;
            case "tail":
              add("tail", node);
              visit(args.element, null);
              break;
            default:
              break;
          }
        }
        visit(src, src?.type_ === "pattern" ? node : null);
        return;
      }
      default:
        return;
    }
  };
  visit(root, null);
  // Weights: `x@n` (elongate) and a standalone `_` (hold) both become `weight` in the AST.
  for (const m of content.matchAll(/@/g)) push(info, "elongate", contentStart + (m.index ?? 0), 1);
  for (const m of content.matchAll(/(^|[\s[<{,|])_(?=$|[\s\]>},|])/g)) {
    push(info, "hold", contentStart + (m.index ?? 0) + (m[1]?.length ?? 0), 1);
  }
  info.ops.sort((a, b) => a.start - b.start || a.op.localeCompare(b.op));
  return info;
}

/**
 * How many bars a pattern string takes to repeat, when that is plain from the text: a top-level `<…>`
 * of N items (with `!n` counted) is N bars; a string without `<`, `/` or `{` is 1 bar. Otherwise null.
 */
export function cycleLength(content: string): number | null {
  let root: MiniNode;
  try {
    root = miniAst(content);
  } catch {
    return null;
  }
  if (!/[<{/]/.test(content)) return 1;
  const top = Array.isArray(root.source_) ? (root.source_ as MiniNode[]) : [];
  const el = top.length === 1 ? top[0] : undefined;
  const alt = el?.source_ as MiniNode | undefined;
  if (root.arguments_?.alignment !== "fastcat" || !el || (el.options_?.ops?.length ?? 0) > 0) return null;
  if (alt?.type_ !== "pattern" || alt.arguments_?.alignment !== "polymeter_slowcat") return null;
  const inner = Array.isArray(alt.source_) ? (alt.source_ as MiniNode[]) : [];
  if (inner.length !== 1) return null;
  const items = Array.isArray(inner[0]?.source_) ? (inner[0]?.source_ as MiniNode[]) : [];
  let n = 0;
  for (const item of items) {
    const reps = item.options_?.reps ?? 1;
    if ((item.options_?.weight ?? 1) !== reps) return null; // `@` in a slowcat: not plain
    if ((item.options_?.ops ?? []).some((o) => o.type_ !== "replicate")) return null;
    n += reps;
  }
  return n > 0 ? n : null;
}

function push(info: MiniInfo, op: MiniOp, start: number, len: number): void {
  info.ops.push({ op, start, end: start + len });
}

/** Token-level reading of a string that does not parse. */
function fallback(content: string, contentStart: number, info: MiniInfo): void {
  const symbols: [RegExp, MiniOp][] = [
    [/\*/g, "repeat"],
    [/\//g, "slow"],
    [/~/g, "rest"],
    [/\[/g, "sub"],
    [/@/g, "elongate"],
    [/!/g, "replicate"],
    [/</g, "alt"],
    [/,/g, "stack"],
    [/\?/g, "maybe"],
    [/\{/g, "polymeter"],
    [/\(/g, "euclid"],
    [/\.\./g, "range"],
    [/\|/g, "choice"],
  ];
  for (const [re, op] of symbols)
    for (const m of content.matchAll(re)) push(info, op, contentStart + (m.index ?? 0), m[0].length);
  for (const m of content.matchAll(/[^\s[\]<>{},|~*/@!?()%]+/g)) {
    const text = m[0];
    info.atoms.push({
      text,
      start: contentStart + (m.index ?? 0),
      end: contentStart + (m.index ?? 0) + text.length,
    });
  }
  if (info.atoms.length > 1) push(info, "seq", contentStart, content.length);
}

const BRACKETS: readonly (readonly [string, string])[] = [
  ["[", "]"],
  ["<", ">"],
  ["{", "}"],
  ["(", ")"],
];

/** The first bracket problem in a mini-notation body: an unclosed opener or a stray closer. */
export function miniBracketProblem(body: string): { offset: number; text: string } | null {
  const stack: { ch: string; at: number }[] = [];
  for (let i = 0; i < body.length; i++) {
    const ch = body[i] as string;
    if (BRACKETS.some((p) => p[0] === ch)) {
      stack.push({ ch, at: i });
      continue;
    }
    const close = BRACKETS.find((p) => p[1] === ch);
    if (!close) continue;
    const top = stack.pop();
    if (!top) return { offset: i, text: `there is a "${ch}" with no "${close[0]}" before it` };
    if (top.ch !== close[0]) {
      const want = BRACKETS.find((p) => p[0] === top.ch)?.[1] ?? "";
      return { offset: i, text: `the "${top.ch}" is closed with "${ch}"; it needs "${want}"` };
    }
  }
  const left = stack.pop();
  if (!left) return null;
  const want = BRACKETS.find((p) => p[0] === left.ch)?.[1] ?? "";
  return { offset: left.at, text: `a "${left.ch}" is never closed: add a "${want}"` };
}

/**
 * A raw mini-notation parse error (Peggy's "Expected "!", "(", … but "x" found.") as one short, calm clause
 * for the `{detail}` of `eval.mini-parse`. `body` (the text between the quotes) lets it name the bracket.
 */
export function miniErrorDetail(raw: string, body?: string): string {
  const bracket = body === undefined ? null : miniBracketProblem(body);
  if (bracket) return bracket.text;
  const found = /but "((?:[^"\\]|\\.)+)" found/.exec(raw)?.[1];
  if (found === undefined || found === '\\"' || /but end of input found/.test(raw)) {
    return "it ends before a bracket or group is closed";
  }
  return `there is a typo near "${found.replace(/\\(.)/g, "$1")}"; check its brackets and symbols`;
}
