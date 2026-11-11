// Option labels and short prompts are Markdown with Oak's inline forms (`code`, **bold**, *italic*). Labels are
// one line: this renders those three and nothing else, as text (never HTML).
import type { ReactNode } from "react";

const TOKEN = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;

export function InlineMd({ text }: { text: string }) {
  const parts = text.split(TOKEN).filter((p) => p !== "");
  const out: ReactNode[] = parts.map((p, i) => {
    const key = `${i}-${p}`;
    if (p.startsWith("`") && p.endsWith("`"))
      return (
        <code key={key} className="rounded bg-surface-2 px-1 font-mono text-[0.9em]">
          {p.slice(1, -1)}
        </code>
      );
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={key}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("*") && p.endsWith("*")) return <em key={key}>{p.slice(1, -1)}</em>;
    return <span key={key}>{p}</span>;
  });
  return <>{out}</>;
}

/** Plain text of a label (for `aria-label`s and titles): marks stripped. */
export function plainMd(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1");
}
