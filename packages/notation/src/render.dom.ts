// Optional browser helper: lazy-loads abcjs and renders an ABC string with the options proven in spike S4
// (docs/spikes.md, s4 gotchas). Entry: "@oak/notation/render". The app's StaffView may use it or call
// abcjs itself; nothing isomorphic imports this file.
import type { AbcElem, AbcVisualParams, OakClickListener, TuneObject } from "abcjs";

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
