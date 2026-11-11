// The harmony matcher (exercises §3.5 `compareSlots`, contracts §6.6–§6.7) and the pitch-class-set
// matcher, the only one allowed for `voicing()` output. Chord identity comes from the symbol when the
// events carry one; the bass is the lowest sounding note across all pitched learner tracks.
import type { ChordQuality, Diagnostic, KeySpec, Matcher, NEvent, Rat } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import type { ChordId, RomanNumeral } from "@oak/theory";
import { romanOf, schemaMatch, spellMidi, triadCore } from "@oak/theory";
import type { ChordSlot } from "../analyze/chords.ts";
import { chordSlots, romanText, slotLabel } from "../analyze/chords.ts";
import { locAt, mod12, num, pitched, simultaneities, sounding } from "../analyze/events.ts";
import { keyOf } from "../analyze/key.ts";
import { selectTrack, selectTracks, tracksOfRole } from "../analyze/tracks.ts";
import { diag } from "../feedback/catalog.ts";
import type { MatchResult, NormalizeContext, Normalized } from "../types.ts";
import { alignFeel, clampScore, f1 } from "./common.ts";

export type HarmonyMatcher = Extract<Matcher, { m: "harmony" }>;
export type PcsetMatcher = Extract<Matcher, { m: "pcset" }>;

/** The chord events of a piece (symbol-carrying events, else `@chords`, else every pitched line) and the bass pool. */
export function harmonyEvents(n: Normalized, track?: string): { chords: NEvent[]; bass: NEvent[] } {
  const all = selectTrack(n, track ?? "*");
  const bass = pitched(selectTrack(n, "*"));
  const symbolic = all.filter((e) => e.chordSymbol !== undefined);
  if (symbolic.length > 0) return { chords: symbolic, bass };
  const role = track ? all : tracksOfRole(n, "chords").flatMap((t) => n.byTrack[t] ?? []);
  return { chords: role.length > 0 ? role : all, bass };
}

/** Slots of a piece for the harmony matcher. */
export function slotsOf(n: Normalized, ctx: NormalizeContext, track?: string): ChordSlot[] {
  const { chords, bass } = harmonyEvents(n, track);
  const [c, b] = alignFeel(chords, bass, ctx);
  return chordSlots(c, { bass: b });
}

const SEVENTH_BASE: Partial<Record<ChordQuality, ChordQuality>> = {
  "9": "7",
  "13": "7",
  "7b9": "7",
  "7#9": "7",
  "7#11": "7",
  "7b13": "7",
  "7alt": "7",
  maj9: "maj7",
  "maj7#11": "maj7",
  m9: "m7",
  m11: "m7",
  "69": "6",
  add9: "maj",
};
const seventhOf = (q: ChordQuality): ChordQuality => SEVENTH_BASE[q] ?? q;
/** The added tone above the triad: 11 (maj7), 10 (7), 9 (6 or dim7), or null for a plain triad. */
function addedTone(q: ChordQuality): number | null {
  const base = seventhOf(q);
  if (["maj7", "mMaj7"].includes(base)) return 11;
  if (["7", "m7", "m7b5", "7sus4"].includes(base)) return 10;
  if (["6", "m6", "dim7"].includes(base)) return 9;
  return null;
}
/**
 * Quality credit (exercises §3.5 step 2): 1 for the same quality at the requested depth; 0.5 for the same
 * triad with a different 7th or 6th (7 vs maj7 vs 6; m7 vs m6), or the same 7th over a different triad
 * (m7 vs m7b5); 0 otherwise. Extensions count only at depth `extended`.
 */
export function qualityCredit(a: ChordId, b: ChordId, depth: HarmonyMatcher["qualityDepth"]): number {
  const ta = triadCore(a).quality;
  const tb = triadCore(b).quality;
  if (depth === "triad") return ta === tb ? 1 : 0;
  const qa = depth === "extended" ? a.quality : seventhOf(a.quality);
  const qb = depth === "extended" ? b.quality : seventhOf(b.quality);
  if (qa === qb) return 1;
  if (ta === tb) return 0.5;
  const xa = addedTone(qa);
  if (xa !== null && xa === addedTone(qb)) return 0.5;
  return 0;
}

/** Which chord member is in the bass. */
export function bassMember(c: ChordId): "root" | "3rd" | "5th" | "7th" | "other" {
  const d = mod12(c.bassPc - c.rootPc);
  if (d === 0) return "root";
  if (d === 3 || d === 4) return "3rd";
  if (d === 6 || d === 7 || d === 8) return "5th";
  if (d === 9 || d === 10 || d === 11) return "7th";
  return "other";
}
const QUALITY_WORDS: Partial<Record<ChordQuality, string>> = {
  maj: "major",
  min: "minor",
  dim: "diminished",
  aug: "augmented",
  maj7: "major 7th",
  "7": "dominant 7th",
  m7: "minor 7th",
  m7b5: "half-diminished",
  dim7: "diminished 7th",
  sus4: "sus4",
  sus2: "sus2",
};
export const qualityWord = (q: ChordQuality): string => QUALITY_WORDS[q] ?? q;
const pcName = (pc: number, key: KeySpec | null): string =>
  spellMidi(60 + mod12(pc), { key }).name.replace(/-?\d+$/, "");

const LEVEL_WEIGHTS: Record<
  HarmonyMatcher["level"],
  Partial<Record<"bass" | "root" | "quality" | "inversion", number>>
> = {
  bass: { bass: 1 },
  root: { bass: 0.5, root: 0.5 },
  quality: { bass: 0.35, root: 0.35, quality: 0.3 },
  rn: { bass: 0.3, root: 0.3, quality: 0.25, inversion: 0.15 },
  full: { bass: 0.3, root: 0.3, quality: 0.25, inversion: 0.15 },
};

const overlap = (a: readonly [Rat, Rat], b: readonly [Rat, Rat]): number => {
  const from = R.max(a[0], b[0]);
  const to = R.min(a[1], b[1]);
  return R.lt(from, to) ? num(R.sub(to, from)) : 0;
};

/**
 * Compares answer chord slots with target slots (exercises §3.5 `compareSlots`): each target slot takes
 * the answer slot with the largest overlap (< 50% → `harmony.missing-chord`), then bass, root, quality and
 * inversion are scored per slot and folded with the level's weights, duration-weighted over the target.
 */
export function compareSlots(
  t: readonly ChordSlot[],
  a: readonly ChordSlot[],
  cfg: HarmonyMatcher,
  key: KeySpec | null,
  ctx: NormalizeContext,
): MatchResult {
  const base = { ...LEVEL_WEIGHTS[cfg.level], ...(cfg.weights ?? {}) };
  if (!cfg.inversion) delete base.inversion;
  const pos = { meter: ctx.meter, ...(ctx.pickup ? { pickup: ctx.pickup } : {}) };
  // Numerals in messages carry inversion figures only when the inversion is graded.
  const rnLabel = (rn: RomanNumeral): string => romanText(cfg.inversion ? rn : { ...rn, inversion: 0 });
  const diagnostics: Diagnostic[] = [];
  const sums = { bass: 0, root: 0, quality: 0, inversion: 0, rn: 0 };
  let totalDur = 0;
  let scoreSum = 0;
  const used = new Set<number>();
  const overlayAnswer: { id: string; ok: boolean }[] = [];
  const missing: NEvent[] = [];
  t.forEach((ts, i) => {
    const dur = num(R.sub(ts.span[1], ts.span[0]));
    totalDur += dur;
    let best = -1;
    let bestOv = 0;
    a.forEach((as, j) => {
      const ov = overlap(ts.span, as.span);
      if (ov > bestOv + 1e-12) {
        bestOv = ov;
        best = j;
      }
    });
    const slotNo = i + 1;
    const where = locAt(ts.span[0], pos, { slot: slotNo });
    const as = best >= 0 ? a[best] : undefined;
    if (!as || bestOv < 0.5 * dur || !ts.chord) {
      if (ts.chord) diagnostics.push(diag("harmony.missing-chord", {}, where, "harmonicRhythm"));
      return;
    }
    used.add(best);
    const tc = ts.chord;
    const ac = as.chord;
    if (!ac) {
      diagnostics.push(diag("harmony.missing-chord", {}, where, "harmonicRhythm"));
      return;
    }
    const s = {
      bass: tc.bassPc === ac.bassPc ? 1 : 0,
      root: tc.rootPc === ac.rootPc ? 1 : 0,
      quality: qualityCredit(tc, ac, cfg.qualityDepth),
      inversion: bassMember(tc) === bassMember(ac) ? 1 : 0,
      rn: 0,
    };
    if (key) {
      const rt = romanOf(tc, key);
      const ra = romanOf(ac, key);
      s.rn =
        rt.degree === ra.degree &&
        rt.alt === ra.alt &&
        triadCore(tc).quality === triadCore(ac).quality &&
        !!rt.of === !!ra.of
          ? 1
          : 0;
    } else s.rn = s.root * (triadCore(tc).quality === triadCore(ac).quality ? 1 : 0);
    let w = 0;
    let v = 0;
    for (const [k, wt] of Object.entries(base) as ["bass" | "root" | "quality" | "inversion", number][]) {
      v += s[k] * wt;
      w += wt;
    }
    const slotScore = w === 0 ? 0 : v / w;
    scoreSum += slotScore * dur;
    for (const k of Object.keys(sums) as (keyof typeof sums)[]) sums[k] += s[k] * dur;
    for (const id of as.ids) overlayAnswer.push({ id, ok: slotScore >= 0.999 });

    const wants = (k: string): boolean => k in base;
    const atBar = { ...where, ...(as.ids.length ? { noteIds: as.ids } : {}) };
    const bar = where.bar ?? 0;
    if (wants("bass") && !s.bass && (s.root || !wants("root")) && (s.quality === 1 || !wants("quality")))
      diagnostics.push(
        diag(
          "harmony.bass",
          { got: pcName(ac.bassPc, key), exp: pcName(tc.bassPc, key), bar },
          atBar,
          "bass",
        ),
      );
    if (wants("root") && !s.root) {
      if (key && (cfg.level === "rn" || cfg.level === "full"))
        diagnostics.push(
          diag("harmony.rn", { got: rnLabel(romanOf(ac, key)), exp: rnLabel(romanOf(tc, key)) }, atBar, "rn"),
        );
      else
        diagnostics.push(
          diag("harmony.root", { got: pcName(ac.rootPc, key), exp: pcName(tc.rootPc, key) }, atBar, "root"),
        );
    } else if (wants("quality") && s.quality < 1) {
      const tq = triadCore(tc).quality;
      const aq = triadCore(ac).quality;
      const rnA = key ? romanOf(ac, key) : null;
      const rnT = key ? romanOf(tc, key) : null;
      const caseOnly =
        !!rnA &&
        !!rnT &&
        !rnA.of &&
        !rnT.of &&
        rnA.degree === rnT.degree &&
        rnA.alt === rnT.alt &&
        ((tq === "maj" && aq === "min") || (tq === "min" && aq === "maj"));
      if ((cfg.level === "rn" || cfg.level === "full") && rnA && rnT && caseOnly)
        diagnostics.push(diag("harmony.rn-case", { got: rnLabel(rnA), exp: rnLabel(rnT) }, atBar, "quality"));
      else if ((cfg.level === "rn" || cfg.level === "full") && rnA && rnT)
        diagnostics.push(diag("harmony.rn", { got: rnLabel(rnA), exp: rnLabel(rnT) }, atBar, "rn"));
      else
        diagnostics.push(
          diag(
            "harmony.quality",
            { root: pcName(tc.rootPc, key), got: qualityWord(ac.quality), exp: qualityWord(tc.quality) },
            atBar,
            "quality",
          ),
        );
    } else if (wants("inversion") && !s.inversion && s.root)
      diagnostics.push(diag("harmony.inversion", { member: bassMember(tc) }, atBar, "inversion"));
  });

  // Extra changes in the answer (only when the harmonic rhythm is graded).
  const dims: MatchResult["dims"] = {};
  if (cfg.harmonicRhythm === "graded") {
    const tOn = t.map((s) => s.span[0]);
    const aOn = a.map((s) => s.span[0]);
    let matched = 0;
    for (const x of aOn) if (tOn.some((y) => R.eq(x, y))) matched++;
    dims.harmonicRhythm = { score: f1(matched, tOn.length, aOn.length), weight: 0.15, n: tOn.length };
    a.forEach((as, j) => {
      if (used.has(j) || tOn.some((y) => R.eq(y, as.span[0]))) return;
      diagnostics.push(diag("harmony.extra-chord", {}, locAt(as.span[0], pos), "harmonicRhythm"));
    });
  }
  const norm = (x: number): number => (totalDur === 0 ? 0 : x / totalDur);
  for (const k of ["bass", "root", "quality", "inversion"] as const)
    if (k in base) dims[k] = { score: norm(sums[k]), weight: base[k] as number, n: t.length };
  dims.rn = { score: norm(sums.rn), weight: 0, n: t.length };

  // A rotation of the right loop.
  if (key && t.length >= 2 && a.length === t.length) {
    const sig = (s: ChordSlot): string =>
      s.chord ? `${triadCore(s.chord).rootPc}${triadCore(s.chord).quality}` : "?";
    const ts = t.map(sig);
    const as = a.map(sig);
    if (ts.join() !== as.join())
      for (let r = 1; r < ts.length; r++)
        if (as.every((x, i) => x === ts[(i + r) % ts.length])) {
          const found = schemaMatch(
            t.map((s) => (s.chord ? romanOf(s.chord, key) : null)).filter((x) => x !== null),
          );
          diagnostics.push(
            diag("harmony.schema-rotation", { schema: found?.schema.title ?? "the loop" }, undefined, "rn"),
          );
          break;
        }
  }
  let score = totalDur === 0 ? (a.length === 0 ? 1 : 0) : scoreSum / totalDur;
  if (dims.harmonicRhythm) score = score * 0.85 + dims.harmonicRhythm.score * 0.15;
  return { score: clampScore(score), dims, diagnostics, overlay: { answer: overlayAnswer, missing } };
}

/** The harmony matcher on two pieces. */
export function harmonyMatch(
  reference: Normalized,
  answer: Normalized,
  cfg: HarmonyMatcher,
  ctx: NormalizeContext,
): MatchResult {
  const t = slotsOf(reference, ctx);
  const a = slotsOf(answer, ctx);
  const key = keyOf(selectTrack(reference, "*"), ctx.key ?? null);
  if (a.length === 0 && t.length > 0)
    return {
      score: 0,
      dims: { root: { score: 0, weight: 1 } },
      diagnostics: [diag("harmony.no-chords", {}, undefined, "root")],
    };
  return compareSlots(t, a, cfg, key, ctx);
}

/** Label for messages and the analysis summary: "Am" plus its numeral. */
export const slotText = (s: ChordSlot, key: KeySpec | null): string =>
  key && s.chord ? `${slotLabel(s)} (${romanText(romanOf(s.chord, key))})` : slotLabel(s);

/**
 * Pitch-class sets per onset (or per target chord slot): the only matcher for `voicing()` output, which
 * differs between Strudel versions in octave, top note and note count (contracts §6.7 item 1). Per onset:
 * 0.75 for the same pc-set (+ 0.25 for the same bass pc when `bass`), partial Jaccard credit otherwise.
 */
export function pcsetMatch(
  reference: Normalized,
  answer: Normalized,
  cfg: PcsetMatcher,
  ctx: NormalizeContext,
): MatchResult {
  const [tEv, aEv] = alignFeel(selectTracks(reference, cfg.tracks), selectTracks(answer, cfg.tracks), ctx);
  const tp = pitched(tEv);
  const ap = pitched(aEv);
  const key = keyOf(tp, ctx.key ?? null);
  const pos = { meter: ctx.meter, ...(ctx.pickup ? { pickup: ctx.pickup } : {}) };
  const points: Rat[] = cfg.perOnset
    ? simultaneities(tp).map((s) => s.onset)
    : chordSlots(tp).map((s) => s.span[0]);
  const diagnostics: Diagnostic[] = [];
  const pcsAt = (ev: readonly NEvent[], at: Rat): number[] =>
    [...new Set(sounding(ev, at).map((e) => mod12(e.midi)))].sort((x, y) => x - y);
  const bassAt = (ev: readonly NEvent[], at: Rat): number | null => {
    const s = sounding(ev, at);
    return s.length === 0 ? null : mod12(Math.min(...s.map((e) => e.midi)));
  };
  let sum = 0;
  let pcsOk = 0;
  let bassOk = 0;
  const overlayAnswer: { id: string; ok: boolean }[] = [];
  const missing: NEvent[] = [];
  for (const at of points) {
    const want = pcsAt(tp, at);
    const got = pcsAt(ap, at);
    const inter = want.filter((p) => got.includes(p)).length;
    const union = new Set([...want, ...got]).size;
    const same = inter === want.length && want.length === got.length;
    const bassSame = bassAt(tp, at) === bassAt(ap, at);
    const pcsCredit = same ? 1 : union === 0 ? 0 : inter / union;
    const credit = cfg.bass
      ? 0.75 * (same ? 1 : pcsCredit * 0.5) + 0.25 * (bassSame ? 1 : 0)
      : same
        ? 1
        : pcsCredit * 0.5;
    sum += credit;
    if (same) pcsOk++;
    if (bassSame) bassOk++;
    const where = locAt(at, pos);
    const ids = sounding(ap, at)
      .filter((e) => R.eq(e.onset, at))
      .map((e) => e.id);
    for (const id of ids) overlayAnswer.push({ id, ok: same && (!cfg.bass || bassSame) });
    if (!same) {
      missing.push(...sounding(tp, at).filter((e) => R.eq(e.onset, at) && !got.includes(mod12(e.midi))));
      diagnostics.push(
        diag(
          "harmony.pcset",
          {
            got: got.map((p) => pcName(p, key)).join(" ") || "nothing",
            exp: want.map((p) => pcName(p, key)).join(" "),
          },
          { ...where, ...(ids.length ? { noteIds: ids } : {}) },
          "quality",
        ),
      );
    } else if (cfg.bass && !bassSame) {
      const gb = bassAt(ap, at);
      const tb = bassAt(tp, at);
      diagnostics.push(
        diag(
          "harmony.bass",
          {
            got: gb === null ? "nothing" : pcName(gb, key),
            exp: tb === null ? "?" : pcName(tb, key),
            bar: where.bar ?? 0,
          },
          where,
          "bass",
        ),
      );
    }
  }
  // Answer onsets where the target has no chord count against the answer.
  const extraOnsets = simultaneities(ap).filter(
    (s) => !points.some((p) => R.eq(p, s.onset)) && sounding(tp, s.onset).length === 0,
  );
  const n = points.length + extraOnsets.length;
  const score = n === 0 ? (ap.length === 0 ? 1 : 0) : sum / n;
  const dims: MatchResult["dims"] = {
    quality: {
      score: points.length ? pcsOk / points.length : 1,
      weight: cfg.bass ? 0.75 : 1,
      n: points.length,
    },
  };
  if (cfg.bass)
    dims.bass = { score: points.length ? bassOk / points.length : 1, weight: 0.25, n: points.length };
  return { score: clampScore(score), dims, diagnostics, overlay: { answer: overlayAnswer, missing } };
}
