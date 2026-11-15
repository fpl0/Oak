// Wave 7 facts for a track capstone's review (docs/design/wave7.md §3.2; the tutor's `W7FactsInput`): which of the
// grader's Wave 7 views a capstone's review reads, with which tracks, and the views themselves on one evaluated
// piece. The plan is read from the capstone's own rubric (the tracks its rules name: the clave on `perc`, the
// polyrhythm's two parts, the Euclidean bell, the walking bass), so a review talks about the parts the brief asks
// for and nothing a learner's piece happens to contain by chance. The song a capstone reads (JC3's model head,
// JC4's standard) comes from its answer key: its changes one a bar and its melody note by note, as
// `GradeContext.songMelody` gives it to the grader. A view that is not built, or throws on an odd piece, is left out.
import type { CapstoneDef, MeterId, Rat, RubricRule, SongDef, TrackRef } from "@oak/content-kit";
import { LABEL_ROLES, R } from "@oak/content-kit";
import {
  claveAlignmentView,
  claveView,
  compareIdioms,
  compingView,
  contrafactView,
  densityView,
  type EvalOptions,
  type EvalResult,
  euclidView,
  feelView,
  isNotBuilt,
  levelsView,
  type Normalized,
  normalize,
  polyrhythmView,
  registerClashView,
  reharmView,
  type SongMelodyNote,
  tensionView,
  twoFiveView,
  voicingView,
  walkingBassView,
} from "@oak/grader";
import type { W7FactsInput } from "../tutor/review-facts-w7.ts";

/** What a track capstone's review reads beyond the Wave 4–6 facts. */
export interface W7ViewPlan {
  /** ii–Vs, the voicing of each chord track and the melody's tensions (the jazz capstones and AC2). */
  jazz: boolean;
  /**
   * The bass read as a walk. `ifWalking`: only when at least half its bars have a note on every beat (JC3, whose
   * brief names no walk: a two-feel bass there is a choice, not a list of faults).
   */
  walking: { bass: TrackRef; harmony: TrackRef; ifWalking?: boolean } | null;
  comping: TrackRef | null;
  /** JC3: the changes one a bar the A sections keep, and the model head's notes (when its answer key exists). */
  contrafact: { changes: string[]; model: SongMelodyNote[] | null } | null;
  /** JC4: the standard's changes one a bar and its melody (null when its answer key has no melody layer). */
  reharm: { reference: string[]; melody: SongMelodyNote[] | null; pickup: boolean } | null;
  /** Swing and microtiming per track: every learner track (`"all"`) or none. */
  feel: "all" | null;
  clave: TrackRef | null;
  claveAlign: TrackRef[];
  euclid: TrackRef[];
  poly: [TrackRef, TrackRef] | null;
}

export const EMPTY_W7_PLAN: W7ViewPlan = {
  jazz: false,
  walking: null,
  comping: null,
  contrafact: null,
  reharm: null,
  feel: null,
  clave: null,
  claveAlign: [],
  euclid: [],
  poly: null,
};

type RuleBody = RubricRule & { fn?: string; params?: Record<string, unknown>; [k: string]: unknown };
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

/** One chord a bar from a song's lead sheet (the first chord of each bar, held), `answerKey.bars` long. */
export function songChanges(song: Pick<SongDef, "answerKey">): string[] {
  const chords = song.answerKey.chords ?? [];
  const out: string[] = [];
  let last = chords[0]?.symbol ?? "";
  for (let b = 1; b <= song.answerKey.bars; b++) {
    last = chords.filter((c) => c.bar === b).sort((x, y) => x.beat - y.beat)[0]?.symbol ?? last;
    out.push(last);
  }
  return out;
}

/**
 * The song a capstone draft is on: a `song.*` tag of the draft that the capstone offers, else its only song, else
 * null (the app's `songOfDraft`). Only songs with an answer key are returned.
 */
export function songOfCapstone(
  def: Pick<CapstoneDef, "song">,
  tags: readonly string[],
  songs: readonly SongDef[],
): SongDef | null {
  const offered = ((def as { song?: readonly string[] }).song ?? []).filter((id) =>
    songs.some((s) => s.id === id),
  );
  const tagged = tags.find((t) => t.startsWith("song.") && offered.includes(t));
  const id = tagged ?? (offered.length === 1 ? offered[0] : null);
  return id ? (songs.find((s) => s.id === id) ?? null) : null;
}

/**
 * Which Wave 7 views a capstone's review reads, from its id and its rubric. Core capstones (C0–C7, X1, X2, CF-*)
 * get none (`null`): their reviews are unchanged. `melodyOf` is the song's melody (evaluated by the caller).
 */
export function w7PlanFor(
  def: Pick<CapstoneDef, "id"> & { brief?: { rubric?: readonly RubricRule[] } | null },
  song: SongDef | null,
  melodyOf: SongMelodyNote[] | null,
): W7ViewPlan | null {
  const id = def.id;
  if (!/^(?:JC\d|RC\d|AC\d)$/.test(id)) return null;
  const rules = (def.brief?.rubric ?? []) as RuleBody[];
  const plan: W7ViewPlan = { ...EMPTY_W7_PLAN, claveAlign: [], euclid: [] };
  const jazz = id.startsWith("JC") || id === "AC2";
  plan.jazz = jazz;
  for (const r of rules) {
    const p = r.params ?? {};
    if (r.rule === "custom" && r.fn === "walking-bass")
      plan.walking = { bass: str(p.bass) ?? "@bass", harmony: str(p.harmony) ?? "@chords" };
    if (r.rule === "custom" && r.fn === "contrafact" && Array.isArray(p.changes))
      plan.contrafact = { changes: (p.changes as unknown[]).map(String), model: melodyOf };
    if (r.rule === "custom" && r.fn === "clave-aligned") {
      const t = str(p.track);
      if (t) plan.claveAlign.push(t);
      plan.clave ??= str(p.clave);
    }
    if (r.rule === "custom" && r.fn === "microtiming") plan.feel = "all";
    if (r.rule === "clave") plan.clave = str(r.track) ?? plan.clave;
    if (r.rule === "euclid") {
      const t = str(r.track);
      if (t) plan.euclid.push(t);
    }
    if (r.rule === "polyrhythm") {
      const a = str(r.a);
      const b = str(r.b);
      if (a && b) plan.poly = [a, b];
    }
  }
  // JC3's head walks too: its bass is read as a walk when the piece has one (§6.6 JC3 names no walking rule).
  if (id === "JC3" && plan.walking === null)
    plan.walking = { bass: "@bass", harmony: "@chords", ifWalking: true };
  if (plan.walking) plan.comping = plan.walking.harmony;
  // The rhythm capstones: the pocket of every part (swing and how late or early each part sits).
  if (id.startsWith("RC")) plan.feel = "all";
  // JC4: the standard's changes and its melody, so the review can say which devices replaced which chords and
  // whether the tune stayed as written.
  if (id === "JC4" && song)
    plan.reharm = { reference: songChanges(song), melody: melodyOf, pickup: song.pickup !== undefined };
  return plan;
}

/** Learner tracks that play a role: every fixed label of that role, plus the track the grader inferred. */
export function tracksOfRole(n: Normalized, role: "drums" | "bass" | "chords" | "melody"): string[] {
  const out: string[] = [];
  for (const t of Object.keys(n.byTrack)) {
    if (t.startsWith("band.")) continue;
    if ((LABEL_ROLES as Record<string, string | undefined>)[t] === role) out.push(t);
  }
  const inferred = n.roles[role];
  if (inferred && !inferred.startsWith("band.") && !out.includes(inferred) && n.byTrack[inferred])
    out.push(inferred);
  return out;
}

const ok = <T>(v: T): Exclude<T, { notBuilt: string }> | null =>
  isNotBuilt(v) ? null : (v as Exclude<T, { notBuilt: string }>);

/**
 * The Wave 7 views of one evaluated piece, as the tutor's `W7FactsInput`. `changes` is one chord symbol a bar from
 * the harmony view (what a hand-voiced chord track is read against). The cheap views every track capstone shares
 * (register clashes, levels, density) are always read for a track capstone; the rest follow the plan.
 */
export function w7Inputs(
  n: Normalized,
  ctx: { meter: MeterId; key?: { tonic: string; mode: string }; bars: number; code: string },
  plan: W7ViewPlan,
  changes: readonly string[],
): W7FactsInput {
  const safe = <T>(f: () => T): T | null => {
    try {
      return f();
    } catch {
      return null;
    }
  };
  const c = ctx as never as Parameters<typeof twoFiveView>[1] & { bars: number };
  const out: W7FactsInput = {};
  if (plan.jazz) {
    out.twoFives = safe(() => twoFiveView(n, c)) as never;
    const voicings: Record<string, never> = {};
    for (const t of tracksOfRole(n, "chords")) {
      const v = safe(() => voicingView(n, { ...c, track: t, changes }));
      if (v && v.length > 0) voicings[t] = v as never;
    }
    if (Object.keys(voicings).length > 0) out.voicings = voicings;
    if (tracksOfRole(n, "melody").length > 0) out.tensions = safe(() => tensionView(n, c)) as never;
  }
  if (plan.walking) {
    const w = plan.walking;
    const v = safe(() => ok(walkingBassView(n, { ...c, bass: w.bass, harmony: w.harmony })));
    const name = w.bass.startsWith("@") ? (tracksOfRole(n, "bass")[0] ?? null) : w.bass;
    const walks = !w.ifWalking || (v ?? []).filter((b) => b.quarters).length * 2 >= (v ?? []).length;
    if (v && v.length > 0 && name && walks) out.walking = { track: name, bars: v as never };
  }
  if (plan.comping) {
    const ref = plan.comping;
    const v = safe(() => ok(compingView(n, { ...c, track: ref })));
    const name = ref.startsWith("@") ? (tracksOfRole(n, "chords")[0] ?? null) : ref;
    if (v && v.length > 0 && name) out.comping = { track: name, bars: v as never };
  }
  if (plan.reharm) {
    const h = plan.reharm;
    const v = safe(() =>
      ok(
        reharmView(n, {
          ...c,
          code: ctx.code,
          reference: h.reference,
          ...(h.melody && h.melody.length > 0 ? { melody: h.melody, melodyTrack: "@melody" } : {}),
        } as never),
      ),
    );
    if (v) {
      out.reharm = v as never;
      out.reharmMelodyGiven = !!h.melody && h.melody.length > 0;
    }
  }
  if (plan.contrafact) {
    const k = plan.contrafact;
    const v = safe(() =>
      ok(
        contrafactView(n, {
          ...c,
          changes: k.changes,
          ...(k.model && k.model.length > 0 ? { model: k.model } : {}),
        }),
      ),
    );
    if (v) out.contrafact = v as never;
  }
  if (plan.feel) out.feel = safe(() => feelView(n, c)) as never;
  if (plan.clave) {
    const t = plan.clave;
    const v = safe(() => claveView(n, { ...c, track: t }));
    if (v) out.clave = { track: t, view: v as never };
    if (plan.claveAlign.length > 0)
      out.claveAlign = plan.claveAlign.map((p) => ({
        track: p,
        windows: (safe(() => ok(claveAlignmentView(n, { ...c, track: p, clave: t }))) ?? []) as never,
      }));
  }
  if (plan.euclid.length > 0)
    out.euclid = plan.euclid.map((t) => ({
      track: t,
      bars: (safe(() => euclidView(n, { ...c, track: t, steps: 16 })) ?? []) as never,
    }));
  if (plan.poly) {
    const [a, b] = plan.poly;
    out.polyrhythm = { a, b, bars: (safe(() => ok(polyrhythmView(n, { ...c, a, b }))) ?? []) as never };
  }
  out.registerClashes = safe(() => registerClashView(n, c)) as never;
  out.levels = safe(() => levelsView(n, c)) as never;
  out.density = safe(() => densityView(n, c)) as never;
  return out;
}

export type Analyze = (code: string, opts: EvalOptions) => Promise<EvalResult>;

/** The melody layer of a song's answer key as a one-track piece (`melody:`), or null without one. */
export function melodyLayerCode(song: Pick<SongDef, "answerKey">): string | null {
  const layer = song.answerKey.layers.melody?.trim();
  if (!layer) return null;
  return `melody: ${layer.replace(/^[A-Za-z_$][\w$]*\s*:\s*/, "")}`;
}

/**
 * A song's melody note by note from its answer key, bars counted from the first full bar (a pickup's notes are
 * negative): exactly what the app passes the grader as `GradeContext.songMelody` (app/src/capstone/song-melody.ts).
 */
export async function songMelodyOf(
  song: Pick<SongDef, "answerKey" | "meter" | "pickup">,
  analyze: Analyze,
): Promise<SongMelodyNote[]> {
  const code = melodyLayerCode(song);
  if (!code) return [];
  const shift = song.pickup ? 1 : 0;
  const bars = song.answerKey.bars + shift;
  const ev = await analyze(code, { mode: "capstone", bars, lint: null, meter: song.meter as MeterId });
  if (!ev.ok) return [];
  const n = normalize(ev, { meter: song.meter as MeterId });
  const back: Rat = [shift, 1];
  return (n.byTrack.melody ?? [])
    .filter((e) => e.midi !== null && R.toNum(e.onset) < bars - 1e-9)
    .sort((a, b) => R.cmp(a.onset, b.onset) || (a.midi as number) - (b.midi as number))
    .map((e) => ({ onset: R.sub(e.onset, back), dur: e.dur, midi: e.midi as number }));
}

/** Two versions of one tune compared (AC1): the same tune, and the axes an idiom changed. */
export function compareVersions(
  a: Normalized,
  b: Normalized,
  meter: MeterId,
): { sameTune: boolean; axes: string[] } | null {
  try {
    const v = compareIdioms(a, b, { meter, melody: "@melody" });
    return { sameTune: v.sameTune, axes: [...v.axes] };
  } catch {
    return null;
  }
}
