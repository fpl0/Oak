// Chord answers: the quality pad (`quality-pad`) and the Roman numeral palette (`rn-palette`, ux §4.5 RomanPad):
// three columns T | PD | D in the function colours, applied and borrowed rows when the step allows them. RN keys:
// `1`–`7` the diatonic triad, `Shift+digit` the seventh, `-` then a digit a flat-degree chord (`-7` → ♭VII),
// `M` swaps the case of the current slot, `I` steps its inversion figure (when the step allows inversions),
// `Backspace` clears, `←`/`→` choose a slot, `P` plays the progression. Wave 4: one slot per bar or per half bar
// (`AnswerEnv.harmony.slotsPerBar`); with the step's key every numeral sounds as it is placed and each button
// shows its chord in the key ("IV · F", only with the chord-symbol lens on); figures print as figured bass.
import type { ChordQuality } from "@oak/api";
import { clsx } from "clsx";
import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, SegmentedControl } from "../../ui/kit/index.ts";
import { functionStyle, type HarmonicFn } from "../../ui/theme/palette.ts";
import { appAudio, useAnswerEnv } from "../env.tsx";
import { progressionHits, rnHasDegree, rnMidis, rnSymbol, slotLabels } from "../harmony.ts";
import {
  cycleInversion,
  qualityLabel,
  type RnAllow,
  type RnButton,
  rnDisplay,
  rnForKey,
  rnGlyph,
  rnPalette,
  toggleCase,
  withInversion,
} from "../keys.ts";
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
  useThemeName,
} from "../ui.tsx";

export function QualityPadAnswer(p: AnswerWidgetProps<"quality-pad">) {
  const { spec, value, onChange, disabled, feedback } = p;
  const root = useRef<HTMLDivElement>(null);
  const correct = revealedOf<ChordQuality[]>(feedback)?.[0] ?? null;
  useEffect(() => {
    if (p.autoFocus) focusFirst(root.current);
  }, [p.autoFocus]);
  const pick = (q: ChordQuality) => {
    if (!disabled) onChange([q]);
  };
  const onKey = (e: React.KeyboardEvent<HTMLElement>): boolean => {
    const n = digitOf(e);
    if (n !== null && n >= 1 && n <= spec.set.length) {
      pick(spec.set[n - 1] as ChordQuality);
      root.current?.querySelectorAll<HTMLButtonElement>("[data-quality]")[n - 1]?.focus();
      return true;
    }
    const dir =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!dir) return false;
    const list = [...(root.current?.querySelectorAll<HTMLButtonElement>("[data-quality]") ?? [])];
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return false;
    const next = (at + dir + list.length) % list.length;
    list[next]?.focus();
    pick(spec.set[next] as ChordQuality);
    return true;
  };
  const mark = markOf(feedback, 0);
  return (
    <AnswerFrame
      kind="quality-pad"
      idBase={p.idBase}
      label={p.label}
      feedback={feedback}
      disabled={disabled}
      onSubmit={p.onSubmit}
      onKey={onKey}
      keys={
        <>
          <KeyHint keys={[`1–${spec.set.length}`]}>pick</KeyHint>
          <SubmitHint />
        </>
      }
    >
      <div ref={root} role="radiogroup" aria-label={p.label} className="flex flex-wrap gap-2">
        {spec.set.map((q, i) => {
          const on = value[0] === q;
          const l = qualityLabel(q);
          const isAnswer = correct === q;
          return (
            // biome-ignore lint/a11y/useSemanticElements: a styled custom control with roving focus (ux §7.9); native radios and fieldsets cannot take this layout
            <button
              key={q}
              type="button"
              role="radio"
              data-quality={q}
              aria-checked={on}
              aria-disabled={disabled || undefined}
              aria-label={`${i + 1}. ${l.long}${isAnswer ? " (the answer)" : ""}`}
              tabIndex={(value[0] ?? spec.set[0]) === q ? 0 : -1}
              onClick={() => pick(q)}
              className={clsx(
                "relative flex min-h-12 min-w-24 flex-col items-start justify-center rounded-control border-2 px-3 py-1.5 text-left",
                on ? "border-accent bg-lane-in" : "border-border bg-surface hover:border-text-3",
                on && mark ? markRing(mark.ok ? "ok" : "bad") : "",
                isAnswer && !on && "border-dashed border-accent-2",
              )}
            >
              <span className="flex items-center gap-2">
                <span aria-hidden className="text-[0.75rem] text-text-3 tabular-nums">
                  {i + 1}
                </span>
                <span className="font-semibold">{l.short}</span>
              </span>
              <span className="text-sm text-text-2">{l.long}</span>
              {on && mark ? <MarkBadge mark={mark.ok ? "ok" : "bad"} note={mark.note} /> : null}
            </button>
          );
        })}
      </div>
    </AnswerFrame>
  );
}

const INVERSIONS = [
  { value: "0", label: "Root" },
  { value: "1", label: "6 · 1st" },
  { value: "2", label: "6/4 · 2nd" },
  { value: "3", label: "4/2 · 3rd" },
] as const;

function roleFn(role: RnButton["role"]): HarmonicFn | null {
  return role === "chromatic" ? null : role;
}

/** A numeral as printed: case and quality mark, figures as figured bass (6 over 4), the applied part after. */
export function RnGlyph({ rn }: { rn: string }) {
  const g = rnGlyph(rn);
  if (!g) return <span>{rnDisplay(rn)}</span>;
  return (
    <span className="inline-flex items-center leading-none" aria-hidden>
      <span>
        {g.acc}
        {g.numeral}
      </span>
      {g.mark === "maj" ? (
        <span className="text-[0.7em]">maj</span>
      ) : g.mark ? (
        <span className="-translate-y-[0.35em] text-[0.75em]">{g.mark}</span>
      ) : null}
      {g.figures.length === 1 ? (
        <span className="-translate-y-[0.4em] text-[0.62em]">{g.figures[0]}</span>
      ) : g.figures.length === 2 ? (
        <span className="ml-px inline-flex flex-col text-[0.56em] leading-[1.05]">
          <span>{g.figures[0]}</span>
          <span>{g.figures[1]}</span>
        </span>
      ) : null}
      {g.of ? <span>{g.of}</span> : null}
    </span>
  );
}

/** "V six-five", "vii diminished": what a screen reader hears for a numeral. */
function rnSpoken(rn: string): string {
  const g = rnGlyph(rn);
  if (!g) return rnDisplay(rn);
  const mark =
    g.mark === "°"
      ? " diminished"
      : g.mark === "ø"
        ? " half-diminished"
        : g.mark === "+"
          ? " augmented"
          : g.mark === "maj"
            ? " major 7"
            : "";
  const acc = g.acc === "♭" ? "flat " : g.acc === "♯" ? "sharp " : "";
  const fig = g.figures.length ? ` ${g.figures.join("-")}` : "";
  return `${acc}${g.numeral}${mark}${fig}${g.of ? ` of ${g.of.slice(1)}` : ""}`;
}

/** "Bar 3" → "bar 3" inside a sentence; an authored label stays as written. */
const slotPhrase = (spoken: string | undefined) =>
  spoken ? (/^Bar \d/.test(spoken) ? `b${spoken.slice(1)}` : spoken) : "this slot";

export function RnPaletteAnswer(p: AnswerWidgetProps<"rn-palette">) {
  const { spec, value, onChange, disabled, feedback } = p;
  const theme = useThemeName();
  const env = useAnswerEnv();
  const audio = env.audio ?? appAudio;
  const h = env.harmony;
  const key = h?.key;
  const symbols = key !== undefined && env.lenses?.chordSymbols !== false;
  const root = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const allow = spec.allow as readonly RnAllow[];
  const groups = rnPalette(allow);
  const [flat, setFlat] = useState(false);
  const [slot, setSlot] = useState<number | null>(null);
  const [inversion, setInversion] = useState<"0" | "1" | "2" | "3">("0");
  const correct = revealedOf<string[]>(feedback);
  const slots = Array.from({ length: spec.slots }, (_, k) => value[k] ?? "");
  const filled = slots.filter((x) => x !== "").length;
  const labels = slotLabels(spec.slots, {
    ...(h?.slotsPerBar ? { slotsPerBar: h.slotsPerBar } : {}),
    ...(h?.beatsPerBar ? { beatsPerBar: h.beatsPerBar } : {}),
  });
  const half = (h?.slotsPerBar ?? 1) === 2;
  const canPlay = Boolean(h?.playProgression) || key !== undefined;
  /** The slot the next numeral goes into: the chosen one, else the first empty one. */
  const target = slot ?? (slots.indexOf("") < 0 ? null : slots.indexOf(""));
  /** The bass under the target slot, from a staged dictation's bass stage (ux §4.5), when there is one. */
  const bassHere = target !== null && !disabled ? (h?.bassDegrees?.[target] ?? null) : null;
  const offBass = (rn: string) => bassHere !== null && bassHere !== "" && !rnHasDegree(rn, bassHere, key);

  useEffect(() => {
    if (p.autoFocus) focusFirst(root.current);
  }, [p.autoFocus]);
  useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
    },
    [],
  );
  // Focus follows the slot the next numeral goes into while it is in the strip.
  useEffect(() => {
    const active = document.activeElement as HTMLElement | null;
    if (target === null || !active?.closest("[data-rn-slots]") || !root.current?.contains(active)) return;
    root.current.querySelector<HTMLButtonElement>(`[data-rn-slot="${target}"]`)?.focus();
  }, [target]);

  const sound = (rn: string) => {
    if (!key) return;
    const m = rnMidis(rn, key);
    if (m) audio.playNote(m, { sound: h?.sound ?? "piano", dur: 0.9 });
  };
  const playAll = () => {
    if (h?.playProgression) {
      h.playProgression(slots);
      return;
    }
    if (!key) return;
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = progressionHits(slots, key, {
      ...(h?.bpm ? { bpm: h.bpm } : {}),
      ...(h?.beatsPerBar ? { beatsPerBar: h.beatsPerBar } : {}),
      ...(h?.slotsPerBar ? { slotsPerBar: h.slotsPerBar } : {}),
    }).map((hit) =>
      window.setTimeout(
        () => audio.playNote(hit.midis, { sound: h?.sound ?? "piano", dur: hit.dur }),
        hit.at * 1000,
      ),
    );
  };

  const place = (rn: string) => {
    if (disabled) return;
    const inv = Number(inversion) as 0 | 1 | 2 | 3;
    const text = inv === 0 ? rn : (withInversion(rn, inv) ?? rn);
    const next = [...slots];
    const at = slot ?? next.indexOf("");
    next[at < 0 ? spec.slots - 1 : at] = text;
    onChange(next);
    sound(text);
    setSlot(null);
    setFlat(false);
  };
  const clearLast = () => {
    if (disabled) return;
    const next = [...slots];
    let i = slot !== null && next[slot] !== "" ? slot : -1;
    if (i < 0)
      for (let k = next.length - 1; k >= 0; k--)
        if (next[k] !== "") {
          i = k;
          break;
        }
    if (i >= 0) next[i] = "";
    onChange(next);
    setSlot(null);
  };
  /** Changes the chosen slot, else the last filled one (M, I). */
  const editCurrent = (f: (rn: string) => string) => {
    let i = slot !== null && slots[slot] !== "" ? slot : -1;
    if (i < 0)
      for (let k = slots.length - 1; k >= 0; k--)
        if (slots[k] !== "") {
          i = k;
          break;
        }
    const cur = i >= 0 ? slots[i] : "";
    if (!cur || disabled) return;
    const next = [...slots];
    next[i] = f(cur);
    onChange(next);
    sound(next[i] as string);
  };

  const onKey = (e: React.KeyboardEvent<HTMLElement>): boolean => {
    if (e.key === "-") {
      setFlat(true);
      return true;
    }
    const n = digitOf(e);
    if (n !== null) {
      const rn = rnForKey(n, { shift: e.shiftKey, flat, allow });
      setFlat(false);
      if (rn) place(rn);
      return n >= 1 && n <= 7;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    if (e.key === "m" || e.key === "M") {
      editCurrent(toggleCase);
      return true;
    }
    if ((e.key === "i" || e.key === "I") && allow.includes("inversions")) {
      editCurrent(cycleInversion);
      return true;
    }
    if ((e.key === "p" || e.key === "P") && canPlay) {
      playAll();
      return true;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      clearLast();
      return true;
    }
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && spec.slots > 1) {
      if ((e.target as HTMLElement).closest("[role=radiogroup]")) return false;
      const cur = slot ?? Math.min(filled, spec.slots - 1);
      const next = Math.max(0, Math.min(spec.slots - 1, cur + (e.key === "ArrowLeft" ? -1 : 1)));
      setSlot(next);
      if ((e.target as HTMLElement).closest("[data-rn-slots]"))
        root.current?.querySelector<HTMLButtonElement>(`[data-rn-slot="${next}"]`)?.focus();
      return true;
    }
    return false;
  };

  return (
    <AnswerFrame
      kind="rn-palette"
      idBase={p.idBase}
      label={p.label}
      feedback={feedback}
      disabled={disabled}
      onSubmit={p.onSubmit}
      onKey={onKey}
      keys={
        <>
          <KeyHint keys={["1–7"]}>triad</KeyHint>
          {allow.includes("sevenths") ? <KeyHint keys={["⇧ + digit"]}>seventh</KeyHint> : null}
          {allow.includes("borrowed") ? <KeyHint keys={["- then digit"]}>♭ degree</KeyHint> : null}
          <KeyHint keys={["M"]}>major/minor</KeyHint>
          {allow.includes("inversions") ? <KeyHint keys={["I"]}>inversion</KeyHint> : null}
          <KeyHint keys={["←", "→"]}>slot</KeyHint>
          <KeyHint keys={["⌫"]}>clear</KeyHint>
          {canPlay ? <KeyHint keys={["P"]}>play</KeyHint> : null}
          <SubmitHint />
        </>
      }
    >
      <div ref={root} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <ol data-rn-slots aria-label="Your numerals" className="flex flex-wrap gap-2">
            {labels.map((l, i) => {
              const rn = slots[i] ?? "";
              const mark = markOf(feedback, i);
              const active = !disabled && target === i;
              return (
                <li
                  key={l.spoken}
                  className={clsx("flex flex-col items-center gap-1", half && l.barStart && i > 0 && "ml-2")}
                >
                  <span aria-hidden className="text-[0.7rem] whitespace-nowrap text-text-3">
                    {half && l.barStart ? `bar ${l.bar}` : l.short}
                  </span>
                  <button
                    type="button"
                    data-rn-slot={i}
                    aria-pressed={active}
                    aria-disabled={disabled || undefined}
                    aria-label={`${l.spoken}: ${rn ? rnSpoken(rn) : "empty"}${mark ? (mark.ok ? ", right" : ", not this one") : ""}`}
                    tabIndex={i === (target ?? 0) ? 0 : -1}
                    onFocus={() => setSlot(i)}
                    onClick={() => setSlot(i)}
                    className={clsx(
                      "relative inline-flex h-11 min-w-16 items-center justify-center rounded-control border-2 px-2 text-lg font-semibold",
                      rn ? "border-border bg-surface" : "border-dashed border-border text-text-3",
                      active && "border-text-3 bg-surface-2",
                      markRing(mark ? (mark.ok ? "ok" : "bad") : null),
                    )}
                  >
                    {rn ? <RnGlyph rn={rn} /> : <span aria-hidden>·</span>}
                    <MarkBadge mark={mark ? (mark.ok ? "ok" : "bad") : null} note={mark?.note} />
                  </button>
                  {/* Reserved height, so a reveal never moves the palette. */}
                  {correct ? (
                    <span className="inline-flex h-8 min-w-16 items-center justify-center rounded-control border-2 border-dashed border-accent-2 px-2 font-medium">
                      <span className="sr-only">
                        Answer: {correct[i] ? rnSpoken(correct[i] as string) : "none"}
                      </span>
                      {correct[i] ? <RnGlyph rn={correct[i] as string} /> : "—"}
                    </span>
                  ) : (
                    <span aria-hidden className="h-8" />
                  )}
                </li>
              );
            })}
          </ol>
          {canPlay ? (
            <Button
              size="sm"
              variant="ghost"
              data-enter="native"
              className="mb-9"
              icon={<Play aria-hidden className="size-4" />}
              disabled={filled === 0}
              onClick={playAll}
            >
              Play
            </Button>
          ) : null}
        </div>
        {allow.includes("inversions") ? (
          <div className="w-fit">
            <SegmentedControl
              label="Inversion of the next chord"
              value={inversion}
              options={allow.includes("sevenths") ? INVERSIONS : INVERSIONS.slice(0, 3)}
              onChange={(v) => setInversion(v)}
              size="sm"
            />
          </div>
        ) : null}
        {bassHere ? (
          <p className="text-sm text-text-2" data-testid="rn-bass-filter">
            Lit: the chords with bass degree {bassHere} in them, for {slotPhrase(labels[target ?? 0]?.spoken)}
            .
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          {groups.map((g) => {
            const fn = g.id === "T" || g.id === "PD" || g.id === "D" ? g.id : null;
            const st = fn ? functionStyle(fn, theme) : null;
            return (
              <fieldset key={g.id} className="flex min-w-0 flex-col gap-1.5">
                <legend className="mb-1 flex items-center gap-1.5 text-sm text-text-2">
                  {st ? (
                    <span
                      aria-hidden
                      className="inline-flex h-5 items-center rounded px-1.5 text-[0.7rem] font-semibold"
                      style={{ background: st.fill, color: st.label }}
                    >
                      {fn}
                    </span>
                  ) : null}
                  {g.label}
                </legend>
                <div
                  className={clsx(
                    "gap-1.5",
                    fn
                      ? clsx(
                          "grid",
                          allow.includes("sevenths") && allow.includes("triads")
                            ? "grid-cols-2"
                            : "grid-cols-1",
                        )
                      : "flex flex-wrap",
                  )}
                >
                  {g.buttons.map((b) => {
                    const f = roleFn(b.role);
                    const bs = f ? functionStyle(f, theme) : null;
                    const sym = symbols && key ? rnSymbol(b.rn, key) : null;
                    const off = offBass(b.rn);
                    return (
                      <button
                        key={b.rn}
                        type="button"
                        data-rn={b.rn}
                        data-off-bass={off || undefined}
                        aria-disabled={disabled || undefined}
                        aria-label={`${rnSpoken(b.rn)}${sym ? `, ${sym}` : ""}${off ? ", not over this bass" : ""}${b.key ? `, key ${b.key}` : ""}`}
                        onClick={() => place(b.rn)}
                        className={clsx(
                          "inline-flex h-9 min-w-16 items-center justify-between gap-2 rounded-control border border-border bg-surface px-2 font-medium hover:bg-surface-2",
                          !bs && "border-dashed",
                          off && "opacity-60",
                        )}
                        style={bs ? { borderLeft: `4px solid ${bs.fill}` } : undefined}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <RnGlyph rn={b.rn} />
                          {sym ? (
                            <span aria-hidden className="text-[0.75rem] font-normal text-text-2">
                              · {sym}
                            </span>
                          ) : null}
                        </span>
                        {b.key ? (
                          <span aria-hidden className="font-sans text-[0.7rem] text-text-3">
                            {b.key}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
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
