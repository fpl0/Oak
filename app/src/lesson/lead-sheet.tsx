// A lead sheet inside a lesson step (Wave 4: `StepUi.leadSheet`, `Stimulus.showLeadSheet`; U07.L09 "play / sing
// from the page"): the step's tune on one treble staff with the chord symbols above it, in the lesson's meter,
// with the pickup bar when the lesson or exercise declares one. The melody is the code's own melody track; the
// chords are a fixed chart (code spellings, bar 1-based, 0 = the pickup bar) or read from a chord track by the
// grader's harmony view (`harmonyView`, never a table here). Engraving is @oak/notation's `leadSheetInput`.
import type { Exercise, KeySpec, LeadSheetSpec, MeterId, PickupSpec, StepDef } from "@oak/api";
import { harmonyView, normalize, selectTrack } from "@oak/grader";
import { type ChordLabel, leadSheetInput, notate } from "@oak/notation";
import { renderStaff } from "@oak/notation/render";
import { METERS } from "@oak/theory";
import { useEffect, useRef, useState } from "react";
import { analyzeCode } from "../lib/grader-client.ts";
import { useStepHostOptional } from "./frame.tsx";
import { chartLabels } from "./harmony.ts";

export interface LeadSheetSource {
  code: string;
  bars: number;
  spec: LeadSheetSpec;
}

/** The lead sheet a step shows, with the code it is read from, or `null`. */
export function leadSheetOf(
  step: Pick<StepDef, "ui" | "example">,
  ex: Exercise | undefined,
): LeadSheetSource | null {
  const stim = ex && "stimulus" in ex ? ex.stimulus : undefined;
  const fromStim = stim?.src === "code" && stim.showLeadSheet ? stim : null;
  const spec: LeadSheetSpec | null =
    step.ui.leadSheet ?? (fromStim ? { melody: "melody", chords: "chords" } : null);
  if (!spec) return null;
  if (fromStim) return { code: fromStim.code, bars: fromStim.bars, spec };
  if (step.example) return { code: step.example.code, bars: step.example.bars ?? 4, spec };
  const ref = ex && "reference" in ex && ex.reference && "solutions" in ex.reference ? ex.reference : null;
  if (ref?.solutions[0]) return { code: ref.solutions[0], bars: ref.bars, spec };
  if (stim?.src === "code") return { code: stim.code, bars: stim.bars, spec };
  return null;
}

/** The melody's events: the named track, then `@melody`, then a track called `mel`. */
function melodyOf(n: Parameters<typeof selectTrack>[0], ref: string | undefined) {
  for (const r of [ref, "@melody", "melody", "mel"].filter((x): x is string => !!x)) {
    const ev = selectTrack(n, r as never);
    if (ev.length > 0) return ev;
  }
  return [];
}

export function LeadSheetView({
  spec: src,
  meter: meterIn,
  keySpec,
  pickup: pickupIn,
}: {
  spec: LeadSheetSource;
  meter?: MeterId;
  keySpec?: KeySpec;
  pickup?: PickupSpec;
}) {
  const h = useStepHostOptional();
  const meter = meterIn ?? h?.exercise?.meter ?? h?.env.meter ?? "4/4";
  const key = keySpec ?? h?.exercise?.key ?? h?.env.key ?? null;
  const pickup = pickupIn ?? h?.exercise?.pickup ?? h?.env.pickup;
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ status: "drawing" | "ready" | "error"; symbols: string[] }>({
    status: "drawing",
    symbols: [],
  });
  const { code, bars, spec } = src;
  const chartKey = JSON.stringify(spec.chords);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = await analyzeCode(code, { mode: "lesson", bars, lint: null, meter });
        if (!res.ok) throw new Error("the tune did not run");
        const ctx = { meter, ...(key ? { key } : {}), ...(pickup ? { pickup } : {}) };
        const n = normalize(res, ctx);
        const melody = melodyOf(n, spec.melody);
        const beatsPerBar = METERS[meter].unitsPerBar;
        let chords: ChordLabel[];
        if (typeof spec.chords === "object" && "chart" in spec.chords)
          chords = chartLabels(spec.chords.chart, !!pickup);
        else {
          const view = harmonyView(n, { ...ctx, bars });
          chords = view.slots.map((s) => {
            const at = s.span[0][0] / s.span[0][1];
            const bar = Math.floor(at + 1e-9);
            return {
              bar,
              beat: Math.round((at - bar) * beatsPerBar * 100) / 100 + 1,
              symbol: s.symbol,
              rn: s.rn,
            };
          });
        }
        const input = leadSheetInput({
          melody,
          chords,
          meter: METERS[meter],
          key,
          bars,
          ...(pickup ? { pickup } : {}),
          ...(spec.title ? { title: spec.title } : {}),
          ...(spec.degrees ? { annotations: { degree: true, solfege: false, noteName: false } } : {}),
        });
        const { abc } = notate(input);
        const el = host.current;
        if (!live || !el) return;
        await renderStaff(el, abc.abc, {
          params: { staffwidth: Math.max(260, el.clientWidth - 30), jazzchords: false } as never,
        });
        if (live) setState({ status: "ready", symbols: chords.map((c) => c.symbol) });
      } catch {
        if (live) setState({ status: "error", symbols: [] });
      }
    })();
    return () => {
      live = false;
    };
  }, [
    code,
    bars,
    meter,
    key?.tonic,
    key?.mode,
    pickup?.units?.[0],
    pickup?.units?.[1],
    chartKey,
    spec.melody,
  ]);
  return (
    <figure
      className="oak-workbench rounded-card border border-border bg-surface p-2"
      aria-label={`Lead sheet${state.symbols.length ? `, chords ${state.symbols.join(" ")}` : ""}`}
      data-testid="lead-sheet"
      data-status={state.status}
      data-chords={state.symbols.join(" ")}
    >
      <figcaption className="px-1 text-sm font-medium">From the page</figcaption>
      <div ref={host} className="text-text" />
      {state.status === "drawing" && <p className="p-2 text-sm text-text-3">Drawing…</p>}
      {state.status === "error" && (
        <p className="p-2 text-sm text-text-2">The lead sheet could not be drawn.</p>
      )}
    </figure>
  );
}
