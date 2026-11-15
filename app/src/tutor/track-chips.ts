// Wave 7 in the panel: the advanced tracks' words as chips that light their bars and switch the matching lens on
// (wave7.md §4.2). A voicing type ([[term:a-voicing]], [[term:shell-voicing]], [[term:drop-2]]) lights the bars a
// hand voicing of that type sounds in and switches the Voicings lens on; a tension ([[term:extension]],
// [[term:avoid-note]], [[term:altered-dominant]]) the bars a melody note is that tension, the Tensions lens; the clave
// ([[term:clave]], or by type and direction, [[term:son-3-2]]) the bars that hold it, the Clave lens; a register
// ([[term:register]], [[term:spectrum]]) the bars with a clash under the low-interval limits, the Registers lens. The
// other track lenses (chord-scales, microtiming, pulse lanes, density) are switched on by their own words.
//
// The bars come from the Workbench's own Wave 7 analysis (`model.track`, kept in step by `useSubjectHarmony`), so a
// chip lights what the lens will draw. Pure: describe and test without a page.
import type { TrackLensId } from "@oak/api";
import { claveSteps, drop2, rootlessVoicing, shellVoicing } from "@oak/theory";
import { runsOf } from "./harmony-chips.ts";

/** What the Workbench found in the music on screen, per bar (display bars, 1-based). */
export interface TrackMarks {
  /** Voicing type ("shell", "rootless-a", "rootless-b", "drop-2", "close", "spread", "dictionary") → bars. */
  voicings: Record<string, number[]>;
  /** The first voiced chord of each type, as MIDI: what a voicing chip plays. */
  voicingNotes: Record<string, number[]>;
  /** A melody note's tension ("9", "♯11", "♭13") → bars; "avoid" → bars where a held one clashes. */
  tensions: Record<string, number[]>;
  /** The clave the piece plays and the bars of the two-bar windows that hold it; null when it plays none. */
  clave: { type: string; direction: string; bars: number[] } | null;
  /** Bars with two low notes closer than their limit. */
  clashes: number[];
}

/** The part of the Workbench's `WorkbenchTrack` (workbench/track-lens.ts) the marks are read from. */
export interface WorkbenchTrackLike {
  voicings?: readonly { at: number; ids: readonly string[]; label: string }[];
  tensions?: ReadonlyMap<string, { tag: string; avoid: boolean }>;
  clave?: { type: string; direction: string; windows: readonly { bar: number; holds: boolean }[] } | null;
  registers?: { clashes: readonly { bar: number }[] } | null;
}
export interface ViewEventLike {
  id: string;
  bar: number;
  midi: number | null;
}

/** The voicing lens's words (workbench `VOICING_WORDS`) as the shape IDs the chips use. */
const VOICING_IDS: Readonly<Record<string, string>> = {
  shell: "shell",
  "rootless A": "rootless-a",
  "rootless B": "rootless-b",
  "drop-2": "drop-2",
  close: "close",
  spread: "spread",
  "guide tones": "guide-tones",
  "dictionary voicing": "dictionary",
};

const uniq = (xs: readonly number[]) => [...new Set(xs)].sort((a, b) => a - b);

/** The marks of a Workbench model; null when it has no Wave 7 analysis. */
export function trackMarksOf(
  track: WorkbenchTrackLike | null | undefined,
  events: readonly ViewEventLike[] = [],
): TrackMarks | null {
  if (!track) return null;
  const byId = new Map(events.map((e) => [e.id, e]));
  const barOf = (ids: readonly string[]) => {
    for (const id of ids) {
      const e = byId.get(id);
      if (e) return e.bar;
    }
    return null;
  };
  const voicings: Record<string, number[]> = {};
  const voicingNotes: Record<string, number[]> = {};
  for (const v of track.voicings ?? []) {
    const id = VOICING_IDS[v.label];
    const bar = barOf(v.ids);
    if (!id || bar === null) continue;
    voicings[id] = uniq([...(voicings[id] ?? []), bar]);
    if (!voicingNotes[id]) {
      const midis = v.ids.map((x) => byId.get(x)?.midi).filter((m): m is number => typeof m === "number");
      if (midis.length > 1) voicingNotes[id] = [...midis].sort((a, b) => a - b);
    }
  }
  const tensions: Record<string, number[]> = {};
  for (const [id, mark] of track.tensions ?? []) {
    const bar = byId.get(id)?.bar;
    if (bar === undefined) continue;
    tensions[mark.tag] = uniq([...(tensions[mark.tag] ?? []), bar]);
    if (mark.avoid) tensions.avoid = uniq([...(tensions.avoid ?? []), bar]);
  }
  const c = track.clave ?? null;
  const clave = c
    ? {
        type: c.type,
        direction: c.direction,
        bars: uniq(c.windows.filter((w) => w.holds).flatMap((w) => [w.bar, w.bar + 1])),
      }
    : null;
  return {
    voicings,
    voicingNotes,
    tensions,
    clave,
    clashes: uniq((track.registers?.clashes ?? []).map((x) => x.bar)),
  };
}

/** What a track word is: its lens and how it finds its bars in the marks. */
export interface TrackWord {
  variant: "voicing" | "tension" | "clave" | "register" | "lens";
  lens: TrackLensId;
  /** The bars it lights; empty when the music on screen has none (or the word has no bars of its own). */
  bars: (m: TrackMarks) => number[];
  /** What it plays: the learner's own chord of that type, else a model of it on Dm7 (or G7). */
  play?: (m: TrackMarks | null) => number[][];
  /** How the hover names what lights ("rootless A voicings", "the ♯11"). */
  what: string;
}

const LENS_LABEL: Readonly<Record<TrackLensId, string>> = {
  tensions: "Tensions",
  voicings: "Voicings",
  chordScales: "Chord-scales",
  clave: "Clave",
  polyLanes: "Pulse lanes",
  microtiming: "Microtiming",
  registers: "Registers",
  density: "Density",
};
export const trackLensLabel = (id: TrackLensId): string => LENS_LABEL[id];

const ALTERED = ["♭9", "♯9", "♯11", "♭13"];
/** Dm7 in close position from D4: D F A C. */
const DM7_CLOSE = [62, 65, 69, 72] as const;
const voicing = (ids: string[], what: string, model: () => number[]): TrackWord => ({
  variant: "voicing",
  lens: "voicings",
  bars: (m) => uniq(ids.flatMap((id) => m.voicings[id] ?? [])),
  play: (m) => {
    const own = ids.map((id) => m?.voicingNotes[id]).find((x) => x && x.length > 1);
    return [own ?? model()];
  },
  what,
});

/** The track words of the glossary (content/terms.ts IDs) that a chip turns into a lens and its bars. */
export const TRACK_WORDS: Readonly<Record<string, TrackWord>> = {
  "term.shell-voicing": voicing(["shell"], "shell voicings", () => shellVoicing("Dm7")),
  "term.a-voicing": voicing(["rootless-a"], "rootless A voicings", () => rootlessVoicing("Dm7", "A")),
  "term.b-voicing": voicing(["rootless-b"], "rootless B voicings", () => rootlessVoicing("Dm7", "B")),
  "term.rootless-voicing": voicing(["rootless-a", "rootless-b"], "rootless voicings", () =>
    rootlessVoicing("Dm7", "A"),
  ),
  "term.drop-2": voicing(["drop-2"], "drop-2 voicings", () => drop2(DM7_CLOSE)),
  "term.close-position": voicing(["close"], "chords in close position", () => [...DM7_CLOSE]),
  "term.extension": {
    variant: "tension",
    lens: "tensions",
    bars: (m) => uniq(Object.entries(m.tensions).flatMap(([k, v]) => (k === "avoid" ? [] : v))),
    what: "melody notes heard as tensions",
  },
  "term.avoid-note": {
    variant: "tension",
    lens: "tensions",
    bars: (m) => m.tensions.avoid ?? [],
    what: "held notes a half step above a chord tone",
  },
  "term.altered-dominant": {
    variant: "tension",
    lens: "tensions",
    bars: (m) => uniq(ALTERED.flatMap((t) => m.tensions[t] ?? [])),
    what: "altered tensions (♭9, ♯9, ♯11, ♭13) in the melody",
  },
  "term.clave": {
    variant: "clave",
    lens: "clave",
    bars: (m) => m.clave?.bars ?? [],
    what: "two-bar windows that hold the clave",
  },
  "term.register": {
    variant: "register",
    lens: "registers",
    bars: (m) => m.clashes,
    what: "low notes too close together",
  },
  "term.spectrum": {
    variant: "register",
    lens: "registers",
    bars: (m) => m.clashes,
    what: "low notes too close together",
  },
  "term.chord-scale": { variant: "lens", lens: "chordScales", bars: () => [], what: "" },
  "term.laid-back": { variant: "lens", lens: "microtiming", bars: () => [], what: "" },
  "term.swing-ratio": { variant: "lens", lens: "microtiming", bars: () => [], what: "" },
  "term.displacement": { variant: "lens", lens: "microtiming", bars: () => [], what: "" },
  "term.polyrhythm": { variant: "lens", lens: "polyLanes", bars: () => [], what: "" },
  "term.polymeter": { variant: "lens", lens: "polyLanes", bars: () => [], what: "" },
  "term.density": { variant: "lens", lens: "density", bars: () => [], what: "" },
  "term.texture": { variant: "lens", lens: "density", bars: () => [], what: "" },
};

/** A clave named by type and direction (`son-3-2`, `rumba-2-3`, `son-clave-3-2`), or null. */
export function claveFromSlug(slug: string): { type: "son" | "rumba"; direction: "3-2" | "2-3" } | null {
  const m = /^(son|rumba)(?:-clave)?-([23])-([23])$/.exec(slug.toLowerCase());
  if (!m || m[2] === m[3]) return null;
  return { type: m[1] as "son" | "rumba", direction: `${m[2]}-${m[3]}` as "3-2" | "2-3" };
}

/** Its strokes on the two-bar grid of eighths, as the course writes them ("0 3 6 | 2 4" for son 3-2). */
export function claveText(type: "son" | "rumba", direction: "3-2" | "2-3"): string {
  const steps = claveSteps(type, direction);
  const one = steps.filter((s) => s < 8).join(" ");
  const two = steps
    .filter((s) => s >= 8)
    .map((s) => s - 8)
    .join(" ");
  return `${one} | ${two}`;
}

/** "bars 1–4 and 9" for the hover and the spoken name. */
export function barsText(bars: readonly number[]): string {
  return runsOf([...bars])
    .map((r) => (r.from === r.to ? `bar ${r.from}` : `bars ${r.from}–${r.to}`))
    .join(" and ");
}
