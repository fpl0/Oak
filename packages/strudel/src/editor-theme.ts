// Oak's editor theme (ux §7.2/§7.4): Strudel's `strudelTheme` is a dark theme (#222 background, white text,
// pastel tokens), which is unreadable on Paper and off-palette on Bark. Every colour here is a CSS custom
// property (`--oak-code-*`, defined per theme in app/src/ui/theme/tokens.css), so switching Paper ⇄ Bark needs
// no reconfiguration and no `activateTheme` side effect. Paper values are the fallbacks for pages without
// the app's tokens (the package e2e harnesses).
//
// Syntax colours re-use the TAGS of Strudel's own highlight style (the very tag objects its JavaScript
// parser emits; `@lezer/highlight` itself is not a dependency of this package) and give each one an Oak role
// by the colour Strudel gave it. Installed at Prec.highest, so its rules come after Strudel's in the
// stylesheet and win at equal specificity.
import { HighlightStyle, syntaxHighlighting, type TagStyle } from "@codemirror/language";
import { type Extension, Prec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import * as strudelCm from "@strudel/codemirror";

export type CodeRole =
  | "text"
  | "fn"
  | "string"
  | "label"
  | "atom"
  | "punct"
  | "bracket"
  | "comment"
  | "meta"
  | "invalid";

/** Paper fallbacks (each ≥ 4.5:1 on #FFFDF8 except the bracket, ≥ 3:1 as a non-text glyph). */
export const CODE_FALLBACK: Record<CodeRole, string> = {
  text: "#1f1a14",
  fn: "#6b3fa0",
  string: "#2f6b45",
  label: "#0b5f8a",
  atom: "#a8471c",
  punct: "#5c5247",
  bracket: "#6e6457",
  comment: "#6e6457",
  meta: "#8a5a00",
  invalid: "#b4532a",
};

/** The role of each colour of Strudel's `strudelTheme` (@strudel/codemirror 1.3.0). */
export const ROLE_OF_STRUDEL_COLOR: Readonly<Record<string, CodeRole>> = {
  "#89ddff": "label",
  "#c792ea": "fn",
  "#eeffff": "text",
  "#c3e88d": "string",
  "#f78c6c": "atom",
  "#82aaff": "punct",
  "#7d8799": "comment",
  "#525154": "bracket",
  "#ffcb6b": "meta",
  "#decb6b": "meta",
  "#ffffff": "invalid",
};

export const codeVar = (role: CodeRole): string => `var(--oak-code-${role}, ${CODE_FALLBACK[role]})`;

interface SpecLike {
  tag: unknown;
  color?: unknown;
}

/** Finds the highlight style inside a theme extension (a FacetProvider's `value`, or a HighlightStyle). */
export function findHighlightSpecs(ext: unknown, depth = 0): SpecLike[] | null {
  if (ext === null || ext === undefined || depth > 6) return null;
  if (Array.isArray(ext)) {
    for (const e of ext) {
      const found = findHighlightSpecs(e, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof ext !== "object") return null;
  const o = ext as { specs?: unknown; value?: unknown };
  if (Array.isArray(o.specs) && o.specs.every((s) => s && typeof s === "object" && "tag" in s))
    return o.specs as SpecLike[];
  if ("value" in o) return findHighlightSpecs(o.value, depth + 1);
  return null;
}

/** Strudel's specs re-coloured with Oak roles; italics for comments. Unknown colours keep the text colour. */
export function oakSpecs(specs: readonly SpecLike[]): TagStyle[] {
  return specs.map((s) => {
    const role = ROLE_OF_STRUDEL_COLOR[String(s.color ?? "").toLowerCase()] ?? "text";
    const style: TagStyle = { tag: s.tag as TagStyle["tag"], color: codeVar(role) };
    if (role === "comment") style.fontStyle = "italic";
    return style;
  });
}

let cached: Extension | null = null;

/** The editor theme as one extension (built once per page). */
export function oakEditorTheme(): Extension {
  if (cached) return cached;
  const themes = (strudelCm as { themes?: Record<string, unknown> }).themes;
  const specs = findHighlightSpecs(themes?.strudelTheme);
  const selection = "var(--oak-code-selection, rgba(47, 107, 69, 0.18))";
  const base = EditorView.theme({
    "&": { color: codeVar("text"), backgroundColor: "transparent" },
    ".cm-scroller": {
      fontFamily:
        'var(--oak-font-code, "JetBrains Mono Variable", ui-monospace, "SF Mono", Menlo, monospace)',
      lineHeight: "1.55",
    },
    ".cm-content": { caretColor: "var(--oak-code-caret, #2f6b45)" },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--oak-code-caret, #2f6b45)",
      borderLeftWidth: "2px",
    },
    ".cm-gutters": {
      backgroundColor: "transparent",
      color: "var(--oak-code-gutter, #8a7f72)",
      border: "none",
    },
    ".cm-activeLine": { backgroundColor: "var(--oak-code-active-line, rgba(31, 26, 20, 0.04))" },
    ".cm-activeLineGutter": {
      backgroundColor: "var(--oak-code-active-line, rgba(31, 26, 20, 0.04))",
      color: codeVar("punct"),
    },
    "&.cm-focused .cm-selectionBackground, & .cm-line::selection, & .cm-selectionLayer .cm-selectionBackground, .cm-content ::selection":
      { background: `${selection} !important` },
    "& .cm-selectionMatch": { backgroundColor: "transparent" },
    ".cm-tooltip": {
      backgroundColor: "var(--oak-surface, #fffdf8)",
      color: codeVar("text"),
      border: "1px solid var(--oak-border, #ddd3c3)",
      borderRadius: "6px",
    },
    ".cm-tooltip-autocomplete ul li[aria-selected]": {
      backgroundColor: "var(--oak-accent, #2f6b45)",
      color: "var(--oak-on-accent, #ffffff)",
    },
    ".cm-diagnostic": { fontFamily: "var(--oak-font-ui, system-ui, sans-serif)", padding: "4px 8px" },
  });
  const parts: Extension[] = [base];
  if (specs && specs.length > 0) parts.push(syntaxHighlighting(HighlightStyle.define(oakSpecs(specs))));
  cached = Prec.highest(parts);
  return cached;
}
