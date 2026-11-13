// Section names in tutor text (Wave 5, wave5.md §4.4): when the music on screen is arranged in sections, a section
// the tutor names ("the chorus", "Chorus 2", "verse 1") becomes a chip that selects that section in the form view
// and loops it, exactly as a click on the section ribbon does. The sections come from the surface's own form view
// (`TutorSubject.sections`, kept in step by `useSubjectHarmony`), else from the code's `arrange()` through the
// grader's `sectionsFromAst` — never from a parse of our own. Bars are counted from the first full bar after a
// pickup, like every bar the tutor names (c4). Pure.
import { type FormView, sectionsFromAst } from "@oak/grader";
import { type FormViewSection, formSectionsOf, type SectionLoop, sectionLoopOf } from "../lib/form-view.ts";

export type { FormViewSection };

const NO_FEATURES = {
  density: 0,
  meanPitch: null,
  low: null,
  high: null,
  instrumentation: [],
  loudness: 0,
  harmonicRhythm: 0,
  energy: 0,
};

/** The sections of a piece's `arrange()`, as the section ribbon names them; `[]` without one or when they disagree. */
export function sectionsFromCode(code: string | null | undefined): FormViewSection[] {
  if (!code || !/\barrange\s*\(/.test(code)) return [];
  let ast: ReturnType<typeof sectionsFromAst>;
  try {
    ast = sectionsFromAst(code);
  } catch {
    return [];
  }
  if (!ast || !("sections" in ast)) return [];
  const view: FormView = {
    kind: "sections",
    sections: ast.sections.map((s) => ({ ...s, tracks: [], features: NO_FEATURES })),
    totalBars: ast.totalBars,
    energy: [],
  };
  return formSectionsOf(view);
}

/**
 * A section's bars as the learner reads them (1-based; with a pickup, cycle 0 is bar 0, so the first full bar is
 * bar 1 and cycle N is bar N).
 */
export function displayBars(
  s: Pick<FormViewSection, "startBar" | "bars">,
  pickup = false,
): {
  from: number;
  to: number;
} {
  const from = pickup ? s.startBar : s.startBar + 1;
  return { from, to: from + Math.max(1, s.bars) - 1 };
}

const range = (b: { from: number; to: number }) =>
  b.from === b.to ? `bar ${b.from}` : `bars ${b.from}–${b.to}`;

/** "Verse bars 1–4, Chorus bars 5–8, …": the line the turn carries so the tutor names sections as the ribbon does. */
export function sectionsLine(sections: readonly FormViewSection[], pickup = false): string | null {
  if (sections.length === 0) return null;
  return sections.map((s) => `${s.text} ${range(displayBars(s, pickup))}`).join(", ");
}

/** "ABAB": the form as letters by first appearance. */
export function formLetters(sections: readonly FormViewSection[]): string {
  return sections.map((s) => s.letter).join("");
}

export type SectionPiece = string | { raw: string; section: FormViewSection };

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The names a section answers to in prose, lower case, each mapped to the section it means: its printed name
 * ("chorus 2"), its tag ("chorus2"), and for the first section of each type the type alone ("chorus", "verse 1").
 */
export function sectionNames(sections: readonly FormViewSection[]): Map<string, FormViewSection> {
  const names = new Map<string, FormViewSection>();
  const put = (k: string, s: FormViewSection) => {
    if (!names.has(k)) names.set(k, s);
  };
  for (const s of sections) {
    put(s.text.toLowerCase(), s);
    put(s.tag.toLowerCase(), s);
  }
  for (const s of sections) {
    put(s.label.toLowerCase(), s);
    put(`${s.label.toLowerCase()} 1`, s);
    if (s.label === "prechorus") put("pre-chorus", s);
  }
  return names;
}

/**
 * Whether a match is a section where the section is named by a single letter (`melA`, `melB`: the A and B of an
 * A A B A form). The letter is also an English article and a note or key name, so it counts only written as a
 * capital, never before a word in lower case ("A small song", "a lovely tune", "A minor", "the B in bar 2") or an
 * accidental ("A♭"), and "Section A" / "A section" / "A2" always count. Any other name always counts.
 */
function letterSectionAt(text: string, raw: string, at: number): boolean {
  if (!/^[a-z](?:\s*\d+)?$/i.test(raw)) return true;
  if (raw[0] !== raw[0]?.toUpperCase()) return false;
  if (/\d/.test(raw)) return true;
  const after = text.slice(at + raw.length);
  const before = text.slice(0, at);
  if (/^\s+sections?\b/i.test(after) || /\bsection\s+$/i.test(before)) return true;
  return !/^\s*[♭♯#]/.test(after) && !/^\s+[a-z]/.test(after);
}

/** Splits text into plain runs and the section names in it. Without sections the text comes back whole. */
export function splitSections(text: string, sections: readonly FormViewSection[]): SectionPiece[] {
  if (sections.length === 0 || text === "") return [text];
  const names = sectionNames(sections);
  const alts = [...names.keys()].sort((a, b) => b.length - a.length).map((k) => esc(k).replace(/ /g, "\\s+"));
  const re = new RegExp(`(?<![A-Za-z0-9-])(?:${alts.join("|")})(?![A-Za-z0-9-])`, "gi");
  const out: SectionPiece[] = [];
  let at = 0;
  for (const m of text.matchAll(re)) {
    const section = names.get(m[0].toLowerCase().replace(/\s+/g, " "));
    if (!section) continue;
    if (!letterSectionAt(text, m[0], m.index as number)) continue;
    if ((m.index as number) > at) out.push(text.slice(at, m.index));
    out.push({ raw: m[0], section });
    at = (m.index as number) + m[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out.length === 0 ? [text] : out;
}

/**
 * What a section chip asks of the Workbench: the loop region (0-based cycles, the form view's `onLoop` value) and
 * the bars as the Workbench's bar references take them (`from` 1-based on cycles: `from - 1` is the first cycle).
 */
export function sectionRequest(s: FormViewSection): {
  loop: SectionLoop;
  cycleBars: { from: number; to: number };
} {
  const loop = sectionLoopOf(s);
  return { loop, cycleBars: { from: loop.from + 1, to: loop.from + loop.bars } };
}

/** Hover text and spoken name of a section chip. */
export function describeSection(s: FormViewSection, pickup = false): { title: string; aria: string } {
  const bars = range(displayBars(s, pickup));
  return {
    title: `${s.text}: ${bars}, section ${s.letter} of the form. Click to select it in the form view and loop it.`,
    aria: `Section ${s.text}, ${bars}: select and loop it`,
  };
}
