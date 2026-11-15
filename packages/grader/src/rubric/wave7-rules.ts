// Wave 7 (docs/design/wave7.md §3.2; contracts 1.8 §5.6 and §6.6 for JC1–JC4, RC1–RC2, AC1–AC2). The rule fields
// content-kit 6 added and the advanced tracks' custom rules (`TRACK_CUSTOM_RULES`) that have no analyzer yet.
// A rule that uses one fails with `rubric.unknown` and the detail "not built yet: …" — never a silent pass, never a
// field silently ignored (the corrections pass: a rule that cannot hear the result must not pass). The grader
// engineer builds each one against its content-kit definition, with the pre-flight's counterexamples as known-wrong
// tests (w7plan A3–A7), deletes its entry here in the same change, and moves it into content-kit `IMPLEMENTED`.
import type { NEvent, RubricRule } from "@oak/content-kit";
import { R, TRACK_CUSTOM_RULES } from "@oak/content-kit";
import { belowLowIntervalLimit, claveSteps } from "@oak/theory";
import { chordSlots } from "../analyze/chords.ts";
import { locAt, pitched, sounding } from "../analyze/events.ts";
import { periodOf, selectTrack } from "../analyze/tracks.ts";
import { claveView, euclidView, polyrhythmView } from "../analyze/wave7-views.ts";
import { diag } from "../feedback/catalog.ts";
import type { Normalized } from "../types.ts";
import type { RubricContext } from "./context.ts";
import type { CustomRule, RuleEval } from "./rules.ts";
import type { UnbuiltRuleField } from "./wave6-rules.ts";

/**
 * Rule fields of content-kit 6 with no analyzer behind them. Without these fields the rules run as they have since
 * Wave 1 (and content CI keeps `euclid`, `clave`, `polyrhythm`, `register-separation` and `no-muddy-low` out of
 * lessons until they are golden-tested: content-kit `PLANNED.rubricRules`).
 */
export const WAVE7_UNBUILT: readonly UnbuiltRuleField[] = [
  // Wave 7 Build (grader): `clave.coverage`, `polyrhythm.together`, `voice-leading.top` and `reharmonize.devices`
  // are built (below, rubric/wave6-rules.ts `reharmonizeRule`) and golden-tested in rubric/wave7-rules.test.ts.
];
/** The first Wave 7 field of `rule` that has no analyzer yet, or `null` when the rule can be evaluated. */
export function unbuiltWave7(rule: RubricRule): UnbuiltRuleField | null {
  return WAVE7_UNBUILT.find((f) => f.uses(rule)) ?? null;
}

/**
 * The custom rules of `TRACK_CUSTOM_RULES` that `CUSTOM_RULES` does not implement yet. `walking-bass`,
 * `allowed-tensions` and `ii-v-chain` exist from Wave 0 with OLD semantics (w7plan A3: four attacks crowded into
 * beat 1 walk; A4: the tensions never read the melody): they are listed in `WAVE7_REBUILD` and content CI keeps
 * them out of lessons (`PLANNED.customRules`) until they are rebuilt to their content-kit definition.
 */
export function wave7UnbuiltCustom(built: Iterable<string>): string[] {
  const have = new Set(built);
  return Object.keys(TRACK_CUSTOM_RULES).filter((fn) => !have.has(fn));
}
/** Custom rules that exist but must be rebuilt to their Wave 7 definition (`TRACK_CUSTOM_RULES`). */
export const WAVE7_REBUILD = ["walking-bass", "allowed-tensions", "ii-v-chain"] as const;

/** The honest outcome of a planned custom rule that has no analyzer yet. */
export function notBuiltCustom(fn: string): CustomRule {
  const doc = TRACK_CUSTOM_RULES[fn]?.doc ?? fn;
  const what = (doc.split(/(?<=[.:])\s/)[0] ?? doc).replace(/[.:]$/, "");
  return (): RuleEval => ({
    ok: false,
    detail: `not built yet: ${what}`,
    extra: [diag("rubric.unknown", { rule: fn })],
  });
}

/** Stubs for every planned custom rule `built` does not have (spread BEFORE the built ones: they win). */
export function wave7CustomStubs(built: Iterable<string>): Record<string, CustomRule> {
  return Object.fromEntries(wave7UnbuiltCustom(built).map((fn) => [fn, notBuiltCustom(fn)]));
}

// --- the rhythm and arrangement rules (Wave 7 Build, on the views of analyze/wave7-views.ts) ------------------

type RuleOf<K extends RubricRule["rule"]> = Extract<RubricRule, { rule: K }>;
/** A part that is written but not heard reads as nothing (W7 gate, review:studio): say why it may be so. */
const UNHEARD = " that you can hear: it is silent, or more than 24 dB under the loudest part";
const EPS = 1e-6;
const word = (ref: string): string => `\`${ref.replace(/^@/, "")}\``;
const barsOf = (events: readonly NEvent[], ctx: RubricContext): number => {
  const reach = events.reduce((m, e) => Math.max(m, R.floor(e.onset) + 1), 0);
  return Math.max(1, Math.min(ctx.bars ?? reach, reach || 1));
};

/**
 * `euclid`: every bar of one pass of `track` is E(k, n) on the n-step grid (any rotation with `rotationFree`), read
 * from the onsets heard, so `x(3,8)`, `.euclid(3, 8)` and `x ~ ~ x ~ ~ x ~` are one answer.
 */
export function euclidRule(r: RuleOf<"euclid">, n: Normalized, ctx: RubricContext): RuleEval {
  const events = selectTrack(n, r.track);
  if (events.length === 0)
    return { ok: false, value: 0, target: 1, detail: `nothing plays in ${word(r.track)}${UNHEARD}` };
  const pass = periodOf(events, 16, barsOf(events, ctx));
  const v = euclidView(n, { meter: ctx.meter, bars: pass, track: r.track, steps: r.n });
  const bad = v.find(
    (b) =>
      !b.euclid ||
      b.euclid.pulses !== r.k ||
      (!r.rotationFree && b.euclid.rotation !== 0) ||
      // Onsets off the n-step grid are not part of E(k, n).
      events.some(
        (e) =>
          R.floor(e.onset) === b.bar - 1 &&
          Math.abs(R.toNum(R.frac(e.onset)) * r.n - Math.round(R.toNum(R.frac(e.onset)) * r.n)) > 1e-6,
      ),
  );
  if (!bad) return { ok: true, value: 1, target: 1, detail: `E(${r.k},${r.n}) in every bar` };
  const rotated = bad.euclid && bad.euclid.pulses === r.k && !r.rotationFree;
  // Every hit heard in the bar, on the grid or off it ("cb*5" is five hits, none but the first on a sixteenth).
  const heard = new Set(
    events.filter((e) => R.floor(e.onset) === bad.bar - 1).map((e) => R.toNum(R.frac(e.onset)).toFixed(6)),
  ).size;
  const offGrid = heard - bad.onsets.length;
  const hits = `${heard} ${heard === 1 ? "hit" : "hits"} there`;
  return {
    ok: false,
    value: 0,
    target: 1,
    detail: rotated
      ? `bar ${bad.bar}: the right hits, turned to start elsewhere; the brief asks for E(${r.k},${r.n}) from its first hit`
      : offGrid > 0
        ? `bar ${bad.bar}: ${hits}, ${offGrid} of them between the ${r.n} steps of the bar; E(${r.k},${r.n}) puts every hit on a step`
        : `bar ${bad.bar}: ${hits}, not spread as evenly as they can go over ${r.n} steps (E(${r.k},${r.n}))`,
    where: { bar: bad.bar },
  };
}

/**
 * `clave` with `minBars` and `exact` (feature `clave.coverage`, w7plan A5): EVERY two-bar window from bar 1 for at
 * least `minBars` bars (default 2) holds the whole clave in its direction; with `exact` (default) the clave line
 * plays nothing else on its eighth grid. Two bars of clave in an eight-bar piece fail RC2's "8 bars".
 */
export function claveRule(r: RuleOf<"clave">, n: Normalized, ctx: RubricContext): RuleEval {
  const events = selectTrack(n, r.track);
  if (events.length === 0)
    return { ok: false, value: 0, target: 1, detail: `nothing plays in ${word(r.track)}${UNHEARD}` };
  const minBars = Math.max(2, r.minBars ?? 2);
  const exact = r.exact ?? true;
  const want = claveSteps(r.type, r.direction);
  const bars = Math.max(ctx.totalBars ?? 0, ctx.bars ?? 0, barsOf(events, ctx));
  const v = claveView(n, { meter: ctx.meter, bars, track: r.track });
  const named = `${r.type} clave ${r.direction}`;
  let covered = 0;
  for (const w of v.windows) {
    if (covered >= minBars) break;
    const has = want.every((s) => w.steps.includes(s));
    const only = w.steps.every((s) => want.includes(s));
    if (!has || (exact && !only)) {
      const heard = w.clave ? `${w.clave.type} clave ${w.clave.direction}` : null;
      return {
        ok: false,
        value: covered,
        target: minBars,
        detail:
          heard && heard !== named
            ? `bars ${w.bar}–${w.bar + 1} play the ${heard}; the brief asks for the ${named}`
            : has
              ? `bars ${w.bar}–${w.bar + 1}: the clave line plays more than the clave's five strokes`
              : `bars ${w.bar}–${w.bar + 1} do not hold the whole ${named}${covered > 0 ? ` (it holds for ${covered} bars from bar 1)` : ""}`,
        where: { bar: w.bar },
      };
    }
    covered += 2;
  }
  return covered >= minBars
    ? { ok: true, value: covered, target: minBars, detail: `the ${named} for ${covered} bars from bar 1` }
    : {
        ok: false,
        value: covered,
        target: minBars,
        detail: `the ${named} holds for ${covered} bars; the brief asks for ${minBars}`,
      };
}

/**
 * `polyrhythm` with `minBars` and `span` (feature `polyrhythm.together`, w7plan A6): in the SAME bars (or spans of
 * `span` bars), `a` plays `ratio[0]` evenly spaced attacks and `b` `ratio[1]`, both heard; at least `minBars` bars
 * of them (default 2). Parts that take turns bar by bar never meet and fail.
 */
export function polyrhythmRule(r: RuleOf<"polyrhythm">, n: Normalized, ctx: RubricContext): RuleEval {
  const A = selectTrack(n, r.a);
  const B = selectTrack(n, r.b);
  if (A.length === 0)
    return { ok: false, value: 0, target: 1, detail: `nothing plays in ${word(r.a)}${UNHEARD}` };
  if (B.length === 0)
    return { ok: false, value: 0, target: 1, detail: `nothing plays in ${word(r.b)}${UNHEARD}` };
  const span = Math.max(1, r.span ?? 1);
  // One pass of the piece (its `arrange()` total or loop), so a loop queried for 64 bars is not counted 8 times.
  // A loop shorter than `minBars` that keeps repeating is read for `minBars` bars, as far as it was heard: a one-bar
  // loop of 3 against 2 is good music (build-author-R2c); alternating bars still never meet.
  const minBars = Math.max(span, r.minBars ?? 2);
  const heard = barsOf([...A, ...B], ctx);
  const bars = Math.max(ctx.totalBars ?? Math.max(ctx.bars ?? 0, heard), Math.min(minBars, heard));
  const v = polyrhythmView(n, { meter: ctx.meter, bars, a: r.a, b: r.b, ratio: r.ratio, span });
  if (!Array.isArray(v)) return { ok: false, detail: v.notBuilt };
  const together = v.filter((x) => x.together).length * span;
  const ratio = r.ratio.join(" against ");
  if (together >= minBars)
    return { ok: true, value: together, target: minBars, detail: `${ratio} together in ${together} bars` };
  const aOnly = v.some((x) => x.a === r.ratio[0]);
  const bOnly = v.some((x) => x.b === r.ratio[1]);
  return {
    ok: false,
    value: together,
    target: minBars,
    detail:
      together > 0
        ? `${ratio} sound together in ${together} bars; at least ${minBars}`
        : aOnly && bOnly
          ? `both pulses are there, but never in the same bars: a polyrhythm is the two at once`
          : !aOnly
            ? `${word(r.a)} does not play ${r.ratio[0]} evenly spaced attacks in a ${span === 1 ? "bar" : `${span}-bar span`}`
            : `${word(r.b)} does not play ${r.ratio[1]} evenly spaced attacks in a ${span === 1 ? "bar" : `${span}-bar span`}`,
  };
}

/** `register-separation`: `high`'s lowest note at least `minGapSemis` above `low`'s highest, both heard. */
export function registerSepRule(
  r: RuleOf<"register-separation">,
  n: Normalized,
  _ctx: RubricContext,
): RuleEval {
  const lo = pitched(selectTrack(n, r.low));
  const hi = pitched(selectTrack(n, r.high));
  if (lo.length === 0)
    return {
      ok: false,
      value: 0,
      target: r.minGapSemis,
      detail: `nothing plays in ${word(r.low)}${UNHEARD}`,
    };
  if (hi.length === 0)
    return {
      ok: false,
      value: 0,
      target: r.minGapSemis,
      detail: `nothing plays in ${word(r.high)}${UNHEARD}`,
    };
  const top = Math.max(...lo.map((e) => e.midi));
  const bottom = Math.min(...hi.map((e) => e.midi));
  const gap = bottom - top;
  return {
    ok: gap >= r.minGapSemis,
    value: Math.max(0, gap),
    target: r.minGapSemis,
    detail:
      gap >= r.minGapSemis
        ? `${gap} half steps between ${word(r.low)}'s top and ${word(r.high)}'s bottom`
        : gap < 0
          ? `${word(r.high)} goes below ${word(r.low)}: the two parts cross; keep at least ${r.minGapSemis} half steps between them`
          : `only ${gap} half steps between ${word(r.low)}'s top and ${word(r.high)}'s bottom; at least ${r.minGapSemis}`,
  };
}

/**
 * `no-muddy-low`: no two notes of `track` sounding together below their low-interval limit (@oak/theory
 * `LOW_INTERVAL_LIMITS`, the REGISTER bands of the spectrum panel): a third under C3 is mud, a fifth is fine down to
 * B♭1, an octave never muddies.
 */
export function noMuddyLowRule(r: RuleOf<"no-muddy-low">, n: Normalized, ctx: RubricContext): RuleEval {
  const events = pitched(selectTrack(n, r.track));
  if (events.length === 0)
    return { ok: false, value: 0, target: 1, detail: `nothing plays in ${word(r.track)}${UNHEARD}` };
  for (const e of events) {
    const here = [...new Set(sounding(events, e.onset).map((x) => x.midi))].sort((a, b) => a - b);
    for (let i = 0; i + 1 < here.length; i++) {
      const a = here[i] as number;
      const b = here[i + 1] as number;
      if (belowLowIntervalLimit(a, b))
        return {
          ok: false,
          value: 0,
          target: 1,
          credit: 0,
          detail: `${b - a} half steps apart this low (the lower note MIDI ${a}) blur into mud: spread the low notes wider or move them up`,
          where: locAt(e.onset, ctx),
        };
    }
  }
  return { ok: true, value: 1, target: 1, detail: "the low end is clear" };
}

/**
 * `voice-leading` with `voice: "top"` (feature `voice-leading.top`, AC2; w7plan A7): the highest sounding note of
 * each chord of a HAND-VOICED track; at least `minRatio` (default 1) of the changes move it by at most
 * `maxMovePerVoice` half steps. A `voicing()` line fails with a reason: its top note is the dictionary's.
 */
export function voiceLeadingTopRule(r: RuleOf<"voice-leading">, n: Normalized, ctx: RubricContext): RuleEval {
  const events = selectTrack(n, r.track);
  if (pitched(events).length === 0)
    return { ok: false, value: 0, target: 1, detail: `nothing plays in ${word(r.track)}${UNHEARD}` };
  if (events.some((e) => e.chordSymbol !== undefined))
    return {
      ok: false,
      value: 0,
      target: 1,
      detail: `${word(r.track)} is voiced by the dictionary, so its top note is not yours to lead: write the chords' notes yourself`,
    };
  const slots = chordSlots(events).filter((s) => s.midis.length >= 2);
  const pass = periodOf(events, 16, barsOf(events, ctx));
  const one = slots.filter((s) => R.toNum(s.span[0]) < pass - EPS);
  const tops = one.map((s) => ({ at: s.span[0], top: Math.max(...s.midis) }));
  if (tops.length > 1)
    tops.push({ at: R.add(tops[0]?.at ?? [0, 1], [pass, 1]), top: tops[0]?.top as number });
  const moves = tops
    .slice(1)
    .map((t, i) => ({ at: t.at, semis: Math.abs(t.top - (tops[i] as { top: number }).top) }));
  if (moves.length === 0) return { ok: false, detail: "no chord changes to lead" };
  const good = moves.filter((m) => m.semis <= r.maxMovePerVoice).length;
  const ratio = good / moves.length;
  const min = r.minRatio ?? 1;
  const bad = moves.find((m) => m.semis > r.maxMovePerVoice);
  return ratio >= min - EPS
    ? {
        ok: true,
        value: ratio,
        target: min,
        detail: `the top voice moves ${r.maxMovePerVoice} half steps or less at ${Math.round(ratio * 100)}% of the changes`,
      }
    : {
        ok: false,
        value: ratio,
        target: min,
        detail: `the top voice moves ${r.maxMovePerVoice} half steps or less at ${Math.round(ratio * 100)}% of the changes; at least ${Math.round(min * 100)}%${bad ? ` (bar ${R.floor(bad.at) + 1}: it leaps ${bad.semis})` : ""}`,
        ...(bad ? { where: { bar: R.floor(bad.at) + 1 } } : {}),
      };
}
