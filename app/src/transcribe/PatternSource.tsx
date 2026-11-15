// A short piece played as a pattern source (contracts §6.12: hidden code in a hidden adapter, a bar timeline in
// place of a waveform), for the gym's generated jazz and rhythm items and for hosts outside Transcribe (R3.L05's
// rhythm lab, J4.L04's standard, JC4's analysis): the transport row, the bar timeline with the piece's own grid —
// swung 8ths or 16ths, an odd meter by its groups, the two-bar clave grid (K) — and Transcribe's keys. The code
// is played, never shown.
import type { MeterId } from "@oak/content-kit";
import { useEffect, useRef, useState } from "react";
import { getOak } from "../lib/oak.ts";
import { keyScope, useHotkeys } from "../ui/keys/KeymapProvider.tsx";
import { Button } from "../ui/kit/Button.tsx";
import { Skeleton } from "../ui/kit/basics.tsx";
import { Callout } from "../ui/kit/Controls.tsx";
import {
  type ClaveSpec,
  type GridFeel,
  loopOfBars,
  nextClave,
  setLoopPoint,
  stepRate,
  stepSemitones,
} from "./grid.ts";
import { type TranscribeAction, transcribeBindings } from "./keys.ts";
import { BarTimeline, type TimelineMarkView } from "./SourceView.tsx";
import type { StimulusCode } from "./stimulus-code.ts";
import { TransportControls } from "./TransportControls.tsx";
import { createPatternTransport, type TranscribeTransport } from "./transport.ts";
import { useTransportState } from "./use-transport.ts";

const USABLE: readonly TranscribeAction[] = [
  "play",
  "loop",
  "rateDown",
  "rateUp",
  "semiDown",
  "semiUp",
  "prevBar",
  "nextBar",
  "setA",
  "setB",
  "clave",
];

export function PatternSource({
  stimulus,
  bars,
  cps,
  meter,
  feel = "straight",
  grouping = null,
  preload = [],
  clave: claveGiven = null,
  claveKey = true,
  marks = [],
  barMarks,
  label = "The source",
  pickup = false,
  autoFocus = false,
}: {
  stimulus: StimulusCode;
  /** Bars the piece loops over (one cycle a bar). */
  bars: number;
  /** Bars a second at rate 1. */
  cps: number;
  meter: MeterId;
  feel?: GridFeel;
  grouping?: readonly number[] | null;
  /** Sounds to load before the first play. */
  preload?: readonly string[];
  /** A clave grid to show from the start (`null`: none until K). */
  clave?: ClaveSpec | null;
  /** Whether K cycles the clave grid here. */
  claveKey?: boolean;
  marks?: readonly TimelineMarkView[];
  barMarks?: ReadonlyMap<number, "ok" | "issue">;
  label?: string;
  /** Cycle 0 is a pickup bar: bars are numbered from the first full bar. */
  pickup?: boolean;
  /** Take focus once it is ready (a page whose source comes first), so Space plays at once. */
  autoFocus?: boolean;
}) {
  const root = useRef<HTMLElement>(null);
  const [load, setLoad] = useState<
    { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; t: TranscribeTransport }
  >({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [clave, setClave] = useState<ClaveSpec | null>(claveGiven);
  useEffect(() => setClave(claveGiven), [claveGiven?.type, claveGiven?.direction]);
  const preloadKey = preload.join(",");

  useEffect(() => {
    let live = true;
    let made: TranscribeTransport | null = null;
    setLoad({ kind: "loading" });
    (async () => {
      const oak = await getOak();
      await oak
        .preload({
          sounds: preloadKey
            .split(",")
            .filter(Boolean)
            .map((s) => ({ s })),
        })
        .catch(() => undefined);
      made = await createPatternTransport({
        player: oak.createPatternPlayer(),
        ref: stimulus,
        bars,
        cps,
        // As the Studio lints: the piece's `ref_…` parts are heard, never blocked.
        lint: { profile: "studio", unlocked: new Set(), allowPreview: true, meter, key: null },
      });
      if (!live) {
        made.dispose();
        return;
      }
      setLoad({ kind: "ready", t: made });
    })().catch((e: unknown) => {
      if (live) setLoad({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    });
    return () => {
      live = false;
      made?.dispose();
    };
  }, [stimulus.code, bars, cps, meter, preloadKey, attempt]);

  const transport = load.kind === "ready" ? load.t : null;
  const state = useTransportState(transport);
  useEffect(() => {
    if (autoFocus && transport && !root.current?.contains(document.activeElement))
      root.current?.focus({ preventScroll: true });
  }, [autoFocus, transport]);
  const barSec = state ? state.durationS / Math.max(1, bars) : 1;

  const act = (a: TranscribeAction) => {
    if (!transport || !state) return;
    switch (a) {
      case "play":
        void transport.toggle();
        return;
      case "loop":
        transport.setLoop(state.loop ? null : loopOfBars({ downbeatS: 0, barSec }, 0, Math.min(2, bars)));
        return;
      case "rateDown":
      case "rateUp":
        transport.setRate(stepRate(state.rate, a === "rateUp" ? 1 : -1));
        return;
      case "semiDown":
      case "semiUp":
        transport.setSemitones(stepSemitones(state.semitones, a === "semiUp" ? 1 : -1));
        return;
      case "prevBar":
      case "nextBar": {
        const from = state.loop ? Math.round(state.loop.startS / barSec) : 0;
        const to = Math.max(0, Math.min(bars - 1, from + (a === "nextBar" ? 1 : -1)));
        transport.setLoop(loopOfBars({ downbeatS: 0, barSec }, to, 1));
        return;
      }
      case "setA":
      case "setB":
        transport.setLoop(
          setLoopPoint(state.loop, a === "setA" ? "A" : "B", state.time, state.durationS, {
            downbeatS: 0,
            barSec,
          }),
        );
        return;
      case "clave":
        setClave((c) => nextClave(c));
        return;
      default:
        return;
    }
  };
  useHotkeys(
    transcribeBindings(act, (a) => transport !== null && USABLE.includes(a) && (a !== "clave" || claveKey)),
  );

  if (load.kind === "error")
    return (
      <Callout
        tone="attention"
        title="It didn't load"
        actions={
          <Button size="sm" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        }
      >
        {load.message}
      </Callout>
    );
  if (!transport || !state)
    return (
      <div className="flex flex-col gap-2" role="status" aria-busy="true" aria-label="Loading the source">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-[112px] w-full" />
      </div>
    );
  return (
    <section
      ref={root}
      aria-label={label}
      className="flex flex-col gap-2 rounded-control outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
      data-testid="pattern-source"
      // Focus here puts Transcribe's keys in reach (Space, L, K …) without a control taking them first.
      tabIndex={-1}
      {...keyScope("transcription")}
    >
      <TransportControls
        onPlay={() => act("play")}
        onSide={() => {}}
        state={state}
        grid={null}
        onRate={(d) => transport.setRate(stepRate(transport.state.rate, d))}
        onSemitones={(d) => transport.setSemitones(stepSemitones(transport.state.semitones, d))}
        onCents={() => {}}
        onToggleLoop={() => act("loop")}
        onSetPoint={(w) => act(w === "A" ? "setA" : "setB")}
      />
      <BarTimeline
        transport={transport}
        state={state}
        bars={bars}
        pickup={pickup}
        meter={meter}
        feel={feel}
        grouping={grouping}
        clave={clave}
        marks={marks}
        // A whole tune loops by L, Alt+←/→ and a drag; a row of 32 loop buttons would only be noise.
        barButtons={bars <= 16}
        {...(barMarks ? { barMarks } : {})}
      />
    </section>
  );
}
