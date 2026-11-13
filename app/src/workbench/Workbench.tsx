// <Workbench> (architecture §2.2, ux §3.4–§3.6): the Strudel editor (one EditorHandle from the adapter,
// mounted from an effect keyed on the editor ID: never an inline ref callback, spike S2), the TransportBar,
// the PianoRoll and the StaffView (stacked from 760 px, tabs below), an optional Keyboard and the
// FeedbackPanel, all linked through one HighlightBus per instance. The roll and the staff come from the
// static analysis path (the browser grader host), so they show code that has not been played; while it
// plays, the adapter's paint clock drives the playhead and the highlights.
import type { ChordLensId, LensId } from "@oak/api";
import type {
  GradeResult,
  HintLadder,
  HintRung,
  KeySpec,
  LintContext,
  PickupSpec,
  UnlockableId,
} from "@oak/content-kit";
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
import {
  HIGHLIGHT_MS,
  TUTOR_BARS_EVENT,
  TUTOR_HIGHLIGHT_EVENT,
  type TutorHighlight,
} from "../tutor/context.ts";
import { CircleOfFifths } from "./CircleOfFifths.tsx";
import { WorkbenchClock } from "./clock.ts";
import { FeedbackPanel, viewOf } from "./FeedbackPanel.tsx";
import { ghostEvents, marksOf, unlocks } from "./feedback.ts";
import { chordTonePercent, rangeLines } from "./harmony.ts";
import { HighlightBus } from "./highlight-bus.ts";
import { Keyboard } from "./Keyboard.tsx";
import { KeyPanel } from "./KeyPanel.tsx";
import { TYPING_MAP, typedMidi } from "./keyboard-layout.ts";
import { type LensSource, useAppLensSource, useLensSourceKind } from "./lens-source.tsx";
import { type StaffLabelMode, showsSwitcher, viewLabels } from "./lens-view.ts";
import {
  clampRegion,
  defaultRegion,
  type LoopRegion,
  type RegionStep,
  regionLabel,
  stepRegion,
} from "./loop-math.ts";
import { Metronome } from "./metronome.ts";
import { activeAt, keyAtCycle, leadEvents, pieceKeys, type WorkbenchModel } from "./model.ts";
import { PianoRoll, type RollColorMode, type RollLabelMode } from "./PianoRoll.tsx";
import {
  chordDisplay,
  initialPanelState,
  PANEL_SWITCHES,
  type PanelId,
  type PanelState,
  panelAvailability,
  readStoredPanels,
  writeStoredPanels,
} from "./panels.ts";
import { FOLLOW_PAGE_BARS } from "./roll-layout.ts";
import { StaffView } from "./StaffView.tsx";
import { useWorkbenchServices } from "./services.tsx";
import { TransportBar, type TransportLenses } from "./TransportBar.tsx";
import {
  isSilenced,
  nextPracticeTempo,
  type PracticeTempo,
  toggleMute,
  toggleSolo,
} from "./transport-math.ts";
import { tutorHighlightEvents } from "./tutor-highlight.ts";
import { useAB } from "./use-ab.ts";
import { useAnalysis } from "./use-analysis.ts";
import { useKeyPreview } from "./use-key-preview.ts";
import { useLoopPlayback } from "./use-loop.ts";
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
  /**
   * The roll's colours and labels. Naming `labels` (a lesson step's `ui.rollLabels`) makes the content decide:
   * the lenses do not apply and their switches are hidden. Without it the shared lenses decide (Wave 3).
   */
  roll?: { color?: RollColorMode; labels?: RollLabelMode };
  /**
   * The staff and its lines; `labels` (a step's `ui.staffLabels`) makes the content decide, as for the roll.
   * `kind: "lead"` shows the staff as a lead sheet (a step's `panels.staff: "lead"`, U07.L09).
   */
  staff?: { kind?: StaffKind; labels?: StaffLabelMode };
  /** A declared pickup (contracts §6.11): bar 0 is the pickup bar on the staff, the lead sheet and the chord band. */
  pickup?: PickupSpec | null;
  /**
   * Draw the editable regions of a code-modify step as target boxes, redrawn after every edit from the editor's
   * live ranges (`EditorHandle.editableRanges()`, wave4.md §3.5). Default off.
   */
  targetRegions?: boolean;
  /**
   * The lens source: by default the app's shared lenses (under a QueryClient) or a `WorkbenchLensProvider`;
   * `null` turns the lenses off (the Wave 2 labels).
   */
  lenses?: LensSource | null;
  /** Offer the key-signature panel and the circle of fifths once unlocked (lens mode, not mini). Default true. */
  panels?: boolean;
  /** The tab shown first when roll and staff are tabbed (narrow or short): default the roll. */
  initialTab?: ViewTab;
  /**
   * Panels open at first (the Toolbox's feature pages; a lesson step's `ui.initialPanels` through
   * `initialPanelsOf` in app/src/lib/panels.ts); otherwise the viewer's last choice. Wave 4 widens the IDs to
   * content-kit `WorkbenchPanelId`; a panel the Workbench does not draw yet is ignored.
   */
  initialPanels?: Partial<Record<PanelId, boolean>>;
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
  /**
   * Names of the A/B sides when the target is not a grading target (Studio's "this version" against an
   * earlier one). With these and no `feedback`, a plain A/B strip replaces the feedback panel.
   */
  abLabels?: { a: string; b: string };
  /** Loop region and metronome (ux §7.10 `L`, `[`/`]`, `M`). Default on, except in the mini variant. */
  loopControls?: boolean;
  /** Long loops: the roll shows this many bars at a time and follows the playhead. Default 16; 0 = off. */
  rollFollowBars?: number;
  /**
   * Follow the tutor's bar references (`[[bars 2-3]]` → `TUTOR_BARS_EVENT`): loop those bars here. For the one
   * Workbench a surface writes in (Studio, the capstone, a lesson's Make). Default off.
   */
  tutorBars?: boolean;
  /** The loop region changed (on/off or bars), e.g. to remember it. */
  onLoopChange?(loop: { on: boolean; region: LoopRegion }): void;
  /** Mutes to start with (a sketch's saved Band mutes). Read when the editor is created. */
  initialMutes?: MuteMap;
  /** The learner changed a mute or solo chip. */
  onMutes?(mutes: MuteMap): void;
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

/** The chord-lens switches (Wave 4): label, key and title. */
const CHORD_SWITCHES: readonly { id: ChordLensId; label: string; keys: string; title: string }[] = [
  {
    id: "chordSymbols",
    label: "Chords",
    keys: "Shift+H",
    title: "Chord symbols on the chord band and the staff",
  },
  { id: "romanNumerals", label: "Numerals", keys: "Shift+R", title: "Roman numerals in the key" },
];

export function Workbench(props: WorkbenchProps) {
  const kind = useLensSourceKind();
  if (props.lenses !== undefined) return <WorkbenchView {...props} source={props.lenses} />;
  if (kind === "app") return <AppLensWorkbench {...props} />;
  return <WorkbenchView {...props} source={kind} />;
}

function AppLensWorkbench(props: WorkbenchProps) {
  const source = useAppLensSource();
  return <WorkbenchView {...props} source={source} />;
}

function WorkbenchView(props: WorkbenchProps & { source: LensSource | null }) {
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
  const [mutes, setMutes] = useState<MuteMap>(props.initialMutes ?? NO_MUTES);
  const [practice, setPractice] = useState<PracticeTempo>(1);
  const [width, setWidth] = useState(1024);
  const [availHeight, setAvailHeight] = useState(Number.POSITIVE_INFINITY);
  const [tab, setTab] = useState<ViewTab>(props.initialTab ?? "roll");
  const [typing, setTyping] = useState(false);
  const [octave, setOctave] = useState(4);
  const [pressed, setPressed] = useState<ReadonlySet<number>>(new Set());
  /** What the last Run said about the code it ran: an error (friendly text) or "ran, but silent". */
  const [runIssue, setRunIssue] = useState<RunIssue | null>(null);
  const variant = props.variant ?? "full";
  const meter = METERS[props.lessonCtx.meter];
  const loopBars = props.lessonCtx.loopBars;
  const loopControls = (props.loopControls ?? true) && variant !== "mini";
  const [loopOn, setLoopOn] = useState(false);
  const [regionRaw, setRegion] = useState<LoopRegion>(() => defaultRegion(loopBars));
  const region = clampRegion(regionRaw, loopBars);
  const [metronomeOn, setMetronomeOn] = useState(false);
  // A lead sheet is drawn from the analysed staff (its melody and the chords); the analysis engraves the full one.
  const staffKind: StaffKind = props.staff?.kind === "lead" ? "auto" : (props.staff?.kind ?? "auto");

  const views = useMemo(() => {
    const wanted = variant === "mini" ? (["roll"] as MusicView[]) : (props.views ?? ["roll", "staff"]);
    return clampViews(wanted, { early: isEarlyUnit(props.unit) });
  }, [props.views, props.unit, variant]);

  // The Band parts heard: the step's tracks, less the ones muted here (the chord band reads only these).
  const bandHeard = props.band ? props.band.tracks.filter((r) => !mutes.muted.has(`band.${r}`)) : null;
  const analysis = useAnalysis(grader, code, {
    bandHeard,
    bars: loopBars,
    meter: props.lessonCtx.meter,
    key: props.lessonCtx.key,
    lint: props.lint,
    band: props.band ?? null,
    staff: views.includes("staff") ? staffKind : false,
    staffLabels: props.staff?.labels === "counts" ? "counts" : "none",
    debounceMs: props.analysisDebounceMs ?? 300,
    pickup: props.pickup ?? null,
  });
  const model = analysis.model;
  const keySpec: KeySpec | null = model?.key ?? props.lessonCtx.key;

  // --- labels: the lenses or the content (wave3.md §4.3) -------------------------------------------
  const source = props.source;
  const labels = viewLabels({
    ...(props.roll?.labels === undefined ? {} : { rollLabels: props.roll.labels }),
    ...(props.roll?.color === undefined ? {} : { rollColor: props.roll.color }),
    ...(props.staff?.labels === undefined ? {} : { staffLabels: props.staff.labels }),
    lenses: source,
    ...(source ? { rollSetting: source.rollSetting } : {}),
    hasKey: (model?.key ?? null) !== null,
  });
  const chordLenses = labels.mode === "lenses" ? (source?.chords ?? null) : null;
  const chordLensBar =
    variant !== "mini" &&
    chordLenses !== null &&
    (chordLenses.available.chordSymbols || chordLenses.available.romanNumerals);
  const lensBar = variant !== "mini" && (showsSwitcher(source, labels.mode) || chordLensBar);
  const unlockedSet = props.lint.unlocked as ReadonlySet<string>;
  // Panels: the lenses decide outside a step, the step's `initialPanels` inside one (wave4.md §4.4).
  const panelMode: "lenses" | "content" = labels.mode === "lenses" && source !== null ? "lenses" : "content";
  const panelAvailable = panelAvailability({
    mode: panelMode,
    allowed: (props.panels ?? true) && variant !== "mini",
    unlocked: unlockedSet,
    initial: props.initialPanels,
    hasStaff: views.includes("staff"),
    hasRoll: views.includes("roll"),
  });
  const [panelPrefs, setPanelPrefs] = useState<PanelState>(() =>
    initialPanelState(readStoredPanels(), props.initialPanels, panelMode),
  );
  const panelsOpen = Object.fromEntries(
    (Object.keys(panelPrefs) as PanelId[]).map((id) => [id, panelAvailable[id] && panelPrefs[id]]),
  ) as PanelState;
  const togglePanel = (id: PanelId) => {
    if (!panelAvailable[id]) return;
    setPanelPrefs((p) => {
      const next = { ...p, [id]: !p[id] };
      // Only the viewer's own choice outside a step is remembered; a step's panels are the step's.
      if (panelMode === "lenses") writeStoredPanels({ ...readStoredPanels(), ...next } as PanelState);
      return next;
    });
  };
  const toggleLens = (id: LensId) => {
    if (!source || !lensBar || !source.available[id]) return;
    source.toggle(id);
  };
  const toggleChordLens = (id: ChordLensId) => {
    if (!chordLenses || !chordLensBar || !chordLenses.available[id]) return;
    chordLenses.toggle(id);
  };
  const chords = chordDisplay(panelMode, panelsOpen, chordLenses, unlockedSet);
  // The lead sheet: a step that asks for it (`staff.kind: "lead"`), or the learner's switch.
  const leadSheet = props.staff?.kind === "lead" || panelsOpen.lead;

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

  // The tutor's references ([[bars:3-4]], [[note:F#4]], a review's bar chip) light the learner's notes on the
  // roll, the staff and in the code for HIGHLIGHT_MS, unless the learner points at something else meanwhile.
  useEffect(() => {
    if (variant === "mini") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onHighlight = (e: Event) => {
      const h = (e as CustomEvent<TutorHighlight>).detail;
      const m = modelRef.current;
      if (!h || !m) return;
      const ids = tutorHighlightEvents(m.events, h, m.pickup !== null);
      if (ids.length === 0) return;
      bus.hover({ events: ids }, "feedback");
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (bus.get().hover.source === "feedback") bus.hover(null, "feedback");
      }, HIGHLIGHT_MS);
    };
    window.addEventListener(TUTOR_HIGHLIGHT_EVENT, onHighlight);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(TUTOR_HIGHLIGHT_EVENT, onHighlight);
    };
  }, [bus, variant]);

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
  // The grade's marks, plus (when the host asks) the editable regions as target boxes from the editor's live
  // ranges: after an edit the box is drawn where the region is now, not where the starter had it.
  const targetRegions = props.targetRegions === true;
  const [targetText, setTargetText] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!handle || handle.disposed) return;
    const live = targetRegions ? handle.editableRanges() : null;
    const targets = live && live.length > 0 ? live : [];
    handle.setMarks([...marks.code, ...targets.map((range) => ({ range, kind: "target" as const }))]);
    setTargetText(targetRegions ? targets.map((r) => `${r.from}-${r.to}`).join(" ") : undefined);
  }, [handle, marks, code, targetRegions]);

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
          // A Run while the loop region is on: the new code takes over the loop (the editor itself
          // started playing; the loop player replaces it).
          if (loopOnRef.current) setTimeout(() => loopRef.current.handOver(outcome.code), 0);
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
    if (p.initialMutes) h.setMutes(p.initialMutes);
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

  // --- the key now: the bar that plays (a patterned .scale() changes key), else the piece's first ---------
  const [keyBar, setKeyBar] = useState(0);
  useEffect(
    () =>
      clock.subscribe((f) => {
        const bars = modelRef.current?.bars ?? 1;
        const bar = f.playing && bars > 0 ? Math.floor(f.audibleCycle % bars) : 0;
        setKeyBar((b) => (b === bar ? b : bar));
      }),
    [clock],
  );
  const keyNow = model ? (keyAtCycle(model.keySpans, keyBar) ?? model.key) : keySpec;
  const keysOfPiece = useMemo(() => (model ? pieceKeys(model.keySpans) : []), [model]);
  const anyPanel = panelsOpen.key || panelsOpen.circle;
  const preview = useKeyPreview({
    oak,
    handle,
    pieceKey: model?.keySpans[0]?.key ?? null,
    bars: loopBars,
    cps: model?.cps ?? 0.5,
    lint: props.lint,
    readOnly: props.readOnly === true,
    band: props.band ?? null,
    mutes,
  });
  const previewRef = useRef(preview);
  previewRef.current = preview;
  // Closing the panels (or leaving) ends a preview.
  useEffect(() => {
    if (!anyPanel) previewRef.current.stop();
  }, [anyPanel]);

  // --- transport --------------------------------------------------------------------------------
  const ab = useAB({
    oak,
    handle,
    target: props.target && props.target.audible !== "never" ? props.target.code : null,
    bars: loopBars,
    cps: model?.cps ?? 0.5,
  });

  // --- loop region and metronome (ux §3.4, §7.10) ------------------------------------------------
  const loop = useLoopPlayback({
    oak,
    handle,
    clock,
    onPosition: (position) => {
      const m = playedModel.current ?? modelRef.current;
      if (m) bus.setPlaying(activeAt(m, position));
    },
    onStopped: () => bus.setPlaying([]),
    lint: props.lint,
    loopBars,
    band: props.band ?? null,
    mutes,
    region,
    rate: practice,
  });
  const loopOnRef = useRef(loopOn);
  loopOnRef.current = loopOn;
  const loopRef = useRef({
    handOver: (_code: string) => {},
  });
  loopRef.current.handOver = (code: string) => {
    if (!loopOnRef.current || !handle || handle.disposed) return;
    if (handle.playing || loop.playing) void loop.start(code);
  };
  const anyPlaying = playing || loop.playing;

  const metronome = useMemo(() => new Metronome(oak, meter), [oak, meter]);
  useEffect(() => {
    if (metronomeOn) metronome.start();
    else metronome.stop();
    return () => metronome.stop();
  }, [metronome, metronomeOn]);

  const reportLoop = (on: boolean, r: LoopRegion) => propsRef.current.onLoopChange?.({ on, region: r });
  const toggleLoop = () => {
    const on = !loopOn;
    setLoopOn(on);
    reportLoop(on, region);
    if (!handle || handle.disposed) return;
    if (on && handle.playing) void loop.start(handle.getCode());
    else if (!on && loop.playing) {
      loop.stop();
      void handle.play();
    }
  };
  const stepLoop = (step: RegionStep) => {
    const next = stepRegion(region, step, loopBars);
    setRegion(next);
    reportLoop(loopOn, next);
  };
  const canStep = (step: RegionStep) => {
    const next = stepRegion(region, step, loopBars);
    return next.from !== region.from || next.bars !== region.bars;
  };
  // The tutor's bar references loop those bars (1-based, inclusive) in this Workbench.
  const tutorBars = props.tutorBars === true && loopControls;
  useEffect(() => {
    if (!tutorBars) return;
    const onBars = (e: Event) => {
      const d = (e as CustomEvent<{ from: number; to: number }>).detail;
      if (!d || !Number.isFinite(d.from) || !Number.isFinite(d.to)) return;
      const next = clampRegion({ from: d.from - 1, bars: d.to - d.from + 1 }, loopBars);
      setRegion(next);
      setLoopOn(true);
      propsRef.current.onLoopChange?.({ on: true, region: next });
      if (handle && !handle.disposed && handle.playing) void loop.start(handle.getCode());
    };
    window.addEventListener(TUTOR_BARS_EVENT, onBars);
    return () => window.removeEventListener(TUTOR_BARS_EVENT, onBars);
  });

  const onToggle = useCallback(async () => {
    if (!handle) return;
    if (ab?.active) ab.stop();
    if (previewRef.current.playing || previewRef.current.pending) {
      previewRef.current.stop();
      return;
    }
    setBusy(true);
    try {
      await oak.unlock();
      if (loop.playing) loop.stop();
      else if (handle.playing) handle.stop();
      else if (loopOn) await loop.start(handle.getCode());
      else await handle.play();
    } finally {
      setBusy(false);
    }
  }, [handle, oak, ab, loop, loopOn]);

  const applyMutes = (next: MuteMap) => {
    setMutes(next);
    handle?.setMutes(next);
    propsRef.current.onMutes?.(next);
  };
  const onPracticeTempo = () => {
    const next = nextPracticeTempo(practice);
    setPractice(next);
    if (playing && model) oak.transport.setCps(model.cps * next);
    // While looping, the player's rate follows (use-loop.ts).
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
  const anyPanelAvailable = PANEL_SWITCHES.some((p) => panelAvailable[p.id]);
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
    // Loop region and metronome (ux §7.10): L, [ ], Shift+[ Shift+], M. Not in text fields.
    const textField = target.closest?.("input, select, textarea, [contenteditable]");
    // The lens bar (Wave 3): D degrees, S solfège, Shift+N note names, Shift+K key panel, Shift+C circle; Wave 4:
    // Shift+H chord symbols, Shift+R numerals, Shift+F function, Shift+T chord tones, Shift+G range, Shift+L lead.
    if (!typing && !textField && !ev.repeat && (lensBar || anyPanelAvailable)) {
      const lens: LensId | null =
        !ev.shiftKey && k === "d"
          ? "degrees"
          : !ev.shiftKey && k === "s"
            ? "solfege"
            : ev.shiftKey && k === "n"
              ? "noteNames"
              : null;
      if (lens && lensBar && source?.available[lens]) {
        ev.preventDefault();
        toggleLens(lens);
        return;
      }
      const chordLens: ChordLensId | null =
        ev.shiftKey && k === "h" ? "chordSymbols" : ev.shiftKey && k === "r" ? "romanNumerals" : null;
      if (chordLens && chordLensBar && chordLenses?.available[chordLens]) {
        ev.preventDefault();
        toggleChordLens(chordLens);
        return;
      }
      const panel = ev.shiftKey
        ? (PANEL_SWITCHES.find((p) => p.keys === `Shift+${k.toUpperCase()}`)?.id ?? null)
        : null;
      if (panel && panelAvailable[panel]) {
        ev.preventDefault();
        togglePanel(panel);
        return;
      }
    }
    if (loopControls && !typing && !textField && !ev.repeat) {
      const code = ev.code;
      const bracket =
        code === "BracketLeft" || ev.key === "[" || ev.key === "{"
          ? "left"
          : code === "BracketRight" || ev.key === "]" || ev.key === "}"
            ? "right"
            : null;
      if (k === "l" && !ev.shiftKey) {
        ev.preventDefault();
        toggleLoop();
        return;
      }
      if (k === "m" && !ev.shiftKey) {
        ev.preventDefault();
        setMetronomeOn((on) => !on);
        return;
      }
      if (bracket) {
        ev.preventDefault();
        stepLoop(
          bracket === "left" ? (ev.shiftKey ? "earlier" : "shrink") : ev.shiftKey ? "later" : "extend",
        );
        return;
      }
    }
    if (k === "k" && !ev.shiftKey && !typing && showKeyboard) {
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

  const lensSwitches: TransportLenses = {
    labels:
      lensBar && source
        ? [
            ...(source.available.degrees
              ? [
                  {
                    id: "degrees",
                    label: "Degrees",
                    on: source.shown.degrees,
                    keys: "D",
                    title: "Degree numbers on every note",
                  },
                ]
              : []),
            ...(source.available.solfege
              ? [
                  {
                    id: "solfege",
                    label: "Solfège",
                    on: source.shown.solfege,
                    keys: "S",
                    title: "Movable-do syllables",
                  },
                ]
              : []),
            {
              id: "noteNames",
              label: "Names",
              on: source.shown.noteNames,
              keys: "Shift+N",
              title: "Note names",
            },
            ...(chordLensBar && chordLenses
              ? CHORD_SWITCHES.filter((c) => chordLenses.available[c.id]).map((c) => ({
                  ...c,
                  on: chordLenses.shown[c.id],
                }))
              : []),
          ]
        : [],
    panels: PANEL_SWITCHES.filter((p) => panelAvailable[p.id]).map((p) => ({ ...p, on: panelsOpen[p.id] })),
    onToggle: (id) => {
      if (PANEL_SWITCHES.some((p) => p.id === id)) togglePanel(id as PanelId);
      else if (id === "chordSymbols" || id === "romanNumerals") toggleChordLens(id);
      else toggleLens(id as LensId);
    },
  };
  const stale = !anyPlaying || (model !== null && model.code !== playedCode);
  const evalError = analysis.error && analysis.errorCode === code ? analysis.error : null;
  // The Run's own error wins (it is what Strudel said); otherwise the static analysis's, made friendly.
  const issue = runIssue && runIssue.code === code ? runIssue : null;
  const banner: { message: string; detail: string } | null =
    issue?.kind === "error"
      ? issue
      : evalError
        ? evalError.kind === "timeout"
          ? { message: "That took too long — infinite loop or huge pattern?", detail: evalError.message }
          : evalError.kind === "lint"
            ? // Oak's own lint already speaks to the learner ("`stack` unlocks in U04.L03"); the Strudel-error
              // rewording would misread a locked mini-notation operator as a typo.
              { message: evalError.message, detail: evalError.message }
            : friendlyEvalError(evalError.message, code, evalError.pos ?? null)
        : null;
  const silent =
    !banner &&
    (issue?.kind === "silent" ||
      (model !== null && model.code === code && model.events.length === 0 && !analysis.pending));
  const silenced = useCallback((t: string) => isSilenced(mutes, t), [mutes]);
  const tracks = model?.tracks ?? [];
  const harmony = model?.harmony ?? null;
  const ranges = useMemo(
    () => (model && panelsOpen.range ? rangeLines(model.events) : null),
    [model, panelsOpen.range],
  );
  const lead = useMemo(() => (model && leadSheet ? leadEvents(model) : null), [model, leadSheet]);
  const chordSet = useMemo(
    () => ({ symbols: chords.symbols || leadSheet, romans: chords.romans }),
    [chords.symbols, chords.romans, leadSheet],
  );

  const renderView = (v: MusicView) => {
    if (!model)
      return <p className="oak-muted">{analysis.pending ? "Reading the code…" : "No music yet."}</p>;
    if (v === "roll")
      return (
        <PianoRoll
          model={model}
          bus={bus}
          clock={clock}
          color={labels.color}
          labels={labels.gutter}
          noteLabels={labels.note}
          hover={labels.hover}
          ghosts={ghosts}
          barMarks={marks.barMarks}
          silenced={silenced}
          onAudition={(e) => e.midi !== null && audition(e.midi)}
          stale={stale}
          height={variant === "mini" ? 60 : 180}
          {...(chords.band && harmony
            ? {
                chordBand: {
                  regions: harmony.regions,
                  source: harmony.source,
                  symbols: chords.symbols,
                  romans: chords.romans,
                  fn: chords.fn,
                  pickup: Boolean(props.pickup),
                },
              }
            : {})}
          {...(panelsOpen["chord-tones"]
            ? {
                chordTones: {
                  marks: harmony?.melody ?? new Map(),
                  percent: chordTonePercent(harmony),
                  strong: harmony?.strong ?? null,
                },
              }
            : {})}
          {...(ranges ? { ranges } : {})}
          {...(variant !== "mini" && (props.rollFollowBars ?? FOLLOW_PAGE_BARS) > 0
            ? { followBars: props.rollFollowBars ?? FOLLOW_PAGE_BARS }
            : {})}
        />
      );
    if (v === "staff")
      return (
        <StaffView
          model={model}
          bus={bus}
          stale={stale}
          hover={labels.hover}
          annotations={labels.staff}
          chordSet={chordSet}
          {...(lead ? { lead } : {})}
        />
      );
    return null;
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: workbench-level shortcuts (ux §7.10)
    <div
      ref={rootRef}
      className={`oak-workbench oak-workbench--${variant} oak-layout--${layout}`}
      data-testid="workbench"
      data-editor-id={id}
      data-playing={anyPlaying ? "1" : "0"}
      data-loop={loopOn ? `${region.from + 1}-${region.from + region.bars}` : undefined}
      data-looping={loop.playing ? "1" : "0"}
      data-metronome={metronomeOn ? "1" : "0"}
      data-analysis={analysis.pending ? "pending" : model ? "ready" : "none"}
      data-labels={labels.mode}
      data-lenses={
        labels.mode === "lenses"
          ? (["degree", "solfege", "noteName"] as const).filter((k) => labels.note[k]).join(" ")
          : undefined
      }
      data-key={keyNow ? `${keyNow.tonic} ${keyNow.mode}` : undefined}
      data-panels={(Object.keys(panelsOpen) as PanelId[]).filter((p) => panelsOpen[p]).join(" ")}
      data-chords={[
        chords.symbols ? "symbols" : "",
        chords.romans ? "romans" : "",
        chords.fn ? "function" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-targets={targetText}
      // Focusable (not a tab stop) so a click on the roll or the staff gives the workbench its keys.
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
    >
      <div className="oak-wb-editor">
        <div ref={editorRoot} className="oak-editor-root" data-testid="editor-root" />
      </div>
      <TransportBar
        playing={anyPlaying}
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
        {...(lensBar || anyPanelAvailable ? { lenses: lensSwitches } : {})}
        {...(loopControls
          ? {
              loop: {
                on: loopOn,
                label: regionLabel(region),
                onToggle: toggleLoop,
                onStep: stepLoop,
                can: {
                  shrink: canStep("shrink"),
                  extend: canStep("extend"),
                  earlier: canStep("earlier"),
                  later: canStep("later"),
                },
              },
              metronome: { on: metronomeOn, onToggle: () => setMetronomeOn((on) => !on) },
            }
          : {})}
      />
      {props.toolbar ? <div className="oak-wb-toolbar">{props.toolbar}</div> : null}
      {banner ? (
        <div className="oak-banner" role="status" data-testid="eval-banner">
          <p>
            <strong>Code didn't run.</strong> {banner.message}
            {model ? (
              <span className="oak-muted">
                {anyPlaying
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
              {activeTab === "both" && model
                ? musicViews.map((v) => <div key={v}>{renderView(v)}</div>)
                : renderView(activeTab === "both" ? "roll" : activeTab)}
            </div>
          </>
        ) : model ? (
          musicViews.map((v) => <div key={v}>{renderView(v)}</div>)
        ) : (
          // Nothing to draw yet: one line, not one per view side by side.
          <div>{renderView(musicViews[0] ?? "roll")}</div>
        )}
        {showKeyboard ? (
          <Keyboard
            model={model}
            keySpec={keySpec}
            bus={bus}
            onAudition={audition}
            typing={typing}
            pressed={pressed}
            degrees={labels.keyboardDegrees}
          />
        ) : null}
      </div>
      {anyPanel ? (
        <div className={`oak-wb-panels${panelsOpen.key && panelsOpen.circle ? " oak-wb-panels--two" : ""}`}>
          <div className="oak-wb-panels-grid">
            {panelsOpen.key ? <KeyPanel current={keyNow} keys={keysOfPiece} preview={preview} /> : null}
            {panelsOpen.circle ? (
              <CircleOfFifths current={keyNow} keys={keysOfPiece} preview={preview} />
            ) : null}
          </div>
        </div>
      ) : null}
      {variant !== "mini" && !fb && props.target && props.abLabels ? (
        ab ? (
          <ABStrip ab={ab} labels={props.abLabels} />
        ) : null
      ) : variant !== "mini" && (fb || props.target) ? (
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

/** A/B outside grading (Studio: this version against an earlier one): two sides, the side that plays now. */
function ABStrip({
  ab,
  labels,
}: {
  ab: NonNullable<ReturnType<typeof useAB>>;
  labels: { a: string; b: string };
}) {
  return (
    <section className="oak-ab-strip" aria-label="Compare versions" data-testid="ab-controls">
      <button
        type="button"
        className="oak-ab-btn"
        aria-pressed={ab.active === "A"}
        onClick={ab.playA}
        data-testid="ab-a"
      >
        A · {labels.a}
        {ab.pendingSide === "A" ? " …" : ""}
      </button>
      <button
        type="button"
        className="oak-ab-btn"
        aria-pressed={ab.active === "B"}
        onClick={ab.playB}
        data-testid="ab-b"
      >
        B · {labels.b}
        {ab.pendingSide === "B" ? " …" : ""}
      </button>
      {ab.active ? (
        <span className="oak-muted" data-testid="ab-now" aria-live="polite">
          Now playing {ab.active === "A" ? `A · ${labels.a}` : `B · ${labels.b}`}
          {" · "}
          <button type="button" className="oak-ab-btn" onClick={ab.stop}>
            Stop
          </button>
        </span>
      ) : (
        <span className="oak-muted">Switches on the next bar line. Keys: A and B.</span>
      )}
    </section>
  );
}
