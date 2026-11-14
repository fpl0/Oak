// CF-A's Master step (content/specs/CF.md "What master asks"): four listening steps before the take. Levels, the
// limiter (measured: @oak/audio's master meter reads the bus before and after the limiter while the piece plays),
// room, and a reference listen against one of the learner's own released tracks at matched loudness. None of it
// gates the release; what was done goes into the liner notes ("Mastered against Chromatic Colour. Loudest moment
// −4 dB; the limiter rested."). This file is the pure part: the steps' words, which section is the loudest, which
// track is the reference, and the liner line.
import { type LoudnessMatch, loudnessWords, type MasterReading } from "@oak/audio/master-meter";

export const MASTER_MEANING =
  "Mastering is the last listen: set the levels, give the band one room, and check the song against a record you know.";

export type MasterStepId = "levels" | "limiter" | "room" | "reference";

export interface MasterStep {
  id: MasterStepId;
  title: string;
  /** What to do, in two or three sentences; backticks mark code. */
  text: string;
  /** Measured by Oak (the limiter) or ticked by the learner. */
  measured: boolean;
}

export const MASTER_STEPS: readonly MasterStep[] = [
  {
    id: "levels",
    title: "Levels",
    text: "Loop the loudest section. Solo each part, then all of them: kick and snare are the floor, the bass sits just under the kick, the chords under the tune, the tune on top. Set every part's `.gain()`. Can you hum the tune while it plays, and hear the bass change notes?",
    measured: false,
  },
  {
    id: "limiter",
    title: "The limiter",
    text: "Oak's output ends in a limiter: it catches peaks so nothing clips. It is a safety net, not a volume knob. Measure while the loudest section plays; if it works all the time, turn every `.gain()` down by the same share.",
    measured: true,
  },
  {
    id: "room",
    title: "Room",
    text: "One room for the whole band: `.room()` on the tune (.2 to .3) and the chords (.2 to .4), a little on the snare, none on the kick and the bass. `.pan()` moves two parts that crowd each other to either side.",
    measured: false,
  },
  {
    id: "reference",
    title: "A reference listen",
    text: "Hear twenty seconds of one of your own released tracks, then your chorus, at the same headphone volume. Is the single about as loud, and is its tune as clear? Then once more with the volume low.",
    measured: false,
  },
];

export interface SectionEnergy {
  /** "chorus": the section's kind, when the form names it. */
  label?: string;
  text: string;
  startBar: number;
  bars: number;
  energy: number;
}

/** Sections within this share of the loudest one's energy count as "as loud". */
export const LOUDEST_TOLERANCE = 0.15;

/**
 * The section to loop for the levels: the one with the most energy. Among sections about as loud as it, the last
 * chorus is the one (the spec's "usually the last chorus"); with no chorus among them, the last of the loudest.
 */
export function loudestSection<S extends SectionEnergy>(sections: readonly S[]): S | null {
  if (sections.length === 0) return null;
  const max = Math.max(...sections.map((s) => s.energy));
  const near = sections.filter((s) => s.energy >= max * (1 - LOUDEST_TOLERANCE) - 1e-9);
  const chorus = near.filter((s) => s.label === "chorus").at(-1);
  if (chorus) return chorus;
  return sections.filter((s) => s.energy >= max - 1e-9).at(-1) ?? null;
}

export interface ReferenceChoice {
  trackId: string;
  capstoneId: string | null;
  title: string;
  version: number;
  createdAt: string;
}

/** The reference a learner starts with: C7 "Chromatic Colour" when it has a recording, else the newest that has one. */
export function defaultReference<T extends ReferenceChoice>(tracks: readonly T[]): T | null {
  return (
    tracks.find((t) => t.capstoneId === "C7") ??
    [...tracks].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ??
    null
  );
}

/** "Your single is about as loud as Chromatic Colour." / "… 4 dB quieter than …". */
export function referenceVerdict(match: Pick<LoudnessMatch, "offsetDb">, title: string): string {
  return `Your single is ${loudnessWords(match.offsetDb)} ${title}.`;
}

/** How the reference was set for the listen: "The reference is turned down 3.0 dB so both arrive at the same level." */
export function matchWords(match: Pick<LoudnessMatch, "referenceDb" | "matched" | "residualDb">): string {
  const moved =
    Math.abs(match.referenceDb) < 0.05
      ? "Both play as they are: they are already at the same level."
      : `The reference is turned ${match.referenceDb < 0 ? "down" : "up"} ${Math.abs(match.referenceDb).toFixed(1)} dB so both arrive at the same level.`;
  return match.matched
    ? moved
    : `${moved} ${Math.abs(match.residualDb).toFixed(1)} dB of the difference is left: the reference cannot be raised further without reaching the limiter.`;
}

/**
 * The Master card's contribution to the liner notes: the reference and the measured loudest moment. Nothing when
 * neither was done; the limiter line is plain and without judgment.
 */
export function masterLinerLine(o: {
  reference: string | null;
  reading: Pick<MasterReading, "peakDb" | "limiter" | "levelDb"> | null;
}): string | null {
  const parts: string[] = [];
  if (o.reference) parts.push(`Mastered against ${o.reference}.`);
  const r = o.reading;
  if (r && Number.isFinite(r.levelDb)) {
    const peak = Number.isFinite(r.peakDb) ? `Loudest moment ${wholeDb(r.peakDb)}` : null;
    const limiter =
      r.limiter.state === "resting"
        ? "the limiter rested"
        : r.limiter.state === "touching"
          ? "the limiter caught the loudest hits"
          : "the limiter worked through the loudest section";
    parts.push(peak ? `${peak}; ${limiter}.` : `${limiter.charAt(0).toUpperCase()}${limiter.slice(1)}.`);
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

/** "−4 dB": a level rounded to the decibel, as the sleeve prints it. */
export function wholeDb(db: number): string {
  const r = Math.round(db);
  return `${r < 0 ? "−" : r > 0 ? "+" : ""}${Math.abs(r)} dB`;
}

/** The meter's bar: where a level in dB sits between −48 dB (empty) and 0 dB (full), 0 to 1. */
export function meterFill(db: number, floorDb = -48): number {
  if (!Number.isFinite(db)) return 0;
  return Math.max(0, Math.min(1, (db - floorDb) / -floorDb));
}
