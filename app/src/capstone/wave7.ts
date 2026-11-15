// Wave 7 capstone reading (the advanced tracks' capstones JC1–JC4, RC1–RC2, AC1–AC2; contracts §6.6,
// docs/design/wave7.md §4.4): what each checklist row says beyond met / not yet, with the bars to look at. The keys a
// chain of ii–Vs reaches and where (JC1), the guide tones on the chord changes (JC1, JC3), whether one chord()
// pattern drives the comping and the bass and how many choruses the head plays (JC2), the walking bass bar by bar
// (JC2), the AABA plan and the bridge's chords (JC3), how much of a model's head a contrafact repeats (JC3), avoid
// notes on strong places (JC4), the one on the bass and the kick, the bass off the 8th grid and the horn stabs
// (RC1), the clave with its direction and the bars it covers, the 3:2 layer and the Euclidean layer (RC2), the
// 9ths and 11ths, each chord's voicing and the top voice, the swing measured as a ratio and the lean in
// milliseconds (AC2). Every number is read from the grader's own Wave 7 views of the piece as it is HEARD (a part
// more than 24 dB under the loudest is not there), never from the code's words; a view the grader has not built
// yet says nothing. No line names the answer: each says what the piece does and where. Pure.
import type { AnalysisSummary, GradeResult, MeterId, RubricRule } from "@oak/content-kit";
import { FEEL_MS, LABEL_ROLES, R } from "@oak/content-kit";
import {
  claveView,
  contrafactView,
  euclidView,
  isNotBuilt,
  type Normalized,
  polyrhythmView,
  type SongMelodyNote,
  selectTrack,
  standInModel,
  tensionView,
  twoFiveView,
  voicingView,
  walkingBassView,
} from "@oak/grader";
import { chordSymbolText } from "@oak/notation";
import { lateMs, METERS, parseChordSymbol } from "@oak/theory";
import type { BarAnchor } from "./anchors.ts";
import type { PieceForm } from "./wave5.ts";
import { barsWord, type FoundItem, listBars, type Wave6Extra } from "./wave6.ts";

export interface PieceRead7 {
  n: Normalized;
  code: string;
  meter: MeterId;
  bars: number;
  analysis: AnalysisSummary | null;
  form: PieceForm | null;
  /** The picked song's melody (JC3's model head, JC4's tune), when the capstone has a song. */
  songMelody?: readonly SongMelodyNote[] | null;
  /** The picked song's title ("I Got Rhythm"), for the lines that name it. */
  songTitle?: string | null;
}

type Custom = Extract<RubricRule, { rule: "custom" }>;
const EPS = 1e-6;
const FLAT_NAMES = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];
const mod12 = (x: number) => ((x % 12) + 12) % 12;

/** "E♭4": a sounding note by name (flats, as the jazz tracks spell). */
export function midiName(midi: number): string {
  return `${FLAT_NAMES[mod12(midi)]}${Math.floor(midi / 12) - 1}`;
}

/** A chord as the course prints it in prose ("Dm7", "B♭maj7", "Bm7♭5"); anything unreadable as written. */
export function chordText(symbol: string): string {
  let text: string;
  try {
    text = chordSymbolText(symbol);
  } catch {
    text = symbol;
  }
  // The lead-sheet table is ASCII for the engraver (abcjs draws its own glyphs); prose prints the glyphs.
  return text
    .replace(/^([A-G])b/, "$1♭")
    .replace(/^([A-G])#/, "$1♯")
    .replace(/\/([A-G])b/, "/$1♭")
    .replace(/\/([A-G])#/, "/$1♯")
    .replace(/([^/A-G])b(\d)/g, "$1♭$2")
    .replace(/([^/A-G])#(\d)/g, "$1♯$2");
}

const param = <T>(rule: Custom, key: string, fallback: T): T => {
  const v = rule.params?.[key];
  return v === undefined ? fallback : (v as T);
};
const ctxOf = (p: PieceRead7) => ({ meter: p.meter, bars: p.bars });
const pitchedOf = (p: PieceRead7, ref: string) =>
  selectTrack(p.n, ref as never).filter((e): e is typeof e & { midi: number } => e.midi !== null);
const word = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

/**
 * The line for a part the piece does not sound: a part written in the code (its label evaluated) but silent, or more
 * than 24 dB under the loudest part, is "not heard", named by its own label (`mel`, not "melody"); a part not
 * written at all "plays nothing yet". A selector by role (`@melody`) finds the labels that role is written under.
 */
export function silentPartText(p: Pick<PieceRead7, "n">, ref: string): string {
  const labels = Object.keys(p.n.byTrack).filter((t) => !t.startsWith("band."));
  const fixed = LABEL_ROLES as Record<string, string | undefined>;
  const role = ref.startsWith("@") ? ref.slice(1) : null;
  const empty = (t: string) => (p.n.byTrack[t] ?? []).length === 0;
  let silent = labels.filter((t) => (role ? fixed[t] === role || t === role : t === ref) && empty(t));
  // A tune under a free label (`melody:`, `lead:`) has no fixed role: when it is silent its role cannot be inferred
  // from its notes, so any silent free-labelled part is the melody the line looks for.
  if (silent.length === 0 && role === "melody")
    silent = labels.filter((t) => fixed[t] === undefined && empty(t));
  if (silent.length > 0)
    return `\`${silent[0]}\` is written but not heard: it is silent, or more than 24 dB under the loudest part.`;
  return `\`${ref.replace(/^@/, "")}\` plays nothing yet.`;
}
const span = (from: number, to = from): BarAnchor => ({ from, to: Math.max(from, to) });

// --- JC1: the ii–Vs and the keys they reach -----------------------------------------------------------------

/**
 * Every ii–V the piece has, the key it aims at and whether it arrives, then the keys reached (JC1 asks for three).
 * A ii–V that never arrives is listed, but its key is not counted.
 */
export function twoFiveFound(p: PieceRead7, minKeys = 3): FoundItem[] {
  const pairs = twoFiveView(p.n, ctxOf(p));
  if (pairs.length === 0) return [{ text: "No ii–V yet.", anchor: null, ok: false }];
  const keys: string[] = [];
  for (const x of pairs) if (x.resolved && !keys.includes(x.target)) keys.push(x.target);
  const items: FoundItem[] = [
    {
      text:
        keys.length > 0
          ? `Keys reached: ${keys.join(", ")} (${keys.length} of ${minKeys}).`
          : "No ii–V arrives in its key yet.",
      anchor: null,
      ok: keys.length >= minKeys,
    },
  ];
  const listed = new Set<string>();
  for (const x of pairs) {
    const key = `${x.ii}|${x.v}|${x.target}|${x.resolved}`;
    if (listed.has(key) || listed.size >= 6) continue;
    listed.add(key);
    items.push({
      text: `${chordText(x.ii)}–${chordText(x.v)} into ${x.target}${x.resolved ? "" : ": the next chord goes elsewhere"}.`,
      anchor: span(x.bar, x.bar + 1),
      ok: x.resolved,
      ...(x.resolved ? {} : { keep: true }),
    });
  }
  return items;
}

// --- guide tones on the changes (JC1, JC3) -----------------------------------------------------------------

/** The time of an analysis slot in bars (0-based cycles). */
const slotTime = (s: { bar: number; beat: number }, meter: MeterId): number =>
  s.bar - 1 + (s.beat - 1) / METERS[meter].unitsPerBar;

/**
 * At each chord change, whether the melody sounds the chord's 3rd or 7th there (a note starting on the change or
 * held across it). Bars inside `bars` only, when the rule reads a stretch (JC3's bridge).
 */
export function guideTonesFound(
  p: PieceRead7,
  o: { melody: string; minRatio: number; bars?: readonly [number, number] },
): FoundItem[] {
  const slots = (p.analysis?.slots ?? []).filter(
    (s, i, all) =>
      (i === 0 || s.symbol !== all[i - 1]?.symbol) && (!o.bars || (s.bar >= o.bars[0] && s.bar <= o.bars[1])),
  );
  const mel = pitchedOf(p, o.melody);
  if (mel.length === 0) return [{ text: silentPartText(p, o.melody), anchor: null, ok: false }];
  if (slots.length === 0) return [];
  const missing: number[] = [];
  let hits = 0;
  for (const s of slots) {
    const chord = parseChordSymbol(s.symbol);
    if (!chord) continue;
    const t = slotTime(s, p.meter);
    const sounding = mel
      .filter((e) => R.toNum(e.onset) <= t + EPS && t + EPS < R.toNum(e.onset) + R.toNum(e.dur))
      .sort((a, b) => b.midi - a.midi)[0];
    const rel = sounding ? mod12(sounding.midi - chord.rootPc) : -1;
    if ([3, 4, 10, 11].includes(rel)) hits++;
    else missing.push(s.bar);
  }
  const total = hits + missing.length;
  if (total === 0) return [];
  const ratio = hits / total;
  const items: FoundItem[] = [
    {
      text: `A 3rd or a 7th on ${hits} of ${total} chord changes${o.bars ? ` in ${barsWord(o.bars[0], o.bars[1])}` : ""}.`,
      anchor: null,
      ok: ratio >= o.minRatio - EPS,
    },
  ];
  if (missing.length > 0)
    items.push({
      text: `Not on the change in ${missing.length === 1 ? "bar" : "bars"} ${listBars(missing)}.`,
      anchor: span(missing[0] as number),
      ok: false,
    });
  return items;
}

// --- JC2: one chord() pattern, the walking bass, the head ---------------------------------------------------

/** The labelled tracks of the code and the text of each (its line and the indented lines under it). */
export function trackBodies(code: string): { track: string; body: string }[] {
  const out: { track: string; body: string }[] = [];
  let cur: { track: string; body: string } | null = null;
  for (const line of code.split("\n")) {
    const m = /^([A-Za-z_$][\w$]*)\s*:\s?(.*)$/.exec(line);
    if (m && !line.startsWith("const ")) {
      cur = { track: m[1] as string, body: m[2] as string };
      out.push(cur);
    } else if (cur && /^\s+\S/.test(line)) cur.body += `\n${line}`;
    else cur = null;
  }
  return out;
}

/**
 * Which labelled tracks read one `chord(…)` pattern (JC2: the changes, the comping and the walking bass from one
 * pattern): the const or string every `chord()` call is given, and the tracks that share one.
 */
export function onePatternFound(code: string): FoundItem[] {
  const by = new Map<string, string[]>();
  for (const { track, body } of trackBodies(code)) {
    for (const m of body.matchAll(/chord\(\s*([A-Za-z_$][\w$]*|"[^"]*")\s*\)/g)) {
      const src = m[1] as string;
      const list = by.get(src) ?? [];
      if (!list.includes(track)) list.push(track);
      by.set(src, list);
    }
  }
  if (by.size === 0) return [{ text: "No `chord()` pattern yet.", anchor: null, ok: false }];
  const [src, tracks] = [...by.entries()].sort((a, b) => b[1].length - a[1].length)[0] as [string, string[]];
  const name = src.startsWith('"') ? "the same chord string" : `\`${src}\``;
  const list = tracks.map((t) => `\`${t}\``);
  return [
    tracks.length >= 2
      ? {
          text: `${list.slice(0, -1).join(", ")} and ${list.at(-1)} ${tracks.length === 2 ? "both" : "all"} read ${name}.`,
          anchor: null,
          ok: true,
        }
      : {
          text: `Only ${list[0]} reads ${name}; the other parts write their own chords.`,
          anchor: null,
          ok: false,
        },
  ];
}

/** The walking bass bar by bar: the bars that walk, then the first bars that do not and why. */
export function walkingFound(p: PieceRead7, rule: Custom): FoundItem[] {
  const view = walkingBassView(p.n, {
    ...ctxOf(p),
    bass: param(rule, "bass", "@bass") as never,
    harmony: param(rule, "harmony", "@chords") as never,
  });
  if (isNotBuilt(view) || view.length === 0) return [];
  const maxSemis = param(rule, "maxSemis", 2);
  const walks = view.filter((b) => b.quarters && b.rootOnOne);
  const items: FoundItem[] = [
    {
      text: `A note on every beat with the root on 1 in ${walks.length} of ${view.length} bars.`,
      anchor: null,
      ok: walks.length === view.length,
    },
  ];
  const problems: FoundItem[] = [];
  for (const b of view) {
    if (!b.quarters)
      problems.push({ text: `Bar ${b.bar}: not one note on each beat.`, anchor: span(b.bar), ok: false });
    else if (!b.rootOnOne)
      problems.push({
        text: `Bar ${b.bar}: beat 1 is not the chord's root.`,
        anchor: span(b.bar),
        ok: false,
      });
    else if (b.approach && b.approach.semis > maxSemis)
      problems.push({
        text: `Bar ${b.bar}: beat 4 is ${word(b.approach.semis, "half step")} from the next downbeat.`,
        anchor: span(b.bar, b.bar + 1),
        ok: false,
      });
  }
  return [...items, ...problems.slice(0, 2)];
}

/** How long the melody plays over a 12-bar form (JC2's head over two choruses). */
export function headFound(p: PieceRead7, melody = "@melody", formBars = 12, choruses = 2): FoundItem[] {
  const mel = pitchedOf(p, melody);
  if (mel.length === 0) return [{ text: silentPartText(p, melody), anchor: null, ok: false }];
  const bars = [...new Set(mel.map((e) => R.floor(e.onset)))].sort((a, b) => a - b);
  const first = bars[0] as number;
  const last = bars.at(-1) as number;
  const length = last - first + 1;
  const whole = Math.floor((length + 1) / formBars);
  return [
    {
      text: `The head plays from bar ${first + 1} to bar ${last + 1}: ${whole === 0 ? "less than one chorus" : word(whole, "chorus", "choruses")} of the ${formBars}-bar form.`,
      anchor: span(first + 1, last + 1),
      ok: whole >= choruses,
    },
  ];
}

// --- JC3: the AABA plan, the bridge's chords, the new melody -----------------------------------------------

/** The sections against an AABA plan: each section's letter and bars, and whether the order reads as the plan. */
export function formPlanFound(pattern: string, form: PieceForm | null): FoundItem[] {
  const sections = form?.sections ?? [];
  if (sections.length === 0)
    return [
      { text: `No sections yet: the plan is ${pattern.split("").join(" ")}.`, anchor: null, ok: false },
    ];
  const letters = sections.map((s) => s.letter).join("");
  const items: FoundItem[] = [
    {
      text: `The form reads ${sections.map((s) => s.letter).join(" ")}${letters === pattern ? "" : `; the plan is ${pattern.split("").join(" ")}`}.`,
      anchor: null,
      ok: letters === pattern,
    },
  ];
  for (const s of sections.slice(0, 6)) {
    const named = s.text.toUpperCase() === s.letter ? "" : ` (${s.text})`;
    const bridge = pattern === "AABA" && s.letter === "B" ? ", the bridge" : "";
    items.push({
      text: `${s.letter}${named}: ${barsWord(s.startBar + 1, s.startBar + s.bars)}${bridge}.`,
      anchor: { from: s.startBar + 1, to: s.startBar + s.bars, label: s.text },
      ok: true,
    });
  }
  return items;
}

/** The chords of a stretch of bars as the piece plays them (JC3's bridge), one per change. */
export function chordsInBarsFound(p: PieceRead7, bars: readonly [number, number]): FoundItem[] {
  const slots = (p.analysis?.slots ?? []).filter((s) => s.bar >= bars[0] && s.bar <= bars[1]);
  if (slots.length === 0)
    return [{ text: `${barsWord(bars[0], bars[1])}: no chords sound there yet.`, anchor: null, ok: false }];
  const changes = slots.filter((s, i) => i === 0 || s.symbol !== slots[i - 1]?.symbol);
  return [
    {
      text: `${barsWord(bars[0], bars[1])}: ${changes.map((s) => chordText(s.symbol)).join(" ")}.`,
      anchor: span(bars[0], bars[1]),
      ok: true,
    },
  ];
}

/** How much of the model's head a contrafact's melody repeats (JC3), from the song's own melody. */
export function contrafactFound(p: PieceRead7, rule: Custom): FoundItem[] {
  // The song's own head when its answer key is on file; else the brief's stand-in (decision 80), as the grader reads.
  const own = p.songMelody && p.songMelody.length > 0 ? p.songMelody : null;
  const standIn = own ? null : standInModel(rule.params ?? {});
  const model = own ?? standIn?.notes ?? null;
  if (!model) return [];
  const changes = param<string[] | null>(rule, "changes", null);
  const view = contrafactView(p.n, {
    ...ctxOf(p),
    changes: changes ?? (p.analysis?.slots ?? []).map((s) => s.symbol),
    model,
    melody: param(rule, "melody", "@melody") as never,
  });
  if (isNotBuilt(view)) return [];
  const max = param(rule, "maxSharedRatio", 0.5);
  const head = standIn ? standIn.name : `${p.songTitle ?? "the song"}'s head`;
  return [
    view.sharedBars.length === 0
      ? { text: `No bar of the melody repeats ${head}: the tune is yours.`, anchor: null, ok: true }
      : {
          text: `${word(view.sharedBars.length, "bar")} of the melody repeat ${head} (${listBars(view.sharedBars)}).`,
          anchor: span(view.sharedBars[0] as number),
          ok: view.sharedMelodyRatio <= max + EPS,
          keep: true,
        },
  ];
}

// --- JC4: avoid notes on strong places ----------------------------------------------------------------------

/**
 * The melody's structural notes (on a beat, or held a beat) that are avoid notes over the chord under them, with
 * their bars (JC4, AC2). Only avoid notes are named: a note the voicing leaves out is still the chord's (the 5th of
 * a dictionary voicing), so nothing is called "outside" here.
 */
export function tensionsFound(p: PieceRead7, melody = "@melody"): FoundItem[] {
  const view = tensionView(p.n, { ...ctxOf(p), melody: melody as never });
  const structural = view.filter((v) => v.structural && v.chord !== null);
  if (structural.length === 0) return [];
  const avoid = structural.filter((v) => v.avoid);
  const items: FoundItem[] = [
    avoid.length === 0
      ? {
          text: `No avoid note among the ${structural.length} melody notes on a beat or held.`,
          anchor: null,
          ok: true,
        }
      : {
          text: `${word(avoid.length, "avoid note")} among the ${structural.length} melody notes on a beat or held.`,
          anchor: null,
          ok: false,
        },
  ];
  for (const v of avoid.slice(0, 2)) {
    const bar = R.floor(v.at) + 1;
    items.push({
      text: `Bar ${bar}: ${midiName(v.midi)} over ${chordText(v.chord as string)} is its ${v.role}, an avoid note there.`,
      anchor: span(bar),
      ok: false,
    });
  }
  return items;
}

// --- RC1: the one, the bass off the grid, the stabs ---------------------------------------------------------

type OnsetsRule = Extract<RubricRule, { rule: "onsets" }>;

/** Whether a rule asks for an onset on beat 1 of every bar (RC1's "the one"). */
export function asksForTheOne(rule: RubricRule): rule is OnsetsRule {
  const contains = rule.rule === "onsets" ? (rule.contains ?? []) : [];
  return (
    rule.rule === "onsets" &&
    rule.perBar === true &&
    contains.length === 1 &&
    Array.isArray(contains[0]) &&
    contains[0][0] === 0
  );
}

/** The bars where a track (or one drum of it) sounds on the one, and the first that do not. */
export function oneFound(p: PieceRead7, rule: OnsetsRule): FoundItem[] {
  const track = String(rule.track ?? "@drums");
  const drum = "drum" in rule ? (rule.drum as string | undefined) : undefined;
  const events = selectTrack(p.n, track as never).filter((e) => !drum || e.drum === drum);
  const who = drum ? `the ${drum}` : `\`${track.replace(/^@/, "")}\``;
  if (events.length === 0)
    return [{ text: drum ? `${who} plays nothing yet.` : silentPartText(p, track), anchor: null, ok: false }];
  const on = new Set(events.filter((e) => R.toNum(R.frac(e.onset)) < EPS).map((e) => R.floor(e.onset) + 1));
  const missing = Array.from({ length: p.bars }, (_, i) => i + 1).filter((b) => !on.has(b));
  return [
    missing.length === 0
      ? {
          text: `${who} lands on the one in ${p.bars === 1 ? "its one bar" : `all ${p.bars} bars`}.`,
          anchor: null,
          ok: true,
        }
      : {
          text: `${who} lands on the one in ${p.bars - missing.length} of ${p.bars} bars; not in ${missing.length === 1 ? "bar" : "bars"} ${listBars(missing)}.`,
          anchor: span(missing[0] as number),
          ok: false,
        },
  ];
}

/** Onsets off the 8th grid, bar by bar (RC1's syncopated bass). */
export function offGridFound(p: PieceRead7, track: string): FoundItem[] {
  const events = selectTrack(p.n, track as never);
  if (events.length === 0) return [{ text: silentPartText(p, track), anchor: null, ok: false }];
  const units = METERS[p.meter].unitsPerBar * 2;
  const off = events.filter((e) => {
    const x = R.toNum(R.frac(e.onset)) * units;
    return Math.abs(x - Math.round(x)) > 1e-4;
  });
  const bars = [...new Set(off.map((e) => R.floor(e.onset) + 1))].sort((a, b) => a - b);
  return [
    off.length === 0
      ? { text: "Every bass note sits on the 8th grid.", anchor: null, ok: false }
      : {
          text: `${word(off.length, "bass note")} between the 8ths, in ${bars.length === 1 ? "bar" : "bars"} ${listBars(bars)}.`,
          anchor: span(bars[0] as number),
          ok: true,
        },
  ];
}

/** Short hits on a track (RC1's horn stabs): how many and how short. */
export function stabsFound(p: PieceRead7, track: string): FoundItem[] {
  const events = selectTrack(p.n, track as never);
  if (events.length === 0) return [{ text: silentPartText(p, track), anchor: null, ok: false }];
  const onsets = [...new Set(events.map((e) => R.str(e.onset)))].length;
  const short = events.filter((e) => R.toNum(e.clipDur ?? e.dur) <= 1 / 8 + EPS);
  const bars = [...new Set(events.map((e) => R.floor(e.onset) + 1))].sort((a, b) => a - b);
  return [
    {
      text: `\`${track}\`: ${word(onsets, "hit")} in ${bars.length} of ${word(p.bars, "bar")}, ${short.length === events.length ? "all short" : `${short.length} of ${events.length} notes an 8th or shorter`}.`,
      anchor: span(bars[0] as number),
      // Ticked only when every stab is short: "3 of 40 notes an 8th or shorter" is no stab line.
      ok: short.length === events.length,
    },
  ];
}

// --- RC2: the clave, the 3:2 layer, the Euclidean layer -----------------------------------------------------

const claveName = (c: { type: string; direction: string }) =>
  `${c.type.charAt(0).toUpperCase()}${c.type.slice(1)} clave ${c.direction}`;

/** The clave the piece plays, its direction, and the bars it holds from bar 1; the first window that breaks it. */
export function claveFound(
  p: PieceRead7,
  track: string,
  want?: { type?: string; direction?: string },
): FoundItem[] {
  const view = claveView(p.n, { ...ctxOf(p), track: track as never });
  if (!view.first) {
    const label = track.replace(/^@/, "");
    const all = selectTrack(p.n, track as never);
    const hits = all.filter((e) => R.toNum(e.onset) < 2 - EPS).length;
    // A clave played off the grid (an 8th late) or another figure is not "no clave yet": the part plays.
    return [
      {
        text:
          all.length === 0
            ? silentPartText(p, track)
            : `\`${label}\` plays ${word(hits, "hit")} in bars 1–2, but they do not make a son or rumba clave on the 8th grid.`,
        anchor: all.length === 0 ? null : span(1, 2),
        ok: false,
      },
    ];
  }
  const right =
    (!want?.type || view.first.type === want.type) &&
    (!want?.direction || view.first.direction === want.direction);
  const items: FoundItem[] = [
    {
      text: `${claveName(view.first)} from bar 1, whole for ${word(view.coveredBars, "bar")}.`,
      anchor: view.coveredBars > 0 ? span(1, view.coveredBars) : null,
      ok: right,
    },
  ];
  const broken = view.windows.find((w) => w.bar > view.coveredBars);
  if (broken)
    items.push({
      text: `${barsWord(broken.bar, broken.bar + 1)}: ${broken.clave ? `${claveName(broken.clave)}, another clave` : "the clave is not whole there"}.`,
      anchor: span(broken.bar, broken.bar + 1),
      ok: false,
      keep: true,
    });
  return items;
}

/** The bars where two parts play the asked ratio together (RC2's 3:2 layer). */
export function polyFound(
  p: PieceRead7,
  a: string,
  b: string,
  ratio: readonly [number, number],
): FoundItem[] {
  const view = polyrhythmView(p.n, { ...ctxOf(p), a: a as never, b: b as never, ratio });
  if (isNotBuilt(view) || view.length === 0) return [];
  const together = view.filter((x) => x.together).map((x) => x.bar);
  return [
    together.length === 0
      ? {
          text: `${ratio[0]} against ${ratio[1]} does not sound in any bar yet (\`${a.replace(/^@/, "")}\` against \`${b.replace(/^@/, "")}\`).`,
          anchor: null,
          ok: false,
        }
      : {
          text: `${ratio[0]} against ${ratio[1]} in ${word(together.length, "bar")}: ${listBars(together)}.`,
          anchor: span(together[0] as number),
          ok: true,
        },
  ];
}

/**
 * The tracks written with a Euclidean rhythm and the E(k, n, r) heard in their first bar; with `only`, that one track
 * (RC2's bell row reads `perc3`, never the bass's tresillo).
 */
export function euclidFound(p: PieceRead7, only?: string, want?: { k: number; n: number }): FoundItem[] {
  const out: FoundItem[] = [];
  for (const { track, body } of trackBodies(p.code)) {
    if (only !== undefined && track !== only) continue;
    if (only === undefined && !/\(\s*\d+\s*,\s*\d+|\.euclid(?:Rot|Legato)?\(/.test(body)) continue;
    if ((p.n.byTrack[track] ?? []).length === 0) {
      out.push({ text: silentPartText(p, track), anchor: null, ok: false });
      continue;
    }
    const read = [16, 8]
      .map((steps) => euclidView(p.n, { ...ctxOf(p), track: track as never, steps })[0])
      .find((b) => b?.euclid);
    out.push(
      read?.euclid
        ? {
            text: `\`${track}\`: E(${read.euclid.pulses}, ${read.euclid.steps}${read.euclid.rotation ? `, ${read.euclid.rotation}` : ""}) in bar 1.`,
            anchor: span(1),
            // Under the bell line, an even spread of other numbers (one hit on the grid reads E(1, 16)) is not it.
            ok: !want || (read.euclid.pulses === want.k && read.euclid.steps === want.n),
          }
        : { text: `\`${track}\`: its first bar is not an even spread.`, anchor: span(1), ok: false },
    );
  }
  return out.slice(0, 3);
}

// --- swing and the lean (JC1–JC3, AC2) ------------------------------------------------------------------------

/** The tracks a `swing` rule names (labels; `@drums` = the tracks with drum hits), as the piece has them. */
function swingTracks(p: PieceRead7, refs: readonly string[]): string[] {
  const all = Object.keys(p.n.byTrack).filter(
    (t) => !t.startsWith("band.") && (p.n.byTrack[t] ?? []).length > 0,
  );
  const out = new Set<string>();
  for (const r of refs) {
    if (r === "@drums") {
      for (const t of all) if ((p.n.byTrack[t] ?? []).some((e) => e.drum)) out.add(t);
    } else if (r.startsWith("@")) {
      for (const t of all) if (t === r.slice(1)) out.add(t);
    } else if (all.includes(r)) out.add(r);
  }
  return [...out];
}

/**
 * How far a track's onsets sit from the 16th grid, in milliseconds at the piece's tempo (+ behind, − ahead): the
 * median offset from the grid line at or before each onset, taken as "ahead" only when it is nearer the next line.
 * Exactly half a 16th reads as behind (`.late(1/32)` is late, not early).
 */
export function leanMsOf(p: PieceRead7, track: string): number | null {
  const es = p.n.byTrack[track] ?? [];
  if (es.length === 0) return null;
  const m = METERS[p.meter];
  const step = 1 / (m.unitsPerBar * 4);
  const offs = [...new Set(es.map((e) => R.toNum(e.onset)))].map((x) => {
    let o = x - Math.floor(x / step + 1e-9) * step;
    if (o > step / 2 + 1e-9) o -= step;
    return o;
  });
  const med = [...offs].sort((a, b) => a - b)[Math.floor(offs.length / 2)] as number;
  return lateMs(med, p.n.bpm || 120, m);
}

/** "18 ms behind the grid (a lean)": an offset in milliseconds at the piece's tempo, named by FEEL_MS. */
export function leanText(ms: number): string {
  const a = Math.abs(ms);
  const where = ms > 0 ? "behind" : "ahead of";
  const what =
    a < FEEL_MS[0] ? "on the grid" : a <= FEEL_MS[1] ? "a lean you feel" : "heard as a rhythm, not a lean";
  return `${Math.round(a)} ms ${where} the grid (${what})`;
}

/**
 * The swing of a line as a long:short ratio, on the grid the rule names (8: pairs of 8ths in a beat; 16: pairs of
 * 16ths in an 8th): the median of every pair whose long note starts on the grid. `null` with no swung pair.
 */
export function swingRatioOf(onsets: readonly number[], unitBars: number): number | null {
  const xs = [...new Set(onsets)].sort((a, b) => a - b);
  const ratios: number[] = [];
  for (const x of xs) {
    const k = Math.floor(x / unitBars + 1e-9);
    const pos = x / unitBars - k;
    if (pos > 0.05 && pos < 0.95 && xs.some((y) => Math.abs(y - k * unitBars) < 1e-6))
      ratios.push(pos / (1 - pos));
  }
  if (ratios.length === 0) return null;
  return [...ratios].sort((a, b) => a - b)[Math.floor(ratios.length / 2)] as number;
}

/**
 * The swing each named track plays, as a long:short ratio on the rule's grid (an 8th pair per beat, or a 16th pair
 * per 8th), and how far each other part sits from the grid in milliseconds at the piece's tempo.
 */
export function swingFound(
  p: PieceRead7,
  o: { tracks: readonly string[]; ratio?: readonly [number, number]; subdivision?: 8 | 16 },
): FoundItem[] {
  const names = swingTracks(p, o.tracks);
  const named = o.tracks.map((t) => `\`${t.replace(/^@/, "")}\``).join(" or ");
  if (names.length === 0) return [{ text: `${named}: nothing sounds yet.`, anchor: null, ok: false }];
  const units = METERS[p.meter].unitsPerBar;
  const unit = o.subdivision === 16 ? 1 / (units * 2) : 1 / units;
  const items: FoundItem[] = [];
  const swung = new Set<string>();
  for (const t of names) {
    const ratio = swingRatioOf(
      (p.n.byTrack[t] ?? []).map((e) => R.toNum(e.onset)),
      unit,
    );
    if (ratio === null || ratio < 1.05) continue;
    swung.add(t);
    const inside = !o.ratio || (ratio >= o.ratio[0] - 0.05 && ratio <= o.ratio[1] + 0.05);
    items.push({
      text: `\`${t}\`: swung ${o.subdivision === 16 ? "16ths" : "8ths"}, ${ratio.toFixed(1)} : 1.`,
      anchor: null,
      ok: inside,
    });
  }
  if (items.length === 0)
    items.push({
      text: `${named}: straight ${o.subdivision === 16 ? "16ths" : "8ths"}, no swung pair yet.`,
      anchor: null,
      ok: false,
    });
  // The lean of the other parts (AC2's late snare): measured, never assumed from a \`.late()\` amount.
  for (const t of Object.keys(p.n.byTrack)) {
    if (t.startsWith("band.") || swung.has(t)) continue;
    const ms = leanMsOf(p, t);
    if (ms === null || Math.abs(ms) < FEEL_MS[0]) continue;
    items.push({ text: `\`${t}\` sits ${leanText(ms)}.`, anchor: null, ok: true });
  }
  return items.slice(0, 5);
}

// --- AC2: extensions, voicings, the top voice -----------------------------------------------------------------

/** The bars whose chord carries a 9th or an 11th (or 13th), from the chord symbols the piece plays. */
export function extensionsFound(p: PieceRead7, minRatio = 0.6): FoundItem[] {
  const slots = p.analysis?.slots ?? [];
  if (slots.length === 0) return [];
  const bars = new Set<number>();
  for (const s of slots) if (/(9|11|13)/.test(s.symbol.replace(/^[A-G][#b♭♯]?/, ""))) bars.add(s.bar);
  const total = new Set(slots.map((s) => s.bar)).size;
  const without = [...new Set(slots.map((s) => s.bar))].filter((b) => !bars.has(b));
  const items: FoundItem[] = [
    {
      text: `A 9th, 11th or 13th in ${bars.size} of ${total} bars.`,
      anchor: null,
      ok: bars.size / total >= minRatio - EPS,
    },
  ];
  if (without.length > 0 && bars.size / total < minRatio)
    items.push({
      text: `Plain chords in ${without.length === 1 ? "bar" : "bars"} ${listBars(without)}.`,
      anchor: span(without[0] as number),
      ok: false,
    });
  return items;
}

const VOICING_WORD: Record<string, string> = {
  "guide-tones": "guide tones",
  shell: "shell",
  "rootless-a": "rootless A",
  "rootless-b": "rootless B",
  close: "close",
  "drop-2": "drop 2",
  spread: "spread",
  other: "your own shape",
};

/** One chord symbol a bar, from the chords the piece plays (a hand-voiced line is read against these). */
export function changesOf(p: Pick<PieceRead7, "analysis" | "bars">): string[] {
  const slots = p.analysis?.slots ?? [];
  const out: string[] = [];
  let last = slots[0]?.symbol ?? "";
  for (let b = 1; b <= p.bars; b++) {
    last = slots.find((s) => s.bar === b)?.symbol ?? last;
    out.push(last);
  }
  return out;
}
const voicingsOf = (p: PieceRead7, track: string) =>
  voicingView(p.n, { ...ctxOf(p), track: track as never, changes: changesOf(p) });

/** Each chord's voicing as written (hand-voiced), or "dictionary voicing" for a `voicing()` line. */
export function voicingsFound(p: PieceRead7, track = "@chords"): FoundItem[] {
  const view = voicingsOf(p, track);
  if (view.length === 0) return [];
  if (view.every((v) => v.dictionary))
    return [
      {
        text: "The chords come from `voicing()`: the dictionary picks every note, so the top voice is not yours to lead.",
        anchor: null,
        ok: false,
      },
    ];
  const seen = new Set<string>();
  const items: FoundItem[] = [];
  for (const v of view) {
    const k = `${v.bar}:${v.chord}`;
    if (seen.has(k)) continue;
    seen.add(k);
    items.push({
      text: `Bar ${v.bar}, ${chordText(v.chord)}: ${v.dictionary ? "dictionary voicing" : (VOICING_WORD[v.reading.type] ?? v.reading.type)}, top ${midiName(Math.max(...v.midis))}.`,
      anchor: span(v.bar),
      ok: true,
    });
  }
  return items.slice(0, 4);
}

/** The top voice from chord to chord, and the moves wider than the rule allows. */
export function topVoiceFound(p: PieceRead7, track: string, maxMove: number, minRatio: number): FoundItem[] {
  const view = voicingsOf(p, track);
  if (view.length < 2) return [];
  if (view.some((v) => v.dictionary)) return voicingsFound(p, track).slice(0, 1);
  const tops = view.map((v) => ({ bar: v.bar, top: Math.max(...v.midis) }));
  const moves: { bar: number; semis: number; wrap?: true }[] = tops
    .slice(1)
    .map((t, i) => ({ bar: t.bar, semis: Math.abs(t.top - (tops[i] as { top: number }).top) }));
  // The loop plays again: the move from the last chord back to the first is heard and the grader counts it, so a
  // line that leaves it out could tick "6 of 7" under a rule that reads 6 of 8 and stays open.
  const first = tops[0] as { bar: number; top: number };
  const last = tops.at(-1) as { bar: number; top: number };
  moves.push({ bar: first.bar, semis: Math.abs(first.top - last.top), wrap: true });
  const smooth = moves.filter((m) => m.semis <= maxMove).length;
  const wide = moves.filter((m) => m.semis > maxMove);
  const items: FoundItem[] = [
    {
      text: `Top voice ${tops
        .slice(0, 6)
        .map((t) => midiName(t.top))
        .join(
          " ",
        )}${tops.length > 6 ? " …" : ""}: ${smooth} of ${moves.length} moves are ${maxMove} half steps or less.`,
      anchor: null,
      ok: moves.length > 0 && smooth / moves.length >= minRatio - EPS,
    },
  ];
  if (wide[0])
    items.push({
      text: wide[0].wrap
        ? `Back to bar ${wide[0].bar} as the loop repeats: the top voice leaps ${word(wide[0].semis, "half step")}.`
        : `Bar ${wide[0].bar}: the top voice leaps ${word(wide[0].semis, "half step")}.`,
      anchor: span(wide[0].bar),
      ok: false,
    });
  return items;
}

// --- the extras of every Wave 7 rule ---------------------------------------------------------------------------

const toolsOf = (rule: RubricRule): string[] =>
  rule.rule === "uses" ? (Array.isArray(rule.tool) ? rule.tool : [rule.tool]).map(String) : [];

/** The extras of one rule; `[]` when the rule has nothing to add (its own line stands). */
function itemsFor(rule: RubricRule, p: PieceRead7, rules: readonly RubricRule[]): FoundItem[] {
  if (rule.rule === "custom") {
    switch (rule.fn) {
      case "ii-v-chain":
        return twoFiveFound(p, param(rule, "minKeys", 3));
      case "walking-bass":
        return walkingFound(p, rule);
      case "contrafact":
        return contrafactFound(p, rule);
      case "allowed-tensions":
        return tensionsFound(p, param(rule, "melody", "@melody"));
      case "stabs":
        return stabsFound(p, param(rule, "track", "horns"));
      case "extended-share":
        return extensionsFound(p, param(rule, "minRatio", 0.6));
      default:
        return [];
    }
  }
  if (rule.rule === "guide-tones") {
    const sec = rule.section;
    const bars = sec && typeof sec === "object" && "bars" in sec ? sec.bars : undefined;
    return guideTonesFound(p, {
      melody: String(rule.track ?? "@melody"),
      minRatio: rule.minRatio ?? 0.7,
      ...(bars ? { bars } : {}),
    });
  }
  if (rule.rule === "uses" && toolsOf(rule).some((t) => t === "tb.rootNotes" || t === "tb.set"))
    return onePatternFound(p.code);
  if (rule.rule === "uses" && toolsOf(rule).includes("tb.mini.euclid")) return euclidFound(p);
  if (
    rule.rule === "blues-form" &&
    rules.some((r) => r.id === "head" || r.label.toLowerCase().includes("head"))
  )
    return [];
  if (rule.rule === "blues-form" || rule.id === "head") return headFound(p);
  if (rule.rule === "form" && rule.pattern && /^[A-D]+$/.test(rule.pattern))
    return formPlanFound(rule.pattern, p.form);
  if (rule.rule === "progression" && "bars" in rule && Array.isArray(rule.bars))
    return chordsInBarsFound(p, rule.bars as [number, number]);
  if (asksForTheOne(rule)) return oneFound(p, rule);
  if (rule.rule === "syncopation") return offGridFound(p, String(rule.track ?? "@bass"));
  // RC1 counts the bass between the 8ths with `velocity-ghosts` on the bass (one pass of the loop): its own detail
  // speaks of ghost notes, so the bass's reading in plain words stands under it.
  if (rule.rule === "velocity-ghosts" && /bass/.test(String(rule.track ?? "")))
    return offGridFound(p, String(rule.track));
  if (rule.rule === "clave")
    return claveFound(p, String(rule.track ?? "perc"), {
      ...(rule.type ? { type: String(rule.type) } : {}),
      ...(rule.direction ? { direction: String(rule.direction) } : {}),
    });
  if (rule.rule === "polyrhythm") {
    const ratio = (rule.ratio ?? [3, 2]) as [number, number];
    return polyFound(p, String(rule.a), String(rule.b), ratio);
  }
  if (rule.rule === "euclid")
    return euclidFound(p, String(rule.track ?? "perc3"), { k: Number(rule.k), n: Number(rule.n) });
  if (rule.rule === "swing") {
    const refs = (Array.isArray(rule.track) ? rule.track : [rule.track ?? "@drums"]).map(String);
    return swingFound(p, {
      tracks: refs,
      ...(rule.ratio ? { ratio: rule.ratio as [number, number] } : {}),
      subdivision: rule.subdivision === 16 ? 16 : 8,
    });
  }
  if (rule.rule === "voice-leading" && "voice" in rule && rule.voice === "top")
    return topVoiceFound(
      p,
      String(rule.track ?? "@chords"),
      Number(rule.maxMovePerVoice ?? 2),
      Number(("minRatio" in rule ? rule.minRatio : undefined) ?? 0.8),
    );
  return [];
}

/**
 * What each Wave 7 rule shows under its label: found items with bar chips. A piece the grader cannot read yet (it
 * does not evaluate) gets nothing; a view not built yet adds nothing; a view that throws on an odd piece is quiet.
 */
export function wave7Extras(
  rules: readonly RubricRule[],
  result: GradeResult | null,
  piece: PieceRead7 | null,
): Record<string, Wave6Extra> {
  const out: Record<string, Wave6Extra> = {};
  if (!piece || result === null || result.status === "error") return out;
  for (const rule of rules) {
    let items: FoundItem[] = [];
    try {
      items = itemsFor(rule, piece, rules);
    } catch {
      items = [];
    }
    if (items.length > 0) out[rule.id] = { kind: "found", items };
  }
  return out;
}

/** The voicing card of AC2 (and JC4.S3): every chord's voicing, beside the checklist. */
export function voicingRows(p: PieceRead7, track = "@chords"): FoundItem[] {
  try {
    return voicingsFound(p, track);
  } catch {
    return [];
  }
}
