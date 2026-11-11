// The Strudel function catalog (architecture §3.4): one entry per name a learner can type, grouped like
// the unlock table. content/toolbox.ts takes each tool's card text from here; the build writes the
// tutor's catalog block (content/.generated/tutor/catalog.md) from `catalogMarkdown`.
import type { ToolId } from "@oak/content-kit";
import { pitchFns } from "./functions/pitch.ts";
import { rhythmFns } from "./functions/rhythm.ts";
import { soundFns } from "./functions/sound.ts";
import type { FnEntry } from "./types.ts";

export type { FnEntry, FnKind } from "./types.ts";
export { FN_KINDS } from "./types.ts";

export const catalog: readonly FnEntry[] = Object.freeze([...rhythmFns, ...pitchFns, ...soundFns]);

/** Every catalog entry of one tool, in catalog order (`tb.adsr` has one entry with aliases). */
export function fnsOfTool(tool: ToolId | string): FnEntry[] {
  return catalog.filter((f) => f.tool === tool);
}

/** The first catalog entry of each tool: the one its Toolbox card shows. */
export const catalogByTool: ReadonlyMap<string, FnEntry> = new Map(
  [...catalog].reverse().map((f) => [f.tool, f] as const),
);

/** Every name and alias a learner can type, mapped to its entry. */
export const catalogByName: ReadonlyMap<string, FnEntry> = new Map(
  catalog.flatMap((f) => [f.name, ...(f.aliases ?? [])].map((n) => [n, f] as const)),
);

/**
 * The tutor's catalog block: one section per entry, in a stable order, with the unlock site so the model
 * can tell an unlocked tool from a preview. `unlockOf` maps a tool to a human-readable site.
 */
export function catalogMarkdown(unlockOf: (tool: string) => string): string {
  const lines = ["# Strudel function catalog (Oak dialect)", ""];
  for (const f of catalog) {
    const names = [f.name, ...(f.aliases ?? [])].map((n) => `\`${n}\``).join(", ");
    lines.push(`## ${names}`, "");
    lines.push(`- Tool: ${f.tool} (unlocks ${unlockOf(f.tool)}); kind: ${f.kind}`);
    lines.push(`- Signature: \`${f.signature}\``);
    lines.push(`- ${f.explanation}`);
    for (const g of f.gotchas ?? []) lines.push(`- Gotcha: ${g}`);
    if (f.strudelCc) lines.push(`- On strudel.cc: ${f.strudelCc}`);
    lines.push("", "```js", f.example, "```", "");
  }
  return lines.join("\n");
}
