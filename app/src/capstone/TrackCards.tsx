// The track capstones' cards above the Workbench (Wave 7; docs/design/wave7.md §4.4): the sound a session opens
// when it starts (horns at RC1.S2, choir at AC2.S1), JC3's AABA plan with its bridge, RC2's clave lens (the clave's
// two bars against the learner's line, the direction named), JC4's reharmonisation (the melody locked, every device
// with its bar), the voicings of AC2 (and JC4's voice-leading session), AC2's mix step (the level of each part as
// heard from the code, each part measured from its own offline render (@oak/audio's measureMix) and the master
// meter). Every number comes from the grader's views of the piece now in the
// editor; each card says nothing it cannot measure. Keyboard: every bar chip is a button that lights its bars.
import type { ToolEntry } from "@oak/api";
import {
  createMasterMeter,
  levelText,
  limiterWords,
  type MasterMeter,
  type MasterReading,
} from "@oak/audio/master-meter";
import { type MixReading, measureMix, type PartPcm } from "@oak/audio/mix-meter";
import { CLAVE_GRIDS, type KeySpec, R } from "@oak/content-kit";
import { claveView, levelsView, type Normalized, selectTrack } from "@oak/grader";
import type { BandSetup } from "@oak/strudel";
import { PieceRenderError, renderPiece } from "@oak/strudel/offline";
import { clsx } from "clsx";
import { Gauge, Lock, Sparkles, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/kit/Button.tsx";
import { PartLevels } from "../ui/kit/PartLevels.tsx";
import { toast } from "../ui/kit/Toast.tsx";
import { useWorkbenchServices } from "../workbench/services.tsx";
import { RuleLabel } from "./Checklist.tsx";
import { exportErrorText, pieceLength, renderableCode } from "./export.ts";
import { mixParts, partLabel } from "./tracks.ts";
import type { PieceForm } from "./wave5.ts";
import { barsWord, type FoundItem } from "./wave6.ts";

/** A card's frame: a heading, a body; folded to one line when the learner wants the room. */
function CardFrame({
  title,
  testId,
  children,
  aside,
}: {
  title: string;
  testId: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      data-testid={testId}
      className="flex flex-col gap-2 rounded-card border border-border bg-surface px-3 py-2.5 text-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-sans text-sm font-semibold text-text-2">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function BarButton({
  from,
  to,
  onBars,
}: {
  from: number;
  to: number;
  onBars?: ((a: number, b: number) => void) | undefined;
}) {
  const text = from === to ? `Bar ${from}` : `Bars ${from}–${to}`;
  const cls =
    "inline-flex h-5 shrink-0 items-center rounded-full border border-accent/40 bg-surface px-1.5 font-mono text-[0.75rem] text-text";
  return onBars ? (
    <button
      type="button"
      className={clsx(cls, "hover:border-accent hover:text-accent")}
      onClick={() => onBars(from, to)}
      aria-label={`${text}: show on the roll and the staff`}
      data-testid="track-card-bars"
    >
      {text}
    </button>
  ) : (
    <span className={cls}>{text}</span>
  );
}

// --- a sound granted when the session starts -------------------------------------------------------------------

export function SessionUnlockNote({
  tools,
  sessionTitle,
}: {
  tools: readonly ToolEntry[];
  sessionTitle: string;
}) {
  if (tools.length === 0) return null;
  return (
    <div
      className="flex items-start gap-3 rounded-card border border-accent/30 bg-lane-in p-3 text-sm"
      role="status"
      data-testid="session-unlocks"
    >
      <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
      <p>
        {sessionTitle} opened{" "}
        {tools.map((t, i) => (
          <span key={t.id}>
            {i > 0 && (i === tools.length - 1 ? " and " : ", ")}
            <code className="rounded bg-surface px-1 font-mono">{t.catalog.signature || t.code}</code>
          </span>
        ))}
        : {tools.length === 1 ? "it is" : "they are"} yours from this session on.
      </p>
    </div>
  );
}

// --- the lines a session opens with ------------------------------------------------------------------------------

/** "Session 2 adds `horns:`": the empty lines the session offers, added by the learner's own click. */
export function SessionLinesNote({
  lines,
  sessionTitle,
  onAdd,
}: {
  lines: readonly string[];
  sessionTitle: string;
  onAdd(): void;
}) {
  if (lines.length === 0) return null;
  const names = lines.map((l) => l.slice(0, l.indexOf(":")));
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-border bg-surface p-3 text-sm"
      data-testid="session-lines"
    >
      <p className="min-w-0 flex-1">
        {sessionTitle} adds{" "}
        {names.map((n, i) => (
          <span key={n}>
            {i > 0 && (i === names.length - 1 ? " and " : ", ")}
            <code className="rounded bg-surface-2 px-1 font-mono">{n}:</code>
          </span>
        ))}
        . {lines.length === 1 ? "An empty line plays" : "Empty lines play"} nothing until you write{" "}
        {lines.length === 1 ? "it" : "them"}.
      </p>
      <Button size="sm" variant="secondary" onClick={onAdd} data-testid="session-lines-add">
        {lines.length === 1 ? "Add the line" : "Add the lines"}
      </Button>
    </div>
  );
}

// --- JC3: the AABA plan -----------------------------------------------------------------------------------------

/** The plan's sections (8 bars each for a 32-bar AABA) and what the piece has in each. */
export function planBoxes(pattern: string, totalBars: number, form: PieceForm | null) {
  const len = Math.max(1, Math.round(totalBars / pattern.length));
  return pattern.split("").map((letter, i) => {
    const from = i * len + 1;
    const to = from + len - 1;
    const s = form?.sections.find((x) => x.startBar + 1 === from && x.bars === len) ?? null;
    return {
      letter,
      from,
      to,
      bridge: pattern === "AABA" && letter === "B",
      have: s,
      ok: s?.letter === letter,
    };
  });
}

export function FormPlanCard({
  pattern,
  totalBars,
  form,
  onBars,
  bridgeChords,
}: {
  pattern: string;
  totalBars: number;
  form: PieceForm | null;
  onBars?: (from: number, to: number) => void;
  bridgeChords: string | null;
}) {
  const boxes = planBoxes(pattern, totalBars, form);
  return (
    <CardFrame title={`The form: ${pattern.split("").join(" ")}, ${totalBars} bars`} testId="form-plan">
      <ol className="grid grid-cols-4 gap-2" aria-label="The plan, section by section">
        {boxes.map((b, i) => (
          <li
            key={`${b.letter}-${i}`}
            data-letter={b.letter}
            data-state={b.ok ? "ok" : b.have ? "other" : "missing"}
            className={clsx(
              "flex min-w-0 flex-col gap-1 rounded-control border px-2 py-1.5",
              b.ok ? "border-accent/50 bg-lane-in" : "border-dashed border-border",
            )}
          >
            <span className="flex items-baseline justify-between gap-1">
              <span className="font-display text-h3">{b.letter}</span>
              <BarButton from={b.from} to={b.to} onBars={onBars} />
            </span>
            <span className="text-text-2">
              {b.bridge ? "The bridge" : b.have ? b.have.text : "Not written yet"}
              {b.have && !b.ok ? ` (reads as ${b.have.letter})` : ""}
            </span>
          </li>
        ))}
      </ol>
      {bridgeChords && (
        <p className="text-text-2" data-testid="bridge-chords">
          The bridge plays {bridgeChords}.
        </p>
      )}
    </CardFrame>
  );
}

// --- RC2: the clave lens ----------------------------------------------------------------------------------------

/** One two-bar window of a track on the 8th grid (16 steps). */
export function windowSteps(n: Normalized, track: string, bar: number): number[] {
  const out = new Set<number>();
  for (const e of selectTrack(n, track as never)) {
    const b = R.floor(e.onset);
    if (b !== bar - 1 && b !== bar) continue;
    const s = R.toNum(R.frac(e.onset)) * 8;
    if (Math.abs(s - Math.round(s)) < 1e-6) out.add(Math.round(s) + (b === bar - 1 ? 0 : 8));
  }
  return [...out].sort((a, b) => a - b);
}

/** The clave's 16 steps for a type and direction (CLAVE_GRIDS: two bars of 8ths). */
export function claveSteps16(type: "son" | "rumba", direction: "3-2" | "2-3"): number[] {
  const [a, b] = CLAVE_GRIDS[type][direction];
  return [...a.map((x) => Math.round(R.toNum(x) * 8)), ...b.map((x) => Math.round(R.toNum(x) * 8) + 8)];
}

export function ClaveCard({
  n,
  bars,
  track,
  want,
  onBars,
}: {
  n: Normalized;
  bars: number;
  track: string;
  want: { type: "son" | "rumba"; direction: "3-2" | "2-3" };
  onBars?: (from: number, to: number) => void;
}) {
  const view = claveView(n, { meter: "4/4", bars, track: track as never });
  const grid = claveSteps16(want.type, want.direction);
  const first = view.windows[0];
  const mine = first ? windowSteps(n, track, first.bar) : [];
  const heard = view.first;
  const name = (c: { type: string; direction: string }) =>
    `${c.type === "son" ? "Son" : "Rumba"} clave ${c.direction}`;
  return (
    <CardFrame
      title="Clave"
      testId="clave-card"
      aside={
        <span className="text-text-3" data-testid="clave-heard">
          {heard ? (
            `Heard: ${name(heard)}, ${view.coveredBars} ${view.coveredBars === 1 ? "bar" : "bars"} from bar 1`
          ) : selectTrack(n, track as never).length > 0 ? (
            // A clave off its grid (an 8th late) or another figure: the part plays, its cells are below.
            "Heard: no son or rumba clave on the grid"
          ) : (
            <>
              Nothing on <code className="font-mono">{track}</code> yet
            </>
          )}
        </span>
      }
    >
      <div className="grid grid-cols-[7rem_1fr] items-center gap-x-2 gap-y-1">
        <span className="text-text-2">{name(want)}</span>
        <StepRow steps={grid} other={mine} label={`${name(want)}, bars 1–2`} tone="clave" />
        <span className="truncate text-text-2">
          Your <code className="font-mono">{track}</code>
        </span>
        <StepRow steps={mine} other={grid} label={`Your ${track}, bars 1–2`} tone="mine" />
      </div>
      <p className="text-text-3">
        Two bars of 8ths; the bar with three hits is the three-side. A filled cell where the clave has none is
        outside it.
      </p>
      {view.coveredBars > 0 && onBars && (
        <p className="flex flex-wrap items-center gap-1.5 text-text-2">
          Whole for <BarButton from={1} to={view.coveredBars} onBars={onBars} />
        </p>
      )}
    </CardFrame>
  );
}

function StepRow({
  steps,
  other,
  label,
  tone,
}: {
  steps: readonly number[];
  other: readonly number[];
  label: string;
  tone: "clave" | "mine";
}) {
  return (
    <ol
      className="grid grid-cols-16 gap-0.5"
      aria-label={label}
      style={{ gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }}
    >
      {Array.from({ length: 16 }, (_, i) => {
        const on = steps.includes(i);
        const off = on && tone === "mine" && !other.includes(i);
        return (
          <li
            key={i}
            data-step={i}
            data-on={on ? "true" : "false"}
            className={clsx(
              "h-4 rounded-[3px] border",
              i === 8 && "ml-1",
              on
                ? off
                  ? "border-accent-2 bg-accent-2/70"
                  : tone === "clave"
                    ? "border-text-2 bg-text-2"
                    : "border-accent bg-accent"
                : "border-border bg-bg",
            )}
          >
            <span className="sr-only">
              {on ? `step ${i + 1}: hit${off ? ", outside the clave" : ""}` : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// --- JC4: the reharmonisation ------------------------------------------------------------------------------------

export function ReharmCard({
  songTitle,
  rows,
  tally,
  touched,
  onBars,
}: {
  songTitle: string;
  rows: readonly { bar: number; device: string; text: string }[];
  tally: { text: string; ok: boolean };
  touched: boolean;
  onBars?: (from: number, to: number) => void;
}) {
  return (
    <CardFrame
      title={`Reharmonising ${songTitle}`}
      testId="reharm-card"
      aside={
        <span className="inline-flex items-center gap-1 text-text-3" data-testid="melody-locked">
          <Lock aria-hidden className="size-3.5" /> The melody line is locked
        </span>
      }
    >
      <p className={tally.ok ? "text-text" : "text-text-2"} data-testid="device-tally">
        {tally.text}
      </p>
      {rows.length > 0 && (
        <ul
          className="flex flex-col gap-1"
          aria-label="Devices, with their bars"
          data-testid="reharm-devices"
        >
          {rows.map((r) => (
            <li
              key={`${r.bar}-${r.device}`}
              data-device={r.device}
              className="flex flex-wrap items-center gap-1.5 text-text-2"
            >
              <BarButton from={r.bar} to={r.bar} onBars={onBars} />
              <span>{r.text}</span>
            </li>
          ))}
        </ul>
      )}
      {touched && (
        <p className="text-issue" role="alert" data-testid="melody-touched">
          The melody line no longer matches the song. The brief keeps the tune exactly as written: undo back
          to it.
        </p>
      )}
    </CardFrame>
  );
}

// --- voicings (AC2, JC4.S3) ------------------------------------------------------------------------------------

export function FoundCard({
  title,
  testId,
  items,
  onBars,
}: {
  title: string;
  testId: string;
  items: readonly FoundItem[];
  onBars?: (from: number, to: number) => void;
}) {
  if (items.length === 0) return null;
  return (
    <CardFrame title={title} testId={testId}>
      <ul className="flex flex-col gap-1">
        {items.map((it, i) => (
          <li
            key={`${i}:${it.text}`}
            className="flex flex-wrap items-center gap-1.5 text-text-2"
            data-ok={it.ok ? "true" : "false"}
          >
            {it.anchor && <BarButton from={it.anchor.from} to={it.anchor.to} onBars={onBars} />}
            <span>
              <RuleLabel label={it.text} />
            </span>
          </li>
        ))}
      </ul>
    </CardFrame>
  );
}

// --- AC2: the mix -----------------------------------------------------------------------------------------------

/**
 * Each part's level against the loudest, as heard (the 24 dB rule: a part further down is not heard). A part the
 * code writes that the grader leaves out (masked more than 24 dB down, or silent) is listed as not heard.
 */
export function mixRows(n: Normalized, bars: number, code = "") {
  const read = levelsView(n, { meter: "4/4", bars }).map((l) => ({
    ...l,
    relDb: Number.isFinite(l.relDb) ? l.relDb : -60,
  }));
  const seen = new Set(read.map((l) => l.track));
  const masked = mixParts(code, null)
    .filter((t) => !seen.has(t))
    .map((track) => ({ track, relDb: -60, heard: false }));
  return [...read, ...masked].sort((a, b) => b.relDb - a.relDb);
}

/** One silent frame block: a solo that renders nothing reads as silent, not as a failed measurement. */
const SILENT_PCM: PartPcm = { left: new Float32Array(2048), sampleRate: 48_000 };

export function MixCard({
  n,
  bars,
  code,
  band,
  songKey,
}: {
  n: Normalized;
  bars: number;
  /** The piece as it is in the editor, measured part by part from offline renders. */
  code: string;
  /** The Band playing with it, as the Workbench plays it. */
  band: BandSetup | null;
  songKey: KeySpec | null;
}) {
  const { oak } = useWorkbenchServices();
  const rows = mixRows(n, bars, code);
  const meter = useRef<MasterMeter | null>(null);
  const mounted = useRef(true);
  const [measuring, setMeasuring] = useState(false);
  const [reading, setReading] = useState<MasterReading | null>(null);
  // The parts measured from renders (each part alone, then the whole): the level that reaches the ears.
  const partsAbort = useRef<AbortController | null>(null);
  const [parts, setParts] = useState<
    | { kind: "idle" }
    | { kind: "working"; progress: number }
    | { kind: "done"; code: string; reading: MixReading }
    | { kind: "failed"; text: string }
  >({ kind: "idle" });
  // Set on every mount: React's development double mount runs the cleanup once before the real mount.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      meter.current?.stop();
      partsAbort.current?.abort();
    };
  }, []);
  const measure = async () => {
    if (measuring) {
      meter.current?.stop();
      return;
    }
    try {
      await oak.unlock();
      meter.current ??= createMasterMeter(oak.ctx, { pre: oak.master.input, post: oak.master.analyser });
      setMeasuring(true);
      try {
        const r = await meter.current.measure({ seconds: 12 });
        if (mounted.current) setReading(r);
      } finally {
        if (mounted.current) setMeasuring(false);
      }
    } catch (e) {
      if (!mounted.current) return;
      setMeasuring(false);
      toast.error(
        "The meter didn't start",
        e instanceof Error ? e.message.replace(/@oak\/\S+/g, "") : undefined,
      );
    }
  };
  const measureParts = async () => {
    if (parts.kind === "working") {
      partsAbort.current?.abort();
      return;
    }
    const ctrl = new AbortController();
    partsAbort.current = ctrl;
    const src = code;
    setParts({ kind: "working", progress: 0 });
    try {
      // The grader host is loaded on demand: this module's readers stay importable without a worker.
      const { analyzeCode } = await import("../lib/grader-client.ts");
      const renderable = renderableCode(src, await pieceLength(src, analyzeCode));
      const list = mixParts(src, band);
      // One render for the mix, then one per part: the bar moves within each render, not only between them.
      let rendered = 0;
      const total = list.length + 1;
      const show = (p: number) => {
        if (mounted.current && !ctrl.signal.aborted) setParts({ kind: "working", progress: p });
      };
      const reading = await measureMix(
        async (solo, signal) => {
          try {
            const piece = await renderPiece({
              code: renderable,
              band,
              key: songKey,
              mutes: { muted: new Set(), solo },
              onProgress: (p) => show((rendered + p) / total),
              ...(signal ? { signal } : {}),
            });
            rendered++;
            return { left: piece.left, right: piece.right, sampleRate: piece.sampleRate };
          } catch (e) {
            if (solo !== null && e instanceof PieceRenderError && e.code === "silent") {
              rendered++;
              return SILENT_PCM;
            }
            throw e;
          }
        },
        list,
        { signal: ctrl.signal, onProgress: show },
      );
      if (mounted.current) setParts({ kind: "done", code: src, reading });
    } catch (e) {
      if (!mounted.current) return;
      const aborted =
        ctrl.signal.aborted ||
        (e instanceof DOMException && e.name === "AbortError") ||
        (e instanceof PieceRenderError && e.code === "aborted");
      setParts(
        aborted
          ? { kind: "idle" }
          : { kind: "failed", text: exportErrorText(e).replace(" Nothing was saved.", "") },
      );
    } finally {
      if (partsAbort.current === ctrl) partsAbort.current = null;
    }
  };
  const stale = parts.kind === "done" && parts.code !== code;
  return (
    <CardFrame
      title="The mix"
      testId="mix-card"
      aside={
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            icon={
              parts.kind === "working" ? (
                <Square aria-hidden className="size-3.5" />
              ) : (
                <Gauge aria-hidden className="size-3.5" />
              )
            }
            onClick={() => void measureParts()}
            data-testid="mix-measure-parts"
          >
            {parts.kind === "working" ? "Stop" : "Measure each part"}
          </Button>
          <Button
            size="sm"
            icon={
              measuring ? (
                <Square aria-hidden className="size-3.5" />
              ) : (
                <Gauge aria-hidden className="size-3.5" />
              )
            }
            onClick={() => void measure()}
            data-testid="mix-measure"
          >
            {measuring ? "Stop measuring" : "Measure while it plays"}
          </Button>
        </div>
      }
    >
      {parts.kind === "done" && !stale ? (
        <>
          <PartLevels
            label="Each part, rendered on its own"
            parts={parts.reading.parts.map((p) => ({
              id: p.part,
              label: partLabel(p.part),
              db: Number.isFinite(p.level.playingDb) ? p.level.playingDb : null,
            }))}
            data-testid="mix-parts"
          />
          <p className="text-text-3">
            Each part was rendered alone and measured while it plays (dBFS); the whole mix averages{" "}
            {levelText(parts.reading.mix.level.playingDb)}.
          </p>
        </>
      ) : (
        <>
          <ul
            className="flex flex-col gap-1"
            aria-label="Each part against the loudest"
            data-testid="mix-levels"
          >
            {rows.map((r) => (
              <li
                key={r.track}
                data-track={r.track}
                data-heard={r.heard ? "true" : "false"}
                className="grid grid-cols-[6rem_1fr_6.5rem] items-center gap-2"
              >
                <code className="truncate font-mono text-text">{r.track}</code>
                <span className="h-2 rounded-full bg-surface-2" aria-hidden>
                  <span
                    className={clsx("block h-2 rounded-full", r.heard ? "bg-accent" : "bg-accent-2/60")}
                    style={{ width: `${Math.max(3, 100 + (r.relDb / 36) * 100)}%` }}
                  />
                </span>
                <span className="text-right text-text-2 tabular-nums">
                  {r.relDb === 0 ? "the loudest" : r.heard ? `${levelText(r.relDb)}` : "not heard"}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-text-3">
            {stale ? "The code changed since the parts were measured. " : ""}Levels are read from the code
            (gain and velocity) against the loudest part; more than 24 dB under it is not heard. Measure each
            part for the level that reaches your ears, or measure the master while it plays.
          </p>
        </>
      )}
      {parts.kind === "working" && (
        <p className="text-text-3 tabular-nums" role="status" data-testid="mix-parts-progress">
          Rendering each part, {Math.round(parts.progress * 100)}%
        </p>
      )}
      {parts.kind === "failed" && (
        <p className="text-issue" role="alert" data-testid="mix-parts-error">
          {parts.text}
        </p>
      )}
      {reading && (
        <p className="text-text-2 tabular-nums" data-testid="mix-reading">
          Measured {Math.round(reading.seconds)} s: average {levelText(reading.levelDb)}, loudest moment{" "}
          {levelText(reading.outPeakDb)}. {limiterWords(reading)}
        </p>
      )}
    </CardFrame>
  );
}

/** "bars 17–24" in a sentence. */
export const barsPhrase = (from: number, to: number) => barsWord(from, to);
