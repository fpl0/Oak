// SPIKE S1 — strict safety lint for code the learner did not type (tutor cards, imported sketches).
// acorn AST, same parser options as @strudel/transpiler (ecmaVersion 2022, allowAwaitOutsideFunction),
// so what the lint sees is exactly what the transpiler will rewrite and evaluate.
//
// This is NOT a sandbox. It is one layer; see FINDINGS.md "Security posture".

import { parse } from "acorn";

export interface LintDiagnostic {
  rule: string;
  message: string;
  start: number;
  end: number;
}

/** Bare identifiers that must not appear anywhere (reference, property name, binding, object key). */
export const BANNED_IDENTIFIERS = new Set([
  // host / realm
  "Bun",
  "process",
  "require",
  "module",
  "exports",
  "globalThis",
  "self",
  "window",
  "global",
  "top",
  "parent",
  "frames",
  "document",
  "navigator",
  "location",
  // network / threads / storage
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "Worker",
  "SharedWorker",
  "ServiceWorker",
  "BroadcastChannel",
  "MessageChannel",
  "postMessage",
  "importScripts",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "caches",
  // code generation
  "eval",
  "Function",
  "AsyncFunction",
  "GeneratorFunction",
  "ShadowRealm",
  "WebAssembly",
  // timers (string-eval in browsers; `this` = global object for callbacks)
  "setTimeout",
  "setInterval",
  "setImmediate",
  "queueMicrotask",
  "requestAnimationFrame",
  // reflection: every route to a property whose name is built at runtime
  "Reflect",
  "Proxy",
  "Object",
  "Symbol",
  // Strudel's own doors back into the host realm
  "evaluate",
  "evalScope",
  "strudelScope",
  "repl",
  "register",
  "registerControl",
  "registerLanguage",
  "registerWidgetType",
  "compileKabel",
  "worklet",
]);

/** Property-ish names that reach constructors / prototypes; banned as identifiers AND inside any string. */
export const BANNED_WORDS = ["constructor", "__proto__", "prototype"];

const BANNED_NODE_TYPES: Record<string, string> = {
  ThisExpression: "`this` is not allowed",
  ImportExpression: "dynamic import() is not allowed",
  MetaProperty: "import.meta / new.target is not allowed",
  WithStatement: "`with` is not allowed",
  ClassDeclaration: "classes are not allowed",
  ClassExpression: "classes are not allowed",
  Super: "`super` is not allowed",
  TaggedTemplateExpression: "tagged templates are not allowed",
  DebuggerStatement: "`debugger` is not allowed",
};

type Node = { type: string; start: number; end: number; [k: string]: unknown };

function walk(node: unknown, visit: (n: Node, parent: Node | null) => void, parent: Node | null = null): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, parent);
    return;
  }
  const n = node as Node;
  if (typeof n.type !== "string") return;
  visit(n, parent);
  for (const key of Object.keys(n)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc" || key === "range") continue;
    const child = n[key];
    if (child && typeof child === "object") walk(child, visit, n);
  }
}

const isNumericLiteral = (n: Node | undefined) => !!n && n.type === "Literal" && typeof n.value === "number";

export function lintStrict(code: string): LintDiagnostic[] {
  const out: LintDiagnostic[] = [];
  const add = (rule: string, message: string, n: { start: number; end: number }) =>
    out.push({ rule, message, start: n.start, end: n.end });

  let ast: Node;
  try {
    ast = parse(code, { ecmaVersion: 2022, allowAwaitOutsideFunction: true }) as unknown as Node;
  } catch (e) {
    const err = e as { message: string; pos?: number };
    const pos = err.pos ?? 0;
    return [{ rule: "syntax", message: err.message, start: pos, end: pos }];
  }

  const checkString = (text: string, n: Node) => {
    for (const w of BANNED_WORDS) {
      if (text.includes(w)) add("banned-string", `string contains "${w}"`, n);
    }
  };

  walk(ast, (n) => {
    const bannedType = BANNED_NODE_TYPES[n.type];
    if (bannedType) add(`no-${n.type}`, bannedType, n);

    switch (n.type) {
      case "Identifier": {
        const name = n.name as string;
        if (BANNED_IDENTIFIERS.has(name)) add("banned-identifier", `identifier "${name}" is not allowed`, n);
        else if (BANNED_WORDS.includes(name)) add("banned-property", `"${name}" is not allowed`, n);
        else if (name.startsWith("__")) add("banned-property", `dunder name "${name}" is not allowed`, n);
        break;
      }
      case "PrivateIdentifier":
        add("banned-property", "private names are not allowed", n);
        break;
      case "MemberExpression": {
        // x[0] is fine; x[i], x['a'], x[`a`], x['a'+'b'] are not.
        if (n.computed && !isNumericLiteral(n.property as Node)) {
          add("computed-member", "computed member access is only allowed with a numeric literal", n);
        }
        break;
      }
      case "Property":
      case "MethodDefinition":
      case "PropertyDefinition": {
        // {[k]: v} and `const {[k]: x} = obj` are computed access in disguise.
        if (n.computed) add("computed-member", "computed property keys are not allowed", n);
        break;
      }
      case "Literal": {
        if (typeof n.value === "string") checkString(n.value, n);
        if (n.regex) add("no-regex", "regular expressions are not allowed", n);
        break;
      }
      case "TemplateElement": {
        const v = n.value as { raw: string; cooked?: string | null };
        checkString(`${v.raw}\u0000${v.cooked ?? ""}`, n);
        break;
      }
      case "AssignmentExpression":
      case "UpdateExpression": {
        // `note = …` would overwrite a realm global for every later evaluation.
        const target = (n.type === "AssignmentExpression" ? n.left : n.argument) as Node;
        if (target.type === "Identifier") {
          add("global-assign", `assignment to "${target.name as string}" (declare with const/let instead)`, n);
        }
        break;
      }
    }
  });

  // An assignment to a locally declared `let` is fine; drop global-assign hits for declared names.
  const declared = new Set<string>();
  walk(ast, (n) => {
    if (n.type === "VariableDeclarator") collectPatternNames(n.id as Node, declared);
    if (n.type === "FunctionDeclaration" && n.id) declared.add((n.id as Node).name as string);
    if (n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression") {
      for (const p of n.params as Node[]) collectPatternNames(p, declared);
    }
    if (n.type === "CatchClause" && n.param) collectPatternNames(n.param as Node, declared);
  });
  return out.filter((d) => {
    if (d.rule !== "global-assign") return true;
    const name = /assignment to "([^"]+)"/.exec(d.message)?.[1];
    return !(name && declared.has(name));
  });
}

function collectPatternNames(p: Node | null, into: Set<string>): void {
  if (!p) return;
  switch (p.type) {
    case "Identifier":
      into.add(p.name as string);
      break;
    case "ObjectPattern":
      for (const prop of p.properties as Node[]) {
        collectPatternNames((prop.type === "RestElement" ? prop.argument : prop.value) as Node, into);
      }
      break;
    case "ArrayPattern":
      for (const el of p.elements as (Node | null)[]) collectPatternNames(el, into);
      break;
    case "RestElement":
      collectPatternNames(p.argument as Node, into);
      break;
    case "AssignmentPattern":
      collectPatternNames(p.left as Node, into);
      break;
  }
}
