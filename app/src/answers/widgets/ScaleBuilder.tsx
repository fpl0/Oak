// The scale builder (wave5.md §11, `scale-builder`; U10–U11, `fam.key.scale-spell`): choose a scale's notes above a
// tonic and hear it as it grows. `input: "keyboard"`: keys on a piano from the tonic (the typing row `A W S E D F T
// G Y H U J K` toggles them, arrows walk the keys); `input: "degrees"`: a pad of degrees (the content's `palette`,
// else all twelve: 1 ♭2 2 ♭3 3 4 ♭5 5 ♭6 6 ♭7 7), digits toggle the degree on that number, `-` or `+` first the
// altered one. Every pick sounds; `P` plays the scale up and back down; `Backspace` takes out the last one picked.
// The minors are do-based (1 is home; ♭3 ♭6 ♭7 are me le te, raised 6 and 7 la and ti): syllables show with the
// solfège lens, degrees under the keys with the degree lens. Marks are per picked note; a reveal outlines the
// answer's notes in place, so nothing moves.
// Wave 6 (`scale-builder.from`, U14): the builder opens holding a scale the learner knows (the host's value starts
// from `emptyValue`), and the line under it says which note has moved and which way ("7 lowered a half step: ♭7"),
// as the learner moves it. "Start again" puts the starting scale back.
import type { Degree } from "@oak/api";
import { MODE_DEGREES } from "@oak/content-kit";
import { clsx } from "clsx";
import { Home, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../ui/kit/index.ts";
import { degreeBackgroundCss, degreeStyle } from "../../ui/theme/palette.ts";
import { appAudio, useAnswerEnv } from "../env.tsx";
import { scaleMove, scaleNameOf } from "../facts.ts";
import { CHROMATIC_CODES, degreeForDigit, padOrder } from "../keys.ts";
import { degreeDisplay, degreeSpoken, keySpoken } from "../normalize.ts";
import { scaleStart } from "../response.ts";
import {
  builderRange,
  CHROMATIC_PALETTE,
  degreeOfMidi,
  degreeSemis,
  keyInScale,
  nameDisplay,
  parseTonic,
  scaleRun,
  spellDegreeName,
  syllableOfDegree,
  toggleDegree,
  toggleMidi,
  tonicMidi,
  valueDegrees,
} from "../scale.ts";
import type { AnswerWidgetProps } from "../types.ts";
import {
  AnswerFrame,
  digitOf,
  focusFirst,
  KeyHint,
  markOf,
  revealedOf,
  SubmitHint,
  useThemeName,
} from "../ui.tsx";

const BLACK = new Set([1, 3, 6, 8, 10]);
const isBlack = (m: number) => BLACK.has(((m % 12) + 12) % 12);
const WHITE_W = 36;
const BLACK_W = 22;
const STEP_MS = 320;

export function ScaleBuilderAnswer(p: AnswerWidgetProps<"scale-builder">) {
  return p.spec.input === "keyboard" ? <ScaleKeys {...p} /> : <ScalePad {...p} />;
}

/** The scale as built, in its own letters, with the degree and syllable each lens asks for. */
function BuiltLine({
  degrees,
  tonic,
  showDegrees,
  showSyllables,
  marks,
}: {
  degrees: readonly Degree[];
  tonic: string;
  showDegrees: boolean;
  showSyllables: boolean;
  marks: readonly (boolean | null)[];
}) {
  return (
    <p
      className="flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-2"
      aria-live="polite"
      data-testid="scale-built"
    >
      {degrees.length === 0 ? (
        <span className="text-text-3">Pick the notes of the scale, starting from home.</span>
      ) : (
        <>
          <span>Your scale:</span>
          {degrees.map((d, i) => {
            const name = spellDegreeName(tonic, d);
            const ok = marks[i] ?? null;
            return (
              <span
                key={d}
                className={clsx(
                  "inline-flex flex-col items-center rounded px-1 leading-tight",
                  ok === false && "text-issue underline decoration-wavy",
                )}
              >
                <span className="font-semibold text-text">{name ? nameDisplay(name) : degreeDisplay(d)}</span>
                {showDegrees || showSyllables ? (
                  <span className="text-[0.7rem] text-text-3">
                    {showDegrees ? degreeDisplay(d) : null}
                    {showDegrees && showSyllables ? " · " : null}
                    {showSyllables ? syllableOfDegree(d) : null}
                  </span>
                ) : null}
              </span>
            );
          })}
        </>
      )}
    </p>
  );
}

const SCALE_WORD: Record<string, string> = { minor: "natural minor" };

/**
 * The line of a builder that started from a scale: what has moved so far. It describes the learner's own change
 * and never the answer; with `AnswerEnv.facts`, a checked-right scale is also named.
 */
function MoveLine({
  spec,
  degrees,
  named,
}: {
  spec: AnswerWidgetProps<"scale-builder">["spec"];
  degrees: readonly string[];
  named: boolean;
}) {
  if (!spec.from) return null;
  const from = MODE_DEGREES[spec.from];
  const move = scaleMove(from, degrees);
  const fromName = SCALE_WORD[spec.from] ?? spec.from;
  const sounds = (ds: readonly string[]) =>
    [...new Set(ds.map((d) => degreeSemis(d)))].sort((a, b) => a - b).join(",");
  const unchanged = sounds(degrees) === sounds(from);
  const have = new Set(degrees.map((d) => degreeSemis(d)));
  const gone = from.filter((d) => !have.has(degreeSemis(d)));
  const added = [...have].filter((x) => !from.some((d) => degreeSemis(d) === x)).length;
  const name = named ? scaleNameOf(degrees) : null;
  return (
    <p className="min-h-6 text-sm text-text-2" data-testid="scale-move" aria-live="polite">
      {unchanged ? (
        <span className="text-text-3">
          This is {nameDisplay(spec.tonic)} {fromName}. Move one note to make the new scale.
        </span>
      ) : move ? (
        <>
          From {fromName}: <span className="font-semibold text-text">{move.text}</span>.
          {name ? <span> That is {name}.</span> : null}
        </>
      ) : gone.length === 1 && added === 0 ? (
        <span>
          {degreeDisplay(gone[0] as string)} is out. Put in the note that takes its place, a half step away.
        </span>
      ) : gone.length === 0 && added === 1 ? (
        <span>One note more than {fromName} has. Take out the note it replaces.</span>
      ) : (
        <span>More than one note differs from {fromName} now. The new scale is one note away.</span>
      )}
    </p>
  );
}

function usePlayer() {
  const env = useAnswerEnv();
  const audio = env.audio ?? appAudio;
  const timers = useRef<number[]>([]);
  const [lit, setLit] = useState<number | null>(null);
  useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
    },
    [],
  );
  const run = (midis: readonly number[]) => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = midis.map((m, i) =>
      window.setTimeout(() => {
        audio.playNote(m, { dur: 0.4 });
        setLit(m);
      }, i * STEP_MS),
    );
    timers.current.push(window.setTimeout(() => setLit(null), midis.length * STEP_MS));
  };
  return { audio, run, lit };
}

function ScaleKeys(p: AnswerWidgetProps<"scale-builder">) {
  const { spec, value, onChange, disabled, feedback } = p;
  const env = useAnswerEnv();
  const { audio, run, lit } = usePlayer();
  const [lo, hi] = builderRange(spec);
  const tonicPc = parseTonic(spec.tonic)?.pc ?? 0;
  const root = useRef<HTMLDivElement>(null);
  const picks = useRef<number[]>([]);
  const midis = value.filter((x): x is number => typeof x === "number");
  const home = (() => {
    for (let m = lo; m <= hi; m++) if (((m % 12) + 12) % 12 === tonicPc) return m;
    return lo;
  })();
  const [focusMidi, setFocusMidi] = useState<number>(midis.at(-1) ?? home);
  const letterOf = (m: number) => {
    const code = Object.entries(CHROMATIC_CODES).find(([, o]) => home + o === m)?.[0];
    return code ? code.replace(/^Key/, "") : null;
  };
  const showDegrees = env.lenses?.degrees === true;
  const showSyllables = env.lenses?.solfege === true || p.solfege === "syllables";
  // The answer, as keys: degrees placed from the lowest home in range up (a reveal from a degree answer).
  const reveal = revealedOf<(number | string)[]>(feedback);
  const answerKeys = new Set((reveal ?? []).map((x) => (typeof x === "number" ? x : home + degreeSemis(x))));

  useEffect(() => {
    if (p.autoFocus) root.current?.querySelector<HTMLElement>("[tabindex='0']")?.focus();
  }, [p.autoFocus]);

  const keys: number[] = [];
  for (let m = lo; m <= hi; m++) keys.push(m);
  const whites = keys.filter((m) => !isBlack(m));
  const xOf = (m: number) => {
    const w = whites.filter((x) => x < m).length;
    return isBlack(m) ? w * WHITE_W - BLACK_W / 2 : w * WHITE_W;
  };

  const toggle = (m: number) => {
    if (disabled || m < lo || m > hi) return;
    const next = toggleMidi(midis, m);
    picks.current = next.includes(m)
      ? [...picks.current.filter((x) => x !== m), m]
      : picks.current.filter((x) => x !== m);
    if (next.includes(m)) audio.playNote(m, { dur: 0.5 });
    onChange(next);
    setFocusMidi(m);
  };
  const focusKey = (m: number) => {
    const c = Math.max(lo, Math.min(hi, m));
    setFocusMidi(c);
    root.current?.querySelector<HTMLButtonElement>(`[data-midi="${c}"]`)?.focus();
  };
  const undo = () => {
    if (disabled || midis.length === 0) return;
    const last = picks.current.filter((m) => midis.includes(m)).at(-1) ?? midis.at(-1);
    picks.current = picks.current.filter((m) => m !== last);
    onChange(midis.filter((m) => m !== last));
  };

  const onKey = (e: React.KeyboardEvent<HTMLElement>): boolean => {
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    if (e.code === "KeyP") {
      if (midis.length) run(scaleRun(midis, spec.tonic));
      return true;
    }
    // The typing row is chromatic from home here (A is home, K the octave above), whatever the tonic.
    const off = CHROMATIC_CODES[e.code];
    const typed = off === undefined ? null : home + off;
    if (typed !== null && !e.repeat) {
      if (typed >= lo && typed <= hi) {
        toggle(typed);
        focusKey(typed);
      }
      return true;
    }
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      focusKey(focusMidi + (e.key === "ArrowRight" ? 1 : -1));
      return true;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      undo();
      return true;
    }
    return false;
  };

  const degrees = valueDegrees(midis, spec.tonic);
  const marksByDegree = degrees.map((d) => {
    const i = midis.findIndex((m) => degreeOfMidi(m, tonicPc) === d);
    const mk = i < 0 ? null : markOf(feedback, i);
    return mk ? mk.ok : null;
  });

  return (
    <AnswerFrame
      kind="scale-builder"
      idBase={p.idBase}
      label={p.label}
      feedback={feedback}
      disabled={disabled}
      onSubmit={p.onSubmit}
      onKey={onKey}
      keys={
        <>
          <KeyHint keys={["A W S E D F T G Y H U J K"]}>pick, A is home</KeyHint>
          <KeyHint keys={["←", "→"]}>walk</KeyHint>
          <KeyHint keys={["⌫"]}>undo</KeyHint>
          <KeyHint keys={["P"]}>play the scale</KeyHint>
          <SubmitHint />
        </>
      }
    >
      <div ref={root} className="flex min-w-0 flex-col gap-2">
        <div className="max-w-full overflow-x-auto pb-1">
          {/* biome-ignore lint/a11y/useSemanticElements: a styled custom control with roving focus (ux §7.9); native checkboxes cannot take a piano's layout */}
          <div
            role="group"
            aria-label={`Piano from ${keyInScale(lo, spec.tonic)} to ${keyInScale(hi, spec.tonic)}, home ${nameDisplay(spec.tonic)}`}
            className="relative h-36 shrink-0"
            style={{ width: whites.length * WHITE_W }}
          >
            {keys.map((m) => {
              const on = midis.includes(m);
              const i = midis.indexOf(m);
              const mark = i < 0 ? null : markOf(feedback, i);
              const black = isBlack(m);
              const tonic = ((m % 12) + 12) % 12 === tonicPc;
              const d = degreeOfMidi(m, tonicPc);
              const letter = letterOf(m);
              return (
                <button
                  key={m}
                  type="button"
                  data-midi={m}
                  data-tonic={tonic || undefined}
                  aria-pressed={on}
                  aria-disabled={disabled || undefined}
                  aria-label={`${keySpoken(m)}${tonic ? ", home" : ""}${on ? `, in your scale${showDegrees ? `, degree ${degreeSpoken(d)}` : ""}` : ""}${mark ? (mark.ok ? ", right" : ", not this one") : ""}${answerKeys.has(m) ? ", in the answer" : ""}`}
                  tabIndex={m === focusMidi ? 0 : -1}
                  onFocus={() => setFocusMidi(m)}
                  onClick={() => toggle(m)}
                  className={clsx(
                    "absolute top-0 flex flex-col items-center justify-end gap-0.5 rounded-b-[5px] border pb-1 text-[0.65rem] leading-none select-none",
                    black ? "z-10 h-[60%] border-[#14110e]" : "h-full border-[#c9bfae] dark:border-[#14110e]",
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
                    lit === m && "brightness-90",
                    answerKeys.has(m) && "outline-2 outline-dashed -outline-offset-4 outline-accent-2",
                  )}
                  style={{ left: xOf(m), width: black ? BLACK_W : WHITE_W }}
                >
                  {tonic ? <Home aria-hidden className="size-3 opacity-70" /> : null}
                  {on && (showDegrees || showSyllables) ? (
                    <span className="font-semibold">
                      {showDegrees ? degreeDisplay(d) : syllableOfDegree(d)}
                    </span>
                  ) : null}
                  {letter ? <span className="font-mono opacity-60">{letter}</span> : null}
                  {!black ? <span>{keyInScale(m, spec.tonic).replace(/-?\d+$/, "")}</span> : null}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            data-enter="native"
            icon={<Play aria-hidden className="size-4" />}
            disabled={midis.length === 0}
            onClick={() => run(scaleRun(midis, spec.tonic))}
          >
            Play the scale
          </Button>
          <Button
            size="sm"
            variant="ghost"
            data-enter="native"
            icon={<RotateCcw aria-hidden className="size-4" />}
            disabled={disabled || (midis.length === 0 && !spec.from)}
            onClick={() => {
              picks.current = [];
              onChange(scaleStart(spec));
            }}
          >
            {spec.from ? "Start again" : "Clear"}
          </Button>
        </div>
        <BuiltLine
          degrees={degrees}
          tonic={spec.tonic}
          showDegrees={showDegrees}
          showSyllables={showSyllables}
          marks={marksByDegree}
        />
        <MoveLine spec={spec} degrees={degrees} named={env.facts === true && feedback.state === "correct"} />
      </div>
    </AnswerFrame>
  );
}

function ScalePad(p: AnswerWidgetProps<"scale-builder">) {
  const { spec, value, onChange, disabled, feedback } = p;
  const env = useAnswerEnv();
  const theme = useThemeName();
  const { audio, run, lit } = usePlayer();
  const root = useRef<HTMLDivElement>(null);
  const picks = useRef<string[]>([]);
  const [prefix, setPrefix] = useState<"flat" | "sharp" | null>(null);
  const set = padOrder((spec.palette ?? CHROMATIC_PALETTE) as Degree[]);
  const degrees = value.filter((x): x is string => typeof x === "string") as Degree[];
  const tonic = tonicMidi(spec.tonic);
  const showSyllables = env.lenses?.solfege === true || p.solfege === "syllables";
  const reveal = revealedOf<(number | string)[]>(feedback);
  const answer = new Set(
    (reveal ?? []).map((x) => (typeof x === "string" ? x : degreeOfMidi(x, parseTonic(spec.tonic)?.pc ?? 0))),
  );

  useEffect(() => {
    if (p.autoFocus) focusFirst(root.current);
  }, [p.autoFocus]);

  const toggle = (d: Degree) => {
    if (disabled) return;
    const next = toggleDegree(degrees, d) as Degree[];
    picks.current = next.includes(d)
      ? [...picks.current.filter((x) => x !== d), d]
      : picks.current.filter((x) => x !== d);
    if (next.includes(d)) audio.playNote(tonic + degreeSemis(d), { dur: 0.5 });
    onChange(next);
    setPrefix(null);
  };
  const undo = () => {
    if (disabled || degrees.length === 0) return;
    const last = picks.current.filter((d) => degrees.includes(d as Degree)).at(-1) ?? degrees.at(-1);
    picks.current = picks.current.filter((d) => d !== last);
    onChange(degrees.filter((d) => d !== last));
  };
  const runMidis = () => scaleRun(degrees, spec.tonic);

  const onKey = (e: React.KeyboardEvent<HTMLElement>): boolean => {
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    if (e.key === "-" || e.key === "b") {
      setPrefix("flat");
      return true;
    }
    if (e.key === "+" || e.key === "#") {
      setPrefix("sharp");
      return true;
    }
    if (e.key === "p" || e.key === "P") {
      if (degrees.length) run(runMidis());
      return true;
    }
    const n = digitOf(e);
    if (n !== null) {
      const d = degreeForDigit(n, set, prefix);
      setPrefix(null);
      if (d) {
        toggle(d);
        root.current?.querySelector<HTMLButtonElement>(`[data-degree="${d}"]`)?.focus();
      }
      return d !== null || n <= 7;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      undo();
      return true;
    }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
      const list = [...(root.current?.querySelectorAll<HTMLButtonElement>("[data-degree]") ?? [])];
      const at = list.indexOf(document.activeElement as HTMLButtonElement);
      if (at < 0) return false;
      const next = (at + (e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1) + list.length) % list.length;
      list[next]?.focus();
      return true;
    }
    return false;
  };

  const marks = degrees.map((_, i) => {
    const mk = markOf(feedback, i);
    return mk ? mk.ok : null;
  });
  const anyAltered = set.some((d) => d.length > 1);
  return (
    <AnswerFrame
      kind="scale-builder"
      idBase={p.idBase}
      label={p.label}
      feedback={feedback}
      disabled={disabled}
      onSubmit={p.onSubmit}
      onKey={onKey}
      keys={
        <>
          <KeyHint keys={["1–7"]}>add or take out</KeyHint>
          {anyAltered ? <KeyHint keys={["-", "+"]}>♭ / ♯ first</KeyHint> : null}
          <KeyHint keys={["⌫"]}>undo</KeyHint>
          <KeyHint keys={["P"]}>play the scale</KeyHint>
          <SubmitHint />
        </>
      }
    >
      <div ref={root} className="flex min-w-0 flex-col gap-2">
        {/* biome-ignore lint/a11y/useSemanticElements: toggle buttons in the degree colours; native checkboxes cannot take this layout */}
        <div
          role="group"
          aria-label={`Degrees above ${nameDisplay(spec.tonic)}`}
          className="flex flex-wrap gap-2"
        >
          {set.map((d, i) => {
            const on = degrees.includes(d);
            const st = degreeStyle(d, theme);
            const at = degrees.indexOf(d);
            const mark = at < 0 ? null : markOf(feedback, at);
            const name = spellDegreeName(spec.tonic, d);
            const sounding = lit === tonic + degreeSemis(d) || lit === tonic + degreeSemis(d) + 12;
            return (
              <button
                key={d}
                type="button"
                data-degree={d}
                aria-pressed={on}
                aria-disabled={disabled || undefined}
                aria-label={`${degreeSpoken(d)}${showSyllables ? `, ${syllableOfDegree(d)}` : ""}${name ? `, ${nameDisplay(name).replace("♭", " flat").replace("♯", " sharp")}` : ""}${on ? ", in your scale" : ""}${mark ? (mark.ok ? ", right" : ", not this one") : ""}${answer.has(d) ? ", in the answer" : ""}`}
                tabIndex={i === 0 ? 0 : -1}
                onClick={() => toggle(d)}
                className={clsx(
                  "relative flex h-14 min-w-14 flex-col items-center justify-center rounded-card border-2 px-2 font-semibold tabular-nums",
                  on ? "border-text" : "border-transparent opacity-55 hover:opacity-80",
                  mark?.ok === true && "ring-2 ring-accent",
                  mark?.ok === false && "ring-2 ring-issue",
                  sounding && "brightness-110",
                  answer.has(d) && "outline-2 outline-dashed outline-offset-2 outline-accent-2",
                )}
                style={{
                  background: degreeBackgroundCss(st),
                  color: st.label,
                  ...(st.outline && !on ? { borderColor: st.outline } : {}),
                }}
              >
                <span className="text-lg leading-none">{degreeDisplay(d)}</span>
                <span className="mt-1 text-[0.7rem] leading-none font-medium">
                  {showSyllables ? syllableOfDegree(d) : name ? nameDisplay(name) : ""}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            data-enter="native"
            icon={<Play aria-hidden className="size-4" />}
            disabled={degrees.length === 0}
            onClick={() => run(runMidis())}
          >
            Play the scale
          </Button>
          <Button
            size="sm"
            variant="ghost"
            data-enter="native"
            icon={<RotateCcw aria-hidden className="size-4" />}
            disabled={disabled || (degrees.length === 0 && !spec.from)}
            onClick={() => {
              picks.current = [];
              onChange(scaleStart(spec));
            }}
          >
            {spec.from ? "Start again" : "Clear"}
          </Button>
        </div>
        <BuiltLine
          degrees={degrees}
          tonic={spec.tonic}
          showDegrees
          showSyllables={showSyllables}
          marks={marks}
        />
        <MoveLine spec={spec} degrees={degrees} named={env.facts === true && feedback.state === "correct"} />
        <p className="sr-only" aria-live="polite">
          {prefix ? `${prefix} — now a digit` : ""}
        </p>
      </div>
    </AnswerFrame>
  );
}
