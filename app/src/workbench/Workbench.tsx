// <Workbench> (architecture §2.2, ux §3.4–§3.6): the Strudel editor (one EditorHandle from the adapter,
// mounted from an effect keyed on the editor ID: never an inline ref callback, spike S2), the TransportBar,
// the PianoRoll and the StaffView (stacked from 760 px, tabs below), an optional Keyboard and the
// FeedbackPanel, all linked through one HighlightBus per instance. The roll and the staff come from the
// static analysis path (the browser grader host), so they show code that has not been played; while it
// plays, the adapter's paint clock drives the playhead and the highlights.
import type { GradeResult, HintLadder, HintRung, KeySpec, LintContext, UnlockableId } from "@oak/content-kit";
import type { StaffKind } from "@oak/notation";
import {
  type BandSetup,
  type EditorHandle,
  type EditorOptions,
  type EvalOutcome,
  editorId,
  friendlyEvalError,
  type LessonCtx,
  type MuteMap,
  NO_MUTES,
} from "@oak/strudel";
import { METERS } from "@oak/theory";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WorkbenchClock } from "./clock.ts";
import { FeedbackPanel, viewOf } from "./FeedbackPanel.tsx";
import { ghostEvents, marksOf, unlocks } from "./feedback.ts";
import { HighlightBus } from "./highlight-bus.ts";
import { Keyboard } from "./Keyboard.tsx";
import { TYPING_MAP, typedMidi } from "./keyboard-layout.ts";
import { activeAt, type WorkbenchModel } from "./model.ts";
import { PianoRoll, type RollColorMode, type RollLabelMode } from "./PianoRoll.tsx";
import { StaffView } from "./StaffView.tsx";
import { useWorkbenchServices } from "./services.tsx";
import { TransportBar } from "./TransportBar.tsx";
import {
  isSilenced,
  nextPracticeTempo,
  type PracticeTempo,
  toggleMute,
  toggleSolo,
} from "./transport-math.ts";
import { useAB } from "./use-ab.ts";
import { useAnalysis } from "./use-analysis.ts";
import { clampViews, isEarlyUnit, layoutFor, type MusicView, type ViewTab } from "./views.ts";

export interface WorkbenchFeedback {
  result: GradeResult | null;
  rung: HintRung;
  /** True once the step has passed: nothing is redacted. */
  passed?: boolean;
  ladder?: HintLadder | null;
  hintPending?: boolean;
  /** Pressing Hint (the server advances the rung: `steps.hint`). */
  onRequestHint?: () => void;
}

export interface WorkbenchProps {
  /** Editor slug: the editor ID is `oak_${id}_${n}_`. Unique per page. */
  id: string;
  n?: number;
  /** Initial (clean) code. A later change of this prop replaces the editor text. */
  code: string;
  lessonCtx: LessonCtx;
  lint: LintContext;
  /** Which music views to show, in order. Default roll + staff. */
  views?: MusicView[];
  /** A unit or lesson ID: U00–U04 show at most two of roll, staff and keyboard. */
  unit?: string;
  variant?: "full" | "compact" | "mini";
  readOnly?: EditorOptions["readOnly"];
  /** Hidden backing tracks (mutable, never editable). */
  band?: BandSetup | null;
  roll?: { color?: RollColorMode; labels?: RollLabelMode };
  staff?: { kind?: StaffKind; labels?: "none" | "degree" | "solfege" | "counts" };
  feedback?: WorkbenchFeedback;
  /** A/B target, played as hidden code. */
  target?: { code: string; audible: "always" | "fromHint2" | "never" } | null;
  /** The sound the keyboard and Alt+click audition with. Default "piano". */
  auditionSound?: string;
  analysisDebounceMs?: number;
  onChange?(code: string): void;
  onEvaluated?(outcome: EvalOutcome): void;
  onModel?(model: WorkbenchModel): void;
  /** Start playing as soon as the editor exists (Listen QA). */
  autoPlay?: boolean;
  /** Extra controls rendered at the end of the transport row. */
  toolbar?: ReactNode;
}

interface RunIssue {
  code: string;
  kind: "error" | "silent";
  message: string;
  detail: string;
}

function runIssueOf(outcome: EvalOutcome): RunIssue | null {
  const error = outcome.diagnostics.find((d) => d.severity === "error");
  if (!outcome.ok && error) {
    const detail = error.params.detail;
    return {
      code: outcome.code,
      kind: "error",
      message: error.message,
      detail: typeof detail === "string" ? detail : "",
    };
  }
  if (outcome.ok && outcome.diagnostics.some((d) => d.id === "eval.silent"))
    return { code: outcome.code, kind: "silent", message: "", detail: "" };
  return null;
}

const sameUnlocked = (a: ReadonlySet<UnlockableId>, b: ReadonlySet<UnlockableId>) =>
  a.size === b.size && [...a].every((x) => b.has(x));

export function Workbench(props: WorkbenchProps) {
  const { oak, grader, renderFeedback } = useWorkbenchServices();
  const bus = useMemo(() => new HighlightBus(), []);
  const clock = useMemo(() => new WorkbenchClock(), []);
  const rootRef = useRef<HTMLDivElement>(null);
  const editorRoot = useRef<HTMLDivElement>(null);
  const [code, setCode] = useState(props.code);
  const [handle, setHandle] = useState<EditorHandle | null>(null);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [playedCode, setPlayedCode] = useState<string | null>(null);
  const [mutes, setMutes] = useState<MuteMap>(NO_MUTES);
  const [practice, setPractice] = useState<PracticeTempo>(1);
  const [width, setWidth] = useState(1024);
  const [availHeight, setAvailHeight] = useState(Number.POSITIVE_INFINITY);
  const [tab, setTab] = useState<ViewTab>("roll");
  const [typing, setTyping] = useState(false);
  const [octave, setOctave] = useState(4);
  const [pressed, setPressed] = useState<ReadonlySet<number>>(new Set());
  /** What the last Run said about the code it ran: an error (friendly text) or "ran, but silent". */
  const [runIssue, setRunIssue] = useState<RunIssue | null>(null);
  const variant = props.variant ?? "full";
  const meter = METERS[props.lessonCtx.meter];
  const loopBars = props.lessonCtx.loopBars;
  const staffKind: StaffKind = props.staff?.kind ?? "auto";

  const views = useMemo(() => {
    const wanted = variant === "mini" ? (["roll"] as MusicView[]) : (props.views ?? ["roll", "staff"]);
    return clampViews(wanted, { early: isEarlyUnit(props.unit) });
  }, [props.views, props.unit, variant]);

  const analysis = useAnalysis(grader, code, {
    bars: loopBars,
    meter: props.lessonCtx.meter,
    key: props.lessonCtx.key,
    lint: props.lint,
    band: props.band ?? null,
    staff: views.includes("staff") ? staffKind : false,
    staffLabels: props.staff?.labels ?? "none",
    debounceMs: props.analysisDebounceMs ?? 300,
  });
  const model = analysis.model;
  const keySpec: KeySpec | null = model?.key ?? props.lessonCtx.key;

  // The model of the code that is playing (the clock highlights that, not an unplayed edit).
  const playedModel = useRef<WorkbenchModel | null>(null);
  if (model && model.code === playedCode) playedModel.current = model;
  const modelRef = useRef(model);
  modelRef.current = model;

  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    bus.setEvents(model?.events ?? [], model?.abc ?? null);
    if (model) propsRef.current.onModel?.(model);
  }, [bus, model]);

  // --- feedback → views -------------------------------------------------------------------------
  const fb = props.feedback;
  const gradeView = useMemo(
    () =>
      fb?.result
        ? viewOf(fb.result, fb.rung, {
            ...(fb.passed === undefined ? {} : { passed: fb.passed }),
            ...(renderFeedback ? { render: renderFeedback } : {}),
          })
        : null,
    [fb?.result, fb?.rung, fb?.passed, renderFeedback],
  );
  const marks = useMemo(() => marksOf(gradeView), [gradeView]);
  const can = unlocks(fb?.rung ?? 0, {
    abAudible: props.target?.audible ?? "fromHint2",
    ...(fb?.passed === undefined ? {} : { passed: fb.passed }),
  });
  const ghosts = useMemo(() => (can.ghosts ? ghostEvents(gradeView) : []), [can.ghosts, gradeView]);
  useEffect(() => bus.setIssues(marks.issues), [bus, marks]);
  useEffect(() => {
    handle?.setMarks(marks.code);
  }, [handle, marks]);

  // --- the editor (stable lifecycle: created once per ID, disposed on unmount) --------------------
  const id = editorId(props.id, props.n ?? 0);
  const suppressCursor = useRef<string | null>(null);
  const practiceRef = useRef(practice);
  practiceRef.current = practice;
  useEffect(() => {
    const el = editorRoot.current;
    if (!el) return;
    const p = propsRef.current;
    const opts: EditorOptions = {
      id,
      initialCode: p.code,
      lessonCtx: p.lessonCtx,
      lint: p.lint,
      band: p.band ?? null,
      hooks: {
        onCursor: (range) => {
          const key = `${range.from}:${range.to}`;
          if (suppressCursor.current === key) return;
          suppressCursor.current = null;
          bus.select({ code: [range] }, "code");
        },
      },
      onChange: (next) => {
        setCode(next);
        propsRef.current.onChange?.(next);
      },
      onEvaluated: (outcome) => {
        setRunIssue(runIssueOf(outcome));
        if (outcome.ok) {
          setPlayedCode(outcome.code);
          analysis.analyzeNow(outcome.code);
          if (outcome.cps !== null && practiceRef.current !== 1)
            oak.transport.setCps(outcome.cps * practiceRef.current);
        }
        propsRef.current.onEvaluated?.(outcome);
      },
      onToggle: (on) => {
        setPlaying(on);
        if (!on) {
          clock.stop();
          bus.setPlaying([]);
        }
      },
      onPaint: (frame) => {
        clock.tick(frame.audibleCycle);
        const m = playedModel.current ?? modelRef.current;
        if (m) bus.setPlaying(activeAt(m, frame.audibleCycle));
      },
    };
    if (p.readOnly !== undefined) opts.readOnly = p.readOnly;
    const h = oak.createEditor(el, opts);
    setHandle(h);
    if (p.autoPlay) {
      void oak.unlock().then(() => {
        if (!h.disposed) void h.play();
      });
    }
    return () => {
      setHandle(null);
      clock.stop();
      bus.setPlaying([]);
      h.dispose();
    };
    // The editor lives as long as its ID; everything else reaches it through refs and handle calls.
  }, [oak, id, bus, clock]);

  // Prop changes reach the live editor without re-creating it.
  useEffect(() => {
    if (!handle || handle.disposed) return;
    if (props.code !== handle.getCode()) {
      handle.setCode(props.code);
      setCode(props.code);
    }
  }, [handle, props.code]);
  useEffect(() => {
    if (handle && !handle.disposed) handle.setEditable(props.readOnly);
  }, [handle, props.readOnly]);
  useEffect(() => {
    if (handle && !handle.disposed) handle.setBand(props.band ?? null);
  }, [handle, props.band]);
  const lastUnlocked = useRef(props.lint.unlocked);
  useEffect(() => {
    if (!handle || handle.disposed) return;
    if (!sameUnlocked(lastUnlocked.current, props.lint.unlocked)) handle.setUnlocked(props.lint.unlocked);
    lastUnlocked.current = props.lint.unlocked;
  }, [handle, props.lint.unlocked]);

  // Roll / staff / feedback → code: hover flashes the range, a selection focuses it.
  useEffect(() => {
    if (!handle) return;
    let prev = bus.get();
    return bus.subscribe((s) => {
      if (handle.disposed) return;
      if (s.hover !== prev.hover && s.hover.source !== "code" && s.hover.code.length > 0) {
        handle.flashRanges(s.hover.code);
      }
      if (s.selected !== prev.selected && s.selected.source !== "code" && s.selected.code.length > 0) {
        const first = s.selected.code[0];
        if (first) suppressCursor.current = `${first.from}:${first.to}`;
        handle.focusRanges(s.selected.code);
        // Mirror what the editor really selected (tests and devtools read it).
        const main = handle.view.state.selection.main;
        rootRef.current?.setAttribute(
          "data-editor-selection",
          `${main.from}-${main.to}:${handle.view.state.doc.sliceString(main.from, main.to)}`,
        );
      }
      prev = s;
    });
  }, [bus, handle]);

  // --- transport --------------------------------------------------------------------------------
  const ab = useAB({
    oak,
    handle,
    target: props.target && props.target.audible !== "never" ? props.target.code : null,
    bars: loopBars,
    cps: model?.cps ?? 0.5,
  });

  const onToggle = useCallback(async () => {
    if (!handle) return;
    if (ab?.active) ab.stop();
    setBusy(true);
    try {
      await oak.unlock();
      if (handle.playing) handle.stop();
      else await handle.play();
    } finally {
      setBusy(false);
    }
  }, [handle, oak, ab]);

  const applyMutes = (next: MuteMap) => {
    setMutes(next);
    handle?.setMutes(next);
  };
  const onPracticeTempo = () => {
    const next = nextPracticeTempo(practice);
    setPractice(next);
    if (playing && model) oak.transport.setCps(model.cps * next);
  };

  const audition = useCallback(
    (midi: number) => {
      void oak
        .unlock()
        .then(() => oak.playNote({ s: propsRef.current.auditionSound ?? "piano", note: midi, dur: 0.6 }));
    },
    [oak],
  );

  // --- layout -----------------------------------------------------------------------------------
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    // The height the workbench lives in: the viewport under the shell's header (the <main> top).
    const measureHeight = () => {
      const main = el.closest("main");
      const top = main ? Math.max(0, main.getBoundingClientRect().top) : 0;
      setAvailHeight(Math.floor(window.innerHeight - top));
    };
    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0]?.contentRect.width ?? 1024);
      if (w > 0) setWidth(w);
      measureHeight();
    });
    ro.observe(el);
    window.addEventListener("resize", measureHeight);
    measureHeight();
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measureHeight);
    };
  }, []);
  const layout = layoutFor(width, availHeight);
  const musicViews: MusicView[] = views.filter((v) => v !== "keyboard");
  const showKeyboard = views.includes("keyboard");
  const tabs: ViewTab[] = musicViews.length > 1 ? [...musicViews, "both"] : musicViews;
  const activeTab: ViewTab = tabs.includes(tab) ? tab : (tabs[0] ?? "roll");
  const tabIds = `${id}tab`;
  const onTabKey = (ev: React.KeyboardEvent<HTMLButtonElement>) => {
    const i = tabs.indexOf(activeTab);
    const next =
      ev.key === "ArrowRight"
        ? tabs[(i + 1) % tabs.length]
        : ev.key === "ArrowLeft"
          ? tabs[(i - 1 + tabs.length) % tabs.length]
          : ev.key === "Home"
            ? tabs[0]
            : ev.key === "End"
              ? tabs[tabs.length - 1]
              : undefined;
    if (!next) return;
    ev.preventDefault();
    ev.stopPropagation();
    setTab(next);
    document.getElementById(`${tabIds}-${next}`)?.focus();
  };

  // Workbench shortcuts (not inside the editor): A/B, Shift+A, K typing keyboard, Z/X octave.
  const onKeyDown = (ev: React.KeyboardEvent<HTMLDivElement>) => {
    const target = ev.target as Element;
    if (target.closest?.(".cm-editor") || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const k = ev.key.toLowerCase();
    // ux §7.10 Workbench keys: Space plays/stops (never on a focused control, which Space activates), F focuses
    // the editor, T steps the practice tempo, R/N pick the Roll/Staff tab when the views are tabbed.
    const onControl = target.closest?.(
      "button, a, input, select, textarea, summary, [role=tab], [contenteditable], [data-oak-events]",
    );
    if (!typing && !onControl && !ev.shiftKey && !ev.repeat) {
      if (ev.key === " ") {
        ev.preventDefault();
        void onToggle();
        return;
      }
      if (k === "f" && handle && !handle.disposed) {
        ev.preventDefault();
        handle.view.focus();
        return;
      }
      if (k === "t") {
        ev.preventDefault();
        onPracticeTempo();
        return;
      }
      if (layout === "tabs" && (k === "r" || k === "n") && musicViews.length > 1) {
        const want: MusicView = k === "r" ? "roll" : "staff";
        if (musicViews.includes(want)) {
          ev.preventDefault();
          setTab(want);
          return;
        }
      }
    }
    if (k === "k" && !typing && showKeyboard) {
      setTyping(true);
      ev.preventDefault();
      return;
    }
    if (typing) {
      if (ev.key === "Escape") setTyping(false);
      else if (k === "z") setOctave((o) => Math.max(1, o - 1));
      else if (k === "x") setOctave((o) => Math.min(7, o + 1));
      else if (k in TYPING_MAP) {
        const midi = typedMidi(k, keySpec, octave);
        if (midi !== null && !ev.repeat) {
          audition(midi);
          setPressed((p) => new Set([...p, midi]));
        }
      } else return;
      ev.preventDefault();
      return;
    }
    if (!ab || !can.ab) return;
    if (k === "a" && ev.shiftKey) ab.alternate();
    else if (k === "a") ab.playA();
    else if (k === "b") ab.playB();
    else return;
    ev.preventDefault();
  };
  const onKeyUp = (ev: React.KeyboardEvent<HTMLDivElement>) => {
    if (!typing) return;
    const midi = typedMidi(ev.key.toLowerCase(), keySpec, octave);
    if (midi !== null) setPressed((p) => new Set([...p].filter((m) => m !== midi)));
  };

  const stale = !playing || (model !== null && model.code !== playedCode);
  const evalError = analysis.error && analysis.errorCode === code ? analysis.error : null;
  // The Run's own error wins (it is what Strudel said); otherwise the static analysis's, made friendly.
  const issue = runIssue && runIssue.code === code ? runIssue : null;
  const banner: { message: string; detail: string } | null =
    issue?.kind === "error"
      ? issue
      : evalError
        ? evalError.kind === "timeout"
          ? { message: "That took too long — infinite loop or huge pattern?", detail: evalError.message }
          : friendlyEvalError(evalError.message, code, evalError.pos ?? null)
        : null;
  const silent =
    !banner &&
    (issue?.kind === "silent" ||
      (model !== null && model.code === code && model.events.length === 0 && !analysis.pending));
  const silenced = useCallback((t: string) => isSilenced(mutes, t), [mutes]);
  const tracks = model?.tracks ?? [];

  const renderView = (v: MusicView) => {
    if (!model)
      return <p className="oak-muted">{analysis.pending ? "Reading the code…" : "No music yet."}</p>;
    if (v === "roll")
      return (
        <PianoRoll
          model={model}
          bus={bus}
          clock={clock}
          {...(props.roll?.color ? { color: props.roll.color } : {})}
          {...(props.roll?.labels ? { labels: props.roll.labels } : {})}
          ghosts={ghosts}
          barMarks={marks.barMarks}
          silenced={silenced}
          onAudition={(e) => e.midi !== null && audition(e.midi)}
          stale={stale}
          height={variant === "mini" ? 60 : 180}
        />
      );
    if (v === "staff") return <StaffView model={model} bus={bus} stale={stale} />;
    return null;
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: workbench-level shortcuts (ux §7.10)
    <div
      ref={rootRef}
      className={`oak-workbench oak-workbench--${variant} oak-layout--${layout}`}
      data-testid="workbench"
      data-editor-id={id}
      data-playing={playing ? "1" : "0"}
      data-analysis={analysis.pending ? "pending" : model ? "ready" : "none"}
      // Focusable (not a tab stop) so a click on the roll or the staff gives the workbench its keys.
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
    >
      <div className="oak-wb-editor">
        <div ref={editorRoot} className="oak-editor-root" data-testid="editor-root" />
      </div>
      <TransportBar
        playing={playing}
        busy={busy || !handle}
        onToggle={() => void onToggle()}
        clock={clock}
        meter={meter}
        cps={model?.cps ?? null}
        cpsDefault={model ? !model.cpsSet : false}
        loopBars={loopBars}
        keySpec={keySpec}
        tracks={tracks}
        mutes={mutes}
        onMute={(t) => applyMutes(toggleMute(mutes, t))}
        onSolo={(t) => applyMutes(toggleSolo(mutes, t))}
        practiceTempo={practice}
        onPracticeTempo={onPracticeTempo}
        readOnly={props.readOnly === true}
      />
      {props.toolbar ? <div className="oak-wb-toolbar">{props.toolbar}</div> : null}
      {banner ? (
        <div className="oak-banner" role="status" data-testid="eval-banner">
          <p>
            <strong>Code didn't run.</strong> {banner.message}
            {model ? (
              <span className="oak-muted">
                {playing
                  ? " The last version that ran keeps playing."
                  : " Showing the last version that ran."}
              </span>
            ) : null}
          </p>
          {banner.detail && banner.detail !== banner.message ? (
            <details className="oak-banner-detail">
              <summary>Details</summary>
              <code>{banner.detail}</code>
            </details>
          ) : null}
        </div>
      ) : silent ? (
        <p className="oak-notice" role="status" data-testid="eval-silent">
          The code runs, but it plays no notes yet.
        </p>
      ) : null}
      <div className="oak-wb-views">
        {layout === "tabs" && musicViews.length > 1 ? (
          <>
            <div role="tablist" aria-label="Music views" className="oak-tabs">
              {tabs.map((v) => (
                <button
                  key={v}
                  id={`${tabIds}-${v}`}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === v}
                  aria-controls={`${tabIds}-panel`}
                  tabIndex={activeTab === v ? 0 : -1}
                  onClick={() => setTab(v)}
                  onKeyDown={onTabKey}
                  data-testid={`tab-${v}`}
                >
                  {v === "roll" ? "Roll" : v === "staff" ? "Staff" : "Both"}
                </button>
              ))}
            </div>
            <div
              role="tabpanel"
              id={`${tabIds}-panel`}
              aria-labelledby={`${tabIds}-${activeTab}`}
              className="oak-tabpanel"
            >
              {activeTab === "both"
                ? musicViews.map((v) => <div key={v}>{renderView(v)}</div>)
                : renderView(activeTab)}
            </div>
          </>
        ) : (
          musicViews.map((v) => <div key={v}>{renderView(v)}</div>)
        )}
        {showKeyboard ? (
          <Keyboard
            model={model}
            keySpec={keySpec}
            bus={bus}
            onAudition={audition}
            typing={typing}
            pressed={pressed}
          />
        ) : null}
      </div>
      {variant !== "mini" && (fb || props.target) ? (
        <FeedbackPanel
          result={fb?.result ?? null}
          rung={fb?.rung ?? 0}
          {...(fb?.hintPending === undefined ? {} : { hintPending: fb.hintPending })}
          {...(fb?.passed === undefined ? {} : { passed: fb.passed })}
          {...(fb?.ladder === undefined ? {} : { ladder: fb.ladder })}
          {...(fb?.onRequestHint ? { onRequestHint: fb.onRequestHint } : {})}
          {...(renderFeedback ? { render: renderFeedback } : {})}
          bus={bus}
          abAudible={props.target?.audible ?? "fromHint2"}
          ab={ab}
        />
      ) : null}
    </div>
  );
}
