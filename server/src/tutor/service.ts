// The tutor service: one object the HTTP routes (and nothing else) talk to. It decides WHICH
// backend answers and WHEN a turn may run; what a turn may reveal is decided below it, in
// prepare.ts and the tool executors, from server state only.
//
//   turn()   select backend -> wait for the conversation's turn -> prepareTurn -> runTurn/runReview
//   status() what Settings -> Tutor shows (never a credential)
//   warm()   prime the prompt cache at session start
//   thread() the merged timeline the panel shows
import { classifyThrown, errorInfo, redactSecrets, TutorError, type TutorErrorKind } from "./errors.ts";
import type { TutorEvent } from "./events.ts";
import type { TutorSettings } from "./ports.ts";
import { prepareTurn } from "./prepare.ts";
import { buildPrefix, prefixVersion } from "./prompt/persona.ts";
import { runTurn } from "./run.ts";
import { runReview } from "./run-review.ts";
import { type BackendStatus, backendStatus, reasonCode, selectBackend, setupGuidance } from "./select.ts";
import type {
  ServiceEmit,
  TurnSummary,
  TutorLogEntry,
  TutorService,
  TutorServiceDeps,
  WarmResult,
} from "./service-types.ts";
import { buildThreadView } from "./thread-view.ts";
import { checkBudget } from "./threads.ts";
import { TOOLS } from "./tools/defs.ts";
import { applyCard } from "./tools/propose.ts";
import { KeyedQueue } from "./turn-queue.ts";
import {
  type BackendId,
  effortFor,
  laneFor,
  MODEL,
  reviewKindOf,
  type ThreadKind,
  type TurnRequest,
  type TutorBackend,
  UNAVAILABLE,
} from "./types.ts";
import { cacheHitRatio } from "./usage.ts";

export type * from "./service-types.ts";

/** The one toast of contracts §10.9. */
export const SOFT_MARKER_COPY = "Tutor spending passed your monthly marker. Details in Settings.";

/** What the learner "said" when a button, not a message, started the turn. */
const BUTTON_TEXT: Partial<Record<ThreadKind, string>> = {
  hint: "Give me a nudge.",
  explain: "Explain this error.",
};

const DEFAULT_SELECTION_TTL_MS = 30_000;
/** A negative answer is rechecked sooner: the learner may be signing in right now. */
const NEGATIVE_TTL_MS = 5_000;
/** The cached prefix lives an hour; the UI re-warms after 55 idle minutes (architecture §5.6). */
const WARM_MIN_INTERVAL_MS = 50 * 60_000;

export function createTutorService(deps: TutorServiceDeps): TutorService {
  const { ports } = deps;
  const log = (entry: TutorLogEntry) => {
    if (deps.log) deps.log(entry);
    else console.error(`[tutor] ${entry.level}: ${entry.msg}${entry.detail ? ` (${entry.detail})` : ""}`);
  };
  const describe = (e: unknown) => redactSecrets(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  const queue = new KeyedQueue();

  let wired: Partial<Record<BackendId, TutorBackend>> | null = null;
  const backends = (): Partial<Record<BackendId, TutorBackend>> => {
    if (wired === null) {
      wired = {};
      for (const source of deps.backends) {
        try {
          const backend = typeof source === "function" ? source() : source;
          wired[backend.id] = backend;
        } catch (e) {
          log({ level: "error", msg: "a tutor backend could not be constructed", detail: describe(e) });
        }
      }
    }
    return wired;
  };

  // `status` is the full report (every backend asked); a turn only needs `selection`.
  let cached: {
    setting: TutorSettings["backend"];
    at: number;
    selection: BackendStatus["selection"];
    status: BackendStatus | null;
  } | null = null;

  const fresh = (setting: TutorSettings["backend"]) => {
    if (cached === null || cached.setting !== setting) return null;
    const ttl = cached.selection.backend
      ? (deps.selectionTtlMs ?? DEFAULT_SELECTION_TTL_MS)
      : NEGATIVE_TTL_MS;
    return Date.now() - cached.at < ttl ? cached : null;
  };

  const select = async () => {
    const { backend: setting } = await ports.settings.tutor();
    const hit = fresh(setting);
    if (hit) return hit.selection;
    const selection = await selectBackend(setting, backends());
    cached = { setting, at: Date.now(), selection, status: null };
    return selection;
  };

  const fullStatus = async (refresh: boolean): Promise<BackendStatus> => {
    const { backend: setting } = await ports.settings.tutor();
    const hit = refresh ? null : fresh(setting);
    if (hit?.status) return hit.status;
    const status = await backendStatus(setting, backends());
    cached = { setting, at: Date.now(), selection: status.selection, status };
    return status;
  };

  let lastWarm: { backend: BackendId; version: string; at: number } | null = null;
  let warming: Promise<WarmResult> | null = null;

  const warmOnce = async (signal?: AbortSignal): Promise<WarmResult> => {
    const selection = await select();
    const backend = selection.backend;
    if (backend === null) return { warmed: false, backend: null, reason: reasonCode(selection.reason) };
    if (backend.warm === undefined) return { warmed: false, backend: backend.id, reason: "not_needed" };
    const prefix = buildPrefix(await ports.lessons.prefixSources());
    const version = prefixVersion(prefix);
    const recent =
      lastWarm !== null &&
      lastWarm.backend === backend.id &&
      lastWarm.version === version &&
      Date.now() - lastWarm.at < WARM_MIN_INTERVAL_MS;
    // Several tabs or a remount of Today must not each pay for the same cache write.
    if (recent) return { warmed: false, backend: backend.id, reason: "fresh" };
    try {
      await backend.warm({ prefix, tools: TOOLS, model: MODEL, effort: effortFor("chat") }, signal);
      lastWarm = { backend: backend.id, version, at: Date.now() };
      return { warmed: true, backend: backend.id, reason: null };
    } catch (e) {
      const kind = classifyThrown(e, { aborted: signal?.aborted === true }).kind;
      if (kind !== "aborted") log({ level: "warn", msg: "tutor warm-up failed", detail: describe(e) });
      return { warmed: false, backend: backend.id, reason: kind };
    }
  };

  const turn = async (request: TurnRequest, emit: ServiceEmit, signal: AbortSignal): Promise<TurnSummary> => {
    let ended = false;
    const out: ServiceEmit = (event) => {
      if (ended) return;
      if (event.type === "done" || event.type === "error") ended = true;
      emit(event);
    };
    const summary: TurnSummary = { ok: false, errorKind: null, backend: null, softMarkerPassed: false };
    const fail = (kind: TutorErrorKind, message?: string) => {
      summary.errorKind = kind;
      out({ type: "error", data: message === undefined ? errorInfo(kind) : { kind, message } });
      return summary;
    };

    let release: (() => void) | null = null;
    try {
      const selection = await select();
      const backend = selection.backend;
      if (backend === null) {
        const reason = reasonCode(selection.reason);
        const { backend: setting } = await ports.settings.tutor();
        const wanted = setting === "auto" || setting === "off" ? null : setting;
        // `auth` sends the panel to the set-up screen; an unreachable service is a network matter.
        return fail(reason === UNAVAILABLE.unreachable ? "network" : "auth", setupGuidance(reason, wanted));
      }
      summary.backend = backend.id;

      // One turn at a time per conversation: two interleaved turns would both read the same
      // history and a double-clicked hint would be prepared against a rung that is still moving.
      const { thread, kind } = request;
      release = await queue.acquire(`${thread.subjectKind}:${thread.subjectId}:${laneFor(kind)}`, signal);

      const text = request.userText.trim() === "" ? BUTTON_TEXT[kind] : undefined;
      const prep = await prepareTurn(text === undefined ? request : { ...request, userText: text }, ports);
      // A nudge is about a step. Where the content port withholds the step (a checkpoint item, the
      // current drill trial, an unknown ID) there is no ladder to stand on, so there is no hint.
      if (laneFor(kind) === "hint" && prep.ctx.step === null)
        throw new TutorError("bad_request", { detail: "hint requested without a resolvable step" });

      // The runner's last event is held back so that a notice can never follow `done`.
      let last: TutorEvent | null = null;
      const inner = (event: TutorEvent) => {
        if (event.type === "done" || event.type === "error") last = event;
        else out(event);
      };
      const reviewKind = reviewKindOf(kind);
      const result =
        reviewKind === null
          ? await runTurn(prep, backend, inner, signal, ports, { cardDrafts: deps.cardDrafts === true })
          : await runReview(prep, backend, inner, signal, ports);
      if (reviewKind !== null && result.review !== null && deps.onReview) {
        try {
          await deps.onReview({
            subject: thread,
            reviewKind,
            review: result.review,
            conversationId: prep.ctx.conversationId,
            target: prep.ctx.review?.target ?? null,
          });
        } catch (e) {
          log({ level: "error", msg: "an accepted review could not be stored", detail: describe(e) });
        }
      }

      summary.ok = result.ok;
      summary.errorKind = result.error?.kind ?? null;
      summary.softMarkerPassed = result.softMarkerPassed;
      // A sign-in or connection failure may mean the backend is gone: ask again next time.
      if (summary.errorKind === "auth" || summary.errorKind === "network") cached = null;
      if (result.softMarkerPassed)
        out({ type: "notice", data: { kind: "budget_soft_marker", message: SOFT_MARKER_COPY } });
      if (last === null) return fail("internal");
      out(last);
      return summary;
    } catch (e) {
      const info = classifyThrown(e, { aborted: signal.aborted });
      // A TutorError is an expected refusal (closed subject, stopped); anything else is a bug
      // or an infrastructure failure and is logged, scrubbed. The learner reads fixed copy either way.
      if (!(e instanceof TutorError)) log({ level: "error", msg: "tutor turn failed", detail: describe(e) });
      else if (e.detail !== undefined)
        log({ level: "warn", msg: `tutor turn refused: ${e.kind}`, detail: e.detail });
      summary.ok = false;
      summary.errorKind = info.kind;
      out({ type: "error", data: info });
      return summary;
    } finally {
      release?.();
    }
  };

  return {
    turn,
    async status(opts = {}) {
      const s = await fullStatus(opts.refresh === true);
      const budget = await checkBudget(ports);
      const month = await ports.usage.month(budget.month);
      // Built field by field: `s.selection` holds the backend object itself, which may hold a key.
      return {
        tutor: s.health,
        active: s.active,
        setting: s.setting,
        reason: s.reason,
        guidance: s.guidance,
        model: MODEL,
        backends: s.backends.map((b) => ({ ...b })),
        budget: {
          month: budget.month,
          monthUsd: budget.monthUsd,
          softMarkerUsd: budget.softMarkerUsd,
          softPassed: budget.softPassed,
        },
        usage: { ...month, cacheHitRatio: cacheHitRatio(month) },
      };
    },
    warm(signal) {
      // Concurrent calls share one request.
      warming ??= warmOnce(signal).finally(() => {
        warming = null;
      });
      return warming;
    },
    thread: (subject, opts) => buildThreadView(subject, ports, opts),
    applyCard: (cardId) => applyCard(ports.conversations, cardId),
    retractNote: (noteId) => ports.notes.retract(noteId, ports.clock.now().toISOString()),
    refreshBackends() {
      cached = null;
    },
  };
}
