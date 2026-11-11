// The HighlightBus (architecture §2.2, ux §3.4 "Linking model"): one per workbench instance. It links
// code ranges ↔ roll notes ↔ staff notes through the stable event IDs (`NEvent.id`), and carries the
// clock's playing set, the hover and the selection, the issue marks and the ghost notes. Pure: a tiny
// observable store, no React and no DOM.
import type { CodeRange } from "@oak/content-kit";
import type { AbcResult } from "@oak/notation";
import { overlaps } from "./code-roles.ts";

export type HighlightSource = "clock" | "code" | "roll" | "staff" | "keyboard" | "feedback";

export interface Focus {
  events: readonly string[];
  code: readonly CodeRange[];
  source: HighlightSource | null;
}

export interface LinkEvent {
  id: string;
  locs: readonly CodeRange[];
  primary: readonly CodeRange[];
  midi: number | null;
}

export type IssueMark = "error" | "warn" | "info";

export interface BusState {
  playing: ReadonlySet<string>;
  hover: Focus;
  selected: Focus;
  /** Event ID → severity of the issue that names it. */
  issues: ReadonlyMap<string, IssueMark>;
}

const EMPTY_FOCUS: Focus = { events: [], code: [], source: null };
const EMPTY_SET: ReadonlySet<string> = new Set();

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}
function sameFocus(a: Focus, b: Focus): boolean {
  return (
    a.source === b.source &&
    a.events.length === b.events.length &&
    a.events.every((e, i) => e === b.events[i]) &&
    a.code.length === b.code.length &&
    a.code.every((r, i) => r.from === b.code[i]?.from && r.to === b.code[i]?.to)
  );
}

/** Sorted, merged ranges (touching ranges are joined). */
export function mergeRanges(ranges: readonly CodeRange[]): CodeRange[] {
  const sorted = [...ranges].sort((a, b) => a.from - b.from || a.to - b.to);
  const out: CodeRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.from <= last.to) last.to = Math.max(last.to, r.to);
    else out.push({ from: r.from, to: r.to });
  }
  return out;
}

export class HighlightBus {
  private state: BusState = {
    playing: EMPTY_SET,
    hover: EMPTY_FOCUS,
    selected: EMPTY_FOCUS,
    issues: new Map(),
  };
  private readonly listeners = new Set<(s: BusState) => void>();
  private events: readonly LinkEvent[] = [];
  private byId = new Map<string, LinkEvent>();
  private abc: AbcResult | null = null;

  get(): BusState {
    return this.state;
  }

  subscribe(cb: (s: BusState) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** New analysis: re-index. Hover and selection keep only the events that still exist. */
  setEvents(events: readonly LinkEvent[], abc: AbcResult | null): void {
    this.events = events;
    this.byId = new Map(events.map((e) => [e.id, e] as const));
    this.abc = abc;
    const keep = (f: Focus): Focus =>
      f.source === "code"
        ? this.resolveCode(f.code, f.source)
        : this.resolveEvents(
            f.events.filter((id) => this.byId.has(id)),
            f.source,
          );
    this.set({ ...this.state, hover: keep(this.state.hover), selected: keep(this.state.selected) });
  }

  /** clock → roll + staff. Cheap to call per frame: emits only on change. */
  setPlaying(ids: Iterable<string>): void {
    const next = new Set(ids);
    if (sameSet(next, this.state.playing)) return;
    this.set({ ...this.state, playing: next.size ? next : EMPTY_SET });
  }

  hover(
    sel: { events?: readonly string[]; code?: readonly CodeRange[] } | null,
    source: HighlightSource,
  ): void {
    this.set({ ...this.state, hover: this.resolve(sel, source) });
  }

  select(
    sel: { events?: readonly string[]; code?: readonly CodeRange[] } | null,
    source: HighlightSource,
  ): void {
    this.set({ ...this.state, selected: this.resolve(sel, source) });
  }

  setIssues(issues: ReadonlyMap<string, IssueMark>): void {
    this.set({ ...this.state, issues });
  }

  // --- lookups ----------------------------------------------------------------------------------

  /**
   * Events whose PRIMARY atom (the note, the step, the drum sound) overlaps the range. Only when none
   * does, any contributing atom counts: a caret on `piano` in `.s("piano")` then lights every note.
   */
  eventsAtCode(range: CodeRange): string[] {
    const primary = this.events.filter((e) => e.primary.some((r) => overlaps(range, r))).map((e) => e.id);
    if (primary.length > 0) return primary;
    return this.events.filter((e) => e.locs.some((r) => overlaps(range, r))).map((e) => e.id);
  }

  /** The code ranges of events: their primary atoms, merged. */
  rangesOf(ids: readonly string[]): CodeRange[] {
    const out: CodeRange[] = [];
    for (const id of ids) {
      const e = this.byId.get(id);
      if (e) out.push(...e.primary);
    }
    return mergeRanges(out);
  }

  /** Staff note indices (`oak-e{n}`) of events, in the analysis's ABC or in a staff page's. */
  staffNsOf(ids: Iterable<string>, page: AbcResult | null = this.abc): number[] {
    if (!page) return [];
    const out = new Set<number>();
    for (const id of ids) {
      const n = page.byEvent.get(id);
      if (n !== undefined) out.add(n);
    }
    return [...out].sort((a, b) => a - b);
  }

  /** Events of staff notes. */
  eventsOfStaffNs(ns: readonly number[], page: AbcResult | null = this.abc): string[] {
    if (!page) return [];
    const out: string[] = [];
    for (const n of ns) for (const id of page.idMap[n]?.eventIds ?? []) if (this.byId.has(id)) out.push(id);
    return out;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  // ---------------------------------------------------------------------------------------------

  private resolve(
    sel: { events?: readonly string[]; code?: readonly CodeRange[] } | null,
    source: HighlightSource,
  ): Focus {
    if (!sel) return EMPTY_FOCUS;
    if (sel.events && sel.events.length > 0) return this.resolveEvents(sel.events, source);
    if (sel.code && sel.code.length > 0) return this.resolveCode(sel.code, source);
    return EMPTY_FOCUS;
  }

  private resolveEvents(ids: readonly string[], source: HighlightSource | null): Focus {
    if (ids.length === 0) return EMPTY_FOCUS;
    return { events: [...ids], code: this.rangesOf(ids), source };
  }

  private resolveCode(code: readonly CodeRange[], source: HighlightSource | null): Focus {
    if (code.length === 0) return EMPTY_FOCUS;
    const ids = new Set<string>();
    for (const r of code) for (const id of this.eventsAtCode(r)) ids.add(id);
    return { events: [...ids], code: code.map((r) => ({ from: r.from, to: r.to })), source };
  }

  private set(next: BusState): void {
    const prev = this.state;
    if (
      prev.playing === next.playing &&
      sameFocus(prev.hover, next.hover) &&
      sameFocus(prev.selected, next.selected) &&
      prev.issues === next.issues
    )
      return;
    this.state = next;
    for (const cb of this.listeners) cb(next);
  }
}
