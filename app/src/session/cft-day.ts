// CF-T on Today (contracts §2.4, §2.5; wave6.md §5.2; content/specs/CF.md): once U15.L01 is completed, the
// transcription slot is no longer a gym session but the next session of the learner's standard, until that standard
// is released. Today says so in plain words, shows where the learner is in it (form map, bass, changes, melody,
// arrangement) and, when a compose capstone is under way, says that it waits where it was left: CF-T's sessions ARE
// the slot, the only thing that may fall between two sessions of another capstone. Pure: Today, the session host
// and the Coda read it.
import type { CapstoneSessions, GymPlan, SessionPlan } from "@oak/api";
import { parseCapstoneSessionId } from "@oak/api";

export const CF_T = "CF-T";

export type CftStage = "form" | "bass" | "changes" | "melody" | "arrange";

/** The five things a standard asks for, the session each belongs to and its pass mark in words (contracts §6.6). */
export const CFT_STAGES: readonly { stage: CftStage; label: string; session: number; mark: string }[] = [
  { stage: "form", label: "Form map", session: 1, mark: "exact" },
  { stage: "bass", label: "Bass", session: 1, mark: "90%" },
  { stage: "changes", label: "Changes", session: 2, mark: "85% of the bars" },
  { stage: "melody", label: "Melody", session: 3, mark: "90%" },
  { stage: "arrange", label: "Arrange & release", session: 4, mark: "your own" },
];

export interface CftStep {
  stage: CftStage;
  label: string;
  state: "done" | "today" | "ahead";
  /** "passed at 92%", "revealed", or null. */
  note: string | null;
}

export interface CftDay {
  /** `CF-T.S2` */
  sessionId: string;
  /** 1-based. */
  index: number;
  total: number;
  /** "Five Foot Two, Eyes of Blue", once the learner has chosen. */
  songTitle: string | null;
  /** This session is the every-fifth transcription slot (`plan.slot.fills === "cf-t"`); false when taken ahead of it. */
  fillsSlot: boolean;
  steps: CftStep[];
  /** "The form map and the bass are down. Today: the changes." */
  where: string;
  /** The lead under Today's heading. */
  lead: string;
  /** The plain explanation under the setlist. */
  explain: string[];
}

export const isCftSession = (id: string | null | undefined): boolean => !!id && id.startsWith(`${CF_T}.S`);

type Check = CapstoneSessions["sessions"][number]["checks"][number];

const layerOf = (c: Check): CftStage | null =>
  c.layer === "form" ? "form" : c.layer === "bass" ? "bass" : c.layer === "chords" ? "changes" : "melody";

/** What the checks of a stage say: all passed (the lowest score), all done with something revealed, or not yet. */
function stageResult(checks: readonly Check[]): { done: boolean; note: string | null } {
  if (checks.length === 0) return { done: false, note: null };
  const done = checks.every((c) => c.passed || c.revealed);
  if (!done) {
    const n = checks.filter((c) => c.passed || c.revealed).length;
    return { done: false, note: n > 0 ? `${n} of ${checks.length} sections` : null };
  }
  if (checks.some((c) => c.revealed && !c.passed)) return { done: true, note: "revealed" };
  const scores = checks.map((c) => c.score).filter((s): s is number => s !== null);
  if (scores.length === 0) return { done: true, note: "passed" };
  return { done: true, note: `passed at ${Math.round(Math.min(...scores) * 100)}%` };
}

const TODAY_WORK: Record<number, string> = {
  1: "choose the song, map its form, then write its bass",
  2: "the changes, one bar at a time",
  3: "the melody",
  4: "make it your own arrangement, then release it",
};

const lower = (s: string) => `${s[0]?.toLowerCase() ?? ""}${s.slice(1)}`;

/** "the form map", "the form map and the bass", "the form map, the bass and the changes". */
function listOf(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/**
 * The CF-T day of a plan, or null when the plan's New block is not a CF-T session. `sessions` (`GET
 * /capstones/CF-T/sessions`) and `gym` (`GET /gym`) may be null while they load or on a server that has not built
 * them: the session number alone then says what is behind the learner.
 */
export function cftDay(
  plan: Pick<SessionPlan, "kind" | "mapItemId" | "slot">,
  sessions: CapstoneSessions | null,
  gym: Pick<GymPlan, "cfT"> | null,
  songTitle: string | null = null,
): CftDay | null {
  if (plan.kind !== "capstone" || !isCftSession(plan.mapItemId)) return null;
  const parsed = parseCapstoneSessionId(plan.mapItemId as string);
  if (!parsed) return null;
  const total = Math.max(4, sessions?.sessions.length ?? 0);
  const all = (sessions?.sessions ?? []).flatMap((s) => s.checks);
  const steps: CftStep[] = CFT_STAGES.map((s) => {
    const checks = all.filter((c) => layerOf(c) === s.stage);
    const r = stageResult(checks);
    // Without the server's checks the session number decides: everything of an earlier session is behind.
    const done = s.stage === "arrange" ? false : checks.length > 0 ? r.done : s.session < parsed.n;
    return {
      stage: s.stage,
      label: s.label,
      // A stage of this session, or one an earlier session left unfinished, is today's work.
      state: done ? "done" : s.session <= parsed.n ? "today" : "ahead",
      note: r.note,
    };
  });
  const done = steps.filter((s) => s.state === "done").map((s) => `the ${lower(s.label)}`);
  const todays = steps.filter((s) => s.state === "today").map((s) => `the ${lower(s.label)}`);
  const todayText =
    parsed.n === 4 ? "your own arrangement of it, and the release" : listOf(todays) || TODAY_WORK[parsed.n];
  const where =
    done.length === 0
      ? `Today: ${TODAY_WORK[parsed.n] ?? todayText}.`
      : `${listOf(done)[0]?.toUpperCase()}${listOf(done).slice(1)} ${done.length === 1 ? "is" : "are"} down. Today: ${todayText}.`;
  const fillsSlot = plan.slot?.fills === "cf-t" || (plan.slot == null && gym?.cfT?.takesSlot === true);
  const song = songTitle ? ` on ${songTitle}` : "";
  const resumes = parsed.n > 1 || done.length > 0;
  const play = resumes ? " Your transcription plays from the top first, so you hear where you are." : "";
  let lead: string;
  if (parsed.n === 1 && done.length === 0)
    lead = fillsSlot
      ? "Your transcription slot is now a standard from the 1920s, taken down by ear over four sessions: form and bass, changes, melody, then your own arrangement. Today you choose the song and start. Your lessons carry on in between."
      : "A standard from the 1920s, taken down by ear over four sessions: form and bass, changes, melody, then your own arrangement. You are taking the first one ahead of its slot; it counts as this round's transcription session.";
  else
    lead = fillsSlot
      ? `The transcription slot: session ${parsed.n} of ${total}${song}. ${where}${play}`
      : `Session ${parsed.n} of ${total}${song}, taken ahead of its slot; it counts as this round's transcription session. ${where}${play}`;
  const explain = [
    "Every fifth session is a transcription slot. Until your standard is released the slot is its next session; the gym returns after that.",
    "The stages pass in order: the form map exact, the bass at 90%, the changes at 85% of the bars, the melody at 90%. Nothing is given but the tempo, the meter and the key.",
  ];
  return {
    sessionId: parsed.session,
    index: parsed.n,
    total,
    songTitle,
    fillsSlot,
    steps,
    where,
    lead,
    explain,
  };
}

/**
 * The compose capstone that waits behind today's CF-T session, in one line ("C6 Modal Vamp waits where you left it:
 * session 2 of 2 is next."), or null when none is under way. CF-T never loses the learner's place in another piece.
 */
export function waitingLine(
  inProgress: { capstoneId: string; sessionsDone: number; sessionsTotal: number } | null,
  titleOf: (id: string) => string,
): string | null {
  if (!inProgress || inProgress.capstoneId === CF_T) return null;
  const n = inProgress.sessionsDone + 1;
  return `${titleOf(inProgress.capstoneId)} waits where you left it: session ${n} of ${inProgress.sessionsTotal} is next.`;
}

/**
 * The Coda's "Next time" when the next transcription slot is CF-T's (`gym.cfT.takesSlot` with the slot due):
 * "Standard Transcription, session 2 of 4: the changes". Null when no slot is due or the gym holds it.
 */
export function cftNextLabel(
  gym: Pick<GymPlan, "active" | "slotDue" | "cfT"> | null | undefined,
  sessionTitle: (sessionId: string) => string | null,
): string | null {
  const c = gym?.cfT;
  if (!gym?.active || !gym.slotDue || !c?.takesSlot || !c.nextSessionId) return null;
  const parsed = parseCapstoneSessionId(c.nextSessionId);
  if (!parsed) return null;
  const t = sessionTitle(c.nextSessionId);
  return `your standard, session ${parsed.n} of 4${t ? `: ${lower(t)}` : ""}`;
}

/**
 * The Coda after one of CF-T's first three sessions (RETURN: the learner leaves knowing when the standard comes back
 * and what it asks next): "Your standard goes on in your next transcription slot, about five sessions from now, or
 * any day from Today: session 2 of 4, the changes." Null for any other session, for the last one and once released.
 */
export function cftAfterLine(sessionId: string | null | undefined, released: boolean): string | null {
  if (released || !sessionId || !isCftSession(sessionId)) return null;
  const parsed = parseCapstoneSessionId(sessionId);
  if (!parsed || parsed.n >= 4) return null;
  const next = parsed.n + 1;
  const what = CFT_STAGES.filter((s) => s.session === next).map((s) =>
    s.stage === "arrange" ? "arrangement and the release" : lower(s.label),
  );
  return `Your standard goes on in your next transcription slot, about five sessions from now, or any day from Today: session ${next} of 4, the ${what.join(" and the ")}.`;
}

/** The card the Coda of U15.L01's session shows once (content/specs/U15.md, word for word). */
export const CFT_OPENED = {
  title: "The core finale has opened: part one",
  body: "Standard Transcription. You will take down a whole song from the 1920s by ear: its form, its bass, its chords and its melody, then arrange and release it. Four sessions. They arrive in your transcription slots, about every fifth session, where the gym has been; the gym returns when the song is released. You choose the song when the first session starts: Five Foot Two, Ain't She Sweet or Bye Bye Blackbird. Nothing waits for it: your lessons carry on in between.",
} as const;

/**
 * Whether a session's summary is the one that opened CF-T: the session completed U15.L01 (`CF_T_GATE`) and CF-T has
 * not been started. Shown after the recap and the unlocks, once.
 */
export function cftOpenedBy(
  session: { kind: string; mapItemId: string | null },
  lessonCompleted: boolean,
  cft: { status: string; sessionsDone: number } | null | undefined,
  gate: string,
): boolean {
  if (session.kind !== "lesson" || session.mapItemId !== gate || !lessonCompleted) return false;
  if (!cft) return false;
  return (cft.status === "open" || cft.status === "in_progress") && cft.sessionsDone === 0;
}
