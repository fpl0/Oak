// Safety profiles (contracts §11.3), on the acorn AST.
//
// Base (all code, including what the learner types): no import()/import.meta/with, no host identifiers,
// no `.constructor`/`.__proto__`/`.prototype`, no remote samples().
// Strict (code the learner did not type: tutor cards, authored content, Band code, imported sketches):
// base plus the four rule groups of §11.3 and the spike S1 findings (Object, Reflect, Symbol, Proxy
// reach Function without a banned word; destructuring keys; dunder names). A snippet that fails the
// strict profile is never evaluated anywhere.
//
// This is one layer, not a sandbox: the realm also shadows globals, neuters Function and bans import().
import { type AstNode, child, children, stringLit, walk } from "./ast.ts";

export interface SafetyFinding {
  id:
    | "lint.base.import"
    | "lint.base.with"
    | "lint.base.identifier"
    | "lint.base.member"
    | "lint.base.remote-samples"
    | "lint.strict.computed-member"
    | "lint.strict.this"
    | "lint.strict.reserved-string"
    | "lint.strict.construct";
  start: number;
  end: number;
  params: Record<string, string>;
}

/** contracts §11.3: rejected for all code. */
export const BASE_IDENTIFIERS: ReadonlySet<string> = new Set(
  (
    "globalThis self window document process Bun require module fetch XMLHttpRequest WebSocket EventSource " +
    "Worker SharedWorker eval Function importScripts navigator postMessage localStorage sessionStorage " +
    "indexedDB caches"
  ).split(" "),
);

/** Strict profile additions (spike S1): every other route to the host realm or to code generation. */
export const STRICT_IDENTIFIERS: ReadonlySet<string> = new Set(
  (
    "global top parent frames location exports ServiceWorker BroadcastChannel MessageChannel AsyncFunction " +
    "GeneratorFunction ShadowRealm WebAssembly setTimeout setInterval setImmediate queueMicrotask " +
    "requestAnimationFrame Reflect Proxy Object Symbol evaluate evalScope strudelScope repl register " +
    "registerControl registerMultiControl createParam createParams registerLanguage registerWidgetType " +
    "compileKabel worklet arguments"
  ).split(" "),
);

export const RESERVED_WORDS: readonly string[] = ["constructor", "__proto__", "prototype"];

/** Is this Identifier a reference or binding (not a property name after `.` or an object key)? */
function isReference(node: AstNode, parent: AstNode | undefined): boolean {
  if (!parent) return true;
  if (parent.type === "MemberExpression" && parent.property === node && !parent.computed) return false;
  if (
    (parent.type === "Property" || parent.type === "MethodDefinition") &&
    parent.key === node &&
    !parent.computed
  ) {
    // `{ fetch }` shorthand is still a reference to `fetch`.
    return parent.shorthand === true;
  }
  if (
    parent.type === "LabeledStatement" ||
    parent.type === "BreakStatement" ||
    parent.type === "ContinueStatement"
  )
    return false;
  return true;
}

/**
 * A sample location that leaves the machine: any URL scheme (`https:`, `github:`, `shabda:`, `wss:` ...)
 * or a network path (`//host`, and `\\host`, which a browser's URL parser reads as `//host`). Leading C0
 * controls and spaces are stripped first, as the URL parser does.
 */
export function isRemoteLocation(value: string): boolean {
  let i = 0;
  while (i < value.length && value.charCodeAt(i) <= 0x20) i++;
  const v = value.slice(i);
  return /^(?:[a-z][a-z0-9+.-]*:|[\\/]{2})/i.test(v);
}

/** Calls that load sounds from a location: `samples(map | url, base?)`, `aliasBank(url)`. */
const SAMPLE_LOADERS: ReadonlySet<string> = new Set(["samples", "aliasBank"]);

function calleeName(n: AstNode): string {
  const callee = child(n, "callee");
  if (callee?.type === "Identifier") return callee.name as string;
  if (callee?.type === "MemberExpression" && !callee.computed)
    return (child(callee, "property")?.name as string | undefined) ?? "";
  return "";
}

/** Every string value inside a loader's arguments (map values, array items, the base; not map keys). */
function stringsIn(arg: AstNode): StringLitLike[] {
  const out: StringLitLike[] = [];
  walk(arg, (n, ancestors) => {
    const parent = ancestors[ancestors.length - 1];
    if (parent?.type === "Property" && parent.key === n && !parent.computed) return undefined;
    const s = stringLit(n);
    if (s) out.push({ node: n, value: s.value });
    return undefined;
  });
  return out;
}
interface StringLitLike {
  node: AstNode;
  value: string;
}

/** Only literals, arrays and plain objects of them: what the lint can read in full. */
function isStaticData(n: AstNode): boolean {
  switch (n.type) {
    case "Literal":
      return !n.regex;
    case "TemplateLiteral":
      return children(n, "expressions").length === 0;
    case "ArrayExpression":
      return children(n, "elements").every(isStaticData);
    case "ObjectExpression":
      return children(n, "properties").every(
        (p) =>
          p.type === "Property" &&
          !p.computed &&
          !p.method &&
          p.kind === "init" &&
          isStaticData(child(p, "value") as AstNode),
      );
    default:
      return false;
  }
}

export function baseFindings(ast: AstNode): SafetyFinding[] {
  const out: SafetyFinding[] = [];
  const add = (id: SafetyFinding["id"], n: AstNode, params: Record<string, string> = {}) =>
    out.push({ id, start: n.start, end: n.end, params });
  walk(ast, (n, ancestors) => {
    const parent = ancestors[ancestors.length - 1];
    switch (n.type) {
      case "ImportExpression":
        add("lint.base.import", n, { what: "import()" });
        break;
      case "ImportDeclaration":
      case "ExportNamedDeclaration":
      case "ExportDefaultDeclaration":
      case "ExportAllDeclaration":
        add("lint.base.import", n, { what: n.type.startsWith("Import") ? "import" : "export" });
        break;
      case "MetaProperty":
        add("lint.base.import", n, { what: "import.meta" });
        break;
      case "WithStatement":
        add("lint.base.with", n);
        break;
      case "Identifier": {
        const name = n.name as string;
        if (BASE_IDENTIFIERS.has(name) && isReference(n, parent)) add("lint.base.identifier", n, { name });
        break;
      }
      case "MemberExpression": {
        const prop = child(n, "property");
        if (!n.computed && prop?.type === "Identifier" && RESERVED_WORDS.includes(prop.name as string)) {
          add("lint.base.member", prop, { name: prop.name as string });
        }
        break;
      }
      case "CallExpression": {
        if (SAMPLE_LOADERS.has(calleeName(n))) {
          for (const a of children(n, "arguments"))
            for (const s of stringsIn(a))
              if (isRemoteLocation(s.value)) add("lint.base.remote-samples", s.node, { url: s.value });
        }
        break;
      }
    }
    return undefined;
  });
  return out;
}

const isNumericLiteral = (n: AstNode | null) => !!n && n.type === "Literal" && typeof n.value === "number";
const isLiteralArray = (n: AstNode | null) =>
  !!n && n.type === "ArrayExpression" && children(n, "elements").every((e) => e.type === "Literal");

export function strictFindings(ast: AstNode): SafetyFinding[] {
  const out: SafetyFinding[] = [];
  const construct = (n: AstNode, what: string) =>
    out.push({ id: "lint.strict.construct", start: n.start, end: n.end, params: { what } });
  const reserved = (n: AstNode, word: string) =>
    out.push({ id: "lint.strict.reserved-string", start: n.start, end: n.end, params: { word } });
  const checkText = (text: string, n: AstNode) => {
    for (const w of RESERVED_WORDS) if (text.includes(w)) reserved(n, w);
  };
  walk(ast, (n, ancestors) => {
    const parent = ancestors[ancestors.length - 1];
    switch (n.type) {
      case "ThisExpression":
        out.push({ id: "lint.strict.this", start: n.start, end: n.end, params: {} });
        break;
      case "Super":
        construct(n, "`super`");
        break;
      case "MemberExpression":
        if (n.computed && !isNumericLiteral(child(n, "property"))) {
          out.push({
            id: "lint.strict.computed-member",
            start: n.start,
            end: n.end,
            params: { what: "x[…] with a name or an expression" },
          });
        }
        break;
      case "Property":
        if (n.computed) {
          out.push({
            id: "lint.strict.computed-member",
            start: n.start,
            end: n.end,
            params: { what: "a computed key {[k]: …}" },
          });
        }
        if (n.kind === "get" || n.kind === "set") construct(n, "A getter or setter");
        if (n.method === true) construct(n, "A method definition");
        break;
      case "Identifier": {
        const name = n.name as string;
        if (RESERVED_WORDS.includes(name)) reserved(n, name);
        else if (name.startsWith("__")) construct(n, `The name \`${name}\``);
        else if (STRICT_IDENTIFIERS.has(name) && isReference(n, parent)) construct(n, `\`${name}\``);
        break;
      }
      case "PrivateIdentifier":
        construct(n, "A private name");
        break;
      case "Literal":
        if (typeof n.value === "string") checkText(n.value, n);
        if (n.regex) construct(n, "A regular expression");
        break;
      case "TemplateLiteral":
        if (children(n, "expressions").length > 0) construct(n, "An interpolation inside a template string");
        for (const q of children(n, "quasis")) {
          const v = q.value as { raw: string; cooked?: string | null };
          checkText(`${v.raw}\u0000${v.cooked ?? ""}`, q);
        }
        break;
      case "TaggedTemplateExpression":
        construct(n, "A tagged template");
        break;
      case "NewExpression":
        construct(n, "`new`");
        break;
      case "ClassDeclaration":
      case "ClassExpression":
        construct(n, "A class");
        break;
      case "FunctionDeclaration":
      case "FunctionExpression":
        construct(n, "A `function`");
        break;
      case "ArrowFunctionExpression":
        if (child(n, "body")?.type === "BlockStatement") construct(n, "An arrow function with a { } body");
        if (n.async) construct(n, "`async`");
        break;
      case "ForStatement":
      case "ForInStatement":
      case "ForOfStatement":
      case "WhileStatement":
      case "DoWhileStatement":
        construct(n, "A loop");
        break;
      case "TryStatement":
        construct(n, "`try`");
        break;
      case "AwaitExpression":
        construct(n, "`await`");
        break;
      case "YieldExpression":
        construct(n, "A generator");
        break;
      case "AssignmentExpression":
      case "UpdateExpression":
        construct(n, "Assignment");
        break;
      case "VariableDeclaration":
        if (n.kind !== "const") construct(n, `\`${n.kind as string}\` (use const)`);
        break;
      case "SpreadElement":
        if (parent?.type === "CallExpression" || parent?.type === "NewExpression") {
          if (!isLiteralArray(child(n, "argument"))) construct(n, "Spreading a value into a call");
        }
        break;
      case "CallExpression":
        // What a loader fetches must be readable here, or the base rule cannot see a remote URL in it.
        if (SAMPLE_LOADERS.has(calleeName(n)) && !children(n, "arguments").every(isStaticData))
          construct(n, `\`${calleeName(n)}()\` with a value the lint cannot read`);
        break;
      case "DebuggerStatement":
        construct(n, "`debugger`");
        break;
      case "SequenceExpression":
        construct(n, "The comma operator");
        break;
    }
    return undefined;
  });
  return out;
}
