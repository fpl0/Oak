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
import { type KeySpec, keyOf } from "@oak/theory";
import { create } from "zustand";

/** One context chip: exactly what the next turn will carry (contracts §10.2, ux §6.2). */
export interface ContextChip {
  id:
    | "step"
    | "code"
    | "answer"
    | "result"
    | "hints"
    | "selection"
    | "sketch"
    | "capstone"
    | "track"
    | "transcription"
    | "key"
    | "labels";
  label: string;
}

/** Which note labels are on screen (the lenses of docs/design/wave3.md §4.3, or a lesson step's own labels). */
export interface LabelState {
  degrees: boolean;
  solfege: boolean;
  noteNames: boolean;
}

/**
 * The learner's answer on a step that is not code (Wave 3), in a form the tutor can read. It carries only what
 * the learner did and what they were shown — never the expected answer: the server redacts the grade by its own
 * rung, and this goes to the model as written.
 *
 * - `staff`: the note list they placed (`"F#4:4 r:4 G4:2"`, the staff-input value), or for a key-signature
 *   question the accidentals in the order placed (`mode: "key-signature"`, `notes: "F# C#"`);
 * - `sung`: per sung note, the label the learner saw for its target (a degree or syllable they were shown; omit
 *   it in echo mode, where the target is the question) and the measured cents from that target (`null`: no voice
 *   heard), plus the tolerance they were graded at;
 * - `by-ear`: the code they wrote by ear (`subject.code` may hold it instead) and the playback rate they used;
 * - `text`: any other answer as the learner gave it (a typed name, the option they picked).
 */
export type TutorAnswer =
  | {
      kind: "staff";
      notes: string;
      mode?: "notes" | "key-signature";
      clef?: "treble" | "bass" | "grand";
      key?: KeySpec | null;
    }
  | {
      kind: "sung";
      notes: { target?: string; cents: number | null }[];
      tolCents?: number;
      /** Quiet mode or no mic: the step was done by its fallback, nothing was sung. */
      quiet?: boolean;
    }
  | { kind: "by-ear"; code: string; rate?: number }
  | { kind: "text"; prompt?: string; value: string };

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
  /** The key the learner is in. Absent: read from the code's first `.scale()`, else none (C major for sound). */
  key?: KeySpec | null;
  /** The learner's answer on a step that is not code (staff, sung, by ear); see `TutorAnswer`. */
  answer?: TutorAnswer | null;
  /**
   * The labels a lesson step itself shows (content's `ui.staffLabels`/`ui.rollLabels` win inside a step, wave3
   * §4.3). Absent: the learner's lenses.
   */
  labels?: LabelState | null;
  /** A capstone after its first release (revision mode): review `tryCode` may be applied (contracts §10.7). */
  released?: boolean;
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
export const REMOVABLE_CHIPS: ReadonlySet<ChipId> = new Set<ChipId>([
  "code",
  "answer",
  "result",
  "selection",
]);

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

/**
 * What a tutor reference points at in the music on screen (Wave 3): bars (`[[bars:3-4]]`, a review's bar chip)
 * or a note (`[[note:F#4]]`). The Workbench lights it on the roll and the staff for `HIGHLIGHT_MS` (it reads
 * `useTutorHighlight` or listens for `TUTOR_HIGHLIGHT_EVENT`, `detail = TutorHighlight`); the loop is set by the
 * bars event as before. `seq` changes with every reference, so the same one clicked twice lights again.
 */
export type TutorHighlight =
  | { kind: "bars"; thread: SubjectRef; from: number; to: number; seq: number; at: number }
  | { kind: "note"; thread: SubjectRef; midi: number; seq: number; at: number };

export const TUTOR_HIGHLIGHT_EVENT = "oak:tutor-highlight";
export const HIGHLIGHT_MS = 2400;

export const useTutorHighlight = create<{ current: TutorHighlight | null }>(() => ({ current: null }));
let highlightSeq = 0;

type HighlightInput =
  | { kind: "bars"; thread: SubjectRef; from: number; to: number }
  | { kind: "note"; thread: SubjectRef; midi: number };

/** Publishes a reference for the Workbench on screen to light (store and window event). */
export function highlightReference(ref: HighlightInput): TutorHighlight {
  const h = { ...ref, seq: ++highlightSeq, at: Date.now() } as TutorHighlight;
  useTutorHighlight.setState({ current: h });
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent(TUTOR_HIGHLIGHT_EVENT, { detail: h }));
  return h;
}

/** Bar numbers (1-based, inclusive) to the half-open cycle span the Workbench uses: bars 3–4 → [2, 4). */
export function barsToCycles(from: number, to: number): [number, number] {
  const a = Math.max(1, Math.min(from, to));
  const b = Math.max(a, Math.max(from, to));
  return [a - 1, b];
}

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
  /** The learner's shown lenses (synced by `useTutorBridge`); null until known. */
  lenses: LabelState | null;
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
  lenses: null,
}));

/** The shell keeps the shown lenses here, so a turn built outside React knows them (`useTutorBridge`). */
export function setLensState(lenses: LabelState | null): void {
  const cur = useTutorContext.getState().lenses;
  if (
    cur === lenses ||
    (cur &&
      lenses &&
      cur.degrees === lenses.degrees &&
      cur.solfege === lenses.solfege &&
      cur.noteNames === lenses.noteNames)
  )
    return;
  useTutorContext.setState({ lenses });
}

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
  highlightReference({ kind: "bars", thread, from, to });
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

/** The chips of a subject, in display order. `lenses` are the learner's shown lenses (`state.lenses`). */
export function chipsOf(s: TutorSubject, lenses: LabelState | null = null): ContextChip[] {
  const chips: ContextChip[] = [];
  if (s.lessonId && s.stepId) chips.push({ id: "step", label: `${s.lessonId} · ${s.stepId}` });
  if (s.sketchId) chips.push({ id: "sketch", label: s.title });
  if (s.capstoneId) chips.push({ id: "capstone", label: `Capstone ${s.capstoneId}` });
  if (s.thread.subjectKind === "track") chips.push({ id: "track", label: s.title });
  if (s.thread.subjectKind === "transcription") chips.push({ id: "transcription", label: s.title });
  const key = subjectKey(s);
  if (key) chips.push({ id: "key", label: `Key · ${keyLabel(key)}` });
  const labels = labelsLine(s.labels ?? lenses);
  if (labels && (s.code || s.answer || s.lessonId || s.sketchId || s.capstoneId))
    chips.push({ id: "labels", label: `Labels · ${labels}` });
  const answer = s.answer ? answerChip(s.answer) : null;
  // A step answered on the staff, by voice, in words or by ear has one chip for that answer (code written by ear
  // included): a second "Your code" chip would list the same lines twice.
  if (s.code && !s.answer) chips.push({ id: "code", label: `Your code · ${lineCount(s.code)} lines` });
  if (answer) chips.push({ id: "answer", label: answer });
  if (s.lastResult) chips.push({ id: "result", label: resultLabel(s.lastResult) });
  if (s.graded && !s.passed) chips.push({ id: "hints", label: `Hints ${s.rung ?? 0}/4` });
  if (s.selection) chips.push({ id: "selection", label: `Selection · ${lineCount(s.selection)} lines` });
  return chips;
}

const lineCount = (code: string) => code.replace(/\s+$/, "").split("\n").length;

const ACC = (s: string) => s.replace(/#/g, "♯").replace(/b/g, "♭");

/** "G major", "E♭ minor". */
export function keyLabel(key: KeySpec): string {
  return `${key.tonic.charAt(0).toUpperCase()}${ACC(key.tonic.slice(1))} ${key.mode}`;
}

/**
 * The key of the music on screen: the subject's own, else the code's first `.scale("…")` (a patterned
 * `.scale("<C4:major D4:major>")` gives its first key), else none.
 */
export function subjectKey(s: Pick<TutorSubject, "key" | "code" | "answer">): KeySpec | null {
  if (s.key) return s.key;
  if (s.answer?.kind === "staff" && s.answer.key) return s.answer.key;
  const code = s.code ?? (s.answer?.kind === "by-ear" ? s.answer.code : null);
  return code ? keyFromCode(code) : null;
}

/** The key of a piece's first `.scale()` call, or null. */
export function keyFromCode(code: string): KeySpec | null {
  const m = /\.scale\(\s*["'`]([^"'`]{1,40})["'`]/.exec(code);
  if (!m) return null;
  const first =
    (m[1] as string)
      .replace(/[<>[\]]/g, " ")
      .trim()
      .split(/\s+/)[0] ?? "";
  if (!first) return null;
  try {
    const k = keyOf(first);
    return k;
  } catch {
    return null;
  }
}

/** "degrees, solfège", "note names", "none". */
export function labelsLine(l: LabelState | null | undefined): string | null {
  if (!l) return null;
  const on = [l.degrees && "degrees", l.solfege && "solfège", l.noteNames && "note names"].filter(Boolean);
  return on.length > 0 ? on.join(", ") : "none";
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function answerChip(a: TutorAnswer): string {
  switch (a.kind) {
    case "staff": {
      const n = a.notes.trim()
        ? a.notes
            .trim()
            .split(/\s+/)
            .filter((t) => t !== "|")
        : [];
      if (a.mode === "key-signature")
        return `Your signature · ${plural(n.length, "accidental", "accidentals")}`;
      const notes = n.filter((t) => !/^r:/.test(t)).length;
      return `Your staff · ${plural(notes, "note", "notes")}`;
    }
    case "sung":
      return a.quiet
        ? "Quiet mode · nothing sung"
        : `Your singing · ${plural(a.notes.length, "note", "notes")}`;
    case "by-ear":
      return `Your code by ear · ${lineCount(a.code)} lines`;
    case "text":
      return "Your answer";
  }
}

const signedCents = (c: number) => `${c > 0 ? "+" : c < 0 ? "−" : "±"}${Math.abs(Math.round(c))}¢`;

/**
 * The learner's answer as text the tutor reads (sent as the turn's `learnerCode`). Only what the learner did and
 * saw: placed notes, measured cents, the code they wrote. Pure.
 */
export function answerText(a: TutorAnswer): string {
  switch (a.kind) {
    case "staff": {
      const where = [a.clef ? `${a.clef} clef` : null, a.key ? `key signature of ${keyLabel(a.key)}` : null]
        .filter(Boolean)
        .join(", ");
      if (a.mode === "key-signature")
        return `Accidentals I placed on the staff, in the order I placed them${where ? ` (${where})` : ""}:\n${a.notes.trim() || "(none yet)"}`;
      return `Notes I placed on the staff${where ? ` (${where})` : ""}, as a note list (pitch:duration, 4 = quarter, r = rest, | = bar line):\n${a.notes.trim() || "(none yet)"}`;
    }
    case "sung": {
      if (a.quiet) return "Quiet mode: I did this step without singing (its listening fallback).";
      const tol = a.tolCents ? ` I was graded within ±${a.tolCents}¢.` : "";
      const rows = a.notes.map((n, i) => {
        const what = n.target ? `note ${i + 1} (target ${n.target})` : `note ${i + 1}`;
        return `${what}: ${n.cents === null ? "no voice heard" : `${signedCents(n.cents)} ${n.cents > 0 ? "sharp" : n.cents < 0 ? "flat" : "on pitch"}`}`;
      });
      return `What Oak's pitch tracker heard when I sang, in cents from each target (100¢ = a half step).${tol}\n${rows.join("\n")}`;
    }
    case "by-ear":
      return a.rate && a.rate !== 1 ? `// written by ear, listening at ${a.rate}× speed\n${a.code}` : a.code;
    case "text":
      return a.prompt ? `${a.prompt}\nMy answer: ${a.value}` : `My answer: ${a.value}`;
  }
}

/** The line the key and label chips add under the learner's words ("On screen: …"); null when neither applies. */
export function onScreenLine(s: TutorSubject, lenses: LabelState | null): string | null {
  const chips = chipsOf(s, lenses);
  const parts: string[] = [];
  const key = chips.find((c) => c.id === "key");
  const labels = chips.find((c) => c.id === "labels");
  if (key) parts.push(`key ${key.label.replace(/^Key · /, "")}`);
  if (labels) parts.push(`labels shown: ${labels.label.replace(/^Labels · /, "")}`);
  return parts.length > 0 ? `${ON_SCREEN}${parts.join("; ")}.` : null;
}

export const ON_SCREEN = "On screen: ";
const SELECTED = "\n\nSelected code:\n";

/** A sent message split back into the learner's words, the "On screen" line and the selection (for display). */
export function splitUserText(text: string): {
  own: string;
  onScreen: string | null;
  selection: string | null;
} {
  const [head, sel] = text.split(SELECTED) as [string, string | undefined];
  const at = head.lastIndexOf(`\n\n${ON_SCREEN}`);
  if (at < 0) return { own: head, onScreen: null, selection: sel ?? null };
  return {
    own: head.slice(0, at),
    onScreen: head.slice(at + 2 + ON_SCREEN.length),
    selection: sel ?? null,
  };
}

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
  lenses: LabelState | null = null,
): TutorTurnRequest {
  const off = (id: ChipId) => exclude.includes(id) && chipRemovable(id, kind);
  const selection = subject.selection?.trim() && !off("selection") ? subject.selection.trim() : null;
  const screen = onScreenLine(subject, lenses);
  let text = screen ? `${userText}\n\n${screen}` : userText;
  if (selection) text = `${text}${SELECTED}\`\`\`\n${selection}\n\`\`\``;
  const req: TutorTurnRequest = { thread: subject.thread, kind, userText: text };
  // A step answered on the staff, by voice, in words or by ear sends that answer (its chip left out: nothing);
  // otherwise the code.
  const a = subject.answer ?? null;
  if (a) {
    if (!off("answer")) req.learnerCode = answerText(a);
  } else if (subject.code && !off("code")) req.learnerCode = subject.code;
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
      st.lenses,
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
