// Chord answers: the quality pad (`quality-pad`) and the Roman numeral palette (`rn-palette`, ux §4.5 RomanPad):
// three columns T | PD | D in the function colours, applied and borrowed rows when the step allows them. RN keys:
// `1`–`7` the diatonic triad, `Shift+digit` the seventh, `-` then a digit a flat-degree chord (`-7` → ♭VII),
// `M` swaps the case of the current slot, `I` steps its inversion figure (when the step allows inversions),
// `Backspace` clears, `←`/`→` choose a slot, `P` plays the progression. Wave 4: one slot per bar or per half bar
// (`AnswerEnv.harmony.slotsPerBar`); with the step's key every numeral sounds as it is placed and each button
// shows its chord in the key ("IV · F", only with the chord-symbol lens on); figures print as figured bass.
//
// Wave 6: the quality pad prints each seventh as its lead-sheet symbol (maj7, 7, m7, ø7, °7; `@oak/theory`
// `SEVENTH_CHORDS`). The palette names its slots with the step's `labels`, and a slot with its own key (`slotKeys`:
// one pivot chord named in two keys, U17.L01) shows that key's chords while it is the slot being filled. In a colour
// mode (U14) the columns hold the mode's own chords (♭VII, IV, II, ♭II). Applied chords (U15) are a second pick,
// "V7 of …": choose the kind, then what it leans on; by keyboard `/` then the target's digit.
//
// Wave 7 (`AnswerEnv.harmony.jazz`, J2–J5): a jazz row (II7 VI7 III7, the tritone sub ♭II7, the backdoor iv7 ♭VII7,
// iiø7), each with what it does, and brackets over the learner's numerals where they make a ii–V, a ii–♭II, a
// tritone sub sliding down a half step, or the backdoor home (`rnBrackets`): what was written, never what to write.
import type { ChordQuality, KeySpec } from "@oak/api";
import { keyDisplay } from "@oak/theory";
import { clsx } from "clsx";
import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, SegmentedControl } from "../../ui/kit/index.ts";
import { functionStyle, type HarmonicFn } from "../../ui/theme/palette.ts";
import { appAudio, useAnswerEnv } from "../env.tsx";
import { progressionHits, rnHasDegree, rnMidis, rnSymbol, slotLabels } from "../harmony.ts";
import { jazzRnButtons, type RnBracket, rnBrackets } from "../jazz.ts";
import {
  APPLIED_KIND_RNS,
  type AppliedKindRn,
  appliedRn,
  appliedTargetsOf,
  applyOf,
  cycleInversion,
  isModalKey,
  qualityLabel,
  type RnAllow,
  type RnButton,
  rnDisplay,
  rnForKey,
  rnGlyph,
  rnModeOf,
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
          // A seventh prints as it stands on a lead sheet, after a C: Cmaj7, C7, Cm7, Cm7♭5, C°7.
          const seventh = SEVENTH_SHORT[q] !== undefined;
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
                <span className="font-semibold">{seventh ? SEVENTH_SHORT[q] : l.short}</span>
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

/** The five seventh qualities of U12 as a lead sheet prints them after the root (Cmaj7, C7, Cm7, Cm7♭5, C°7). */
const SEVENTH_SHORT: Partial<Record<ChordQuality, string>> = {
  maj7: "maj7",
  "7": "7",
  m7: "m7",
  m7b5: "m7♭5 · ø7",
  dim7: "°7",
};

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
export function rnSpoken(rn: string): string {
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
            ? " major"
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
  const root = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const allow = spec.allow as readonly RnAllow[];
  const [flat, setFlat] = useState(false);
  const [raised, setRaised] = useState(false);
  const [of, setOf] = useState(false);
  const [kind, setKind] = useState<AppliedKindRn>("V7");
  const [slot, setSlot] = useState<number | null>(null);
  const [inversion, setInversion] = useState<"0" | "1" | "2" | "3">("0");
  const correct = revealedOf<string[]>(feedback);
  const slots = Array.from({ length: spec.slots }, (_, k) => value[k] ?? "");
  const filled = slots.filter((x) => x !== "").length;
  const labels = slotLabels(spec.slots, {
    ...(h?.slotsPerBar ? { slotsPerBar: h.slotsPerBar } : {}),
    ...(h?.beatsPerBar ? { beatsPerBar: h.beatsPerBar } : {}),
    ...(spec.labels ? { labels: spec.labels } : {}),
  });
  const half = (h?.slotsPerBar ?? 1) === 2 && !spec.labels;
  /** The slot the next numeral goes into: the chosen one, else the first empty one. */
  const target = slot ?? (slots.indexOf("") < 0 ? null : slots.indexOf(""));
  // Wave 6: a slot may have its own key (a pivot chord named in two keys); the palette follows the slot being
  // filled, and every numeral sounds and prints its symbol in its own slot's key.
  const keyOf = (i: number | null): KeySpec | undefined =>
    (i !== null ? spec.slotKeys?.[i] : undefined) ?? h?.key;
  const key = keyOf(target ?? Math.max(0, spec.slots - 1));
  const ownKeys = (spec.slotKeys?.length ?? 0) > 0;
  const symbols = key !== undefined && env.lenses?.chordSymbols !== false;
  const mode = rnModeOf(key);
  const modal = isModalKey(key);
  const groups = rnPalette(allow, mode, key);
  const applied = allow.includes("secondary");
  const targets = applied ? appliedTargetsOf(key) : [];
  const canPlay = Boolean(h?.playProgression) || key !== undefined;
  // Wave 7: the jazz row and the ii–V brackets over what the learner wrote.
  const jazz = h?.jazz === true;
  const brackets: RnBracket[] = jazz ? rnBrackets(slots, key ?? { tonic: "C", mode: "major" }) : [];
  const bracketAt = (i: number) => brackets.find((b) => i >= b.from && i <= b.to) ?? null;
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

  const sound = (rn: string, at: number | null = target) => {
    const k = keyOf(at);
    if (!k) return;
    const m = rnMidis(rn, k);
    if (m) audio.playNote(m, { sound: h?.sound ?? "piano", dur: 0.9 });
  };
  const playAll = () => {
    if (h?.playProgression) {
      h.playProgression(slots);
      return;
    }
    if (!key) return;
    for (const t of timers.current) window.clearTimeout(t);
    if (ownKeys) {
      // Each slot in its own key, one after the other (the same chord twice when it is a pivot).
      timers.current = slots.flatMap((rn, i) => {
        const k = keyOf(i);
        const m = k ? rnMidis(rn, k) : null;
        if (!m) return [];
        return [
          window.setTimeout(() => audio.playNote(m, { sound: h?.sound ?? "piano", dur: 1.1 }), i * 1200),
        ];
      });
      return;
    }
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
    const i = at < 0 ? spec.slots - 1 : at;
    next[i] = text;
    onChange(next);
    sound(text, i);
    setSlot(null);
    setFlat(false);
    setRaised(false);
    setOf(false);
  };
  /**
   * "of …" from the keyboard: a V, V7, vii° or vii°7 in the slot just filled (or chosen) becomes that chord of the
   * target; anything else leaves it alone and places the dominant seventh of the target in the next slot.
   */
  const placeOf = (digit: number) => {
    setOf(false);
    if (disabled) return;
    let i = slot !== null && slots[slot] !== "" ? slot : -1;
    if (i < 0)
      for (let k = slots.length - 1; k >= 0; k--)
        if (slots[k] !== "") {
          i = k;
          break;
        }
    const cur = i >= 0 ? (slots[i] as string) : "";
    const head = cur.split("/")[0] ?? "";
    if (i >= 0 && (APPLIED_KIND_RNS as readonly string[]).includes(head)) {
      const rn = applyOf(cur, digit, keyOf(i));
      if (!rn) return;
      const next = [...slots];
      next[i] = rn;
      onChange(next);
      sound(rn, i);
      return;
    }
    const rn = applyOf("", digit, key, kind);
    if (rn) place(rn);
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
    sound(next[i] as string, i);
  };

  const onKey = (e: React.KeyboardEvent<HTMLElement>): boolean => {
    if (e.key === "/" && applied) {
      setOf(true);
      setFlat(false);
      setRaised(false);
      return true;
    }
    if (e.key === "-") {
      setFlat(true);
      setRaised(false);
      setOf(false);
      return true;
    }
    if ((e.key === "+" || e.key === "#") && mode !== "major" && !modal) {
      setRaised(true);
      setFlat(false);
      setOf(false);
      return true;
    }
    const n = digitOf(e);
    if (n !== null && of) {
      placeOf(n);
      return true;
    }
    if (n !== null) {
      const rn = rnForKey(n, { shift: e.shiftKey, flat, raised, allow, mode, key: key ?? null });
      setFlat(false);
      setRaised(false);
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
          {mode !== "major" && !modal ? (
            <KeyHint keys={["+ then 5 or 7"]}>{mode === "minor" ? "raised 7th: V, vii°" : "v, VII"}</KeyHint>
          ) : null}
          {applied ? <KeyHint keys={["/ then digit"]}>of … (applied)</KeyHint> : null}
          {allow.includes("borrowed") ? (
            <KeyHint keys={[mode === "major" ? "- then digit" : "- then 2"]}>♭ degree</KeyHint>
          ) : null}
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
                  {jazz ? (
                    // Reserved height: a bracket over the slots it spans, its name over its first slot.
                    <span
                      aria-hidden
                      className="relative h-6 self-stretch"
                      data-rn-bracket={bracketAt(i)?.kind}
                    >
                      {(() => {
                        const b = bracketAt(i);
                        if (!b) return null;
                        return (
                          <>
                            {i === b.from ? (
                              <span className="absolute top-0 left-1 text-[0.65rem] leading-none font-semibold whitespace-nowrap text-accent-2">
                                {b.kind}
                              </span>
                            ) : null}
                            <span
                              className={clsx(
                                "absolute bottom-0 left-0 h-2 border-t-2 border-accent-2",
                                i === b.from && "rounded-tl border-l-2",
                                i === b.to && "rounded-tr border-r-2",
                              )}
                              style={{ width: i < b.to ? "calc(100% + 0.5rem)" : "100%" }}
                            />
                          </>
                        );
                      })()}
                    </span>
                  ) : null}
                  <span aria-hidden className="text-[0.7rem] whitespace-nowrap text-text-3">
                    {half && l.barStart ? `bar ${l.bar}` : l.short}
                  </span>
                  {/* A slot with its own key says which, once: "in G major" is usually the label already. */}
                  {ownKeys && !spec.labels && keyOf(i) ? (
                    <span aria-hidden className="text-[0.7rem] whitespace-nowrap text-text-3">
                      in {keyDisplay(keyOf(i) as KeySpec)}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    data-rn-slot={i}
                    aria-pressed={active}
                    aria-disabled={disabled || undefined}
                    aria-label={`${l.spoken}${ownKeys && !spec.labels && keyOf(i) ? `, in ${keyDisplay(keyOf(i) as KeySpec)}` : ""}: ${rn ? rnSpoken(rn) : "empty"}${mark ? (mark.ok ? ", right" : ", not this one") : ""}`}
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
        {ownKeys && key ? (
          <p className="text-sm text-text-2" data-testid="rn-palette-key">
            {labels[target ?? spec.slots - 1]?.spoken ?? "This slot"}: pick from the chords of{" "}
            {keyDisplay(key)}.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          {groups.map((g) => {
            if (g.id === "secondary")
              return (
                <fieldset key={g.id} className="flex min-w-0 flex-col gap-1.5" data-rn-applied>
                  <legend className="mb-1 text-sm text-text-2">Applied: the dominant of another chord</legend>
                  <div className="w-fit">
                    <SegmentedControl
                      label="Kind of applied chord"
                      value={kind}
                      options={APPLIED_KIND_RNS.map((k) => ({ value: k, label: rnDisplay(k) }))}
                      onChange={(v) => setKind(v)}
                      size="sm"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {targets.map((t) => {
                      const rn = appliedRn(kind, t.rn);
                      const sym = symbols && key ? rnSymbol(rn, key) : null;
                      return (
                        <button
                          key={t.rn}
                          type="button"
                          data-rn={rn}
                          data-rn-of={t.rn}
                          aria-disabled={disabled || undefined}
                          aria-label={`${rnSpoken(rn)}${sym ? `, ${sym}` : ""}, key slash then ${t.degree}`}
                          onClick={() => place(rn)}
                          className="inline-flex h-9 min-w-16 items-center justify-between gap-2 rounded-control border border-dashed border-border bg-surface px-2 font-medium hover:bg-surface-2"
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <span aria-hidden className="text-[0.8125rem] font-normal text-text-2">
                              of
                            </span>
                            <RnGlyph rn={t.rn} />
                            {sym ? (
                              <span aria-hidden className="text-[0.75rem] font-normal text-text-2">
                                · {sym}
                              </span>
                            ) : null}
                          </span>
                          <span aria-hidden className="font-sans text-[0.7rem] text-text-3">
                            /{t.degree}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              );
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
        {jazz ? (
          <fieldset className="flex min-w-0 flex-col gap-1.5" data-rn-jazz>
            <legend className="mb-1 text-sm text-text-2">
              Jazz: dominants, the tritone sub, the backdoor
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {jazzRnButtons(mode === "major" ? "major" : "minor").map((b) => {
                const sym = symbols && key ? rnSymbol(b.rn, key) : null;
                return (
                  <button
                    key={b.rn}
                    type="button"
                    data-rn={b.rn}
                    aria-disabled={disabled || undefined}
                    aria-label={`${rnSpoken(b.rn)}${sym ? `, ${sym}` : ""}: ${b.role}`}
                    title={b.role}
                    onClick={() => place(b.rn)}
                    className="inline-flex h-9 min-w-16 items-center gap-1.5 rounded-control border border-dashed border-border bg-surface px-2 font-medium hover:bg-surface-2"
                  >
                    <RnGlyph rn={b.rn} />
                    {sym ? (
                      <span aria-hidden className="text-[0.75rem] font-normal text-text-2">
                        · {sym}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <p className="text-[0.8125rem] text-text-3" data-testid="rn-brackets">
              {brackets.length > 0 ? brackets.map((b) => b.text).join(". ") : ""}
            </p>
          </fieldset>
        ) : null}
        <p className="sr-only" aria-live="polite">
          {flat
            ? "flat — now a digit"
            : raised
              ? "raised — now 5 or 7"
              : of
                ? "of — now the digit of the chord it leans on"
                : ""}
        </p>
      </div>
    </AnswerFrame>
  );
}
