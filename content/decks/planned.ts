// Wave 7 Foundation: the fact decks of the advanced tracks, as contracts 1.8 §7.3 lists them, before the drills
// engine wrote their cards: the work order (id, first lesson, later gates, nodes, what a card asks). Wave 7 Build
// wrote all ten into content/decks/wave7.ts (`WAVE7_DECKS`, in content/families.ts `decks`), so the list is empty;
// content/validate/contracts-sync.test.ts accepts a §7.3 row that is either written or listed here, never both.
import type { LessonId, SkillId } from "@oak/content-kit";

export interface PlannedDeck {
  id: string;
  title: string;
  /** The lesson that deals the deck's first cards (the §7.3 "Unlocks at" lesson). */
  lesson: LessonId;
  /** Later card groups and the lesson that opens each. */
  gates: Partial<Record<LessonId, string>>;
  nodes: SkillId[];
  /** What a card asks, with one example front and back. */
  cards: string;
}

/**
 * Empty: the drills engine wrote all ten in Wave 7 Build (content/decks/wave7.ts, `WAVE7_DECKS`, in content/
 * families.ts `decks`), with the gates the §7.3 rows name and the ♯9 and alt symbols at J2.L03 as content/specs/J2.md
 * asks. The shape stays for a deck a later contracts change plans.
 */
export const PLANNED_DECKS: readonly PlannedDeck[] = [];
export const plannedDeckById: ReadonlyMap<string, PlannedDeck> = new Map(PLANNED_DECKS.map((d) => [d.id, d]));
