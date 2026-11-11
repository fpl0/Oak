// lesson.mdx: prose only (contracts §5.8, architecture §3.2–§3.3). Parsed with unified + remark-mdx; the
// component set and the props that reference IDs are validated here so content CI, content:check and the
// build share one reading. Isomorphic (no fs).
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";

/** The MDX component set (architecture §3.3, plus `OnPass` from AUTHORING §9). */
export const MDX_COMPONENTS = {
  Step: { required: ["id"], refs: { id: "step" } },
  Example: { required: ["id"], refs: { id: "example" }, optional: ["views", "autoplay"] },
  Editor: { required: ["exercise"], refs: { exercise: "exercise" } },
  Predict: { required: ["exercise"], refs: { exercise: "exercise" }, optional: ["hum"] },
  Choice: { required: ["exercise"], refs: { exercise: "exercise" } },
  EarDrill: { required: ["family"], refs: { family: "family" }, optional: ["level", "trials"] },
  Sing: { required: ["exercise"], refs: { exercise: "exercise" } },
  Tap: { required: ["exercise"], refs: { exercise: "exercise" } },
  StaffInput: { required: ["exercise"], refs: { exercise: "exercise" } },
  Parsons: { required: ["exercise"], refs: { exercise: "exercise" } },
  Make: { required: ["exercise"], refs: { exercise: "exercise" } },
  Staff: { required: ["example"], refs: { example: "example" } },
  PianoRoll: { required: ["example"], refs: { example: "example" } },
  LeadSheet: { required: ["example"], refs: { example: "example" } },
  /** `scale`, not `key`: React keeps `key` for itself, so a `key` prop never reaches the component. */
  Keyboard: { required: [], refs: {}, optional: ["notes", "degrees", "scale"], oneOf: ["notes", "degrees"] },
  Degrees: { required: ["scale", "show"], refs: { scale: "key" } },
  Compare: { required: ["a", "b"], refs: { a: "example", b: "example" } },
  Term: { required: ["id"], refs: { id: "term" } },
  CodeRef: { required: ["fn"], refs: { fn: "fn" } },
  Callout: { required: ["kind"], refs: {}, enums: { kind: ["tip", "trap", "why"] } },
  Unlock: { required: [], refs: { fn: "fn", sound: "sound" }, oneOf: ["fn", "sound"] },
  CanDo: { required: ["id"], refs: { id: "cando" } },
  Recap: { required: [], refs: {} },
  OnPass: { required: [], refs: {} },
  /**
   * U00.L02 only: mounts one screen of the audio and voice setup (ux §4.7) inside a `concept` step. The
   * screen stores its result in the learner profile; the step completes when the screen does (or is
   * skipped, for everything but headphones).
   */
  Setup: {
    required: ["part"],
    refs: {},
    enums: { part: ["headphones", "mic", "noise", "bleed", "tap-latency", "sing-latency", "range"] },
  },
} as const satisfies Record<
  string,
  {
    required: readonly string[];
    refs: Readonly<Record<string, RefKind>>;
    optional?: readonly string[];
    oneOf?: readonly string[];
    enums?: Readonly<Record<string, readonly string[]>>;
  }
>;
export type RefKind = "step" | "example" | "exercise" | "family" | "term" | "fn" | "sound" | "cando" | "key";
export type MdxComponentName = keyof typeof MDX_COMPONENTS;

export interface MdxElement {
  name: string;
  props: Record<string, string | number | boolean>;
  line: number;
  /** The enclosing <Step id>, if any. */
  step: string | null;
}
export interface ParsedMdx {
  elements: MdxElement[];
  /** Step ids in document order. */
  steps: string[];
  codeFences: number[];
  /** Plain text per step (for lesson-text/ and the tutor). */
  text: Record<string, string>;
}

interface MdNode {
  type: string;
  name?: string | null;
  value?: string;
  attributes?: { type: string; name: string; value?: unknown }[];
  children?: MdNode[];
  position?: { start: { line: number } };
}

function attrValue(v: unknown): string | number | boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v;
  if (typeof v === "object" && v && "value" in v) {
    const raw = String((v as { value: unknown }).value).trim();
    if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
    if (raw === "true" || raw === "false") return raw === "true";
    return raw.replace(/^["']|["']$/g, "");
  }
  return String(v);
}

export function parseMdx(source: string): ParsedMdx {
  const tree = unified().use(remarkParse).use(remarkMdx).parse(source) as unknown as MdNode;
  const elements: MdxElement[] = [];
  const steps: string[] = [];
  const codeFences: number[] = [];
  const text: Record<string, string> = {};
  const walk = (node: MdNode, step: string | null) => {
    let here = step;
    if ((node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") && node.name) {
      const props: Record<string, string | number | boolean> = {};
      for (const a of node.attributes ?? [])
        if (a.type === "mdxJsxAttribute") props[a.name] = attrValue(a.value);
      elements.push({ name: node.name, props, line: node.position?.start.line ?? 0, step });
      if (node.name === "Step" && typeof props.id === "string") {
        steps.push(props.id);
        here = props.id;
      }
    }
    if (node.type === "code") codeFences.push(node.position?.start.line ?? 0);
    if ((node.type === "text" || node.type === "inlineCode") && here && node.value)
      text[here] = `${text[here] ?? ""}${text[here] ? " " : ""}${node.value}`.replace(/\s+/g, " ").trim();
    for (const c of node.children ?? []) walk(c, here);
  };
  walk(tree, null);
  return { elements, steps, codeFences, text };
}

export interface MdxRefs {
  step: ReadonlySet<string>;
  example: ReadonlySet<string>;
  exercise: ReadonlySet<string>;
  family: ReadonlySet<string>;
  term: ReadonlySet<string>;
  fn: ReadonlySet<string>;
  sound: ReadonlySet<string>;
  cando: ReadonlySet<string>;
}
export interface MdxIssue {
  line: number;
  rule: string;
  message: string;
}

const KEY_RE =
  /^[A-G][#b]?:(major|minor|dorian|phrygian|lydian|mixolydian|locrian|harmonic minor|melodic minor)$/;

/** Every component known, required props present, every ID prop resolves, Steps match both ways, no fences. */
export function checkMdx(parsed: ParsedMdx, refs: MdxRefs): MdxIssue[] {
  const issues: MdxIssue[] = [];
  for (const line of parsed.codeFences)
    issues.push({ line, rule: "mdx.code-fence", message: "MDX holds no code fences: put code in lesson.ts" });
  for (const el of parsed.elements) {
    const spec = (MDX_COMPONENTS as Record<string, (typeof MDX_COMPONENTS)[MdxComponentName]>)[el.name];
    if (!spec) {
      issues.push({
        line: el.line,
        rule: "mdx.unknown-component",
        message: `<${el.name}> is not in the MDX component set`,
      });
      continue;
    }
    for (const p of spec.required)
      if (!(p in el.props))
        issues.push({ line: el.line, rule: "mdx.missing-prop", message: `<${el.name}> needs ${p}` });
    if ("oneOf" in spec && spec.oneOf && !spec.oneOf.some((p) => p in el.props))
      issues.push({
        line: el.line,
        rule: "mdx.missing-prop",
        message: `<${el.name}> needs one of ${spec.oneOf.join(", ")}`,
      });
    if ("enums" in spec && spec.enums)
      for (const [p, values] of Object.entries(spec.enums))
        if (p in el.props && !(values as readonly string[]).includes(String(el.props[p])))
          issues.push({
            line: el.line,
            rule: "mdx.bad-prop",
            message: `<${el.name} ${p}="${el.props[p]}"> must be one of ${values.join(", ")}`,
          });
    if (el.name !== "Step" && el.step === null)
      issues.push({ line: el.line, rule: "mdx.outside-step", message: `<${el.name}> is outside any <Step>` });
    for (const [prop, kind] of Object.entries(spec.refs)) {
      if (!(prop in el.props)) continue;
      const value = String(el.props[prop]);
      const ok = kind === "key" ? KEY_RE.test(value) : refs[kind as Exclude<RefKind, "key">].has(value);
      if (!ok)
        issues.push({
          line: el.line,
          rule: "mdx.unknown-ref",
          message: `<${el.name} ${prop}="${value}">: no such ${kind}`,
        });
    }
    if (el.name === "Keyboard" && typeof el.props.scale === "string" && !KEY_RE.test(el.props.scale))
      issues.push({
        line: el.line,
        rule: "mdx.unknown-ref",
        message: `<Keyboard scale="${el.props.scale}">: not a key`,
      });
  }
  const mdxSteps = new Set(parsed.steps);
  for (const s of refs.step)
    if (!mdxSteps.has(s))
      issues.push({ line: 0, rule: "mdx.missing-step", message: `step ${s} has no <Step id="${s}">` });
  const seen = new Set<string>();
  for (const s of parsed.steps) {
    if (seen.has(s))
      issues.push({ line: 0, rule: "mdx.duplicate-step", message: `<Step id="${s}"> appears twice` });
    seen.add(s);
  }
  return issues;
}
