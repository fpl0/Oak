// The melody matcher (exercises §3.4 `alignMelody`; contracts §6.8): sequence alignment with a weighted
// edit distance on pitch, onset F1 for rhythm, and a Needleman–Wunsch backtrace for per-note findings.
// Pitch modes: absolute, octave-free, key-relative (degrees in each side's own key) and
// transposition-invariant (the answer moved by the most common interval first).
import type { Diagnostic, KeySpec, Matcher, NEvent, Rat } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import { degreeOf, pcOf } from "@oak/theory";
import { locAt, locOf, median, mod12, modeOf } from "../analyze/events.ts";
import { inScale, keyFromContext, keyOf } from "../analyze/key.ts";
import type { Note } from "../analyze/melody.ts";
import { contourScore, editDistance, melodyLine, parsons } from "../analyze/melody.ts";
import { lineWord, selectTrack } from "../analyze/tracks.ts";
import { diag } from "../feedback/catalog.ts";
import type { MatchResult, NormalizeContext, Normalized } from "../types.ts";
import { alignFeel, clampScore, f1, noteName, pitchLabel } from "./common.ts";
import { matchOnsets, pickupShift } from "./rhythm.ts";

export type MelodyMatcher = Extract<Matcher, { m: "melody" }>;

/**
 * `transcription` (by-ear steps, `DictationEx.byEar`): report like a transcription teacher. The first
 * difference by bar and beat (`melody.first-difference`), a right note at the wrong time
 * (`melody.rhythm-note`), "only the pitches differ" (`melody.pitch-only`), and a whole tune moved where
 * the step does not allow it (`melody.wrong-key`, `melody.wrong-octave`) instead of one finding per note.
 */
export interface MelodyReportOptions {
  transcription?: boolean;
}

/** The events a melody matcher reads: the named track or `@melody`, else every learner track. */
export function melodyEvents(n: Normalized, track?: string): NEvent[] {
  const ev = selectTrack(n, track ?? "@melody");
  return ev.length > 0 || track ? ev : selectTrack(n, "*");
}

/** The interval that moves `a` onto `t`: the most common difference over notes that start together, else the median. */
export function bestTransposition(t: readonly Note[], a: readonly Note[]): number {
  const diffs: number[] = [];
  for (const x of t) for (const y of a) if (R.eq(x.onset, y.onset)) diffs.push(Math.round(x.midi - y.midi));
  if (diffs.length > 0) return modeOf(diffs) ?? 0;
  const n = Math.min(t.length, a.length);
  if (n === 0) return 0;
  return Math.round(median(Array.from({ length: n }, (_, i) => (t[i] as Note).midi - (a[i] as Note).midi)));
}

/**
 * The shift that moves a transposition-invariant answer onto the reference. With the answer's own
 * `.scale()` key, its tonic goes onto the reference's (in the octave nearest the best fit), so its degrees
 * are compared as the learner wrote them: a tune moved by scale steps in C then reads as wrong degrees in C,
 * not as a half-matching tune in E♭. The best-fitting interval wins only when it fits (nearly) every note
 * and the key's shift does not: then the notes really are the tune in another key.
 */
export function transpositionOf(
  t: readonly Note[],
  a: readonly Note[],
  tKey: KeySpec | null,
  aKey: KeySpec | null,
): number {
  const best = bestTransposition(t, a);
  if (!tKey || !aKey) return best;
  const base = mod12(pitchClassOfKey(tKey) - pitchClassOfKey(aKey));
  const byKey = [-36, -24, -12, 0, 12, 24, 36]
    .map((o) => base + o)
    .reduce((x, y) => (Math.abs(y - best) < Math.abs(x - best) ? y : x));
  if (byKey === best) return best;
  const misses = (k: number): number =>
    editDistance(
      t.map((n) => Math.round(n.midi)),
      a.map((n) => Math.round(n.midi + k)),
    );
  const room = Math.floor(0.1 * Math.max(t.length, a.length));
  return misses(best) <= room && misses(byKey) > misses(best) ? best : byKey;
}

type Op = { op: "match" | "sub"; i: number; j: number } | { op: "del"; i: number } | { op: "ins"; j: number };

/** Needleman–Wunsch with a gap cost of 1 and a caller-supplied pair cost; returns the alignment, target order. */
export function needlemanWunsch(n: number, m: number, cost: (i: number, j: number) => number): Op[] {
  const D: number[][] = Array.from({ length: n + 1 }, (_, i) =>
    Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      (D[i] as number[])[j] = Math.min(
        ((D[i - 1] as number[])[j - 1] as number) + cost(i - 1, j - 1),
        ((D[i - 1] as number[])[j] as number) + 1,
        ((D[i] as number[])[j - 1] as number) + 1,
      );
  const ops: Op[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const here = (D[i] as number[])[j] as number;
    if (
      i > 0 &&
      j > 0 &&
      Math.abs(here - (((D[i - 1] as number[])[j - 1] as number) + cost(i - 1, j - 1))) < 1e-9
    ) {
      ops.push({ op: cost(i - 1, j - 1) === 0 ? "match" : "sub", i: i - 1, j: j - 1 });
      i--;
      j--;
    } else if (i > 0 && Math.abs(here - (((D[i - 1] as number[])[j] as number) + 1)) < 1e-9) {
      ops.push({ op: "del", i: i - 1 });
      i--;
    } else {
      ops.push({ op: "ins", j: j - 1 });
      j--;
    }
  }
  return ops.reverse();
}

/** Diatonic step index of a note in a key: 7 per octave, chromatic notes counted with their letter degree. */
export const stepIndex = (midi: number, key: KeySpec): number => {
  const d = degreeOf(midi, key);
  const tonicPc = mod12(midi - d.semitones);
  const octave = Math.floor((midi - tonicPc) / 12);
  return octave * 7 + d.num - 1;
};

/**
 * Aligns the answer melody with the reference (exercises §3.4 `alignMelody`).
 */
export function melodyMatch(
  reference: Normalized,
  answer: Normalized,
  cfg: MelodyMatcher,
  ctx: NormalizeContext & MelodyReportOptions,
): MatchResult {
  const [tEv, aEv] = alignFeel(melodyEvents(reference, cfg.track), melodyEvents(answer, cfg.track), ctx);
  const T = melodyLine(tEv);
  let A = melodyLine(aEv);
  const pos = { meter: ctx.meter, ...(ctx.pickup ? { pickup: ctx.pickup } : {}) };
  const diagnostics: Diagnostic[] = [];
  if (T.length === 0 && A.length === 0) return { score: 1, dims: {}, diagnostics };
  if (A.length === 0) {
    diagnostics.push(
      diag("melody.no-line", { track: cfg.track ? ` in \`${cfg.track}\`` : "" }, undefined, "pitch"),
    );
    return {
      score: 0,
      dims: { pitch: { score: 0, weight: cfg.wPitch }, rhythm: { score: 0, weight: cfg.wRhythm } },
      diagnostics,
      overlay: { answer: [], missing: T.map((n) => n.event) },
    };
  }

  const tKey = keyOf(tEv, ctx.key ?? null);
  // The answer's key: its own `.scale()` context; otherwise the reference key moved by the transposition
  // the notes show. A bare key estimate is not used: a C-major tune that leans on A and E reads as A minor.
  const aCtxKey = keyFromContext(aEv);
  let aKey: KeySpec | null = aCtxKey ?? tKey;
  if (!aCtxKey && tKey) {
    const k = mod12(bestTransposition(T, A));
    if (k !== 0)
      aKey = {
        tonic: noteName(60 + mod12(pitchClassOfKey(tKey) - k), tKey).replace(/-?\d+$/, ""),
        mode: tKey.mode,
      };
  } else if (!aCtxKey) aKey = keyOf(aEv, null);
  // Pitch values per mode.
  let value: (n: Note, side: "t" | "a") => number;
  let octaveAware = false;
  // "Right tune, but in another key": said only once the tune is known to be right (step 6).
  let transposed: Diagnostic | null = null;
  if (cfg.pitch === "transposition-invariant") {
    const k = transpositionOf(T, A, tKey, aCtxKey);
    if (mod12(k) !== 0 && tKey) {
      const gotKey = {
        tonic: noteName(60 + mod12(pitchClassOfKey(tKey) - k), tKey).replace(/-?\d+$/, ""),
        mode: tKey.mode,
      };
      transposed = diag(
        "melody.transposed",
        { gotKey: keyText(gotKey), expKey: keyText(tKey) },
        undefined,
        "pitch",
      );
    }
    A = A.map((n) => ({ ...n, midi: n.midi + k }));
    value = (n) => n.midi;
    octaveAware = true;
  } else if (cfg.pitch === "key-relative") {
    const tTonic = tKey ? pitchClassOfKey(tKey) : 0;
    const aTonic = aKey ? pitchClassOfKey(aKey) : tTonic;
    if (tKey && aKey && mod12(aTonic - tTonic) !== 0)
      diagnostics.push(
        diag("melody.transposed", { gotKey: keyText(aKey), expKey: keyText(tKey) }, undefined, "pitch"),
      );
    value = (n, side) => mod12(n.midi - (side === "t" ? tTonic : aTonic));
  } else if (cfg.pitch === "octave-free") value = (n) => mod12(n.midi);
  else {
    value = (n) => n.midi;
    octaveAware = true;
  }
  const tv = T.map((n) => value(n, "t"));
  const av = A.map((n) => value(n, "a"));
  const pitchCost = (i: number, j: number): number => {
    const x = tv[i] as number;
    const y = av[j] as number;
    if (x === y) return 0;
    return octaveAware && mod12(x - y) === 0 ? 0.5 : 1;
  };

  // 2. Pitch score: weighted Levenshtein over pitch order.
  const d = editDistance(
    tv.map((_, i) => i),
    av.map((_, j) => j),
    (i, j) => pitchCost(i, j),
  );
  const Sp = clampScore(1 - d / Math.max(T.length, A.length));
  // 3. Rhythm score: onset F1 with the matcher's tolerance.
  const om = matchOnsets(
    T.map((n) => n.onset),
    A.map((n) => n.onset),
    cfg.rhythmTol,
  );
  const Sr = f1(om.pairs.length, T.length, A.length);
  const onsetDiffers = (i: number, j: number): boolean =>
    !R.lte(R.abs(R.sub((A[j] as Note).onset, (T[i] as Note).onset)), cfg.rhythmTol);

  // 4. Joint alignment for the per-note findings.
  const ops = needlemanWunsch(T.length, A.length, (i, j) => pitchCost(i, j) + (onsetDiffers(i, j) ? 0.5 : 0));
  const perNote: Diagnostic[] = [];
  const overlay: NonNullable<MatchResult["overlay"]> = { answer: [], missing: [] };
  const subs: { i: number; j: number; octave: boolean }[] = [];
  let otherErrors = 0;
  // Transposition-invariant answers were moved into the reference's key above, so both sides read in it.
  const label = (n: Note, key: KeySpec | null, side: "t" | "a"): { name: string; syl: string } =>
    cfg.pitch === "absolute" || cfg.pitch === "octave-free" || cfg.pitch === "transposition-invariant"
      ? pitchLabel(n.midi, tKey)
      : pitchLabel(n.midi, side === "t" ? tKey : key);
  for (const o of ops) {
    if (o.op === "match") {
      overlay.answer.push({ id: (A[o.j] as Note).id, ok: !onsetDiffers(o.i, o.j) });
      continue;
    }
    if (o.op === "sub") {
      const t = T[o.i] as Note;
      const a = A[o.j] as Note;
      overlay.answer.push({ id: a.id, ok: false });
      const pc = pitchCost(o.i, o.j);
      if (pc === 0) continue; // same pitch, only the onset differs: a rhythm matter.
      // The target note was not played either: it is the ghost the roll and staff show from rung 3.
      overlay.missing.push(t.event);
      const where = locAt(t.onset, pos, {
        track: a.event.track,
        noteIds: [a.id],
        ...(a.event.locs.length ? { code: a.event.locs } : {}),
      });
      if (pc === 0.5) {
        subs.push({ i: o.i, j: o.j, octave: true });
        otherErrors++;
        perNote.push(
          diag(
            "melody.octave",
            { dir: (av[o.j] as number) > (tv[o.i] as number) ? "higher" : "lower" },
            where,
            "pitch",
          ),
        );
      } else {
        subs.push({ i: o.i, j: o.j, octave: false });
        const g = label(a, aKey, "a");
        const e = label(t, tKey, "t");
        perNote.push(
          diag(
            "melody.wrong-degree",
            {
              got: g.name,
              gotSyl: g.syl,
              exp: e.name,
              expSyl: e.syl,
              line: lineWord(reference, cfg.track ?? t.event.track),
            },
            where,
            "pitch",
          ),
        );
      }
      continue;
    }
    if (o.op === "del") {
      const t = T[o.i] as Note;
      otherErrors++;
      overlay.missing.push(t.event);
      perNote.push(
        diag(
          "melody.missing-note",
          { exp: label(t, tKey, "t").name },
          locAt(t.onset, pos, { track: t.event.track }),
          "pitch",
        ),
      );
      continue;
    }
    const a = A[o.j] as Note;
    otherErrors++;
    overlay.answer.push({ id: a.id, ok: false });
    perNote.push(diag("melody.extra-note", { got: label(a, aKey, "a").name }, locOf(a.event, pos), "pitch"));
  }

  // 5. Index shift: every wrong note one scale step off in the same direction.
  const real = subs.filter((s) => !s.octave);
  let indexShift = false;
  if (tKey && real.length > 0 && otherErrors === 0 && cfg.pitch !== "octave-free") {
    const keyA = cfg.pitch === "key-relative" ? (aKey ?? tKey) : tKey;
    const deltas = real.map(
      (s) => stepIndex((A[s.j] as Note).midi, keyA) - stepIndex((T[s.i] as Note).midi, tKey),
    );
    const up = deltas.filter((x) => x === 1).length;
    const down = deltas.filter((x) => x === -1).length;
    const dir = up >= down ? 1 : -1;
    if (Math.max(up, down) / real.length >= 0.7 && real.length >= Math.max(2, Math.ceil(T.length / 2))) {
      const first = real.find((_, k) => deltas[k] === dir) as { i: number };
      const deg = degreeOf((T[first.i] as Note).midi, tKey);
      diagnostics.push(
        diag(
          "melody.index-shift",
          { dir: dir > 0 ? "too high" : "too low", deg: deg.degree, idx: deg.num - 1 },
          undefined,
          "pitch",
        ),
      );
      indexShift = true;
    }
  }
  // Index shift on a tune with repeated notes (Ode to Joy): the alignment can pair shifted notes with
  // neighbours and hide the pattern, so test it note by note too. Same number of notes, same onsets, and
  // nearly every note one scale step off in the same direction.
  if (!indexShift && tKey && cfg.pitch !== "octave-free" && T.length >= 3 && T.length === A.length) {
    const keyA = cfg.pitch === "key-relative" ? (aKey ?? tKey) : tKey;
    const sameTimes = T.every((t, i) => R.eq(t.onset, (A[i] as Note).onset));
    const deltas = T.map((t, i) => stepIndex((A[i] as Note).midi, keyA) - stepIndex(t.midi, tKey));
    const up = deltas.filter((x) => x === 1).length;
    const down = deltas.filter((x) => x === -1).length;
    const dir = up >= down ? 1 : -1;
    const off = deltas.filter((x) => x !== 0).length;
    if (sameTimes && off > 0 && Math.max(up, down) / T.length >= 0.7 && Math.max(up, down) === off) {
      const i = deltas.indexOf(dir);
      const deg = degreeOf((T[i] as Note).midi, tKey);
      diagnostics.push(
        diag(
          "melody.index-shift",
          { dir: dir > 0 ? "too high" : "too low", deg: deg.degree, idx: deg.num - 1 },
          undefined,
          "pitch",
        ),
      );
      indexShift = true;
    }
  }
  // Moved into another key and right there: say so. Not when the notes are not the tune (a tune moved by
  // scale steps keeps its contour, not its intervals) or when they are the index slip.
  if (transposed && !indexShift && Sp >= 0.75) diagnostics.push(transposed);
  // By ear: a whole tune moved where the step wants it as heard is one finding, not one per note.
  let moved: Diagnostic | null = null;
  // Every answer note in the key and one scale step off is the n-from-0 slip, not a tune in another key, even
  // when the slip happens to equal a chromatic transposition (C G A F typed as D A B G).
  const keyIdx = cfg.pitch === "key-relative" ? (aKey ?? tKey) : tKey;
  const slipInKey = indexShift && !!keyIdx && A.every((n) => inScale(n.midi, keyIdx));
  if (ctx.transcription && !slipInKey && (cfg.pitch === "absolute" || cfg.pitch === "octave-free") && tKey) {
    const k = bestTransposition(T, A);
    const shifted = A.map((n) => (cfg.pitch === "absolute" ? n.midi + k : mod12(n.midi + k)));
    const ref = T.map((n) => (cfg.pitch === "absolute" ? n.midi : mod12(n.midi)));
    const fits =
      k !== 0 &&
      (cfg.pitch === "absolute" || mod12(k) !== 0) &&
      shifted.length === ref.length &&
      shifted.every((x, i) => x === ref[i]);
    if (fits && mod12(k) === 0)
      moved = diag("melody.wrong-octave", { dir: k < 0 ? "higher" : "lower" }, undefined, "pitch");
    else if (fits) {
      const gotKey = {
        tonic: noteName(60 + mod12(pitchClassOfKey(tKey) - k), tKey).replace(/-?\d+$/, ""),
        mode: tKey.mode,
      };
      const semis = Math.abs(k) % 12 || 12;
      moved = diag(
        "melody.wrong-key",
        {
          gotKey: keyText(gotKey),
          expKey: keyText(tKey),
          semis: `${semis} half step${semis === 1 ? "" : "s"}`,
          dir: k > 0 ? "up" : "down",
        },
        undefined,
        "pitch",
      );
    }
  }
  if (moved) {
    // A whole tune moved out of the key: the transposition is the finding, not a step slip.
    if (indexShift) {
      const at = diagnostics.findIndex((d) => d.id === "melody.index-shift");
      if (at >= 0) diagnostics.splice(at, 1);
    }
    diagnostics.push(moved);
  } else if (!indexShift) diagnostics.push(...perNote);
  if (ctx.transcription && !moved) {
    const say = (x: { name: string; syl: string }): string =>
      x.syl && x.syl !== x.name ? `${x.name} (${x.syl})` : x.name;
    // Right pitch, wrong time: the matcher's alignment already paired them; say where the note belongs.
    for (const o of ops) {
      if (o.op !== "sub" || pitchCost(o.i, o.j) !== 0) continue;
      const t = T[o.i] as Note;
      const a = A[o.j] as Note;
      const p = locAt(t.onset, pos);
      diagnostics.push(
        diag(
          "melody.rhythm-note",
          { got: say(label(a, aKey, "a")), expAt: `bar ${p.bar}, ${p.beatLabel}` },
          locOf(a.event, pos),
          "rhythm",
        ),
      );
    }
    const first = ops.find((o) => o.op !== "match");
    if (first) {
      let what = "";
      let onset = (T[0] as Note | undefined)?.onset ?? [0, 1];
      if (first.op === "sub") {
        const t = T[first.i] as Note;
        const a = A[first.j] as Note;
        onset = R.lt(a.onset, t.onset) ? a.onset : t.onset;
        const cost = pitchCost(first.i, first.j);
        const later = onsetDiffers(first.i, first.j) ? ", and at another time" : "";
        what =
          cost === 0
            ? `${say(label(a, aKey, "a"))} is the right note at the wrong time`
            : cost === 0.5
              ? `${say(label(a, aKey, "a"))} is the right note, but an octave ${(av[first.j] as number) > (tv[first.i] as number) ? "higher" : "lower"} than the source${later}`
              : `${say(label(a, aKey, "a"))} where the source has ${say(label(t, tKey, "t"))}${later}`;
      } else if (first.op === "del") {
        const t = T[first.i] as Note;
        onset = t.onset;
        what = `the source has ${say(label(t, tKey, "t"))}, and yours has no note there`;
      } else {
        const a = A[first.j] as Note;
        onset = a.onset;
        what = `yours has an extra ${say(label(a, aKey, "a"))}`;
      }
      diagnostics.push(diag("melody.first-difference", { what }, locAt(onset as Rat, pos), "pitch"));
    }
    if (Sr === 1 && Sp < 1) diagnostics.push(diag("melody.pitch-only", {}, undefined, "pitch"));
  }

  // 6. Summary findings.
  const contour = contourScore(parsons(T), parsons(A));
  if (!indexShift && T.length >= 4 && real.length >= 2 && Sp < 0.8 && contour >= 0.8)
    diagnostics.push(diag("melody.contour-right", {}, undefined, "contour"));
  if (Sp === 1 && Sr < 1) diagnostics.push(diag("melody.rhythm-only", {}, undefined, "rhythm"));

  const wSum = cfg.wPitch + cfg.wRhythm || 1;
  let score = (cfg.wPitch * Sp + cfg.wRhythm * Sr) / wSum;
  // A pickup put on the downbeat (contracts §6.11 item 5): one finding in place of the per-note rhythm ones,
  // and the displacement credit when the notes are right.
  if (ctx.pickup && Sr < 1) {
    const shift = pickupShift(
      T.map((x) => x.onset),
      A.map((x) => x.onset),
      ctx.pickup,
      ctx.meter,
    );
    if (shift) {
      for (let i = diagnostics.length - 1; i >= 0; i--)
        if ((diagnostics[i] as Diagnostic).dim === "rhythm") diagnostics.splice(i, 1);
      diagnostics.unshift(
        diag("rhythm.pickup-missing", { units: R.str(ctx.pickup.units) }, undefined, "rhythm"),
      );
      if (Sp >= 0.999) score = Math.max(score, PICKUP_CREDIT);
    }
  }
  return {
    score: clampScore(score),
    dims: {
      pitch: { score: Sp, weight: cfg.wPitch, n: T.length },
      rhythm: { score: Sr, weight: cfg.wRhythm, n: T.length },
      contour: { score: contour, weight: 0 },
    },
    diagnostics,
    overlay,
  };
}

/** Credit for a melody whose only fault is a pickup put on the downbeat (the rhythm matcher's default). */
const PICKUP_CREDIT = 0.5;

/** Pitch class of a key's tonic. */
export const pitchClassOfKey = (key: KeySpec): number => pcOf(key.tonic);
export const keyText = (k: KeySpec): string => `${k.tonic} ${k.mode}`;
