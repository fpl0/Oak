// From stored cards to the planner's `ReviewItem`s. Shared by server/services/srs.ts and the 300-day
// simulation so both feed the governor exactly the same numbers.
import type { FamilyDef, FamilyDomain, FamilyId, SkillId } from "@oak/content-kit";
import { GOVERNOR } from "./constants.ts";
import type { Card, ItemClass, ReviewItem, Srs } from "./types.ts";

/** What the planner needs to know about a card besides its FSRS state. */
export interface ItemMeta {
  cls: ItemClass;
  family: FamilyId | null;
  domain: string;
  /** Estimated seconds for one review: a whole set, or one fact card. */
  sec: number;
  mic: boolean;
  perceptual: boolean;
  skills: SkillId[];
  blockedIntroPending?: boolean;
  linkedToNextLesson?: boolean;
  debt?: boolean;
  repair?: boolean;
  deferUntilDay?: number;
  /** `intervalCap` of the card, when one binds it (see `ReviewItem.repeatDays`). */
  repeatDays?: number;
}

/** The learner day a card falls due on (a 5-minute learning step falls on today). */
export function dueDayOf(srs: Srs, card: Pick<Card, "dueAt">): number {
  return srs.dayOf(card.dueAt);
}
/** Due on `today`: its due day is today or earlier. Oak plans by day, never by the instant. */
export function isDueOn(srs: Srs, card: Pick<Card, "dueAt">, today: number): boolean {
  return dueDayOf(srs, card) <= today;
}

/** One `ReviewItem` for a card at `now`. A never-reviewed card is `fresh`: it fills only the room due items leave. */
export function reviewItem(srs: Srs, card: Card, meta: ItemMeta, now: Date): ReviewItem {
  const item: ReviewItem = {
    cardId: card.id,
    cls: meta.cls,
    family: meta.family,
    domain: meta.domain,
    sec: meta.sec,
    dueDay: dueDayOf(srs, card),
    recall: srs.retrievability(card, now),
    mic: meta.mic,
    perceptual: meta.perceptual,
    blockedIntroPending: meta.blockedIntroPending ?? false,
    linkedToNextLesson: meta.linkedToNextLesson ?? false,
    debt: meta.debt ?? false,
    repair: meta.repair ?? false,
    skills: [...meta.skills],
  };
  if (meta.deferUntilDay !== undefined) item.deferUntilDay = meta.deferUntilDay;
  // How soon the card comes back after its next review: the interval a Good rating would give it today,
  // or its cap (`meta.repeatDays`) when that is shorter. A card that keeps lapsing returns every day or
  // two, and the intake forecast must count each return inside its window, not just the next one. (A Good
  // review only lengthens the interval, so a card already spaced past the window needs no preview.)
  const spaced =
    card.reps === 0 || srs.intervalAt(card, srs.desiredRetention(card.kind)) >= GOVERNOR.forecastDays;
  const good = spaced ? undefined : Math.max(1, srs.preview(card, now)[3].scheduledDays);
  const repeat = good === undefined ? meta.repeatDays : Math.min(meta.repeatDays ?? good, good);
  if (repeat !== undefined) item.repeatDays = repeat;
  // A never-reviewed fact (a released deck card) is filler. A family's first set is a blocked-intro set,
  // planned like any due item; a lesson's seeding step has already rated its concept and term cards.
  if (card.reps === 0 && meta.cls === "fact") item.fresh = true;
  if (card.reps === 0 && meta.cls === "family" && meta.perceptual) item.firstSet = true;
  return item;
}

/** Whether a family's card is perceptual or production (it counts toward the active cap and can graduate). */
export function isPerceptualFamily(def: Pick<FamilyDef, "kind">): boolean {
  return def.kind === "perceptual" || def.kind === "production";
}

/** Planner metadata of a family card from its catalog entry. */
export function familyMeta(
  def: Pick<FamilyDef, "id" | "kind" | "domain" | "skills" | "trialsPerSet" | "estTrialSec" | "mic">,
  extra: Partial<
    Pick<
      ItemMeta,
      "blockedIntroPending" | "linkedToNextLesson" | "debt" | "repair" | "deferUntilDay" | "repeatDays"
    >
  > = {},
): ItemMeta {
  const perceptual = isPerceptualFamily(def);
  return {
    cls: perceptual ? "family" : "concept",
    family: def.id,
    domain: def.domain as FamilyDomain,
    sec: def.trialsPerSet * def.estTrialSec,
    mic: def.mic ?? false,
    perceptual,
    // A category reference rolls up to its node (contracts §7.5).
    skills: [...new Set(def.skills.map((s) => s.skill.split("/")[0] as SkillId))],
    ...extra,
  };
}
/** Planner metadata of a fact card. */
export function factMeta(skills: readonly SkillId[], sec: number = GOVERNOR.factCardSec): ItemMeta {
  return {
    cls: "fact",
    family: null,
    domain: "fact",
    sec,
    mic: false,
    perceptual: false,
    skills: [...skills],
  };
}
