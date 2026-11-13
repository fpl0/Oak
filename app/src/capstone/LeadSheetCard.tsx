// The lead sheet of the arranged piece (C3.S3, contracts §6.6 "the lead sheet renders with approximate = false"):
// the melody on one staff, the chord symbols above it, a label and a double barline at each section, engraved by
// @oak/notation (`leadSheetPages`, the notation engineer's layout) at the panel's own width, a page at a time. What
// the grader's `notates` rule checks is what the learner sees here: bars the notation had to round are named.
import type { AnalysisSummary, KeySpec, MeterId } from "@oak/content-kit";
import { type Normalized, selectTrack } from "@oak/grader";
import {
  type ChordLabel,
  type LeadSheetPage,
  leadSheetLayout,
  leadSheetPages,
  notate,
  sectionMarks,
} from "@oak/notation";
import { renderStaff, tagSections } from "@oak/notation/render";
import { METERS } from "@oak/theory";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/kit/Button.tsx";
import type { PieceForm } from "./wave5.ts";

export interface LeadSheetPiece {
  n: Normalized;
  bars: number;
  key: KeySpec | null;
  meter: MeterId;
  bpm: number | null;
  analysis: AnalysisSummary | null;
  form: PieceForm | null;
  title: string;
}

/** The chord labels of the analysis (1-based bars) as the lead sheet takes them (0-based cycles). */
export function chordLabelsOf(analysis: Pick<AnalysisSummary, "slots"> | null): ChordLabel[] {
  return (analysis?.slots ?? [])
    .filter((s) => s.bar >= 1 && s.symbol)
    .map((s) => ({ bar: s.bar - 1, beat: s.beat, symbol: s.symbol }));
}

/** The pages of the piece's lead sheet for a host `width` px wide; `[]` when there is no melody. */
export function leadSheetOf(p: LeadSheetPiece, width: number): LeadSheetPage[] {
  const melody = selectTrack(p.n, "@melody").filter((e) => e.midi !== null && !e.drum);
  if (melody.length === 0) return [];
  const sections = (p.form?.sections ?? []).map((s) => ({
    label: s.label,
    tag: s.tag,
    startBar: s.startBar,
    bars: s.bars,
  }));
  return leadSheetPages(
    {
      melody,
      chords: chordLabelsOf(p.analysis),
      meter: METERS[p.meter] ?? METERS["4/4"],
      key: p.key,
      bars: p.bars,
      ...(p.bpm ? { tempoBpm: Math.round(p.bpm) } : {}),
      title: p.title,
      ...(sections.length ? { sections: sectionMarks(sections) } : {}),
    },
    leadSheetLayout(width),
  );
}

export function LeadSheetCard({ piece, stale }: { piece: LeadSheetPiece; stale: boolean }) {
  const frame = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [page, setPage] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    const el = frame.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e?.contentRect.width ?? 0);
      if (w > 0) setWidth((old) => (Math.abs(old - w) > 24 ? w : old));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pages = leadSheetOf(piece, width);
  const at = Math.min(page, Math.max(0, pages.length - 1));
  const current = pages[at] ?? null;
  const engraved = current ? notate(current.input, current.abc) : null;
  const abc = engraved?.abc.abc ?? null;
  const warnings = engraved?.score.warnings ?? [];
  useEffect(() => {
    const el = host.current;
    if (!el || !abc || !engraved) return;
    let live = true;
    setFailed(null);
    renderStaff(el, abc, {
      params: { staffwidth: current?.render.staffwidth ?? 700, jazzchords: false } as never,
    })
      .then(() => {
        if (!live) return;
        tagSections(el, engraved.score);
        el.dataset.ready = "1";
      })
      .catch((e: unknown) => {
        if (live) setFailed(e instanceof Error ? e.message : String(e));
      });
    return () => {
      live = false;
      delete el.dataset.ready;
    };
    // `engraved` is derived from `abc`; re-render only when the text changes.
  }, [abc]);
  const range = current
    ? `Bars ${current.startBar + 1}–${current.startBar + current.bars} of ${piece.bars}`
    : null;
  return (
    <section
      aria-labelledby="cap-lead"
      className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3"
      data-testid="lead-sheet"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="cap-lead" className="font-sans text-sm font-semibold text-text-2">
          Lead sheet
        </h2>
        {range && <span className="text-sm text-text-3 tabular-nums">{range}</span>}
        {pages.length > 1 && (
          <span className="ml-auto flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              icon={<ChevronLeft aria-hidden className="size-4" />}
              disabled={at === 0}
              onClick={() => setPage(at - 1)}
              aria-label="Previous page of the lead sheet"
            >
              Earlier
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<ChevronRight aria-hidden className="size-4" />}
              disabled={at >= pages.length - 1}
              onClick={() => setPage(at + 1)}
              aria-label="Next page of the lead sheet"
            >
              Later
            </Button>
          </span>
        )}
      </div>
      <div ref={frame} className={stale ? "opacity-70" : undefined}>
        {pages.length === 0 ? (
          <p className="text-sm text-text-2">
            The lead sheet is the melody with its chords above. Label a part{" "}
            <code className="font-mono">mel</code> (or <code className="font-mono">melody</code>) and it is
            written out here, section by section.
          </p>
        ) : failed ? (
          <p className="text-sm text-text-2">The lead sheet could not be drawn: {failed}</p>
        ) : (
          <div
            ref={host}
            className="oak-staff-host overflow-x-auto text-text"
            aria-label={`Lead sheet of ${piece.title}, ${range ?? ""}`}
            role="img"
          />
        )}
      </div>
      {warnings.length > 0 && (
        <ul className="text-sm text-text-2" data-testid="lead-sheet-warnings">
          {warnings.slice(0, 3).map((w) => (
            <li key={`${w.code}-${w.message}`}>{w.message}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
