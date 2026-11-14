// The harmony matcher (exercises §3.5 `compareSlots`, contracts §6.6–§6.7) and the pitch-class-set
// matcher, the only one allowed for `voicing()` output. Chord identity comes from the symbol when the
// events carry one; the bass is the lowest sounding note across all pitched learner tracks.
import type { ChordQuality, Diagnostic, KeySpec, Matcher, NEvent, Rat } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import type { ChordId, RomanNumeral } from "@oak/theory";
import {
  chordNotes,
  chordOf,
  chordPcs,
  noteToMidi,
  parseChordSymbol,
  readChord,
  romanOf,
  schemaMatch,
  spellMidi,
  triadCore,
} from "@oak/theory";
import type { ChordSlot } from "../analyze/chords.ts";
import { chordSlots, romanShown, romanText, slotLabel } from "../analyze/chords.ts";
import { locAt, mod12, num, pitched, simultaneities, sounding } from "../analyze/events.ts";
import { keyOf } from "../analyze/key.ts";
import { selectTrack, selectTracks, tracksOfRole } from "../analyze/tracks.ts";
import { pushesOf } from "../analyze/wave6-views.ts";
import { diag } from "../feedback/catalog.ts";
import type { MatchResult, NormalizeContext, Normalized } from "../types.ts";
import { alignFeel, clampScore, f1, keyAtOnset, noteValueLabel, shiftLabel } from "./common.ts";

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

/**
 * The root a diminished 7th is named on (its four notes are a minor 3rd apart, so no note is its root by sound):
 * the one whose spelling needs the fewest notes outside the key's own spelling, then the bass, then the reading's
 * own. With D in the bass: B D F A♭ in C, G♯ B D F in A minor, never D F A♭ C♭ (U12.L03). An augmented triad
 * keeps the reading's root (the bass), as the learner most often writes it.
 */
function symmetricRoot(
  reading: { chord: { rootPc: number }; quality: ChordQuality },
  set: readonly number[],
  bassPc: number | null,
  key: KeySpec | null,
): number {
  if (reading.quality !== "dim7") return reading.chord.rootPc;
  const cost = (root: number): number => {
    const c = chordOf(pcName(root, key), reading.quality);
    const names = chordNotes(c);
    const pcs = chordPcs(c) as number[];
    return names.reduce(
      (n, name, i) => n + (/(bb|##|x)$/.test(name) ? 2 : name === pcName(pcs[i] ?? 0, key) ? 0 : 1),
      0,
    );
  };
  const ranked = [...set].sort(
    (a, b) =>
      cost(a) - cost(b) ||
      Number(b === bassPc) - Number(a === bassPc) ||
      Number(b === reading.chord.rootPc) - Number(a === reading.chord.rootPc),
  );
  return ranked[0] ?? reading.chord.rootPc;
}

/**
 * The notes of a sounding chord, named as the chord they make: root first and spelled by that chord (C E G♯
 * for C+, B D♯ F♯ for B major), the root spelled by the key. Pitch classes that make no readable chord are
 * spelled by the key, in ascending order. "nothing" for an empty set.
 */
export function spellChordPcs(pcs: readonly number[], bassPc: number | null, key: KeySpec | null): string {
  const set = [...new Set(pcs.map(mod12))].sort((a, b) => a - b);
  if (set.length === 0) return "nothing";
  const reading = set.length >= 2 ? readChord(set, bassPc ?? (set[0] as number)) : null;
  if (reading) {
    const chord = chordOf(pcName(symmetricRoot(reading, set, bassPc, key), key), reading.quality);
    const names = chordNotes(chord);
    const pcsOf = chordPcs(chord) as number[];
    const ordered = pcsOf.map((pc, i) => ({ pc, name: names[i] })).filter((x) => set.includes(x.pc));
    if (ordered.length === set.length && ordered.every((x) => x.name !== undefined))
      return ordered.map((x) => x.name).join(" ");
  }
  return set.map((p) => pcName(p, key)).join(" ");
}

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
/**
 * A target chord held over several bars is compared bar by bar wherever the answer changes chord on a bar line
 * inside it (wave 5 gate: Careless Love with bars 2–3 written as B♭ under a four-bar F scored 0.966, and the wrong
 * bars were never named). A target with no change inside it is left whole, so right answers score as before.
 */
export function splitAtAnswerBars(t: readonly ChordSlot[], a: readonly ChordSlot[]): ChordSlot[] {
  const out: ChordSlot[] = [];
  for (const ts of t) {
    const cuts = a
      .map((s) => s.span[0])
      .filter((x) => R.lt(ts.span[0], x) && R.lt(x, ts.span[1]) && R.eq(x, [R.floor(x), 1]))
      .sort((x, y) => num(x) - num(y))
      .filter((x, i, xs) => i === 0 || !R.eq(x, xs[i - 1] as Rat));
    if (cuts.length === 0) {
      out.push(ts);
      continue;
    }
    let from = ts.span[0];
    for (const c of [...cuts, ts.span[1]]) {
      out.push({ ...ts, span: [from, c] });
      from = c;
    }
  }
  return out;
}

/** Every reference slot cut at the bar lines inside it: one slot per bar (and per change inside a bar). */
export function splitAtBars(t: readonly ChordSlot[]): ChordSlot[] {
  const out: ChordSlot[] = [];
  for (const ts of t) {
    let from = ts.span[0];
    for (let b = R.floor(ts.span[0]) + 1; R.lt([b, 1], ts.span[1]); b++) {
      out.push({ ...ts, span: [from, [b, 1]] });
      from = [b, 1];
    }
    out.push({ ...ts, span: [from, ts.span[1]] });
  }
  return out;
}

/**
 * The answer is the reference's plain triad with a 7th or a 6th added (F7 where the key has F): not one of the
 * two faults d11 names (a minor chord for a dominant; a plain triad for a seventh chord), so it keeps the partial
 * credit it always had.
 */
function addsSeventhOnly(target: ChordId, answer: ChordId): boolean {
  const plain = ["maj", "min", "dim", "aug"].includes(seventhOf(target.quality));
  return plain && triadCore(target).quality === triadCore(answer).quality;
}

export function compareSlots(
  tIn: readonly ChordSlot[],
  a: readonly ChordSlot[],
  cfg: HarmonyMatcher,
  pieceKey: KeySpec | null,
  ctx: NormalizeContext,
): MatchResult {
  const key = pieceKey;
  // Numeral-level reading (the L3/L6 ladder, X2's changes, numeral steps): per bar where the answer changes.
  const byNumeral = cfg.level === "rn" || cfg.level === "full";
  const strict = cfg.wrongQuality === "none";
  // With `wrongQuality: "none"` every bar is judged on its own ("changes ≥ 0.85 per bar", contracts §6.6): a
  // reference chord held over several bars is one slot per bar, so the first wrong bar is the one named.
  const t = strict ? splitAtBars(tIn) : byNumeral ? splitAtAnswerBars(tIn, a) : tIn;
  const base = { ...LEVEL_WEIGHTS[cfg.level], ...(cfg.weights ?? {}) };
  if (!cfg.inversion) delete base.inversion;
  // A part weighted 0 is not graded at all (no credit and no message): X2's changes leave the bass to its own check.
  for (const k of Object.keys(base) as (keyof typeof base)[]) if (base[k] === 0) delete base[k];
  const pos = { meter: ctx.meter, ...(ctx.pickup ? { pickup: ctx.pickup } : {}) };
  // Numerals in messages carry inversion figures only when the inversion is graded.
  const rnLabel = (rn: RomanNumeral): string => romanShown(cfg.inversion ? rn : { ...rn, inversion: 0 });
  // At triad depth a chord is read on its triad core, so an applied reading never names it: C7 in C is I7 (a
  // blues' I7), not V7/IV. The quality (the 7) is kept for the label.
  // At seventh depth the same holds for a chord whose triad is the key's own (a blues' I7 and IV7 stay I7 and IV7);
  // a chord from outside the key (D7 in C) keeps its applied name, V7/V.
  const rnFor = (c: ChordId, k: KeySpec): RomanNumeral => {
    const rn = romanOf(c, k);
    if (!rn.of) return rn;
    const core = romanOf({ ...c, quality: triadCore(c).quality }, k);
    if (cfg.qualityDepth !== "triad" && core.of) return rn;
    return { ...core, quality: c.quality };
  };
  const diagnostics: Diagnostic[] = [];
  const sums = { bass: 0, root: 0, quality: 0, inversion: 0, rn: 0 };
  let totalDur = 0;
  let scoreSum = 0;
  // Per slot of `t`: its credit (0 until a matching answer slot earns more) and its length, for the per-bar score.
  const slotCredit: number[] = t.map(() => 0);
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
    // Wave 6 (`key-plan`): each bar's numerals are read in the key in force there.
    const key = keyAtOnset(ctx, ts.span[0], pieceKey);
    const tc = ts.chord;
    const ac = as.chord;
    if (!ac) {
      diagnostics.push(diag("harmony.missing-chord", {}, where, "harmonicRhythm"));
      return;
    }
    const rootOk = tc.rootPc === ac.rootPc;
    // Reading numerals, a chord on the wrong root is a wrong numeral: its quality and inversion earn nothing
    // (wave 5 gate: Frankie and Johnny with bars 9–10 as F F for G7 G7 kept 0.45 a slot and passed at 0.909).
    const s = {
      bass: tc.bassPc === ac.bassPc ? 1 : 0,
      root: rootOk ? 1 : 0,
      quality: byNumeral && !rootOk ? 0 : qualityCredit(tc, ac, cfg.qualityDepth),
      inversion: byNumeral && !rootOk ? 0 : bassMember(tc) === bassMember(ac) ? 1 : 0,
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
    // d11 (`wrongQuality: "none"`; L6, X2, L8 and CF-T changes): the right root with the wrong quality earns
    // nothing for its bar: a minor chord for a dominant, a plain triad where the reference has a seventh.
    const wrongQuality = strict && rootOk && "quality" in base && s.quality < 1 && !addsSeventhOnly(tc, ac);
    const slotScore = wrongQuality ? 0 : w === 0 ? 0 : v / w;
    if (wrongQuality) {
      s.quality = 0;
      s.inversion = 0;
    }
    scoreSum += slotScore * dur;
    slotCredit[i] = slotScore;
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
          diag("harmony.rn", { got: rnLabel(rnFor(ac, key)), exp: rnLabel(rnFor(tc, key)) }, atBar, "rn"),
        );
      else
        diagnostics.push(
          diag("harmony.root", { got: pcName(ac.rootPc, key), exp: pcName(tc.rootPc, key) }, atBar, "root"),
        );
    } else if (wants("quality") && s.quality < 1) {
      const tq = triadCore(tc).quality;
      const aq = triadCore(ac).quality;
      const rnA = key ? rnFor(ac, key) : null;
      const rnT = key ? rnFor(tc, key) : null;
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
      else if (strict && rnA && rnT && tq === aq)
        // The same triad with another 7th (or none): "right degree, but V7 is a dominant 7th, not major (V)".
        diagnostics.push(
          diag(
            "harmony.rn-quality",
            {
              got: rnLabel(rnA),
              exp: rnLabel(rnT),
              gotQ: qualityWord(seventhOf(ac.quality)),
              expQ: qualityWord(seventhOf(tc.quality)),
            },
            atBar,
            "quality",
          ),
        );
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
    const tOn = tIn.map((s) => s.span[0]);
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
    if (k in base) dims[k] = { score: norm(sums[k]), weight: base[k] as number, n: tIn.length };
  dims.rn = { score: norm(sums.rn), weight: 0, n: tIn.length };

  // A rotation of the right loop.
  if (key && tIn.length >= 2 && a.length === tIn.length) {
    const sig = (s: ChordSlot): string =>
      s.chord ? `${triadCore(s.chord).rootPc}${triadCore(s.chord).quality}` : "?";
    const ts = tIn.map(sig);
    const as = a.map(sig);
    if (ts.join() !== as.join())
      for (let r = 1; r < ts.length; r++)
        if (as.every((x, i) => x === ts[(i + r) % ts.length])) {
          const found = schemaMatch(
            tIn.map((s) => (s.chord ? romanOf(s.chord, key) : null)).filter((x) => x !== null),
          );
          diagnostics.push(
            diag("harmony.schema-rotation", { schema: found?.schema.title ?? "the loop" }, undefined, "rn"),
          );
          break;
        }
  }
  if (strict) {
    // d11 with contracts §6.6 "changes ≥ 0.85 per bar" (CF.md): a bar counts when EVERY chord in it is right, so
    // one wrong chord of a two-chord bar costs the bar, not half of it (Bye Bye Blackbird bar 25). `t` is already
    // cut at the bar lines, so each slot belongs to exactly one bar.
    const bars = new Map<number, { credit: number; dur: number }>();
    t.forEach((ts, i) => {
      const bar = R.floor(ts.span[0]);
      const b = bars.get(bar) ?? { credit: 1, dur: 0 };
      b.credit = Math.min(b.credit, slotCredit[i] ?? 0);
      b.dur += num(R.sub(ts.span[1], ts.span[0]));
      bars.set(bar, b);
    });
    scoreSum = [...bars.values()].reduce((sum, b) => sum + b.credit * b.dur, 0);
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
  const r = compareSlots(t, a, cfg, key, ctx);
  return key && r.score < 0.85 ? namedTransposition(t, a, key, r) : r;
}

/**
 * The right changes in another key (Careless Love's F C7 F F … written as G D7 G G …): one message that names the
 * key and the move, in place of a wrong numeral on every bar. The score stays the per-bar one.
 */
function namedTransposition(
  t: readonly ChordSlot[],
  a: readonly ChordSlot[],
  key: KeySpec,
  r: MatchResult,
): MatchResult {
  const judged = t.filter((x) => x.chord);
  if (judged.length < 2) return r;
  const answerAt = (ts: ChordSlot): ChordSlot | undefined => {
    let best: ChordSlot | undefined;
    let bestOv = 0;
    for (const as of a) {
      const ov = overlap(ts.span, as.span);
      if (ov > bestOv + 1e-12) {
        bestOv = ov;
        best = as;
      }
    }
    return best;
  };
  for (let k = 1; k < 12; k++) {
    const fits = judged.filter((ts) => {
      const ac = answerAt(ts)?.chord;
      const tc = ts.chord as ChordId;
      return !!ac && mod12(ac.rootPc - k) === tc.rootPc && triadCore(ac).quality === triadCore(tc).quality;
    }).length;
    if (fits / judged.length < 0.9) continue;
    const up = k <= 6;
    const semis = up ? k : 12 - k;
    const tonic = spellMidi(60 + mod12(pcOfName(key.tonic) + k), { key: null }).name.replace(/-?\d+$/, "");
    const moved = diag(
      "harmony.transposed",
      {
        gotKey: `${tonic} ${key.mode}`,
        expKey: `${key.tonic} ${key.mode}`,
        semis: `${semis} half step${semis === 1 ? "" : "s"}`,
        dir: up ? "down" : "up",
      },
      undefined,
      "rn",
    );
    const perBar = new Set([
      "harmony.rn",
      "harmony.root",
      "harmony.rn-case",
      "harmony.quality",
      "harmony.bass",
    ]);
    return { ...r, diagnostics: [moved, ...r.diagnostics.filter((d) => !perBar.has(d.id))] };
  }
  return r;
}
const pcOfName = (name: string): number => mod12((noteToMidi(`${name}4`) ?? 60) - 60);

/** Label for messages and the analysis summary: "Am" plus its numeral. */
export const slotText = (s: ChordSlot, key: KeySpec | null): string =>
  key && s.chord ? `${slotLabel(s)} (${romanText(romanOf(s.chord, key))})` : slotLabel(s);

const PUSH_WORD: Record<8 | 16, string> = { 8: "an eighth note", 16: "a sixteenth note" };
/**
 * The answer is the target moved in time by one constant amount (every chord, pitch classes intact): the finding
 * that says so, with the two pushes named when both lines anticipate the beat ("your push lands a sixteenth note
 * early; the step asks for an eighth note"). `null` when the chords themselves differ.
 */
function shiftedChords(
  tp: readonly (NEvent & { midi: number })[],
  ap: readonly (NEvent & { midi: number })[],
  points: readonly Rat[],
  pcsAt: (ev: readonly NEvent[], at: Rat) => number[],
  ctx: NormalizeContext,
): Diagnostic | null {
  const aOn = simultaneities(ap).map((x) => x.onset);
  if (points.length < 2 || aOn.length < 2) return null;
  // Candidate shifts: the first answer chords against the first target chords (a pushed line has no chord at the
  // very start, so the two lists may be one apart).
  const candidates: Rat[] = [];
  for (const a of aOn.slice(0, 2)) for (const t of points.slice(0, 2)) candidates.push(R.sub(a, t));
  for (const shift of candidates) {
    if (shift[0] === 0 || Math.abs(num(shift)) >= 1) continue;
    let fits = 0;
    let judged = 0;
    // Chords moved out of the compared bars (before the first, past the last) are not judged.
    const end = [...tp, ...ap].reduce((m, e) => Math.max(m, R.floor(e.onset) + 1), 1);
    for (const t of points) {
      const at = R.add(t, shift);
      if (R.lt(at, [0, 1]) || !R.lt(at, [end, 1])) continue;
      judged++;
      const want = pcsAt(tp, t);
      const got = pcsAt(ap, at);
      if (aOn.some((x) => R.eq(x, at)) && want.length === got.length && want.every((p) => got.includes(p)))
        fits++;
    }
    if (judged < 2 || fits / judged < 0.8) continue;
    const mine = pushesOf(ap, ctx.meter)[0]?.by;
    const theirs = pushesOf(tp, ctx.meter)[0]?.by;
    const push =
      mine && theirs && mine !== theirs
        ? ` (your push lands ${PUSH_WORD[mine]} early; the step asks for ${PUSH_WORD[theirs]})`
        : "";
    return diag(
      "harmony.shifted",
      { shift: shiftLabel(shift, ctx.meter), push },
      locAt(R.add(points[0] as Rat, shift), ctx),
      "rhythm",
    );
  }
  return null;
}

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
    let credit = cfg.bass
      ? 0.75 * (same ? 1 : pcsCredit * 0.5) + 0.25 * (bassSame ? 1 : 0)
      : same
        ? 1
        : pcsCredit * 0.5;
    // Corrections pass (`durations`): the chord also lasts as the target's does. Halfway through the target chord
    // the answer still sounds the same notes; a stab cut to 1% of the bar is not the bar's chord (theory-f).
    if (cfg.durations && same) {
      const endOf = (ev: readonly NEvent[]): Rat =>
        ev
          .filter((e) => R.eq(e.onset, at))
          .reduce((m, e) => R.max(m, R.add(e.onset, e.clipDur ?? e.dur)), at);
      const tEnd = endOf(tp);
      const mid = R.add(at, R.div(R.sub(tEnd, at), [2, 1]));
      const wantMid = pcsAt(tp, mid);
      if (R.lt(at, tEnd) && wantMid.join() === want.join() && pcsAt(ap, mid).join() !== want.join()) {
        credit *= 0.5;
        diagnostics.push(
          diag(
            "rhythm.duration",
            {
              got: noteValueLabel(R.sub(endOf(ap), at), ctx.meter),
              expected: noteValueLabel(R.sub(tEnd, at), ctx.meter),
            },
            locAt(at, pos),
            "duration",
          ),
        );
      }
    }
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
      const params = {
        got: spellChordPcs(got, bassAt(ap, at), key),
        exp: spellChordPcs(want, bassAt(tp, at), key),
      };
      // A chord struck several times in a bar (a Rhodes `.struct("x x x")`) is one finding for that bar: the
      // later strokes add their notes to the first finding's marks instead of repeating its sentence (U14.L03).
      const again = diagnostics.find(
        (d) =>
          d.id === "harmony.pcset" &&
          d.where?.bar === where.bar &&
          d.params?.got === params.got &&
          d.params?.exp === params.exp,
      );
      if (again) {
        if (ids.length && again.where)
          again.where = { ...again.where, noteIds: [...(again.where.noteIds ?? []), ...ids] };
      } else
        diagnostics.push(
          diag("harmony.pcset", params, { ...where, ...(ids.length ? { noteIds: ids } : {}) }, "quality"),
        );
    } else if (cfg.bass && !bassSame) {
      const gb = bassAt(ap, at);
      const tb = bassAt(tp, at);
      // The right notes on another root (a diminished 7th is four chords in one): name the root the chord is
      // written on as well as its lowest note, so "bass is E♭" is not read as "you wrote E♭°7" (gate leftover).
      const sym = sounding(ap, at).find((e) => e.chordSymbol)?.chordSymbol;
      const root = sym ? parseChordSymbol(sym)?.rootPc : undefined;
      const onRoot =
        gb !== null && root !== undefined && root !== null && mod12(root) !== gb && mod12(root) !== tb
          ? ` (your chord is built on ${pcName(mod12(root), key)})`
          : "";
      diagnostics.push(
        diag(
          "harmony.bass",
          {
            got: gb === null ? "nothing" : `${pcName(gb, key)}${onRoot}`,
            exp: tb === null ? "?" : pcName(tb, key),
            bar: where.bar ?? 0,
          },
          where,
          "bass",
        ),
      );
    }
  }
  // The right chords at another time (U13: `.early(1/16)` where the step asks for `.early(1/8)`): one finding
  // that says how far off they are, ahead of the per-onset ones (of which the first stays, as a note).
  // A push of the wrong size can leave every target onset inside an answer chord of the same notes (`.early(1/4)`
  // where the step asks for `.early(1/8)`): no pc-set differs, yet no answer chord starts where the target's do.
  const aStarts = simultaneities(ap).map((x) => x.onset);
  const unstruck =
    cfg.perOnset === true &&
    points.filter((p) => !aStarts.some((a) => R.eq(a, p))).length * 2 > points.length;
  const moved = diagnostics.length > 0 || unstruck ? shiftedChords(tp, ap, points, pcsAt, ctx) : null;
  if (moved) {
    const first = diagnostics.find((d) => d.id === "harmony.pcset");
    diagnostics.length = 0;
    diagnostics.push(moved);
    if (first) diagnostics.push({ ...first, severity: "info" });
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
