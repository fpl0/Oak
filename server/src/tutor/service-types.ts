// The tutor service's public types: what the routes call and what crosses to the browser.
// Type-only, so the browser client can import the event and view shapes from here.
import type { TutorErrorKind } from "./errors.ts";
import type { TutorEvent } from "./events.ts";
import type { MonthUsage, TutorPorts, TutorSettings } from "./ports.ts";
import type { ReviewKind, ReviewValue } from "./reviews.ts";
import type { BackendReport, TutorHealth } from "./select.ts";
import type { ThreadView } from "./thread-view.ts";
import type { BackendId, SubjectRef, TurnRequest, TutorBackend } from "./types.ts";

/** A backend, or a thunk that builds it on first use (so a missing SDK or CLI costs nothing at start-up). */
export type BackendSource = TutorBackend | (() => TutorBackend);

export interface AcceptedReview {
  subject: SubjectRef;
  reviewKind: ReviewKind;
  review: ReviewValue;
}

export interface TutorLogEntry {
  level: "warn" | "error";
  msg: string;
  /** Already scrubbed of anything that looks like a credential. */
  detail?: string;
}

export interface TutorServiceDeps {
  ports: TutorPorts;
  backends: readonly BackendSource[];
  log?: (entry: TutorLogEntry) => void;
  /**
   * Called once for every accepted review, before `done`: the place to write
   * `album_track_versions.review_json` or `transcriptions.review_json` (contracts §10.6). A
   * failure here is logged and does not fail the turn; the review is in the transcript either way.
   */
  onReview?: (accepted: AcceptedReview) => void | Promise<void>;
  /** Forward unlinted card drafts while they stream. Off by default (see RunOptions.cardDrafts). */
  cardDrafts?: boolean;
  /** How long an availability answer is reused. A `claude auth status` spawn per turn would be wasteful. */
  selectionTtlMs?: number;
}

/**
 * Not part of the tutor's answer: something the app tells the learner alongside it. One kind in
 * v1, the monthly soft marker (contracts §10.9: one toast, never a block).
 */
export interface TutorNotice {
  type: "notice";
  data: { kind: "budget_soft_marker"; message: string };
}
export type ServiceEvent = TutorEvent | TutorNotice;
export type ServiceEmit = (event: ServiceEvent) => void;

export interface TurnSummary {
  ok: boolean;
  errorKind: TutorErrorKind | null;
  backend: BackendId | null;
  softMarkerPassed: boolean;
}

export interface TutorStatus {
  /** The `/api/health` enum. */
  tutor: TutorHealth;
  active: BackendId | null;
  setting: TutorSettings["backend"];
  reason: string;
  guidance: string | null;
  model: string;
  backends: BackendReport[];
  budget: {
    month: string;
    monthUsd: number;
    softMarkerUsd: number;
    softPassed: boolean;
  };
  usage: MonthUsage & { cacheHitRatio: number };
}

export interface WarmResult {
  warmed: boolean;
  backend: BackendId | null;
  /** Why nothing was sent: an unavailable code, `not_needed`, `fresh`, or an error kind. */
  reason: string | null;
}

export interface TutorService {
  /**
   * Run one turn of any kind. Never throws. The last event it emits is `done` or `error`, and it
   * emits exactly one of them.
   */
  turn(request: TurnRequest, emit: ServiceEmit, signal: AbortSignal): Promise<TurnSummary>;
  status(opts?: { refresh?: boolean }): Promise<TutorStatus>;
  warm(signal?: AbortSignal): Promise<WarmResult>;
  thread(subject: SubjectRef, opts?: { limit?: number }): Promise<ThreadView>;
  applyCard(cardId: string): Promise<"applied" | "refused" | "unknown">;
  retractNote(noteId: string): Promise<void>;
  /** Forget cached availability, e.g. after the learner pasted a key or changed the backend. */
  refreshBackends(): void;
}
