// The daily warm-up planner of contracts §7.4 (order and constraints) and §7.9 (the return order).
// Pure: the caller builds the `ReviewItem`s (one per due card, repair-queue family or blocked-intro set).
import { GOVERNOR, PRIORITY_WEIGHTS, RETURN, REVIEW_DAY_MAX_SEC } from "./constants.ts";
import { returnRank } from "./governor.ts";
import type { GovernorConfig, PlanContext, PlannedItem, ReviewItem, WarmupPlan } from "./types.ts";

/** Days a due item may wait before it is planned first, whatever its length (`planWarmup` step 0). */
export const URGENT_AFTER_DAYS = 2;
/** Planning estimate of one listen-only block (15 to 20 s). */
export const LISTEN_BLOCK_SEC = (GOVERNOR.listenBlockSec[0] + GOVERNOR.listenBlockSec[1]) / 2;

const byId = (a: ReviewItem, b: ReviewItem) => (a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0);
const isFact = (it: ReviewItem) => it.cls === "fact";
/** A set that counts toward "a listen block after every second perceptual set". */
const isPerceptualSet = (it: ReviewItem) => !isFact(it) && it.perceptual;

/**
 * Warm-up priority of contracts §7.4: `2·(1 − R) + 1·blockedIntroPending + 0.5·linkedToNextLesson + 0.5·debt`,
 * plus a small gain per day waited so a high-recall item is never starved. A never-reviewed card
 * (`fresh`) fills only the room the due items leave for its first two days, then ages like the rest
 * (`freshPriority`).
 */
export function warmupPriority(
  it: ReviewItem,
  today: number,
  cfg: Pick<GovernorConfig, "agingPerDay">,
): number {
  if (it.fresh) return freshPriority(it, today, cfg);
  return (
    PRIORITY_WEIGHTS.forgetting * (1 - it.recall) +
    PRIORITY_WEIGHTS.blockedIntro * Number(it.blockedIntroPending) +
    PRIORITY_WEIGHTS.nextLesson * Number(it.linkedToNextLesson) +
    PRIORITY_WEIGHTS.debt * Number(it.debt) +
    cfg.agingPerDay * Math.max(0, today - it.dueDay)
  );
}

/**
 * A never-reviewed card is new for `URGENT_AFTER_DAYS` days: it fills only the room the due items leave
 * (priority −1). After that it has been dealt and not shown, and it waits like any due card: it gains the
 * same priority per day waited, with no forgetting term (there is nothing to forget yet). Without this a
 * card dealt in a busy stretch is outranked by every day's reviews for weeks (measured before Wave 6: a
 * deck card dealt on day 142 of a 15-minute run was first shown on day 170), and it is the oldest
 * undelivered due card of contracts §7.4 all that time.
 */
function freshPriority(it: ReviewItem, today: number, cfg: Pick<GovernorConfig, "agingPerDay">): number {
  const waited = Math.max(0, today - it.dueDay);
  return waited < URGENT_AFTER_DAYS ? -1 : cfg.agingPerDay * waited;
}

function kindOf(it: ReviewItem): PlannedItem["kind"] {
  if (it.repair) return "repair";
  if (it.cls === "fact") return "fact-set";
  if (it.blockedIntroPending) return "blocked-intro";
  if (it.cls === "composite") return "composite-set";
  if (it.cls === "concept") return "concept-set";
  return "family-set";
}

interface Block {
  planned: PlannedItem;
  priority: number;
  domain: string;
  perceptual: boolean;
}

/**
 * Fills the warm-up up to the budget (× `planFraction`): the opener is a sure win (the highest-R due item,
 * or the 4-trial anchor set when nothing due is likely to succeed), then the repair queue, then by
 * priority. No two consecutive sets come from one domain; at most 2 mic sets (0 in Quiet mode); a
 * listen-only block follows every second perceptual set. After a gap of 3 days or more it draws items with
 * R in [0.75, 0.90] first, highest first, then R above 0.90, then items just under 0.75.
 *
 * What does not fit stays due (`overflow`) with no penalty and is never shown as a count. If anything is
 * offered the plan holds at least one item, even one longer than the budget.
 */
export function planWarmup(due: readonly ReviewItem[], ctx: PlanContext, cfg: GovernorConfig): WarmupPlan {
  const budgetSec = ctx.budgetSec ?? cfg.budgetSec;
  const limit = budgetSec * cfg.planFraction;
  const today = ctx.today;
  const micLimit = cfg.quiet ? 0 : Math.max(0, cfg.maxMicSets - (ctx.micSetsUsed ?? 0));
  const returning = ctx.gapDays >= RETURN.warmupGap;

  // Production cards are paused in Quiet mode: not due, not planned, not overflow.
  const live = cfg.quiet ? due.filter((it) => !it.mic) : [...due];
  const held = live.filter((it) => (it.deferUntilDay ?? today) > today);
  const offered = live.filter((it) => (it.deferUntilDay ?? today) <= today);

  const priority = (it: ReviewItem): number => {
    if (it.fresh) return freshPriority(it, today, cfg);
    return returning ? returnRank(it.recall) : warmupPriority(it, today, cfg);
  };
  const ranked = [...offered].sort((a, b) => priority(b) - priority(a) || byId(a, b));

  const chosen = new Set<ReviewItem>();
  const used = { fact: 0, set: 0 };
  let micUsed = 0;
  let perceptualSets = 0;
  const total = () => used.fact + used.set;
  /** Seconds an item adds, including the listen block its set would complete a pair for. */
  const cost = (it: ReviewItem): number =>
    it.sec + (isPerceptualSet(it) && (perceptualSets + 1) % 2 === 0 ? LISTEN_BLOCK_SEC : 0);
  const micOk = (it: ReviewItem) => isFact(it) || !it.mic || micUsed < micLimit;
  const take = (it: ReviewItem) => {
    used[isFact(it) ? "fact" : "set"] += cost(it);
    if (isPerceptualSet(it)) perceptualSets++;
    if (it.mic && !isFact(it)) micUsed++;
    chosen.add(it);
  };

  // (0) A family's first set (decision 27: its first review is bounded in days), after a break too, then the
  // most urgent item once it has waited two days, are planned before anything else, outside the class
  // shares: a long set (a progression dictation, a whole song form) otherwise never fits after the other
  // items and waits indefinitely.
  for (const it of ranked) {
    if (it.firstSet && !it.fresh && micOk(it) && total() + cost(it) <= limit) take(it);
  }
  const urgent = ranked.find((it) => !chosen.has(it) && !it.fresh && micOk(it)) ?? null;
  if (urgent && !returning && today - urgent.dueDay >= URGENT_AFTER_DAYS && total() + cost(urgent) <= limit)
    take(urgent);

  // (1) The opener: a sure win.
  let opener: ReviewItem | null = null;
  let anchor: ReviewItem | null = null;
  if (!ctx.continuation && offered.length > 0) {
    const byRecall = offered
      .filter((it) => !it.fresh && !chosen.has(it))
      .sort((a, b) => b.recall - a.recall || byId(a, b));
    const best = byRecall.find((it) => total() + cost(it) <= limit && micOk(it)) ?? null;
    const fallback = ctx.anchorFallback;
    const fallbackUsable =
      fallback !== null &&
      total() + fallback.sec <= limit &&
      !(fallback.mic && (cfg.quiet || micUsed >= micLimit));
    if (best && best.recall >= GOVERNOR.anchorMinRecall) opener = best;
    else if (fallbackUsable) anchor = fallback;
    else opener = best;
    if (opener) take(opener);
    if (anchor) {
      used.set += anchor.sec;
      // A mic anchor is one of the day's mic sets (at most 2, contracts §7.4).
      if (anchor.mic) micUsed++;
    }
  }

  // (2) The repair queue, ahead of everything else.
  for (const it of ranked) {
    if (it.repair && !chosen.has(it) && micOk(it) && total() + cost(it) <= limit) take(it);
  }
  // (3) By priority. Pass 1 keeps each class inside its share; pass 2 lets either use what is left.
  const cap = { fact: cfg.factShare * limit, set: (1 - cfg.factShare) * limit };
  for (const it of ranked) {
    const k = isFact(it) ? "fact" : "set";
    const c = cost(it);
    if (!chosen.has(it) && micOk(it) && total() + c <= limit && used[k] + c <= cap[k]) take(it);
  }
  for (const it of ranked) {
    if (!chosen.has(it) && micOk(it) && total() + cost(it) <= limit) take(it);
  }
  // Never an empty warm-up while something is offered.
  if (chosen.size === 0 && anchor === null && !ctx.continuation) {
    const first = ranked.find(micOk);
    if (first) take(first);
  }

  // --- order for play ---
  const setBlock = (it: ReviewItem): Block => ({
    planned: { item: it, kind: kindOf(it), cardIds: [it.cardId], estSec: it.sec, rated: true },
    priority: priority(it),
    domain: it.domain,
    perceptual: isPerceptualSet(it),
  });
  const factBlocks = (facts: ReviewItem[]): Block[] => {
    const out: Block[] = [];
    for (let i = 0; i < facts.length; i += GOVERNOR.factSetMax) {
      const cards = facts.slice(i, i + GOVERNOR.factSetMax);
      const head = cards[0];
      if (!head) continue;
      out.push({
        planned: {
          item: head,
          kind: "fact-set",
          cardIds: cards.map((c) => c.cardId),
          estSec: cards.reduce((a, c) => a + c.sec, 0),
          rated: true,
        },
        priority: Math.max(...cards.map(priority)),
        domain: "fact",
        perceptual: false,
      });
    }
    return out;
  };

  const chosenRanked = ranked.filter((it) => chosen.has(it));
  let facts = chosenRanked.filter(isFact);
  if (opener && isFact(opener)) {
    // The opening mini-set starts with the surest cards.
    const head = [...facts].sort((a, b) => b.recall - a.recall || byId(a, b)).slice(0, GOVERNOR.factSetMax);
    facts = [...head, ...facts.filter((f) => !head.includes(f))];
  }
  const fBlocks = factBlocks(facts);
  const sets = chosenRanked.filter((it) => !isFact(it));

  const sequence: Block[] = [];
  const pool: Block[] = [];
  if (anchor) {
    sequence.push({
      planned: { item: anchor, kind: "anchor", cardIds: [], estSec: anchor.sec, rated: false },
      priority: Number.POSITIVE_INFINITY,
      domain: anchor.domain,
      perceptual: false,
    });
  }
  if (opener && isFact(opener)) {
    const first = fBlocks.shift();
    if (first) sequence.push(first);
  } else if (opener) {
    sequence.push(setBlock(opener));
  }
  const repairs = sets.filter((it) => it.repair && it !== opener).map(setBlock);
  pool.push(...sets.filter((it) => !it.repair && it !== opener).map(setBlock), ...fBlocks);

  const drain = (blocks: Block[]) => {
    const rest = [...blocks].sort((a, b) => b.priority - a.priority);
    while (rest.length > 0) {
      const prev = sequence[sequence.length - 1];
      let i = rest.findIndex((b) => !prev || b.domain !== prev.domain);
      if (i < 0) i = 0;
      const [next] = rest.splice(i, 1);
      if (next) sequence.push(next);
    }
  };
  drain(repairs);
  drain(pool);

  // A listen-only block after every second perceptual set.
  const items: PlannedItem[] = [];
  let seen = 0;
  for (const b of sequence) {
    items.push(b.planned);
    if (!b.perceptual) continue;
    seen++;
    if (seen % 2 === 0) {
      items.push({
        item: b.planned.item,
        kind: "listen",
        cardIds: [],
        estSec: LISTEN_BLOCK_SEC,
        rated: false,
      });
    }
  }

  const overflow = [...held, ...ranked.filter((it) => !chosen.has(it))];
  return {
    budgetSec,
    plannedSec: items.reduce((a, p) => a + p.estSec, 0),
    items,
    overflow,
    overflowSec: overflow.reduce((a, it) => a + it.sec, 0),
  };
}

export interface ReviewDayPlan {
  /** The first block is the day's review; each later one is one "a little more". */
  blocks: WarmupPlan[];
  plannedSec: number;
  /** Planned seconds of the blocks after the first: what "a little more" adds to the day's review. */
  moreSec: number;
  /** Still due after every block. */
  overflow: ReviewItem[];
}

/**
 * A reviews-only day (`/practice/review`): the warm-up budget first, then "a little more" in budget-sized
 * blocks. A block is offered only while something is left to review.
 *
 * The 12-minute cap (`REVIEW_DAY_MAX_SEC`): by default it covers the whole day, the first block included
 * (contracts §7.4 "up to 12 minutes in total", decision 23). With `warmupCounts: false` it covers "a little
 * more" alone, on top of whatever the first block took (the learner's decision of 2026-11-13, d22): the day
 * is then at most the budget plus 12 minutes.
 */
export function planReviewDay(
  due: readonly ReviewItem[],
  ctx: PlanContext,
  cfg: GovernorConfig,
  opts: { warmupCounts?: boolean } = {},
): ReviewDayPlan {
  const warmupCounts = opts.warmupCounts ?? true;
  const blockBudget = ctx.budgetSec ?? cfg.budgetSec;
  const blocks: WarmupPlan[] = [];
  let remaining: readonly ReviewItem[] = due;
  /** Seconds counted against the cap so far. */
  let budgeted = 0;
  let micSets = ctx.micSetsUsed ?? 0;
  for (;;) {
    const counts = warmupCounts || blocks.length > 0;
    const left = REVIEW_DAY_MAX_SEC - budgeted;
    if (counts && left <= 0) break;
    const budgetSec = counts ? Math.min(blockBudget, left) : blockBudget;
    const plan = planWarmup(
      remaining,
      { ...ctx, budgetSec, micSetsUsed: micSets, continuation: blocks.length > 0 },
      cfg,
    );
    if (plan.items.length === 0) {
      if (blocks.length === 0) blocks.push(plan);
      break;
    }
    blocks.push(plan);
    if (counts) budgeted += budgetSec;
    micSets += plan.items.filter((p) => p.item.mic && p.kind !== "fact-set" && p.kind !== "listen").length;
    remaining = plan.overflow;
    if (remaining.length === 0) break;
  }
  const last = blocks[blocks.length - 1];
  return {
    blocks,
    plannedSec: blocks.reduce((a, b) => a + b.plannedSec, 0),
    moreSec: blocks.slice(1).reduce((a, b) => a + b.plannedSec, 0),
    overflow: last ? last.overflow : [],
  };
}
