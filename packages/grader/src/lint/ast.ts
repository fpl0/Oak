// AST utilities over acorn (ecma2022, the parser options of @strudel/transpiler, so the lint sees exactly
// what the transpiler will rewrite): a generic walker, call chains, labels, top-level consts, string
// arguments by callee, mini-notation literals, and the per-track `arrange()` sections of contracts §6.3.
//
// Pure and synchronous; no Strudel import (the mini-notation reader lives in ./mini.ts).
import { parse } from "acorn";
import type { SectionInfo } from "../types.ts";

export interface AstNode {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

export interface ParseError {
  message: string;
  pos: number;
  line: number;
  column: number;
}

export type ParseResult = { ok: true; ast: AstNode } | { ok: false; error: ParseError };

/** Parses a Strudel program the way the transpiler does. Never throws. */
export function parseProgram(code: string): ParseResult {
  try {
    const ast = parse(code, {
      ecmaVersion: 2022,
      allowAwaitOutsideFunction: true,
      locations: true,
    }) as unknown as AstNode;
    return { ok: true, ast };
  } catch (e) {
    const err = e as { message?: string; pos?: number; loc?: { line: number; column: number } };
    const pos = typeof err.pos === "number" ? err.pos : 0;
    const where = lineCol(code, pos);
    // acorn appends " (line:col)" to its messages; the diagnostic carries the line itself.
    const message = String(err.message ?? e).replace(/\s*\(\d+:\d+\)$/, "");
    return { ok: false, error: { message, pos, line: err.loc?.line ?? where.line, column: where.column } };
  }
}

/** 1-based line and 0-based column of an offset. */
export function lineCol(code: string, pos: number): { line: number; column: number } {
  let line = 1;
  let last = -1;
  const end = Math.min(pos, code.length);
  for (let i = 0; i < end; i++) {
    if (code.charCodeAt(i) === 10) {
      line++;
      last = i;
    }
  }
  return { line, column: pos - last - 1 };
}

const SKIP_KEYS = new Set(["type", "start", "end", "loc", "range", "raw"]);

export function isNode(value: unknown): value is AstNode {
  return (
    typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string"
  );
}

/** Depth-first walk; `visit` sees each node with its ancestors (nearest last). Return `false` to skip children. */
export function walk(
  root: AstNode,
  visit: (node: AstNode, ancestors: readonly AstNode[]) => boolean | undefined,
): void {
  const ancestors: AstNode[] = [];
  const go = (node: AstNode) => {
    if (visit(node, ancestors) === false) return;
    ancestors.push(node);
    for (const key of Object.keys(node)) {
      if (SKIP_KEYS.has(key)) continue;
      const child = node[key];
      if (Array.isArray(child)) {
        for (const c of child) if (isNode(c)) go(c);
      } else if (isNode(child)) go(child);
    }
    ancestors.pop();
  };
  go(root);
}

export const child = (node: AstNode, key: string): AstNode | null => {
  const c = node[key];
  return isNode(c) ? c : null;
};
export const children = (node: AstNode, key: string): AstNode[] => {
  const c = node[key];
  return Array.isArray(c) ? c.filter(isNode) : [];
};
export const nameOf = (node: AstNode | null): string | null =>
  node && node.type === "Identifier" ? (node.name as string) : null;

/** A string literal and how it was quoted. Template literals without `${}` count as backtick strings. */
export interface StringLit {
  node: AstNode;
  value: string;
  quote: '"' | "'" | "`";
  /** Offset of the first character of the content. */
  contentStart: number;
}

export function stringLit(node: AstNode | null): StringLit | null {
  if (!node) return null;
  if (node.type === "Literal" && typeof node.value === "string") {
    const raw = String(node.raw ?? "");
    const quote = raw.startsWith("'") ? "'" : '"';
    return { node, value: node.value, quote, contentStart: node.start + 1 };
  }
  if (node.type === "TemplateLiteral" && children(node, "expressions").length === 0) {
    const q = children(node, "quasis")[0];
    const cooked = (q?.value as { cooked?: string; raw: string } | undefined) ?? { raw: "" };
    return { node, value: cooked.cooked ?? cooked.raw, quote: "`", contentStart: node.start + 1 };
  }
  return null;
}

/** Mini-notation is every double-quoted and backtick string (the transpiler's rule). */
export const isMiniLiteral = (s: StringLit): boolean => s.quote !== "'";

/** A constant numeric expression (`92/4`, `1/3`, `-1`, `2 * 4`), or null. */
export function numericValue(node: AstNode | null): number | null {
  if (!node) return null;
  switch (node.type) {
    case "Literal":
      return typeof node.value === "number" ? node.value : null;
    case "UnaryExpression": {
      const v = numericValue(child(node, "argument"));
      if (v === null) return null;
      return node.operator === "-" ? -v : node.operator === "+" ? v : null;
    }
    case "BinaryExpression": {
      const a = numericValue(child(node, "left"));
      const b = numericValue(child(node, "right"));
      if (a === null || b === null) return null;
      switch (node.operator) {
        case "+":
          return a + b;
        case "-":
          return a - b;
        case "*":
          return a * b;
        case "/":
          return b === 0 ? null : a / b;
        default:
          return null;
      }
    }
    case "ParenthesizedExpression":
      return numericValue(child(node, "expression"));
    default:
      return null;
  }
}

// --- call chains ---------------------------------------------------------------------------------

export interface ChainLink {
  /** Method or function name. */
  name: string;
  call: AstNode;
  args: AstNode[];
  /** The identifier node of the name (for ranges). */
  nameNode: AstNode;
}

/**
 * A call chain in application order: `note("c4").s("piano").room(.2)` → root `note(…)`, then `s`, `room`.
 * `rootCall` is the first link when the chain starts with a call to a plain identifier; otherwise `base`
 * holds the expression the methods are applied to (an identifier like `melVerse`, a literal string, …).
 */
export interface Chain {
  node: AstNode;
  base: AstNode | null;
  links: ChainLink[];
  /** True when links[0] is a call to a bare function (`note(…)`), false when it is a method on `base`. */
  rootIsCall: boolean;
}

export function chainOf(expr: AstNode): Chain {
  const links: ChainLink[] = [];
  let cur: AstNode | null = expr;
  let base: AstNode | null = null;
  let rootIsCall = false;
  while (cur) {
    if (cur.type === "ChainExpression") {
      cur = child(cur, "expression");
      continue;
    }
    if (cur.type === "CallExpression") {
      const callee = child(cur, "callee");
      const args = children(cur, "arguments");
      if (callee?.type === "Identifier") {
        links.push({ name: callee.name as string, call: cur, args, nameNode: callee });
        rootIsCall = true;
        cur = null;
        break;
      }
      if (callee?.type === "MemberExpression" && !callee.computed) {
        const prop = child(callee, "property");
        if (prop?.type === "Identifier") {
          links.push({ name: prop.name as string, call: cur, args, nameNode: prop });
          cur = child(callee, "object");
          continue;
        }
      }
      base = cur;
      cur = null;
      break;
    }
    base = cur;
    cur = null;
  }
  links.reverse();
  return { node: expr, base, links, rootIsCall };
}

/** Every call in the program: its name (identifier callee or member property), node and arguments. */
export interface CallSite {
  name: string;
  call: AstNode;
  args: AstNode[];
  nameNode: AstNode;
  /** `obj.name(…)` rather than `name(…)`. */
  isMethod: boolean;
  /** For a method call: the object, when it is a plain identifier (`Math` in `Math.round`). */
  objectName: string | null;
}

export function callSites(ast: AstNode): CallSite[] {
  const out: CallSite[] = [];
  walk(ast, (n) => {
    if (n.type !== "CallExpression") return;
    const callee = child(n, "callee");
    const args = children(n, "arguments");
    if (callee?.type === "Identifier") {
      out.push({
        name: callee.name as string,
        call: n,
        args,
        nameNode: callee,
        isMethod: false,
        objectName: null,
      });
    } else if (callee?.type === "MemberExpression" && !callee.computed) {
      const prop = child(callee, "property");
      if (prop?.type === "Identifier") {
        out.push({
          name: prop.name as string,
          call: n,
          args,
          nameNode: prop,
          isMethod: true,
          objectName: nameOf(child(callee, "object")),
        });
      }
    }
    return undefined;
  });
  return out;
}

/** Every string literal with the call it is a direct argument of (if any). */
export interface StringArg extends StringLit {
  /** Name of the call this literal is a direct argument of. */
  callee: string | null;
  argIndex: number;
  call: AstNode | null;
}

export function stringArgs(ast: AstNode): StringArg[] {
  const out: StringArg[] = [];
  walk(ast, (n, ancestors) => {
    const lit = stringLit(n);
    if (!lit) return undefined;
    const parent = ancestors[ancestors.length - 1] ?? null;
    let callee: string | null = null;
    let argIndex = -1;
    let call: AstNode | null = null;
    if (parent?.type === "CallExpression") {
      const args = children(parent, "arguments");
      argIndex = args.indexOf(n);
      if (argIndex >= 0) {
        const c = child(parent, "callee");
        callee =
          c?.type === "Identifier"
            ? (c.name as string)
            : c?.type === "MemberExpression" && !c.computed
              ? nameOf(child(c, "property"))
              : null;
        call = parent;
      }
    }
    out.push({ ...lit, callee, argIndex, call });
    return false;
  });
  return out;
}

// --- program structure ---------------------------------------------------------------------------

export interface LabelInfo {
  label: string;
  node: AstNode;
  /** The labelled expression (null when the body is not an expression statement). */
  expr: AstNode | null;
  labelStart: number;
  labelEnd: number;
}

export interface ConstInfo {
  name: string;
  node: AstNode;
  init: AstNode | null;
  kind: "const" | "let" | "var";
}

export interface ProgramInfo {
  labels: LabelInfo[];
  consts: ConstInfo[];
  /** Top-level expression statements that are not labelled (`setcpm(…)`, a bare pattern). */
  expressions: AstNode[];
  body: AstNode[];
}

export function programInfo(ast: AstNode): ProgramInfo {
  const info: ProgramInfo = { labels: [], consts: [], expressions: [], body: children(ast, "body") };
  for (const stmt of info.body) {
    if (stmt.type === "LabeledStatement") {
      const id = child(stmt, "label");
      const body = child(stmt, "body");
      info.labels.push({
        label: nameOf(id) ?? "",
        node: stmt,
        expr: body?.type === "ExpressionStatement" ? child(body, "expression") : null,
        labelStart: id?.start ?? stmt.start,
        labelEnd: id?.end ?? stmt.start,
      });
    } else if (stmt.type === "VariableDeclaration") {
      for (const d of children(stmt, "declarations")) {
        const name = nameOf(child(d, "id"));
        if (name)
          info.consts.push({ name, node: d, init: child(d, "init"), kind: stmt.kind as ConstInfo["kind"] });
      }
    } else if (stmt.type === "ExpressionStatement") {
      const e = child(stmt, "expression");
      if (e) info.expressions.push(e);
    }
  }
  return info;
}

/** Names bound anywhere in the program (consts, function and arrow parameters): callees that are not Strudel's. */
export function declaredNames(ast: AstNode): Set<string> {
  const names = new Set<string>();
  const collect = (p: AstNode | null) => {
    if (!p) return;
    switch (p.type) {
      case "Identifier":
        names.add(p.name as string);
        break;
      case "ObjectPattern":
        for (const prop of children(p, "properties"))
          collect(child(prop, prop.type === "RestElement" ? "argument" : "value"));
        break;
      case "ArrayPattern":
        for (const el of children(p, "elements")) collect(el);
        break;
      case "RestElement":
        collect(child(p, "argument"));
        break;
      case "AssignmentPattern":
        collect(child(p, "left"));
        break;
    }
  };
  walk(ast, (n) => {
    if (n.type === "VariableDeclarator") collect(child(n, "id"));
    if (
      n.type === "FunctionDeclaration" ||
      n.type === "FunctionExpression" ||
      n.type === "ArrowFunctionExpression"
    ) {
      if (n.type === "FunctionDeclaration") collect(child(n, "id"));
      for (const p of children(n, "params")) collect(p);
    }
    if (n.type === "CatchClause") collect(child(n, "param"));
    return undefined;
  });
  return names;
}

// --- sections: one arrange() per labelled track (contracts §6.3) -------------------------------------

export interface ArrangedTrack {
  track: string;
  arrange: AstNode;
  sections: { name: string | null; bars: number | null; node: AstNode; pattern: AstNode | null }[];
}

/** The labelled tracks whose expression has exactly one `arrange()` at the root of its chain. */
export function arrangedTracks(info: ProgramInfo): ArrangedTrack[] {
  const out: ArrangedTrack[] = [];
  for (const l of info.labels) {
    if (!l.expr || l.label.startsWith("_") || l.label.endsWith("_")) continue;
    const ch = chainOf(l.expr);
    const first = ch.links[0];
    if (!ch.rootIsCall || first?.name !== "arrange") continue;
    out.push({
      track: l.label,
      arrange: first.call,
      sections: first.args.map((a) => {
        if (a.type !== "ArrayExpression") return { name: null, bars: null, node: a, pattern: null };
        const [bars, pat] = children(a, "elements");
        return {
          name: pat ? nameOf(pat) : null,
          bars: numericValue(bars ?? null),
          node: a,
          pattern: pat ?? null,
        };
      }),
    });
  }
  return out;
}

/** `melChorus2` → { label: "chorus", tag: "chorus2" }; `silence` → null (a resting section). */
export function sectionName(identifier: string | null): { label: string; tag: string } | null {
  if (!identifier || identifier === "silence") return null;
  const m = /^[a-z][a-z0-9]*?([A-Z][A-Za-z0-9]*)$/.exec(identifier);
  const tag = (m ? (m[1] as string) : identifier).toLowerCase();
  return { label: tag.replace(/\d+$/, "") || tag, tag };
}

export type SectionsResult =
  | { sections: SectionInfo[]; totalBars: number }
  | { inconsistent: { track: string; detail: string } }
  | null;

export function sectionsFromProgram(info: ProgramInfo): SectionsResult {
  const tracks = arrangedTracks(info);
  if (tracks.length === 0) return null;
  for (const t of tracks) {
    if (t.sections.length === 0)
      return { inconsistent: { track: t.track, detail: "arrange() has no sections" } };
    for (const [i, s] of t.sections.entries()) {
      if (s.bars === null || !Number.isInteger(s.bars) || s.bars <= 0) {
        return {
          inconsistent: {
            track: t.track,
            detail: `section ${i + 1} needs a whole number of bars: [8, ${s.name ?? "…"}]`,
          },
        };
      }
    }
  }
  const [first, ...rest] = tracks as [ArrangedTrack, ...ArrangedTrack[]];
  for (const t of rest) {
    if (t.sections.length !== first.sections.length) {
      return {
        inconsistent: {
          track: t.track,
          detail: `${t.track} has ${t.sections.length} sections, ${first.track} has ${first.sections.length}`,
        },
      };
    }
    for (const [i, s] of t.sections.entries()) {
      const f = first.sections[i];
      if (f && s.bars !== f.bars) {
        return {
          inconsistent: {
            track: t.track,
            detail: `section ${i + 1} is ${s.bars} bars in ${t.track} and ${f.bars} bars in ${first.track}`,
          },
        };
      }
    }
  }
  const sections: SectionInfo[] = [];
  let start = 0;
  for (let i = 0; i < first.sections.length; i++) {
    let named: { label: string; tag: string } | null = null;
    for (const t of tracks) {
      const n = sectionName(t.sections[i]?.name ?? null);
      if (!n) continue;
      if (named && named.label !== n.label) {
        return {
          inconsistent: {
            track: t.track,
            detail: `section ${i + 1} is a ${n.label} in ${t.track} and a ${named.label} elsewhere`,
          },
        };
      }
      // The tag names the variant: a numbered tag (`chorus2`) on any track wins over a plain one.
      if (!named || (!/\d$/.test(named.tag) && /\d$/.test(n.tag))) named = n;
    }
    const bars = first.sections[i]?.bars as number;
    sections.push({ label: named?.label ?? "rest", tag: named?.tag ?? "rest", bars, startBar: start });
    start += bars;
  }
  return { sections, totalBars: start };
}

/** Public `sectionsFromAst`: `null` when no track is arranged or the code does not parse. */
export function sectionsFromAst(code: string): SectionsResult {
  const parsed = parseProgram(code);
  if (!parsed.ok) return null;
  return sectionsFromProgram(programInfo(parsed.ast));
}
