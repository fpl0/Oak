// The tutor subject store and the imperative tutor API (docs/design/wave2.md §3.4).
//
// Every surface tells the tutor what the learner is looking at with `setSubject` (and `patchSubject` as the code,
// result or rung change), and clears it on unmount with `clearSubject`. The panel (tutor-ui) renders the subject's
// context chips and timeline from this store, and runs the asks other surfaces queue with `askHint()`,
// `askExplain()`, `askListeningNote()`, `askReview()` and `askChat()`.
//
// The tutor is optional (contracts §10.1): when no backend is ready, or the subject has the tutor closed
// (a checkpoint, a drill trial), every ask is a no-op that returns `{ ok: false }` and sets a visible notice
// ("The tutor is off …") instead of failing silently. Nothing here calls the network: the panel streams.
import {
  countIssues,
  type GradeResult,
  type GradeSnapshot,
  type Health,
  type HintRung,
  type RawIssue,
  type SubjectRef,
  type ThreadKind,
  type TutorTurnRequest,
} from "@oak/api";
import { create } from "zustand";

/** One context chip: exactly what the next turn will carry (contracts §10.2, ux §6.2). */
export interface ContextChip {
  id: "step" | "code" | "result" | "hints" | "selection" | "sketch" | "capstone" | "track" | "transcription";
  label: string;
}

/** What the learner is looking at. Set by the surface that owns the screen. */
export interface TutorSubject {
  thread: SubjectRef;
  /** Learner-facing name of the subject ("U01.L02 · Count to four", "Sketch 012"). */
  title: string;
  /** False during a checkpoint and during drill trials (contracts §10.4): asks are refused with a notice. */
  tutorOpen: boolean;
  lessonId?: string;
  /** Local step ID (`S5`). */
  stepId?: string;
  /** Whether the current step is graded (hints and Reveal apply only then). */
  graded?: boolean;
  passed?: boolean;
  /** The editor's code now (clean, markers stripped). */
  code?: string | null;
  /** The latest check of this step, if any. */
  lastResult?: GradeResult | null;
  /** The server-side rung as last read (`StepState.rung`); the server stays authoritative. */
  rung?: HintRung;
  /** Selected code (Mod+I "Ask Claude about selection"). */
  selection?: string | null;
  sketchId?: string;
  capstoneId?: string;
}

export interface TutorAsk {
  id: number;
  kind: ThreadKind;
  request: TutorTurnRequest;
  /** What the panel shows as the learner's message ("Give me a nudge"). */
  label: string;
  at: number;
  /** The subject the ask is about, when it carries its own (a listening note, a review). */
  subject?: TutorSubject;
}

export type TutorAvailability = "unknown" | "ready" | "off";

export interface TutorNotice {
  kind: "off" | "closed" | "no-subject";
  message: string;
}

export type AskResult = { ok: true; ask: TutorAsk } | { ok: false; notice: TutorNotice };

export type ChipId = ContextChip["id"];

/**
 * Chips the learner may switch off for the next turns (ux §6.2 "click toggles inclusion"). Identity chips (the
 * step, the sketch, the capstone, the track, the transcription) name the thread itself and stay; the hint rung is
 * the server's own state and is not sent by the browser at all. A listening note is about the code, so its code
 * chip stays too.
 */
export const REMOVABLE_CHIPS: ReadonlySet<ChipId> = new Set<ChipId>(["code", "result", "selection"]);

export function chipRemovable(id: ChipId, kind: ThreadKind = "chat"): boolean {
  if (!REMOVABLE_CHIPS.has(id)) return false;
  if (kind === "listening" && id === "code") return false;
  return true;
}

/**
 * What the surface that owns the subject lets the panel do (registered with `registerTutorHost`). Every member is
 * optional: without `applyCode` there is no in-editor Apply (Apply to new sketch still works), without
 * `showBars` a bar reference dispatches `TUTOR_BARS_EVENT` on `window`, without `reveal` the panel records hint 4
 * through `steps.hint` itself.
 */
export interface TutorHost {
  thread: SubjectRef;
  /** Applies a card's code in the editor as one undoable change (contracts §10.7). */
  applyCode?(code: string, card: { cardId: string; title: string }): void;
  /** Loops or highlights bars `from`–`to` (1-based, inclusive) in the active Workbench. */
  showBars?(from: number, to: number): void;
  /** Takes hint 4 (Reveal) through the surface's own ladder, so reveals are always recorded the same way. */
  reveal?(): void | Promise<void>;
  /** The sketch an in-editor Apply lands in (`tutor.cardApplied` body), when the surface has one. */
  sketchId?: string | null;
}

/** `window` event a bar reference fires when no host handles it: `detail = { from, to }`. */
export const TUTOR_BARS_EVENT = "oak:tutor-bars";

interface TutorContextState {
  subject: TutorSubject | null;
  availability: TutorAvailability;
  /** The `Health.tutor` value behind `off` (`missing_key`, …), for the copy. */
  offReason: Health["tutor"] | null;
  /** Asks queued for the panel, oldest first. The panel takes them with `takeAsk()`. */
  queue: TutorAsk[];
  /** The latest refusal, shown in the panel until dismissed (and announced once as a toast by the panel). */
  notice: TutorNotice | null;
  /** Bumped by `openTutor()`; the shell opens the docked panel or the drawer when it changes. */
  openRequests: number;
  /** Chips the learner switched off; cleared when the subject's thread changes. */
  excluded: ChipId[];
  /** Bumped when a host registers or leaves, so the panel re-reads `tutorHostFor`. */
  hosts: number;
  /** Bumped by `focusTutor()` (Mod+I): the panel moves focus to its composer. */
  focusRequests: number;
}

export const useTutorContext = create<TutorContextState>(() => ({
  subject: null,
  availability: "unknown",
  offReason: null,
  queue: [],
  notice: null,
  openRequests: 0,
  excluded: [],
  hosts: 0,
  focusRequests: 0,
}));

// --- subject --------------------------------------------------------------------------------------

export function setSubject(subject: TutorSubject): void {
  const cur = useTutorContext.getState().subject;
  const same = cur !== null && sameThread(cur.thread, subject.thread);
  useTutorContext.setState(same ? { subject, notice: null } : { subject, notice: null, excluded: [] });
}

/** Updates the current subject only if it is still `thread` (a late update from a page left behind is dropped). */
export function patchSubject(thread: SubjectRef, patch: Partial<Omit<TutorSubject, "thread">>): void {
  const cur = useTutorContext.getState().subject;
  if (!cur || !sameThread(cur.thread, thread)) return;
  useTutorContext.setState({ subject: { ...cur, ...patch } });
}

/** Clears the subject; with `thread`, only if it is still that one (unmount of an old page). */
export function clearSubject(thread?: SubjectRef): void {
  const cur = useTutorContext.getState().subject;
  if (thread && cur && !sameThread(cur.thread, thread)) return;
  useTutorContext.setState({ subject: null, excluded: [] });
}

/** Switches a chip off or on for the next turns. Chips that are not removable are left alone. */
export function toggleChip(id: ChipId): void {
  if (!REMOVABLE_CHIPS.has(id)) return;
  useTutorContext.setState((s) => ({
    excluded: s.excluded.includes(id) ? s.excluded.filter((x) => x !== id) : [...s.excluded, id],
  }));
}

// --- hosts ----------------------------------------------------------------------------------------

const hosts = new Map<string, TutorHost>();
const threadKey = (t: SubjectRef) => `${t.subjectKind}:${t.subjectId}`;

/** A surface offers Apply, bar highlighting and Reveal for its thread. Returns the unregister function. */
export function registerTutorHost(host: TutorHost): () => void {
  const key = threadKey(host.thread);
  hosts.set(key, host);
  useTutorContext.setState((s) => ({ hosts: s.hosts + 1 }));
  return () => {
    if (hosts.get(key) !== host) return;
    hosts.delete(key);
    useTutorContext.setState((s) => ({ hosts: s.hosts + 1 }));
  };
}

export function tutorHostFor(thread: SubjectRef): TutorHost | null {
  return hosts.get(threadKey(thread)) ?? null;
}

/** Loops bars in the active Workbench: through the host if there is one, else as a window event. */
export function showBars(thread: SubjectRef, from: number, to: number): void {
  const host = tutorHostFor(thread);
  if (host?.showBars) host.showBars(from, to);
  else if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent(TUTOR_BARS_EVENT, { detail: { from, to } }));
}

export function sameThread(a: SubjectRef, b: SubjectRef): boolean {
  return a.subjectKind === b.subjectKind && a.subjectId === b.subjectId;
}

/** The subject the panel uses when no surface set one: the general thread. */
export const GENERAL_SUBJECT: TutorSubject = {
  thread: { subjectKind: "general", subjectId: "general" },
  title: "General",
  tutorOpen: true,
};

/** The chips of a subject, in display order. */
export function chipsOf(s: TutorSubject): ContextChip[] {
  const chips: ContextChip[] = [];
  if (s.lessonId && s.stepId) chips.push({ id: "step", label: `${s.lessonId} · ${s.stepId}` });
  if (s.sketchId) chips.push({ id: "sketch", label: s.title });
  if (s.capstoneId) chips.push({ id: "capstone", label: `Capstone ${s.capstoneId}` });
  if (s.thread.subjectKind === "track") chips.push({ id: "track", label: s.title });
  if (s.thread.subjectKind === "transcription") chips.push({ id: "transcription", label: s.title });
  if (s.code) chips.push({ id: "code", label: `Your code · ${lineCount(s.code)} lines` });
  if (s.lastResult) chips.push({ id: "result", label: resultLabel(s.lastResult) });
  if (s.graded && !s.passed) chips.push({ id: "hints", label: `Hints ${s.rung ?? 0}/4` });
  if (s.selection) chips.push({ id: "selection", label: `Selection · ${lineCount(s.selection)} lines` });
  return chips;
}

const lineCount = (code: string) => code.replace(/\s+$/, "").split("\n").length;

function resultLabel(r: GradeResult): string {
  if (r.status === "pass") return "Last check: passed";
  if (r.status === "error") return "Last run: an error";
  if (r.status === "ungraded") return "Last run";
  return `Last check: ${Math.round(r.score * 100)}%`;
}

// --- availability ----------------------------------------------------------------------------------

/** Called from the shell with every `/api/health` answer (`useTutorAvailabilitySync`). */
export function setAvailability(health: Pick<Health, "tutor" | "tutorBackend"> | null): void {
  if (health === null) {
    useTutorContext.setState({ availability: "unknown", offReason: null });
    return;
  }
  const ready = health.tutor === "ready" && health.tutorBackend !== null;
  useTutorContext.setState({
    availability: ready ? "ready" : "off",
    offReason: ready ? null : health.tutor,
  });
}

const OFF_COPY: Record<Health["tutor"], string> = {
  ready: "The tutor is off. Turn it on in Settings › Tutor.",
  missing_key: "The tutor is off: no API key and no Claude login found. Settings › Tutor explains both.",
  invalid_key: "The tutor is off: the API key was refused. Check it in Settings › Tutor.",
  unreachable: "The tutor can't be reached right now. Oak works fully without it.",
};

// --- the imperative API -------------------------------------------------------------------------------

let nextAskId = 1;

/** Opens the panel (docked at L, drawer at M). Works when the tutor is off too: the panel then explains why. */
export function openTutor(): void {
  useTutorContext.setState((s) => ({ openRequests: s.openRequests + 1 }));
}

/** The panel takes the oldest queued ask. */
export function takeAsk(): TutorAsk | null {
  const [first, ...rest] = useTutorContext.getState().queue;
  if (!first) return null;
  useTutorContext.setState({ queue: rest });
  return first;
}

export function dismissNotice(): void {
  useTutorContext.setState({ notice: null });
}

/** Focuses the panel's composer (opening the panel first). */
export function focusTutor(): void {
  openTutor();
  useTutorContext.setState((s) => ({ focusRequests: s.focusRequests + 1 }));
}

/**
 * Builds the request body of a turn from a subject (pure). `exclude` drops the chips the learner switched off.
 * A selection has no field of its own in the request, so it travels inside the learner's message, after their
 * words, exactly as the Selection chip says.
 */
export function buildTurnRequest(
  subject: TutorSubject,
  kind: ThreadKind,
  userText: string,
  exclude: readonly ChipId[] = [],
): TutorTurnRequest {
  const off = (id: ChipId) => exclude.includes(id) && chipRemovable(id, kind);
  const selection = subject.selection?.trim() && !off("selection") ? subject.selection.trim() : null;
  const text = selection ? `${userText}\n\nSelected code:\n\`\`\`\n${selection}\n\`\`\`` : userText;
  const req: TutorTurnRequest = { thread: subject.thread, kind, userText: text };
  if (subject.code && !off("code")) req.learnerCode = subject.code;
  if (subject.lastResult && !off("result")) req.graderResult = gradeSnapshotOf(subject.lastResult);
  if (subject.lessonId) req.lessonId = subject.lessonId;
  if (subject.stepId) req.stepId = subject.stepId;
  return req;
}

function refuse(notice: TutorNotice): AskResult {
  useTutorContext.setState({ notice });
  openTutor();
  return { ok: false, notice };
}

function ask(kind: ThreadKind, userText: string, label: string, subject?: TutorSubject): AskResult {
  const st = useTutorContext.getState();
  const subj = subject ?? st.subject ?? GENERAL_SUBJECT;
  if (st.availability === "off") return refuse({ kind: "off", message: OFF_COPY[st.offReason ?? "ready"] });
  if (!subj.tutorOpen)
    return refuse({
      kind: "closed",
      message:
        "The tutor is closed here: checkpoints and drill trials are yours alone. It opens again after.",
    });
  const a: TutorAsk = {
    id: nextAskId++,
    kind,
    request: buildTurnRequest(
      subj,
      kind,
      userText,
      st.subject && sameThread(st.subject.thread, subj.thread) ? st.excluded : [],
    ),
    label,
    at: Date.now(),
    ...(subject ? { subject } : {}),
  };
  useTutorContext.setState((s) => ({ queue: [...s.queue, a], notice: null }));
  openTutor();
  return { ok: true, ask: a };
}

/** "Give me a nudge" on a graded step: the server advances the rung by one, up to 3 (contracts §10.4). */
export function askHint(text = "Give me a nudge."): AskResult {
  const s = useTutorContext.getState().subject;
  if (!s?.graded || s.passed)
    return refuse({ kind: "no-subject", message: "Hints are for a step that is being checked." });
  return ask("hint", text, "Give me a nudge");
}

/** "Explain my mistake" after a run or check failed. It is a hint-lane request: it climbs the rung like a nudge. */
export function askExplain(text = "Explain my mistake."): AskResult {
  const s = useTutorContext.getState().subject;
  if (!s?.stepId || s.passed)
    return refuse({
      kind: "no-subject",
      message: "Explain my mistake works on a lesson step that is being checked.",
    });
  return ask("explain", text, "Explain my mistake");
}

/** A free question on the current subject, or on `subject` (the panel passes the thread it shows). */
export function askChat(text: string, subject?: TutorSubject): AskResult {
  return ask("chat", text, text, subject);
}

/** "Ask Claude to listen": a 2–3 sentence note on a saved sketch (contracts §10.10). */
export function askListeningNote(sketch: { sketchId: string; title: string; code: string }): AskResult {
  return ask("listening", "Please listen to this sketch.", "Ask Claude to listen", {
    thread: { subjectKind: "sketch", subjectId: sketch.sketchId },
    title: sketch.title,
    tutorOpen: true,
    sketchId: sketch.sketchId,
    code: sketch.code,
  });
}

/** "Request review" on a capstone draft (high effort; one structured review, contracts §10.6). */
export function askReview(capstone: {
  capstoneId: string;
  title: string;
  code: string;
  note?: string;
}): AskResult {
  return ask("review-capstone", capstone.note ?? "Please review my draft.", "Request review", {
    thread: { subjectKind: "capstone", subjectId: capstone.capstoneId },
    title: capstone.title,
    tutorOpen: true,
    capstoneId: capstone.capstoneId,
    code: capstone.code,
  });
}

// --- grade snapshot ---------------------------------------------------------------------------------

/**
 * `GradeResult` → the snapshot a turn may carry (`GradeSnapshotSchema`). The server redacts it by its own rung
 * before any model sees it, so sending everything here is safe. `render` turns a diagnostic into text
 * (`renderFeedback` from `@oak/grader`); without it the feedback ID is used.
 */
export function gradeSnapshotOf(
  result: GradeResult,
  render: (d: GradeResult["diagnostics"][number]) => string = (d) => d.id,
): GradeSnapshot {
  const dims: Record<string, number> = {};
  for (const [k, v] of Object.entries(result.dims)) if (v !== undefined) dims[k] = v.score;
  const str = (v: unknown) => (v === undefined || v === null ? null : String(v));
  const issues: RawIssue[] = result.diagnostics.map((d) => {
    const p = d.params;
    const code = d.where?.code?.[0];
    return {
      where: {
        track: d.where?.track ?? null,
        bar: d.where?.bar ?? null,
        beat: d.where?.beat ?? null,
        code: code === undefined ? null : { from: code.from, to: code.to },
      },
      severity: d.severity === "error" || d.severity === "warn" ? d.severity : "info",
      feedback: d.id,
      direction: str(p.direction),
      concept: str(p.concept),
      what: render(d),
      fix: str(p.fix),
      expected: str(p.expected ?? p.exp),
      got: str(p.got),
    };
  });
  return {
    status: result.status,
    score: result.score,
    dims,
    counts: countIssues(result.diagnostics),
    issues,
    warnings: result.diagnostics
      .filter((d) => d.id.startsWith("code.") && d.severity !== "error")
      .map((d) => d.id),
  };
}
