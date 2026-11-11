// The review-load governor of contracts §7.4 and §7.9. Pure policy: no ts-fsrs, no clock, no RNG. The
// caller (server/services/srs, or the simulation) owns the cards and feeds plain numbers in.
// Promoted from spikes/s7-srs/governor.ts and re-cut to the contract's rules.
//
// Levers, in the order they act on a day:
//   1. smoothBacklog   after a gap of 3 days or more, overdue items are dealt out over 5 to 7 days
//   2. pickReleases    deferred cards are released, oldest first, while the 7-day forecast is below
//                      0.70 × budget (`admitNew` gives the counts only, and lets the oldest block the rest)
//   3. planWarmup      (planner.ts) a strict budget; leftovers stay due and are never shown as a count
//   4. capRelearning   after a gap, at most 3 cards a day enter relearning
//   5. shouldGraduate  a family at its mastery level with a 21-day stability joins a composite card
//   6. admitCreated    cards a lesson seeds are created `deferred` while the forecast is over 0.85 × budget;
//                      before that, `earlyGraduate(…, "time")` may graduate a family already at its mastery level
//
// The forecast (Wave 2): the window is today and the next 6 days; every return of a card inside it counts
// (a card returns after the interval a Good rating would give it today, or its cap); sets are measured
// against the budget less what the fact cards need (`classBudget`); and the caller passes as `budgetSec`
// the mean warm-up budget of the sessions the window will hold (checkpoint and capstone days are shorter).
//   7. makeDayPicker   a rescheduled card takes the least-loaded day inside its fuzz window
import { DECISION_2, GOVERNOR, RETURN, WARMUP_BUDGET_SEC } from "./constants.ts";
import type {
  Card,
  GovernorConfig,
  GraduationInput,
  IntakeForecast,
  OtherWorkSource,
  ReturnMode,
  ReviewItem,
} from "./types.ts";

/** The governor configuration for a session target, from the constants (the contract's numbers). */
export function governorFor(targetMinutes: 15 | 20 | 25, opts?: Partial<GovernorConfig>): GovernorConfig {
  return {
    budgetSec: WARMUP_BUDGET_SEC[targetMinutes],
    maxActivePerceptual: GOVERNOR.maxActivePerceptual,
    graduateDays: GOVERNOR.graduateDays,
    activeMaxIntervalDays: GOVERNOR.activeMaxIntervalDays,
    forecastDays: GOVERNOR.forecastDays,
    intakeMeanHigh: GOVERNOR.intakeMeanHigh,
    intakeDayHigh: GOVERNOR.intakeDayHigh,
    intakeMeanLow: GOVERNOR.intakeMeanLow,
    releasePerDay: { ...GOVERNOR.releasePerDay },
    newPerDay: { ...GOVERNOR.newPerDay },
    maxFactCardsPerLesson: GOVERNOR.maxFactCardsPerLesson,
    planFraction: GOVERNOR.planFraction,
    maxMicSets: GOVERNOR.maxMicSets,
    quiet: false,
    factShare: GOVERNOR.factShare,
    agingPerDay: GOVERNOR.agingPerDay,
    sessionsPerWeek: GOVERNOR.sessionsPerWeek,
    ...opts,
  };
}
/**
 * Decision 2 of docs/decisions.md applied: the configuration the 300-day simulation passes with. This is
 * the LIVE configuration: with the contract's bare numbers the gate of contracts §7.4 cannot hold (the
 * deferred queue grows without bound, see simulation.test.ts). Fact cards also need
 * `createSrs({ factRetention: DECISION_2.factRetention })`.
 */
export function recommendedGovernor(
  targetMinutes: 15 | 20 | 25,
  opts?: Partial<GovernorConfig>,
): GovernorConfig {
  return governorFor(targetMinutes, {
    activeMaxIntervalDays: DECISION_2.activeMaxIntervalDays,
    maxFactCardsPerLesson: DECISION_2.maxFactCardsPerLesson,
    ...opts,
  });
}
/** The live governor at the default 20-minute target. */
export const RECOMMENDED_GOVERNOR: Readonly<GovernorConfig> = recommendedGovernor(20);

// --- forecast and intake ------------------------------------------------------------------------

/** Seconds of review falling due on each of the next `days` + 1 days; index 0 is today and includes everything overdue. */
export function forecastLoad(items: readonly ReviewItem[], today: number, days: number): number[] {
  const load = new Array<number>(days + 1).fill(0);
  for (const it of items) {
    const d = Math.max(it.dueDay, it.deferUntilDay ?? it.dueDay, today) - today;
    if (d <= days) load[d] = (load[d] ?? 0) + it.sec;
  }
  return load;
}

/** Which work a forecast measures: everything, the sets (family, concept, composite), or fact cards. */
export type IntakeClass = "all" | "sets" | "facts";
const inClass = (it: ReviewItem, cls: IntakeClass) =>
  cls === "all" || (cls === "facts" ? it.cls === "fact" : it.cls !== "fact");
/**
 * Planning cost of an item in the forecast: its own seconds plus its half of the listen-only block that
 * follows every second perceptual set, and the blocked-intro sets still to come for a new family.
 */
export function forecastCost(it: ReviewItem): number {
  if (it.cls === "fact" || !it.perceptual) return it.sec;
  const listen = (GOVERNOR.listenBlockSec[0] + GOVERNOR.listenBlockSec[1]) / 4;
  return (it.sec + listen) * (it.blockedIntroPending ? 2 : 1);
}

/**
 * The intake throttle on the 7-day forecast (contracts §7.4). "Mean" is seconds per expected session: the
 * window's total divided by the sessions it holds at the learner's weekly goal, so a day off does not look
 * like spare room. With `cls` "sets" or "facts" the forecast covers that class only and the thresholds
 * apply to its share of the budget, which is how spike S7 made the throttle bind before the warm-up
 * overflows (a total-only throttle lets one class fill the other's room). `extraSec` adds work that is
 * about to be created (to ask "would it still fit?").
 */
export function intakeForecast(
  items: readonly ReviewItem[],
  today: number,
  cfg: GovernorConfig,
  extraSec = 0,
  cls: IntakeClass = "all",
): IntakeForecast {
  const { meanSec, maxDaySec, load } = classLoad(items, today, cfg, cls, extraSec);
  const budget = classBudget(items, today, cfg, cls);
  const state =
    meanSec > cfg.intakeMeanHigh * budget || maxDaySec > cfg.intakeDayHigh * budget
      ? "closed"
      : meanSec < cfg.intakeMeanLow * budget
        ? "open"
        : "hold";
  return { state, meanSec, maxDaySec, load, budgetSec: budget };
}
/** The forecast of one class: seconds per expected session, the heaviest day, the per-day load. */
function classLoad(
  items: readonly ReviewItem[],
  today: number,
  cfg: GovernorConfig,
  cls: IntakeClass,
  extraSec = 0,
): { meanSec: number; maxDaySec: number; load: number[] } {
  const usable = items.filter((it) => inClass(it, cls) && !(cfg.quiet && it.mic));
  // The window is the next `forecastDays` days, today included: day 0 … forecastDays − 1. A card capped at
  // a 7-day cadence returns exactly once inside it.
  const load = new Array<number>(cfg.forecastDays).fill(0);
  for (const it of usable) {
    const step = it.repeatDays !== undefined && it.repeatDays >= 1 ? it.repeatDays : Number.POSITIVE_INFINITY;
    let first = true;
    for (
      let d = Math.max(it.dueDay, it.deferUntilDay ?? it.dueDay, today) - today;
      d < cfg.forecastDays;
      d += step
    ) {
      load[d] =
        (load[d] ?? 0) + (first ? forecastCost(it) : forecastCost({ ...it, blockedIntroPending: false }));
      first = false;
    }
  }
  const sessions = Math.max(1, (load.length * Math.min(7, Math.max(1, cfg.sessionsPerWeek))) / 7);
  return {
    meanSec: (load.reduce((a, b) => a + b, 0) + extraSec) / sessions,
    maxDaySec: Math.max(0, ...load),
    load,
  };
}
/**
 * The seconds of a session a class may plan for. Facts keep up to their share (`factShare`); sets may use
 * the whole budget less what the fact cards are forecast to need, so room the facts leave is not wasted
 * (the planner's second pass gives it to sets on the day as well).
 */
export function classBudget(
  items: readonly ReviewItem[],
  today: number,
  cfg: GovernorConfig,
  cls: IntakeClass,
): number {
  if (cls === "all") return cfg.budgetSec;
  const factRoom = cfg.factShare * cfg.budgetSec;
  if (cls === "facts") return factRoom;
  const facts = classLoad(items, today, cfg, "facts").meanSec;
  return cfg.budgetSec - Math.min(factRoom, facts);
}
/**
 * Mic sets a session can hold are capped at `maxMicSets` (0 in Quiet mode). A production family is admitted
 * only while the 7-day forecast of mic sets per session stays under that cap × `intakeMeanHigh`, or the
 * mic sets would overflow every day however much time is left.
 */
export function micRoom(items: readonly ReviewItem[], today: number, cfg: GovernorConfig): boolean {
  if (cfg.quiet || cfg.maxMicSets === 0) return false;
  let n = 0;
  for (const it of items) {
    if (!it.mic || it.cls === "fact") continue;
    const d = Math.max(it.dueDay, it.deferUntilDay ?? it.dueDay, today) - today;
    if (d <= cfg.forecastDays) n += it.blockedIntroPending ? 2 : 1;
  }
  const sessions = Math.max(1, ((cfg.forecastDays + 1) * Math.min(7, Math.max(1, cfg.sessionsPerWeek))) / 7);
  return n / sessions < cfg.maxMicSets * cfg.intakeMeanHigh;
}

/**
 * How many deferred cards may be released today, given the 7-day forecast: oldest first, at most 1 family
 * and 4 fact cards a day, only while the forecast mean is below 0.70 × budget, and never past the cap of
 * 12 active perceptual families. `waiting.families` counts the families that would take an active slot;
 * pass `activePerceptual: 0` for concept families, which the cap does not cover.
 */
export function admitNew(
  items: readonly ReviewItem[],
  waiting: {
    families: number;
    facts: number /** The oldest waiting family needs the microphone. */;
    nextFamilyMic?: boolean;
  },
  activePerceptual: number,
  today: number,
  cfg: GovernorConfig,
): { families: number; facts: number } {
  const setsOpen = intakeForecast(items, today, cfg, 0, "sets").state === "open";
  const factsOpen = intakeForecast(items, today, cfg, 0, "facts").state === "open";
  const slots = Math.max(0, cfg.maxActivePerceptual - activePerceptual);
  const micOk = !waiting.nextFamilyMic || micRoom(items, today, cfg);
  return {
    families:
      setsOpen && micOk ? Math.max(0, Math.min(waiting.families, cfg.releasePerDay.families, slots)) : 0,
    facts: factsOpen ? Math.max(0, Math.min(waiting.facts, cfg.releasePerDay.facts)) : 0,
  };
}

/** A card waiting in the deferred queue, as `pickReleases` sees it. */
export interface WaitingCard {
  cardId: string;
  /** `perceptual` and `production` families take an active slot; production ones also need mic room. */
  kind: "perceptual" | "production" | "concept" | "fact";
  /** Position in the queue: lower is older. */
  seq: number;
}
/**
 * The deferred cards to release today (contracts §7.4): oldest first, at most 1 family and 4 fact cards a
 * day, families while the set forecast is open and facts while the fact forecast is open. A family that
 * cannot start today (no active slot, or a production family with no mic room) is passed over rather than
 * holding up the families behind it: a waiting concept family needs no slot.
 */
export function pickReleases(
  items: readonly ReviewItem[],
  waiting: readonly WaitingCard[],
  activePerceptual: number,
  today: number,
  cfg: GovernorConfig,
): string[] {
  const out: string[] = [];
  const order = [...waiting].sort((a, b) => a.seq - b.seq || (a.cardId < b.cardId ? -1 : 1));
  if (intakeForecast(items, today, cfg, 0, "sets").state === "open") {
    let slots = Math.max(0, cfg.maxActivePerceptual - activePerceptual);
    let n = 0;
    for (const w of order) {
      if (n >= cfg.releasePerDay.families) break;
      if (w.kind === "fact") continue;
      if (w.kind !== "concept") {
        if (slots === 0) continue;
        if (w.kind === "production" && !micRoom(items, today, cfg)) continue;
        slots--;
      }
      out.push(w.cardId);
      n++;
    }
  }
  if (intakeForecast(items, today, cfg, 0, "facts").state === "open") {
    out.push(
      ...order
        .filter((w) => w.kind === "fact")
        .slice(0, cfg.releasePerDay.facts)
        .map((w) => w.cardId),
    );
  }
  return out;
}

/**
 * Cards a lesson is about to seed: how many start `active` and how many are created `deferred`. Families are
 * deferred while the set forecast is closed (mean over 0.85 × the set share of the budget, or one day over
 * 1.25 × it), fact cards while the fact forecast is closed. Otherwise the daily caps apply (2 new families,
 * 6 new fact cards, counting what today already took), perceptual families stop at the active cap and
 * production (mic) families also need mic room (`micRoom`).
 */
export function admitCreated(args: {
  items: readonly ReviewItem[];
  today: number;
  /** Perceptual families the lesson seeds (no microphone). */
  perceptual: number;
  /** Production families the lesson seeds (they need the microphone; also capped by `micRoom`). */
  production?: number;
  /** Concept families the lesson seeds. */
  concept: number;
  facts: number;
  activePerceptual: number;
  /** New cards that already started today (seeded or released). */
  newToday: { families: number; facts: number };
  cfg: GovernorConfig;
}): { perceptual: number; production: number; concept: number; facts: number; closed: boolean } {
  const { cfg } = args;
  const setsClosed = intakeForecast(args.items, args.today, cfg, 0, "sets").state === "closed";
  const factsClosed = intakeForecast(args.items, args.today, cfg, 0, "facts").state === "closed";
  let familyRoom = setsClosed ? 0 : Math.max(0, cfg.newPerDay.families - args.newToday.families);
  let slots = Math.max(0, cfg.maxActivePerceptual - args.activePerceptual);
  const perceptual = Math.min(args.perceptual, familyRoom, slots);
  familyRoom -= perceptual;
  slots -= perceptual;
  const production =
    (args.production ?? 0) > 0 && micRoom(args.items, args.today, cfg)
      ? Math.min(args.production ?? 0, familyRoom, slots, 1)
      : 0;
  familyRoom -= production;
  const concept = Math.min(args.concept, familyRoom);
  const facts = factsClosed
    ? 0
    : Math.min(args.facts, Math.max(0, cfg.newPerDay.facts - args.newToday.facts));
  return { perceptual, production, concept, facts, closed: setsClosed && factsClosed };
}

/**
 * The per-lesson limit on fact cards (decision 2: 2). The first `max` tested terms become cards; the rest
 * stay glossary entries.
 */
export function capLessonFacts<T>(
  tested: readonly T[],
  cfg: GovernorConfig,
): { cards: T[]; glossaryOnly: T[] } {
  const max = cfg.maxFactCardsPerLesson ?? tested.length;
  return { cards: tested.slice(0, max), glossaryOnly: tested.slice(max) };
}

// --- graduation ---------------------------------------------------------------------------------

/**
 * Whether a family stands at its mastery level for graduation: really there, or held at its highest open
 * level by a gate the learner has not reached (the gated-ladder rule of contracts §7.4).
 */
export function atMasteryForGraduation(
  input: Pick<GraduationInput, "level" | "masteryLevel" | "maxOpenLevel">,
): boolean {
  if (input.level >= input.masteryLevel) return true;
  return input.maxOpenLevel < input.masteryLevel && input.level >= input.maxOpenLevel;
}
/**
 * Graduation into a composite (contracts §7.4): at the mastery level (or gated at its highest open level),
 * `intervalAt(card, 0.9)` of at least 21 days, and the last two ratings Good or Easy.
 */
export function shouldGraduate(input: GraduationInput, cfg: GovernorConfig): boolean {
  if (!atMasteryForGraduation(input)) return false;
  if (!(input.t90Days >= cfg.graduateDays)) return false;
  const last = input.lastRatings.slice(-2);
  return last.length === 2 && last.every((r) => r >= 3);
}
/**
 * When the cap is hit: the family to graduate early (highest stability at or above its mastery level), or
 * `null`. "The cap" is the 12 active slots; with `reason: "time"` it is the warm-up time, when the intake
 * throttle would leave a new family waiting (see `admitCreated`) while an active family already stands at
 * its mastery level. It is read the same way in both cases: a family at its mastery level keeps being
 * sampled in its composite and is recalled the moment its composite credit falls below 0.65.
 */
export function earlyGraduate(
  active: readonly (GraduationInput & { cardId: string })[],
  cfg: GovernorConfig,
  reason: "slots" | "time" = "slots",
): string | null {
  if (reason === "slots" && active.length < cfg.maxActivePerceptual) return null;
  let best: (GraduationInput & { cardId: string }) | null = null;
  for (const f of active) {
    if (!atMasteryForGraduation(f)) continue;
    if (best === null || f.t90Days > best.t90Days || (f.t90Days === best.t90Days && f.cardId < best.cardId)) {
      best = f;
    }
  }
  return best?.cardId ?? null;
}
/** The interval cap for a card of this status, or `undefined` for none beyond the kind's own. */
export function intervalCap(
  card: Pick<Card, "kind" | "status">,
  perceptual: boolean,
  cfg: GovernorConfig,
): number | undefined {
  if (card.kind === "family" && card.status === "active" && perceptual) {
    return cfg.activeMaxIntervalDays ?? undefined;
  }
  return undefined;
}

// --- return policy ------------------------------------------------------------------------------

/** The return policy of contracts §7.9 by gap length. */
export function returnMode(gapDays: number): ReturnMode {
  if (gapDays >= RETURN.loosenGap) return "light+loosen";
  if (gapDays >= RETURN.lightGap) return "light";
  if (gapDays >= RETURN.warmupGap) return "warmup";
  return "normal";
}

/** 0: inside the 0.75–0.90 band · 1: above it · 2: below it. The order a returning learner meets due items in. */
export function returnTier(recall: number): 0 | 1 | 2 {
  const [lo, hi] = RETURN.band;
  if (recall >= lo && recall <= hi) return 0;
  return recall > hi ? 1 : 2;
}
/** Sort key for the return order: band first (highest first), then just above it, then just under it. */
export function returnRank(recall: number): number {
  const tier = returnTier(recall);
  if (tier === 0) return 300 + recall;
  if (tier === 1) return 200 - recall;
  return 100 + recall;
}

/**
 * Spreads an overdue backlog over `N = clamp(ceil(overdueSeconds / budget), 5, 7)` days: card ID → the first
 * day it is offered. Items in the 0.75–0.90 band come first, highest first. FSRS state is untouched; the
 * rating uses the real elapsed time when the review happens.
 */
export function smoothBacklog(
  overdue: readonly ReviewItem[],
  today: number,
  cfg: GovernorConfig,
): Map<string, number> {
  const out = new Map<string, number>();
  const items = cfg.quiet ? overdue.filter((it) => !it.mic) : overdue;
  if (items.length === 0) return out;
  const total = items.reduce((a, it) => a + it.sec, 0);
  const [minDays, maxDays] = RETURN.backlogDays;
  const days = Math.min(maxDays, Math.max(minDays, Math.ceil(total / cfg.budgetSec)));
  const slice = total / days;
  const order = [...items].sort(
    (a, b) =>
      returnRank(b.recall) - returnRank(a.recall) || (a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0),
  );
  let acc = 0;
  for (const it of order) {
    // An item belongs to the day its midpoint falls in, so a day's slice is never overfilled by a whole item.
    const k = Math.min(days - 1, Math.floor((acc + it.sec / 2) / slice));
    out.set(it.cardId, today + k);
    acc += it.sec;
  }
  return out;
}

/**
 * The Again-cascade cap of contracts §7.9: while a backlog is being cleared, at most 3 cards a day enter
 * relearning. After the third Again, items still to come with R below 0.60 wait for tomorrow.
 */
export function capRelearning<T extends Pick<ReviewItem, "recall" | "fresh">>(
  remaining: readonly T[],
  againsToday: number,
  backlogMode: boolean,
): { keep: T[]; held: T[] } {
  if (!backlogMode || againsToday < RETURN.maxRelearnPerDay) return { keep: [...remaining], held: [] };
  const keep: T[] = [];
  const held: T[] = [];
  for (const it of remaining) (it.fresh || it.recall >= RETURN.holdBelowR ? keep : held).push(it);
  return { keep, held };
}

// --- evidence from other work -------------------------------------------------------------------

/**
 * Whether work outside a card's own review counts as its review (contracts §7.4). An in-lesson ear, sing
 * or tap step, a gym set, a graded transcription step and a passed checkpoint review a linked card that is
 * due within the next 2 days; otherwise they are evidence only. Free practice reviews a card only when it
 * is already due. Only an active card can be reviewed at all.
 */
export function otherWorkCredit(args: {
  source: OtherWorkSource;
  status: Card["status"];
  /** The card's due day and today, as day indices. */
  dueDay: number;
  today: number;
}): "review" | "evidence-only" {
  if (args.status !== "active") return "evidence-only";
  const within = args.source === "practice" ? 0 : GOVERNOR.reviewIfDueDays;
  return args.dueDay - args.today <= within ? "review" : "evidence-only";
}

// --- load-balanced due days ---------------------------------------------------------------------

/** The day a card due on `day` will really be met: the first likely practice day on or after it (within a week). */
export function landingDay(day: number, likelyPracticeDay?: (day: number) => boolean): number {
  if (!likelyPracticeDay) return day;
  for (let k = 0; k < 7; k++) if (likelyPracticeDay(day + k)) return day + k;
  return day;
}
/**
 * Load balancer for `ReviewOptions.pickDay`. `loadByDay` maps a day index to the seconds already due that
 * day; the caller adds the reviewed card's seconds after each review so later reviews in the same session
 * spread out. `likelyPracticeDay` says whether the learner usually practises on a day: a card due on an
 * unlikely day is really met on the next likely one, so its load is counted there.
 */
export function makeDayPicker(
  loadByDay: ReadonlyMap<number, number>,
  today: number,
  likelyPracticeDay?: (day: number) => boolean,
): (ideal: number, lo: number, hi: number) => number {
  return (ideal, lo, hi) => {
    let pick = lo;
    let best = Number.POSITIVE_INFINITY;
    for (let d = lo; d <= hi; d++) {
      const land = landingDay(today + d, likelyPracticeDay);
      const cost = (loadByDay.get(land) ?? 0) + (land !== today + d ? 1e-2 : 0) + Math.abs(d - ideal) * 1e-3;
      if (cost < best) {
        best = cost;
        pick = d;
      }
    }
    return pick;
  };
}
/**
 * The learner's usual practice weekdays from recent session days (day indices): a weekday is likely when it
 * was used in at least half of the last 4 weeks. `undefined` until two weeks of history exist.
 */
export function likelyPracticeDays(
  sessionDays: readonly number[],
  today: number,
): ((day: number) => boolean) | undefined {
  const first = sessionDays[0];
  if (first === undefined) return undefined;
  const weeksSeen = Math.min(4, Math.floor((today - Math.min(...sessionDays)) / 7));
  if (weeksSeen < 2) return undefined;
  const hits = new Array<number>(7).fill(0);
  for (const d of sessionDays) {
    if (d < today - 28 || d >= today) continue;
    const w = ((d % 7) + 7) % 7;
    hits[w] = (hits[w] ?? 0) + 1;
  }
  return (day: number) => (hits[((day % 7) + 7) % 7] ?? 0) / weeksSeen >= 0.5;
}
