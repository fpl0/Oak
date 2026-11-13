// On-screen piano pick (contracts §5.4 `keyboard`): one key, a chord (a set) or a sequence, octave aware (MIDI
// 60 = C4). The computer's typing row plays and picks (`A W S E D F T G Y H U J K` = C to C′ of the typing
// octave, `Z`/`X` move that octave), arrows walk the keys (one tab stop), `Backspace` clears the last pick.
// Wave 4, `chord` mode (the chord builder): every pick plays the whole chord so far, "Hear the chord" replays it, and
// the line under the keys spells it from the bottom up; the chord's name and inversion show as
// `AnswerEnv.harmony.nameChords` says.
import { clsx } from "clsx";
import { Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../ui/kit/index.ts";
import { appAudio, useAnswerEnv } from "../env.tsx";
import { buildChord, describeBuilt } from "../harmony.ts";
import { chromaticMidi, pickKey, typingLetter, undoPick } from "../keys.ts";
import { keyName, keySpoken, midiRange } from "../normalize.ts";
import type { AnswerWidgetProps } from "../types.ts";
import { AnswerFrame, KeyHint, markOf, revealedOf, SubmitHint } from "../ui.tsx";

const BLACK = new Set([1, 3, 6, 8, 10]);
const isBlack = (m: number) => BLACK.has(((m % 12) + 12) % 12);
const WHITE_W = 34;
const BLACK_W = 22;

export function KeyboardAnswer(p: AnswerWidgetProps<"keyboard">) {
  const { spec, value, onChange, disabled, feedback } = p;
  const env = useAnswerEnv();
  const audio = env.audio ?? appAudio;
  const [lo, hi] = midiRange(spec.range);
  const root = useRef<HTMLDivElement>(null);
  const firstC = Math.floor(lo / 12) - 1;
  const [octave, setOctave] = useState(
    env.keyboard?.octave ?? Math.max(firstC, Math.min(Math.floor(hi / 12) - 2, 4)),
  );
  const [focusMidi, setFocusMidi] = useState<number>(value.at(-1) ?? (lo <= 60 && hi >= 60 ? 60 : lo));
  const correct = new Set(revealedOf<number[]>(feedback) ?? []);

  useEffect(() => {
    if (p.autoFocus) root.current?.querySelector<HTMLElement>("[tabindex='0']")?.focus();
  }, [p.autoFocus]);

  const keys: number[] = [];
  for (let m = lo; m <= hi; m++) keys.push(m);
  const whites = keys.filter((m) => !isBlack(m));
  const xOf = (m: number): number => {
    const whiteIndex = whites.filter((w) => w < m).length;
    return isBlack(m) ? whiteIndex * WHITE_W - BLACK_W / 2 : whiteIndex * WHITE_W;
  };

  const chordMode = spec.mode === "chord";
  const sound = env.keyboard?.sound ? { sound: env.keyboard.sound } : {};
  // The order the notes were picked in: a chord is kept low to high, so "undo" needs its own memory of the last
  // pick (Backspace took away the top note, not the one just played: review:journey).
  const picks = useRef<number[]>([]);
  const pick = (m: number) => {
    if (disabled || m < lo || m > hi) return;
    const next = pickKey(value, m, spec.mode);
    picks.current = next.includes(m)
      ? [...picks.current.filter((x) => x !== m), m]
      : picks.current.filter((x) => x !== m);
    // A chord sounds as a whole: the new note with the ones already down (a removed note just leaves it).
    if (chordMode && next.length > 0) audio.playNote(next, { ...sound, dur: 1 });
    else audio.playNote(m, sound);
    onChange(next);
    setFocusMidi(m);
  };
  const built = chordMode ? buildChord(value, env.harmony?.key ?? null) : null;
  const nameChords = env.harmony?.nameChords ?? "after";
  const naming =
    nameChords === "live" ||
    (nameChords === "after" && feedback.state !== "idle" && feedback.state !== "pending");
  const line = built ? describeBuilt(built, naming) : null;
  const focusKey = (m: number) => {
    const c = Math.max(lo, Math.min(hi, m));
    setFocusMidi(c);
    root.current?.querySelector<HTMLButtonElement>(`[data-midi="${c}"]`)?.focus();
  };

  const onKey = (e: React.KeyboardEvent<HTMLElement>): boolean => {
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    if (e.code === "KeyZ" || e.code === "KeyX") {
      setOctave((o) => Math.max(firstC - 1, Math.min(9, o + (e.code === "KeyZ" ? -1 : 1))));
      return true;
    }
    const typed = chromaticMidi(e.code, octave);
    if (typed !== null && !e.repeat) {
      if (typed >= lo && typed <= hi) {
        pick(typed);
        focusKey(typed);
      }
      return true;
    }
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      focusKey(focusMidi + (e.key === "ArrowRight" ? 1 : -1));
      return true;
    }
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      focusKey(focusMidi + (e.key === "ArrowUp" ? 12 : -12));
      return true;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      if (!disabled) onChange(undoPick(value, picks.current, spec.mode));
      return true;
    }
    return false;
  };

  const width = whites.length * WHITE_W;
  const markFor = (m: number) => {
    const i = value.lastIndexOf(m);
    return i < 0 ? null : markOf(feedback, i);
  };
  const keyClass = (m: number) => {
    const on = value.includes(m);
    const mark = markFor(m);
    const black = isBlack(m);
    return clsx(
      "absolute top-0 flex flex-col items-center justify-end rounded-b-[5px] border pb-1 text-[0.65rem] leading-none select-none",
      // A piano reads the same in both themes: ivory and ebony keys, only dimmed a little in Bark.
      black ? "z-10 h-[62%] border-[#14110e]" : "h-full border-[#c9bfae] dark:border-[#14110e]",
      black
        ? on
          ? "bg-accent text-on-accent"
          : "bg-[#1f1a14] text-[#e8e0d2] hover:bg-[#3a3128]"
        : on
          ? "bg-[#d9eadc] text-[#1f1a14] dark:bg-[#9ccfaa]"
          : "bg-[#fffdf8] text-[#5c5247] hover:bg-[#f1ebe0] dark:bg-[#e6dfd2] dark:hover:bg-[#d8d0c2]",
      on && !mark && "ring-2 ring-accent ring-inset",
      mark?.ok === true && "ring-2 ring-accent ring-inset",
      mark?.ok === false && "ring-2 ring-issue ring-inset",
      correct.has(m) && "outline-2 outline-dashed -outline-offset-4 outline-accent-2",
    );
  };

  return (
    <AnswerFrame
      kind="keyboard"
      idBase={p.idBase}
      label={p.label}
      feedback={feedback}
      disabled={disabled}
      onSubmit={p.onSubmit}
      onKey={onKey}
      keys={
        <>
          <KeyHint keys={["A W S E D F T G Y H U J K"]}>play</KeyHint>
          <KeyHint keys={["Z", "X"]}>octave {octave}</KeyHint>
          {spec.mode !== "single" ? <KeyHint keys={["⌫"]}>undo</KeyHint> : null}
          <SubmitHint />
        </>
      }
    >
      <div ref={root} className="max-w-full overflow-x-auto pb-1">
        {/* biome-ignore lint/a11y/useSemanticElements: a styled custom control with roving focus (ux §7.9); native radios and fieldsets cannot take this layout */}
        <div
          role="group"
          aria-label={`Piano, ${keyName(lo)} to ${keyName(hi)}`}
          className="relative h-32 shrink-0"
          style={{ width }}
        >
          {keys.map((m) => {
            const on = value.includes(m);
            const mark = markFor(m);
            const letter = typingLetter(m, octave);
            const label = `${keySpoken(m)}${on ? ", picked" : ""}${mark ? (mark.ok ? ", right" : ", not this one") : ""}${correct.has(m) ? ", in the answer" : ""}`;
            return (
              <button
                key={m}
                type="button"
                data-midi={m}
                aria-pressed={on}
                aria-label={label}
                aria-disabled={disabled || undefined}
                tabIndex={m === focusMidi ? 0 : -1}
                onFocus={() => setFocusMidi(m)}
                onClick={() => pick(m)}
                className={keyClass(m)}
                style={{ left: xOf(m), width: isBlack(m) ? BLACK_W : WHITE_W }}
              >
                {letter ? <span className="mb-1 font-mono opacity-70">{letter}</span> : null}
                {!isBlack(m) && (m % 12 === 0 || on) ? <span>{keyName(m, "sharp")}</span> : null}
              </button>
            );
          })}
        </div>
      </div>
      {chordMode ? (
        <div className="flex min-h-8 flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            data-enter="native"
            icon={<Play aria-hidden className="size-4" />}
            disabled={value.length === 0}
            onClick={() => audio.playNote(value, { ...sound, dur: 1.2 })}
          >
            Hear the chord
          </Button>
          <Button
            size="sm"
            variant="ghost"
            data-enter="native"
            icon={<RotateCcw aria-hidden className="size-4" />}
            disabled={disabled || value.length === 0}
            onClick={() => {
              picks.current = [];
              onChange([]);
            }}
          >
            Clear
          </Button>
          <span className="text-sm text-text-2" data-testid="keyboard-chord" aria-live="polite">
            {built && line ? (
              <>
                <span className="font-medium text-text">
                  {built.bassName.replace(/-?\d+$/, "")} at the bottom
                </span>
                {line.name ? <span data-testid="chord-name">. {line.name}</span> : null}
              </>
            ) : null}
          </span>
        </div>
      ) : null}
      <p className="min-h-6 text-sm text-text-2" aria-live="polite">
        {value.length === 0 ? (
          <span className="text-text-3">
            {spec.mode === "single"
              ? "Pick one key."
              : spec.mode === "chord"
                ? "Pick the notes of the chord."
                : "Pick the notes in order."}
          </span>
        ) : (
          <>
            <span>{spec.mode === "sequence" ? "In order: " : "Picked: "}</span>
            {value.map((m, i) => {
              const mark = markOf(feedback, i);
              return (
                <span
                  key={`${m}-${i}`}
                  className={clsx(
                    "mr-1 inline-block rounded px-1 font-semibold text-text",
                    mark?.ok === false && "text-issue underline decoration-wavy",
                  )}
                >
                  {keyName(m, "sharp")}
                </span>
              );
            })}
          </>
        )}
      </p>
    </AnswerFrame>
  );
}
