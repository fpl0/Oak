// Wave 6 capstone reading (C6, C7, CF-A; contracts §6.6, content/specs/CF.md): what the checklist says about a rule
// beyond met / not yet, with the bars to look at. The mode and its colour note (C6); the secondary dominant and
// where it goes, ♭VI–♭VII–I, the key lift (C7); the devices the song has with their bars, the bridge and the length
// against two minutes (CF-A). Read from the grader's own views (`modeView`, `chromaticHarmonyView`, `keyPlanView`,
// `AnalysisSummary.deviceList`), so every numeral, key and bar is the grader's; nothing is named from a local table.
// Pure.
import type { AnalysisSummary, GradeResult, KeySpec, MeterId, RubricRule } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import { chromaticHarmonyView, type FormView, keyPlanView, modeView, type Normalized } from "@oak/grader";
import { keyDisplay } from "@oak/theory";
import { type BarAnchor, spanOf } from "./anchors.ts";
import { DEVICE_INFO, type DeviceRow, deviceRows } from "./devices.ts";
import { clock } from "./piece.ts";
import type { PieceForm, RowExtra } from "./wave5.ts";

/** One thing a rule found (or is still looking for), with the bars it sits in. */
export interface FoundItem {
  text: string;
  anchor: BarAnchor | null;
  /** `false`: the line says what is still missing. */
  ok: boolean;
  /**
   * A line that is not met but names something the piece has, at its bars (a key lift four bars long): shown even
   * when the open rule's own sentence stands above it, where the other open lines are left out.
   */
  keep?: boolean;
}

export interface PieceRead {
  n: Normalized;
  code: string;
  meter: MeterId;
  /** The brief's key, when it has one (C7); `null` lets the views read the code's own `.scale()`. */
  key: KeySpec | null;
  bars: number;
}

/** "bVII7" → "♭VII7", "viio7/ii" → "vii°7/ii": a numeral as the course prints it. */
export function prettyRn(rn: string): string {
  return rn
    .replace(/b(?=[IViv])/g, "♭")
    .replace(/#(?=[IViv])/g, "♯")
    .replace(/o/g, "°");
}

/** "bar 3", "bars 3–4". */
export const barsWord = (from: number, to: number = from): string =>
  from === to ? `bar ${from}` : `bars ${from}–${to}`;

/** "1, 3 and 5": at most `max` bars, then "and more". */
export function listBars(bars: readonly number[], max = 4): string {
  const uniq = [...new Set(bars)].sort((a, b) => a - b);
  // A run of bars with no gap reads as its span ("1–8"), never as "1, 2, 3, 4 and 4 more".
  const first = uniq[0];
  const last = uniq.at(-1);
  if (first !== undefined && last !== undefined && uniq.length >= 3 && last - first === uniq.length - 1)
    return `${first}–${last}`;
  const shown = uniq.slice(0, max).map(String);
  if (uniq.length > max) return `${shown.join(", ")} and ${uniq.length - max} more`;
  return shown.length <= 1 ? (shown[0] ?? "") : `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}`;
}

const ctxOf = (p: PieceRead) => ({ meter: p.meter, ...(p.key ? { key: p.key } : {}) });

// --- C6: the mode and its colour note ----------------------------------------------------------------

/**
 * The mode the piece is read in and where its colour note lands on a strong beat (C6's rule asks for twice or
 * more). The colour note is named by its degree ("♭7"); the bars are those of its strong-beat notes.
 */
export function modeFound(p: PieceRead): FoundItem[] {
  const view = modeView(p.n, { ...ctxOf(p), bars: p.bars });
  if (!view.stated) return [];
  const out: FoundItem[] = [];
  const c = view.characteristic;
  const name = keyDisplay(view.stated);
  if (c) {
    // Which bars hold a strong-beat colour note: the grader's own count, asked of each bar that has the note.
    const ids = new Set(c.noteIds);
    const candidates = [...new Set(p.n.all.filter((e) => ids.has(e.id)).map((e) => R.floor(e.onset)))];
    const strongBars = candidates
      .filter((b) => {
        const bar = modeView(p.n, { meter: p.meter, key: view.stated as KeySpec, span: [b, b + 1] });
        return (bar.characteristic?.strong ?? 0) > 0;
      })
      .map((b) => b + 1)
      .sort((a, b) => a - b);
    if (strongBars.length > 0)
      out.push({
        text: `${name}: its colour note ${c.display} lands on a strong beat in ${strongBars.length === 1 ? "bar" : "bars"} ${listBars(strongBars)}.`,
        anchor: spanOf(strongBars.slice(0, 1)),
        ok: strongBars.length >= 2,
      });
    else
      out.push({
        text:
          c.count > 0
            ? `${name}: its colour note ${c.display} sounds ${c.count === 1 ? "once" : `${c.count} times`}, never on beat 1 or 3 yet.`
            : `${name}: its colour note ${c.display} has not sounded yet.`,
        anchor: null,
        ok: false,
      });
  } else out.push({ text: `Read in ${name}.`, anchor: null, ok: true });
  if (view.tonicChordShare !== null)
    out.push({
      text: `The home chord is in ${Math.round(view.tonicChordShare * 100)}% of the bars.`,
      anchor: null,
      ok: view.tonicChordShare >= 0.4,
    });
  return out;
}

// --- C7: the secondary dominant and where it goes; ♭VI–♭VII–I; the lift ------------------------------------

/** Every applied chord of the piece: what it is, its bar, and whether the next chord is the one it points at. */
export function appliedFound(p: PieceRead): FoundItem[] {
  const view = chromaticHarmonyView(p.n, { ...ctxOf(p), code: p.code, bars: p.bars });
  const out: FoundItem[] = [];
  view.chords.forEach((c, i) => {
    if (c.kind !== "applied") return;
    const next = view.chords[i + 1];
    const self = `${prettyRn(c.rn)} (${c.symbol}) in bar ${c.bar}`;
    const target = c.target ? prettyRn(c.target) : null;
    if (c.resolves && next)
      out.push({
        text: `${self} resolves to ${prettyRn(next.rn)} (${next.symbol}) in bar ${next.bar}.`,
        anchor: { from: c.bar, to: Math.max(c.bar, next.bar) },
        ok: true,
      });
    else if (next)
      out.push({
        text: `${self} goes to ${prettyRn(next.rn)} (${next.symbol})${target ? `, not to ${target}` : ""}.`,
        anchor: { from: c.bar, to: Math.max(c.bar, next.bar) },
        ok: false,
      });
    else
      out.push({
        text: `${self} is the last chord${target ? `: follow it with ${target}` : ""}.`,
        anchor: { from: c.bar, to: c.bar },
        ok: false,
      });
  });
  // The ones that resolve first: they are what the rule counts.
  return [...out.filter((x) => x.ok), ...out.filter((x) => !x.ok)].slice(0, 3);
}

/** The numeral without its figures: "bVII7" → "bVII", "V7/ii" → "V/ii". */
const coreRn = (rn: string): string =>
  rn
    .split("/")
    .map((part) => /^[b#]?[IViv]+[o+ø]?/.exec(part)?.[0] ?? part)
    .join("/");

/**
 * A run of numerals in order (C7: ♭VI–♭VII–I), read in the key in force at each chord: where it is, or which of
 * its chords the piece already has.
 */
export function runFound(rn: readonly string[], p: PieceRead): FoundItem[] {
  if (rn.length === 0) return [];
  const view = chromaticHarmonyView(p.n, { ...ctxOf(p), code: p.code, bars: p.bars });
  // Repeats of one chord count once (♭VI ♭VI ♭VII I is still the run).
  const chords = view.chords.filter(
    (c, i) => i === 0 || coreRn(c.rn) !== coreRn(view.chords[i - 1]?.rn ?? ""),
  );
  const want = rn.map(coreRn);
  const label = rn.map(prettyRn).join("–");
  for (let i = 0; i + want.length <= chords.length; i++) {
    if (want.every((w, k) => coreRn(chords[i + k]?.rn ?? "") === w)) {
      const from = chords[i]?.bar ?? 1;
      const to = chords[i + want.length - 1]?.bar ?? from;
      return [{ text: `${label} in ${barsWord(from, to)}.`, anchor: { from, to }, ok: true }];
    }
  }
  const have = want.map((w) => chords.find((c) => coreRn(c.rn) === w) ?? null);
  const present = have.flatMap((c, k) =>
    c && want[k] !== "I" ? [`${prettyRn(rn[k] as string)} (${c.symbol}) in bar ${c.bar}`] : [],
  );
  const missing = have.flatMap((c, k) => (c ? [] : [prettyRn(rn[k] as string)]));
  if (present.length === 0) return [{ text: `No ${label} yet.`, anchor: null, ok: false }];
  const first = have.find((c, k) => c && want[k] !== "I");
  return [
    {
      text:
        missing.length > 0
          ? `${present.join(", ")}; ${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} not there yet.`
          : `${present.join(", ")}, but not one after the other into ${prettyRn(rn.at(-1) as string)}.`,
      anchor: first ? { from: first.bar, to: first.bar } : null,
      ok: false,
    },
  ];
}

const LIFT_WORD: Record<number, string> = {
  1: "up a half step",
  2: "up a whole step",
  10: "down a whole step",
  11: "down a half step",
};

type KeyChangeRule = Extract<RubricRule, { rule: "key-change" }>;

/** "a half or a whole step up": the distances a key-change rule asks for, in words. */
function distancesWord(semitones: readonly number[]): string {
  const words = semitones.map((s) => LIFT_WORD[s] ?? `${s} half steps up`);
  const up = words.every((w) => w.startsWith("up "));
  const bare = up ? words.map((w) => w.replace(/^up /, "")) : words;
  const list = bare.length > 1 ? `${bare.slice(0, -1).join(", ")} or ${bare.at(-1)}` : (bare[0] ?? "");
  return up ? `${list} up` : list;
}

/**
 * The key plan of the piece: each change, the bar it starts on, how far it moves and how long it lasts. The last
 * key lasts to the end of the piece (a final bar of rest is still in the new key). With the brief's rule, the last
 * change also says what it still lacks against it (the distance, the eight bars), and is then not met.
 */
export function liftFound(p: PieceRead, rule?: KeyChangeRule): FoundItem[] {
  const view = keyPlanView(p.n, { ...ctxOf(p), code: p.code });
  if (view.changes.length === 0) {
    const only = view.spans[0];
    return only ? [{ text: `One key throughout: ${keyDisplay(only.key)}.`, anchor: null, ok: false }] : [];
  }
  const last = view.changes.at(-1);
  return view.changes.slice(-2).map((c) => {
    const isLast = c === last;
    // The plan's last span stops at its last note; the key holds to the piece's last bar.
    const barsAfter = isLast ? Math.max(c.barsAfter, p.bars - c.bar + 1) : c.barsAfter;
    const how = LIFT_WORD[c.distance.semitones] ?? `${c.distance.semitones} half steps up`;
    const lacks: string[] = [];
    if (rule && isLast) {
      if (rule.semitones && rule.semitones.length > 0 && !rule.semitones.includes(c.distance.semitones))
        lacks.push(`the lift is ${distancesWord(rule.semitones)}`);
      if (rule.minBarsAfter !== undefined && barsAfter < rule.minBarsAfter)
        lacks.push(`the new key needs ${rule.minBarsAfter} bars or more to the end`);
    }
    return {
      text: `${keyDisplay(c.from)} → ${keyDisplay(c.to)} at bar ${c.bar}: ${how}, ${barsAfter} ${barsAfter === 1 ? "bar" : "bars"}${lacks.length > 0 ? `; ${lacks.join(", and ")}` : ""}.`,
      anchor: { from: c.bar, to: c.bar + Math.max(1, barsAfter) - 1 },
      ok: lacks.length === 0,
      // The change is there, at a bar the learner can play: shown even under the open rule's own sentence.
      ...(lacks.length > 0 ? { keep: true } : {}),
    };
  });
}

// --- CF-A: the bridge and the running length ---------------------------------------------------------------

/** The sections a `form` rule asks the piece to contain (CF-A: a bridge), each with its bars or "not yet". */
export function containsFound(contains: readonly string[], form: PieceForm | null): FoundItem[] {
  const names = form?.sections.map((s) => s.text.toLowerCase()).join(", ") ?? "";
  return contains.map((want) => {
    const w = want.toLowerCase();
    const s = form?.sections.find((x) => x.label === w || x.tag === w);
    if (s) {
      const from = s.startBar + 1;
      const to = s.startBar + s.bars;
      return { text: `${s.text}: ${barsWord(from, to)}.`, anchor: { from, to, label: s.text }, ok: true };
    }
    return {
      text: names
        ? `No ${w} yet. The form reads: ${names}.`
        : `No ${w} yet: name a section's consts for it (\`chords${w.charAt(0).toUpperCase()}${w.slice(1)}\`).`,
      anchor: null,
      ok: false,
    };
  });
}

/** "56 bars · 2:14 of 2:00": the running length the form strip prints (CF-A; read from the plan, never played). */
export function runningLength(
  rules: readonly RubricRule[],
  piece: { bars: number; durationSec: number | null },
): { text: string; ok: boolean } | null {
  const rule = rules.find((r) => r.rule === "duration-sec");
  if (rule?.rule !== "duration-sec" || piece.durationSec === null) return null;
  const ok = piece.durationSec >= rule.min - 1e-9;
  return { text: `${piece.bars} bars · ${clock(piece.durationSec)} of ${clock(rule.min)}`, ok };
}

// --- the extras of every Wave 6 rule ------------------------------------------------------------------------

export type Wave6Extra =
  | { kind: "found"; items: FoundItem[] }
  | { kind: "devices"; rows: DeviceRow[]; found: number; need: number };

/**
 * What each Wave 6 rule shows under its label: found items with bar chips, or the device rows. A rule the piece
 * cannot be read for yet (it does not evaluate, or has no notes) gets nothing.
 */
export function wave6Extras(
  rules: readonly RubricRule[],
  result: GradeResult | null,
  piece: (PieceRead & { form: PieceForm | null; analysis: AnalysisSummary | null }) | null,
): Record<string, Wave6Extra> {
  const out: Record<string, Wave6Extra> = {};
  if (!piece || result === null || result.status === "error") return out;
  for (const rule of rules) {
    let items: FoundItem[] = [];
    try {
      if (rule.rule === "mode") items = modeFound(piece);
      else if (rule.rule === "contains-rn" && rule.inOrder) items = runFound(rule.rn, piece);
      else if (rule.rule === "contains-rn" && rule.kind?.includes("secondary-dominant"))
        items = appliedFound(piece);
      else if (rule.rule === "key-change") items = liftFound(piece, rule);
      else if (rule.rule === "form" && rule.contains?.length)
        items = containsFound(rule.contains, piece.form);
      else if (rule.rule === "device-count") {
        const rows = deviceRows(rule.devices, piece.analysis?.deviceList ?? []);
        out[rule.id] = {
          kind: "devices",
          rows,
          found: rows.filter((r) => r.bars.length > 0).length,
          need: rule.min,
        };
        continue;
      }
    } catch {
      // A view that cannot read an odd piece says nothing; the rule's own line still stands.
      items = [];
    }
    if (items.length > 0) out[rule.id] = { kind: "found", items };
  }
  return out;
}

/**
 * The checklist's extras for a piece: Wave 5's (contrast axes, the length, the section a rule reads) with Wave 6's
 * laid over them. Wave 5's "the parts disagree" lines win: until the sections read, nothing else can be said.
 */
export function mergeExtras(
  base: Readonly<Record<string, RowExtra>>,
  w6: Readonly<Record<string, Wave6Extra>>,
): Record<string, RowExtra> {
  const out: Record<string, RowExtra> = { ...base };
  for (const [id, x] of Object.entries(w6)) {
    const b = base[id];
    if (b && (b.kind === "unread" || (b.kind === "note" && b.text === ""))) continue;
    // A naming hint on the form row stays, with the found lines under it.
    out[id] = b && b.kind === "note" && x.kind === "found" ? { ...x, note: b.text } : x;
  }
  return out;
}

/** The view a piece's sections come from, for callers that hold only the form view. */
export type { FormView };
export { DEVICE_INFO };

// --- d13: C3's lead sheet belongs to the session that works on it --------------------------------------------

/**
 * Whether the workspace shows the lead sheet of the piece: from the first session whose rules include the
 * `notates` rule (C3.S3, arranging and the lead sheet; contracts 1.6) and in every session after it, and always
 * once the sessions are done or the piece is released. Before that session the melodies are not written yet.
 */
export function showsLeadSheet(
  rules: readonly RubricRule[],
  sessionDefs: readonly { focusRules?: readonly string[] | undefined }[],
  sessionIndex: number,
  lastOrDone: boolean,
): boolean {
  const rule = rules.find((r) => r.rule === "notates" || r.id === "leadsheet");
  if (!rule) return false;
  if (lastOrDone) return true;
  const first = sessionDefs.findIndex((sd) => sd.focusRules?.includes(rule.id));
  return first >= 0 && sessionIndex >= first;
}
