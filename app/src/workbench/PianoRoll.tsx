// The piano roll (ux §3.4, architecture §2.2): an own canvas. Rows auto-ranged to the events, 1-based
// degree labels and degree colours when a key exists (note names otherwise), chord-tone emphasis, drum
// lanes for unpitched tracks, the meter's bar/beat grid, the playhead from the adapter's clock, hover
// tooltips and the link to code and staff through the HighlightBus. Layout maths: ./roll-layout.ts.
import type { KeySpec, MeterSpec } from "@oak/content-kit";
import type { BlueNote } from "@oak/theory";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { degreeCanvasFill, functionStyle } from "../ui/theme/palette.ts";
import type { AnnotationKinds } from "./annotate.ts";
import type { WorkbenchClock } from "./clock.ts";
import {
  type BandChord,
  type GuideTones,
  guideLineShort,
  guideLineText,
  type KeyRibbonSpan,
  type ModeMark,
  type PushMark,
  pushWords,
  type RollBeatGrid,
} from "./colour.ts";
import { type ChordRegion, type MelodyMark, type RangeLine, ROLE_TAG, ROLE_WORDS } from "./harmony.ts";
import type { BusState, HighlightBus } from "./highlight-bus.ts";
import { KeyRibbon } from "./KeyRibbon.tsx";
import { noteText, type RollColorMode, type RollLabelMode } from "./lens-view.ts";
import { type BassMark, blueTag, blueWords } from "./lines.ts";
import type { ViewEvent, WorkbenchModel } from "./model.ts";
import { pitchLabel, tooltipText } from "./music.ts";
import { degreeStyle, neutralSwatch, partColor, type ThemeName, themeOf } from "./palette.ts";
import {
  contentWindow,
  followWindow,
  hitTest,
  layoutRoll,
  playheadCycle,
  type RollInputEvent,
  type RollLayout,
  type RollRect,
  xOfCycle,
} from "./roll-layout.ts";
import { SectionRibbon, type SectionRibbonProps } from "./SectionRibbon.tsx";

export type { RollColorMode, RollLabelMode };

export interface GhostNote extends RollInputEvent {}

export interface PianoRollProps {
  model: WorkbenchModel;
  bus: HighlightBus;
  clock: WorkbenchClock;
  color?: RollColorMode;
  /** The gutter's row labels (and, without `noteLabels`, each note's label). */
  labels?: RollLabelMode;
  /** What each note prints (Wave 3 lenses: degree, syllable, note name, any combination). */
  noteLabels?: AnnotationKinds;
  /** Degree and syllable in hover text and the notes table (their unlocks). Default both. */
  hover?: { degree: boolean; solfege: boolean };
  /** Target notes drawn as dashed outlines (rung ≥ 3). */
  ghosts?: readonly GhostNote[];
  /** Issues without note IDs: a marker at the bar (and beat) on the ruler. */
  barMarks?: readonly { bar: number; beat: number | null; severity: "error" | "warn" | "info" }[];
  /** Tracks silenced by mute or solo: drawn faint. */
  silenced?: (track: string) => boolean;
  /** Alt+click on a note. */
  onAudition?: (e: ViewEvent) => void;
  /** Smallest window in bars (zoom to content otherwise). */
  minBars?: number;
  /** Show the analysis is not what is playing. */
  stale?: boolean;
  height?: number;
  /**
   * Long loops: show this many bars at a time and turn the page with the playhead (and by hand while
   * stopped) instead of squeezing the whole loop into the panel. Off when absent.
   */
  followBars?: number;
  /**
   * Wave 4: the chord band under the roll (ux §3.4 "Chord band"): one region per chord, labelled with its
   * symbol and (with the numeral lens) its Roman numeral, coloured by function with the function lens.
   */
  chordBand?: ChordBandProps;
  /** Wave 4: the chord-tone lens: chord tones of the melody ringed, non-chord tones dashed and tagged. */
  chordTones?: {
    marks: ReadonlyMap<string, MelodyMark>;
    percent: number | null;
    strong: { total: number; chordTones: number } | null;
  };
  /** Wave 4: the range lens: each line's lowest and highest note marked, its span in half steps. */
  ranges?: readonly RangeLine[];
  /** Wave 5: the section ribbon over the roll, on the roll's own time axis (the section lens). */
  ribbon?: Omit<SectionRibbonProps, "axis">;
  /** Wave 5: the bass-role lens (R, 5, 8, →) under each bass note. */
  bassMarks?: ReadonlyMap<string, BassMark>;
  /** Wave 5: the blue-note lens: blue notes ringed and tagged (♭3, ♭5, ♭7). */
  blueNotes?: ReadonlyMap<string, BlueNote>;
  /** Wave 6: guide tones, the beat grid with pushes, the key ribbon, the mode's colour tone (colour.ts). */
  music?: RollMusic;
}

/** What U12–U17 add to the roll (docs/design/wave6.md §4.3). Each part is drawn only when given. */
export interface RollMusic {
  /** The guide-tone lens: 3rds and 7ths marked and joined into their lines across the changes. */
  guide?: GuideTones | null;
  /** The beat-grid lens: the meter's beats with their counts (dotted-quarter beats in 6/8), triplets in thirds. */
  grid?: RollBeatGrid | null;
  /** With the beat grid: each anticipation drawn against the beat it comes in ahead of. */
  pushes?: ReadonlyMap<string, PushMark> | null;
  /** Ghost notes (the grader's `velocityGhosts`): drawn hollow and small. Loudness is always drawn by size. */
  ghosts?: ReadonlySet<string> | null;
  /** The colour tone of the mode in force, ringed and tagged (the key panel is open on a mode). */
  modeTones?: ReadonlyMap<string, ModeMark> | null;
  /** The key lens: the key in force along the timeline (drawn only when the piece changes key). */
  keys?: readonly KeyRibbonSpan[] | null;
  /** The bar that plays (0-based), for the ribbon's current key; `null` when stopped. */
  currentBar?: number | null;
  /** False before U15.L01: a gutter row outside the key shows its degree without a chromatic syllable. */
  chromaticSyllables?: boolean;
}

export interface ChordBandProps {
  regions: readonly ChordRegion[];
  /** The learner's chords, or the Band's under a learner melody. */
  source: "learner" | "band";
  symbols: boolean;
  romans: boolean;
  fn: boolean;
  /** A declared pickup: cycle 0 is bar 0, so a region's bar number is its cycle (contracts §6.11). */
  pickup?: boolean;
  /**
   * Wave 6: what each region is in its key, by index (`bandChords`): an applied chord's arrow to its target, a
   * borrowed chord's mark, a label written quieter because something is not taught yet.
   */
  chords?: readonly BandChord[];
}

/** Height of the chord band (ux §3.4: 28 px at the bottom of the roll). */
export const CHORD_BAND_PX = 28;
const FN_WORDS = { T: "tonic", PD: "predominant", D: "dominant", chromatic: "chromatic" } as const;
interface Colors {
  surface: string;
  surface2: string;
  border: string;
  text: string;
  text2: string;
  text3: string;
  link: string;
  issue: string;
  laneIn: string;
  accent: string;
  blue: string;
}

function readColors(el: Element): Colors {
  const cs = getComputedStyle(el);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    surface: v("--wb-surface", "#FFFDF8"),
    surface2: v("--wb-surface-2", "#EFE9DE"),
    border: v("--wb-border", "#DDD3C3"),
    text: v("--wb-text", "#1F1A14"),
    text2: v("--wb-text-2", "#5C5247"),
    text3: v("--wb-text-3", "#8A7F72"),
    link: v("--wb-link", "#2F6B45"),
    issue: v("--wb-issue", "#B4532A"),
    laneIn: v("--wb-lane-in", "rgba(47,107,69,.06)"),
    accent: v("--wb-accent", "#2F6B45"),
    blue: v("--wb-blue", "#0B5F8A"),
  };
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

function diamond(g: CanvasRenderingContext2D, r: RollRect): void {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  g.beginPath();
  g.moveTo(cx, r.y);
  g.lineTo(r.x + r.w, cy);
  g.lineTo(cx, r.y + r.h);
  g.lineTo(r.x, cy);
  g.closePath();
}

interface NoteStyle {
  fill: string | CanvasPattern;
  stroke: string | null;
  dashed: boolean;
  hollow: boolean;
  label: string;
  labelColor: string;
}

function noteStyle(
  e: ViewEvent,
  mode: RollColorMode,
  labels: RollLabelMode,
  theme: ThemeName,
  c: Colors,
  g: CanvasRenderingContext2D,
  kinds?: AnnotationKinds,
): NoteStyle {
  const deg = e.label?.degree;
  const labelText = (): string => {
    if (kinds) return noteText(e.label, kinds);
    if (labels === "none") return "";
    if (labels === "note" || !deg) return e.label?.display ?? e.s ?? "";
    if (labels === "degree+solfege") return `${deg.label} ${deg.syllable}`;
    return deg.label;
  };
  if (e.midi === null) {
    return {
      fill: partColor(e.trackIndex),
      stroke: null,
      dashed: false,
      hollow: false,
      label: "",
      labelColor: c.surface,
    };
  }
  if (mode === "part") {
    return {
      fill: partColor(e.trackIndex),
      stroke: null,
      dashed: false,
      hollow: false,
      label: labelText(),
      labelColor: "#FFFFFF",
    };
  }
  if (mode === "mono") {
    return {
      fill: c.text2,
      stroke: null,
      dashed: false,
      hollow: false,
      label: labelText(),
      labelColor: c.surface,
    };
  }
  const style = deg
    ? degreeStyle(deg.raw, theme)
    : { ...neutralSwatch(theme), hatchAngle: null as number | null };
  const base: NoteStyle = {
    fill: deg ? degreeCanvasFill(degreeStyle(deg.raw, theme), g) : style.fill,
    stroke: style.outline ?? null,
    dashed: false,
    hollow: false,
    label: labelText(),
    labelColor: style.label,
  };
  if (mode === "chordTone" && e.chordTone) {
    const role = e.chordTone;
    base.label = labels === "none" ? "" : role.label;
    if (role.kind === "tension")
      return { ...base, fill: c.surface, stroke: style.fill, labelColor: c.text, hollow: true };
    if (role.kind === "non")
      return {
        ...base,
        fill: c.surface,
        stroke: style.fill,
        dashed: true,
        hollow: true,
        labelColor: c.text2,
      };
    if (role.label === "5")
      return { ...base, fill: style.fill, stroke: style.outline ?? null, labelColor: style.label };
  }
  return base;
}

export function PianoRoll(props: PianoRollProps) {
  const { model, bus, clock } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(600);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [table, setTable] = useState(false);
  const busState = useRef<BusState>(bus.get());
  const playPageRef = useRef<number | null>(null);
  const frame = useRef(0);
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0]?.contentRect.width ?? 600);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const inputs = useMemo<RollInputEvent[]>(
    () =>
      model.events.map((e) => {
        const r: RollInputEvent = { id: e.id, onset: e.onset, end: e.end, midi: e.midi, track: e.track };
        if (e.s !== undefined) r.s = e.s;
        if (e.drum !== undefined) r.drum = e.drum;
        return r;
      }),
    [model],
  );

  // Long loops: a page of `followBars` bars that follows the playhead (manual page while stopped).
  const [manualPage, setManualPage] = useState(0);
  const [playPage, setPlayPage] = useState<number | null>(null);
  // A page the learner asked for while it plays (the ribbon's arrows reaching a section on another page): shown
  // until the playhead next turns the page.
  const [heldPage, setHeldPage] = useState<number | null>(null);
  const content = useMemo(
    () => contentWindow(inputs, model.bars, props.minBars ?? 1),
    [inputs, model.bars, props.minBars],
  );
  const follow =
    props.followBars && props.followBars > 0
      ? followWindow(content, props.followBars, {
          playhead: playPage === null || heldPage !== null ? null : content[0] + playPage * props.followBars,
          page: heldPage ?? manualPage,
        })
      : null;
  const followRef = useRef(follow);
  followRef.current = follow;

  const layout: RollLayout = useMemo(
    () =>
      layoutRoll(inputs, {
        width,
        meter: model.meter as MeterSpec,
        key: model.key as KeySpec | null,
        bars: model.bars,
        minBars: props.minBars ?? 1,
        ...(follow ? { window: follow.window } : {}),
        labels: props.labels ?? (model.key ? "degree" : "note"),
        extra: props.ghosts ?? [],
        pitchHeight: props.height ?? 180,
        // The beat grid writes its counts on a second line of the ruler.
        ...(props.music?.grid ? { rulerHeight: COUNT_RULER_PX } : {}),
        ...(props.music?.chromaticSyllables === false ? { lateSyllables: false } : {}),
      }),
    [
      inputs,
      width,
      model,
      props.minBars,
      props.labels,
      props.ghosts,
      props.height,
      follow?.window[0],
      follow?.window[1],
      props.music?.grid,
      props.music?.chromaticSyllables,
    ],
  );
  // Loudness by track: a note is drawn against the loudest of its own line.
  const loudest = useMemo(() => {
    const out = new Map<string, number>();
    for (const e of model.events) out.set(e.track, Math.max(out.get(e.track) ?? 0, e.gain));
    return out;
  }, [model]);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const draw = useCallback(() => {
    frame.current = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const L = layoutRef.current;
    const p = propsRef.current;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(L.width * dpr) || canvas.height !== Math.round(L.height * dpr)) {
      canvas.width = Math.round(L.width * dpr);
      canvas.height = Math.round(L.height * dpr);
      canvas.style.width = `${L.width}px`;
      canvas.style.height = `${L.height}px`;
    }
    const g = canvas.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const c = readColors(canvas);
    const theme = themeOf(document.documentElement);
    const s = busState.current;
    g.clearRect(0, 0, L.width, L.height);
    g.fillStyle = c.surface;
    g.fillRect(0, 0, L.width, L.height);
    g.font = "10px var(--font-mono, ui-monospace, monospace)";
    g.textBaseline = "middle";

    // scale lanes
    if (L.pitch) {
      for (const row of L.pitch.rows) {
        if (model.key && row.inKey) {
          g.fillStyle = c.laneIn;
          g.fillRect(L.gutter, row.y, L.width - L.gutter, L.pitch.rowH);
        } else if (model.key) {
          // 6% diagonal hatch on out-of-key rows
          g.save();
          g.beginPath();
          g.rect(L.gutter, row.y, L.width - L.gutter, L.pitch.rowH);
          g.clip();
          g.strokeStyle = c.text3;
          g.globalAlpha = 0.12;
          g.lineWidth = 1;
          for (let x = L.gutter - L.pitch.rowH; x < L.width; x += 6) {
            g.beginPath();
            g.moveTo(x, row.y + L.pitch.rowH);
            g.lineTo(x + L.pitch.rowH, row.y);
            g.stroke();
          }
          g.restore();
        }
        if (row.tonic) {
          g.strokeStyle = c.text3;
          g.globalAlpha = 0.6;
          g.beginPath();
          g.moveTo(L.gutter, row.y + L.pitch.rowH - 0.5);
          g.lineTo(L.width, row.y + L.pitch.rowH - 0.5);
          g.stroke();
          g.globalAlpha = 1;
        }
        g.fillStyle = row.tonic ? c.text : c.text2;
        g.font = `${row.tonic ? "bold " : ""}10px ui-monospace, monospace`;
        if (row.label) g.fillText(row.label, 4, row.y + L.pitch.rowH / 2);
      }
    }
    if (L.drums) {
      g.font = "10px ui-monospace, monospace";
      for (const lane of L.drums.lanes) {
        g.fillStyle = c.surface2;
        g.globalAlpha = 0.5;
        g.fillRect(L.gutter, lane.y, L.width - L.gutter, L.drums.laneH - 1);
        g.globalAlpha = 1;
        g.fillStyle = c.text2;
        g.fillText(lane.sound, 4, lane.y + L.drums.laneH / 2);
      }
    }

    // grid
    for (const line of L.grid) {
      g.strokeStyle = line.kind === "bar" ? c.text3 : c.border;
      g.globalAlpha = line.kind === "sub" ? 0.35 : line.kind === "beat" ? 0.7 : 1;
      g.lineWidth = line.kind === "bar" ? 1 : 1;
      g.beginPath();
      g.moveTo(Math.round(line.x) + 0.5, line.kind === "bar" ? 0 : L.rulerHeight);
      g.lineTo(Math.round(line.x) + 0.5, L.height);
      g.stroke();
      g.globalAlpha = 1;
      if (line.kind === "bar" && line.bar !== undefined && line.label && line.x < L.width - 8) {
        g.fillStyle = c.text2;
        g.font = "10px ui-monospace, monospace";
        g.fillText(String(line.bar), line.x + 3, Math.min(L.rulerHeight / 2, 9));
      }
    }
    // the beat-grid lens: the felt beats firm, their divisions light, the counts on the ruler's second line
    const beatGridOn = p.music?.grid ?? null;
    const counts: string[] = [];
    if (beatGridOn) {
      const pxPerBar = L.pxPerCycle;
      g.save();
      g.font = "9px ui-monospace, monospace";
      for (let b = Math.floor(L.from); b < Math.ceil(L.to); b++) {
        const lines = beatGridOn.linesOf(b);
        if (lines.length === 0) continue;
        const gap = pxPerBar / lines.length;
        for (const line of lines) {
          const cyc = b + line.at;
          if (cyc < L.from - 1e-9 || cyc >= L.to - 1e-9) continue;
          const x = Math.round(xOfCycle(L, cyc)) + 0.5;
          if (line.at > 1e-9) {
            g.strokeStyle = line.triplet ? c.accent : line.level === "beat" ? c.text3 : c.border;
            g.globalAlpha = line.level === "beat" ? 0.9 : line.triplet ? 0.55 : 0.6;
            g.lineWidth = line.level === "beat" ? 1.5 : 1;
            if (line.triplet) g.setLineDash([2, 2]);
            g.beginPath();
            g.moveTo(x, L.rulerHeight);
            g.lineTo(x, L.height);
            g.stroke();
            g.setLineDash([]);
            g.globalAlpha = 1;
          }
          if (line.label && (gap >= 13 || (line.level === "beat" && gap * beatGridOn.beats >= 13))) {
            g.fillStyle = line.level === "beat" ? c.text : line.triplet ? c.accent : c.text2;
            g.font = `${line.level === "beat" ? "bold " : ""}9px ui-monospace, monospace`;
            g.fillText(line.label, x + 2, L.rulerHeight - 7, Math.max(8, gap - 3));
            if (b === Math.floor(L.from)) counts.push(line.label);
          } else if (b === Math.floor(L.from) && line.label) counts.push(line.label);
        }
      }
      g.restore();
    }
    g.strokeStyle = c.border;
    g.beginPath();
    g.moveTo(L.gutter, L.rulerHeight - 0.5);
    g.lineTo(L.width, L.rulerHeight - 0.5);
    g.stroke();

    // ghost notes (target, rung ≥ 3): dashed outline in the target's degree colour
    if (p.ghosts && p.ghosts.length > 0) {
      const ghostLayout = layoutRoll(p.ghosts, {
        width: L.width,
        meter: model.meter,
        key: model.key,
        bars: model.bars,
        window: [L.from, L.to - L.from],
        extra: inputs,
        pitchHeight: p.height ?? 180,
      });
      g.save();
      g.setLineDash([4, 3]);
      g.lineWidth = 1.5;
      for (const r of ghostLayout.rects) {
        const ghost = p.ghosts.find((x) => x.id === r.id);
        const deg =
          ghost?.midi != null && model.key ? degreeStyle(degreeKey(ghost.midi, model), theme).fill : c.text2;
        g.strokeStyle = deg;
        const y =
          L.pitch && ghost?.midi != null
            ? L.pitch.top + (L.pitch.hi - Math.round(ghost.midi)) * L.pitch.rowH + 1
            : r.y;
        roundRect(g, r.x, y, r.w, r.h, 3);
        g.stroke();
      }
      g.restore();
    }

    // notes
    const hover = new Set(s.hover.events);
    const selected = new Set(s.selected.events);
    for (const r of L.rects) {
      const e = model.byId.get(r.id);
      if (!e) continue;
      const st = noteStyle(
        e,
        p.color ?? (model.key ? "degree" : "part"),
        p.labels ?? (model.key ? "degree" : "note"),
        theme,
        c,
        g,
        p.noteLabels,
      );
      const silent = p.silenced?.(e.track) ?? false;
      const playing = s.playing.has(e.id);
      // Loudness (Wave 6, `.velocity()`): a quieter hit of a line is drawn smaller and lighter, a ghost note
      // hollow. A line played at one level looks as it always did.
      const level = loudnessOf(e.gain, loudest.get(e.track) ?? e.gain);
      const ghost = p.music?.ghosts?.has(e.id) === true && level < 1;
      const base = silent ? 0.22 : e.band ? 0.55 : playing ? 1 : 0.8;
      g.globalAlpha = base * (level < 1 ? 0.5 + 0.5 * level : 1);
      if (playing && !silent) {
        g.shadowColor = typeof st.fill === "string" ? st.fill : c.accent;
        g.shadowBlur = 8;
      }
      const drawn = r.kind === "drum" && level < 1 ? shrink(r, 0.5 + 0.5 * level) : r;
      if (r.kind === "drum") diamond(g, drawn);
      else roundRect(g, r.x, r.y, r.w, r.h, 3);
      g.fillStyle = ghost && r.kind === "drum" ? c.surface : st.fill;
      g.fill();
      g.shadowBlur = 0;
      if (ghost && r.kind === "drum") {
        g.lineWidth = 1.5;
        g.strokeStyle = typeof st.fill === "string" ? st.fill : c.text2;
        g.stroke();
      }
      if (st.stroke) {
        g.save();
        if (st.dashed) g.setLineDash([3, 2]);
        g.lineWidth = st.hollow && !st.dashed ? 2.5 : 1;
        g.strokeStyle = st.stroke;
        g.stroke();
        g.restore();
      }
      // The tonic is "home": a firm dark edge on every degree-1 note, whatever the theme.
      const home =
        r.kind === "note" &&
        e.label?.degree?.tonic === true &&
        (p.color ?? (model.key ? "degree" : "part")) === "degree";
      if (home) {
        g.save();
        g.globalAlpha = silent ? 0.3 : 0.9;
        g.lineWidth = 2;
        g.strokeStyle = c.text;
        roundRect(g, r.x + 1, r.y + 1, Math.max(0, r.w - 2), Math.max(0, r.h - 2), 2.5);
        g.stroke();
        g.restore();
      }
      if (st.label && r.kind === "note" && r.w >= 18 && r.h >= 9) {
        g.fillStyle = st.labelColor;
        g.font = "bold 9px ui-monospace, monospace";
        g.fillText(st.label, r.x + 3, r.y + r.h / 2 + 0.5, r.w - 4);
      } else if (st.label && r.kind === "note" && r.w >= 10 && r.y - L.rulerHeight >= 9) {
        // Rows too thin to hold the text: the label sits just above its note, in the text colour.
        g.fillStyle = c.text;
        g.font = "bold 9px ui-monospace, monospace";
        g.textBaseline = "bottom";
        g.fillText(st.label, r.x + 1, r.y - 0.5, Math.max(r.w + 8, 24));
        g.textBaseline = "middle";
      }
      g.globalAlpha = 1;
      const issue = s.issues.get(e.id);
      if (issue) {
        g.save();
        g.strokeStyle = c.issue;
        g.lineWidth = 2;
        if (r.kind === "drum") diamond(g, { ...r, x: r.x - 3, y: r.y - 3, w: r.w + 6, h: r.h + 6 });
        else roundRect(g, r.x - 3, r.y - 3, r.w + 6, r.h + 6, 5);
        g.stroke();
        g.restore();
      }
      if (selected.has(e.id) || hover.has(e.id)) {
        g.save();
        g.strokeStyle = c.link;
        g.lineWidth = selected.has(e.id) ? 3 : 2;
        if (selected.has(e.id)) g.globalAlpha = 0.85;
        if (r.kind === "drum") diamond(g, { ...r, x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 });
        else roundRect(g, r.x - 1.5, r.y - 1.5, r.w + 3, r.h + 3, 4);
        g.stroke();
        g.restore();
      }
    }

    // the chord-tone lens: chord tones ringed, non-chord tones dashed with their kind above
    if (p.chordTones) {
      for (const r of L.rects) {
        const m = p.chordTones.marks.get(r.id);
        if (!m || m.role === "no-chord" || r.kind !== "note") continue;
        g.save();
        if (m.role === "chord-tone") {
          g.strokeStyle = c.accent;
          g.lineWidth = 2;
          roundRect(g, r.x - 2.5, r.y - 2.5, r.w + 5, r.h + 5, 4.5);
          g.stroke();
        } else {
          g.strokeStyle = c.text2;
          g.lineWidth = 1.5;
          g.setLineDash([3, 2]);
          roundRect(g, r.x - 2.5, r.y - 2.5, r.w + 5, r.h + 5, 4.5);
          g.stroke();
          const tag = ROLE_TAG[m.role];
          if (tag && r.y - L.rulerHeight >= 12) {
            g.setLineDash([]);
            g.fillStyle = c.text;
            g.font = "bold 9px ui-monospace, monospace";
            g.textBaseline = "bottom";
            g.fillText(tag, r.x, r.y - 3);
            g.textBaseline = "middle";
          }
        }
        g.restore();
      }
    }

    // the blue-note lens: a ring in the blue colour and the note's flat degree over it
    if (p.blueNotes && p.blueNotes.size > 0) {
      for (const r of L.rects) {
        const b = p.blueNotes.get(r.id);
        if (!b || r.kind !== "note") continue;
        g.save();
        g.strokeStyle = c.blue;
        g.lineWidth = 2;
        roundRect(g, r.x - 2, r.y - 2, r.w + 4, r.h + 4, 4);
        g.stroke();
        if (r.y - L.rulerHeight >= 11) {
          g.fillStyle = c.blue;
          g.font = "bold 9px ui-monospace, monospace";
          g.textBaseline = "bottom";
          g.fillText(blueTag(b), r.x, r.y - 3);
          g.textBaseline = "middle";
        }
        g.restore();
      }
    }

    // the mode's colour tone (the key panel open on a mode): ringed, with its degree over it
    const modeTones = p.music?.modeTones;
    if (modeTones && modeTones.size > 0) {
      for (const r of L.rects) {
        const m = modeTones.get(r.id);
        if (!m || r.kind !== "note") continue;
        g.save();
        g.strokeStyle = c.issue;
        g.lineWidth = 2;
        roundRect(g, r.x - 2, r.y - 2, r.w + 4, r.h + 4, 4);
        g.stroke();
        if (r.y - L.rulerHeight >= 11) {
          g.fillStyle = c.issue;
          g.font = "bold 9px ui-monospace, monospace";
          g.textBaseline = "bottom";
          g.fillText(m.display, r.x, r.y - 3);
          g.textBaseline = "middle";
        }
        g.restore();
      }
    }

    // the guide-tone lens: the line the 3rds and 7ths make across the changes, then a tag on each of them
    const guide = p.music?.guide;
    if (guide && L.pitch) {
      const pitchTop = L.pitch.top;
      const hi = L.pitch.hi;
      const lo = L.pitch.lo;
      const rowH = L.pitch.rowH;
      const yOf = (midi: number) => pitchTop + (hi - midi) * rowH + rowH / 2;
      guide.lines.forEach((line, li) => {
        const path = () => {
          g.beginPath();
          let pen = false;
          for (const pt of line) {
            // A chord whose voicing leaves the guide tone out breaks the line; so does a row off the roll.
            if (pt.eventId === null || pt.midi > hi || pt.midi < lo || pt.to <= L.from) {
              pen = false;
              continue;
            }
            if (pt.from >= L.to) break;
            const x0 = xOfCycle(L, Math.max(L.from, pt.from));
            const x1 = xOfCycle(L, Math.min(L.to, pt.to));
            const y = yOf(pt.midi);
            if (pen) g.lineTo(x0, y);
            else g.moveTo(x0, y);
            g.lineTo(x1, y);
            pen = true;
          }
        };
        g.save();
        g.lineJoin = "round";
        // A light edge under the line keeps it readable over a note of any colour.
        g.strokeStyle = c.surface;
        g.lineWidth = 5;
        g.globalAlpha = 0.9;
        path();
        g.stroke();
        g.strokeStyle = c.text;
        g.lineWidth = 2;
        g.globalAlpha = 1;
        if (li === 1) g.setLineDash([6, 3]);
        path();
        g.stroke();
        g.restore();
      });
      for (const r of L.rects) {
        const m = guide.marks.get(r.id);
        if (!m || r.kind !== "note") continue;
        g.save();
        const w = 11;
        const x = r.x + r.w - w - 1;
        if (r.w >= w + 4) {
          g.fillStyle = c.text;
          roundRect(g, x, r.y + 1, w, Math.max(6, r.h - 2), 2.5);
          g.fill();
          g.fillStyle = c.surface;
          g.font = "bold 8px ui-monospace, monospace";
          g.fillText(m.tag, x + 3, r.y + r.h / 2 + 0.5);
        } else {
          g.strokeStyle = c.text;
          g.lineWidth = 2;
          roundRect(g, r.x - 1.5, r.y - 1.5, r.w + 3, r.h + 3, 4);
          g.stroke();
        }
        g.restore();
      }
    }

    // pushes against the grid: a bracket from where the note comes in to the beat it anticipates
    const pushes = beatGridOn || p.music?.pushes ? (p.music?.pushes ?? null) : null;
    if (pushes && pushes.size > 0) {
      const seen = new Set<string>();
      for (const r of L.rects) {
        const pm = pushes.get(r.id);
        if (!pm || pm.beat < L.from || pm.beat > L.to) continue;
        const xb = Math.round(xOfCycle(L, pm.beat)) + 0.5;
        // One bracket per pushed onset and row, not one per note of a chord drawn on the same row.
        const key = `${Math.round(r.x)}:${Math.round(r.y)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        g.save();
        g.strokeStyle = c.issue;
        g.fillStyle = c.issue;
        g.lineWidth = 1.5;
        const y = r.y - 2.5;
        g.beginPath();
        g.moveTo(r.x, y + 3);
        g.lineTo(r.x, y);
        g.lineTo(xb, y);
        g.stroke();
        // the beat it comes in ahead of: a tick through the note
        g.setLineDash([2, 2]);
        g.beginPath();
        g.moveTo(xb, y);
        g.lineTo(xb, r.y + r.h + 2);
        g.stroke();
        g.restore();
      }
    }

    // the key lens: a line through the roll where the key changes
    for (const k of p.music?.keys ?? []) {
      if (!k.change || k.from <= L.from || k.from >= L.to) continue;
      const x = Math.round(xOfCycle(L, k.from)) + 0.5;
      g.save();
      g.strokeStyle = c.blue;
      g.lineWidth = 2;
      g.setLineDash([6, 3]);
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, L.height);
      g.stroke();
      g.restore();
    }

    // the bass-role lens: R, 5, 8, 3, 7 or → just under each bass note
    if (p.bassMarks && p.bassMarks.size > 0) {
      for (const r of L.rects) {
        const m = p.bassMarks.get(r.id);
        if (!m || r.kind !== "note") continue;
        const y = Math.min(L.height - 6, r.y + r.h + 7);
        g.save();
        g.font = "bold 9px ui-monospace, monospace";
        g.textBaseline = "middle";
        const w = g.measureText(m.tag).width + 6;
        g.fillStyle = c.surface;
        g.globalAlpha = 0.9;
        roundRect(g, r.x, y - 6, w, 12, 3);
        g.fill();
        g.globalAlpha = 1;
        g.strokeStyle = m.role === "approach" ? c.accent : c.text3;
        g.lineWidth = 1;
        g.stroke();
        g.fillStyle = c.text;
        g.fillText(m.tag, r.x + 3, y + 0.5);
        g.restore();
      }
    }

    // the range lens: a flag over each line's high point, a mark under its low point
    for (const line of p.ranges ?? []) {
      const hi = L.rects.find((r) => r.id === line.high.id);
      const lo = L.rects.find((r) => r.id === line.low.id);
      g.save();
      g.fillStyle = c.accent;
      if (hi) {
        g.beginPath();
        g.moveTo(hi.x + hi.w / 2 - 5, hi.y - 3);
        g.lineTo(hi.x + hi.w / 2 + 5, hi.y - 3);
        g.lineTo(hi.x + hi.w / 2, hi.y - 9);
        g.closePath();
        g.fill();
      }
      if (lo && line.span > 0) {
        g.beginPath();
        g.moveTo(lo.x + lo.w / 2 - 5, lo.y + lo.h + 3);
        g.lineTo(lo.x + lo.w / 2 + 5, lo.y + lo.h + 3);
        g.lineTo(lo.x + lo.w / 2, lo.y + lo.h + 9);
        g.closePath();
        g.fill();
      }
      g.restore();
    }

    // bar-level issue markers on the ruler
    for (const m of p.barMarks ?? []) {
      const at = m.bar - 1 + ((m.beat ?? 1) - 1) / model.meter.unitsPerBar;
      if (at < L.from || at > L.to) continue;
      const x = xOfCycle(L, at);
      g.fillStyle = c.issue;
      g.beginPath();
      g.moveTo(x - 5, 2);
      g.lineTo(x + 5, 2);
      g.lineTo(x, L.rulerHeight - 3);
      g.closePath();
      g.fill();
    }

    // playhead
    const f = clock.get();
    if (f.playing) {
      const at = playheadCycle(f.audibleCycle, model.bars);
      if (at >= L.from && at <= L.to) {
        const x = Math.round(xOfCycle(L, at)) + 0.5;
        g.strokeStyle = c.accent;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, L.height);
        g.stroke();
      }
    }
    if (canvas.dataset) {
      canvas.dataset.playhead = f.playing ? playheadCycle(f.audibleCycle, model.bars).toFixed(3) : "";
      canvas.dataset.counts = counts.join(" ");
    }
  }, [model, clock, inputs, loudest]);

  const invalidate = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(draw);
  }, [draw]);

  useEffect(() => {
    invalidate();
  }, [
    invalidate,
    layout,
    props.ghosts,
    props.barMarks,
    props.color,
    props.labels,
    props.noteLabels,
    props.silenced,
    props.chordTones,
    props.ranges,
    props.bassMarks,
    props.blueNotes,
    props.music,
  ]);
  useEffect(
    () =>
      bus.subscribe((s) => {
        busState.current = s;
        // Mirrors of the bus on the DOM: tests and the a11y tree read what the roll lights, in the same tick.
        const el = wrapRef.current;
        if (el) {
          el.dataset.active = [...s.playing].sort().join(" ");
          el.dataset.selected = s.selected.events.join(" ");
        }
        invalidate();
      }),
    [bus, invalidate],
  );
  useEffect(
    () =>
      clock.subscribe((f) => {
        const pageBars = propsRef.current.followBars;
        if (pageBars && pageBars > 0 && followRef.current) {
          const next = f.playing
            ? (followWindow(content, pageBars, {
                playhead: playheadCycle(f.audibleCycle, model.bars),
                page: 0,
              })?.page ?? null)
            : null;
          if (next !== playPageRef.current) {
            playPageRef.current = next;
            setPlayPage(next);
            setHeldPage(null);
            if (next !== null) setManualPage(next);
          }
        }
        invalidate();
      }),
    [clock, invalidate, content, model.bars],
  );
  useEffect(() => {
    const mo = new MutationObserver(() => invalidate());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      mo.disconnect();
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [invalidate]);

  const pointAt = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    const r = ev.currentTarget.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };
  const onMove = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    const pt = pointAt(ev);
    const id = hitTest(layout, pt.x, pt.y);
    if (id) {
      const e = model.byId.get(id);
      bus.hover({ events: [id] }, "roll");
      if (e) {
        const text = tooltipText(
          {
            midi: e.midi,
            track: e.track,
            bar: e.bar,
            beatLabel: e.beatLabel,
            ...(e.s === undefined ? {} : { s: e.s }),
            ...(e.chordSymbol === undefined ? {} : { chordSymbol: e.chordSymbol }),
            label: e.label,
          },
          model.key,
          props.hover ?? { degree: true, solfege: true },
        );
        const role = props.chordTones?.marks.get(id)?.role;
        const bass = props.bassMarks?.get(id);
        const blue = props.blueNotes?.get(id);
        const guide = props.music?.guide?.marks.get(id);
        const mode = props.music?.modeTones?.get(id);
        const push = props.music?.pushes?.get(id);
        const ghost = props.music?.ghosts?.has(id);
        setTip({
          x: pt.x,
          y: pt.y,
          text: [
            text,
            role && role !== "no-chord" ? ROLE_WORDS[role] : null,
            bass ? `bass: ${bass.words}` : null,
            blue ? blueWords(blue) : null,
            guide ? `guide tone: ${guide.words}` : null,
            mode ? `${mode.display}: the colour note of ${mode.mode}` : null,
            push ? pushWords(push, model.meter.unitsPerBar) : null,
            ghost ? "ghost note: played very quietly" : null,
          ]
            .filter(Boolean)
            .join(" · "),
        });
      }
    } else {
      if (bus.get().hover.source === "roll") bus.hover(null, "roll");
      setTip(null);
    }
  };
  const onLeave = () => {
    if (bus.get().hover.source === "roll") bus.hover(null, "roll");
    setTip(null);
  };
  const onClick = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    const pt = pointAt(ev);
    const id = hitTest(layout, pt.x, pt.y);
    if (!id) {
      bus.select(null, "roll");
      return;
    }
    const e = model.byId.get(id);
    if (ev.altKey && e) {
      props.onAudition?.(e);
      return;
    }
    bus.select({ events: [id] }, "roll");
  };

  const guideLines = (props.music?.guide?.lines ?? []).map(guideLineText).filter((t) => t.includes("→"));

  return (
    <div className="oak-roll" ref={wrapRef} data-testid="piano-roll">
      <div className="oak-view-head">
        {follow ? (
          <span className="oak-roll-pager" data-testid="roll-pager">
            <button
              type="button"
              className="oak-link-button"
              aria-label="Roll: earlier bars"
              disabled={follow.page <= 0 || playPage !== null}
              onClick={() => setManualPage(Math.max(0, follow.page - 1))}
            >
              ‹
            </button>
            <span aria-live="polite">
              Bars {follow.window[0] + 1}–{follow.window[0] + follow.window[1]} of {content[1]}
            </span>
            <button
              type="button"
              className="oak-link-button"
              aria-label="Roll: later bars"
              disabled={follow.page >= follow.pages - 1 || playPage !== null}
              onClick={() => setManualPage(Math.min(follow.pages - 1, follow.page + 1))}
            >
              ›
            </button>
          </span>
        ) : null}
        {props.chordTones ? (
          <span className="oak-roll-fact" data-testid="chord-tone-pct">
            {props.chordTones.percent === null
              ? "No melody notes on strong beats under a chord yet"
              : `Chord tones on strong beats: ${props.chordTones.strong?.chordTones ?? 0} of ${props.chordTones.strong?.total ?? 0} · ${props.chordTones.percent}%`}
          </span>
        ) : null}
        {props.ranges && props.ranges.length > 0 ? (
          <span className="oak-roll-fact" data-testid="range-facts">
            {props.ranges.map((r) => rangeText(r, model)).join(" · ")}
          </span>
        ) : props.ranges ? (
          <span className="oak-roll-fact" data-testid="range-facts">
            No melody line to measure yet
          </span>
        ) : null}
        {guideLines.length > 0 ? (
          <span
            className="oak-roll-fact"
            data-testid="guide-facts"
            title={`Guide tones: ${guideLines.join(" · ")}`}
          >
            Guide tones:{" "}
            {(props.music?.guide?.lines ?? [])
              .map((l) => guideLineShort(l))
              .filter((t) => t.includes("→"))
              .join(" · ")}
          </span>
        ) : null}
        {props.music?.grid ? (
          <span className="oak-roll-fact" data-testid="beat-grid-facts">
            {props.music.grid.text}
          </span>
        ) : null}
        {props.stale ? (
          <span className="oak-badge" data-testid="roll-stale">
            preview · not playing
          </span>
        ) : null}
        <button
          type="button"
          className="oak-link-button"
          aria-pressed={table}
          onClick={() => setTable((t) => !t)}
        >
          Notes table
        </button>
      </div>
      {props.ribbon ? (
        <SectionRibbon
          {...props.ribbon}
          {...(follow && props.followBars
            ? {
                onReveal: (bar: number) => {
                  const page = Math.max(
                    0,
                    Math.min(follow.pages - 1, Math.floor((bar - content[0]) / (props.followBars as number))),
                  );
                  if (playPage !== null) setHeldPage(page);
                  else setManualPage(page);
                },
              }
            : {})}
          axis={{
            left: layout.gutter,
            width: layout.width,
            from: layout.from,
            to: layout.to,
            xOf: (c) => xOfCycle(layout, c),
          }}
        />
      ) : null}
      {props.music?.keys && props.music.keys.length > 1 ? (
        <KeyRibbon
          spans={props.music.keys}
          currentBar={props.music.currentBar ?? null}
          pickup={props.chordBand?.pickup === true || props.ribbon?.pickup === true}
          axis={{
            left: layout.gutter,
            width: layout.width,
            from: layout.from,
            to: layout.to,
            xOf: (c) => xOfCycle(layout, c),
          }}
        />
      ) : null}
      <canvas
        ref={canvasRef}
        className="oak-roll-canvas"
        role="img"
        aria-label={[
          `Piano roll, ${model.events.length} notes in ${model.bars} bars`,
          guideLines.length > 0 ? `guide tones ${guideLines.join("; ")}` : null,
          props.music?.grid ? props.music.grid.text : null,
        ]
          .filter(Boolean)
          .join(". ")}
        data-guide={props.music?.guide ? props.music.guide.marks.size : undefined}
        data-guide-lines={guideLines.length > 0 ? guideLines.join(" | ") : undefined}
        data-beat-grid={props.music?.grid ? (props.music.grid.compound ? "compound" : "triplets") : undefined}
        data-pushes={props.music?.pushes ? props.music.pushes.size : undefined}
        data-ghosts={props.music?.ghosts ? props.music.ghosts.size : undefined}
        data-mode-tones={props.music?.modeTones ? props.music.modeTones.size : undefined}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        onClick={onClick}
        data-testid="roll-canvas"
        data-notes={layout.rects.length}
        data-window={`${layout.from}-${layout.to}`}
      />
      {props.chordBand ? <ChordBand band={props.chordBand} layout={layout} /> : null}
      {tip ? (
        <div
          className="oak-tooltip"
          role="tooltip"
          style={{ left: tip.x + 12, top: tip.y + 12 }}
          data-testid="roll-tooltip"
        >
          {tip.text}
        </div>
      ) : null}
      {table ? (
        <NotesTable model={model} bus={bus} show={props.hover ?? { degree: true, solfege: true }} />
      ) : null}
    </div>
  );
}

/** The ruler's height when the beat grid writes its counts under the bar numbers. */
export const COUNT_RULER_PX = 32;

/**
 * How loud a hit is against the loudest of its line, 0.3 … 1; 1 for a line played at one level (within 10 %), so
 * only a line that uses `.velocity()` or a patterned `.gain()` is drawn by loudness.
 */
export function loudnessOf(gain: number, loudest: number): number {
  if (!(loudest > 0) || gain >= loudest * 0.9) return 1;
  return Math.max(0.3, Math.min(1, gain / loudest));
}

function shrink(r: RollRect, f: number): RollRect {
  const w = r.w * f;
  const h = r.h * f;
  return { ...r, x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h };
}

function rangeText(r: RangeLine, model: WorkbenchModel): string {
  const name = (midi: number) => pitchLabel(midi, model.key).display;
  return `${r.track}: ${name(r.low.midi)}–${name(r.high.midi)}, ${r.span} half step${r.span === 1 ? "" : "s"}, high point bar ${r.high.bar}`;
}

/** The chord band (DOM, so its labels are text): regions placed with the roll's own time axis. */
function ChordBand({ band, layout }: { band: ChordBandProps; layout: RollLayout }) {
  const [theme, setTheme] = useState<ThemeName>(() => themeOf(document.documentElement));
  useEffect(() => {
    const mo = new MutationObserver(() => setTheme(themeOf(document.documentElement)));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  const visible = band.regions.filter((r) => r.to > layout.from + 1e-9 && r.from < layout.to - 1e-9);
  // A label is shown whole or not at all: a region too narrow for "C♯m7 iii7" drops the numeral, then the symbol
  // (its title and accessible name still say both). Clipped text would read as another chord ("C♯m7" as "C").
  const ref = useRef<HTMLUListElement>(null);
  useLayoutEffect(() => {
    for (const li of ref.current?.querySelectorAll<HTMLElement>("li.oak-chord-region") ?? []) {
      li.dataset.fit = "all";
      if (li.scrollWidth <= li.clientWidth + 0.5) continue;
      // Wave 6: the arrow's target and the "borrowed" word go first (the border and the title still say them).
      li.dataset.fit = "rn";
      if (li.scrollWidth <= li.clientWidth + 0.5) continue;
      li.dataset.fit = "symbol";
      if (li.scrollWidth > li.clientWidth + 0.5) li.dataset.fit = "none";
    }
  });
  return (
    <ul
      ref={ref}
      className="oak-chord-band"
      style={{ height: CHORD_BAND_PX, width: layout.width }}
      aria-label={band.source === "band" ? "Chords of the Band" : "Chords"}
      data-testid="chord-band"
      data-source={band.source}
    >
      <li className="oak-chord-band-gutter" style={{ width: layout.gutter }} aria-hidden>
        {band.source === "band" ? "Band" : "Chords"}
      </li>
      {visible.map((r) => {
        const left = Math.max(layout.gutter, xOfCycle(layout, r.from));
        const right = Math.min(layout.width, xOfCycle(layout, r.to));
        const fn = band.fn && r.fn ? r.fn : null;
        const st = fn && fn !== "chromatic" ? functionStyle(fn, theme) : null;
        const text = [band.symbols ? r.symbol : null, band.romans ? r.rn : null].filter(Boolean);
        // Wave 6: an applied chord points at its target, a borrowed chord says where it comes from (numerals on).
        const bc = band.chords?.[band.regions.indexOf(r)] ?? null;
        const arrow = band.romans && r.rn && bc?.arrow ? bc.arrow : null;
        const lent = band.romans && r.rn && bc?.borrowed ? bc.borrowed : null;
        const said = [
          band.symbols ? r.symbol : null,
          band.romans && r.rn ? r.rn : null,
          arrow
            ? arrow.resolves
              ? `points at ${arrow.target} and resolves to it`
              : `points at ${arrow.target}, which does not follow`
            : null,
          lent,
          fn ? FN_WORDS[fn] : null,
        ]
          .filter(Boolean)
          .join(", ");
        return (
          <li
            key={`${r.slot}-${r.from}`}
            className={`oak-chord-region${fn ? ` oak-chord-region--fn` : ""}${fn === "chromatic" ? " oak-chord-region--chromatic" : ""}${arrow ? " oak-chord-region--applied" : ""}${lent ? " oak-chord-region--borrowed" : ""}${bc?.reduced ? " oak-chord-region--quiet" : ""}`}
            data-kind={bc?.kind ?? undefined}
            data-target={arrow ? arrow.target : undefined}
            data-resolves={arrow ? (arrow.resolves ? "1" : "0") : undefined}
            data-borrowed={lent ? "1" : undefined}
            data-reduced={bc?.reduced ? "1" : undefined}
            style={{
              left,
              width: Math.max(2, right - left - 1),
              ...(st ? { background: st.fill, color: st.label, borderColor: st.outline ?? st.fill } : {}),
            }}
            title={said}
            aria-label={`Bar ${Math.floor(r.from) + (band.pickup ? 0 : 1)}: ${said}`}
            data-symbol={r.symbol}
            data-rn={r.rn ?? undefined}
            data-fn={r.fn ?? undefined}
          >
            {text.length > 0 ? (
              <>
                {band.symbols ? <b className="oak-chord-symbol">{r.symbol}</b> : null}
                {band.romans && r.rn ? <span className="oak-chord-rn">{r.rn}</span> : null}
                {arrow ? (
                  <span className="oak-chord-arrow" data-resolves={arrow.resolves ? "1" : "0"} aria-hidden>
                    {arrow.resolves ? "→" : "⇢"} {arrow.target}
                  </span>
                ) : null}
                {lent ? (
                  <span className="oak-chord-lent" aria-hidden>
                    borrowed
                  </span>
                ) : null}
              </>
            ) : fn ? (
              <b className="oak-chord-symbol">{fn === "chromatic" ? "·" : fn}</b>
            ) : null}
            {fn && text.length > 0 && fn !== "chromatic" ? <span className="oak-chord-fn">{fn}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

function degreeKey(midi: number, model: WorkbenchModel): string {
  return pitchLabel(midi, model.key).degree?.raw ?? "";
}

/** Accessibility: the roll as a table (bar, beat, part, degree, syllable, note, duration). */
function NotesTable({
  model,
  bus,
  show,
}: {
  model: WorkbenchModel;
  bus: HighlightBus;
  show: { degree: boolean; solfege: boolean };
}) {
  return (
    <table className="oak-notes-table" data-testid="notes-table">
      <thead>
        <tr>
          <th>Bar</th>
          <th>Beat</th>
          <th>Part</th>
          {show.degree ? <th>Degree</th> : null}
          {show.solfege ? <th>Syllable</th> : null}
          <th>Note</th>
          <th>Length</th>
        </tr>
      </thead>
      <tbody>
        {model.events.map((e) => (
          <tr key={e.id} onClick={() => bus.select({ events: [e.id] }, "roll")}>
            <td>{e.bar}</td>
            <td>{e.beatLabel}</td>
            <td>{e.track}</td>
            {show.degree ? <td>{e.label?.degree?.label ?? "—"}</td> : null}
            {show.solfege ? <td>{e.label?.degree?.syllable || "—"}</td> : null}
            <td>{e.label?.display ?? e.s ?? "—"}</td>
            <td>
              {e.durRat[0]}/{e.durRat[1]}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
