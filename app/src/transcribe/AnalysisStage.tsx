// JC4's analysis stage (session 1; Wave 7) and J4.L04's reading of a standard, through the package's public
// exports: the standard's chart as the song gives it, the learner's Roman numeral under every chord, a bracket over
// every ii–V, and the form map on CF-T's strip (FormMapStrip), checked bar by bar (analysis.ts) and by section
// (`gradeFormMap`). Below the reveal no feedback names a numeral or a bracket that is right; "Show the analysis"
// is the last rung and the host records it as revealed. Keyboard: Tab through the numerals (Enter checks), Space on
// a bracket toggle, the form strip's own keys (X cuts, letters name).
import type { SongDef } from "@oak/content-kit";
import { gradeFormMap } from "@oak/grader";
import type { ChordSymbolStyle } from "@oak/notation";
import { clsx } from "clsx";
import { useId, useMemo, useState } from "react";
import { formatKey } from "../lib/format.ts";
import { Button } from "../ui/kit/Button.tsx";
import { Kbd } from "../ui/kit/basics.tsx";
import {
  type AnalysisAnswer,
  type AnalysisCheck,
  type AnalysisSource,
  chartSlots,
  checkAnalysis,
  keyAtBar,
  revealedAnalysis,
} from "./analysis.ts";
import { FormMapStrip } from "./FormMap.tsx";
import {
  emptyFormMap,
  type FormMap,
  formMapAnswer,
  formMapProblem,
  type SectionMark,
  sectionsOf,
  setLabel,
} from "./form-map.ts";
import { chartSymbolText } from "./jazz-chart.ts";

export interface AnalysisResult {
  check: AnalysisCheck;
  formPassed: boolean;
  revealed: boolean;
  answer: AnalysisAnswer;
  form: { sections: string[]; bars: number[] };
}

export function AnalysisStage({
  source,
  style = "lead-sheet",
  initial,
  onChecked,
  title = "The analysis",
}: {
  source: AnalysisSource;
  style?: ChordSymbolStyle;
  initial?: { answer?: AnalysisAnswer; form?: FormMap };
  /** Every check (and the reveal), for the host to keep or to record (JC4.S1's "the analysis check passed"). */
  onChecked?(r: AnalysisResult): void;
  title?: string;
}) {
  const id = useId();
  const slots = useMemo(() => chartSlots(source), [source]);
  const [numerals, setNumerals] = useState<string[]>(() => [...(initial?.answer?.numerals ?? [])]);
  const [brackets, setBrackets] = useState<number[]>(() => [...(initial?.answer?.brackets ?? [])]);
  const [form, setForm] = useState<FormMap>(() => initial?.form ?? emptyFormMap(source.bars));
  const [check, setCheck] = useState<AnalysisCheck | null>(null);
  const [formMarks, setFormMarks] = useState<Map<number, SectionMark> | null>(null);
  const [formText, setFormText] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [checks, setChecks] = useState(0);
  const shown = revealed ? revealedAnalysis(source) : null;

  const run = () => {
    const answer = { numerals, brackets };
    const problem = formMapProblem(form);
    const graded = problem
      ? null
      : gradeFormMap(formMapAnswer(form), { answerKey: { sections: source.sections } } as unknown as Pick<
          SongDef,
          "answerKey"
        >);
    const formPassed = graded?.passed ?? false;
    const c = checkAnalysis(source, answer, { formOk: formPassed });
    setCheck(c);
    setChecks((n) => n + 1);
    if (graded) {
      const marks = new Map<number, SectionMark>();
      form.cuts.forEach((cut, i) => {
        const row = graded.sections.find((r) => r.got?.bar === cut);
        marks.set(i, row?.ok ? "ok" : "issue");
      });
      setFormMarks(marks);
      setFormText(
        formPassed
          ? "The form is right."
          : "The form isn't right yet. Listen for where the opening tune comes back, and where something new starts.",
      );
    } else {
      setFormMarks(null);
      setFormText(problem);
    }
    onChecked?.({ check: c, formPassed, revealed: false, answer, form: formMapAnswer(form) });
  };

  const reveal = () => {
    const r = revealedAnalysis(source);
    setRevealed(true);
    const c = checkAnalysis(source, r, { formOk: true });
    setCheck(null);
    onChecked?.({
      check: c,
      formPassed: true,
      revealed: true,
      answer: r,
      form: {
        sections: source.sections.map((s) => s.label),
        bars: source.sections.map((s) => s.bars[0]),
      },
    });
  };

  const shownForm: FormMap | null = revealed
    ? {
        bars: source.bars,
        cuts: source.sections.map((s) => s.bars[0]),
        labels: source.sections.map((s) => s.label),
      }
    : null;
  const toggleBracket = (i: number) =>
    setBrackets((b) => (b.includes(i) ? b.filter((x) => x !== i) : [...b, i].sort((x, y) => x - y)));
  const activeBrackets = new Set(shown?.brackets ?? brackets);
  const wrong = check?.bars.filter((b) => !b.ok) ?? [];
  const lines = Array.from({ length: Math.ceil(source.bars / 4) }, (_, l) =>
    Array.from({ length: Math.min(4, source.bars - l * 4) }, (_, k) => l * 4 + k + 1),
  );

  return (
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-4" data-testid="analysis-stage">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`${id}-h`} className="text-h3">
          {title}
        </h2>
        <p className="text-sm text-text-3">
          In {formatKey(source.key)}. A numeral under each chord (ii7, V7/vi, ♭II7); a bracket over each ii–V.{" "}
          <Kbd>Enter</Kbd> checks.
        </p>
      </div>
      <FormMapStrip
        map={shownForm ?? form}
        onChange={revealed ? undefined : (m) => setForm(m)}
        marks={formMarks}
        label="The form map: cut where each section starts and name it"
        hint={formText ? <span data-testid="analysis-form-text">{formText}</span> : undefined}
      />
      {revealed ? null : (
        <div className="flex flex-col gap-1.5">
          <ol className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0">
            {sectionsOf(form).map((sec) => (
              <li key={sec.from} className="flex items-center gap-2 text-sm">
                <span className="tabular-nums text-text-2">
                  bars {sec.from}–{sec.to}
                </span>
                <input
                  aria-label={`Name of section ${sec.index + 1}, bars ${sec.from} to ${sec.to}`}
                  value={sec.label}
                  maxLength={24}
                  placeholder="A, B…"
                  onChange={(e) => setForm(setLabel(form, sec.index, e.target.value))}
                  className="h-8 w-20 rounded-control border border-control-border bg-control px-2 text-text focus-visible:outline-2 focus-visible:outline-accent"
                  data-testid="form-name"
                />
              </li>
            ))}
          </ol>
          <p className="text-sm text-text-3">
            On the strip: <Kbd>←</Kbd> <Kbd>→</Kbd> along the bar lines, <Kbd>Enter</Kbd> or <Kbd>X</Kbd> cuts
            or joins, <Kbd>A</Kbd>–<Kbd>H</Kbd> name the section; or click a bar line and type the names here.
          </p>
        </div>
      )}
      <div className="flex flex-col gap-1.5" data-testid="analysis-chart">
        {lines.map((line) => (
          <ol key={line[0]} className="m-0 grid list-none grid-cols-2 gap-1.5 p-0 lg:grid-cols-4">
            {line.map((bar) => {
              const inBar = slots.filter((s) => s.bar === bar);
              const result = check?.bars[bar - 1];
              const key = keyAtBar(source, bar);
              const keyChange = bar > 1 && formatKey(keyAtBar(source, bar - 1)) !== formatKey(key);
              return (
                <li
                  key={bar}
                  data-testid="analysis-bar"
                  data-mark={result ? (result.ok ? "ok" : "issue") : undefined}
                  className={clsx(
                    "flex min-w-0 flex-col gap-1 rounded-control border p-1.5",
                    result ? (result.ok ? "border-accent/60" : "border-issue") : "border-border",
                  )}
                >
                  <span className="flex items-baseline justify-between text-[0.75rem] text-text-3">
                    <span className="tabular-nums">Bar {bar}</span>
                    {keyChange ? <span className="text-text-2">now in {formatKey(key)}</span> : null}
                  </span>
                  <div className={clsx("grid gap-1", inBar.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
                    {inBar.map((s) => {
                      const inBracket = activeBrackets.has(s.index);
                      const endsBracket = activeBrackets.has(s.index - 1);
                      return (
                        <div key={s.index} className="flex min-w-0 flex-col gap-1">
                          <span
                            className={clsx(
                              "h-1.5 rounded-t-[3px] border-x-2 border-t-2",
                              inBracket && endsBracket
                                ? "border-accent-2"
                                : inBracket
                                  ? "border-r-0 border-accent-2"
                                  : endsBracket
                                    ? "border-l-0 border-accent-2"
                                    : "border-transparent",
                            )}
                            aria-hidden
                          />
                          <span className="truncate font-medium" data-testid="analysis-symbol">
                            {chartSymbolText(s.symbol, style)}
                          </span>
                          <label className="sr-only" htmlFor={`${id}-rn-${s.index}`}>
                            Bar {bar}
                            {inBar.length > 1 ? `, ${s === inBar[0] ? "first" : "second"} chord` : ""}: the
                            numeral of {chartSymbolText(s.symbol, "lead-sheet")}
                          </label>
                          <input
                            id={`${id}-rn-${s.index}`}
                            value={shown ? (shown.numerals[s.index] ?? "") : (numerals[s.index] ?? "")}
                            readOnly={revealed}
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="I–vii"
                            onChange={(e) => {
                              const next = [...numerals];
                              next[s.index] = e.target.value;
                              setNumerals(next);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                run();
                              }
                            }}
                            className="h-8 w-full min-w-0 rounded-control border border-control-border bg-control px-1.5 font-mono text-sm text-text read-only:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
                            data-testid="analysis-numeral"
                          />
                          <button
                            type="button"
                            aria-pressed={inBracket}
                            disabled={revealed || s.index === slots.length - 1}
                            onClick={() => toggleBracket(s.index)}
                            className="self-start rounded-control border border-border px-1.5 py-0.5 text-[0.75rem] text-text-2 hover:bg-surface-2 aria-pressed:border-accent-2 aria-pressed:bg-accent-2/12 aria-pressed:text-text disabled:opacity-40"
                            aria-label={`A ii–V from bar ${bar}'s ${chartSymbolText(s.symbol, "lead-sheet")} to the next chord`}
                            data-testid="analysis-bracket"
                          >
                            ii–V →
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ol>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={run} disabled={revealed} data-testid="analysis-check">
          Check the analysis
        </Button>
        {checks > 0 && !revealed ? (
          <Button variant="ghost" onClick={reveal} data-testid="analysis-reveal">
            Show the analysis
          </Button>
        ) : null}
        {check ? (
          <p className="text-sm" role="status" data-testid="analysis-summary">
            {check.passed && check.score === 1
              ? `${check.summary} The analysis is right.`
              : check.passed
                ? `${check.summary} That passes; ${wrong.length === 1 ? "the marked bar is" : "the marked bars are"} worth another look.`
                : check.summary}
          </p>
        ) : null}
        {revealed ? (
          <p className="text-sm text-text-2" role="status" data-testid="analysis-revealed">
            The analysis is shown. It won't count as a check you passed.
          </p>
        ) : null}
      </div>
      {wrong.length > 0 && !revealed ? (
        <ul
          className="m-0 flex list-none flex-col gap-1 p-0 text-sm text-text-2"
          data-testid="analysis-notes"
        >
          {wrong
            .flatMap((b) => b.notes)
            .map((n) => (
              <li key={n}>{n}</li>
            ))}
        </ul>
      ) : null}
    </section>
  );
}
