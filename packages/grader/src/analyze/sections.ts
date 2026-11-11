// Sections (contracts §6.3, STYLE §10): one `arrange()` per labelled track over `const`s named
// `<role><Section>`; section references (`SectionRef`) resolved to bar spans.
import type { SectionRef } from "@oak/content-kit";
import type { SectionInfo } from "../types.ts";

/**
 * The one AST reading of sections lives with the lint (`sectionsFromAst` of `@oak/grader`); the matcher
 * library resolves section references on its result.
 */
export { sectionsFromAst } from "../lint/ast.ts";

/** `melChorus2` → { tag: "chorus2", label: "chorus" }; `bassVerse` → verse; `silence` → null. */
export function sectionNameOf(ident: string): { tag: string; label: string } | null {
  if (ident === "silence") return null;
  const m = /^[a-z]+([A-Z].*)$/.exec(ident);
  const rest = (m ? (m[1] as string) : ident).replace(/^[A-Z]/, (c) => c.toLowerCase());
  const tag = rest.replace(/([A-Z])/g, (c) => c.toLowerCase());
  return { tag, label: tag.replace(/\d+$/, "") || tag };
}

/** The bars `[from, to)` (0-based cycles) a `SectionRef` names, or `null` when it names nothing. */
export function resolveSection(
  ref: SectionRef,
  sections: readonly SectionInfo[],
  totalBars: number,
): [number, number] | null {
  if (ref === "last") {
    const s = sections[sections.length - 1];
    return s ? [s.startBar, s.startBar + s.bars] : totalBars > 0 ? [0, totalBars] : null;
  }
  if ("bars" in ref) return [ref.bars[0] - 1, ref.bars[1]];
  const want = ref.section.toLowerCase();
  const matches = sections.filter((s) => s.tag === want || s.label === want);
  const s =
    ref.nth === undefined
      ? matches[0]
      : ref.nth < 0
        ? matches[matches.length + ref.nth]
        : matches[ref.nth - 1];
  return s ? [s.startBar, s.startBar + s.bars] : null;
}

/** The section that starts a span, when the span is a section. */
export function sectionAt(sections: readonly SectionInfo[], startBar: number): SectionInfo | undefined {
  return sections.find((s) => s.startBar === startBar);
}
