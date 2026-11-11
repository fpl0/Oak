// The analysed piece behind a capstone check, the release and the cover (contracts §6.4 capstone mode): its
// real length (the `arrange()` total, else its period up to 128 bars), the deterministic analysis over exactly
// those bars, the liner notes and the theory tags. Pure: everything here is a function of the code, the
// normalized events and the rubric result.
import type { AnalysisSummary, GradeResult, KeySpec, MeterId, NEvent, RubricRule } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import { analyzePiece, linerNotes, type Normalized, periodOf, sectionsFromAst } from "@oak/grader";

/** Capstone mode never queries more than this (contracts §6.4). */
export const MAX_CAPSTONE_BARS = 128;

/** The piece's length in bars: the `arrange()` sum from the AST, else the period of its events (≥ 1). */
export function pieceBars(code: string, events: readonly NEvent[]): number {
  const ast = sectionsFromAst(code);
  if (ast && "totalBars" in ast) return Math.max(1, Math.min(MAX_CAPSTONE_BARS, ast.totalBars));
  if (events.length === 0) return 1;
  return Math.max(1, periodOf(events, MAX_CAPSTONE_BARS));
}

/** The events of the first `bars` bars only (the grader evaluates the first pass of a piece, §6.3 rule 7). */
export function truncate(n: Normalized, bars: number): Normalized {
  const keep = (e: NEvent) => R.floor(e.onset) < bars;
  const byTrack: Record<string, NEvent[]> = {};
  for (const [t, evs] of Object.entries(n.byTrack)) byTrack[t] = evs.filter(keep);
  return { ...n, byTrack, all: n.all.filter(keep), band: n.band.filter(keep) };
}

export function hasPitches(n: Pick<Normalized, "all">): boolean {
  return n.all.some((e) => e.midi !== null && !e.drum);
}

/**
 * The analysis of exactly `bars` bars. A piece with no pitched notes has no key: the analysis would otherwise
 * read the default key into a drum groove ("in C major").
 */
export function pieceAnalysis(
  n: Normalized,
  o: { code: string; meter: MeterId; key: KeySpec | null; bars: number },
): AnalysisSummary {
  const ctx = { meter: o.meter, code: o.code, bars: o.bars, ...(o.key ? { key: o.key } : {}) };
  const a = analyzePiece(n, ctx as Parameters<typeof analyzePiece>[1]);
  return hasPitches(n) ? a : { ...a, key: [] };
}

export interface LinerInput {
  analysis: AnalysisSummary;
  result: GradeResult;
  /** The learner's one line, first. */
  learnerLine: string;
  /** Can-do statements this capstone evidences (`content/candos.ts`). */
  canDos: readonly string[];
  /** "Played with the Band (Pop)". */
  band?: string;
  attribution?: string;
}

/** Deterministic liner notes (markdown): the learner's line, the analysis, the theory used, the can-dos. */
export function composeLinerNotes(o: LinerInput): string {
  const parts: string[] = [];
  const line = o.learnerLine.trim();
  if (line) parts.push(line);
  const extra: { band?: string; attribution?: string } = {};
  if (o.band) extra.band = o.band;
  if (o.attribution) extra.attribution = o.attribution;
  parts.push(linerNotes(o.analysis, o.result, extra));
  if (o.canDos.length) parts.push(o.canDos.map((c) => `- ${c}`).join("\n"));
  return parts.join("\n\n").slice(0, 4000);
}

/**
 * Theory tags for the album (≤ 12): the names of the skills behind the rules the piece meets, in rubric order,
 * then the analysis' schemas and devices.
 */
export function theoryTags(
  rules: readonly RubricRule[],
  result: GradeResult,
  analysis: AnalysisSummary | null,
  skillName: (id: string) => string | null,
): string[] {
  const met = new Set((result.rubric ?? []).filter((r) => r.ok).map((r) => r.ruleId));
  const out: string[] = [];
  const add = (t: string | null | undefined) => {
    if (t && !out.includes(t)) out.push(t);
  };
  for (const r of rules) if (met.has(r.id)) for (const s of r.skills) add(skillName(String(s)));
  for (const s of analysis?.schemas ?? []) add(s.schema.replace(/^schema\./, ""));
  for (const d of analysis?.devices ?? []) add(d.replace(/ bar \d+.*$/, "").replace(/ \(.*\)$/, ""));
  return out.slice(0, 12);
}

/** mm:ss */
export function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
