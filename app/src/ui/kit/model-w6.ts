// Pure logic behind the Wave 6 kit pieces (KeyStrip, DeviceCounter, LoudnessReadout, AlbumPlayerBar, BranchCard),
// kept apart from React so the rules are unit-tested (model-w6.test.ts). The kit names nothing musical itself: a key's
// name, how far it moved, a device's bars and a track's honest note all come in as words from their owners
// (`keyDisplay` and `keyDistance` of @oak/theory, the grader's views, the server's `TrackState.note`).

import { clockLabel } from "./model.ts";
import { barNumber, barSpanText } from "./model-w5.ts";

// --- key strip -------------------------------------------------------------------------------------

/** One stretch of a piece in one key, as the strip draws it. */
export interface KeySegment {
  /** Unique within the strip; default: the first bar. */
  id?: string;
  /** The key in force: "C major", "G Mixolydian". */
  text: string;
  /** 0-based first bar and length in bars (as `RibbonSection`). */
  startBar: number;
  bars: number;
  /** How this key was reached from the one before ("+2: up a whole step", "the relative key"); `null` on the first. */
  change?: string | null;
  /** The key heard while a player is transposed ("E major"), when it differs from the key written. */
  sounding?: string | null;
}

/** A key span as the grader's `keyPlanView` and the transcribe key plan give it: 1-based inclusive bars. */
export interface KeySpanLike {
  fromBar: number;
  toBar: number;
  text: string;
  change?: string | null;
  sounding?: string | null;
}

/**
 * Strip segments from 1-based inclusive key spans (with a pickup the pickup bar is 0, so bar 1 is index 1). Each
 * span runs to the next one's first bar, and the last to `totalBars` when that is later; a span that starts before
 * the one before it ends is cut there. Spans come out in bar order.
 */
export function keySegments(
  spans: readonly KeySpanLike[],
  opts: { pickup?: boolean; totalBars?: number } = {},
): KeySegment[] {
  const index = (bar: number) => (opts.pickup ? bar : bar - 1);
  const sorted = [...spans].sort((a, b) => a.fromBar - b.fromBar);
  return sorted.map((s, i) => {
    const start = Math.max(0, index(s.fromBar));
    const next = sorted[i + 1];
    const end = next
      ? Math.max(start + 1, index(next.fromBar))
      : Math.max(start + 1, index(s.toBar) + 1, Math.round(opts.totalBars ?? 0));
    return {
      id: `k${s.fromBar}`,
      text: s.text,
      startBar: start,
      bars: end - start,
      change: i === 0 ? null : (s.change ?? null),
      sounding: s.sounding ?? null,
    };
  });
}

/**
 * A key's name for a segment too narrow for it, as a lead sheet would abbreviate it: the home note, with "m" for a
 * minor key ("D", "Em", "D♭"); another mode keeps its first three letters ("G Mix"). The full name stays in the
 * segment's tooltip and accessible name.
 */
export function shortKeyName(text: string): string {
  const [home = "", ...rest] = text.trim().split(/\s+/);
  const mode = rest.join(" ").toLowerCase();
  if (mode === "" || mode === "major") return home;
  if (mode === "minor") return `${home}m`;
  return `${home} ${mode.charAt(0).toUpperCase()}${mode.slice(1, 3)}`;
}

/** A change's label over a narrow segment: its figure alone when it has one ("+2: up a whole step" → "+2"). */
export function shortChange(change: string): string {
  const i = change.indexOf(":");
  return i > 0 && i <= 4 ? change.slice(0, i) : change;
}

/** The bars the strip spans: the given total, or the end of the last segment when that is later. */
export function keyStripSpan(segments: readonly KeySegment[], totalBars?: number): number {
  const end = segments.reduce((m, s) => Math.max(m, s.startBar + Math.max(1, s.bars)), 0);
  return Math.max(1, Math.round(totalBars ?? 0), end);
}

/** The segment in force at a 0-based bar, or -1. */
export function keySegmentAt(segments: readonly KeySegment[], bar: number | null): number {
  if (bar === null) return -1;
  return segments.findIndex((s) => bar >= s.startBar && bar < s.startBar + Math.max(1, s.bars));
}

/** "D major, bars 25–32, +2: up a whole step, sounding E major, playing now". */
export function keySegmentName(s: KeySegment, pickup = false, playing = false): string {
  const parts = [s.text, barSpanText(s.startBar, s.bars, pickup)];
  if (s.change) parts.push(s.change);
  if (s.sounding && s.sounding !== s.text) parts.push(`sounding ${s.sounding}`);
  if (playing) parts.push("playing now");
  return parts.join(", ");
}

/**
 * The whole plan in one sentence, for the strip's accessible description and for a piece's givens:
 * "C major, then D major from bar 25 (+2: up a whole step)". One key: "C major throughout".
 */
export function keyPlanSentence(segments: readonly KeySegment[], pickup = false): string {
  if (segments.length === 0) return "";
  if (segments.length === 1) return `${(segments[0] as KeySegment).text} throughout`;
  return segments
    .map((s, i) => {
      if (i === 0) return s.text;
      const bar = barNumber(s.startBar, pickup);
      const from = bar === null ? "from the pickup" : `from bar ${bar}`;
      return s.change ? `${s.text} ${from} (${s.change})` : `${s.text} ${from}`;
    })
    .join(", then ");
}

/**
 * How a key was reached, in the course's words, from @oak/theory's `keyDistance` (`semitones` 0–11 upward,
 * `relation`): "+2: up a whole step", "+1: up a half step", "−2: down a whole step", "the relative key", "same home,
 * other mode", "a fifth up", "a fourth up"; any other move by its shorter way round ("+3 half steps", "−4 half
 * steps"). One wording for every strip and ribbon.
 */
export function keyChangeWords(d: { semitones: number; relation: string }): string {
  const up = ((Math.round(d.semitones) % 12) + 12) % 12;
  switch (d.relation) {
    case "same":
      return "the same key";
    case "relative":
      return "the relative key";
    case "parallel":
      return "same home, other mode";
    case "dominant":
      return "a fifth up";
    case "subdominant":
      return "a fourth up";
    case "up-half":
      return "+1: up a half step";
    case "up-step":
      return "+2: up a whole step";
    case "down-step":
      return "−2: down a whole step";
    default:
      if (up === 0) return "the same home";
      return up <= 6 ? `+${up} half steps` : `−${12 - up} half steps`;
  }
}

export type StripKeyAction = { kind: "move"; index: number } | { kind: "pick"; index: number } | null;

/** Arrows move between keys, Home/End go to the ends, Enter or Space picks the focused one. */
export function keyStripKey(
  e: { key: string; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean },
  index: number,
  count: number,
): StripKeyAction {
  if (count === 0 || e.altKey || e.ctrlKey || e.metaKey) return null;
  const clamp = (i: number) => Math.min(count - 1, Math.max(0, i));
  switch (e.key) {
    case "ArrowRight":
    case "ArrowDown":
      return { kind: "move", index: clamp(index + 1) };
    case "ArrowLeft":
    case "ArrowUp":
      return { kind: "move", index: clamp(index - 1) };
    case "Home":
      return { kind: "move", index: 0 };
    case "End":
      return { kind: "move", index: count - 1 };
    case "Enter":
    case " ":
      return { kind: "pick", index: clamp(index) };
    default:
      return null;
  }
}

// --- device counter --------------------------------------------------------------------------------

export interface DeviceCount {
  found: number;
  total: number;
  /** How many the rule asks for; `null` when the counter only counts. */
  need: number | null;
  /** The need is met (always true without a need). */
  met: boolean;
  /** "3 of 6 · 4 needed" while short, "5 of 6" once met or without a need. */
  text: string;
  /** For a screen reader: "3 of 6 found, 4 needed". */
  spoken: string;
}

/** The counter's numbers from its rows: found of total, against the rule's minimum when there is one. */
export function deviceCount(items: readonly { found: boolean }[], need?: number | null): DeviceCount {
  const total = items.length;
  const found = items.filter((i) => i.found).length;
  const n = need === undefined || need === null ? null : Math.max(0, Math.min(Math.round(need), total));
  const met = n === null || found >= n;
  return {
    found,
    total,
    need: n,
    met,
    text: met ? `${found} of ${total}` : `${found} of ${total} · ${n} needed`,
    spoken:
      n === null
        ? `${found} of ${total} found`
        : met
          ? `${found} of ${total} found, ${n} needed: met`
          : `${found} of ${total} found, ${n} needed`,
  };
}

/** "bar 11", "bars 11 and 27", "bars 4, 8, 12 and 3 more": where an item was found. */
export function barsListText(bars: readonly number[], max = 3): string {
  const list = [...new Set(bars)].sort((a, b) => a - b);
  if (list.length === 0) return "";
  if (list.length === 1) return `bar ${list[0]}`;
  const shown = list.slice(0, max);
  const rest = list.length - shown.length;
  if (rest > 0) return `bars ${shown.join(", ")} and ${rest} more`;
  return `bars ${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}

// --- loudness read-out -----------------------------------------------------------------------------

/** What a limiter did over a measured stretch (as `LimiterState` of @oak/audio's master meter). */
export type LimiterActivity = "resting" | "touching" | "working";

/** The state beside the limiter's bar: two words at most, so it never wraps in a narrow card. */
export const LIMITER_WORDS: Readonly<Record<LimiterActivity, string>> = {
  resting: "Resting",
  touching: "Catching peaks",
  working: "Working steadily",
};
/** The same in a sentence ("limiter …"), as CF-A's brief words it. */
export const LIMITER_PHRASES: Readonly<Record<LimiterActivity, string>> = {
  resting: "resting",
  touching: "catching the loudest hits",
  working: "working most of the time",
};

/** A level as the read-out prints it: "−14.2 dB", "+0.5 dB", "0.0 dB", "silent" (the format of @oak/audio `levelText`). */
export function dbText(db: number | null | undefined): string {
  if (db === null || db === undefined || Number.isNaN(db)) return "—";
  if (!Number.isFinite(db)) return db < 0 ? "silent" : "—";
  const r = Math.round(db * 10) / 10;
  return `${r < 0 ? "−" : r > 0 ? "+" : ""}${Math.abs(r).toFixed(1)} dB`;
}

/** A gain reduction as the read-out prints it: "0.0 dB", "2.4 dB" (never signed: it is an amount taken off). */
export function reductionText(db: number | null | undefined): string {
  if (db === null || db === undefined || !Number.isFinite(db)) return "—";
  return `${Math.abs(Math.round(db * 10) / 10).toFixed(1)} dB`;
}

/** Where a level sits on a meter from `floorDb` (empty) to `ceilDb` (full), 0 to 1; silence is 0. */
export function dbFraction(db: number | null | undefined, floorDb = -48, ceilDb = 0): number {
  if (db === null || db === undefined || Number.isNaN(db)) return 0;
  if (db === Number.NEGATIVE_INFINITY) return 0;
  if (db === Number.POSITIVE_INFINITY) return 1;
  const span = ceilDb - floorDb;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (db - floorDb) / span));
}

/** "Loudest moment −4.2 dB before the limiter; limiter resting." (the meter's value text). */
export function loudnessSentence(r: {
  peakDb: number | null;
  reductionDb?: number | null;
  limiter?: LimiterActivity | null;
}): string {
  if (r.peakDb === null || r.peakDb === Number.NEGATIVE_INFINITY) return "Nothing measured yet";
  const head = `Loudest moment ${dbText(r.peakDb)} before the limiter`;
  if (!r.limiter) return `${head}.`;
  const tail =
    r.limiter === "resting"
      ? "limiter resting"
      : `limiter ${LIMITER_PHRASES[r.limiter]}, up to ${reductionText(r.reductionDb ?? 0)} off`;
  return `${head}; ${tail}.`;
}

// --- album player bar ------------------------------------------------------------------------------

/** "3 of 12 · Four-Chord Song · 0:42 / 1:36" (content/specs/END.md "Now playing"). */
export function nowPlayingText(p: {
  index: number | null;
  total: number;
  title: string | null;
  elapsedS: number;
  durationS: number | null;
}): string {
  if (p.index === null || p.title === null) return "";
  const clock =
    p.durationS && p.durationS > 0
      ? `${clockLabel(p.elapsedS)} / ${clockLabel(p.durationS)}`
      : clockLabel(p.elapsedS);
  return `${p.index} of ${p.total} · ${p.title} · ${clock}`;
}

/** How far through the track, 0 to 1 (0 without a known length). */
export function playFraction(elapsedS: number, durationS: number | null): number {
  if (!durationS || durationS <= 0 || !Number.isFinite(elapsedS)) return 0;
  return Math.min(1, Math.max(0, elapsedS / durationS));
}

export type PlayerKeyAction = "toggle" | "prev" | "next" | "stop" | null;

/**
 * A key on the bar itself (not on one of its buttons, which act on Enter and Space as buttons do): Space plays or
 * stops, the arrows change track, Escape stops while it plays.
 */
export function playerKey(
  e: { key: string; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean },
  playing: boolean,
): PlayerKeyAction {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null;
  switch (e.key) {
    case " ":
      return "toggle";
    case "ArrowRight":
      return "next";
    case "ArrowLeft":
      return "prev";
    case "Escape":
      return playing ? "stop" : null;
    default:
      return null;
  }
}

// --- branch card -----------------------------------------------------------------------------------

/**
 * Where a track (or any branch of the course) stands: `locked` before its gate, `open` once the gate is met and
 * nothing can be started on it yet (its lessons are still being written), `ready` when a lesson can be started.
 */
export type BranchState = "locked" | "open" | "ready";

export const BRANCH_STATE_WORDS: Readonly<Record<BranchState, string>> = {
  locked: "Not open yet",
  open: "Open",
  ready: "Open",
};

/** A track's state from the server's `TrackState` (`status`, `next`): never `ready` without a lesson to start. */
export function branchState(t: { status: "locked" | "open"; next: string | null }): BranchState {
  if (t.status === "locked") return "locked";
  return t.next ? "ready" : "open";
}

/**
 * The note as the card prints it beside its state chip. The server's line for an open track begins with the state
 * ("Open. Its first lessons are still being written."); the chip already says "Open", so the card drops that word.
 */
export function branchNote(state: BranchState, note: string): string {
  const n = note.trim();
  if (state === "locked") return n;
  return n.replace(/^Open\.\s+/, "");
}

/** "Jazz Harmony: open. Its first lessons are still being written." (the card's accessible summary). */
export function branchSummary(title: string, state: BranchState, note: string): string {
  const words = BRANCH_STATE_WORDS[state].toLowerCase();
  const n = branchNote(state, note);
  return n ? `${title}: ${words}. ${n}` : `${title}: ${words}.`;
}

/** "Jazz Harmony and Advanced Rhythm", "A, B and C". */
export function listWords(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
