// Liner notes for an album release (ux §5.3, wave4.md §5.2): at most 60 words, deterministic, written from the
// piece itself — the learner's line first, then the facts (bars, tempo, key), the theory the piece uses, and the
// flags the contracts ask for: tools still in preview (§3.1 rule 4, §10.7), phrases revealed in a transcription
// (§6.6 X1), and a revision suggested by Claude (§10.7). Flags are never dropped; when the notes run long the
// theory list is shortened first, then the learner's line. Pure.
import type { AnalysisSummary, CadenceType, KeySpec, MeterId } from "@oak/content-kit";

export const LINER_MAX_WORDS = 60;

export interface LinerFacts {
  /** The learner's one line (optional). */
  learnerLine: string;
  bars: number;
  bpm: number | null;
  key: KeySpec | null;
  meter: MeterId;
  /** Theory used, most important first ("Four-chord schemas", "a plagal cadence at bar 8"). */
  theory: readonly string[];
  /** Tool code forms used before their unlock (`voicing()`). */
  previewTools: readonly string[];
  /** Transcriptions: what was revealed rather than heard ("phrase 2"). */
  revealed: readonly string[];
  /** "Aura Lee (1861), traditional melody": what a transcription is of. */
  source?: string | null;
  /** "Played with the Band (Pop kit)". */
  band?: string | null;
  /** "Revision suggested by Claude (bars 5–8)". */
  attribution?: string | null;
}

export function wordCount(text: string): number {
  return text
    .replace(/[`*_]/g, " ")
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

const CADENCE_WORDS: Record<CadenceType, string> = {
  PAC: "a perfect authentic cadence",
  IAC: "an imperfect authentic cadence",
  HC: "a half cadence",
  PC: "a plagal cadence",
  DC: "a deceptive cadence",
  "bVII-I": "a ♭VII–I cadence",
  none: "",
};

const MODE_WORD: Record<string, string> = { major: "major", minor: "minor" };

function keyText(k: KeySpec): string {
  return `${k.tonic.replace("b", "♭").replace("#", "♯")} ${MODE_WORD[k.mode] ?? k.mode}`;
}

/** Theory items read from the analysis: schemas with their bars, then cadences. */
export function analysisTheory(
  a: Pick<AnalysisSummary, "schemas" | "cadences" | "devices"> | null,
): string[] {
  if (!a) return [];
  const out: string[] = [];
  for (const s of a.schemas) {
    const name = s.schema.replace(/^schema\./, "");
    out.push(`the ${name} progression (bars ${s.bars[0]}–${s.bars[1]})`);
  }
  for (const c of a.cadences) {
    const w = CADENCE_WORDS[c.type];
    if (w) out.push(`${w} at bar ${c.bar}`);
  }
  for (const d of a.devices) out.push(d);
  return dedupe(out);
}

export function dedupe(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const i of items) {
    const k = i.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(i.trim());
  }
  return out;
}

function sentence(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

function truncateWords(text: string, max: number): string {
  if (max <= 0) return "";
  const words = text.trim().split(/\s+/);
  if (wordCount(text) <= max) return text.trim();
  const kept: string[] = [];
  let n = 0;
  for (const w of words) {
    const counts = /[\p{L}\p{N}]/u.test(w) ? 1 : 0;
    if (n + counts > max) break;
    kept.push(w);
    n += counts;
  }
  return `${kept.join(" ").replace(/[.,;:]$/, "")}…`;
}

/** The liner notes as short markdown paragraphs, at most `LINER_MAX_WORDS` words. */
export function composeLiner(f: LinerFacts, max = LINER_MAX_WORDS): string {
  const facts = sentence(
    [
      f.source ? `${f.source}:` : null,
      `${f.bars} ${f.bars === 1 ? "bar" : "bars"} of ${f.meter}`,
      f.bpm ? `at ${Math.round(f.bpm)} BPM` : null,
      f.key ? `in ${keyText(f.key)}` : null,
    ]
      .filter(Boolean)
      .join(" "),
  );
  const flags: string[] = [];
  if (f.previewTools.length)
    flags.push(sentence(`Uses preview tools: ${f.previewTools.map((t) => `\`${t}\``).join(", ")}`));
  if (f.revealed.length) flags.push(sentence(`Revealed, not heard: ${f.revealed.join(", ")}`));
  if (f.band) flags.push(sentence(f.band));
  if (f.attribution) flags.push(sentence(f.attribution));

  const theory = [...f.theory];
  const theoryLine = (items: readonly string[]) =>
    items.length ? sentence(`Theory used: ${items.join("; ")}`) : "";
  const build = (line: string, items: readonly string[]) =>
    [line ? sentence(line) : "", facts, theoryLine(items), ...flags].filter(Boolean).join("\n\n");

  let line = f.learnerLine.trim();
  let text = build(line, theory);
  while (wordCount(text) > max && theory.length > 1) {
    theory.pop();
    text = build(line, theory);
  }
  if (wordCount(text) > max && line) {
    const rest = wordCount(build("", theory));
    line = truncateWords(line, max - rest);
    text = build(line, theory);
  }
  while (wordCount(text) > max && theory.length > 0) {
    theory.pop();
    text = build(line, theory);
  }
  return text;
}
