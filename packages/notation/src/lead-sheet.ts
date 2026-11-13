// Wave 4 seam (docs/design/wave4.md §3.3): chord labels on a staff and the lead-sheet layout. Pure: inputs in,
// `NotationInput` out. The engraving itself (chord symbols above, Roman numerals below, stacked noteheads with
// seconds offset by abcjs, the pickup bar) is the existing `buildScore` + `toAbc`; the DOM layer gives the drawn
// labels stable classes (`tagChordLabels` in `@oak/notation/render`).
import type { KeySpec, MeterSpec, NEvent, PickupSpec, SwingSpec } from "@oak/content-kit";
import type { AnnotationSet } from "./options.ts";
import type { AbcOptions, NotationInput, Score, SectionMark, StaffKind } from "./types.ts";

/**
 * Stable classes of the chord labels in a rendered staff: every chord symbol above the staff carries
 * `oak-ann-chord`, every Roman numeral under it `oak-ann-rn`, and both `oak-ann-at{i}` with `i` the index in
 * `Score.chords` / `Score.romans`. The Workbench, the lenses and the tests select on them.
 */
export const CHORD_LABEL_CLASSES = {
  symbol: "oak-ann-chord",
  roman: "oak-ann-rn",
  /** Prefix of the index class: `oak-ann-at3`. */
  at: "oak-ann-at",
} as const;

/** Which chord labels a staff shows: the chord-symbol and Roman-numeral lenses (app `useLenses().chords`). */
export interface ChordLabelSet {
  /** Lead-sheet symbols above the top staff ("C", "G/B", "B°"). */
  symbols?: boolean;
  /** Roman numerals under the bottom pitched staff ("I", "V6", "viio"). */
  romans?: boolean;
}

/** One chord label: where it starts and what it says. */
export interface ChordLabel {
  /** 0-based cycle (absolute, like `NotationInput.chords`). */
  bar: number;
  /** 1-based beat in tempo units (1.5 = the "&" of beat 1). */
  beat: number;
  /** Code spelling ("Co", "Caug", "G/B" is allowed here: a label, not code); translated for display. */
  symbol: string;
  /** Roman numeral in Oak's dialect ("V6", "viio"), when the view knows the key. */
  rn?: string | null;
}

/**
 * The `chords` / `romans` fields of a `NotationInput` for a list of chord labels, filtered by the lenses. The
 * grader's `harmonyView(...).slots` map onto `ChordLabel` one to one (bar = `floor(span[0])`, beat from the
 * position in the bar).
 */
export function chordLabelInput(
  labels: readonly ChordLabel[],
  which: ChordLabelSet,
): Pick<NotationInput, "chords" | "romans"> {
  const out: Pick<NotationInput, "chords" | "romans"> = {};
  if (which.symbols) out.chords = labels.map((l) => ({ bar: l.bar, beat: l.beat, symbol: l.symbol }));
  if (which.romans)
    out.romans = labels.flatMap((l) => (l.rn ? [{ bar: l.bar, beat: l.beat, rn: l.rn }] : []));
  return out;
}

/** A lead sheet: one melody staff with chord symbols above (U07.L09, C2's brief, X1's given skeleton). */
export interface LeadSheetInput {
  /** The melody's events (one line; chords in it are engraved as stacked noteheads). */
  melody: NEvent[];
  /** The changes. Absent: taken from the melody events' `chordSymbol` (rare: a melody with chord() in it). */
  chords?: readonly ChordLabel[];
  meter: MeterSpec;
  key: KeySpec | null;
  bars: number;
  startBar?: number;
  /** Bar 0 is engraved as a partial measure holding only the pickup (contracts §6.11). */
  pickup?: PickupSpec;
  /** The last bar given is the song's last (default true): with a pickup it is shortened (contracts §6.11). */
  endsPiece?: boolean;
  swing?: SwingSpec;
  tempoBpm?: number;
  title?: string;
  /** Roman numerals under the staff too (the Roman-numeral lens). Default false. */
  romans?: boolean;
  /** Note-label lenses under the melody. */
  annotations?: AnnotationSet;
  /**
   * Wave 5: the sections of an arranged piece (`sectionMarks(formView.sections)`, C3.S3): a label over each section's
   * first bar and a double barline before it. A page that starts inside a section repeats its name in parentheses.
   */
  sections?: readonly SectionMark[];
  /** Wave 5: blue-note spelling (`NotationInput.blues`); default from the key and the changes. */
  blues?: boolean;
}

/**
 * The chord labels with the sounding chord restated on beat 1 of each bar in `at` that has no chord of its own
 * (a page or a section that starts while a chord rings on): a lead sheet names the harmony at every new page and
 * section, as charts do (Wave 5, C3's lead sheet: "Verse" at bar 17 over a C held from bar 16).
 */
export function restateChords(labels: readonly ChordLabel[], at: readonly number[]): ChordLabel[] {
  const sorted = [...labels].sort((a, b) => a.bar - b.bar || a.beat - b.beat);
  const out = [...sorted];
  for (const bar of new Set(at)) {
    if (sorted.some((l) => l.bar === bar && l.beat <= 1)) continue;
    const before = sorted.filter((l) => l.bar < bar).pop();
    if (before) out.push({ ...before, bar, beat: 1 });
  }
  return out.sort((a, b) => a.bar - b.bar || a.beat - b.beat);
}

/** The `NotationInput` of a lead sheet: staff `lead` (treble, symbols above, the melody only). */
export function leadSheetInput(i: LeadSheetInput): NotationInput {
  const starts = [
    ...(i.startBar !== undefined && i.startBar > 0 ? [i.startBar] : []),
    ...(i.sections ?? []).map((m) => m.bar),
  ];
  const chords = i.chords ? restateChords(i.chords, starts) : undefined;
  const labels = chords ? chordLabelInput(chords, { symbols: true, romans: i.romans ?? false }) : {};
  return {
    events: [...i.melody],
    meter: i.meter,
    key: i.key,
    bars: i.bars,
    staff: "lead",
    ...(i.startBar === undefined ? {} : { startBar: i.startBar }),
    ...labels,
    ...(i.pickup ? { pickup: i.pickup } : {}),
    ...(i.endsPiece === false ? { endsPiece: false } : {}),
    ...(i.swing ? { swing: i.swing } : {}),
    ...(i.tempoBpm === undefined ? {} : { tempoBpm: i.tempoBpm }),
    ...(i.title === undefined ? {} : { title: i.title }),
    ...(i.annotations ? { annotations: i.annotations } : {}),
    ...(i.sections?.length ? { sections: i.sections } : {}),
    ...(i.blues === undefined ? {} : { blues: i.blues }),
  };
}

/**
 * The section marks a page from `startBar` shows: its own, plus, when the page starts inside a section, that
 * section's name in parentheses over its first bar ("(Chorus)"), with no double barline.
 */
export function pageSections(sections: readonly SectionMark[], startBar: number): SectionMark[] {
  const sorted = [...sections].sort((a, b) => a.bar - b.bar);
  const own = sorted.filter((m) => m.bar >= startBar);
  if (own[0]?.bar === startBar) return own;
  const open = sorted.filter((m) => m.bar < startBar).pop();
  return open ? [{ ...open, bar: startBar, text: `(${open.text})`, doubleBar: false }, ...own] : own;
}

/** How a lead sheet is laid out in a host of a given width. */
export interface LeadSheetLayout {
  /** Bars per system (4 on a wide panel, 2 on a narrow one, 1 on a phone). The pickup bar does not count. */
  barsPerLine: number;
  /** Systems per page. */
  linesPerPage: number;
  /** Full bars per page (`barsPerLine × linesPerPage`); the first page also holds the pickup bar. */
  barsPerPage: number;
  /**
   * The abcjs `staffwidth` render parameter for the host (its width less the margins, at most abcjs's default 740):
   * engraved at the host's own width, a narrow lead sheet is not scaled down to unreadable type.
   */
  staffwidth: number;
}
/** Room one lead-sheet bar needs: a chord symbol per half bar and a melody of eighths stay clear of each other. */
export const LEAD_SHEET_BAR_PX = 190;
/** The clef, key and time signature at the start of a system, and the margins. */
const LEAD_SHEET_LINE_PX = 80;

/**
 * The layout of a lead sheet in a host `width` CSS pixels wide: as many bars a system as fit (1 to 4, never a bar
 * squeezed under its symbols), four systems a page, three when numerals or note labels add a line under each.
 */
export function leadSheetLayout(width: number, opts: { textLines?: number } = {}): LeadSheetLayout {
  const fit = Math.floor((Math.max(0, width) - LEAD_SHEET_LINE_PX) / LEAD_SHEET_BAR_PX);
  const barsPerLine = Math.max(1, Math.min(4, fit));
  const linesPerPage = (opts.textLines ?? 0) > 0 ? 3 : 4;
  const staffwidth = Math.round(Math.max(200, Math.min(740, width - 40)));
  return { barsPerLine, linesPerPage, barsPerPage: barsPerLine * linesPerPage, staffwidth };
}

/** One page of a lead sheet: what to engrave (`notate(input, abc)`) and the bars it covers. */
export interface LeadSheetPage {
  page: number;
  /** 0-based first cycle of the page (0: the pickup bar, when there is one). */
  startBar: number;
  bars: number;
  input: NotationInput;
  abc: AbcOptions;
  /** abcjs render parameters for the page (`renderStaff(el, abc, { params })`). */
  render: { staffwidth: number };
}

/**
 * A lead sheet in pages for a host's layout. The first page holds the pickup bar (if any) and `barsPerPage` full
 * bars; the others `barsPerPage` each (bars that would not fill a system are kept on the page before). Every page is numbered from its own first bar (with a pickup, cycle 0 is bar
 * 0), only the last page ends with the final barline and has its last bar shortened by the pickup; no repeat
 * signs are ever written (every bar is spelled out).
 */
export function leadSheetPages(i: LeadSheetInput, layout: LeadSheetLayout): LeadSheetPage[] {
  const first = i.startBar ?? 0;
  const stop = first + Math.max(0, i.bars);
  const per = Math.max(1, layout.barsPerPage);
  const pages: LeadSheetPage[] = [];
  let at = first;
  while (at < stop || pages.length === 0) {
    const room = pages.length === 0 && i.pickup && first === 0 ? per + 1 : per;
    // Bars left over that would not fill one system go on this page (one more line) rather than alone on a page.
    const left = stop - at - room;
    const bars = Math.max(0, left > 0 && left < layout.barsPerLine ? stop - at : Math.min(room, stop - at));
    const last = at + bars >= stop;
    pages.push({
      page: pages.length,
      startBar: at,
      bars,
      input: leadSheetInput({
        ...i,
        ...(i.sections?.length
          ? { sections: pageSections(i.sections, at).filter((m) => m.bar < at + bars) }
          : {}),
        startBar: at,
        bars,
        ...(last ? (i.endsPiece === false ? { endsPiece: false } : {}) : { endsPiece: false }),
      }),
      abc: {
        barsPerLine: Math.max(1, layout.barsPerLine),
        finalBar: last && i.endsPiece !== false,
        barNumbers: true,
      },
      render: { staffwidth: layout.staffwidth },
    });
    if (bars === 0) break;
    at += bars;
  }
  return pages;
}

/**
 * What a lesson host passes for a step's staff (contracts §5.8 `StepUi.panels.staff`): the `StaffKind`, and for
 * a grand staff the per-track clefs, so a `bass:` track always reads in the bass clef (U05.L06). `trackClefs`
 * comes from the step's labelled tracks: `bass`/`lh` → bass, everything else → treble.
 */
export function stepStaffInput(
  staff: "treble" | "bass" | "grand" | "perc" | "lead",
  tracks: readonly string[],
): Pick<NotationInput, "staff" | "trackClefs" | "split"> {
  const kind: StaffKind = staff === "perc" ? "percussion" : staff;
  if (kind !== "grand") return { staff: kind };
  const trackClefs: Record<string, "treble" | "bass"> = {};
  for (const t of tracks) trackClefs[t] = /^(bass|lh|left|low)/i.test(t) ? "bass" : "treble";
  return { staff: "grand", split: "track", trackClefs };
}

/** The chord symbols and numerals a rendered score shows, in order (for tests and accessible text). */
export function chordLabelTexts(score: Score): { symbols: string[]; romans: string[] } {
  return {
    symbols: (score.chords ?? []).map((c) => c.text),
    romans: (score.romans ?? []).map((r) => r.text),
  };
}
