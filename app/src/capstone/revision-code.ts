// "Try the revision" (contracts §10.6–§10.7): the copy's code and title. Pure; `revision.ts` opens the copy.
import type { CapstoneReview } from "@oak/api";

export type Revision = CapstoneReview["revisions"][number];

const barsText = (b: readonly [number, number] | readonly number[]) =>
  b[0] === b[1] || b.length < 2 ? `bar ${b[0]}` : `bars ${b[0]}–${b[1]}`;

/** The copy's code: the revision as comments (title, bars, why, the suggested lines), then the piece unchanged. */
export function revisionCopyCode(
  code: string,
  rev: Pick<Revision, "title" | "bars" | "why" | "tryCode">,
): string {
  const lines = [
    `// Revision to try, from Claude's review (${barsText(rev.bars)}): ${rev.title}`,
    ...wrap(rev.why, 100).map((l) => `// ${l}`),
  ];
  const tryLines = rev.tryCode.trim() ? rev.tryCode.trim().split("\n") : [];
  if (tryLines.length)
    lines.push("// Suggested code (type what you keep):", ...tryLines.map((l) => `//   ${l}`));
  lines.push("// The released version on your album is unchanged.", "");
  return `${lines.join("\n")}\n${code}`;
}

function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of text.trim().split(/\s+/)) {
    if (line && line.length + 1 + w.length > width) {
      out.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out;
}

/** Copy title: "Four-Chord Song · trying “Let bar 7 breathe”" (≤ 120 characters). */
export function revisionCopyTitle(trackTitle: string, rev: Pick<Revision, "title">): string {
  return `${trackTitle} · trying “${rev.title}”`.slice(0, 120);
}
