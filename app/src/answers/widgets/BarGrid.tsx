// The bar grid (wave5.md §11, `bar-grid`; U11.L05–L06, U11.CP, C5, X2): a chord chart of boxes, `perRow` to a line
// (a twelve-bar blues is three rows of four), one numeral or chord symbol per bar from a small palette. Digits put
// the chord on that degree in the box and move on (the key's own quality when the palette allows it, so in a blues
// palette `["7"]` 1 4 5 give I7 IV7 V7), `-` first a flat degree, `Q` changes the quality of the box, `←`/`→`/`↑`/`↓`
// walk the chart, `Backspace` clears, `P` plays the chart as it stands (each bar lights as it sounds), `Enter`
// checks. Every chord sounds as it is placed when the step's key is known (`AnswerEnv.harmony.key`). Given bars are
// printed filled and locked (the host fills them with `barGridStart`). With the chord-symbol lens on, a numeral
// box also shows its chord in the key ("IV7 · F7").
import type { ChordQuality } from "@oak/api";
import { clsx } from "clsx";
import { Lock, Play, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, SegmentedControl } from "../../ui/kit/index.ts";
import {
  barGridPalette,
  barRows,
  chartHits,
  clearEntry,
  cycleEntryQuality,
  entryFor,
  entryMidis,
  entryParts,
  entryText,
  type PaletteButton,
  placeEntry,
} from "../bar-grid.ts";
import { appAudio, useAnswerEnv } from "../env.tsx";
import { rnSymbol } from "../harmony.ts";
import { qualityLabel } from "../keys.ts";
import { spokenChord } from "../normalize.ts";
import type { AnswerWidgetProps } from "../types.ts";
import {
  AnswerFrame,
  digitOf,
  focusFirst,
  KeyHint,
  MarkBadge,
  markOf,
  markRing,
  revealedOf,
  SubmitHint,
} from "../ui.tsx";
import { RnGlyph, rnSpoken } from "./Harmony.tsx";

export function BarGridAnswer(p: AnswerWidgetProps<"bar-grid">) {
  const { spec, value, onChange, disabled, feedback } = p;
  const env = useAnswerEnv();
  const audio = env.audio ?? appAudio;
  const h = env.harmony;
  const key = h?.key ?? null;
  const root = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const n = spec.bars;
  const kind = spec.entry;
  const given = new Set((spec.given ?? []).map((b) => b - 1));
  const slots = Array.from({ length: n }, (_, k) => value[k] ?? "");
  const firstOpen = slots.findIndex((x, k) => x === "" && !given.has(k));
  const [sel, setSel] = useState<number>(Math.max(firstOpen, 0));
  const [flat, setFlat] = useState(false);
  const [quality, setQuality] = useState<ChordQuality | "auto">("auto");
  const [playing, setPlaying] = useState<number | null>(null);
  const at = Math.min(sel, n - 1);
  const correct = revealedOf<string[]>(feedback);
  const rows = barRows(n, spec.perRow);
  const palette = barGridPalette(spec, key);
  const symbols = kind === "rn" && key !== null && env.lenses?.chordSymbols !== false;
  const canPlay = kind === "symbol" || key !== null;
  const playBar = env.slots?.play;
  const sound = h?.sound ?? "piano";

  useEffect(() => {
    if (p.autoFocus) focusFirst(root.current);
  }, [p.autoFocus]);
  useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
    },
    [],
  );
  useEffect(() => {
    const active = document.activeElement as HTMLElement | null;
    if (!active?.closest("[data-bar-grid]") || !root.current?.contains(active)) return;
    root.current.querySelector<HTMLButtonElement>(`[data-bar="${at}"]`)?.focus();
  }, [at]);

  const sounds = (entry: string) => {
    if (!canPlay) return;
    const m = entryMidis(kind, entry, key);
    if (m) audio.playNote(m, { sound, dur: 0.9 });
  };
  const stop = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    setPlaying(null);
  };
  const playAll = () => {
    if (!canPlay) return;
    stop();
    const bpm = h?.bpm ?? 100;
    const beats = h?.beatsPerBar ?? 4;
    const barSec = beats * (60 / bpm);
    const hits = chartHits(slots, kind, key, { bpm, beatsPerBar: beats });
    const last = slots.reduce((m, x, i) => (x !== "" ? i : m), -1);
    for (let b = 0; b <= last; b++)
      timers.current.push(window.setTimeout(() => setPlaying(b), b * barSec * 1000));
    for (const hit of hits)
      timers.current.push(
        window.setTimeout(() => audio.playNote(hit.midis, { sound, dur: hit.dur }), hit.at * 1000),
      );
    timers.current.push(window.setTimeout(() => setPlaying(null), (last + 1) * barSec * 1000));
  };

  const put = (b: PaletteButton) => {
    if (disabled) return;
    const q = quality === "auto" ? null : quality;
    const entry = q ? entryFor(kind, b.degree, b.alt, q, key) : b.entry;
    const r = placeEntry(slots, spec, entry, at);
    onChange(r.value);
    sounds(entry);
    if (r.next !== null) setSel(r.next);
    setFlat(false);
  };
  const focusBar = (i: number) => {
    setSel(i);
    root.current?.querySelector<HTMLButtonElement>(`[data-bar="${i}"]`)?.focus();
  };

  const onKey = (e: React.KeyboardEvent<HTMLElement>): boolean => {
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    if (e.key === "-") {
      setFlat(true);
      return true;
    }
    const d = digitOf(e);
    if (d !== null) {
      const want = flat ? `-${d}` : String(d);
      setFlat(false);
      const b = palette.find((x) => x.key === want);
      if (b) put(b);
      return d >= 1 && d <= 7;
    }
    if ((e.key === "q" || e.key === "Q") && spec.qualities.length > 1) {
      const cur = slots[at] ?? "";
      if (!disabled && cur && !given.has(at)) {
        const next = [...slots];
        next[at] = cycleEntryQuality(kind, cur, spec.qualities, key);
        onChange(next);
        sounds(next[at] as string);
      }
      return true;
    }
    if (e.key === "p" || e.key === "P") {
      if (playing !== null) stop();
      else playAll();
      return true;
    }
    if (e.key === "h" || e.key === "H") {
      if (playBar) playBar(at);
      return Boolean(playBar);
    }
    const inGrid = (e.target as HTMLElement).closest("[data-bar-grid]");
    const step =
      e.key === "ArrowLeft"
        ? -1
        : e.key === "ArrowRight"
          ? 1
          : e.key === "ArrowUp" && inGrid
            ? -spec.perRow
            : e.key === "ArrowDown" && inGrid
              ? spec.perRow
              : 0;
    if (step !== 0) {
      const next = Math.max(0, Math.min(n - 1, at + step));
      if (inGrid) focusBar(next);
      else setSel(next);
      return true;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      if (disabled) return true;
      const r = clearEntry(slots, spec, at);
      onChange(r.value);
      if (r.at !== null) setSel(r.at);
      return true;
    }
    return false;
  };

  const spoken = (entry: string) =>
    entry === "" ? "empty" : kind === "rn" ? rnSpoken(entry) : spokenChord(entryText(kind, entry));
  const filled = slots.filter((x) => x !== "").length;
  const qualityOptions = [
    { value: "auto" as const, label: "Key's own" },
    ...spec.qualities.map((q) => ({ value: q, label: qualityLabel(q).short })),
  ];

  return (
    <AnswerFrame
      kind="bar-grid"
      idBase={p.idBase}
      label={p.label}
      feedback={feedback}
      disabled={disabled}
      onSubmit={p.onSubmit}
      onKey={onKey}
      keys={
        <>
          <KeyHint keys={["1–7"]}>chord on that degree</KeyHint>
          {palette.some((b) => b.alt < 0) ? <KeyHint keys={["- then digit"]}>♭ degree</KeyHint> : null}
          {spec.qualities.length > 1 ? <KeyHint keys={["Q"]}>quality</KeyHint> : null}
          <KeyHint keys={["←", "→", "↑", "↓"]}>bar</KeyHint>
          <KeyHint keys={["⌫"]}>clear</KeyHint>
          {canPlay ? <KeyHint keys={["P"]}>play the chart</KeyHint> : null}
          {playBar ? <KeyHint keys={["H"]}>hear the bar</KeyHint> : null}
          <SubmitHint />
        </>
      }
    >
      <div ref={root} className="flex min-w-0 flex-col gap-3">
        {/* biome-ignore lint/a11y/useSemanticElements: a chart of bar buttons with roving focus; a fieldset would add a legend we do not show */}
        <div
          data-bar-grid
          role="group"
          aria-label={`Chord chart, ${n} bars, ${filled} filled`}
          className="flex w-full min-w-0 flex-col gap-1.5"
        >
          {rows.map((row) => (
            <div
              key={row[0]}
              className="grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${spec.perRow}, minmax(0, 1fr))` }}
            >
              {row.map((bar) => {
                const i = bar - 1;
                const entry = slots[i] ?? "";
                const isGiven = given.has(i);
                const mark = isGiven ? null : markOf(feedback, i);
                const selected = !disabled && i === at;
                const want = correct?.[i] ?? null;
                const sym = symbols && entry && key ? rnSymbol(entry, key) : null;
                const lit = playing === i;
                return (
                  <div key={bar} className="min-w-0">
                    <button
                      type="button"
                      data-bar={i}
                      data-given={isGiven || undefined}
                      data-playing={lit || undefined}
                      aria-pressed={selected}
                      aria-disabled={disabled || isGiven || undefined}
                      aria-label={`Bar ${bar}: ${isGiven ? `given, ${entry ? spoken(entry) : "already filled"}` : spoken(entry)}${sym ? `, ${sym}` : ""}${mark ? (mark.ok ? ", right" : ", not this one") : ""}`}
                      tabIndex={i === at ? 0 : -1}
                      onFocus={() => setSel(i)}
                      onClick={() => setSel(i)}
                      className={clsx(
                        "relative flex h-16 w-full min-w-0 flex-col items-start justify-between rounded-control border-2 px-2 py-1 text-left",
                        isGiven
                          ? "border-border bg-surface-2"
                          : entry
                            ? "border-border bg-surface"
                            : "border-dashed border-border",
                        selected && "border-text-3 bg-surface-2",
                        lit && "bg-lane-in",
                        markRing(mark ? (mark.ok ? "ok" : "bad") : null),
                      )}
                    >
                      <span className="flex w-full items-center justify-between gap-1 text-[0.7rem] text-text-3 tabular-nums">
                        <span aria-hidden>{bar}</span>
                        {isGiven ? (
                          <Lock aria-hidden className="size-3" />
                        ) : correct ? (
                          // The answer sits inside the box, so a reveal never moves the chart.
                          <span
                            data-answer-chip
                            className={clsx(
                              "inline-flex min-w-0 items-center truncate rounded border border-dashed border-accent-2 px-1 text-[0.75rem] font-semibold text-text",
                              mark && "mr-2.5",
                            )}
                          >
                            <span className="sr-only">Answer: {want ? spoken(want) : "none"}</span>
                            <span aria-hidden className="truncate">
                              {want ? kind === "rn" ? <RnGlyph rn={want} /> : entryText(kind, want) : "—"}
                            </span>
                          </span>
                        ) : null}
                      </span>
                      <span aria-hidden className="flex w-full min-w-0 items-baseline gap-1.5">
                        {entry ? (
                          kind === "rn" ? (
                            <span className="text-lg font-semibold">
                              <RnGlyph rn={entry} />
                            </span>
                          ) : (
                            <span className="truncate text-lg font-semibold">{entryText(kind, entry)}</span>
                          )
                        ) : isGiven ? (
                          <span className="text-sm text-text-3">given</span>
                        ) : (
                          <span className="font-mono text-text-3 tracking-[0.3em]">
                            {"/".repeat(h?.beatsPerBar ?? 4)}
                          </span>
                        )}
                        {sym ? <span className="truncate text-[0.75rem] text-text-2">· {sym}</span> : null}
                      </span>
                      <MarkBadge mark={mark ? (mark.ok ? "ok" : "bad") : null} note={mark?.note} />
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canPlay ? (
            <Button
              size="sm"
              variant="ghost"
              data-enter="native"
              icon={
                playing !== null ? (
                  <Square aria-hidden className="size-4" />
                ) : (
                  <Play aria-hidden className="size-4" />
                )
              }
              disabled={filled === 0}
              onClick={() => (playing !== null ? stop() : playAll())}
            >
              {playing !== null ? "Stop" : "Play the chart"}
            </Button>
          ) : (
            <span className="text-sm text-text-3">Playback needs the step's key.</span>
          )}
          {playBar ? (
            <Button
              size="sm"
              variant="ghost"
              data-enter="native"
              icon={<Play aria-hidden className="size-4" />}
              onClick={() => playBar(at)}
            >
              Hear bar {at + 1}
            </Button>
          ) : null}
          {spec.qualities.length > 1 ? (
            <SegmentedControl
              label="Quality of the next chord"
              size="sm"
              value={quality}
              options={qualityOptions}
              onChange={(v) => setQuality(v)}
            />
          ) : null}
        </div>
        {/* biome-ignore lint/a11y/useSemanticElements: a row of buttons that fill the selected bar; a fieldset would add a legend we do not show */}
        <div role="group" aria-label={`Chords for bar ${at + 1}`} className="flex flex-wrap gap-1.5">
          {palette.map((b) => {
            const entry = quality === "auto" ? b.entry : entryFor(kind, b.degree, b.alt, quality, key);
            const sym = symbols && key ? rnSymbol(entry, key) : null;
            const parts = entryParts(kind, entry, key);
            const on = (slots[at] ?? "") === entry;
            return (
              <button
                key={b.key}
                type="button"
                data-chord={entry}
                aria-pressed={on}
                aria-disabled={disabled || given.has(at) || undefined}
                aria-label={`${b.key}. ${spoken(entry)}${sym ? `, ${sym}` : ""}`}
                onClick={() => put(b)}
                className={clsx(
                  "inline-flex h-10 min-w-16 items-center justify-between gap-2 rounded-control border px-2 font-medium hover:bg-surface-2",
                  on ? "border-accent bg-lane-in" : "border-border bg-surface",
                  b.alt < 0 && "border-dashed",
                )}
              >
                <span className="inline-flex items-baseline gap-1.5">
                  {kind === "rn" ? <RnGlyph rn={entry} /> : <span aria-hidden>{entryText(kind, entry)}</span>}
                  {sym ? (
                    <span aria-hidden className="text-[0.75rem] font-normal text-text-2">
                      · {sym}
                    </span>
                  ) : null}
                </span>
                <span
                  aria-hidden
                  className="font-sans text-[0.7rem] text-text-3"
                  title={parts ? qualityLabel(parts.quality).long : undefined}
                >
                  {b.key}
                </span>
              </button>
            );
          })}
        </div>
        <p className="sr-only" aria-live="polite">
          {flat ? "flat — now a digit" : ""}
        </p>
      </div>
    </AnswerFrame>
  );
}
