// CF-A.S4's Master card (content/specs/CF.md "What master asks"): four listening steps, about five minutes, before
// the take. One step is open at a time. Step 2 is measured: @oak/audio's master meter reads the bus before and
// after the limiter while the piece plays, and the card says in dB and in words what the limiter did. Step 4 plays
// twenty seconds of one of the learner's own released tracks at the single's measured level (the reference is the
// side that is adjusted), so the two are compared at matched loudness. Steps 1, 3 and 4 are ticks the learner sets;
// they live here for the sitting and are stored nowhere. Nothing on this card gates the release.
import {
  createMasterMeter,
  createReferenceAb,
  type LoudnessMatch,
  levelText,
  type MasterMeter,
  type MasterReading,
  type MeterLive,
  type ReferenceAb,
  readingLines,
} from "@oak/audio/master-meter";
import { clsx } from "clsx";
import { Check, ChevronDown, Gauge, Headphones, Play, Repeat, Square } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { albumAudioUrl } from "../lib/queries.ts";
import { Button } from "../ui/kit/Button.tsx";
import { Select } from "../ui/kit/Field.tsx";
import { toast } from "../ui/kit/Toast.tsx";
import { useWorkbenchServices } from "../workbench/services.tsx";
import { RuleLabel } from "./Checklist.tsx";
import {
  defaultReference,
  loudestSection,
  MASTER_MEANING,
  MASTER_STEPS,
  type MasterStepId,
  matchWords,
  meterFill,
  type ReferenceChoice,
  referenceVerdict,
  type SectionEnergy,
} from "./master.ts";

/** Seconds one measurement runs when the learner does not stop it: a section of eight bars at a slow tempo. */
export const MEASURE_SECONDS = 20;

export interface MasterOutcome {
  reading: MasterReading | null;
  /** The title of the track the learner listened against, once they did. */
  reference: string | null;
}

export function MasterCard({
  sections,
  references,
  onBars,
  onOutcome,
}: {
  /** The piece's sections with their energy (the form view's): the loudest one is offered as the loop. */
  sections: readonly SectionEnergy[];
  /** The learner's released tracks that have a recording, this one excluded. */
  references: readonly ReferenceChoice[];
  /** 1-based inclusive bars: light and loop them in the Workbench. */
  onBars(from: number, to: number): void;
  /** What the liner notes may say about the master (the measured reading, the reference listened to). */
  onOutcome(o: MasterOutcome): void;
}) {
  const { oak } = useWorkbenchServices();
  const baseId = useId();
  const [step, setStep] = useState<MasterStepId>("levels");
  // Folded, the card is one line: the editor gets its room back while the learner works on the code.
  const [open, setOpen] = useState(true);
  const [ticks, setTicks] = useState<Readonly<Record<string, boolean>>>({});
  const loud = loudestSection(sections);

  // --- the limiter: measured --------------------------------------------------------------------------
  const meter = useRef<MasterMeter | null>(null);
  // False once the card has unmounted: a meter or reference stopped by leaving the page is not an error.
  const mounted = useRef(true);
  const [measuring, setMeasuring] = useState(false);
  const [live, setLive] = useState<MeterLive | null>(null);
  const [reading, setReading] = useState<MasterReading | null>(null);
  const outcome = useRef<MasterOutcome>({ reading: null, reference: null });
  const report = (patch: Partial<MasterOutcome>) => {
    outcome.current = { ...outcome.current, ...patch };
    onOutcome(outcome.current);
  };
  const measure = async () => {
    if (measuring) {
      meter.current?.stop();
      return;
    }
    try {
      await oak.unlock();
      meter.current ??= createMasterMeter(oak.ctx, { pre: oak.master.input, post: oak.master.analyser });
      const m = meter.current;
      setLive(null);
      setMeasuring(true);
      const off = m.subscribe(setLive);
      try {
        const r = await m.measure({ seconds: MEASURE_SECONDS });
        setReading(r);
        if (Number.isFinite(r.levelDb)) report({ reading: r });
      } finally {
        off();
        setMeasuring(false);
      }
    } catch (e) {
      if (!mounted.current) return;
      setMeasuring(false);
      toast.error("The meter didn't start", learnerDetail(e));
    }
  };

  // --- the reference listen ---------------------------------------------------------------------------
  const first = defaultReference(references);
  const [refId, setRefId] = useState<string | null>(first?.trackId ?? null);
  const chosen = references.find((r) => r.trackId === refId) ?? first;
  const ab = useRef<{ trackId: string; version: number; ab: ReferenceAb } | null>(null);
  const [refPlaying, setRefPlaying] = useState(false);
  const [refBusy, setRefBusy] = useState(false);
  const [match, setMatch] = useState<LoudnessMatch | null>(null);
  const stopReference = () => {
    ab.current?.ab.stop();
    setRefPlaying(false);
  };
  const hearReference = async () => {
    if (refPlaying) return stopReference();
    if (!chosen) return;
    setRefBusy(true);
    try {
      await oak.unlock();
      if (!ab.current || ab.current.trackId !== chosen.trackId || ab.current.version !== chosen.version) {
        ab.current?.ab.dispose();
        const res = await fetch(albumAudioUrl(chosen.trackId, chosen.version), {
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error("Its recording could not be read.");
        const buffer = await oak.ctx.decodeAudioData(await res.arrayBuffer());
        const next = createReferenceAb({ ctx: oak.ctx as never, output: oak.master.input });
        next.load(buffer);
        next.subscribe((s) => setRefPlaying(s.playing));
        ab.current = { trackId: chosen.trackId, version: chosen.version, ab: next };
      }
      const a = ab.current.ab;
      // Matched loudness needs the single's measured level; without it both play as they are.
      const m = reading && Number.isFinite(reading.levelDb) ? a.match(reading.levelDb) : null;
      setMatch(m);
      // One source at a time: the piece stops, the excerpt plays; the learner then plays their chorus.
      oak.stopAll();
      a.listen("reference");
      setRefPlaying(true);
      report({ reference: chosen.title });
    } catch (e) {
      if (!mounted.current) return;
      toast.error("The reference didn't play", learnerDetail(e));
    } finally {
      if (mounted.current) setRefBusy(false);
    }
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      meter.current?.dispose();
      meter.current = null;
      ab.current?.ab.dispose();
      ab.current = null;
    };
  }, []);

  const done = (id: MasterStepId): boolean =>
    id === "limiter" ? reading !== null && Number.isFinite(reading.levelDb) : ticks[id] === true;
  const doneCount = MASTER_STEPS.filter((s) => done(s.id)).length;
  const current = MASTER_STEPS.find((s) => s.id === step) ?? MASTER_STEPS[0];
  const loopLoudest = () => {
    if (loud) onBars(loud.startBar + 1, loud.startBar + loud.bars);
  };
  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const next =
      e.key === "ArrowRight"
        ? i + 1
        : e.key === "ArrowLeft"
          ? i - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? 3
              : null;
    if (next === null) return;
    e.preventDefault();
    const s = MASTER_STEPS[(next + MASTER_STEPS.length) % MASTER_STEPS.length];
    if (!s) return;
    setStep(s.id);
    document.getElementById(`${baseId}-tab-${s.id}`)?.focus();
  };
  if (!current) return null;

  return (
    <section
      aria-labelledby={`${baseId}-h`}
      className="rounded-card border border-border bg-surface"
      data-testid="master-card"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2">
        <h2 id={`${baseId}-h`} className="font-sans text-sm font-semibold">
          Master
        </h2>
        <p className="min-w-0 flex-1 text-sm text-text-2">
          {open ? MASTER_MEANING : "Four listening steps before the take."}
        </p>
        <span className="text-sm text-text-3 tabular-nums" data-testid="master-progress">
          {doneCount} of 4 · never required
        </span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${baseId}-body`}
          aria-label={open ? "Fold the Master card" : "Open the Master card"}
          onClick={() => setOpen((o) => !o)}
          className="self-center rounded-control p-0.5 text-text-2 hover:text-text"
          data-testid="master-fold"
        >
          <ChevronDown
            aria-hidden
            className={clsx("size-4 transition-transform reduced:transition-none", open && "rotate-180")}
          />
        </button>
      </div>
      <div id={`${baseId}-body`} hidden={!open}>
        <div role="tablist" aria-label="Mastering steps" className="flex gap-1 border-b border-border px-3">
          {MASTER_STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              id={`${baseId}-tab-${s.id}`}
              aria-selected={s.id === step}
              aria-controls={`${baseId}-panel`}
              tabIndex={s.id === step ? 0 : -1}
              data-step={s.id}
              data-done={done(s.id) ? "true" : "false"}
              onClick={() => setStep(s.id)}
              onKeyDown={(e) => onTabKey(e, i)}
              className={clsx(
                "-mb-px flex items-center gap-1.5 rounded-t-control border-b-2 px-2.5 py-1.5 text-sm",
                s.id === step
                  ? "border-accent font-medium text-text"
                  : "border-transparent text-text-2 hover:text-text",
              )}
            >
              <span className="font-mono text-text-3 tabular-nums">{i + 1}</span>
              {s.title}
              {done(s.id) && (
                <>
                  <Check aria-hidden className="size-3.5 text-accent" strokeWidth={2.5} />
                  <span className="sr-only"> (done)</span>
                </>
              )}
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id={`${baseId}-panel`}
          aria-labelledby={`${baseId}-tab-${current.id}`}
          className="flex flex-col gap-2 px-3 py-2.5 text-sm"
        >
          <p className="max-w-[92ch] leading-relaxed text-text-2">
            <RuleLabel label={current.text} />
          </p>

          {current.id === "limiter" && (
            <div className="flex flex-col gap-2" data-testid="master-meter">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={measuring ? "secondary" : "primary"}
                  icon={
                    measuring ? (
                      <Square aria-hidden className="size-4" />
                    ) : (
                      <Gauge aria-hidden className="size-4" />
                    )
                  }
                  onClick={() => void measure()}
                  data-testid="master-measure"
                >
                  {measuring ? "Stop measuring" : reading ? "Measure again" : "Measure while it plays"}
                </Button>
                {loud && (
                  <Button
                    size="sm"
                    icon={<Repeat aria-hidden className="size-4" />}
                    onClick={loopLoudest}
                    data-testid="master-loop-loudest"
                  >
                    Loop the loudest section ({loud.text.toLowerCase()})
                  </Button>
                )}
                <span className="text-text-3">
                  Play the song, then measure: up to {MEASURE_SECONDS} seconds.
                </span>
              </div>
              {measuring && (
                <div
                  className="grid max-w-[36rem] grid-cols-[9rem_1fr_5rem] items-center gap-x-2 gap-y-1"
                  aria-live="off"
                >
                  <span className="text-text-2">Before the limiter</span>
                  <MeterBar
                    fill={meterFill(live?.peakDb ?? Number.NEGATIVE_INFINITY)}
                    hot={(live?.peakDb ?? -99) > -3}
                  />
                  <span className="text-right font-mono tabular-nums">
                    {live ? levelText(live.peakDb) : "…"}
                  </span>
                  <span className="text-text-2">Limiter taking off</span>
                  <MeterBar
                    fill={Math.min(1, (live?.reductionDb ?? 0) / 12)}
                    hot={(live?.reductionDb ?? 0) > 1}
                  />
                  <span className="text-right font-mono tabular-nums">
                    {live ? `${live.reductionDb.toFixed(1)} dB` : "…"}
                  </span>
                </div>
              )}
              {reading && !measuring && (
                <div
                  role="status"
                  className="rounded-control bg-surface-2/60 px-2.5 py-1.5"
                  data-testid="master-reading"
                  data-limiter={reading.limiter.state}
                >
                  {readingLines(reading).map((l) => (
                    <p key={l}>
                      <RuleLabel label={l} />
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {current.id === "levels" && loud && (
            <div>
              <Button
                size="sm"
                icon={<Repeat aria-hidden className="size-4" />}
                onClick={loopLoudest}
                data-testid="master-loop-loudest"
              >
                Loop the loudest section ({loud.text.toLowerCase()}, bars {loud.startBar + 1}–
                {loud.startBar + loud.bars})
              </Button>
            </div>
          )}

          {current.id === "reference" &&
            (references.length === 0 ? (
              <p className="text-text-2" data-testid="master-no-reference">
                None of your released tracks has a recording yet, so there is nothing to compare with. Listen
                to your chorus once at a low volume instead: the tune and the snare should still be there.
              </p>
            ) : (
              <div className="flex flex-col gap-2" data-testid="master-reference">
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor={`${baseId}-ref`} className="text-text-2">
                    Against
                  </label>
                  <Select<string>
                    id={`${baseId}-ref`}
                    value={chosen?.trackId ?? ""}
                    options={references.map((r) => ({ value: r.trackId, label: r.title }))}
                    onChange={(v) => {
                      stopReference();
                      setMatch(null);
                      setRefId(v);
                    }}
                  />
                  <Button
                    size="sm"
                    variant={refPlaying ? "secondary" : "primary"}
                    loading={refBusy}
                    icon={
                      refPlaying ? (
                        <Square aria-hidden className="size-4" />
                      ) : (
                        <Headphones aria-hidden className="size-4" />
                      )
                    }
                    onClick={() => void hearReference()}
                    data-testid="master-hear-reference"
                  >
                    {refPlaying ? "Stop the reference" : "Hear 20 seconds of it"}
                  </Button>
                  {loud && (
                    <Button
                      size="sm"
                      icon={<Play aria-hidden className="size-4" />}
                      onClick={() => {
                        stopReference();
                        loopLoudest();
                      }}
                    >
                      Then your {loud.text.toLowerCase()}
                    </Button>
                  )}
                </div>
                <p className="text-text-2" role="status" data-testid="master-match">
                  {match && chosen
                    ? `${referenceVerdict(match, chosen.title)} ${matchWords(match)}`
                    : reading && Number.isFinite(reading.levelDb)
                      ? "The reference plays at the level your single measured."
                      : "Measure the single first (step 2) and the reference plays at its level; without a measurement both play as they are."}
                </p>
              </div>
            ))}

          {!current.measured && (
            <label className="flex w-fit cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-[var(--oak-accent)]"
                checked={ticks[current.id] === true}
                onChange={(e) => setTicks((t) => ({ ...t, [current.id]: e.target.checked }))}
                data-testid={`master-tick-${current.id}`}
              />
              <span>Done, by my ears</span>
            </label>
          )}
        </div>
      </div>
    </section>
  );
}

function MeterBar({ fill, hot }: { fill: number; hot: boolean }) {
  return (
    <span className="block h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
      <span
        className={clsx("block h-full rounded-full", hot ? "bg-accent-2" : "bg-accent")}
        style={{ width: `${Math.round(fill * 100)}%` }}
      />
    </span>
  );
}

/** A failure's detail as the learner may read it: a package's internal message (`@oak/…`) is never shown. */
export function learnerDetail(e: unknown): string | undefined {
  if (!(e instanceof Error) || e.message.trim() === "") return undefined;
  if (/@oak\//.test(e.message)) return "Play the piece once, then try again.";
  return e.message;
}
