// A capstone day (contracts §2.4, §9.1; ux §1.4 "capstone day"): one capstone runs over several sessions — C2.S1
// and S2, X1.S1 to S3 — each the New block of its own day. Today names the session ("C2 Four-Chord Song ·
// session 2 of 2: Melody"), says what today's work is and, from the second session on, that the draft plays from
// the top before the work resumes. A capstone in progress is never interrupted by a gym slot (contracts §2.5):
// the server's planner keeps that rule, and `keepCapstone` keeps it on this side too should a plan ever offer
// the slot while a capstone session is still open. Pure: Today, the session host and the Coda read it.
import type { CapstoneSessions, CapstoneStatus, CourseProgress, SessionPlan } from "@oak/api";
import { parseCapstoneSessionId } from "@oak/api";

/** What a capstone definition contributes (content-kit `CapstoneDef`, `sessionDefs`). */
export interface CapstoneDefLike {
  id: string;
  title: string;
  kind: "compose" | "transcribe";
  sessionDefs: readonly { id: string; title: string; release?: boolean; review?: boolean }[];
}

export interface DraftRef {
  sketchId: string;
  sketchVersion: number | null;
}

export interface CapstoneDay {
  capstoneId: string;
  /** `C2.S2` */
  sessionId: string;
  /** 1-based. */
  index: number;
  total: number;
  /** "C2 Four-Chord Song" */
  title: string;
  /** "Melody" */
  sessionTitle: string | null;
  /** "C2 Four-Chord Song · session 2 of 2: Melody" */
  detail: string;
  /** The lead under Today's heading. */
  lead: string;
  /** A later session (or the same one again): the draft is there and plays from the top first. */
  resume: boolean;
  /** The draft that plays from the top, when the server names one. */
  draft: DraftRef | null;
  /** This session ends with the release (the content says so, else it is the last session). */
  releases: boolean;
  /** X1: the checks done so far, in one line ("Phrases 1–4 checked; 1 revealed"). */
  checksLine: string | null;
}

/** "C2 Four-Chord Song" → "Four-Chord Song" (the album title of a track). */
export function capstoneShortTitle(def: Pick<CapstoneDefLike, "id" | "title">): string {
  return def.title.startsWith(`${def.id} `) ? def.title.slice(def.id.length + 1) : def.title;
}

/**
 * The title a capstone day shows. The two parts of the core finale read by what they are ("Album Single",
 * "Standard Transcription": content/specs/CF.md), never by their registry prefix; every other capstone keeps its
 * own ("C7 Chromatic Colour").
 */
export function capstoneDayTitle(title: string): string {
  return /^CF-[AT] Core Finale: (.+)$/.exec(title)?.[1] ?? title;
}

type Check = CapstoneSessions["sessions"][number]["checks"][number];

const pct = (x: number | null) => (x === null ? "" : ` at ${Math.round(x * 100)}%`);

/** A staged check's name ("the bass", "the changes", "melody line 2"). */
function stagedName(c: Check): string {
  if (c.layer === "form") return "the form map";
  if (c.layer === "bass") return "the bass";
  if (c.layer === "chords") return "the changes";
  const p = typeof c.phrase === "number" ? c.phrase : c.phrase[0];
  return `melody line ${p}`;
}

/**
 * X2 (and any capstone whose checks open in order, `CapstoneCheckState.after`): what passed so far and what is next,
 * in one line ("The bass passed at 92%, the changes at 88%; next, the melody line by line"). Every session up to and
 * including today's counts: a stage passed earlier today stays passed when the session resumes.
 */
export function stagedChecksLine(sessions: CapstoneSessions | null, upTo: number): string | null {
  if (!sessions) return null;
  const all = sessions.sessions.slice(0, Math.max(0, upTo)).flatMap((s) => s.checks);
  if (!all.some((c) => c.after !== undefined)) return null;
  const passed = all.filter((c) => c.passed || c.revealed);
  if (passed.length === 0) return null;
  const said = passed.map((c, i) => {
    const name = stagedName(c);
    const head = i === 0 ? `${name[0]?.toUpperCase()}${name.slice(1)}` : name;
    return c.revealed && !c.passed ? `${head} revealed (no evidence)` : `${head} passed${pct(c.score)}`;
  });
  const later = sessions.sessions.flatMap((s) => s.checks).filter((c) => !c.passed && !c.revealed);
  const next = later[0];
  const nextLine = !next
    ? "every stage is done"
    : next.layer === "melody"
      ? "next, the melody line by line"
      : `next, ${stagedName(next)}`;
  return `${said.join(", ")}; ${nextLine}`;
}

function checksLine(sessions: CapstoneSessions | null, upTo: number): string | null {
  if (!sessions) return null;
  const staged = stagedChecksLine(sessions, upTo);
  if (staged) return staged;
  const done = sessions.sessions
    .slice(0, Math.max(0, upTo - 1))
    .flatMap((s) => s.checks)
    .filter((c) => c.passed || c.revealed);
  if (done.length === 0) return null;
  const phrases = new Set<number>();
  for (const c of done) {
    if (c.layer !== "melody") continue;
    const [a, b] = typeof c.phrase === "number" ? [c.phrase, c.phrase] : c.phrase;
    for (let p = a; p <= b; p++) phrases.add(p);
  }
  const revealed = done.filter((c) => c.revealed).length;
  const sorted = [...phrases].sort((x, y) => x - y);
  const span =
    sorted.length === 0
      ? null
      : sorted.length === 1
        ? `Phrase ${sorted[0]} checked`
        : sorted.at(-1) === (sorted[0] as number) + sorted.length - 1
          ? `Phrases ${sorted[0]}–${sorted.at(-1)} checked`
          : `Phrases ${sorted.join(", ")} checked`;
  if (!span) return null;
  if (revealed === 0) return span;
  return `${span}; ${revealed} revealed, so ${revealed === 1 ? "it earns" : "they earn"} no evidence`;
}

/** The draft to play from the top: this session's own, else the latest one an earlier session saved. */
export function resumeDraft(
  sessions: CapstoneSessions | null,
  sessionId: string,
  status: Pick<CapstoneStatus, "sketchId"> | null,
): DraftRef | null {
  if (sessions) {
    const i = sessions.sessions.findIndex((s) => s.capstoneSessionId === sessionId);
    const upTo = i < 0 ? sessions.sessions.length : i + 1;
    for (let k = upTo - 1; k >= 0; k--) {
      const d = sessions.sessions[k]?.draft;
      if (d) return { sketchId: d.sketchId, sketchVersion: d.sketchVersion };
    }
    return null;
  }
  return status?.sketchId ? { sketchId: status.sketchId, sketchVersion: null } : null;
}

/** The capstone day of a plan, or null when the plan is not a capstone session. */
export function capstoneDay(
  plan: Pick<SessionPlan, "kind" | "mapItemId" | "title">,
  def: CapstoneDefLike | null,
  sessions: CapstoneSessions | null,
  status: Pick<CapstoneStatus, "sketchId" | "sessionsDone" | "sessionsTotal"> | null,
): CapstoneDay | null {
  if (plan.kind !== "capstone" || !plan.mapItemId) return null;
  const parsed = parseCapstoneSessionId(plan.mapItemId);
  if (!parsed) return null;
  const total = def?.sessionDefs.length || status?.sessionsTotal || parsed.n;
  const sDef = def?.sessionDefs[parsed.n - 1] ?? null;
  const title = capstoneDayTitle(def?.title ?? plan.title);
  const sessionTitle = sDef?.title ?? null;
  const releases = sDef?.release ?? parsed.n === total;
  const own = sessions?.sessions.find((s) => s.capstoneSessionId === parsed.session) ?? null;
  const draft = resumeDraft(sessions, parsed.session, status);
  // Resuming: a later session of the capstone, or this session started before (its own draft or checks exist).
  const resume =
    draft !== null &&
    (parsed.n > 1 || own?.status === "in_progress" || (status !== null && status.sessionsDone >= parsed.n));
  const of = total > 1 ? ` · session ${parsed.n} of ${total}` : "";
  const detail = `${title}${of}${sessionTitle ? `: ${sessionTitle}` : ""}`;
  const transcribe = def?.kind === "transcribe";
  const work = transcribe ? "transcription" : "draft";
  const lead = resume
    ? `${releases ? "The last session: finish the piece, then release it to your album." : "Today's work carries on from where the draft stands."} Your ${work} plays from the top first, so you hear where you are. It saves as you go.`
    : parsed.n === 1 && total > 1
      ? `The first of ${total} sessions on one piece for your album. Today: ${sessionTitle ? sessionTitle.toLowerCase() : "the first part"}. It saves as you go; the next session picks the ${work} up.`
      : "Today's work is a draft for your album. It saves as you go.";
  return {
    capstoneId: parsed.capstone,
    sessionId: parsed.session,
    index: parsed.n,
    total,
    title,
    sessionTitle,
    detail,
    lead,
    resume,
    draft,
    releases,
    // CF-T's place is drawn stage by stage (cft-day.ts): its section checks are not listed one by one.
    checksLine: transcribe && parsed.capstone !== "CF-T" ? checksLine(sessions, parsed.n) : null,
  };
}

/**
 * A capstone whose first session is done and whose last is not: the one a gym slot must never interrupt. CF-T is
 * never that capstone: it runs IN the transcription slots (contracts §2.5), so it is the slot, not a piece a slot
 * could interrupt, and it may stay under way for weeks beside C6 and C7.
 */
export function capstoneInProgress(
  course: Pick<CourseProgress, "capstones"> | null | undefined,
): { capstoneId: string; nextSession: string; sessionsDone: number; sessionsTotal: number } | null {
  for (const c of course?.capstones ?? []) {
    if (c.status === "released" || c.status === "locked" || c.capstoneId === "CF-T") continue;
    if (c.sessionsDone > 0 && c.sessionsDone < c.sessionsTotal)
      return {
        capstoneId: c.capstoneId,
        nextSession: `${c.capstoneId}.S${c.sessionsDone + 1}`,
        sessionsDone: c.sessionsDone,
        sessionsTotal: c.sessionsTotal,
      };
  }
  return null;
}

/**
 * Contracts §2.5: "a capstone already in progress is never interrupted (the slot waits until its last session)".
 * The planner applies it; should a plan still put a gym slot on a day a capstone session is open, Today runs the
 * capstone's next session and keeps the gym as another way today. Every other plan is returned as it is.
 */
export function keepCapstone(
  plan: SessionPlan,
  inProgress: ReturnType<typeof capstoneInProgress>,
  capstoneTitle: (id: string) => string,
): SessionPlan {
  if (plan.kind !== "gym" || inProgress === null || plan.mapItemId?.startsWith("CF-T.")) return plan;
  const gym = { kind: "gym" as const, mapItemId: plan.mapItemId, title: "Transcription Gym" };
  const alternatives = [
    gym,
    ...plan.alternatives.filter(
      (a) => !(a.kind === "gym") && !(a.kind === "capstone" && a.mapItemId === inProgress.nextSession),
    ),
  ];
  return {
    ...plan,
    kind: "capstone",
    mapItemId: inProgress.nextSession as SessionPlan["mapItemId"],
    title: capstoneTitle(inProgress.capstoneId),
    note: null,
    alternatives,
  };
}
