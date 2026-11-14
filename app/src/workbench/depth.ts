// The model as THIS learner reads it (Wave 6, docs/design/wave6.md §4.3, definition of done 15): the analysis
// (model.ts) reads everything the code plays; `applyDepth` writes it as deep as the course has taught. A seventh
// is its triad until the dominant seventh (U11.L04) or the seventh family (U12.L01); an applied chord has no
// numeral until U15.L02, a borrowed one until U16.L01; a chromatic note takes the chord's reading and its
// syllable (fi, si, ra …) from U15.L01. One function for every view: the roll, its chord band, the staff's
// labels and texts, the chart, the keyboard, hover text and the notes table all read the returned model, so no
// view can show what another holds back. Pure; the staff's first page is engraved again only when a label on it
// changed.
import type { HarmonyDepth } from "../lib/harmony-lens.ts";
import { type BandChord, bandChords, bandLabels, closedLabel } from "./colour.ts";
import { type StaffSource, staffPage, type ViewEvent, type WorkbenchModel } from "./model.ts";
import type { PitchLabel } from "./music.ts";

export interface DepthModel extends WorkbenchModel {
  /** The chord band as written at this depth, one entry per region of `harmony.regions`; `[]` without chords. */
  band: readonly BandChord[];
  depth: HarmonyDepth;
}

const sameLabel = (a: PitchLabel | null, b: PitchLabel | null): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.name === b.name &&
    a.degree?.label === b.degree?.label &&
    a.degree?.syllable === b.degree?.syllable);

export function depthKey(d: HarmonyDepth): string {
  return `${+d.sevenths}${+d.applied}${+d.borrowed}${+d.chromatic}`;
}

/** The label of one event at a depth. */
export function labelAt(e: Pick<ViewEvent, "label" | "labelTaught">, depth: Pick<HarmonyDepth, "chromatic">) {
  if (depth.chromatic) return e.labelTaught ?? e.label;
  return closedLabel(e.label);
}

/** The model written as deep as `depth` allows. */
export function applyDepth(model: WorkbenchModel, depth: HarmonyDepth): DepthModel {
  // --- the notes: chromatic degrees and syllables ---
  let eventsChanged = false;
  const events = model.events.map((e) => {
    const label = labelAt(e, depth);
    if (sameLabel(label, e.label)) return e;
    eventsChanged = true;
    return { ...e, label };
  });
  // --- the chords: sevenths, applied and borrowed numerals ---
  const h = model.harmony;
  const band = h ? bandChords(h.regions, model.colour?.regions ?? [], depth) : [];
  let harmony = h;
  let chordsChanged = false;
  if (h) {
    const regions = h.regions.map((r, i) => {
      const b = band[i];
      if (!b || (b.symbol === r.symbol && b.rn === r.rn)) return r;
      chordsChanged = true;
      return { ...r, symbol: b.symbol, rn: b.rn };
    });
    if (chordsChanged)
      harmony = { ...h, regions, labels: bandLabels(regions, band, model.meter.unitsPerBar) };
  }
  if (!eventsChanged && !chordsChanged) return { ...model, band, depth };

  const byId = eventsChanged ? new Map(events.map((e) => [e.id, e] as const)) : model.byId;
  let staffSource: StaffSource | null = model.staffSource;
  let { score, abc, notationError } = model;
  if (staffSource) {
    staffSource = {
      ...staffSource,
      ...(eventsChanged
        ? {
            labelOf: (id: string) => byId.get(id)?.label ?? null,
            // A relabelled head keeps the depth: a syllable not taught yet stays out.
            ...(staffSource.relabel
              ? {
                  relabel: (id: string, written: string) => {
                    const l = (model.staffSource as StaffSource).relabel?.(id, written) ?? null;
                    return depth.chromatic ? l : closedLabel(l);
                  },
                }
              : {}),
          }
        : {}),
      ...(chordsChanged && harmony ? { chordLabels: harmony.labels } : {}),
    };
    // The first page was engraved with the analysis's own labels: engrave it again when its texts changed.
    const texts = staffSource.annotations;
    const pageNeedsTexts = eventsChanged && (texts.degree || texts.solfege || texts.noteName);
    const pageNeedsChords = chordsChanged && staffSource.chordSet !== undefined;
    if (pageNeedsTexts || pageNeedsChords) {
      const first = staffPage(staffSource, 0);
      score = first.score;
      abc = first.abc;
      notationError = first.error;
    }
  }
  return {
    ...model,
    events: eventsChanged ? events : model.events,
    byId,
    harmony,
    staffSource,
    score,
    abc,
    notationError,
    band,
    depth,
  };
}
