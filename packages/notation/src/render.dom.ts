// Optional browser helper: lazy-loads abcjs and renders an ABC string with the options proven in spike S4
// (docs/spikes.md, s4 gotchas). Entry: "@oak/notation/render". The app's StaffView may use it or call
// abcjs itself; nothing isomorphic imports this file.
import type { Rat } from "@oak/content-kit";
import type { AbcElem, AbcVisualParams, OakClickListener, TuneObject } from "abcjs";
import type { Box, NoteGeometry, StaffBandGeometry, StaffGeometry } from "./geometry.ts";
import { ANNOTATION_CLASSES, type AnnotationSet, type NoteAnnotation } from "./options.ts";
import type { AbcResult, Score, Staff } from "./types.ts";

/** The renderAbc options proven in S4. */
export const ABCJS_OPTIONS = {
  add_classes: true,
  responsive: "resize",
  foregroundColor: "currentColor",
  selectionColor: "currentColor",
  selectTypes: ["note"],
} as const;

export interface StaffClick {
  /** The `n`s of the clicked element (one per chord, low to high), resolved through `AbcResult.idMap`. */
  ns: number[];
  /** The chord member under the pointer (by notehead geometry), when the element is a chord. */
  member: number | null;
  event: MouseEvent;
}
export interface RenderedStaff {
  tune: TuneObject;
  /** Light the given `n`s (class `oak-active`); everything else goes dark. Cheap: call it per frame. */
  setActive(ns: readonly number[]): void;
}

type AbcjsModule = typeof import("abcjs");
let loading: Promise<AbcjsModule> | null = null;
/** abcjs is CommonJS: the namespace has named exports and a default in Vite dev, Vite build and Bun. */
export function loadAbcjs(): Promise<AbcjsModule> {
  loading ??= import("abcjs").then((m) => ((m as { default?: AbcjsModule }).default ?? m) as AbcjsModule);
  return loading;
}

/** The `n`s of `oak-e{n}` classes in a class string. */
export function nsFromClasses(classes: string, prefix = "oak-e"): number[] {
  const re = new RegExp(`(?:^|\\s)${prefix}(\\d+)`, "g");
  return [...classes.matchAll(re)].map((m) => Number(m[1]));
}

export async function renderStaff(
  el: HTMLElement,
  abc: string,
  opts: { onClick?: (hit: StaffClick) => void; params?: AbcVisualParams; prefix?: string } = {},
): Promise<RenderedStaff> {
  const abcjs = await loadAbcjs();
  const prefix = opts.prefix ?? "oak-e";
  const clickListener: OakClickListener = (abcElem: AbcElem, _tune, classes, _analysis, _drag, event) => {
    if (abcElem.rest || !opts.onClick) return;
    const ns = nsFromClasses(abcElem.extraClass ?? classes, prefix);
    let member: number | null = null;
    const group = (abcElem as { abselem?: { elemset?: Element[] } }).abselem?.elemset?.[0];
    if (group && ns.length > 1) {
      let best = Number.POSITIVE_INFINITY;
      for (const head of group.querySelectorAll(".abcjs-notehead")) {
        const r = head.getBoundingClientRect();
        const d = Math.hypot(r.x + r.width / 2 - event.clientX, r.y + r.height / 2 - event.clientY);
        const pos = /abcjs-chord-pos-(\d+)/.exec(head.getAttribute("class") ?? "");
        if (pos && d < best) {
          best = d;
          member = ns[Number(pos[1]) - 1] ?? null;
        }
      }
    }
    opts.onClick({ ns, member, event });
  };
  const [tune] = abcjs.renderAbc(el, abc, {
    ...ABCJS_OPTIONS,
    clickListener: clickListener as unknown as AbcVisualParams["clickListener"],
    ...opts.params,
  } as AbcVisualParams);
  let lit = new Set<string>();
  return {
    tune: tune as TuneObject,
    setActive(ns) {
      const want = new Set(ns.map((n) => `${prefix}${n}`));
      for (const c of lit)
        if (!want.has(c))
          for (const node of el.querySelectorAll(`.${c}`)) node.classList.remove("oak-active");
      for (const c of want)
        if (!lit.has(c)) for (const node of el.querySelectorAll(`.${c}`)) node.classList.add("oak-active");
      lit = want;
    },
  };
}

// --- Wave 3 seams (docs/design/wave3.md §3.1): the DOM half of staff input and annotations ---------------

/** Every SVG element abcjs drew for note `n` (heads, stems, accidentals, ties carry the same class). */
export function noteElements(root: ParentNode, n: number, prefix = "oak-e"): Element[] {
  return [...root.querySelectorAll(`.${prefix}${n}`)];
}

/** Union of the client rects of note `n`'s elements, or `null` when the note is not in the render. */
export function noteBox(root: ParentNode, n: number, prefix = "oak-e"): DOMRect | null {
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const el of noteElements(root, n, prefix)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    x0 = Math.min(x0, r.left);
    y0 = Math.min(y0, r.top);
    x1 = Math.max(x1, r.right);
    y1 = Math.max(y1, r.bottom);
  }
  return Number.isFinite(x0) ? new DOMRect(x0, y0, x1 - x0, y1 - y0) : null;
}

const lineOf = (el: Element): number =>
  Number(/(?:^|\s)abcjs-l(\d+)(?:\s|$)/.exec(el.getAttribute("class") ?? "")?.[1] ?? 0);
const rectOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
};
const union = (boxes: readonly Box[]): Box | null => {
  if (!boxes.length) return null;
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.width));
  const y1 = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
};
/** abcjs's staff line spacing in SVG units (measured: 7.75 at its default scale), for a one-line staff. */
const ABCJS_LINE_SPACING = 7.75;

/** The engraved note groups of `n` (abcjs `g.abcjs-note`), first piece of a tie chain first. */
function noteGroups(root: ParentNode, n: number, prefix: string): Element[] {
  return noteElements(root, n, prefix).filter((e) => e.classList.contains("abcjs-note"));
}

/**
 * Measures a rendered staff (after `renderStaff`) into the pure geometry `hitTest` reads: each staff band
 * of each system (top line y, line spacing, bar x ranges with their cycles) and each note's boxes, in
 * client pixels. Re-measure after every render, on resize and on scroll (client pixels move with them).
 * A tied note is measured at its first piece; lyrics and annotations are not part of a note's box.
 */
export function measureStaff(el: HTMLElement, abc: AbcResult, score: Score): StaffGeometry {
  const prefix = "oak-e";
  const svg = el.querySelector("svg");
  if (!svg) throw new Error("@oak/notation measureStaff: nothing is rendered in this element");
  const staffGroups = [...svg.querySelectorAll("g.abcjs-staff")];
  const lines = [...new Set(staffGroups.map(lineOf))].sort((a, b) => a - b);
  const scale = svg.getScreenCTM()?.a ?? 1;
  type Band = Omit<StaffBandGeometry, "y0" | "y1"> & { bottom: number };
  const bands: Band[] = [];
  let cycle = score.startBar;
  for (const line of lines) {
    const groups = staffGroups.filter((g) => lineOf(g) === line);
    const measured = groups.map((g, si) => {
      const ys = [...g.querySelectorAll("path")]
        .map((p) => {
          const r = p.getBoundingClientRect();
          return r.top + r.height / 2;
        })
        .sort((a, b) => a - b);
      const staff = score.staves[si];
      return { g, staff, ys };
    });
    const known = measured.find((m) => m.ys.length >= 5);
    const fallback = known
      ? ((known.ys[4] as number) - (known.ys[0] as number)) / 4
      : ABCJS_LINE_SPACING * scale;
    // Bar lines and the end of the clef, key and time signature, per staff (by vertical overlap).
    const barGroups = [...svg.querySelectorAll("g.abcjs-bar")].filter((b) => lineOf(b) === line);
    const extras = [...svg.querySelectorAll("g.abcjs-staff-extra")].filter((b) => lineOf(b) === line);
    let barsOnLine = 0;
    for (const m of measured) {
      if (!m.staff || m.ys.length === 0) continue;
      const top = m.ys[0] as number;
      const spacing = m.ys.length >= 5 ? ((m.ys[4] as number) - top) / 4 : fallback;
      const bottom = m.ys.length >= 5 ? (m.ys[4] as number) : top;
      const overlaps = (b: Box) => b.y <= bottom + spacing && b.y + b.height >= top - spacing;
      const xs: number[] = [];
      for (const b of barGroups) {
        const r = rectOf(b);
        if (!overlaps(r)) continue;
        if (!xs.some((x) => Math.abs(x - r.x) < 2)) xs.push(r.x);
      }
      xs.sort((a, b) => a - b);
      const start =
        Math.max(
          rectOf(m.g).x,
          ...extras
            .map(rectOf)
            .filter(overlaps)
            .map((r) => r.x + r.width),
        ) +
        spacing / 2;
      const si = score.staves.indexOf(m.staff);
      const voiceIndex = score.staves.slice(0, si).reduce((a, s) => a + s.voices.length, 0);
      const bars: StaffBandGeometry["bars"] = xs.map((x1, i) => {
        const c = cycle + i;
        const bi = c - score.startBar;
        const ticks: { x: number; onset: Rat }[] = [];
        m.staff?.voices[0]?.bars[bi]?.items.forEach((it, k) => {
          const elem = svg.querySelector(
            `g.abcjs-v${voiceIndex}.abcjs-mm${bi}.abcjs-n${k}:is(.abcjs-note, .abcjs-rest)`,
          );
          if (!elem) return;
          const head = elem.querySelector(".abcjs-notehead") ?? elem.querySelector("path") ?? elem;
          const r = rectOf(head);
          ticks.push({ x: r.x + r.width / 2, onset: it.onset });
        });
        return { x0: i === 0 ? start : (xs[i - 1] as number), x1, cycle: c, ticks };
      });
      barsOnLine = Math.max(barsOnLine, bars.length);
      bands.push({
        staff: m.staff.id,
        clef: m.staff.clef,
        system: lines.indexOf(line),
        topLineY: top,
        lineSpacing: spacing,
        bars,
        bottom,
      });
    }
    cycle += barsOnLine;
  }
  // Each band answers to the space halfway to its neighbours (six line spaces at the outer edges).
  const ordered = [...bands].sort((a, b) => a.topLineY - b.topLineY);
  const staves: StaffBandGeometry[] = ordered.map((b, i) => {
    const prev = ordered[i - 1];
    const next = ordered[i + 1];
    const { bottom, ...rest } = b;
    return {
      ...rest,
      y0: prev ? (prev.bottom + b.topLineY) / 2 : b.topLineY - 6 * b.lineSpacing,
      y1: next ? (bottom + next.topLineY) / 2 : bottom + 6 * b.lineSpacing,
    };
  });
  // Notes: every engraved n of the score, on its staff.
  const staffOfN = new Map<number, Staff["id"]>();
  for (const s of score.staves)
    for (const v of s.voices)
      for (const b of v.bars) for (const it of b.items) if (it.n !== null) staffOfN.set(it.n, s.id);
  const notes: NoteGeometry[] = [];
  for (const entry of abc.idMap) {
    if (!entry) continue;
    const g = noteGroups(svg, entry.n, prefix)[0];
    if (!g) continue;
    const parts = [...g.children].filter(
      (c) => c.tagName.toLowerCase() !== "text" && !c.classList.contains("oak-ann"),
    );
    const box = union(parts.map(rectOf).filter((r) => r.width > 0 || r.height > 0));
    if (!box) continue;
    const heads = [...g.querySelectorAll(".abcjs-notehead")]
      .map(rectOf)
      .sort((a, b) => b.y + b.height / 2 - (a.y + a.height / 2) || a.x - b.x);
    notes.push({ n: entry.n, staff: staffOfN.get(entry.n) ?? "S1", box, heads });
  }
  return { staves, notes };
}

/** The staff group (same system) nearest to a note group's first head. */
function nearestStaff(g: Element, staffGroups: readonly Element[]): SVGGraphicsElement | null {
  const head = (g.querySelector(".abcjs-notehead") ?? g) as SVGGraphicsElement;
  const hb = head.getBBox();
  const cy = hb.y + hb.height / 2;
  let best: SVGGraphicsElement | null = null;
  let dist = Number.POSITIVE_INFINITY;
  for (const sg of staffGroups) {
    if (lineOf(sg) !== lineOf(g)) continue;
    const b = (sg as SVGGraphicsElement).getBBox();
    const d = cy < b.y ? b.y - cy : cy > b.y + b.height ? cy - b.y - b.height : 0;
    if (d < dist) {
      dist = d;
      best = sg as SVGGraphicsElement;
    }
  }
  return best;
}
const extents = new WeakMap<Element, { top: number; bottom: number }>();
/** Top and bottom (SVG units) of a staff with every note drawn on it (texts left out). */
function extentOf(staff: SVGGraphicsElement): { top: number; bottom: number } {
  const known = extents.get(staff);
  if (known) return known;
  const sb = staff.getBBox();
  let top = sb.y;
  let bottom = sb.y + sb.height;
  const svg = staff.ownerSVGElement;
  const groups = svg ? [...svg.querySelectorAll("g.abcjs-staff")] : [staff];
  for (const g of svg?.querySelectorAll("g.abcjs-note") ?? []) {
    if (lineOf(g) !== lineOf(staff) || nearestStaff(g, groups) !== staff) continue;
    for (const c of g.children) {
      if (c.tagName.toLowerCase() === "text") continue;
      const b = (c as SVGGraphicsElement).getBBox();
      top = Math.min(top, b.y);
      bottom = Math.max(bottom, b.y + b.height);
    }
  }
  const out = { top, bottom };
  extents.set(staff, out);
  return out;
}

/** Puts back the viewBox an earlier `fitDrawn` grew. */
function restoreViewBox(svg: SVGSVGElement): void {
  const orig = svg.getAttribute("data-oak-viewbox");
  if (orig === null) return;
  svg.setAttribute("viewBox", orig);
  svg.removeAttribute("data-oak-viewbox");
  sizeContainer(svg);
}
/** Grows the SVG's viewBox (and abcjs's responsive container) so drawn annotation texts are not clipped. */
function fitDrawn(svg: SVGSVGElement): void {
  const drawn = [...svg.querySelectorAll('text[data-oak-ann="drawn"]')] as SVGGraphicsElement[];
  const vb = svg.viewBox.baseVal;
  if (!drawn.length || !vb || vb.width === 0) return;
  let y0 = vb.y;
  let y1 = vb.y + vb.height;
  for (const t of drawn) {
    const b = t.getBBox();
    y0 = Math.min(y0, b.y - 2);
    y1 = Math.max(y1, b.y + b.height + 2);
  }
  if (y0 === vb.y && y1 === vb.y + vb.height) return;
  svg.setAttribute("data-oak-viewbox", `${vb.x} ${vb.y} ${vb.width} ${vb.height}`);
  svg.setAttribute("viewBox", `${vb.x} ${y0} ${vb.width} ${y1 - y0}`);
  sizeContainer(svg);
}
/** abcjs's responsive container keeps the aspect ratio in `padding-bottom`; a fixed SVG has a height. */
function sizeContainer(svg: SVGSVGElement): void {
  const vb = svg.viewBox.baseVal;
  const box = svg.parentElement as HTMLElement | null;
  if (box?.style.paddingBottom.endsWith("%")) box.style.paddingBottom = `${(vb.height / vb.width) * 100}%`;
  else if (svg.getAttribute("height")) svg.setAttribute("height", String(vb.height));
}

const KINDS = ["degree", "solfege", "noteName"] as const;
const SVG_NS = "http://www.w3.org/2000/svg";
const norm = (t: string | null | undefined) => (t ?? "").replace(/[\s~]+/g, " ").trim();

/**
 * Gives the annotation texts (`noteAnnotations`) their stable classes (`ANNOTATION_CLASSES`): `oak-ann`, the
 * kind's class and `oak-ann-e{n}`, replacing what an earlier call placed. When the staff was engraved with
 * `NotationInput.annotations` (abcjs drew them as lyric lines or texts over the notes) the drawn texts are
 * tagged; a note without them gets its own SVG texts under (or over) the staff, in the order degree,
 * solfège, name (`which` decides the side). Kinds missing from every annotation (no key: no degree) are
 * skipped.
 */
export function placeAnnotations(
  el: HTMLElement,
  annotations: readonly NoteAnnotation[],
  which: AnnotationSet,
  prefix = "oak-e",
): void {
  const svg = el.querySelector("svg");
  if (!svg) return;
  for (const old of [...svg.querySelectorAll("[data-oak-ann]")]) {
    if (old.getAttribute("data-oak-ann") === "drawn") old.remove();
    else {
      old.removeAttribute("data-oak-ann");
      const keep = (old.getAttribute("class") ?? "")
        .split(/\s+/)
        .filter((c) => c && c !== "oak-ann" && !c.startsWith("oak-ann-"));
      old.setAttribute("class", keep.join(" "));
    }
  }
  restoreViewBox(svg);
  const kinds = KINDS.filter((k) => which[k] && annotations.some((a) => a[k] !== undefined));
  if (!kinds.length) return;
  const above = which.position === "above";
  const classFor = (k: (typeof KINDS)[number], n: number) =>
    `${ANNOTATION_CLASSES.base} ${ANNOTATION_CLASSES[k]} ${ANNOTATION_CLASSES.note}${n}`;
  const staffGroups = [...svg.querySelectorAll("g.abcjs-staff")];
  for (const sg of staffGroups) extents.delete(sg);
  for (const a of annotations) {
    const g = noteGroups(svg, a.n, prefix)[0];
    if (!g) continue;
    const want = kinds.map((k) => norm(a[k]));
    // abcjs's own texts: the lyric lines under the note, or the stacked text over it.
    const drawn = [...g.querySelectorAll(above ? "text.abcjs-annotation" : "text.abcjs-lyric")];
    const spans = drawn.flatMap((t) => {
      const ts = [...t.querySelectorAll("tspan")];
      return ts.length ? ts : [t];
    });
    // Match each kind to one of abcjs's texts (abcjs draws the stacked texts over a note bottom-up).
    const used = new Set<number>();
    const match = want.map((w) => {
      const i = spans.findIndex((t, j) => !used.has(j) && norm(t.textContent) === w);
      if (i >= 0) used.add(i);
      return i;
    });
    if (match.every((i) => i >= 0)) {
      kinds.forEach((k, j) => {
        const t = spans[match[j] as number] as Element;
        t.setAttribute("class", `${t.getAttribute("class") ?? ""} ${classFor(k, a.n)}`.trim());
        t.setAttribute("data-oak-ann", "tagged");
      });
      continue;
    }
    // Not engraved with the staff: draw the texts, centred under (over) the first notehead, on one level
    // per staff and system (clear of every note's stem and ledger lines there).
    const head = g.querySelector(".abcjs-notehead") as SVGGraphicsElement | null;
    const hb = (head ?? (g as SVGGraphicsElement)).getBBox();
    const staff = nearestStaff(g, staffGroups);
    const ext = staff ? extentOf(staff) : { top: hb.y, bottom: hb.y + hb.height };
    const step = ABCJS_LINE_SPACING * 1.6;
    kinds.forEach((k, j) => {
      const t = document.createElementNS(SVG_NS, "text");
      t.setAttribute("class", classFor(k, a.n));
      t.setAttribute("data-oak-ann", "drawn");
      t.setAttribute("x", String(hb.x + hb.width / 2));
      const y = above ? ext.top - step * (kinds.length - 1 - j) - step * 0.4 : ext.bottom + step * (j + 1.3);
      t.setAttribute("y", String(y));
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("font-size", String(ABCJS_LINE_SPACING * 1.5));
      t.setAttribute("font-family", "Helvetica, Arial, sans-serif");
      t.setAttribute("fill", "currentColor");
      t.textContent = a[k] ?? "";
      g.append(t);
    });
  }
  fitDrawn(svg);
}
