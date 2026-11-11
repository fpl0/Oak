// Toolbox-aware completion (contracts §3.1 rule 3: an unlocked tool is in autocomplete, a locked one is
// absent). Pure: the CodeMirror glue is in extensions.ts. Strudel's own autocompletion stays off.
import type { ToolEntry, UnlockableId } from "@oak/content-kit";

export type CompletionKind = "function" | "sound" | "bank" | "scale";
export interface OakCompletion {
  label: string;
  kind: CompletionKind;
  toolId: UnlockableId;
  /** The catalog signature: `.scale("C4:major")`. */
  detail: string;
  /** The catalog's one-line meaning, shown as documentation. */
  info: string;
}
export interface Vocabulary {
  items: OakCompletion[];
}
export interface CompletionSite {
  /** Start of the text the completion replaces. */
  from: number;
  prefix: string;
  inString: boolean;
  /** Innermost call the cursor is an argument of: `s`, `bank`, `scale`, … or null. */
  callee: string | null;
  afterDot: boolean;
}

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const CALL_NAMES = /(\.)?([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;

function namesOfTool(entry: ToolEntry): string[] {
  const fromMatches = (entry.matches ?? []).filter((m) => IDENT.test(m));
  if (fromMatches.length > 0) return fromMatches;
  return [...entry.code.matchAll(CALL_NAMES)].map((m) => m[2] as string);
}

function namesOfSound(entry: ToolEntry): { names: string[]; kind: CompletionKind } {
  const parts = entry.id.split(".");
  const isBank = parts[1] === "bank" || /\.bank\(/.test(entry.code);
  const explicit = (entry.matches ?? []).filter((m) => /^[A-Za-z][A-Za-z0-9_]*$/.test(m));
  const tail = parts[parts.length - 1] as string;
  return { names: explicit.length > 0 ? explicit : [tail], kind: isBank ? "bank" : "sound" };
}

function namesOfScale(entry: ToolEntry): string[] {
  const explicit = (entry.matches ?? []).filter((m) => /^[a-z][a-z: ]*$/.test(m));
  const names = explicit.length > 0 ? explicit : [entry.id.slice("scale.".length).replaceAll("-", " ")];
  return names.map((n) => n.trim().replace(/\s+/g, ":"));
}

/** Everything the toolbox can complete, locked or not; `completionsFor` filters by the unlocked set. */
export function buildVocabulary(toolbox: readonly ToolEntry[]): Vocabulary {
  const items: OakCompletion[] = [];
  const push = (entry: ToolEntry, label: string, kind: CompletionKind): void => {
    items.push({
      label,
      kind,
      toolId: entry.id,
      detail: entry.catalog.signature || entry.code,
      info: entry.catalog.meaning,
    });
  };
  for (const entry of toolbox) {
    if (entry.id.startsWith("snd.")) {
      const { names, kind } = namesOfSound(entry);
      for (const name of names) push(entry, name, kind);
    } else if (entry.id.startsWith("scale.")) {
      for (const name of namesOfScale(entry)) push(entry, name, "scale");
    } else if (entry.id.startsWith("tb.") && entry.kind === "tool") {
      for (const name of new Set(namesOfTool(entry))) push(entry, name, "function");
    }
  }
  return { items };
}

/** Where the cursor is: inside a string argument (and of which call), or in code. */
export function completionSiteAt(text: string, pos: number): CompletionSite {
  const calls: (string | null)[] = [];
  let quote: string | null = null;
  let stringStart = -1;
  let stringCallee: string | null = null;
  for (let i = 0; i < pos; i++) {
    const ch = text[i] as string;
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") {
      const end = text.indexOf("\n", i);
      if (end < 0 || end >= pos)
        return { from: pos, prefix: "", inString: false, callee: null, afterDot: false };
      i = end;
    } else if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      stringStart = i + 1;
      stringCallee = calls.at(-1) ?? null;
    } else if (ch === "(") {
      const m = /([A-Za-z_$][A-Za-z0-9_$]*)\s*$/.exec(text.slice(Math.max(0, i - 64), i));
      calls.push(m ? (m[1] as string) : null);
    } else if (ch === ")") calls.pop();
  }
  if (quote) {
    const inside = text.slice(stringStart, pos);
    const prefix =
      stringCallee === "scale"
        ? (/(?:^|[\s<>[\],])(?:[A-G][#b]?-?\d?:)?([a-z:]*)$/.exec(inside)?.[1] ?? "")
        : (/[A-Za-z][A-Za-z0-9_]*$/.exec(inside)?.[0] ?? "");
    return { from: pos - prefix.length, prefix, inString: true, callee: stringCallee, afterDot: false };
  }
  const prefix = /[A-Za-z_$][A-Za-z0-9_$]*$/.exec(text.slice(0, pos))?.[0] ?? "";
  const from = pos - prefix.length;
  return { from, prefix, inString: false, callee: calls.at(-1) ?? null, afterDot: text[from - 1] === "." };
}

const STRING_KINDS: Record<string, CompletionKind> = {
  s: "sound",
  sound: "sound",
  bank: "bank",
  scale: "scale",
};

/** Unlocked completions for a site, best match first. An empty prefix completes only on request (`explicit`). */
export function completionsFor(
  vocabulary: Vocabulary,
  unlocked: ReadonlySet<UnlockableId>,
  site: CompletionSite,
  explicit = false,
): OakCompletion[] {
  const wanted: CompletionKind | null = site.inString
    ? (STRING_KINDS[site.callee ?? ""] ?? null)
    : "function";
  if (wanted === null) return [];
  if (site.prefix === "" && !explicit) return [];
  const prefix = site.prefix.toLowerCase();
  const seen = new Set<string>();
  return vocabulary.items
    .filter(
      (item) =>
        item.kind === wanted && unlocked.has(item.toolId) && item.label.toLowerCase().startsWith(prefix),
    )
    .filter((item) => {
      if (seen.has(item.label)) return false;
      seen.add(item.label);
      return true;
    })
    .sort((a, b) => a.label.length - b.label.length || a.label.localeCompare(b.label));
}
