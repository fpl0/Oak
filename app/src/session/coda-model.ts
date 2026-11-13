// What the Coda shows (contracts §9.3, ux §1.5): only cards whose state changed today — what you can now do,
// tools unlocked, skills that moved on the map, the sketch saved, a tolerance change, the weekly rhythm — then
// tomorrow's preview and "Done for today". Pure; the page renders it (CodaPage.tsx).
import type {
  AlbumTrack,
  AlbumTrackDetail,
  CanDoEntry,
  GymPlan,
  NextUnlock,
  SessionPlan,
  SessionSummary,
  SkillState,
  Unlock,
} from "@oak/api";
import type { CanDoDef, ToolEntry } from "@oak/content-kit";
import { levelName } from "./gym-day.ts";
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
  /** A transcription slot that comes first (`gymNextLabel`): the next lesson waits one day behind it. */
  gym: string | null = null,
): string | null {
  if (summary?.teaser) return `Next time: ${summary.teaser.title}`;
  if (gym) return next ? `Next time: ${gym}. Then ${next.title}` : `Next time: ${gym}`;
  if (next) return `Next time: ${next.title}`;
  return null;
}

/**
 * The transcription slot the next session holds (contracts §2.5), or null when none is due: "a Transcription Gym
 * session (ladder level 6: blues)". A capstone already under way keeps its slot, so the gym never names itself
 * in front of a capstone's later session.
 */
export function gymNextLabel(
  gym: Pick<GymPlan, "active" | "slotDue" | "next"> | null | undefined,
  nextId: string | null,
): string | null {
  if (!gym?.active || !gym.slotDue || !gym.next) return null;
  const m = nextId ? /^[A-Z][A-Z0-9-]*\.S(\d+)$/.exec(nextId) : null;
  if (m && Number(m[1]) > 1) return null;
  const n = gym.next;
  if (n.kind === "own-audio") return "a Transcription Gym session on your own audio";
  const level = n.ladderLevel ?? 1;
  return `a Transcription Gym session (ladder level ${level}: ${levelName(level)})`;
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

// --- Wave 4: a capstone release and the ladder in the Coda ------------------------------------------------------

/** The capstone a session worked on (`C2.S2` → `C2`), or null for any other session. */
export function capstoneOfSession(s: Pick<SessionSummary["session"], "kind" | "mapItemId">): string | null {
  if (s.kind !== "capstone" || !s.mapItemId) return null;
  return /^(.+)\.S\d+$/.exec(s.mapItemId)?.[1] ?? null;
}

export interface ReleaseView {
  track: AlbumTrack;
  version: AlbumTrackDetail["versions"][number];
  /** "Side A · track 3" */
  place: string;
  /** A later version of a track already on the album. */
  revision: boolean;
}

/**
 * The release a capstone session made: the capstone's album track with a version created at or after the session
 * started. `null` while the album is loading, or when the session saved a draft without releasing.
 */
export function releaseOf(
  capstoneId: string | null,
  tracks: readonly AlbumTrack[],
  detail: AlbumTrackDetail | null,
  since: string,
): ReleaseView | null {
  if (!capstoneId) return null;
  const track = tracks.find((t) => t.capstoneId === capstoneId);
  if (!track || !detail || detail.id !== track.id) return null;
  const fresh = detail.versions.filter((v) => v.createdAt >= since);
  const version = fresh.at(-1);
  if (!version) return null;
  const side = track.side === "Bside" ? "B-side" : `Side ${track.side}`;
  return { track, version, place: `${side} · track ${track.trackNo}`, revision: version.version > 1 };
}

/** "What you used" on a release: the version's theory tags, then the code tools it uses, without repeats. */
export function usedOnRelease(
  theoryTags: readonly string[],
  tools: readonly { id: string; label: string; mono: boolean }[],
  limit = 12,
): { theory: string[]; tools: { id: string; label: string; mono: boolean }[] } {
  const seen = new Set<string>();
  const labels = new Set<string>();
  const out: { id: string; label: string; mono: boolean }[] = [];
  for (const t of tools) {
    if (seen.has(t.id) || labels.has(t.label)) continue;
    seen.add(t.id);
    labels.add(t.label);
    out.push(t);
  }
  return { theory: [...new Set(theoryTags)].slice(0, limit), tools: out.slice(0, limit) };
}

/**
 * A code tool's shape without the catalog's example arguments: `.scale("C4:major")` → `.scale()`, `n("-1 0 7")` →
 * `n()`. A release names the tools it uses; the catalog's example key or notes are not the piece's (a minor ballad
 * never reads as "C4:major").
 */
export function codeShape(label: string): string {
  return label.replace(/\((?:[^()]|\([^()]*\))*\)/g, "()");
}

const BASIC_TOOL = /^tb\.(mini\.|label$|setcpm$|s$|s\.pitched$|note$|gain$)/;

/**
 * The code tools a release names under "What you used": code tools (not sounds, chord or scale tables, nor the
 * basic syntax every loop has), those learned since the previous album track first, at most `limit`.
 */
export function releaseTools<
  T extends { id: string; kind: string; unlock: { at: string | readonly string[] } },
>(
  used: readonly string[],
  toolbox: readonly T[],
  order: readonly string[],
  capstoneId: string,
  limit = 8,
): T[] {
  const first = order.indexOf(`${capstoneId}.S1`);
  let prev = -1;
  for (let i = first - 1; i >= 0; i--)
    if (/^[A-Z]+[A-Z0-9-]*\.S\d+$/.test(order[i] as string)) {
      prev = i;
      break;
    }
  const rank = (t: T) => {
    const sites = typeof t.unlock.at === "string" ? [t.unlock.at] : [...t.unlock.at];
    const r = sites.map((s) => order.indexOf(s)).filter((i) => i >= 0);
    return r.length > 0 ? Math.min(...r) : -1;
  };
  const seen = new Set<string>();
  const picked: T[] = [];
  for (const id of used) {
    if (seen.has(id)) continue;
    seen.add(id);
    const t = toolbox.find((x) => x.id === id);
    // Chord and scale rows read as tables ("C Cm Co Caug"); the theory tags name what they are for.
    if (t?.kind !== "tool" || BASIC_TOOL.test(t.id)) continue;
    picked.push(t);
  }
  const fresh = picked.filter((t) => rank(t) > prev);
  const rest = picked.filter((t) => rank(t) <= prev);
  return [...fresh, ...rest].slice(0, limit);
}

// --- Wave 5: what a release opens next on the album (C3, C4, C5, X2) ----------------------------------------------

export interface CapstoneMetaLike {
  id: string;
  title: string;
  objective: string;
  opensAfter: { checkpoints?: readonly string[]; capstones?: readonly string[]; lessons?: readonly string[] };
}

export interface AlbumNext {
  capstoneId: string;
  title: string;
  open: boolean;
  /** One line: what the next track is and when it opens. */
  line: string;
}

/** Core album capstones (C0…C9, X1, X2) in default order, by their first session. */
function albumOrder<T extends { id: string }>(metas: readonly T[], order: readonly string[]): T[] {
  const at = (c: T) => {
    const i = order.indexOf(`${c.id}.S1`);
    return i < 0 ? Number.POSITIVE_INFINITY : i;
  };
  return metas
    .filter((c) => /^(C|X)\d+$/.test(c.id) && at(c) < Number.POSITIVE_INFINITY)
    .sort((a, b) => at(a) - at(b));
}

const sentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

/**
 * The album's next track after a release: open now ("It is open now … Today plans it next.") or what opens it
 * ("It opens with U10.CP Minor checkpoint."). `null` at the end of the core album. X1 after C2 keeps its own lines
 * (the gym gate), so C2 is answered here only when X1 is plainly open or locked behind a checkpoint.
 */
export function albumNext(
  capstoneId: string,
  metas: readonly CapstoneMetaLike[],
  order: readonly string[],
  status: (id: string) => "locked" | "open" | "in_progress" | "released" | null,
  titleOf: (id: string) => string,
): AlbumNext | null {
  const list = albumOrder(metas, order);
  const i = list.findIndex((c) => c.id === capstoneId);
  if (i < 0) return null;
  const next = list.slice(i + 1).find((c) => status(c.id) !== "released");
  if (!next) return null;
  const st = status(next.id);
  const open = st === "open" || st === "in_progress";
  const what = sentence(next.objective);
  if (open)
    return {
      capstoneId: next.id,
      title: next.title,
      open,
      line: `It is open now. ${what} Today plans it next.`,
    };
  const gates = [
    ...(next.opensAfter.checkpoints ?? []).map((g) => titleOf(g)),
    ...(next.opensAfter.lessons ?? []).map((g) => titleOf(g)),
    ...(next.opensAfter.capstones ?? []).filter((g) => status(g) !== "released").map((g) => titleOf(g)),
  ];
  const when = gates.length > 0 ? `It opens after ${gates.join(" and ")}.` : "It opens later in the course.";
  return { capstoneId: next.id, title: next.title, open, line: `${what} ${when}` };
}

/** "Your album now holds 7 tracks." */
export function albumCountLine(tracks: number): string | null {
  if (tracks <= 0) return null;
  return tracks === 1 ? "Your album now holds its first track." : `Your album now holds ${tracks} tracks.`;
}
