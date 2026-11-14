// Chord names (Wave 4; contracts §5.4 `text` with `normalize: "chord"`): type the name, or build it from a root, a
// quality and an optional bass. Entry is forgiving (C, Cm, C°, Co, Cdim, C+, Caug, G/B) and Oak shows back the
// lead-sheet symbol it reads with the grader's own normaliser, with the inversion a slash bass makes. The picker
// writes the lead-sheet symbol into the field, so the field is always the one answer. "Hear it" plays the chord
// named, never the answer. The value is the text as typed; the grader normalises it.
// Wave 6 (U12): the five seventh qualities are entered as forgivingly (Cmaj7, C^7, CM7, CΔ; Cm7; C7; Cm7b5, Cø;
// Cdim7, Co7) and shown back as the lead-sheet symbol (Cmaj7, Cm7♭5, C°7). A step about sevenths opens the
// picker's seventh row from the start (`AnswerEnv.harmony.sevenths`).
import type { ChordQuality } from "@oak/api";
import { chordOf } from "@oak/theory";
import { clsx } from "clsx";
import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../ui/kit/index.ts";
import { appAudio, useAnswerEnv } from "../env.tsx";
import {
  type Acc,
  type ChordParts,
  chordParts,
  composeChord,
  INVERSION_WORDS,
  inversionOfParts,
  LETTERS,
  type Letter,
  PICKER_QUALITIES,
  voiceChord,
} from "../harmony.ts";
import { readsAs } from "../normalize.ts";
import type { AnswerWidgetProps } from "../types.ts";
import { AnswerFrame, KeyHint, MarkBadge, markOf, markRing, revealedOf, SubmitHint } from "../ui.tsx";

const TRIADS: readonly ChordQuality[] = ["maj", "min", "dim", "aug"];
const ACC_GLYPH: Record<Acc, string> = { [-1]: "♭", 0: "♮", 1: "♯" } as Record<Acc, string>;
const ACC_WORD: Record<Acc, string> = { [-1]: "flat", 0: "natural", 1: "sharp" } as Record<Acc, string>;
/** The bass notes a slash chord can take, as written (sharps and flats both, as on a lead sheet). */
const BASS_NAMES = [
  "C",
  "C#",
  "Db",
  "D",
  "D#",
  "Eb",
  "E",
  "F",
  "F#",
  "Gb",
  "G",
  "G#",
  "Ab",
  "A",
  "A#",
  "Bb",
  "B",
];
const display = (n: string) => n.replace("#", "♯").replace(/^([A-G])b/, "$1♭");

interface Draft {
  letter: Letter | null;
  acc: Acc;
  quality: ChordQuality;
  bass: ChordParts["bass"];
}

const pcText = (letter: Letter, acc: Acc) => `${letter}${acc === 1 ? "#" : acc === -1 ? "b" : ""}`;

export function ChordNameAnswer(p: AnswerWidgetProps<"text">) {
  const { value, onChange, disabled, feedback } = p;
  const env = useAnswerEnv();
  const audio = env.audio ?? appAudio;
  const input = useRef<HTMLInputElement>(null);
  const parsed = chordParts(value);
  // What the picker shows: the typed chord when Oak can read it, else the learner's half-built draft.
  const [draft, setDraft] = useState<Draft>({ letter: null, acc: 0, quality: "maj", bass: null });
  const shown: Draft = parsed ?? draft;
  const read = readsAs("chord", value);
  const mark = markOf(feedback, 0);
  const revealed = revealedOf<string>(feedback);
  const revealedRead = revealed === null ? null : readsAs("chord", revealed);
  const previewId = `${p.idBase}-reads`;
  // Seventh chords arrive in U06.L10: the row opens on request, when the typed chord is one, or from the start
  // in a step about sevenths (U12).
  const [askedSevenths, setShowSevenths] = useState(env.harmony?.sevenths === true);
  const showSevenths = askedSevenths || (parsed !== null && !TRIADS.includes(parsed.quality));
  const qualities = PICKER_QUALITIES.filter((q) => showSevenths || !q.seventh);

  useEffect(() => {
    if (p.autoFocus) input.current?.focus();
  }, [p.autoFocus]);

  const set = (next: Draft) => {
    if (disabled) return;
    setDraft(next);
    if (next.letter) onChange(composeChord({ ...next, letter: next.letter }));
  };
  const inversion = parsed ? inversionOfParts(parsed) : null;
  const hear = () => {
    if (!parsed) return;
    const chord = chordOf(
      pcText(parsed.letter, parsed.acc),
      parsed.quality,
      parsed.bass ? pcText(parsed.bass.letter, parsed.bass.acc) : undefined,
    );
    audio.playNote(voiceChord(chord), { sound: env.harmony?.sound ?? "piano", dur: 1.2 });
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
      <div data-chord-name className="flex flex-col gap-2">
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
              placeholder={showSevenths ? "e.g. Cmaj7, Dm7, G7, Bø" : "e.g. C, Am, B°, G/B"}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className={clsx(
                "h-10 w-56 max-w-full rounded-control border-2 border-border bg-surface px-3 text-base text-text placeholder:text-text-3 focus-visible:outline-offset-2 disabled:opacity-80",
                markRing(mark ? (mark.ok ? "ok" : "bad") : null),
              )}
            />
            <MarkBadge mark={mark ? (mark.ok ? "ok" : "bad") : null} note={mark?.note} />
          </div>
          <Button
            size="sm"
            variant="ghost"
            data-enter="native"
            icon={<Play aria-hidden className="size-4" />}
            disabled={!parsed}
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
                {revealedRead?.state === "ok" ? revealedRead.display : revealed}
              </span>
            </>
          ) : read.state === "ok" ? (
            <>
              Reads as <span className="font-semibold text-text">{read.display}</span>
              <span className="sr-only"> ({read.spoken})</span>
              {parsed?.bass && inversion !== null ? <span>, {INVERSION_WORDS[inversion]}</span> : null}
            </>
          ) : read.state === "unknown" ? (
            <span>{read.hint}</span>
          ) : (
            <span className="text-text-3">Type a chord name, or build it below.</span>
          )}
        </p>
        <div
          className={clsx(
            "flex flex-col gap-2 rounded-card border border-border bg-surface-2/40 p-2.5",
            disabled && "pointer-events-none opacity-60",
          )}
        >
          {/* biome-ignore lint/a11y/useSemanticElements: a row of toggle buttons; a fieldset would add a legend we style apart */}
          <div role="group" aria-label="Root" className="flex flex-wrap items-center gap-1">
            <span aria-hidden className="w-14 text-[0.8125rem] text-text-3">
              Root
            </span>
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
            {([-1, 0, 1] as const).map((a) => (
              <button
                key={a}
                type="button"
                data-enter="native"
                aria-pressed={shown.acc === a}
                aria-disabled={disabled || undefined}
                aria-label={`Root ${ACC_WORD[a]}`}
                onClick={() => set({ ...shown, acc: a })}
                className={btn(shown.acc === a && shown.letter !== null)}
              >
                <span className="text-base leading-none">{ACC_GLYPH[a]}</span>
              </button>
            ))}
          </div>
          {/* biome-ignore lint/a11y/useSemanticElements: see above */}
          <div role="group" aria-label="Quality" className="flex flex-wrap items-center gap-1">
            <span aria-hidden className="w-14 text-[0.8125rem] text-text-3">
              Quality
            </span>
            {qualities.map((q) => (
              <button
                key={q.quality}
                type="button"
                data-enter="native"
                data-quality={q.quality}
                aria-pressed={shown.quality === q.quality}
                aria-disabled={disabled || undefined}
                aria-label={q.spoken}
                title={q.spoken}
                onClick={() => set({ ...shown, quality: q.quality })}
                className={btn(shown.quality === q.quality && shown.letter !== null)}
              >
                {q.label}
              </button>
            ))}
            {!showSevenths ? (
              <button
                type="button"
                data-enter="native"
                onClick={() => setShowSevenths(true)}
                className="ml-1 rounded-control px-1.5 text-[0.8125rem] text-text-2 underline decoration-dotted hover:text-text"
              >
                7th chords
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <label htmlFor={`${p.idBase}-bass`} className="w-14 text-[0.8125rem] text-text-3">
              Bass
            </label>
            <select
              id={`${p.idBase}-bass`}
              data-enter="native"
              disabled={disabled}
              value={shown.bass ? pcText(shown.bass.letter, shown.bass.acc) : ""}
              onChange={(e) => {
                const v = e.target.value;
                const m = /^([A-G])(#|b)?$/.exec(v);
                set({
                  ...shown,
                  bass: m ? { letter: m[1] as Letter, acc: m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0 } : null,
                });
              }}
              className="h-9 rounded-control border border-border bg-surface px-2 text-sm text-text"
            >
              <option value="">The root (no slash)</option>
              {BASS_NAMES.map((n) => (
                <option key={n} value={n}>
                  / {display(n)}
                </option>
              ))}
            </select>
            {!shown.letter ? <span className="text-[0.8125rem] text-text-3">Pick a root first.</span> : null}
          </div>
        </div>
      </div>
    </AnswerFrame>
  );
}
