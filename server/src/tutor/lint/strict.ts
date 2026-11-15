// Lint profiles for running code (contracts §11.3), on an acorn AST.
//
// `strict` applies to every piece of code the learner did not type. In the tutor that is: code the
// model passes to evaluate_strudel / compare_haps, propose_code cards and review `tryCode`. A
// snippet that fails is never evaluated and never shown.
//
// The profile is written to fail closed:
//  - the tree is walked generically (every child of every node), so a node type this file has
//    never heard of is still searched for identifiers, strings and member access;
//  - a snippet that does not parse, or that makes the walker throw, is rejected.
//
// Beyond the contract's list the strict profile also bans the reflection entry points (`Object`,
// `Reflect`, `getOwnPropertyDescriptor`, ...). Without them, without computed access and without
// the reserved names, a string can never become a property key, which is what makes rule 3
// (reserved strings) hold even against `"con" + "structor"`.
//
// This is one layer. The others are the toolbox lint (uncatalogued names), the grader worker's
// disabled Function constructor and stubbed network (§11.4) and the browser CSP (§11.2).
import { parse } from "acorn";

export type LintProfile = "base" | "strict";

export type LintRule =
  | "lint.parse"
  | "lint.base.import"
  | "lint.base.with"
  | "lint.base.identifier"
  | "lint.base.member"
  | "lint.base.remote-samples"
  | "lint.strict.computed-member"
  | "lint.strict.this"
  | "lint.strict.reserved-string"
  | "lint.strict.construct";

export interface LintIssue {
  rule: LintRule;
  message: string;
  /** 1-based. */
  line: number;
  from: number;
  to: number;
}

const BASE_IDENTIFIERS: ReadonlySet<string> = new Set(
  (
    "globalThis self window document process Bun require module fetch XMLHttpRequest WebSocket EventSource " +
    "Worker SharedWorker eval Function importScripts navigator postMessage localStorage sessionStorage indexedDB caches"
  ).split(" "),
);

const STRICT_IDENTIFIERS: ReadonlySet<string> = new Set(
  (
    "Reflect Object Proxy Symbol WebAssembly Deno Buffer arguments location top parent frames opener " +
    "setTimeout setInterval setImmediate queueMicrotask requestAnimationFrame evaluate evalScope " +
    "getPrototypeOf setPrototypeOf getOwnPropertyDescriptor getOwnPropertyDescriptors getOwnPropertyNames " +
    "getOwnPropertySymbols defineProperty defineProperties __defineGetter__ __defineSetter__ " +
    "__lookupGetter__ __lookupSetter__"
  ).split(" "),
);

const RESERVED = ["constructor", "__proto__", "prototype"] as const;

const LOOPS = new Set([
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "WhileStatement",
  "DoWhileStatement",
]);
const FUNCTIONS = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ClassDeclaration",
  "ClassExpression",
]);

interface AnyNode {
  type: string;
  start: number;
  end: number;
  loc?: { start: { line: number } };
  [key: string]: unknown;
}

function isNode(v: unknown): v is AnyNode {
  return typeof v === "object" && v !== null && typeof (v as AnyNode).type === "string";
}

function walk(
  value: unknown,
  parent: AnyNode | null,
  visit: (n: AnyNode, parent: AnyNode | null) => void,
): void {
  if (Array.isArray(value)) {
    for (const child of value) walk(child, parent, visit);
    return;
  }
  if (!isNode(value)) return;
  visit(value, parent);
  for (const key of Object.keys(value)) {
    if (key === "loc" || key === "range") continue;
    const child = value[key];
    if (typeof child === "object" && child !== null) walk(child, value, visit);
  }
}

function hasReserved(s: unknown): boolean {
  return typeof s === "string" && RESERVED.some((r) => s.includes(r));
}

function isNumericLiteral(n: unknown): boolean {
  return isNode(n) && n.type === "Literal" && typeof n.value === "number";
}

/** A URL scheme (`https:`, `github:`, `shabda:` ...) or a protocol-relative address. */
const REMOTE = /^\s*(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/** `samples()` may only be given literals, and no literal may point off the machine. */
function samplesArgIsLocal(n: unknown): boolean {
  if (!isNode(n)) return false;
  if (n.type === "Literal") return typeof n.value !== "string" || !REMOTE.test(n.value);
  if (n.type === "TemplateLiteral") {
    const quasis = n.quasis as { value: { cooked?: string | null } }[];
    return (
      (n.expressions as unknown[]).length === 0 && quasis.every((q) => !REMOTE.test(q.value.cooked ?? ""))
    );
  }
  if (n.type === "ArrayExpression") return (n.elements as unknown[]).every(samplesArgIsLocal);
  if (n.type === "ObjectExpression") {
    return (n.properties as AnyNode[]).every(
      (p) => p.type === "Property" && p.computed === false && samplesArgIsLocal(p.value),
    );
  }
  return false;
}

/** The `samples` identifier of `samples(...)` or `x.samples(...)`, else `null`. */
function samplesCallee(callee: unknown): AnyNode | null {
  if (!isNode(callee)) return null;
  if (callee.type === "Identifier") return callee.name === "samples" ? callee : null;
  if (callee.type !== "MemberExpression" || callee.computed === true) return null;
  const prop = callee.property;
  return isNode(prop) && prop.type === "Identifier" && prop.name === "samples" ? prop : null;
}

export function lintCode(code: string, profile: LintProfile): LintIssue[] {
  const issues: LintIssue[] = [];
  const seen = new Set<string>();
  const add = (rule: LintRule, node: AnyNode, message: string) => {
    const key = `${rule}@${node.start}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ rule, message, line: node.loc?.start.line ?? 1, from: node.start, to: node.end });
  };
  const strict = profile === "strict";
  // `samples` identifiers that are the callee of a direct call, whose arguments are then checked.
  // Any other mention (an alias, `(0, samples)(...)`, `samples.call(...)`) would skip that check.
  const directSamples = new Set<AnyNode>();

  let program: unknown;
  // `<!--` and a line-leading `-->` are comments in a script and operators in a module
  // (`x\n--> f()` is `x-- > f()`). Text one parser skips and another runs cannot be vouched for,
  // so such a comment is rejected in both profiles, whichever way the evaluator parses.
  const htmlComments: { start: number; end: number }[] = [];
  try {
    program = parse(code, {
      ecmaVersion: "latest",
      sourceType: "script",
      allowAwaitOutsideFunction: true,
      locations: true,
      onComment: (block, _text, start, end) => {
        if (!block && !code.startsWith("//", start) && !code.startsWith("#!", start))
          htmlComments.push({ start, end });
      },
    });
  } catch (e) {
    const err = e as { loc?: { line?: number }; pos?: number; message?: string };
    const pos = typeof err.pos === "number" ? err.pos : 0;
    const message = `does not parse: ${err.message ?? "syntax error"}`;
    return [{ rule: "lint.parse", message, line: err.loc?.line ?? 1, from: pos, to: pos }];
  }

  const visit = (n: AnyNode, parent: AnyNode | null) => {
    switch (n.type) {
      case "ImportExpression":
      case "MetaProperty":
        add("lint.base.import", n, "import() and import.meta are not allowed");
        break;
      case "WithStatement":
        add("lint.base.with", n, "`with` is not allowed");
        break;
      case "Identifier": {
        const name = n.name as string;
        if (RESERVED.includes(name as (typeof RESERVED)[number])) {
          add("lint.base.member", n, `\`${name}\` is not allowed`);
        } else if (name === "samples" && !directSamples.has(n)) {
          add("lint.base.remote-samples", n, "samples may only be called directly, as samples(...)");
        } else if (BASE_IDENTIFIERS.has(name) || (strict && STRICT_IDENTIFIERS.has(name))) {
          add("lint.base.identifier", n, `\`${name}\` is not allowed`);
        }
        break;
      }
      case "CallExpression": {
        // Pre-order walk: the call is seen before its callee, so the callee can be vouched for here.
        const callee = samplesCallee(n.callee);
        if (callee === null) break;
        directSamples.add(callee);
        if (!(n.arguments as unknown[]).every(samplesArgIsLocal)) {
          add("lint.base.remote-samples", n, "samples() may only load Oak's own sounds");
        }
        break;
      }
    }
    if (!strict) return;

    switch (n.type) {
      case "MemberExpression":
        if (n.computed === true && !isNumericLiteral(n.property)) {
          add("lint.strict.computed-member", n, "computed member access needs a numeric literal key");
        }
        break;
      case "Property":
      case "MethodDefinition":
      case "PropertyDefinition":
        if (n.computed === true && !isNumericLiteral(n.key)) {
          add("lint.strict.computed-member", n, "computed keys are not allowed");
        }
        if (n.kind === "get" || n.kind === "set")
          add("lint.strict.construct", n, "getters and setters are not allowed");
        break;
      case "ThisExpression":
        add("lint.strict.this", n, "`this` is not allowed");
        break;
      case "Literal":
        // `value` is the decoded string, so "constructor" is caught too.
        if (hasReserved(n.value)) add("lint.strict.reserved-string", n, "reserved name inside a string");
        if (n.regex !== undefined) add("lint.strict.construct", n, "regex literals are not allowed");
        break;
      case "TemplateElement": {
        const v = n.value as { raw?: string; cooked?: string | null };
        if (hasReserved(v.cooked) || hasReserved(v.raw)) {
          add("lint.strict.reserved-string", n, "reserved name inside a template string");
        }
        break;
      }
      case "TemplateLiteral":
        if ((n.expressions as unknown[]).length > 0)
          add("lint.strict.construct", n, "template interpolation is not allowed");
        break;
      case "ArrowFunctionExpression":
        if (n.async === true || (isNode(n.body) && n.body.type === "BlockStatement")) {
          add("lint.strict.construct", n, "only arrow functions with an expression body are allowed");
        }
        break;
      case "VariableDeclaration":
        if (n.kind !== "const") add("lint.strict.construct", n, "only `const` declarations are allowed");
        break;
      case "UnaryExpression":
        if (n.operator === "delete") add("lint.strict.construct", n, "`delete` is not allowed");
        break;
      case "SpreadElement":
        // In a call, only a literal array may be spread: its length and contents are visible here.
        if (parent && (parent.type === "CallExpression" || parent.type === "NewExpression")) {
          if (!isNode(n.argument) || n.argument.type !== "ArrayExpression") {
            add("lint.strict.construct", n, "only a literal array may be spread into a call");
          }
        }
        break;
      case "NewExpression":
      case "TryStatement":
      case "AwaitExpression":
      case "YieldExpression":
      case "AssignmentExpression":
      case "UpdateExpression":
      case "TaggedTemplateExpression":
      case "DebuggerStatement":
        add("lint.strict.construct", n, `${n.type} is not allowed`);
        break;
      default:
        if (LOOPS.has(n.type)) add("lint.strict.construct", n, "loops are not allowed");
        else if (FUNCTIONS.has(n.type))
          add("lint.strict.construct", n, "functions and classes are not allowed");
    }
  };

  for (const c of htmlComments) {
    const line = code.slice(0, c.start).split("\n").length;
    issues.push({
      rule: "lint.parse",
      message: "HTML-style comments (`<!--`, `-->`) are not allowed",
      line,
      from: c.start,
      to: c.end,
    });
  }

  try {
    walk(program, null, visit);
  } catch {
    // Too deep or otherwise unwalkable: reject rather than pass something that was not inspected.
    return [{ rule: "lint.parse", message: "could not be analysed", line: 1, from: 0, to: code.length }];
  }
  return issues.sort((a, b) => a.from - b.from);
}

/**
 * A second strict profile the host adds: the server registers @oak/grader's (server/src/tutor-wiring.ts), the
 * profile the page applies again before a card's Preview and an imported sketch's first run. Its allowlist of the
 * names such code may read (no `getDrawContext`, no `parseFractional`, no window global) is the only layer in the
 * page, which keeps `Function` and every global (review:security, Wave 7). This folder stays free of Strudel.
 */
let hostStrict: ((code: string) => LintIssue[]) | null = null;
export function setHostStrictLint(lint: ((code: string) => LintIssue[]) | null): void {
  hostStrict = lint;
}

export function lintStrict(code: string): LintIssue[] {
  const issues = lintCode(code, "strict");
  if (hostStrict === null || issues.some((i) => i.rule === "lint.parse")) return issues;
  const seen = new Set(issues.map((i) => `${i.rule}@${i.from}`));
  for (const i of hostStrict(code)) {
    const key = `${i.rule}@${i.from}`;
    if (seen.has(key)) continue;
    seen.add(key);
    issues.push(i);
  }
  return issues.sort((a, b) => a.from - b.from);
}

/** Short, model-readable lines: `line 2: lint.strict.this: \`this\` is not allowed`. */
export function formatLintIssues(issues: readonly LintIssue[]): string[] {
  return issues.map((i) => `line ${i.line}: ${i.rule}: ${i.message}`);
}
