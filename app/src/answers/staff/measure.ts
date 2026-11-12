// The DOM half of staff input: measure a rendered abcjs staff into the notation engineer's `StaffGeometry`
// (wave3.md §3.1) and the onset anchors the pointer snaps through. `measureStaff` from `@oak/notation/render`
// is used when it is built; until then (`NotationNotBuiltError`) this file measures the same things from the
// classes abcjs writes with `add_classes`: `.abcjs-staff.abcjs-l{line}.abcjs-v{voice}` (five lines),
// `.abcjs-bar…abcjs-mm{measure}`, `.abcjs-staff-extra` (clef, key, time) and every note or rest
// `.abcjs-v{v}.abcjs-mm{m}.abcjs-n{i}` = the i-th item of that bar of that staff in the Score.
import { R } from "@oak/content-kit";
import {
  type AbcResult,
  NotationNotBuiltError,
  type Score,
  type StaffBandGeometry,
  type StaffGeometry,
} from "@oak/notation";
import { measureStaff } from "@oak/notation/render";
import type { OnsetAnchor } from "./model.ts";

const num = (cls: string, prefix: string): number | null => {
  const m = new RegExp(`(?:^|\\s)${prefix}(\\d+)(?:\\s|$)`).exec(cls);
  return m ? Number(m[1]) : null;
};

function rectOf(el: Element): DOMRect {
  return el.getBoundingClientRect();
}

/** The fallback measurement (client pixels), same contract as `measureStaff`. */
export function measureAbcjs(el: HTMLElement, abc: AbcResult, score: Score): StaffGeometry {
  const staves: StaffBandGeometry[] = [];
  for (const g of el.querySelectorAll("g.abcjs-staff")) {
    const cls = g.getAttribute("class") ?? "";
    const line = num(cls, "abcjs-l") ?? 0;
    const v = num(cls, "abcjs-v") ?? 0;
    const st = score.staves[v];
    if (!st) continue;
    const r = rectOf(g);
    const top = g.querySelector(".abcjs-top-line");
    const topY = top ? rectOf(top).top : r.top;
    const spacing = st.lines === 1 ? 10 : r.height / 4;
    const extraRight = Math.max(
      r.left,
      ...[...el.querySelectorAll(`.abcjs-staff-extra.abcjs-l${line}.abcjs-v${v}`)].map(
        (e) => rectOf(e).right,
      ),
    );
    const bars: StaffBandGeometry["bars"] = [];
    let x0 = extraRight + spacing * 0.6;
    const lines = [...el.querySelectorAll(`.abcjs-bar.abcjs-l${line}.abcjs-v${v}`)]
      .map((b) => ({ mm: num(b.getAttribute("class") ?? "", "abcjs-mm") ?? 0, x: rectOf(b).left }))
      .sort((a, b) => a.x - b.x);
    for (const b of lines) {
      bars.push({ x0, x1: b.x, cycle: b.mm + score.startBar });
      x0 = b.x;
    }
    staves.push({
      staff: st.id,
      clef: st.clef,
      system: line,
      topLineY: topY,
      lineSpacing: spacing,
      y0: topY - 7 * spacing,
      y1: topY + 11 * spacing,
      bars,
    });
  }
  // Two staves of one system (a grand staff) share the space between them halfway.
  for (const a of staves)
    for (const b of staves) {
      if (a === b || a.system !== b.system || b.topLineY <= a.topLineY) continue;
      const mid = (a.topLineY + 4 * a.lineSpacing + b.topLineY) / 2;
      a.y1 = Math.min(a.y1, mid);
      b.y0 = Math.max(b.y0, mid);
    }
  const notes: StaffGeometry["notes"] = [];
  for (const entry of abc.idMap) {
    const els = [...el.querySelectorAll(`.oak-e${entry.n}`)];
    if (els.length === 0) continue;
    let x0 = Number.POSITIVE_INFINITY;
    let y0 = Number.POSITIVE_INFINITY;
    let x1 = Number.NEGATIVE_INFINITY;
    let y1 = Number.NEGATIVE_INFINITY;
    const heads: { x: number; y: number; width: number; height: number }[] = [];
    let staffId: StaffBandGeometry["staff"] = "S1";
    for (const e of els) {
      const r = rectOf(e);
      if (r.width === 0 && r.height === 0) continue;
      x0 = Math.min(x0, r.left);
      y0 = Math.min(y0, r.top);
      x1 = Math.max(x1, r.right);
      y1 = Math.max(y1, r.bottom);
      const v = num(e.getAttribute("class") ?? "", "abcjs-v");
      if (v !== null) staffId = score.staves[v]?.id ?? staffId;
      for (const h of e.querySelectorAll(".abcjs-notehead")) {
        const hr = rectOf(h);
        heads.push({ x: hr.left, y: hr.top, width: hr.width, height: hr.height });
      }
    }
    if (!Number.isFinite(x0)) continue;
    heads.sort((a, b) => b.y - a.y);
    notes.push({ n: entry.n, staff: staffId, box: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, heads });
  }
  return { staves, notes };
}

/** The notation engineer's `measureStaff` when it is built, else the fallback above. */
export function measure(el: HTMLElement, abc: AbcResult, score: Score): StaffGeometry {
  try {
    return measureStaff(el, abc, score);
  } catch (e) {
    if (e instanceof NotationNotBuiltError) return measureAbcjs(el, abc, score);
    throw e;
  }
}

/**
 * Where each engraved note and rest stands, with its onset (client pixels): the x of its notehead (or the
 * centre of a rest). Whole-bar rests are left out: abcjs centres them in the bar.
 */
export function measureAnchors(el: HTMLElement, score: Score): OnsetAnchor[] {
  const out: OnsetAnchor[] = [];
  score.staves.forEach((st, v) => {
    const voice = st.voices[0];
    if (!voice) return;
    for (const bar of voice.bars) {
      const mm = bar.index - score.startBar;
      bar.items.forEach((item, i) => {
        if (item.hidden) return;
        if (item.kind === "rest" && R.eq(item.dur, [1, 1])) return;
        const node = el.querySelector(`.abcjs-v${v}.abcjs-mm${mm}.abcjs-n${i}`);
        if (!node) return;
        const head = node.querySelector(".abcjs-notehead");
        const r = (head ?? node).getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        out.push({ x: r.left + r.width / 2, onset: item.onset });
      });
    }
  });
  // One x per onset (both hands of a grand staff line up): the mean.
  const byOnset = new Map<string, { x: number; k: number; onset: OnsetAnchor["onset"] }>();
  for (const a of out) {
    const key = R.str(a.onset);
    const cur = byOnset.get(key);
    if (cur) {
      cur.x += a.x;
      cur.k += 1;
    } else byOnset.set(key, { x: a.x, k: 1, onset: a.onset });
  }
  return [...byOnset.values()]
    .map((a) => ({ x: a.x / a.k, onset: a.onset }))
    .sort((a, b) => R.cmp(a.onset, b.onset));
}

/** Anchors in the host's coordinates. */
export function localAnchors(anchors: readonly OnsetAnchor[], origin: { x: number }): OnsetAnchor[] {
  return anchors.map((a) => ({ ...a, x: a.x - origin.x }));
}
