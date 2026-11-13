// The form map (Wave 5 panel "form", tb.lens.form at U09.L02; ux form map; docs/design/wave5.md §4.4): the shape
// of the song by letters (A B A B), every section with its bars, what plays in it and how much energy it has, the
// energy curve across the song with the section boundaries, and how the first two kinds of section differ (the
// contrast axes the `contrast` rule grades). Each section loops on a click. With no `arrange()` it says how to write
// one; when the arranged tracks disagree it says where.
import type { FormView } from "@oak/grader";
import type { FormViewSection, SectionLoop } from "../lib/form-view.ts";
import { sectionLoopOf } from "../lib/form-view.ts";
import {
  CONTRAST_WORDS,
  cutText,
  energyPath,
  type FormCut,
  firstContrast,
  formLetters,
  letterNamed,
  sectionBarsText,
} from "./lines.ts";

export interface FormMapProps {
  form: FormView | null;
  sections: readonly FormViewSection[];
  problem: string | null;
  loop: SectionLoop | null;
  onLoop(loop: SectionLoop | null): void;
  currentBar: number | null;
  pickup: boolean;
  /** The song is longer than the bars analysed: the map shows those bars and says what it leaves out. */
  cut?: FormCut | null;
}

const W = 300;
const H = 56;

export function FormMap(p: FormMapProps) {
  const title = (
    <h3 className="oak-wb-panel-title">
      <span className="oak-muted">Form</span>{" "}
      {p.sections.length > 0 ? <span data-testid="form-letters">{formLetters(p.sections)}</span> : null}
    </h3>
  );
  if (p.problem)
    return (
      <section className="oak-wb-panel oak-form-map" aria-label="Form" data-testid="form-map">
        {title}
        <p data-testid="form-map-problem">
          <strong>The tracks disagree about the sections.</strong> {p.problem}
        </p>
        <p className="oak-muted">
          Give every labelled track one arrange() with the same bars, in the same order.
        </p>
      </section>
    );
  if (p.form?.kind !== "sections" || p.sections.length === 0)
    return (
      <section className="oak-wb-panel oak-form-map" aria-label="Form" data-testid="form-map" data-empty="1">
        {title}
        <p>
          No sections yet. Name each part of a track as a const, then play them in order with one arrange():
        </p>
        <pre className="oak-form-example">
          <code>{"drums: arrange([4, drumsVerse], [4, drumsChorus])"}</code>
        </pre>
        {p.form?.kind === "through" && p.form.letters ? (
          <p className="oak-muted" data-testid="form-phrases">
            Its four-bar phrases read {p.form.letters.split("").join(" ")}.
          </p>
        ) : null}
      </section>
    );
  const form = p.form;
  const cut = p.cut ?? null;
  const total = Math.max(1, cut ? cut.bars : form.totalBars);
  const d = energyPath(form.energy, W, H, total);
  const contrast = firstContrast(form);
  const isLooped = (s: FormViewSection) =>
    p.loop !== null && p.loop.from === s.startBar && p.loop.bars === s.bars;
  return (
    <section className="oak-wb-panel oak-form-map" aria-label="Form" data-testid="form-map">
      {title}
      <p className="oak-muted oak-wb-panel-note">
        {p.sections.length} sections, {total} bars. Click a section to loop it.
      </p>
      {cut ? (
        <p className="oak-wb-panel-note" role="note" data-testid="form-cut">
          {cutText(cut)}
        </p>
      ) : null}
      <svg
        viewBox={`0 0 ${W} ${H + 4}`}
        className="oak-form-curve"
        role="img"
        aria-label={`Energy across the song: ${p.sections.map((s) => `${s.text} ${Math.round(s.energy * 100)}%`).join(", ")}`}
        data-testid="form-energy"
      >
        {p.sections.map((s) => (
          <rect
            key={`${s.tag}-${s.startBar}`}
            x={(s.startBar / total) * W}
            y={0}
            width={(s.bars / total) * W}
            height={H}
            className="oak-form-band"
            data-letter={s.letter}
          />
        ))}
        {p.sections.slice(1).map((s) => (
          <line
            key={`b-${s.startBar}`}
            x1={(s.startBar / total) * W}
            x2={(s.startBar / total) * W}
            y1={0}
            y2={H}
            className="oak-form-boundary"
          />
        ))}
        <path d={d} className="oak-energy-line" />
        {p.currentBar !== null ? (
          <line
            x1={((p.currentBar + 0.5) / total) * W}
            x2={((p.currentBar + 0.5) / total) * W}
            y1={0}
            y2={H}
            className="oak-form-now"
          />
        ) : null}
      </svg>
      <ol className="oak-form-sections" data-testid="form-sections">
        {p.sections.map((s) => {
          const looped = isLooped(s);
          return (
            <li key={`${s.tag}-${s.startBar}`} data-letter={s.letter}>
              <button
                type="button"
                className="oak-toggle oak-toggle--small"
                aria-pressed={looped}
                onClick={() => p.onLoop(looped ? null : sectionLoopOf(s))}
                title={looped ? "Stop looping this section" : "Loop this section"}
              >
                {letterNamed(s) ? (
                  <b>{s.text}</b>
                ) : (
                  <>
                    <b>{s.letter}</b> {s.text}
                  </>
                )}
              </button>
              <span className="oak-muted"> {sectionBarsText(s, p.pickup)}</span>
              <span className="oak-form-tracks">
                {" "}
                · {s.tracks.length > 0 ? s.tracks.join(", ") : "silence"}
              </span>
              <meter
                className="oak-form-meter"
                aria-label={`${s.text} energy`}
                min={0}
                max={100}
                value={Math.round(s.energy * 100)}
              />
            </li>
          );
        })}
      </ol>
      {contrast ? (
        <p data-testid="form-contrast">
          {contrast.axes.length === 0 ? (
            <>
              <b>
                {contrast.a} and {contrast.b}
              </b>{" "}
              sound alike: change the density, the register or what plays to set them apart.
            </>
          ) : (
            <>
              <b>
                {contrast.b} against {contrast.a}:
              </b>{" "}
              {contrast.axes.map((a) => CONTRAST_WORDS[a]).join("; ")}.
            </>
          )}
        </p>
      ) : null}
    </section>
  );
}
