// The events matcher: exact comparison of normalized events (the curriculum's "haps" check). Events are
// paired by onset, then by pitch (per `PitchMode`) and sound; durations count when asked.
import type { Diagnostic, KeySpec, Matcher, NEvent } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import { effectiveDur, locAt, locOf, mod12, ratKey, sortEvents } from "../analyze/events.ts";
import { keyOf } from "../analyze/key.ts";
import { selectTracks } from "../analyze/tracks.ts";
import { diag } from "../feedback/catalog.ts";
import type { MatchResult, NormalizeContext, Normalized } from "../types.ts";
import { alignFeel, clampScore, f1, lengthLabel, pitchLabel } from "./common.ts";
import { pitchClassOfKey } from "./melody.ts";

export type EventsMatcher = Extract<Matcher, { m: "events" }>;

const soundKey = (e: NEvent, mode: EventsMatcher["sound"]): string =>
  mode === "s" ? (e.s ?? "") : mode === "drum-role" ? (e.drum ?? (e.midi === null ? (e.s ?? "") : "")) : "";

export function eventsMatch(
  reference: Normalized,
  answer: Normalized,
  cfg: EventsMatcher,
  ctx: NormalizeContext,
): MatchResult {
  const [tEv, aEv] = alignFeel(selectTracks(reference, cfg.tracks), selectTracks(answer, cfg.tracks), ctx);
  const T = sortEvents(tEv);
  const A = sortEvents(aEv);
  const pos = { meter: ctx.meter, ...(ctx.pickup ? { pickup: ctx.pickup } : {}) };
  const tKey: KeySpec | null = keyOf(T, ctx.key ?? null);
  const aKey: KeySpec | null = keyOf(A, null) ?? tKey;
  let shift = 0;
  if (cfg.pitch === "transposition-invariant") {
    const diffs = new Map<number, number>();
    for (const t of T)
      for (const a of A)
        if (t.midi !== null && a.midi !== null && R.eq(t.onset, a.onset))
          diffs.set(t.midi - a.midi, (diffs.get(t.midi - a.midi) ?? 0) + 1);
    shift = [...diffs.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? 0;
  }
  const pitchKey = (e: NEvent, side: "t" | "a"): string => {
    if (e.midi === null) return "-";
    const m = side === "a" ? e.midi + shift : e.midi;
    if (cfg.pitch === "octave-free") return String(mod12(m));
    if (cfg.pitch === "key-relative") {
      const k = side === "t" ? tKey : aKey;
      return String(mod12(m - (k ? pitchClassOfKey(k) : 0)));
    }
    return String(m);
  };
  const timeKey = (e: NEvent): string => (cfg.rhythm === "ignore" ? "" : ratKey(e.onset));
  const full = (e: NEvent, side: "t" | "a"): string =>
    `${timeKey(e)}|${pitchKey(e, side)}|${soundKey(e, cfg.sound ?? "ignore")}`;

  // Multiset matching on (onset, pitch, sound).
  const pool = new Map<string, number[]>();
  A.forEach((a, j) => {
    const k = full(a, "a");
    pool.set(k, [...(pool.get(k) ?? []), j]);
  });
  const pairs: [number, number][] = [];
  const unT: number[] = [];
  T.forEach((t, i) => {
    const list = pool.get(full(t, "t"));
    const j = list?.shift();
    if (j === undefined) unT.push(i);
    else pairs.push([i, j]);
  });
  const matchedA = new Set(pairs.map(([, j]) => j));
  const unA = A.map((_, j) => j).filter((j) => !matchedA.has(j));

  // Durations: matched pairs whose (clipped) length differs.
  const diagnostics: Diagnostic[] = [];
  let durOk = 0;
  const wantDur = cfg.durations || cfg.rhythm === "exact";
  if (wantDur)
    for (const [i, j] of pairs) {
      const td = effectiveDur(T[i] as NEvent);
      const ad = effectiveDur(A[j] as NEvent);
      if (R.eq(td, ad)) durOk++;
      else
        diagnostics.push(
          diag(
            "rhythm.duration",
            { got: lengthLabel(ad, ctx.meter), expected: lengthLabel(td, ctx.meter) },
            locOf(A[j] as NEvent, pos),
            "duration",
          ),
        );
    }

  // Pair what is left at the same onset: a wrong note rather than one missing and one extra.
  const overlay: NonNullable<MatchResult["overlay"]> = { answer: [], missing: [] };
  const leftA = new Set(unA);
  for (const i of unT) {
    const t = T[i] as NEvent;
    const j = [...leftA].find((x) => cfg.rhythm === "ignore" || R.eq((A[x] as NEvent).onset, t.onset));
    if (j !== undefined && t.midi !== null && (A[j] as NEvent).midi !== null) {
      leftA.delete(j);
      const a = A[j] as NEvent;
      const g = pitchLabel(a.midi as number, cfg.pitch === "key-relative" ? aKey : tKey);
      const e = pitchLabel(t.midi as number, tKey);
      const octave = cfg.pitch === "absolute" && mod12((a.midi as number) - (t.midi as number)) === 0;
      diagnostics.push(
        octave
          ? diag(
              "melody.octave",
              { dir: (a.midi as number) > (t.midi as number) ? "higher" : "lower" },
              locOf(a, pos),
              "pitch",
            )
          : diag(
              "melody.wrong-degree",
              { got: g.name, gotSyl: g.syl, exp: e.name, expSyl: e.syl },
              locOf(a, pos),
              "pitch",
            ),
      );
      overlay.answer.push({ id: a.id, ok: false });
      overlay.missing.push(t);
      continue;
    }
    overlay.missing.push(t);
    diagnostics.push(
      t.midi === null
        ? diag(
            "rhythm.missing",
            { role: t.drum ? ` (${t.drum})` : "" },
            locAt(t.onset, pos, { track: t.track }),
            "rhythm",
          )
        : diag(
            "melody.missing-note",
            { exp: pitchLabel(t.midi, tKey).name },
            locAt(t.onset, pos, { track: t.track }),
            "pitch",
          ),
    );
  }
  for (const j of leftA) {
    const a = A[j] as NEvent;
    overlay.answer.push({ id: a.id, ok: false });
    diagnostics.push(
      a.midi === null
        ? diag("rhythm.extra", { role: a.drum ? ` (${a.drum})` : "" }, locOf(a, pos), "rhythm")
        : diag("melody.extra-note", { got: pitchLabel(a.midi, aKey).name }, locOf(a, pos), "pitch"),
    );
  }
  for (const [, j] of pairs) overlay.answer.push({ id: (A[j] as NEvent).id, ok: true });

  const keyF1 = f1(pairs.length, T.length, A.length);
  const tOn = new Set(T.map((e) => ratKey(e.onset)));
  const aOn = new Set(A.map((e) => ratKey(e.onset)));
  const onsetHits = [...tOn].filter((k) => aOn.has(k)).length;
  const dims: MatchResult["dims"] = {
    pitch: { score: keyF1, weight: 1, n: T.length },
    rhythm: {
      score: cfg.rhythm === "ignore" ? 1 : f1(onsetHits, tOn.size, aOn.size),
      weight: 0,
      n: tOn.size,
    },
  };
  let score = keyF1;
  if (wantDur) {
    const acc = pairs.length === 0 ? 1 : durOk / pairs.length;
    dims.duration = { score: acc, weight: 0.2, n: pairs.length };
    score = keyF1 * (0.8 + 0.2 * acc);
  }
  return { score: clampScore(score), dims, diagnostics, overlay };
}
