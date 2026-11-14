// The six devices of the Core Finale (contracts §6.6 CF-A; content/specs/CF.md "The six devices: what counts" and
// "Your devices so far"): what each one is in the learner's words, where it was taught, the glossary term whose
// example plays when no track of theirs has it yet, the rows of the checklist's device counter ("In this song: bars
// 11 and 27") and of the card beside the brief ("In your tracks: Chromatic Colour, bars 9–10"). The devices and
// their bars are the grader's (`AnalysisSummary.deviceList`); this file only words them. Pure.
import type { AlbumTrack } from "@oak/api";
import type { DeviceName } from "@oak/content-kit";
import { SIDE_A_ORDER } from "../album/model.ts";

export interface DeviceInfo {
  /** One sentence: what counts. */
  definition: string;
  /** The lesson that taught it, and the term whose example plays for a device not yet on the record. */
  taught: string;
  term: string;
}

export const DEVICE_INFO: Readonly<Partial<Record<DeviceName, DeviceInfo>>> = {
  "secondary dominant": {
    definition: "A dominant chord aimed at a chord that is not home, and going there: E7 to Am in C.",
    taught: "U15.L02",
    term: "term.secondary-dominant",
  },
  "borrowed chord": {
    definition:
      "A chord from the minor key on the same home note, used in a major-key song: iv, ♭III, ♭VI or ♭VII. In a minor-key song: the major IV, or a major chord on home at an ending.",
    taught: "U16.L01",
    term: "term.borrowed-chord",
  },
  modulation: {
    definition:
      "The song changes key and stays there for eight bars or more: a last chorus lifted a half or a whole step, or a bridge in another key.",
    taught: "U17.L02",
    term: "term.direct-modulation",
  },
  suspension: {
    definition:
      "A note of the tune held over a chord change so that it rubs against the new chord, then steps down into it: 4 to 3, or 9 to 8.",
    taught: "U07.L05",
    term: "term.suspension",
  },
  "syncopated bass": {
    definition:
      "The bass lands between the beats and holds across the next one: pushed with `.early(1/8)`, or written off the beat.",
    taught: "U13.L01",
    term: "term.syncopation",
  },
  "modal colour": {
    definition:
      "A stretch that takes its colour from a mode: the ♭VII chord of Mixolydian in I–♭VII–IV, a Dorian groove on i and IV, the ♯4 of Lydian, the ♭2 of Phrygian.",
    taught: "U14.L01",
    term: "term.mixolydian",
  },
};

/** "Secondary dominant": a device's name as a row prints it. */
export const deviceTitle = (d: string): string => d.charAt(0).toUpperCase() + d.slice(1);

export interface DeviceHit {
  device: string;
  bar: number;
  bars?: number | undefined;
  text?: string;
}

export interface DeviceRow {
  device: string;
  title: string;
  definition: string;
  /** 1-based bars where the song has it (first bar of each occurrence), in order, without repeats. */
  bars: number[];
  /** The first occurrence as a range to light: a stretch (a key change, a modal section) keeps its length. */
  span: { from: number; to: number } | null;
}

/** One row per device the rule asks about, in the rule's order, with the bars where the song has it. */
export function deviceRows(devices: readonly string[], found: readonly DeviceHit[]): DeviceRow[] {
  return devices.map((device) => {
    const hits = found.filter((f) => f.device === device).sort((a, b) => a.bar - b.bar);
    const bars = [...new Set(hits.map((h) => h.bar))];
    const first = hits[0];
    return {
      device,
      title: deviceTitle(device),
      definition: DEVICE_INFO[device as DeviceName]?.definition ?? "",
      bars,
      span: first ? { from: first.bar, to: first.bar + Math.max(1, first.bars ?? 1) - 1 } : null,
    };
  });
}

/** "bar 11", "bars 11 and 27", "bars 4, 8, 12 and 3 more". */
export function deviceBarsText(bars: readonly number[], max = 3): string {
  if (bars.length === 0) return "";
  if (bars.length === 1) return `bar ${bars[0]}`;
  const shown = bars.slice(0, max);
  const rest = bars.length - shown.length;
  if (rest > 0) return `bars ${shown.join(", ")} and ${rest} more`;
  return `bars ${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}`;
}

/**
 * "3 of 6 · 4 needed" while the count is short, "5 of 6" once it is met: the devices the song has, of those the
 * brief names, against the rule's minimum.
 */
export function deviceCountText(found: number, total: number, need: number): string {
  return found >= need ? `${found} of ${total}` : `${found} of ${total} · ${need} needed`;
}

/** "In this song: bars 11 and 27" / "Not yet". */
export function deviceRowText(row: Pick<DeviceRow, "bars">): string {
  return row.bars.length > 0 ? `In this song: ${deviceBarsText(row.bars)}` : "Not yet";
}

/**
 * The counter in one line, for the notice after a check and the liner notes: "4 of 6: secondary dominant in bar 7,
 * borrowed chord in bar 12, …"; then which are still open while the count is short.
 */
export function deviceSummary(rows: readonly DeviceRow[], need: number): string {
  const have = rows.filter((r) => r.bars.length > 0);
  const open = rows.filter((r) => r.bars.length === 0);
  const head = `${have.length} of ${rows.length}`;
  const list = have.map((r) => `${r.device} in bar ${r.bars[0]}`).join(", ");
  const tail =
    have.length < need && open.length > 0 ? ` Still open: ${open.map((r) => r.device).join(", ")}.` : "";
  return have.length === 0 ? `${head}. No device yet.${tail}` : `${head}: ${list}.${tail}`;
}

// --- "Your devices so far": the learner's own record ---------------------------------------------------------

/** A released track's devices, read from its current version's code (the grader's `deviceList`). */
export interface TrackDevices {
  trackId: string;
  title: string;
  /** The running-order number on Side A, for the order of the card's lines. */
  no: number;
  hits: readonly DeviceHit[];
}

export interface RecordLine {
  trackId: string;
  title: string;
  /** 1-based first bar of the two bars the play button plays. */
  bar: number;
  /** "bars 9–10". */
  barsText: string;
}

export interface RecordRow extends DeviceInfo {
  device: string;
  title: string;
  /** The learner's released tracks that have it, in running order (one line a track: its first occurrence). */
  lines: RecordLine[];
}

/**
 * The card beside the brief: for each device, every released track that has it with the two bars to play, or
 * nothing (the row then says "Not on your record yet" and plays the lesson's example).
 */
export function recordRows(devices: readonly string[], tracks: readonly TrackDevices[]): RecordRow[] {
  const ordered = [...tracks].sort((a, b) => a.no - b.no);
  return devices.flatMap((device) => {
    const info = DEVICE_INFO[device as DeviceName];
    if (!info) return [];
    const lines = ordered.flatMap((t): RecordLine[] => {
      const hit = t.hits.filter((h) => h.device === device).sort((a, b) => a.bar - b.bar)[0];
      if (!hit) return [];
      const bar = Math.max(1, hit.bar);
      return [{ trackId: t.trackId, title: t.title, bar, barsText: `bars ${bar}–${bar + 1}` }];
    });
    return [{ device, title: deviceTitle(device), ...info, lines }];
  });
}

/** "Not on your record yet. Taught in U07.L05." */
export const notOnRecordText = (row: Pick<RecordRow, "taught">): string =>
  `Not on your record yet. Taught in ${row.taught}.`;

/** The released Side A tracks the card reads, in running order, the capstone being written left out. */
export function recordTracks(tracks: readonly AlbumTrack[], except: string): (AlbumTrack & { no: number })[] {
  return tracks
    .filter((t) => t.side === "A" && t.capstoneId !== null && t.capstoneId !== except)
    .map((t) => {
      const at = (SIDE_A_ORDER as readonly string[]).indexOf(t.capstoneId as string);
      return { ...t, no: at < 0 ? SIDE_A_ORDER.length + t.trackNo : at + 1 };
    })
    .sort((a, b) => a.no - b.no);
}
