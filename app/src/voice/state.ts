// The learner's voice state as every surface should read it (contracts §8.2, §8.5; docs/design/wave3.md §5.3):
// Quiet mode with its reason, and the tolerance ladder with what moves it. The server is the source of truth
// (`GET /voice`); until it answers (a typed 501 before the server engineer lands it, or an older server) the
// view falls back to the profile, which has always held `quiet`, `singToleranceCents` and `singTolMode`. Pure
// view functions here; the hooks are in `use-voice.ts`.
import type { Profile, VoiceLadder, VoiceState } from "@oak/api";
import { OakApiError } from "@oak/api";
import type { SingTolCents } from "@oak/content-kit";
import { LADDER_DAYS_NEEDED, LADDER_MIN_NOTES, LADDER_THRESHOLDS, LADDER_WINDOW_DAYS } from "@oak/pitch";

/** The endpoint exists in the contract but this server has not built it yet. */
export function isNotBuilt(error: unknown): boolean {
  return error instanceof OakApiError && error.code === "not_implemented";
}

export type QuietReason = "today" | "always" | "no-mic";

export interface QuietView {
  quiet: boolean;
  reason: QuietReason | null;
  /** One calm line for the switch's help text. */
  line: string;
  /** The learner can switch the mic back on here (false when there is no mic to switch to). */
  canSwitchOff: boolean;
}

export function quietViewOf(
  voice: Pick<VoiceState, "quiet" | "quietReason"> | null,
  profile: Pick<Profile, "quiet" | "inputKind">,
): QuietView {
  const noMic = profile.inputKind === "none";
  const quiet = voice ? voice.quiet : profile.quiet || noMic;
  // Without a mic there is nothing to switch back to, whatever else is set: the way out is setting one up.
  const reason: QuietReason | null = !quiet ? null : noMic ? "no-mic" : voice ? voice.quietReason : "always";
  const line = !quiet
    ? "Singing steps listen through the mic. Switch on Quiet mode on any day you can't sing."
    : reason === "today"
      ? "Quiet for today: singing steps become listening steps. Tomorrow the mic is back."
      : reason === "no-mic"
        ? "No microphone is set up, so singing steps are listening steps. Nothing is locked or lost."
        : "Quiet until you switch it off: singing steps become listening steps. Nothing is locked or lost.";
  return { quiet, reason, line, canSwitchOff: reason !== "no-mic" };
}

export interface LadderView {
  cents: SingTolCents;
  mode: "auto" | "fixed";
  /** "±50¢". */
  now: string;
  /** Why it is where it is, in one sentence. */
  why: string;
  /** How it moves, as short sentences (always the same rules: the learner can trust them). */
  how: string[];
  /**
   * Progress toward the next step: days that counted out of those needed. `null` when there is no next step
   * (fixed, the finest) or the server has not reported the days.
   */
  progress: { have: number; need: number; next: SingTolCents } | null;
  /** The days inside the window with any sung notes: a dot each, filled when the day counted. */
  days: { day: string; counted: boolean; notes: number }[];
  held: string | null;
  offerLoosen: boolean;
  /** The last change, said once: "Your ear-to-voice aim got finer: ±35¢ now." */
  lastChange: string | null;
}

const RUNG_ORDER: readonly SingTolCents[] = [70, 50, 35, 25];
const finer = (c: SingTolCents): SingTolCents | null => RUNG_ORDER[RUNG_ORDER.indexOf(c) + 1] ?? null;

function howItMoves(): string[] {
  return [
    `Every learner starts at ±70¢. Auto tightens one step (±50, ±35, ±25) after ${LADDER_DAYS_NEEDED} days within ${LADDER_WINDOW_DAYS} on which you sang at least ${LADDER_MIN_NOTES} checked notes and at least half of them landed close: within ${LADDER_THRESHOLDS[70]}¢, then ${LADDER_THRESHOLDS[50]}¢, then ${LADDER_THRESHOLDS[35]}¢.`,
    "A hard day simply doesn't count. It never undoes the days that did, and the tolerance never steps back by itself.",
    "It holds still while a checkpoint is coming up, and it never changes in the middle of a session: a change is announced once, at the end of one.",
  ];
}

export function ladderViewOf(
  ladder: VoiceLadder | null,
  profile: Pick<Profile, "singToleranceCents" | "singTolMode">,
): LadderView {
  const cents = ladder ? ladder.cents : profile.singToleranceCents;
  const mode = ladder ? ladder.mode : profile.singTolMode;
  const next = finer(cents);
  const why =
    mode === "fixed"
      ? `You chose ±${cents}¢. It stays there until you choose Auto.`
      : next === null
        ? "The finest step: sung notes count within a quarter of a semitone."
        : cents === 70
          ? "Where everyone starts: a sung note counts within ±70¢, a little more than half a semitone either way."
          : `Your singing earned this step. A sung note counts within ±${cents}¢.`;
  const progress =
    ladder && mode === "auto" && ladder.next
      ? {
          have: Math.min(ladder.qualifyingDays, ladder.daysNeeded),
          need: ladder.daysNeeded,
          next: ladder.next.cents,
        }
      : null;
  const held = ladder?.held
    ? `Holding still until ${ladder.held.checkpointId} is done: a checkpoint week is no time for a stricter ear.`
    : null;
  const lastChange =
    ladder?.lastChange && ladder.lastChange.to !== ladder.lastChange.from
      ? ladder.lastChange.reason === "evidence"
        ? `Your ear-to-voice aim got finer: ±${ladder.lastChange.to}¢ now.`
        : ladder.lastChange.reason === "loosen"
          ? `Loosened to ±${ladder.lastChange.to}¢ after a break. Auto tightens again as before.`
          : `You set it to ±${ladder.lastChange.to}¢.`
      : null;
  return {
    cents,
    mode,
    now: `±${cents}¢`,
    why,
    how: howItMoves(),
    progress,
    days: (ladder?.days ?? []).map((d) => ({ day: d.day, counted: d.qualifies, notes: d.notes })),
    held,
    offerLoosen: ladder?.offerLoosen ?? false,
    lastChange,
  };
}

/** The tolerance select's value. */
export type TolChoice = "auto" | SingTolCents;
export function tolChoiceOf(view: Pick<LadderView, "mode" | "cents">): TolChoice {
  return view.mode === "auto" ? "auto" : view.cents;
}
