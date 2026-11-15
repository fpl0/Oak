// Jazz chord symbols (Wave 7, feature `text.jazz-chord`: `text` with `normalize: "chord"` and `jazz: true`; J1.L02,
// J2.L02–L03, J.CP1): type the symbol, or build it from a root and a quality with its extensions and alterations.
// Entry is forgiving (C7b9, C7(♭9), Cmaj9, C∆9, C-11, Cm11, D–7, Dmin7, Bø, G7 alt, C6/9) and Oak shows back what it
// reads in lead-sheet form and in jazz glyphs, the learner's chosen style first (`AnswerEnv.harmony.chordStyle`).
// The picker writes the code spelling into the field, so the field is always the one answer; the response is
// the code spelling Oak read (the grader grades root, quality and extensions, never the string). "Hear it" plays
// the chord named, never the answer.
import type { ChordQuality } from "@oak/api";
import { clsx } from "clsx";
import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../ui/kit/index.ts";
import { appAudio, useAnswerEnv } from "../env.tsx";
import { voiceChord } from "../harmony.ts";
import {
  type ChordStyle,
  composeJazz,
  JAZZ_PICKER_ROWS,
  jazzReading,
  pickerQuality,
  styledSymbol,
} from "../jazz.ts";
import type { AnswerWidgetProps } from "../types.ts";
import { AnswerFrame, KeyHint, MarkBadge, markOf, markRing, revealedOf, SubmitHint } from "../ui.tsx";

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;
type Acc = "b" | "" | "#";
const ACCS: readonly { acc: Acc; glyph: string; word: string }[] = [
  { acc: "b", glyph: "♭", word: "flat" },
  { acc: "", glyph: "♮", word: "natural" },
  { acc: "#", glyph: "♯", word: "sharp" },
];

interface Draft {
  letter: (typeof LETTERS)[number] | null;
  acc: Acc;
  quality: ChordQuality;
}

const otherStyle = (s: ChordStyle): ChordStyle => (s === "jazz" ? "lead-sheet" : "jazz");
const STYLE_WORD: Record<ChordStyle, string> = { "lead-sheet": "on a lead sheet", jazz: "in jazz glyphs" };

export function JazzChordAnswer(p: AnswerWidgetProps<"text">) {
  const { value, onChange, disabled, feedback } = p;
  const env = useAnswerEnv();
  const audio = env.audio ?? appAudio;
  const style: ChordStyle = env.harmony?.chordStyle ?? "lead-sheet";
  const input = useRef<HTMLInputElement>(null);
  const read = jazzReading(value);
  const [draft, setDraft] = useState<Draft>({ letter: null, acc: "", quality: "maj7" });
  const shown: Draft =
    read.state === "ok" && !read.chord.bass
      ? {
          letter: read.chord.root.charAt(0) as Draft["letter"],
          acc: (read.chord.root.slice(1) as Acc) ?? "",
          quality: read.chord.quality,
        }
      : draft;
  const mark = markOf(feedback, 0);
  const m = mark ? (mark.ok ? "ok" : "bad") : null;
  const revealed = revealedOf<string>(feedback);
  const revealedRead = revealed === null ? null : jazzReading(revealed);
  const previewId = `${p.idBase}-reads`;

  useEffect(() => {
    if (p.autoFocus) input.current?.focus();
  }, [p.autoFocus]);

  const set = (next: Draft) => {
    if (disabled) return;
    setDraft(next);
    if (next.letter) onChange(composeJazz(`${next.letter}${next.acc}`, next.quality));
  };
  const hear = () => {
    if (read.state !== "ok") return;
    audio.playNote(voiceChord(read.chord), { sound: env.harmony?.sound ?? "piano", dur: 1.4 });
  };
  const btn = (on: boolean) =>
    clsx(
      "inline-flex h-9 min-w-9 items-center justify-center rounded-control border px-2 text-sm font-semibold",
      on ? "border-text bg-surface-2 text-text" : "border-border bg-surface text-text-2 hover:bg-surface-2",
    );

  return (
    <AnswerFrame
      kind="text"
      idBase={p.idBase}
      label={p.label}
      feedback={feedback}
      disabled={disabled}
      onSubmit={p.onSubmit}
      keys={
        <>
          <KeyHint keys={["Tab"]}>build it with the buttons</KeyHint>
          <SubmitHint />
        </>
      }
    >
      <div data-jazz-chord className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-fit max-w-full">
            <input
              ref={input}
              id={`${p.idBase}-input`}
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label={p.label}
              aria-describedby={previewId}
              aria-invalid={mark ? !mark.ok : undefined}
              readOnly={disabled}
              placeholder="e.g. Dm9, G7♭9, C∆7, Bø"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className={clsx(
                "h-10 w-56 max-w-full rounded-control border-2 border-border bg-surface px-3 text-base text-text placeholder:text-text-3 focus-visible:outline-offset-2",
                markRing(m),
              )}
            />
            <MarkBadge mark={m} note={mark?.note} />
          </div>
          <Button
            size="sm"
            variant="ghost"
            data-enter="native"
            icon={<Play aria-hidden className="size-4" />}
            disabled={read.state !== "ok"}
            onClick={hear}
          >
            Hear it
          </Button>
        </div>
        <p id={previewId} className="min-h-6 text-sm text-text-2" data-testid="chord-reads">
          {revealed !== null ? (
            <>
              <span>Answer: </span>
              <span className="rounded-control border-2 border-dashed border-accent-2 px-1.5 font-semibold text-text">
                {revealedRead?.state === "ok" ? styledSymbol(revealedRead.chord, style) : revealed}
              </span>
              {revealedRead?.state === "ok" &&
              styledSymbol(revealedRead.chord, otherStyle(style)) !==
                styledSymbol(revealedRead.chord, style) ? (
                <span>
                  {" "}
                  ({STYLE_WORD[otherStyle(style)]}: {styledSymbol(revealedRead.chord, otherStyle(style))})
                </span>
              ) : null}
            </>
          ) : read.state === "ok" ? (
            <>
              Reads as{" "}
              <span className="font-semibold text-text" data-testid="chord-reads-symbol">
                {styledSymbol(read.chord, style)}
              </span>
              {styledSymbol(read.chord, otherStyle(style)) !== styledSymbol(read.chord, style) ? (
                <span>
                  , {STYLE_WORD[otherStyle(style)]} {styledSymbol(read.chord, otherStyle(style))}
                </span>
              ) : null}
              <span className="sr-only"> ({read.spoken})</span>
            </>
          ) : read.state === "unknown" ? (
            <span>{read.hint}</span>
          ) : (
            <span className="text-text-3">Type a chord symbol, or build it below.</span>
          )}
        </p>
        <div
          className={clsx(
            "flex flex-col gap-2 rounded-card border border-border bg-surface-2/40 p-2.5",
            disabled && "pointer-events-none opacity-60",
          )}
        >
          {/* biome-ignore lint/a11y/useSemanticElements: a row of toggle buttons */}
          <div role="group" aria-label="Root" className="flex items-start gap-1">
            <span aria-hidden className="w-20 shrink-0 pt-2 text-[0.8125rem] text-text-3">
              Root
            </span>
            <span className="flex min-w-0 flex-wrap items-center gap-1">
              {LETTERS.map((l) => (
                <button
                  key={l}
                  type="button"
                  data-enter="native"
                  data-root={l}
                  aria-pressed={shown.letter === l}
                  aria-disabled={disabled || undefined}
                  onClick={() => set({ ...shown, letter: l })}
                  className={btn(shown.letter === l)}
                >
                  {l}
                </button>
              ))}
              <span aria-hidden className="mx-1 h-5 w-px bg-border" />
              {ACCS.map((a) => (
                <button
                  key={a.word}
                  type="button"
                  data-enter="native"
                  aria-pressed={shown.acc === a.acc && shown.letter !== null}
                  aria-disabled={disabled || undefined}
                  aria-label={`Root ${a.word}`}
                  onClick={() => set({ ...shown, acc: a.acc })}
                  className={btn(shown.acc === a.acc && shown.letter !== null)}
                >
                  <span className="text-base leading-none">{a.glyph}</span>
                </button>
              ))}
            </span>
          </div>
          {JAZZ_PICKER_ROWS.map((row) => (
            // biome-ignore lint/a11y/useSemanticElements: a row of toggle buttons
            <div key={row.id} role="group" aria-label={row.label} className="flex items-start gap-1">
              <span aria-hidden className="w-20 shrink-0 pt-2 text-[0.8125rem] text-text-3">
                {row.label}
              </span>
              <span className="flex min-w-0 flex-wrap items-center gap-1">
                {row.qualities.map((q) => {
                  const pq = pickerQuality(q, style);
                  const on = shown.quality === q && shown.letter !== null;
                  return (
                    <button
                      key={q}
                      type="button"
                      data-enter="native"
                      data-quality={q}
                      aria-pressed={on}
                      aria-disabled={disabled || undefined}
                      aria-label={pq.spoken}
                      title={pq.spoken}
                      onClick={() => set({ ...shown, quality: q })}
                      className={btn(on)}
                    >
                      {pq.label}
                    </button>
                  );
                })}
              </span>
            </div>
          ))}
          {!shown.letter ? <span className="text-[0.8125rem] text-text-3">Pick a root first.</span> : null}
        </div>
      </div>
    </AnswerFrame>
  );
}
