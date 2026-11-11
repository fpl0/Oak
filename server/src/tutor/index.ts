// Public surface of the tutor's core, service and routes. Adapters and the browser client import
// from here; the files behind it may be reorganised without notice.
//
// The server does not assemble these by hand: `createDefaultTutor` in compose.ts builds both
// backends, the service and the Hono app (README, "Integration"). compose.ts is not re-exported
// here, so that importing this file never loads the Anthropic SDK or the CLI backend.
export * from "./context.ts";
export * from "./domain.ts";
export * from "./errors.ts";
export * from "./events.ts";
export {
  createTutorApp,
  DEFAULT_MAX_BODY_BYTES,
  type ExtraApp,
  TURN_ROUTES,
  type TutorAppDeps,
  WARM_PATHS,
} from "./http/routes.ts";
export * from "./http/schemas.ts";
export * from "./http/security.ts";
export {
  bunServerOf,
  encodeFrame,
  type IdleTimeoutServer,
  SSE_HEADERS,
  type SseOptions,
  type SseProducer,
  sseResponse,
} from "./http/sse.ts";
export {
  formatLintIssues,
  type LintIssue,
  type LintProfile,
  type LintRule,
  lintCode,
  lintStrict,
} from "./lint/strict.ts";
export * from "./markup.ts";
export * from "./ports.ts";
export { type PreparedTurn, prepareTurn } from "./prepare.ts";
export * from "./pricing.ts";
export {
  buildPrefix,
  PERSONA,
  prefixBytes,
  prefixVersion,
  systemBlocks,
  systemText,
} from "./prompt/persona.ts";
export * from "./redaction.ts";
export * from "./request.ts";
export * from "./reviews.ts";
export { type RunOptions, type RunResult, runTurn } from "./run.ts";
export { runReview } from "./run-review.ts";
export * from "./select.ts";
export { createTutorService, SOFT_MARKER_COPY } from "./service.ts";
export type * from "./service-types.ts";
export * from "./thread-view.ts";
export * from "./threads.ts";
export * from "./tools/defs.ts";
export {
  createToolSession,
  MAX_REVIEW_SUBMITS,
  MAX_TOOL_CALLS_PER_TURN,
  type ToolSession,
  type ToolSessionDeps,
} from "./tools/execute.ts";
export { type ApplyPolicy, applyCard, applyPolicyFor, applyStateFor } from "./tools/propose.ts";
export { acceptReview } from "./tools/review-submit.ts";
export * from "./tools/schemas.ts";
export * from "./types.ts";
export * from "./usage.ts";
