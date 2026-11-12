// The staff (ux §3.4 "Staff", architecture §2.2 "StaffView"): abcjs loaded lazily, rendering the ABC that
// @oak/notation built from the same events as the roll. Highlighting is driven by the adapter's clock
// through the HighlightBus (abcjs TimingCallbacks are never used): `.oak-playing`, `.oak-hover`,
// `.oak-selected` and `.oak-issue` on the `oak-e{n}` elements. A click selects the note's events, which
// selects their code range. Loops longer than a page (8 bars) are engraved one page at a time; the page
// follows the playhead while playing (so the lit note is always on screen); when stopped it turns by hand, or to
// the notes pointed at from elsewhere (a tutor reference, a feedback row, a note selected in the code or the roll).
import type { KeySpec } from "@oak/content-kit";
import type { AbcResult } from "@oak/notation";
import { nsFromClasses, type RenderedStaff, renderStaff } from "@oak/notation/render";
import { useEffect, useMemo, useRef, useState } from "react";
import { type AnnotationKinds, anyAnnotation } from "./annotate.ts";
import type { BusState, HighlightBus } from "./highlight-bus.ts";
import { keyList, keyName, keySummary, staffClefText } from "./key-tools.ts";
import {
  barsPerLineFor,
  busiestBar,
  pageBarsFor,
  staffPage,
  staffPageCount,
  type WorkbenchModel,
} from "./model.ts";
import { colourHeads } from "./staff-colour.ts";

export interface StaffViewProps {
  model: WorkbenchModel;
  bus: HighlightBus;
  stale?: boolean;
  /** Degree and syllable in each note's accessible name (their unlocks). Default both. */
  hover?: { degree: boolean; solfege: boolean };
  /** The lines under the staff (lenses, or a lesson step's `staffLabels`); default: the model's own. */
  annotations?: AnnotationKinds;
}

const PREFIX = "oak-e";

/** Applies `cls` to exactly the `oak-e{n}` elements of `ns` (cheap: diffed against the last call). */
class ClassSync {
  private lit = new Set<number>();
  constructor(
    private readonly root: HTMLElement,
    private readonly cls: string,
  ) {}
  set(ns: readonly number[]): void {
    const want = new Set(ns);
    for (const n of this.lit)
      if (!want.has(n))
        for (const el of this.root.querySelectorAll(`.${PREFIX}${n}`)) el.classList.remove(this.cls);
    for (const n of want)
      if (!this.lit.has(n))
        for (const el of this.root.querySelectorAll(`.${PREFIX}${n}`)) el.classList.add(this.cls);
    this.lit = want;
  }
  reset(): void {
    this.lit = new Set();
  }
}

/** Roving tabindex over the labelled notes: `to` (or the first note) is the one tab stop. */
function rove(host: HTMLElement, to: SVGElement | null): void {
  for (const el of host.querySelectorAll("[tabindex]")) el.setAttribute("tabindex", "-1");
  const target = to ?? host.querySelector<SVGElement>("[data-oak-events]");
  if (!target) return;
  target.setAttribute("tabindex", "0");
  if (to) target.focus();
}

export function StaffView({ model, bus, stale, hover, annotations }: StaffViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendered = useRef<RenderedStaff | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const syncs = useRef<{
    playing: ClassSync;
    hover: ClassSync;
    selected: ClassSync;
    issue: ClassSync;
  } | null>(null);
  const ann = annotations ?? model.staffSource?.annotations ?? null;
  const annRef = useRef(ann);
  annRef.current = ann;
  const annKey = ann ? `${+ann.degree}${+ann.solfege}${+ann.noteName}` : "";
  // The staff's width decides how many bars share a line when texts sit under the notes.
  const [hostWidth, setHostWidth] = useState(0);
  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setHostWidth(Math.round(el.clientWidth / 20) * 20);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);
  const busiest = useMemo(
    () => (model.staffSource ? busiestBar(model.staffSource.events) : 0),
    [model.staffSource],
  );
  const lines0 = ann ?? model.staffSource?.annotations ?? null;
  const perLine =
    hostWidth > 0 && lines0 && anyAnnotation(lines0) ? barsPerLineFor(busiest, lines0, hostWidth) : null;
  const src = useMemo(() => {
    const base = model.staffSource;
    if (!base) return base;
    if (!ann && perLine === null) return base;
    const staves = model.score?.staves.length ?? 1;
    const textLines = lines0 ? +lines0.degree + +lines0.solfege + +lines0.noteName : 0;
    return {
      ...base,
      ...(ann ? { annotations: ann } : {}),
      ...(perLine !== null
        ? {
            barsPerLine: perLine,
            pageBars: pageBarsFor(base.pageBars, perLine, staves, textLines),
          }
        : {}),
    };
    // `ann` is read through its key: a new object with the same lines engraves nothing new.
  }, [model.staffSource, model.score, annKey, perLine]);
  const same = src === model.staffSource;
  const pages = src ? staffPageCount(src) : 1;
  const [pageWanted, setPage] = useState(0);
  const page = Math.min(pageWanted, pages - 1);
  const sheet = useMemo(
    () =>
      (page === 0 && same) || !src
        ? {
            startBar: 0,
            bars: Math.min(src?.bars ?? model.bars, src?.pageBars ?? model.bars),
            score: model.score,
            abc: model.abc,
            error: model.notationError,
          }
        : staffPage(src, page),
    [model, src, page, same],
  );
  const pageAbc = useRef<AbcResult | null>(sheet.abc);
  pageAbc.current = sheet.abc;
  const abc = sheet.abc?.abc ?? null;
  const modelRef = useRef(model);
  modelRef.current = model;
  const hoverRef = useRef(hover ?? { degree: true, solfege: true });
  hoverRef.current = hover ?? { degree: true, solfege: true };
  const pageRef = useRef({ page, pages, pageBars: src?.pageBars ?? 8 });
  pageRef.current = { page, pages, pageBars: src?.pageBars ?? 8 };
  /** The last outside focus (feedback hover, code or roll selection) the page followed. */
  const focusKey = useRef("");

  const apply = (s: BusState) => {
    // Turn the page to where the clock is (only loops longer than a page).
    const pr = pageRef.current;
    const pageOf = (ids: Iterable<string>): number | null => {
      let first = Number.POSITIVE_INFINITY;
      for (const id of ids) {
        const e = modelRef.current.byId.get(id);
        if (e && !e.band) first = Math.min(first, e.onset);
      }
      const want = Number.isFinite(first) ? Math.floor(first / pr.pageBars) : null;
      return want !== null && want >= 0 && want < pr.pages ? want : null;
    };
    const turn = (want: number | null): boolean => {
      if (want === null || want === pr.page) return false;
      pageRef.current = { ...pr, page: want };
      setPage(want);
      return true;
    };
    if (pr.pages > 1 && s.playing.size > 0) {
      if (turn(pageOf(s.playing))) return;
    } else if (pr.pages > 1) {
      // Stopped: something pointed at from elsewhere (a tutor reference or a feedback row, a note clicked in the
      // code or on the roll) that is on no note of this page turns to its page, once per new focus, so the
      // pointed-at notes are on screen. A page the learner turned by hand stays until the focus changes.
      const ext = [
        s.hover.source === "feedback" ? s.hover.events : [],
        s.selected.source !== null && s.selected.source !== "staff" ? s.selected.events : [],
      ];
      const key = ext.map((l) => l.join(" ")).join("|");
      if (key !== focusKey.current) {
        focusKey.current = key;
        for (const ids of ext) {
          if (ids.length === 0) continue;
          const onPage = ids.some((id) => pageOf([id]) === pr.page);
          if (!onPage && turn(pageOf(ids))) return;
          break;
        }
      }
    }
    const sy = syncs.current;
    const page = pageAbc.current;
    if (!sy || !rendered.current) {
      // Re-engraving (new code, lens lines, a page turn): nothing on the old drawing stays lit meanwhile.
      const host = hostRef.current;
      if (host) {
        delete host.dataset.activeEvents;
        delete host.dataset.activeNs;
      }
      return;
    }
    const playingNs = bus.staffNsOf(s.playing, page);
    sy.playing.set(playingNs);
    const host = hostRef.current;
    if (host) {
      host.dataset.activeEvents = bus.eventsOfStaffNs(playingNs, page).sort().join(" ");
      host.dataset.activeNs = playingNs.join(" ");
    }
    sy.hover.set(bus.staffNsOf(s.hover.events, page));
    sy.selected.set(bus.staffNsOf(s.selected.events, page));
    sy.issue.set(bus.staffNsOf(s.issues.keys(), page));
  };
  const applyRef = useRef(apply);
  applyRef.current = apply;

  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !abc) return;
    let cancelled = false;
    setStatus("loading");
    renderStaff(host, abc, {
      prefix: PREFIX,
      params: { staffwidth: Math.max(280, host.clientWidth - 30), jazzchords: true } as never,
      onClick: (hit) => {
        const ns = hit.member !== null ? [hit.member] : hit.ns;
        const events = bus.eventsOfStaffNs(ns, pageAbc.current);
        bus.select(events.length ? { events } : null, "staff");
      },
    })
      .then((r) => {
        if (cancelled) return;
        rendered.current = r;
        syncs.current = {
          playing: new ClassSync(host, "oak-playing"),
          hover: new ClassSync(host, "oak-hover"),
          selected: new ClassSync(host, "oak-selected"),
          issue: new ClassSync(host, "oak-issue"),
        };
        // Label every engraved note with its pitches and place (screen readers, tests, devtools).
        const offset = sheetRef.current.startBar;
        const show = hoverRef.current;
        for (const entry of pageAbc.current?.idMap ?? []) {
          const labels = entry.eventIds
            .map((id) => modelRef.current.byId.get(id)?.label?.degree)
            .filter((d): d is NonNullable<typeof d> => !!d);
          const degree = labels.map((d) => d.label).join(" ");
          const syllable = labels.map((d) => d.syllable).join(" ");
          const said = [
            entry.pitches.join(" "),
            `bar ${entry.bar + offset}, beat ${entry.beat}`,
            show.degree && degree ? `degree ${degree}` : null,
            show.solfege && syllable ? syllable : null,
          ].filter(Boolean);
          for (const node of host.querySelectorAll(`.${PREFIX}${entry.n}`)) {
            node.setAttribute("aria-label", said.join(", "));
            node.setAttribute("data-oak-events", entry.eventIds.join(" "));
            if (show.degree && degree) node.setAttribute("data-oak-degree", degree);
            else node.removeAttribute("data-oak-degree");
          }
        }
        // Degree colours on the heads while the degree line shows (tb.feature.degree-labels: labels and colours).
        if (annRef.current?.degree)
          colourHeads(
            host,
            (pageAbc.current?.idMap ?? []).map((entry) => ({
              n: entry.n,
              degrees: entry.eventIds
                .map((id) => modelRef.current.byId.get(id)?.label?.degree?.num ?? 0)
                .filter((d) => d > 0),
            })),
          );
        // One tab stop for the whole staff (roving tabindex): abcjs makes every note and rest a stop, which
        // puts hundreds of stops between the transport and the rest of the page on a long loop.
        rove(host, null);
        setStatus("ready");
        setError(null);
        applyRef.current(bus.get());
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setStatus("error");
        setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
      rendered.current = null;
      syncs.current = null;
      // The old drawing stays on screen until the new one lands: drop its highlights and its playing mirror now.
      for (const cls of ["oak-playing", "oak-hover", "oak-selected", "oak-issue"])
        for (const el of host.querySelectorAll(`.${cls}`)) el.classList.remove(cls);
      delete host.dataset.activeEvents;
      delete host.dataset.activeNs;
    };
  }, [abc, bus]);

  useEffect(() => bus.subscribe((s) => applyRef.current(s)), [bus]);

  // Arrows move between the engraved notes; Enter/Space still reach abcjs (it selects on keyup). Up/Down
  // are taken here, before abcjs's own handler would drag the note on a read-only staff.
  const onKeyDownCapture = (ev: React.KeyboardEvent<HTMLDivElement>) => {
    const host = hostRef.current;
    const from = (ev.target as Element).closest?.("[data-oak-events]");
    if (!host || !from) return;
    if (ev.key === "Enter" || ev.key === " ") {
      // Select the note's events (and so its code) ourselves: abcjs's keyboard path expects a pointer.
      ev.preventDefault();
      ev.stopPropagation();
      const ids = (from.getAttribute("data-oak-events") ?? "").split(" ").filter((id) => bus.has(id));
      bus.select(ids.length ? { events: ids } : null, "staff");
      return;
    }
    const dir =
      ev.key === "ArrowRight" || ev.key === "ArrowDown"
        ? 1
        : ev.key === "ArrowLeft" || ev.key === "ArrowUp"
          ? -1
          : ev.key === "Home"
            ? -Infinity
            : ev.key === "End"
              ? Infinity
              : 0;
    if (dir === 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    const notes = [...host.querySelectorAll<SVGElement>("[data-oak-events]")];
    const i = notes.indexOf(from as SVGElement);
    const j = Number.isFinite(dir) ? i + dir : dir < 0 ? 0 : notes.length - 1;
    const to = notes[Math.max(0, Math.min(notes.length - 1, j))];
    if (to) rove(host, to);
  };

  // abcjs selects on keyup (Enter/Space) and drags on Up/Down: both are handled above instead.
  const onKeyUpCapture = (ev: React.KeyboardEvent<HTMLDivElement>) => {
    if (!(ev.target as Element).closest?.("[data-oak-events]")) return;
    if (["Enter", " ", "ArrowUp", "ArrowDown"].includes(ev.key)) ev.stopPropagation();
  };

  // Hover: abcjs has no hover callback; read the class of the element under the pointer.
  const onMove = (ev: React.MouseEvent<HTMLDivElement>) => {
    const target = (ev.target as Element).closest?.(`[class*="${PREFIX}"]`);
    const ns = target ? nsFromClasses(target.getAttribute("class") ?? "", PREFIX) : [];
    if (ns.length) bus.hover({ events: bus.eventsOfStaffNs(ns, pageAbc.current) }, "staff");
    else if (bus.get().hover.source === "staff") bus.hover(null, "staff");
  };
  const onLeave = () => {
    if (bus.get().hover.source === "staff") bus.hover(null, "staff");
  };

  const first = sheet.startBar + 1;
  const last = sheet.startBar + sheet.bars;
  const clef = staffClefText(sheet.score);
  const keys = keySummary(
    model.keySpans,
    sheet.startBar,
    sheet.startBar + sheet.bars,
    sheet.score?.key ?? null,
  );
  // A staff in a key of its own (two tracks in two keys) is named after the piece's key.
  const ownKeys = (sheet.score?.staves ?? [])
    .filter((st) => st.key)
    .map((st) => {
      const keys = [st.key as KeySpec, ...(st.keyChanges ?? []).map((c) => c.key as KeySpec)].map(keyName);
      const shown = keys.length > 3 ? [keys[0], "…", keys[keys.length - 1]] : keys;
      return `${st.clef === "bass" ? "bass staff" : "treble staff"} in ${shown.join(" → ")}`;
    });
  const lines: AnnotationKinds | null = src?.annotations ?? null;
  return (
    <div
      className="oak-staff"
      data-testid="staff-view"
      data-status={status}
      data-page={page}
      data-annotations={
        lines && anyAnnotation(lines)
          ? (["degree", "solfege", "noteName"] as const).filter((k) => lines[k]).join(" ")
          : ""
      }
    >
      <div className="oak-view-head">
        {sheet.score ? (
          <span className="oak-staff-facts" data-testid="staff-facts">
            {clef ? <span data-testid="staff-clef">{clef}</span> : null}
            {keys ? (
              <span
                data-testid="staff-key"
                title={
                  keys.includes("…")
                    ? keyList(model.keySpans, sheet.startBar, sheet.startBar + sheet.bars)
                    : undefined
                }
              >
                {keys}
              </span>
            ) : null}
            {ownKeys.length ? <span data-testid="staff-own-keys">{ownKeys.join(", ")}</span> : null}
          </span>
        ) : null}
        {pages > 1 ? (
          <span className="oak-staff-pager" data-testid="staff-pager">
            <button
              type="button"
              className="oak-link-button"
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              aria-label="Previous bars"
            >
              ‹
            </button>
            <span aria-live="polite">
              Bars {first}–{last} of {src?.bars ?? last}
            </span>
            <button
              type="button"
              className="oak-link-button"
              onClick={() => setPage(Math.min(pages - 1, page + 1))}
              disabled={page >= pages - 1}
              aria-label="Next bars"
            >
              ›
            </button>
          </span>
        ) : null}
        {stale ? <span className="oak-badge">preview · not playing</span> : null}
        {model.score?.approximate ? (
          <span
            className="oak-badge"
            title="The rhythm was snapped to a grid to be written down."
            data-testid="staff-approx"
          >
            approx
          </span>
        ) : null}
      </div>
      {abc ? null : (
        <p className="oak-muted">{sheet.error ? `No staff: ${sheet.error}` : "Nothing to engrave."}</p>
      )}
      {error ? <p className="oak-muted">Staff failed to render: {error}</p> : null}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: hover mirrors the roll; clicks go through abcjs */}
      <div
        ref={hostRef}
        className="oak-staff-host"
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        onKeyDownCapture={onKeyDownCapture}
        onKeyUpCapture={onKeyUpCapture}
      />
    </div>
  );
}
