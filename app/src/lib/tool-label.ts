// The learner-facing name of a toolbox entry. The registry's `code` column is transcribed from the contract
// tables (contracts §3.2), so for app features it carries editorial notes ("Band layer (read-only backing; mute
// only)", "Sing panel (PitchLane)") and for some code rows it is a description ("lowercase track labels name:",
// "space-separated sequence"). Today's Next unlock, the Coda and onboarding's Coda show this instead: a feature
// by its plain name, a code row by its code (the catalog signature when the code column is prose).
import type { ToolEntry } from "@oak/content-kit";

export interface ToolLabel {
  text: string;
  /** Code (monospace) or a plain feature name. */
  mono: boolean;
}

const PROSE = /(^|\s)[a-z][a-z-]{2,}\s+[a-z][a-z-]{2,}(\s|$)/i;

/** Text outside quotes and parentheses, to tell a description from code that merely contains words. */
function bare(code: string): string {
  return code.replace(/"[^"]*"|'[^']*'|\([^)]*\)/g, " ");
}

export function toolLabel(
  t: Pick<ToolEntry, "kind" | "code"> & { catalog?: { signature?: string } },
): ToolLabel {
  if (t.kind === "feature" || t.kind === "lens" || t.kind === "template") {
    const plain = t.code.replace(/\s*\([^)]*\)\s*$/, "").trim();
    return { text: plain || t.code, mono: false };
  }
  const sig = t.catalog?.signature?.trim();
  if (sig && PROSE.test(bare(t.code))) return { text: sig, mono: true };
  return { text: t.code, mono: true };
}
