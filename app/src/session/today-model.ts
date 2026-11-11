// What Today shows (ux §1.4): one decision — start the session — and the state around it. Pure, so every plan
// and return state is unit-tested from fixture plans (today-model.test.ts). The page (TodayPage.tsx) renders it.
import type { Bootstrap, SessionPlan, WarmupItem } from "@oak/api";
import { learnerDay } from "@oak/srs";
import { blockBudget } from "./store.ts";
import { isRestDay } from "./streak-model.ts";

export type TodayState =
  /** Before onboarding: the only action is to begin it. */
  | "first-run"
  /** A session was started today and not ended: resume it. */
  | "in-session"
  /** Today's session is over: "Session complete. See you tomorrow." */
  | "done"
  /** This week is paused (Settings → Learning → Pause Oak). */
  | "paused-week"
  | "welcome-back"
  | "light"
  | "resume"
  | "split-a"
  | "split-b"
  | "checkpoint"
  | "capstone"
  | "gym"
  | "review"
  | "normal";

export type RowKey = "warmup" | "recap" | "new" | "make" | "coda";
export interface SetlistRow {
  key: RowKey;
  label: string;
  /** Minutes, or seconds for the recap (`unit`). */
  amount: number;
  unit: "min" | "s";
  detail: string;
}

export interface TodayView {
  state: TodayState;
  heading: string;
  lead: string | null;
  rows: SetlistRow[];
  /** "20 min", "about 20 min" (checkpoint day at 15). */
  length: string;
  primary: { action: "start" | "resume" | "onboarding"; label: string } | null;
  /** This week's goal is met and today is free: the copy says so, Start stays. */
  restDay: boolean;
  /** ≥ 21 days away: one tap to loosen the sing tolerance one step (contracts §7.9). */
  offerLoosen: boolean;
  /** A Keep-alive (one easy set, ~2 min) is a real option today. */
  keepAlive: boolean;
}

export interface TodayInput {
  plan: SessionPlan;
  boot: Pick<Bootstrap, "profile" | "streak" | "day" | "openSession" | "settings">;
  /**
   * The session this browser ended last (persist.ts), to show "done". `endedAt` (the server's end instant, from
   * the summary) also counts: a session begun before the 04:00 rollover and finished after it belongs to the
   * previous day, yet the learner has just finished for today.
   */
  lastEnded: { sessionId: string; day: string; endedAt?: string | null } | null;
  /** Map item titles (lessons, checkpoints, capstones). */
  titleOf: (id: string) => string;
  /** Step count of a lesson, for "from step 4 of 8". */
  stepsOf?: (lessonId: string) => number | null;
}

const WARMUP_LABEL: Record<WarmupItem["kind"], [string, string]> = {
  anchor: ["sure-footed set", "sure-footed sets"],
  repair: ["repair set", "repair sets"],
  "family-set": ["ear set", "ear sets"],
  "composite-set": ["mixed set", "mixed sets"],
  "concept-set": ["concept set", "concept sets"],
  "fact-set": ["fact set", "fact sets"],
  "blocked-intro": ["new family", "new families"],
  listen: ["listening", "listenings"],
};

/** "1 sure-footed set · 2 ear sets · 1 sing" (set counts, never raw due-card counts). */
export function warmupSummary(items: readonly WarmupItem[]): string {
  const counts = new Map<WarmupItem["kind"], number>();
  for (const i of items) counts.set(i.kind, (counts.get(i.kind) ?? 0) + 1);
  const parts = [...counts].map(([k, n]) => `${n} ${WARMUP_LABEL[k][n === 1 ? 0 : 1]}`);
  const sing = items.filter((i) => i.mic).length;
  if (sing > 0) parts.push(`${sing} with singing`);
  return parts.join(" · ");
}

const stepNo = (stepId: string) => stepId.replace(/^S/, "");
const round = (x: number) => Math.max(1, Math.round(x));

/** The rows of the setlist (contracts §9.1 budgets; capstone, gym and light days have no separate Make). */
export function setlistRows(plan: SessionPlan, titleOf: (id: string) => string): SetlistRow[] {
  const b = blockBudget(plan.kind, plan.targetMinutes);
  const rows: SetlistRow[] = [];
  if (plan.warmup.items.length > 0)
    rows.push({
      key: "warmup",
      label: "Warm-up",
      amount: Math.min(b.warmup, round(plan.warmup.plannedSec / 60)),
      unit: "min",
      detail: warmupSummary(plan.warmup.items),
    });
  if (plan.returning?.recap)
    rows.push({
      key: "recap",
      label: "Recap",
      amount: 30,
      unit: "s",
      detail: "Your last can-do and your last sketch, to pick up the thread",
    });
  const main = plan.main;
  const title = plan.mapItemId ? titleOf(plan.mapItemId) : plan.title;
  switch (plan.kind) {
    case "lesson": {
      if (!main) break;
      const split = main.splitPart;
      const quick = split === "A";
      const makeMin = quick ? 1.5 : b.make;
      const what =
        split === "A"
          ? `${title} · part 1 of 2`
          : split === "B"
            ? `${title} · part 2 of 2, from step ${stepNo(main.resumeStep ?? "S1")}`
            : main.resumeStep
              ? `${title} · from step ${stepNo(main.resumeStep)}`
              : title;
      rows.push({
        key: "new",
        label: "New",
        amount: round(main.estMinutes - makeMin),
        unit: "min",
        detail: what,
      });
      rows.push(
        quick
          ? {
              key: "make",
              label: "Quick sketch",
              amount: 1.5,
              unit: "min",
              detail: "Saves your loop at the lesson's midpoint",
            }
          : {
              key: "make",
              label: "Make",
              amount: makeMin,
              unit: "min",
              detail: "A short sketch with today's tools",
            },
      );
      break;
    }
    case "checkpoint":
      rows.push({
        key: "new",
        label: "Checkpoint",
        amount: b.new,
        unit: "min",
        detail: `${title} · no hints, no rush`,
      });
      rows.push({
        key: "make",
        label: "Make",
        amount: b.make,
        unit: "min",
        detail: "A groove or melody with this unit's tools",
      });
      break;
    case "capstone":
      rows.push({
        key: "new",
        label: "Capstone",
        amount: b.new,
        unit: "min",
        detail: `${title} · the draft is the Make`,
      });
      break;
    case "gym":
      rows.push({ key: "new", label: "Transcribe", amount: b.new, unit: "min", detail: plan.title });
      break;
    case "light":
      if (main?.light)
        rows.push({
          key: "new",
          label: "Light session",
          amount: round(main.estMinutes),
          unit: "min",
          detail: `Revisit the Make of ${titleOf(main.light.lessonId)}. New idea: ${main.light.constraint}`,
        });
      break;
    default:
      break;
  }
  rows.push({
    key: "coda",
    label: "Coda",
    amount: 1,
    unit: "min",
    detail: "What changed today, and what's next",
  });
  return rows;
}

function stateOfPlan(plan: SessionPlan): TodayState {
  if (plan.kind === "light") return "light";
  if (plan.returning) return "welcome-back";
  switch (plan.kind) {
    case "checkpoint":
      return "checkpoint";
    case "capstone":
      return "capstone";
    case "gym":
      return "gym";
    case "review":
      return "review";
    case "lesson":
      if (plan.main?.splitPart === "A") return "split-a";
      if (plan.main?.splitPart === "B") return "split-b";
      if (plan.main?.resumeStep) return "resume";
      return "normal";
    default:
      return "normal";
  }
}

const HEADING: Record<TodayState, string> = {
  "first-run": "Welcome to Oak",
  "in-session": "Your session is open",
  done: "Session complete. See you tomorrow.",
  "paused-week": "Oak is paused this week",
  "welcome-back": "Welcome back. We'll ease in.",
  light: "Welcome back. We'll ease in.",
  resume: "Pick up where you left off",
  "split-a": "Your setlist for today",
  "split-b": "Pick up where you left off",
  checkpoint: "Checkpoint day",
  capstone: "Capstone day",
  gym: "Transcription Gym",
  review: "Review day",
  normal: "Your setlist for today",
};

function leadOf(state: TodayState, input: TodayInput): string | null {
  const { plan } = input;
  const title = plan.mapItemId ? input.titleOf(plan.mapItemId) : plan.title;
  switch (state) {
    case "first-run":
      return "About ten minutes to set up sound and your voice, then your first loop.";
    case "in-session":
      return "Everything you did is saved. Carry on from the block you were in.";
    case "done":
      return "Stopping here is good practice: spacing beats cramming.";
    case "paused-week":
      return "Nothing is expected this week. If you feel like playing, the session is here.";
    case "welcome-back":
      return `A warm-up of things you know, a short recap, then straight on with ${title}.`;
    case "light":
      return "A warm-up of things you know, a short recap, then a light session: a Make you have done before, with one new idea. The course carries on next time.";
    case "resume": {
      const step = plan.main?.resumeStep;
      const total = input.stepsOf?.(plan.mapItemId ?? "") ?? null;
      return step
        ? `${title}, from step ${stepNo(step)}${total ? ` of ${total}` : ""}. Everything before it is saved.`
        : null;
    }
    case "split-a":
      return `At 15 minutes, ${title} comes in two parts. Today ends at its midpoint with a quick sketch; part 2 is next time.`;
    case "split-b":
      return `Part 2 of ${title}: a 20-second recap, then the rest of the lesson and its Make.`;
    case "checkpoint":
      return plan.note ? `No hints, no rush. ${plan.note}.` : "No hints, no rush.";
    case "capstone":
      return plan.note ?? "Today's work is a draft for your album. It saves as you go.";
    case "gym":
      return plan.note ?? "Listen, then write down what you hear.";
    case "review":
      return "Nothing new is open right now. Today keeps what you know fresh.";
    default:
      return plan.note;
  }
}

/** The ISO week start (Monday) of a day, for the paused-week check. */
function weekStartOf(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/** The learner day a session ended on: its end instant through the rollover, else the session's own day. */
function endedOn(
  e: NonNullable<TodayInput["lastEnded"]>,
  p: Pick<Bootstrap["profile"], "timezone" | "rolloverHour">,
): string {
  if (!e.endedAt) return e.day;
  const at = new Date(e.endedAt);
  if (Number.isNaN(at.getTime())) return e.day;
  try {
    const ended = learnerDay(at, p.timezone, p.rolloverHour);
    return ended.localeCompare(e.day) > 0 ? ended : e.day;
  } catch {
    return e.day;
  }
}

export function todayView(input: TodayInput): TodayView {
  const { plan, boot } = input;
  const rows = setlistRows(plan, input.titleOf);
  const length =
    plan.kind === "checkpoint" && plan.targetMinutes === 15 ? "about 20 min" : `${plan.targetMinutes} min`;
  let state: TodayState;
  if (!boot.profile.onboardedAt) state = "first-run";
  else if (
    boot.openSession &&
    boot.openSession.day === boot.day &&
    boot.openSession.id !== input.lastEnded?.sessionId
  )
    state = "in-session";
  else if (input.lastEnded && endedOn(input.lastEnded, boot.profile) === boot.day) state = "done";
  else if (boot.settings.pausedWeeks.includes(weekStartOf(boot.day))) state = "paused-week";
  else state = stateOfPlan(plan);

  const primary: TodayView["primary"] =
    state === "first-run"
      ? { action: "onboarding", label: "Begin" }
      : state === "in-session"
        ? { action: "resume", label: "Resume session" }
        : state === "done"
          ? null
          : { action: "start", label: "Start session" };
  const active = state !== "first-run" && state !== "done" && state !== "in-session";
  return {
    state,
    heading: HEADING[state],
    lead: leadOf(state, input),
    rows,
    length,
    primary,
    restDay: active && state !== "paused-week" && isRestDay(boot.streak),
    offerLoosen: active && plan.returning?.offerLoosen === true && boot.profile.singToleranceCents < 70,
    keepAlive: active && plan.kind !== "review" && plan.warmup.items.length > 0,
  };
}

/** The one step looser on the sing-tolerance ladder (contracts §8.2): 25 → 35 → 50 → 70. */
export function looserTolerance(cents: 25 | 35 | 50 | 70): 35 | 50 | 70 {
  return cents === 25 ? 35 : cents === 35 ? 50 : 70;
}

/** A Keep-alive plan from today's plan: its first warm-up set (the sure win) and the optional riff. */
export function keepAlivePlan(plan: SessionPlan): SessionPlan {
  const first = plan.warmup.items[0];
  return {
    ...plan,
    kind: "keepalive",
    mapItemId: null,
    title: "Keep-alive",
    note: null,
    main: null,
    returning: null,
    warmup: {
      ...plan.warmup,
      items: first ? [first] : [],
      plannedSec: first?.estSec ?? 0,
      moreAvailable: false,
    },
  };
}
