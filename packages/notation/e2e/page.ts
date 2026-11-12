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
}
export interface Shown {
  id: string;
  abc: string;
  geometry: StaffGeometry;
  idMap: { n: number; pitches: string[]; bar: number; beat: number; eventIds: string[] }[];
}

let count = 0;
async function show(o: ShowOptions): Promise<Shown> {
  const meter = METERS[o.meter ?? "4/4"];
  const key = notation.resolveKeySignature(o.key ?? null);
  const base: NotationInput =
    o.input ??
    notation.noteListInput(o.list ?? "", {
      meter,
      key,
      bars: o.bars ?? 1,
      staff: (o.staff ?? "treble") as "treble",
    });
  const input: NotationInput = {
    ...base,
    ...(o.staff ? { staff: o.staff } : {}),
    ...(o.annotations && !o.domAnnotations ? { annotations: o.annotations } : {}),
  };
  const { score, abc } = notation.notate(input, { barsPerLine: o.barsPerLine ?? 4 });
  const id = `staff-${count++}`;
  const block = document.createElement("section");
  block.className = "staff";
  block.dataset.testid = id;
  if (o.title) {
    const h = document.createElement("h2");
    h.textContent = o.title;
    block.append(h);
  }
  const el = document.createElement("div");
  el.id = id;
  block.append(el);
  document.getElementById("root")?.append(block);
  await dom.renderStaff(el, abc.abc);
  if (o.annotations) dom.placeAnnotations(el, notation.noteAnnotations(score, o.annotations), o.annotations);
  const geometry = dom.measureStaff(el, abc, score);
  return {
    id,
    abc: abc.abc,
    geometry,
    idMap: abc.idMap.map((e) => ({
      n: e.n,
      pitches: e.pitches,
      bar: e.bar,
      beat: e.beat,
      eventIds: e.eventIds,
    })),
  };
}

function clear(): void {
  const root = document.getElementById("root");
  if (root) root.textContent = "";
}

declare global {
  interface Window {
    oakNotation: typeof notation &
      typeof dom & { show: typeof show; clear: typeof clear; METERS: typeof METERS };
    oakReady: boolean;
  }
}
window.oakNotation = { ...notation, ...dom, show, clear, METERS };
await dom.loadAbcjs();
window.oakReady = true;
