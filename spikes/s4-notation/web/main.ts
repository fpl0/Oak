/**
 * SPIKE S4 browser page. The NotationModel pipeline (quantize.ts + abc.ts + tonal) runs in the browser on
 * events that were produced headlessly (fixtures.json); abcjs is lazy-loaded with a dynamic import.
 */
import { type AbcResult, toAbc } from "../abc.ts";
import { type OakEvent, type Score, activeEventIds, buildScore, rat } from "../quantize.ts";
import fixtures from "./fixtures.json";

interface Fixture {
  name: string;
  code: string;
  bars: number;
  events: (Omit<OakEvent, "onset" | "dur"> & { onset: [string, string]; dur: [string, string] })[];
}
interface Rendered {
  name: string;
  score: Score;
  abc: AbcResult;
  el: HTMLElement;
}
interface ClickRecord {
  staff: string;
  startChar: number;
  endChar: number;
  abcText: string;
  elType: string;
  classes: string;
  extraClass: string | undefined;
  oakIds: number[];
  pitches: number[];
  analysisKeys: string[];
  analysisName: string | undefined;
  clickedName: string | undefined;
  clickedClasses: string;
  target: string;
  groupIsG: boolean;
  isRest: boolean;
  hitIds: number[];
  chordPos: number | null;
  argCount: number;
  locations: { start: number; end: number }[];
}

export const GRAND_ABC = `X:1
M:4/4
L:1/8
Q:1/4=90
%%score {RH LH}
V:RH clef=treble
V:LH clef=bass
K:C
V:RH
"C^7"!class=oak-e0![EGB]4 "D-7"!class=oak-e1![FAc]4 | "G7"!class=oak-e2![FBd]4 "Ch7"!class=oak-e3![_E_G_B]2 "Bo7"!class=oak-e9![DF_A]2 |]
V:LH
!class=oak-e4!C,4 !class=oak-e5!D,4 | !class=oak-e6!G,,4 !class=oak-e7!C,2 !class=oak-e8!B,,2 |]
`;

/** What the learner would type (Strudel/iReal style and common variants) -> how abcjs prints it. */
export const CHORD_PROBE = ["C^7", "CM7", "Cmaj7", "C-7", "Cm7", "Ch7", "C07", "Cø7", "Cm7b5", "Co7", "Cdim7", "Co", "C+", "Caug", "Csus", "C7sus4", "F#-7", "Bb7#11", "Eb^9", "C/E", "N.C."];
export const CHORDS_ABC = `X:1
M:4/4
L:1/4
K:C
${CHORD_PROBE.map((c, i) => `"${c}"C${(i + 1) % 4 === 0 ? " |" : ""}${(i + 1) % 8 === 0 ? "\n" : ""}`).join(" ")} |]
`;

const state: {
  importShape: Record<string, unknown>;
  rendered: Rendered[];
  clicks: ClickRecord[];
  cycle: number;
  chordProbe: string[];
} = { importShape: {}, rendered: [], clicks: [], cycle: 0, chordProbe: [] };

const slug = (name: string) => name.slice(0, 3).trim();

async function main() {
  const status = document.getElementById("status") as HTMLElement;
  const gallery = document.getElementById("gallery") as HTMLElement;

  // ---- lazy import: abcjs is CommonJS (main: index.js, no `module`/`exports`) -------------------------
  const t0 = performance.now();
  // biome-ignore lint/suspicious/noExplicitAny: import-shape probe
  const mod: any = await import("abcjs");
  const importMs = Math.round(performance.now() - t0);
  // biome-ignore lint/suspicious/noExplicitAny: import-shape probe
  const abcjs: any = mod.default ?? mod;
  state.importShape = {
    namespaceKeys: Object.keys(mod).sort(),
    hasDefault: "default" in mod,
    defaultType: typeof mod.default,
    namedRenderAbc: typeof mod.renderAbc,
    defaultRenderAbc: typeof mod.default?.renderAbc,
    signature: abcjs.signature,
    importMs,
  };

  // ---- gallery: one staff per corpus entry -----------------------------------------------------------
  for (const f of fixtures as unknown as Fixture[]) {
    const events: OakEvent[] = f.events.map((e) => ({
      ...e,
      onset: rat(BigInt(e.onset[0]), BigInt(e.onset[1])),
      dur: rat(BigInt(e.dur[0]), BigInt(e.dur[1])),
    }));
    const score = buildScore({ events, bars: f.bars });
    const abc = toAbc(score);
    const card = document.createElement("div");
    card.className = "staff-card";
    card.innerHTML = `<div><b>${f.name}</b> <code></code>${score.approximate ? " <i>(approximate)</i>" : ""}</div>`;
    (card.querySelector("code") as HTMLElement).textContent = f.code;
    const el = document.createElement("div");
    el.className = "staff";
    el.id = `staff-${slug(f.name)}`;
    card.append(el);
    gallery.append(card);
    render(abcjs, el, abc.abc, (rec) => {
      rec.locations = rec.hitIds.flatMap((id) => abc.idMap.get(id)?.locations ?? []);
    });
    state.rendered.push({ name: f.name, score, abc, el });
  }

  // ---- grand staff + chord symbols -------------------------------------------------------------------
  render(abcjs, document.getElementById("grand") as HTMLElement, GRAND_ABC);
  render(abcjs, document.getElementById("grand-jazz") as HTMLElement, GRAND_ABC, undefined, { jazzchords: true });
  render(abcjs, document.getElementById("chords") as HTMLElement, CHORDS_ABC);
  state.chordProbe = CHORD_PROBE;

  document.getElementById("dark")?.addEventListener("click", () => document.body.classList.toggle("dark"));
  document.getElementById("play")?.addEventListener("click", () => setCycle(state.cycle + 1 / 16));
  status.textContent = `abcjs ${abcjs.signature} imported in ${importMs} ms; ${state.rendered.length} staves`;
}

function render(
  // biome-ignore lint/suspicious/noExplicitAny: abcjs
  abcjs: any,
  el: HTMLElement,
  abc: string,
  enrich?: (rec: ClickRecord) => void,
  extra: Record<string, unknown> = {},
) {
  // biome-ignore lint/suspicious/noExplicitAny: abcjs listener shape is what the spike is probing
  const clickListener = (abcElem: any, _tune: number, classes: string, analysis: any, _drag: any, ...rest: any[]) => {
    const oakIds = [...classes.matchAll(/oak-e(\d+)/g)].map((m) => Number(m[1]));
    const ev: MouseEvent | undefined = rest[0];
    // The SVG group abcjs drew for this element (tied pieces share a class, so do not look it up by class).
    const group: SVGGElement | undefined = abcElem.abselem?.elemset?.[0];
    // Which notehead of a chord was hit? `analysis.clickedClasses` only helps when the pointer is ON a filled
    // head; a hollow head (half note) has an empty centre and the event target is the <svg>. Use geometry.
    let chordPos: number | null = null;
    if (ev && group && oakIds.length > 1) {
      let best = Number.POSITIVE_INFINITY;
      for (const head of group.querySelectorAll(".abcjs-notehead")) {
        const b = head.getBoundingClientRect();
        const d = Math.hypot(ev.clientX - (b.left + b.width / 2), ev.clientY - (b.top + b.height / 2));
        const pos = Number(/abcjs-chord-pos-(\d+)/.exec(head.getAttribute("class") ?? "")?.[1]);
        if (d < best && pos) {
          best = d;
          chordPos = pos;
        }
      }
    }
    const hitIds = chordPos ? [oakIds[chordPos - 1] as number] : oakIds;
    const rec: ClickRecord = {
      staff: el.id,
      startChar: abcElem.startChar,
      endChar: abcElem.endChar,
      abcText: abc.slice(abcElem.startChar, abcElem.endChar),
      elType: abcElem.el_type,
      isRest: abcElem.rest !== undefined,
      classes,
      extraClass: abcElem.extraClass,
      oakIds,
      hitIds,
      pitches: (abcElem.pitches ?? []).map((p: { pitch: number }) => p.pitch),
      analysisKeys: Object.keys(analysis ?? {}).sort(),
      analysisName: analysis?.name,
      clickedName: analysis?.clickedName,
      clickedClasses: [...(analysis?.clickedClasses ?? [])].join(" "),
      target: `${ev?.type}:${(ev?.target as Element | null)?.tagName}`,
      groupIsG: group?.tagName === "g" && oakIds.every((id) => group.classList.contains(`oak-e${id}`)),
      chordPos,
      argCount: 5 + rest.length,
      locations: [],
    };
    enrich?.(rec);
    state.clicks.push(rec);
    if (rec.isRest) return; // selectTypes:['note'] also reports rests (they are el_type 'note')
    // Our own "clicked" marker, independent of abcjs' selection colouring.
    for (const n of el.querySelectorAll(".oak-clicked")) n.classList.remove("oak-clicked");
    for (const id of oakIds) for (const n of el.querySelectorAll(`.oak-e${id}`)) n.classList.add("oak-clicked");
  };
  return abcjs.renderAbc(el, abc, {
    add_classes: true,
    responsive: "resize",
    foregroundColor: "currentColor",
    selectionColor: "currentColor", // keep abcjs from painting the clicked note red
    selectTypes: ["note"],
    clickListener,
    ...extra,
  });
}

/**
 * Clock-driven highlighting: called with a cycle position from ANY clock (here a fake one; in Oak, Strudel's
 * scheduler). Looks up sounding event ids in the NotationModel and toggles a CSS class. No abcjs timing API.
 */
function setCycle(cycle: number) {
  state.cycle = cycle;
  for (const r of state.rendered) {
    const want = new Set(activeEventIds(r.score, cycle).map((id) => `oak-e${id}`));
    for (const n of r.el.querySelectorAll(".oak-active")) {
      if (![...n.classList].some((c) => want.has(c))) n.classList.remove("oak-active");
    }
    for (const c of want) for (const n of r.el.querySelectorAll(`.${c}`)) n.classList.add("oak-active");
  }
}

const ready = main();
Object.assign(window, { __oak: { state, ready, setCycle } });
