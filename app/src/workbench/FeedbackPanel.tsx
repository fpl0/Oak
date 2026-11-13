// FeedbackPanel (ux §3.5–§3.7): renders a GradeResult redacted to the current hint rung (`toIssueView`, the
// one implementation of the redaction matrix): the summary, per-dimension facet chips, issue rows placed
// at bar/beat with their code ranges (click: select the token and the notes), the hint ladder, and the
// A/B "hear the difference" controls once the rung allows them.
import type { Diagnostic, GradeResult, GradeView, HintLadder, HintRung } from "@oak/content-kit";
import { toIssueView } from "@oak/content-kit";
import { rungName, summaryText, unlocks, visibleHints, whereText } from "./feedback.ts";
import type { HighlightBus } from "./highlight-bus.ts";

export interface ABControls {
  /** Which side plays now. */
  active: "A" | "B" | null;
  /** A switch waits for the next downbeat. */
  pendingSide: "A" | "B" | null;
  playA(): void;
  playB(): void;
  stop(): void;
}

export interface FeedbackPanelProps {
  result: GradeResult | null;
  rung: HintRung;
  hintPending?: boolean;
  passed?: boolean;
  ladder?: HintLadder | null;
  onRequestHint?: () => void;
  render?: (d: Diagnostic) => string;
  bus: HighlightBus;
  abAudible?: "always" | "fromHint2" | "never";
  ab?: ABControls | null;
  /** An issue row was activated: loop that bar. */
  onIssueBar?: (bar: number) => void;
  /** Names of the A/B sides ("Your sound" / "The sound to match"); default "yours" / "target". */
  abLabels?: { a: string; b: string };
}

/**
 * A grader message with `code` spans: the backticked parts drawn as inline code, never as raw backticks
 * ("`.lpf()`: yours is brighter…").
 */
export function InlineCode({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g).filter((p) => p !== "");
  return (
    <>
      {parts.map((p, i) =>
        p.length > 2 && p.startsWith("`") && p.endsWith("`") ? (
          <code key={i} className="oak-inline-code">
            {p.slice(1, -1)}
          </code>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

const DIM_LABEL: Partial<Record<string, string>> = {
  pitch: "Pitch",
  rhythm: "Rhythm",
  duration: "Length",
  contour: "Contour",
  bass: "Bass",
  root: "Root",
  quality: "Quality",
  rn: "Numeral",
  harmonicRhythm: "Harmonic rhythm",
  rubric: "Rules",
  constraints: "Code",
};

/** The result's own rendered message for a diagnostic (same ID and place). */
function messageOf(result: GradeResult, d: Diagnostic): string | null {
  return (
    result.messages.find(
      (m) => m.id === d.id && m.where?.bar === d.where?.bar && m.where?.beat === d.where?.beat,
    )?.text ?? null
  );
}

/**
 * The redacted view. Catalog text comes from `render` (@oak/grader `renderFeedback`); when it cannot
 * render a code (it throws or echoes the ID), the result's own message is used.
 */
export function viewOf(
  result: GradeResult,
  rung: HintRung,
  opts: { passed?: boolean; render?: (d: Diagnostic) => string },
): GradeView {
  const custom = opts.render;
  const render = (d: Diagnostic): string => {
    if (custom) {
      try {
        const text = custom(d);
        if (text && text !== d.id) return text;
      } catch {
        // fall through to the result's message
      }
    }
    return messageOf(result, d) ?? d.id;
  };
  return toIssueView(result, rung, {
    ...(opts.passed === undefined ? {} : { passed: opts.passed }),
    render,
  });
}

export function FeedbackPanel(props: FeedbackPanelProps) {
  const { result, rung, bus } = props;
  if (!result) {
    const free = unlocks(rung, { ...(props.abAudible === undefined ? {} : { abAudible: props.abAudible }) });
    return (
      <section className="oak-feedback" data-testid="feedback-panel" aria-label="Feedback">
        <p className="oak-muted">Run your code to check it.</p>
        {props.ab && free.ab ? <ABButtons ab={props.ab} labels={props.abLabels ?? null} /> : null}
      </section>
    );
  }
  const view = viewOf(result, rung, {
    ...(props.passed === undefined ? {} : { passed: props.passed }),
    ...(props.render ? { render: props.render } : {}),
  });
  const can = unlocks(rung, {
    ...(props.abAudible === undefined ? {} : { abAudible: props.abAudible }),
    ...(props.passed === undefined ? {} : { passed: props.passed }),
  });
  const hints = visibleHints(props.ladder, rung);

  return (
    <section
      className="oak-feedback"
      data-testid="feedback-panel"
      data-status={view.status}
      data-rung={rung}
      aria-label="Feedback"
    >
      <header className="oak-feedback-head">
        <strong data-testid="feedback-summary">{summaryText(view)}</strong>
        <span className="oak-muted"> · score {Math.round(view.score * 100)}%</span>
      </header>
      {view.facets.length > 0 ? (
        <ul className="oak-facets" aria-label="Checks">
          {view.facets.map((f) => (
            <li key={f.dim} className={f.score >= 0.999 ? "oak-chip ok" : "oak-chip"} data-dim={f.dim}>
              {f.score >= 0.999 ? "✓" : "✗"} {DIM_LABEL[f.dim] ?? f.dim}
              {f.n !== undefined && f.score < 0.999 ? ` ${Math.round(f.score * f.n)}/${f.n}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {view.issues.length > 0 ? (
        <ol className="oak-issues">
          {view.issues.map((issue, i) => (
            <li
              key={`${i}-${issue.where.bar ?? "x"}-${issue.where.beat ?? "x"}`}
              data-severity={issue.severity}
            >
              <button
                type="button"
                className="oak-issue-row"
                data-testid="issue-row"
                onClick={() => {
                  const sel = {
                    ...(issue.where.noteIds ? { events: issue.where.noteIds } : {}),
                    ...(issue.where.code ? { code: issue.where.code } : {}),
                  };
                  bus.select(sel.events || sel.code ? sel : null, "feedback");
                  if (issue.where.bar !== undefined) props.onIssueBar?.(issue.where.bar);
                }}
              >
                <span className="oak-issue-where">{whereText(issue)}</span>
                {issue.what ? (
                  <span className="oak-issue-what">
                    {" "}
                    · <InlineCode text={issue.what} />
                  </span>
                ) : null}
                {issue.fix ? (
                  <span className="oak-issue-fix">
                    {" "}
                    → <InlineCode text={issue.fix} />
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ol>
      ) : null}
      {view.rubric && view.rubric.length > 0 ? (
        <ul className="oak-facets" aria-label="Rules">
          {view.rubric.map((r) => (
            <li key={r.ruleId} className={r.ok ? "oak-chip ok" : "oak-chip"}>
              {r.ok ? "✓" : "○"} {r.ruleId}
              {r.required ? " (required)" : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {hints.length > 0 ? (
        <ol className="oak-hints" aria-label="Hints">
          {hints.map((h) => (
            <li key={h.rung} data-rung={h.rung}>
              <span className="oak-muted">{rungName(h.rung)}:</span>{" "}
              {h.hint === "auto" ? "The full answer is on the roll and in the code." : h.hint.text}
            </li>
          ))}
        </ol>
      ) : null}
      <footer className="oak-feedback-foot">
        {props.onRequestHint && can.nextLabel && view.status !== "pass" ? (
          <button
            type="button"
            onClick={props.onRequestHint}
            disabled={props.hintPending}
            data-testid="hint-button"
          >
            Hint: {can.nextLabel}
          </button>
        ) : null}
        {props.ab && can.ab ? <ABButtons ab={props.ab} labels={props.abLabels ?? null} /> : null}
        {can.ghosts && view.ghosts.length > 0 ? (
          <span className="oak-muted" data-testid="ghost-note-count">
            {view.ghosts.length} target note{view.ghosts.length === 1 ? "" : "s"} shown dashed on the roll
          </span>
        ) : null}
      </footer>
    </section>
  );
}

function ABButtons({ ab, labels }: { ab: ABControls; labels: { a: string; b: string } | null }) {
  const a = `A · ${labels?.a ?? "yours"}`;
  const b = `B · ${labels?.b ?? "target"}`;
  return (
    <span className="oak-ab" data-testid="ab-controls">
      <button type="button" aria-pressed={ab.active === "A"} onClick={ab.playA} data-testid="ab-a">
        {a}
        {ab.pendingSide === "A" ? " …" : ""}
      </button>
      <button type="button" aria-pressed={ab.active === "B"} onClick={ab.playB} data-testid="ab-b">
        {b}
        {ab.pendingSide === "B" ? " …" : ""}
      </button>
      {ab.active ? (
        <span className="oak-ab-now" data-testid="ab-now">
          {ab.active === "A" ? a : b}
          <button type="button" onClick={ab.stop}>
            Stop
          </button>
        </span>
      ) : null}
    </span>
  );
}
