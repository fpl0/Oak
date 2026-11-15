// Wave 7 (R1.L03, RC1, R.CP): ghost notes on the percussion and rhythm staves. Drummers write a ghost note as a
// notehead in parentheses; abcjs has no such head and cannot style one member of a chord (`ABCJS_LIMITS`
// "ghost-notes", "notehead-classes"), so the Score lists the ghost heads (`NoteItem.ghosts`, from
// `NotationInput.ghosts`) and `markGhostNotes` (render.dom.ts) draws the parentheses around them after abcjs has
// drawn the staff. Pure.
import type { Rat } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import type { Score } from "./types.ts";

/**
 * The loudest a ghost note may be (effective gain: gain × velocity × postgain), the grader's `velocity-ghosts`
 * default `maxGain`. A stroke is a ghost when it is at most this loud and its track's loudest stroke in the
 * engraved bars is at least twice as loud (a line quiet throughout has no ghost notes). A silent stroke is none.
 */
export const GHOST_MAX_GAIN = 0.4;

/** Stable classes `markGhostNotes` puts on a ghost head and on the parentheses it draws. */
export const GHOST_CLASSES = { head: "oak-ghost", paren: "oak-ghost-paren" } as const;

export interface GhostMark {
  /** The engraved element (`oak-e{n}`) and the head inside it, low to high on the staff (`NoteItem.pitches`). */
  n: number;
  member: number;
  /** The event that head engraves. */
  eventId: string;
  /** The drum ("sd") the head stands for, or the staff position on a rhythm staff. */
  drum: string;
  onset: Rat;
}

/** The ghost heads of a Score (built with `NotationInput.ghosts`), in time order; tie continuations not again. */
export function ghostMarks(score: Score): GhostMark[] {
  const out: GhostMark[] = [];
  for (const staff of score.staves)
    for (const v of staff.voices)
      for (const b of v.bars)
        for (const it of b.items) {
          if (it.n === null || it.tieFromPrev || !it.ghosts) continue;
          for (const member of it.ghosts)
            out.push({
              n: it.n,
              member,
              eventId: it.eventIds[member] ?? "",
              drum: (it.drums?.[member] ?? it.drum)?.s ?? it.pitches[member]?.name ?? "",
              onset: it.onset,
            });
        }
  return out.sort((a, b) => R.cmp(a.onset, b.onset) || a.n - b.n || a.member - b.member);
}
