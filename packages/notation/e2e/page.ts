/// <reference path="../../../types/abcjs-ext.d.ts" />
// The test page's script: the package on `window.oakNotation`, plus `show()`, which engraves a note list (or
// a NotationInput) into a fresh block on the page, renders it with abcjs, measures it and places the
// annotations, and hands back what a spec needs (geometry, idMap, the ABC).
import { METERS } from "@oak/theory";
import type { AnnotationSet, NotationInput, StaffGeometry } from "../src/index.ts";
import * as notation from "../src/index.ts";
import * as dom from "../src/render.dom.ts";

export interface ShowOptions {
  /** A note list (the staff-input DSL) or a whole NotationInput. */
  list?: string;
  input?: NotationInput;
  meter?: keyof typeof METERS;
  key?: notation.KeySignatureOption;
  bars?: number;
  staff?: NotationInput["staff"];
  annotations?: AnnotationSet;
  barsPerLine?: number;
  title?: string;
  /** Draw the annotations with `placeAnnotations` (DOM) instead of the ABC lyric lines. */
  domAnnotations?: boolean;
  /** Options for `toAbc` beyond `barsPerLine` (bar numbers, the final barline). */
  abcOptions?: notation.AbcOptions;
  /** Width of the staff block in CSS pixels (a narrow host); default: the page's. */
  width?: number;
  /** abcjs render parameters (a narrow lead sheet's `staffwidth`). */
  params?: { staffwidth?: number };
  /** Several tracks, each a note list (a melody over left-hand chords): replaces `list`. */
  tracks?: Record<string, string>;
  /** Chord labels (`chordLabelInput`), key changes and a pickup, added to the input. */
  labels?: notation.ChordLabel[];
  lenses?: notation.ChordLabelSet;
  keyChanges?: NotationInput["keyChanges"];
  pickup?: NotationInput["pickup"];
  trackClefs?: NotationInput["trackClefs"];
  split?: NotationInput["split"];
  /** Wave 6: mark the guide tones (`guideToneMarks` + `markGuideTones`) after the render. */
  guide?: boolean;
}

/** A lead sheet laid out for a host `width` px wide (`leadSheetLayout`), every page shown (`leadSheetPages`). */
export interface LeadOptions {
  title?: string;
  melody: string;
  meter?: keyof typeof METERS;
  key: notation.KeySignatureOption;
  bars: number;
  pickup?: NotationInput["pickup"];
  chords: notation.ChordLabel[];
  romans?: boolean;
  width: number;
}
export interface ShownLabel {
  kind: "symbol" | "roman";
  /** Index in `score.chords` / `score.romans` (from the `oak-ann-at{i}` class). */
  i: number;
  text: string;
  /** Centre x and the vertical extent, client pixels. */
  x: number;
  top: number;
  bottom: number;
}
export interface Shown {
  id: string;
  abc: string;
  /** Chord labels tagged by `tagChordLabels`, in DOM order. */
  labels: ShownLabel[];
  /** What the Score asked for: the label texts, in order, and the item onset (cycles) each one stands on. */
  want: { symbols: { text: string; at: number }[]; romans: { text: string; at: number }[] };
  /** Bar numbers abcjs drew (`abcjs-bar-number`), in order. */
  barNumbers: string[];
  /** Wave 6: the guide tones marked ("F4=third"), and the classes of each marked head, in mark order. */
  guide: { marks: string[]; heads: string[] };
  /** Wave 6: what the Score says of itself. */
  approximate: boolean;
  warnings: string[];
  geometry: StaffGeometry;
  idMap: { n: number; pitches: string[]; bar: number; beat: number; eventIds: string[]; onset: number }[];
}

let count = 0;
async function show(o: ShowOptions): Promise<Shown> {
  const meter = METERS[o.meter ?? "4/4"];
  const key = notation.resolveKeySignature(o.key ?? null);
  const fromTracks = (tracks: Record<string, string>): NotationInput => ({
    events: Object.entries(tracks)
      .flatMap(([track, list]) => notation.parseNoteList(list, { meter, track }))
      .sort((a, b) => a.onset[0] / a.onset[1] - b.onset[0] / b.onset[1] || (a.midi ?? 0) - (b.midi ?? 0)),
    meter,
    key,
    bars: o.bars ?? 1,
    staff: o.staff ?? "auto",
  });
  const base: NotationInput =
    o.input ??
    (o.tracks
      ? fromTracks(o.tracks)
      : notation.noteListInput(o.list ?? "", {
          meter,
          key,
          bars: o.bars ?? 1,
          staff: (o.staff ?? "treble") as "treble",
        }));
  const input: NotationInput = {
    ...base,
    ...(o.staff ? { staff: o.staff } : {}),
    ...(o.annotations && !o.domAnnotations ? { annotations: o.annotations } : {}),
    ...(o.labels ? notation.chordLabelInput(o.labels, o.lenses ?? { symbols: true, romans: true }) : {}),
    ...(o.keyChanges ? { keyChanges: o.keyChanges } : {}),
    ...(o.pickup ? { pickup: o.pickup } : {}),
    ...(o.trackClefs ? { trackClefs: o.trackClefs } : {}),
    ...(o.split ? { split: o.split } : {}),
  };
  const { score, abc } = notation.notate(input, { barsPerLine: o.barsPerLine ?? 4, ...o.abcOptions });
  const id = `staff-${count++}`;
  const block = document.createElement("section");
  block.className = "staff";
  block.dataset.testid = id;
  if (o.title) {
    const h = document.createElement("h2");
    h.textContent = o.title;
    block.append(h);
  }
  if (o.width) block.style.width = `${o.width}px`;
  const el = document.createElement("div");
  el.id = id;
  block.append(el);
  document.getElementById("root")?.append(block);
  await dom.renderStaff(el, abc.abc, o.params ? { params: o.params } : {});
  if (o.annotations) dom.placeAnnotations(el, notation.noteAnnotations(score, o.annotations), o.annotations);
  dom.tagChordLabels(el, score);
  dom.tagSections(el, score);
  const guideMarks = o.guide ? notation.guideToneMarks(score, { events: input.events }) : [];
  const guideHeads = o.guide ? dom.markGuideTones(el, guideMarks) : [];
  const geometry = dom.measureStaff(el, abc, score);
  const { symbol, roman, at } = notation.CHORD_LABEL_CLASSES;
  const labels: ShownLabel[] = [...el.querySelectorAll(`.${symbol}, .${roman}`)].map((t) => {
    const r = t.getBoundingClientRect();
    const cls = t.getAttribute("class") ?? "";
    return {
      kind: cls.includes(symbol) ? "symbol" : "roman",
      i: Number(new RegExp(`${at}(\\d+)`).exec(cls)?.[1] ?? -1),
      text: t.textContent ?? "",
      x: r.left + r.width / 2,
      top: r.top,
      bottom: r.bottom,
    };
  });
  const pos = (a: notation.ScoreAnnotation) => {
    const t = a.drawnAt ?? a.at;
    return t[0] / t[1];
  };
  return {
    id,
    abc: abc.abc,
    labels,
    want: {
      symbols: (score.chords ?? []).map((a) => ({ text: a.text, at: pos(a) })),
      romans: (score.romans ?? []).map((a) => ({ text: a.text, at: pos(a) })),
    },
    barNumbers: [...el.querySelectorAll(".abcjs-bar-number")].map((t) => t.textContent ?? ""),
    guide: {
      marks: guideMarks.map((m) => `${m.pitch}=${m.role}`),
      heads: guideHeads.map((h) => h.getAttribute("class") ?? ""),
    },
    approximate: score.approximate,
    warnings: score.warnings.map((w) => `${w.code}: ${w.message}`),
    geometry,
    idMap: abc.idMap.map((e) => ({
      n: e.n,
      pitches: e.pitches,
      bar: e.bar,
      beat: e.beat,
      eventIds: e.eventIds,
      onset: e.onset[0] / e.onset[1],
    })),
  };
}

async function showLead(o: LeadOptions): Promise<Shown[]> {
  const meter = METERS[o.meter ?? "4/4"];
  const key = notation.resolveKeySignature(o.key);
  const melody = notation.parseNoteList(o.melody, { meter, track: "mel" });
  const layout = notation.leadSheetLayout(o.width, { textLines: o.romans ? 1 : 0 });
  const pages = notation.leadSheetPages(
    {
      melody,
      chords: o.chords,
      meter,
      key,
      bars: o.bars,
      ...(o.pickup ? { pickup: o.pickup } : {}),
      ...(o.romans ? { romans: true } : {}),
    },
    layout,
  );
  const out: Shown[] = [];
  for (const p of pages)
    out.push(
      await show({
        input: p.input,
        abcOptions: p.abc,
        params: p.render,
        barsPerLine: p.abc.barsPerLine ?? 4,
        width: o.width,
        title: `${o.title ?? "Lead sheet"} (page ${p.page + 1} of ${pages.length})`,
      }),
    );
  return out;
}

/** Wave 5: a chord chart, engraved (`chartAbc` + abcjs) or drawn as HTML (`renderChart`). */
export interface ChartOptions {
  title?: string;
  chart: notation.ChartInput;
  mode: "abc" | "dom";
  width?: number;
}
export interface ShownChart {
  id: string;
  abc: string | null;
  warnings: string[];
  /** DOM mode: the spoken label of each bar, in order. */
  bars: string[];
}
const lit = new Map<string, (bar: number | null) => void>();
async function showChart(o: ChartOptions): Promise<ShownChart> {
  const id = `chart-${count++}`;
  const block = document.createElement("section");
  block.className = "staff";
  block.dataset.testid = id;
  if (o.title) {
    const h = document.createElement("h2");
    h.textContent = o.title;
    block.append(h);
  }
  if (o.width) block.style.width = `${o.width}px`;
  const el = document.createElement("div");
  el.id = id;
  block.append(el);
  document.getElementById("root")?.append(block);
  if (o.mode === "abc") {
    const c = notation.chartAbc(o.chart);
    await dom.renderStaff(el, c.abc, { prefix: "oak-cb" });
    return { id, abc: c.abc, warnings: c.warnings.map((w) => w.message), bars: [] };
  }
  const view = dom.renderChart(el, notation.chartLayout(o.chart));
  lit.set(id, view.setBar);
  return {
    id,
    abc: null,
    warnings: [],
    bars: [...el.querySelectorAll(`.${dom.CHART_CLASSES.bar}`)].map(
      (b) => b.getAttribute("aria-label") ?? "",
    ),
  };
}
function lightBar(id: string, bar: number | null): void {
  lit.get(id)?.(bar);
}

function clear(): void {
  const root = document.getElementById("root");
  if (root) root.textContent = "";
}

declare global {
  interface Window {
    oakNotation: typeof notation &
      typeof dom & {
        show: typeof show;
        showLead: typeof showLead;
        showChart: typeof showChart;
        lightBar: typeof lightBar;
        clear: typeof clear;
        METERS: typeof METERS;
      };
    oakReady: boolean;
  }
}
window.oakNotation = { ...notation, ...dom, show, showLead, showChart, lightBar, clear, METERS };
await dom.loadAbcjs();
window.oakReady = true;
