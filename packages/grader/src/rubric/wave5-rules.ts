// Wave 5 rules of content-kit (docs/design/wave5.md §3.2): `bass-line` (U08, C3, C5) graded on the bass view's
// note roles; `notates` (C3) through @oak/notation with `approximate = false`; a rule read on one section or bar
// window (`RubricRuleBase.section`, feature `rubric.section`); and the Wave 5 fields of `ends-on-degree` (`over`),
// `degree-set` (`anyOf`) and `blues-form` (`choruses`, `quickChangeOk`). Every detail line names the actual fault.
import type { NEvent, Rat, RubricRule, SectionRef, SwingSpec } from "@oak/content-kit";
import { R, rat } from "@oak/content-kit";
import { buildScore, leadSheetInput } from "@oak/notation";
import type { ChordId, KeySpec } from "@oak/theory";
import {
  chordOf,
  degreeOf,
  METERS,
  parseRN,
  pcOf,
  rnToChord,
  romanOf,
  spellMidi,
  toCode,
  toLeadSheet,
  triadCore,
  twelveBarPlan,
} from "@oak/theory";
import type { ChordSlot } from "../analyze/chords.ts";
import { bluesForm, chordPerBar, romanShown, slotAt } from "../analyze/chords.ts";
import { mod12, pitched } from "../analyze/events.ts";
import { keyOf } from "../analyze/key.ts";
import { resolveSection, sectionsFromAst } from "../analyze/sections.ts";
import { swingRatio } from "../analyze/swing.ts";
import { selectTrack } from "../analyze/tracks.ts";
import { bassNotes } from "../analyze/wave5-views.ts";
import { diag } from "../feedback/catalog.ts";
import type { Normalized } from "../types.ts";
import type { RubricContext } from "./context.ts";
import type { RuleEval } from "./rules.ts";

type SlotsOf = (n: Normalized, track?: string, opts?: { exclude?: string }) => ChordSlot[];

type RuleOf<K extends RubricRule["rule"]> = Extract<RubricRule, { rule: K }>;
const pct = (x: number): string => `${Math.round(x * 100)}%`;

/**
 * `bass-line`: roots on the changes or downbeats, chord members, approach tones. Every part the rule lists must
 * hold; partial credit is the weakest part. `slots` are the piece's chords with the bass line left out.
 */
export function bassLineRule(
  r: RuleOf<"bass-line">,
  n: Normalized,
  ctx: RubricContext,
  slotsOf: (
    n: Normalized,
    track?: string,
    opts?: { exclude?: string },
  ) => import("../analyze/chords.ts").ChordSlot[],
): RuleEval {
  const bass = pitched(selectTrack(n, r.track));
  if (bass.length === 0) return { ok: false, detail: `no bass notes on ${r.track}` };
  const key = keyOf(n.all, ctx.key ?? null);
  const slots = slotsOf(n, r.harmony, { exclude: r.track });
  if (!slots.some((s) => s.chord)) return { ok: false, detail: "no chords to play the bass against" };
  const { notes, changes, rootsOnChange } = bassNotes(bass, slots, { ...ctx, ...(key ? { key } : {}) });
  const parts: { ok: boolean; credit: number; text: string }[] = [];
  if (r.roots) {
    let ratio: number;
    if (r.roots.on === "change") ratio = changes === 0 ? 0 : rootsOnChange / changes;
    else {
      const down = notes.filter((x) => x.downbeat && x.chord !== null);
      ratio =
        down.length === 0
          ? 0
          : down.filter((x) => x.role === "root" || x.role === "octave").length / down.length;
    }
    parts.push({
      ok: ratio >= r.roots.minRatio,
      credit: Math.min(1, ratio / r.roots.minRatio),
      text: `roots on ${pct(ratio)} of the ${r.roots.on === "change" ? "chord changes" : "downbeats"} (at least ${pct(r.roots.minRatio)})`,
    });
  }
  if (r.members) {
    const allowed = new Set<string>(r.members.allowed);
    const judged = notes.filter((x) => x.role !== null);
    const hits = judged.filter((x) => allowed.has(x.role as string));
    const ratio = judged.length === 0 ? 0 : hits.length / judged.length;
    const missing = r.members.each ? r.members.allowed.filter((m) => !judged.some((x) => x.role === m)) : [];
    parts.push({
      ok: ratio >= r.members.minRatio && missing.length === 0,
      credit: Math.min(1, ratio / r.members.minRatio) * (missing.length === 0 ? 1 : 0.5),
      text:
        missing.length > 0
          ? `no ${missing.join(" or ")} yet`
          : `${pct(ratio)} of the bass notes are ${r.members.allowed.join(", ")}`,
    });
  }
  if (r.approach) {
    const kinds = r.approach.kinds ?? ["diatonic", "chromatic"];
    const count = notes.filter(
      (x) => x.approach !== null && kinds.some((k) => (x.approach as string).startsWith(k)),
    ).length;
    parts.push({
      ok: count >= r.approach.min,
      credit: Math.min(1, count / r.approach.min),
      text: `${count} approach note${count === 1 ? "" : "s"} into a change (at least ${r.approach.min})`,
    });
  }
  if (parts.length === 0)
    return { ok: false, detail: "the rule asks for nothing (roots, members or approach)" };
  const ok = parts.every((p) => p.ok);
  return { ok, credit: Math.min(...parts.map((p) => p.credit)), detail: parts.map((p) => p.text).join("; ") };
}

// --- notates (C3) ------------------------------------------------------------------------------------------

/**
 * The swing a learner's line declares for notation (contracts §6.10 item 2): the context's, else the melody's own
 * measured swing when it is light, triplet or hard on a consistent subdivision; `null` when it plays straight.
 */
export function sketchSwing(events: readonly NEvent[], ctx: RubricContext): SwingSpec | null {
  if (ctx.swing) return ctx.swing;
  for (const sub of [8, 16] as const) {
    const m = swingRatio(events, ctx.meter, sub);
    if (m.n >= 4 && m.cls !== "straight" && Number.isFinite(m.ratio))
      return { subdivision: sub, amount: Math.round(((m.ratio - 1) / (m.ratio + 1)) * 1000) / 1000 };
  }
  return null;
}

/**
 * `notates` (C3 "the lead sheet renders"): the melody (`melody`, default `@melody`) with the piece's chords above
 * it, engraved by @oak/notation exactly as the lead sheet draws it; it passes when the score needs no rounding
 * (`approximate = false`). A declared or measured swing is carried by the notation (contracts §6.10 item 3).
 */
export function notatesRule(
  r: RuleOf<"notates">,
  n: Normalized,
  ctx: RubricContext,
  slotsOf: SlotsOf,
  bars: number,
): RuleEval {
  const melRef = r.melody ?? "@melody";
  const mel =
    r.view === "staff"
      ? n.all.filter((e) => e.midi !== null && e.chordSymbol === undefined && e.drum === undefined)
      : pitched(selectTrack(n, melRef));
  if (mel.length === 0)
    return {
      ok: false,
      detail:
        r.view === "staff"
          ? "nothing pitched to write on the staff"
          : `no melody to put on the lead sheet (label a line \`mel:\`)`,
    };
  const meter = METERS[ctx.meter];
  const key = keyOf(n.all, ctx.key ?? null);
  const swing = sketchSwing(mel, ctx);
  const total = Math.max(1, Math.min(128, bars));
  const slots = r.view === "lead-sheet" ? slotsOf(n, undefined, { exclude: melRef }) : [];
  const chords = slots
    .filter((s) => s.chord && R.lt(s.span[0], rat(total)))
    .map((s) => {
      const at = R.toNum(s.span[0]);
      const bar = Math.floor(at + 1e-9);
      return {
        bar,
        beat: Math.round((at - bar) * meter.unitsPerBar * 100) / 100 + 1,
        symbol: s.symbol ?? toCode({ ...(s.chord as ChordId), bassPc: (s.chord as ChordId).rootPc }),
      };
    });
  const input = leadSheetInput({
    melody: [...mel].sort((a, b) => R.cmp(a.onset, b.onset) || (a.midi ?? 0) - (b.midi ?? 0)),
    chords,
    meter,
    key,
    bars: total,
    ...(ctx.pickup ? { pickup: ctx.pickup } : {}),
    ...(swing ? { swing } : {}),
  });
  if (r.view === "staff") input.staff = "auto";
  let score: ReturnType<typeof buildScore>;
  try {
    score = buildScore(input);
  } catch (e) {
    return {
      ok: false,
      detail: `the staff could not be drawn (${e instanceof Error ? e.message : String(e)})`,
    };
  }
  if (!score.approximate)
    return {
      ok: true,
      detail: `${total} bars write exactly${swing ? ` (${score.swingText ?? "swung"})` : ""}`,
    };
  const rounding = score.warnings.filter((w) =>
    ["snapped-to-grid", "overlap-cut", "tuplet-too-long", "mixed-tuplets"].includes(w.code),
  );
  const shift = ctx.pickup ? 0 : 1;
  const barsHit = [...new Set(rounding.map((w) => w.bar + shift))].sort((a, b) => a - b);
  const first = rounding[0];
  const why =
    first?.code === "overlap-cut"
      ? "two notes of the line overlap; let each note end where the next begins"
      : first?.code === "tuplet-too-long" || first?.code === "mixed-tuplets"
        ? "a rhythm splits the beat in a way the staff can't write; keep to 8ths, 16ths or triplets"
        : "a note falls between the grid lines (an odd `.fast()`, a nudge or a long tuplet)";
  const where = barsHit.length
    ? `bar${barsHit.length > 1 ? "s" : ""} ${barsHit.slice(0, 4).join(", ")}`
    : "the line";
  return {
    ok: false,
    value: barsHit.length ? 1 - barsHit.length / total : 0,
    target: 1,
    detail: `${where} can't be written exactly: ${why}`,
    ...(barsHit[0] !== undefined ? { where: { bar: barsHit[0] } } : {}),
    extra: [
      diag(
        "staff.not-exact",
        { bars: where, why },
        barsHit[0] !== undefined ? { bar: barsHit[0] } : undefined,
      ),
    ],
  };
}

// --- a rule read on one section or bar window (feature `rubric.section`) ---------------------------------

/** How a section reference reads in a message: "the verse", "the second chorus", "bar 12", "the last section". */
export function sectionText(ref: SectionRef): string {
  if (ref === "last") return "the last section";
  if ("bars" in ref)
    return ref.bars[0] === ref.bars[1] ? `bar ${ref.bars[0]}` : `bars ${ref.bars[0]}–${ref.bars[1]}`;
  const nth =
    ref.nth === undefined
      ? ""
      : `${ref.nth < 0 ? "last " : (["", "first ", "second ", "third ", "fourth "][ref.nth] ?? `${ref.nth}th `)}`;
  return `the ${nth}${ref.section}`;
}

/**
 * The piece cut to one section or bar window, with onsets moved so the window starts at cycle 0, and the context
 * that goes with it (its bars; the pickup only when the window starts at the top). `from` is the first cycle.
 * With a pickup, bar 1 is cycle 1 (contracts §6.11), so `{ bars: [12, 12] }` is cycle 12.
 */
export function scopeToSection(
  ref: SectionRef,
  n: Normalized,
  ctx: RubricContext,
): { n: Normalized; ctx: RubricContext; from: number } | { error: RuleEval } {
  let span: [number, number] | null;
  if (typeof ref === "object" && "bars" in ref) {
    const shift = ctx.pickup ? 1 : 0;
    span = [ref.bars[0] - 1 + shift, ref.bars[1] + shift];
  } else {
    const s = sectionsFromAst(ctx.code);
    if (!s)
      return {
        error: {
          ok: false,
          detail: `no sections to find ${sectionText(ref)} in: write one \`arrange()\` per labelled track`,
          extra: [diag("form.no-sections")],
        },
      };
    if ("inconsistent" in s)
      return {
        error: {
          ok: false,
          detail: s.inconsistent.detail,
          extra: [
            diag(
              "form.inconsistent-arrange",
              { detail: s.inconsistent.detail },
              { track: s.inconsistent.track },
            ),
          ],
        },
      };
    span = resolveSection(ref, s.sections, s.totalBars);
    if (!span) {
      const have = s.sections.map((x) => x.tag).join(" ");
      return {
        error: {
          ok: false,
          detail: `there is no ${sectionText(ref).replace(/^the /, "")} in your sections (${have || "none"})`,
          extra: [diag("form.no-section", { section: sectionText(ref), have: have || "none" })],
        },
      };
    }
  }
  const [from, to] = span;
  const shiftBy = rat(from);
  const cut = (events: readonly NEvent[]): NEvent[] =>
    events
      .filter((e) => {
        const c = R.floor(e.onset);
        return c >= from && c < to;
      })
      .map((e) => ({ ...e, onset: R.sub(e.onset, shiftBy) }));
  const byTrack: Record<string, NEvent[]> = {};
  for (const [t, ev] of Object.entries(n.byTrack)) byTrack[t] = cut(ev);
  const { pickup: _p, ...rest } = ctx;
  const bars = Math.max(1, to - from);
  return {
    n: { ...n, byTrack, all: cut(n.all), band: cut(n.band) },
    ctx: { ...(from === 0 && ctx.pickup ? ctx : rest), bars, totalBars: bars },
    from,
  };
}

/** A rule's result moved back to whole-piece bars, its detail prefixed with where it was read. */
export function unscope(e: RuleEval, ref: SectionRef, from: number): RuleEval {
  const where = e.where?.bar !== undefined ? { ...e.where, bar: e.where.bar + from } : e.where;
  const prefix = sectionText(ref);
  return {
    ...e,
    detail: `${prefix.charAt(0).toUpperCase()}${prefix.slice(1)}: ${e.detail}`,
    ...(where ? { where } : {}),
    ...(e.extra
      ? {
          extra: e.extra.map((d) =>
            d.where?.bar !== undefined ? { ...d, where: { ...d.where, bar: d.where.bar + from } } : d,
          ),
        }
      : {}),
  };
}

// --- ends-on-degree `over`, degree-set `anyOf` -------------------------------------------------------------

/**
 * `ends-on-degree` with `over` (C4 "ends on 1 over i"): the chord sounding under the melody's last note is that
 * numeral in the rule's key, compared by root and triad quality (never by string), so Am7 under A minor's 1 is i.
 */
export function endsOverRule(
  over: string,
  lastOnset: Rat,
  n: Normalized,
  ctx: RubricContext,
  melodyTrack: string,
  slotsOf: SlotsOf,
): { ok: boolean; detail: string } {
  const key = keyOf(n.all, ctx.key ?? null);
  if (!key) return { ok: false, detail: "no key to read the last chord in" };
  const parsed = parseRN(over, key);
  if (!parsed) return { ok: false, detail: `"${over}" is not a numeral in ${key.tonic} ${key.mode}` };
  const want = rnToChord(parsed, key);
  const slot = slotAt(slotsOf(n, undefined, { exclude: melodyTrack }), lastOnset);
  const got = slot?.chord ?? null;
  const ok =
    !!got &&
    triadCore(got).rootPc === triadCore(want).rootPc &&
    triadCore(got).quality === triadCore(want).quality;
  const gotText = got
    ? `${romanShown(romanOf({ ...got, bassPc: got.rootPc }, key))} (${toLeadSheet({ ...got, bassPc: got.rootPc })})`
    : "no chord";
  return {
    ok,
    detail: ok
      ? `over ${over} (${toLeadSheet({ ...want, bassPc: want.rootPc })})`
      : `the last note sounds over ${gotText}; end on ${over} (${toLeadSheet({ ...want, bassPc: want.rootPc })}) under it`,
  };
}

/** `degree-set` `anyOf` (C5 "♭3 or ♭5 at least twice"): how many notes of the line fall on one of the degrees. */
export function degreeAnyOf(
  events: readonly NEvent[],
  key: KeySpec,
  anyOf: readonly string[],
  min: number,
): { ok: boolean; count: number; detail: string } {
  const degs = pitched(events).map((e) => degreeOf(e.midi, key).degree as string);
  const count = degs.filter((d) => anyOf.includes(d)).length;
  const names = anyOf.map((d) => d.replace(/^b/, "♭").replace(/^#/, "♯")).join(" or ");
  return {
    ok: count >= min,
    count,
    detail:
      count >= min
        ? `${names} ${count} times`
        : count === 0
          ? `no ${names} in the line yet; use one at least ${min === 1 ? "once" : `${min} times`}`
          : `${names} ${count === 1 ? "once" : `${count} times`}; at least ${min}`,
  };
}

// --- blues-form `choruses`, `quickChangeOk` ----------------------------------------------------------------

const PLAN_NUMERAL: Record<number, string> = {
  0: "I",
  5: "IV",
  7: "V",
  2: "ii",
  9: "vi",
  4: "iii",
  6: "♯iv°",
};

/**
 * `blues-form` (U11.L06, C5): the 12-bar form on the bar-1 tonic (the rule's key's tonic when it has one), as
 * many choruses as asked, the standard form also taking the quick change. A broken bar is named with the
 * numeral it should move to: "bar 5 should move to IV (F7); it stays on I (C7)".
 */
export function bluesFormRule(
  r: RuleOf<"blues-form">,
  n: Normalized,
  ctx: RubricContext,
  slotsOf: SlotsOf,
  windowBarsIn: number,
): RuleEval {
  // With a pickup, bar 1 is cycle 1 (contracts §6.11): the 12 bars are counted from there.
  const shift = ctx.pickup ? 1 : 0;
  const slots = shift
    ? slotsOf(n)
        .filter((s) => R.lt(rat(shift), s.span[1]))
        .map((s) => ({
          ...s,
          span: [R.max(rat(0), R.sub(s.span[0], rat(shift))), R.sub(s.span[1], rat(shift))] as [Rat, Rat],
        }))
    : slotsOf(n);
  const windowBars = Math.max(0, windowBarsIn - shift);
  const firstChord = chordPerBar(slots, 1)[0] ?? null;
  const tonic =
    ctx.key?.tonic ??
    (firstChord
      ? toLeadSheet({ ...firstChord, bassPc: firstChord.rootPc }).replace(/[^A-G#b♯♭].*$/, "")
      : null) ??
    keyOf(n.all, null)?.tonic;
  if (!tonic) return { ok: false, detail: "no harmony found" };
  const k: KeySpec = { tonic: tonic.replace("♯", "#").replace("♭", "b"), mode: "major" };
  const choruses = r.choruses ?? 1;
  const b = bluesForm(slots, k, windowBars);
  const accepted =
    b.variant === r.variant ||
    (r.variant === "standard" && b.variant === "quick-change") ||
    (r.variant === "quick-change" && r.quickChangeOk && b.variant === "standard");
  const ok = accepted && b.choruses >= choruses;
  if (ok)
    return {
      ok,
      value: b.choruses,
      target: choruses,
      detail: `${b.choruses} chorus${b.choruses === 1 ? "" : "es"} of ${b.variant === "quick-change" ? "quick-change" : b.variant} blues`,
    };
  if (accepted || (b.variant !== null && b.wrongBars.length === 0)) {
    const need = choruses * 12;
    return {
      ok: false,
      value: b.choruses,
      target: choruses,
      // A chorus that only repeats the one before reads as the same 12 bars looping (wave 5 gate: two identical
      // choruses written as one 24-step line were told to "play the 12 bars again").
      detail: `${b.choruses} chorus${b.choruses === 1 ? "" : "es"} (${b.choruses * 12} bars); the brief asks for ${choruses} (${need} bars): write the next chorus out with \`arrange([12, …], [12, …])\` and change something in it (the riff, an answer, the drums), since a chorus that only repeats the last one reads as the same 12 bars looping`,
    };
  }
  const bar = b.wrongBars[0];
  if (bar === undefined || windowBars < 12)
    return {
      ok: false,
      value: 0,
      target: choruses,
      detail: `${windowBars} bars; a 12-bar blues needs 12 bars a chorus`,
    };
  const plan = twelveBarPlan({
    variant: r.variant === "quick-change" ? "quick-change" : "standard",
    turnaround: false,
  });
  const want = (plan[(bar - 1) % 12] ?? "I7").replace("7", "");
  const wantSemis = { I: 0, IV: 5, V: 7 }[want as "I" | "IV" | "V"] ?? 0;
  const tonicPc = pcOf(k.tonic);
  const per = chordPerBar(slots, bar)[bar - 1] ?? null;
  // The numeral by root and triad quality: Gm7 on the fifth is v, never V.
  const planNum = per ? PLAN_NUMERAL[mod12(per.rootPc - tonicPc)] : undefined;
  const q = per ? triadCore(per).quality : null;
  const gotNum = per
    ? planNum && /^[IV]+$/.test(planNum) && q !== "maj"
      ? q === "min"
        ? planNum.toLowerCase()
        : q === "dim"
          ? `${planNum.toLowerCase()}°`
          : romanShown(romanOf(per, k))
      : (planNum ?? romanShown(romanOf(per, k)))
    : null;
  const prevWant = bar % 12 === 1 ? null : (plan[(bar - 2) % 12] ?? "").replace("7", "");
  const verb = bar % 12 === 1 ? "be" : prevWant === want ? "stay on" : "move to";
  const rootName = spellMidi(60 + mod12(tonicPc + wantSemis), { key: k }).name.replace(/-?\d+$/, "");
  const wantName = toLeadSheet(chordOf(rootName, "7"));
  const gotName = per ? toLeadSheet({ ...per, bassPc: per.rootPc }) : "no chord";
  const more =
    b.wrongBars.length > 1
      ? ` (and ${b.wrongBars.length - 1} more bar${b.wrongBars.length > 2 ? "s" : ""})`
      : "";
  return {
    ok: false,
    value: 0,
    target: choruses,
    credit: Math.max(0, 1 - b.wrongBars.length / Math.max(12, windowBars)),
    detail: `bar ${bar} should ${verb} ${want} (${wantName}); it ${per ? `is ${gotNum} (${gotName})` : "has no chord"}${more}`,
    where: { bar },
    extra: [
      diag(
        "harmony.blues-bar",
        { bar, exp: `${want} (${wantName})`, got: per ? `${gotNum} (${gotName})` : "no chord" },
        { bar },
      ),
    ],
  };
}
