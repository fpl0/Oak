// The Transcription Gym slot rule (contracts §2.5), as data and a reference function. The session planner
// (server/src/services/session-plan.ts) runs the rule live for each learner; this is the rule stated once
// for content CI, which proves that the default order of §2.5 is exactly what the rule produces (every
// GYM.nn where the rule puts one, and nowhere else) and that each slot's ladder material is open there.
import type { LadderLevel, SessionId } from "@oak/content-kit";

export const GYM_SLOT_RULE = {
  /** The planner starts counting with this lesson (it counts as the first core session). */
  startsAt: "U07.L01" as SessionId,
  /** Completed core sessions since the last transcription session that make the next session a slot. */
  afterCoreSessions: 4,
} as const;

/** A session that is itself a transcription session: a gym session, an `X#.S#` or a `CF-T.S#`. */
export const isTranscriptionSession = (id: string): boolean =>
  id.startsWith("GYM.") || /^X\d+\.S\d+$/.test(id) || id.startsWith("CF-T.S");
/** A session of a multi-session compose capstone (`C3.S2`, `CF-A.S1`), which a slot never interrupts. */
const capstoneOf = (id: string): string | null => /^((?:C\d+|CF-A))\.S(\d+)$/.exec(id)?.[1] ?? null;

/**
 * Places the transcription slots of contracts §2.5 into an order of core sessions that has none: from
 * `startsAt`, every time 4 core sessions have been completed since the last transcription session, the next
 * session is a slot, unless a capstone is in progress (the slot waits until its last session) or the next
 * session is a transcription session anyway (an X or CF-T session takes the slot). A slot becomes the next
 * free `GYM.nn`.
 */
export function placeGymSlots(order: readonly SessionId[]): SessionId[] {
  const out: SessionId[] = [];
  let started = false;
  let count = 0;
  let gym = 0;
  for (const [i, s] of order.entries()) {
    if (s === GYM_SLOT_RULE.startsAt) started = true;
    if (started && count >= GYM_SLOT_RULE.afterCoreSessions && !isTranscriptionSession(s)) {
      const prev = order[i - 1] ?? "";
      const inCapstone = capstoneOf(prev) !== null && capstoneOf(prev) === capstoneOf(s);
      if (!inCapstone) {
        gym++;
        out.push(`GYM.${String(gym).padStart(2, "0")}` as SessionId);
        count = 0;
      }
    }
    out.push(s);
    if (isTranscriptionSession(s)) count = 0;
    else if (started) count++;
  }
  return out;
}

/** What a gym slot plays (contracts §2.5): odd slots a graded ladder session, even slots the learner's own audio. */
export const gymSlotKind = (id: string): "ladder" | "own-audio" =>
  Number(id.slice(4)) % 2 === 1 ? "ladder" : "own-audio";

/**
 * The ladder levels a graded gym session can serve, by the lesson that opens their material in every legal
 * order (contracts §2.9 "first available", and the skills each level's answers need): drums from U01.L09,
 * bass lines once degrees are written in code (U03.L02), four-chord loops bass first once the bass degree
 * is taught (U06.L05), short melodies with melodic dictation (U03.L10), PD folk at L5.
 */
export const LADDER_OPENS: Readonly<Record<LadderLevel, SessionId>> = {
  1: "U01.L09",
  2: "U03.L02",
  3: "U06.L05",
  4: "U03.L10",
  5: "U07.L01",
  6: "X2.S1",
  7: "U07.L01",
  8: "CF-T.S1",
};
