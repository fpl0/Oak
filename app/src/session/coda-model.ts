// What the Coda shows (contracts §9.3, ux §1.5): only cards whose state changed today — what you can now do,
// tools unlocked, skills that moved on the map, the sketch saved, a tolerance change, the weekly rhythm — then
// tomorrow's preview and "Done for today". Pure; the page renders it (CodaPage.tsx).
import type { CanDoEntry, NextUnlock, SessionPlan, SessionSummary, SkillState, Unlock } from "@oak/api";
import type { CanDoDef, ToolEntry } from "@oak/content-kit";
import type { BlockReport } from "./types.ts";

export interface CanDoChange {
  candoId: string;
  statement: string;
  area: string;
  /** The status before today, `null` when this is the first evidence. */
  from: CanDoEntry["status"] | null;
  to: CanDoEntry["status"];
}

export interface ToolCard {
  id: string;
  code: string;
  concept: string;
  kind: Unlock["kind"];
}

export interface SkillMove {
  skillId: string;
  name: string;
  from: SkillState["level"];
  to: SkillState["level"];
}

const LEVEL_ORDER: Record<SkillState["level"], number> = {
  new: 0,
  available: 1,
  learning: 2,
  practiced: 3,
  mastered: 4,
};

export const LEVEL_LABEL: Record<SkillState["level"], string> = {
  new: "new",
  available: "open",
  learning: "learning",
  practiced: "practised",
  mastered: "mastered",
};

/** Can-do changes today: the latest entry per statement; `from` is the status before the session started. */
export function canDoChanges(
  today: readonly CanDoEntry[],
  before: ReadonlyMap<string, CanDoEntry["status"]>,
  defs: readonly Pick<CanDoDef, "id" | "statement" | "area">[],
): CanDoChange[] {
  const latest = new Map<string, CanDoEntry>();
  for (const e of today) {
    const prev = latest.get(e.candoId);
    if (!prev || prev.at <= e.at) latest.set(e.candoId, e);
  }
  const out: CanDoChange[] = [];
  for (const [id, e] of latest) {
    const from = before.get(id) ?? null;
    if (from === e.status) continue;
    const def = defs.find((d) => d.id === id);
    out.push({ candoId: id, statement: def?.statement ?? id, area: def?.area ?? "code", from, to: e.status });
  }
  return out;
}

/** The tools unlocked today, with their code form and the concept that justifies them. */
export function toolCards(unlocks: readonly Unlock[], toolbox: readonly ToolEntry[]): ToolCard[] {
  return unlocks.map((u) => {
    const t = toolbox.find((x) => x.id === u.itemId);
    return { id: u.itemId, code: t?.code ?? u.itemId, concept: t?.concept ?? "", kind: u.kind };
  });
}

/** Skills whose level rose since the session started (the map snapshot the runner kept). */
export function skillMoves(
  before: ReadonlyMap<string, SkillState["level"]>,
  after: readonly Pick<SkillState, "skillId" | "level">[],
  nameOf: (id: string) => string,
): SkillMove[] {
  const out: SkillMove[] = [];
  for (const n of after) {
    const from = before.get(n.skillId) ?? "new";
    if (LEVEL_ORDER[n.level] > LEVEL_ORDER[from])
      out.push({ skillId: n.skillId, name: nameOf(n.skillId), from, to: n.level });
  }
  return out.sort((a, b) => LEVEL_ORDER[b.to] - LEVEL_ORDER[a.to] || a.name.localeCompare(b.name));
}

/** "Today you" in up to three short lines, from the session's own reports. */
export function todayLines(
  reports: readonly BlockReport[],
  titleOf: (id: string) => string,
  sketches: number,
): string[] {
  const lines: string[] = [];
  const sets = reports.filter((r) => r.block === "warmup" && !r.skipped).length;
  if (sets > 0) lines.push(`${sets} warm-up ${sets === 1 ? "set" : "sets"}`);
  const main = reports.find((r) => r.block === "new");
  if (main && main.block === "new") {
    const title = titleOf(main.itemId);
    if (main.source === "lesson")
      lines.push(main.completed ? `learned ${title}` : `worked through part of ${title}`);
    else if (main.source === "checkpoint") lines.push(`took ${title}`);
    else if (main.source === "capstone") lines.push(`worked on ${title}`);
    else if (main.source === "gym") lines.push("transcribed in the gym");
    else lines.push(`revisited ${title}`);
  }
  if (sketches > 0) lines.push(sketches === 1 ? "saved a sketch" : `saved ${sketches} sketches`);
  return lines;
}

export const TOLERANCE_LINE = (t: NonNullable<SessionSummary["toleranceChange"]>): string =>
  t.to < t.from
    ? `Your ear-to-voice aim got finer: ±${t.to}¢ now.`
    : `Singing is checked a little more loosely now: ±${t.to}¢.`;

/** The next unlock as a goal-gradient line: "2 lessons → `.voicing()`". */
export function goalGradient(n: Pick<NextUnlock, "remaining" | "remainingKind">, code: string): string {
  const kind = n.remaining === 1 ? n.remainingKind : `${n.remainingKind}s`;
  return `${n.remaining} ${kind} → ${code}`;
}

/** Tomorrow's preview: the server's teaser when opted in, else the next item of the course. */
export function tomorrowLine(
  summary: Pick<SessionSummary, "teaser"> | null,
  next: { id: string; title: string } | null,
): string | null {
  if (summary?.teaser) return `Next time: ${summary.teaser.title}`;
  if (next) return `Next time: ${next.title}`;
  return null;
}

/** Whether the Coda asks for the listening note by itself (contracts §10.10). */
export function autoListen(policy: SessionSummary["listeningNote"], sketchId: string | null): boolean {
  return policy === "auto" && sketchId !== null;
}

/** Map item kind of a plan's main item, for the Coda's "next" copy. */
export function nextKindLabel(plan: Pick<SessionPlan, "kind">): string {
  switch (plan.kind) {
    case "checkpoint":
      return "Checkpoint";
    case "capstone":
      return "Capstone";
    case "gym":
      return "Transcription Gym";
    default:
      return "Lesson";
  }
}
