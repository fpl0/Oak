// The ONLY place Anthropic request params are assembled (contracts §10.1). One shape for every
// route: what differs between routes is `max_tokens`, `output_config.effort` (fixed per
// conversation) and `messages`. Nothing volatile may reach `tools` or `system`: those are the
// cached prefix, and a single changed byte costs a full cache write.
//
// Typechecks against @anthropic-ai/sdk 1.8.0 beta Messages types without casts.
import type { AnthropicBeta } from "@anthropic-ai/sdk/resources/beta/beta";
import type {
  BetaMessageParam,
  BetaMessageStreamParams,
  BetaTextBlockParam,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { CONTEXT_VERSION, escapeReserved, userTurnBlocks } from "../../context.ts";
import { systemBlocks } from "../../prompt/persona.ts";
import type { ToolDef } from "../../tools/defs.ts";
import type { Effort, Prefix, TranscriptEntry, UserTurn } from "../../types.ts";

/** `fallbacks: "default"` needs the 2026-07-01 beta. The only beta in use (contracts §10.1). */
export const BETAS = ["server-side-fallback-2026-07-01"] as const satisfies readonly AnthropicBeta[];

/**
 * Where the newest `<oak_context>` block goes.
 *  - `user` (default, contracts §10.1): first text block of the user turn.
 *  - `system`: a `{ role: "system" }` message right after the user turn (blueprint §5.4). The
 *    contracts do not allow it until a live call has shown the API accepts it; it is here so that
 *    switching is a setting, not a rewrite.
 */
export type ContextPlacement = "user" | "system";

export interface RequestOptions {
  contextPlacement?: ContextPlacement;
  /** Top-level `cache_control`: a 5-minute breakpoint on the growing conversation tail. Default on. */
  tailCache?: boolean;
}

export interface RequestShape {
  model: string;
  effort: Effort;
  maxTokens: number;
  prefix: Prefix;
  tools: readonly ToolDef[];
}

export function buildSystem(prefix: Prefix): BetaTextBlockParam[] {
  const [persona, syllabus, catalog] = systemBlocks(prefix);
  return [
    { type: "text", text: persona },
    { type: "text", text: syllabus },
    // One explicit breakpoint at the end of the static prefix. Tools render before system, so this
    // caches the tools and all three blocks together for an hour.
    { type: "text", text: catalog, cache_control: { type: "ephemeral", ttl: "1h" } },
  ];
}

/** A fresh literal with a fixed key order; `messages` are passed through untouched. */
export function buildRequest(
  shape: RequestShape,
  messages: readonly BetaMessageParam[],
  opts: RequestOptions = {},
): BetaMessageStreamParams {
  return {
    model: shape.model,
    max_tokens: shape.maxTokens,
    betas: [...BETAS],
    fallbacks: "default",
    thinking: { type: "adaptive", display: "summarized" },
    output_config: { effort: shape.effort },
    // Never forced (contracts §10.1); reviews are delivered through the submit tools instead.
    tool_choice: { type: "auto" },
    tools: [...shape.tools],
    system: buildSystem(shape.prefix),
    ...(opts.tailCache === false ? {} : { cache_control: { type: "ephemeral" as const } }),
    messages: [...messages],
  };
}

const text = (t: string): BetaTextBlockParam => ({ type: "text", text: t });

/** The newest user turn as message params: one message, or two with `system` placement. */
export function userMessages(user: UserTurn, placement: ContextPlacement = "user"): BetaMessageParam[] {
  const [context = "", ...learner] = userTurnBlocks(user);
  if (placement === "user") return [{ role: "user", content: [context, ...learner].map(text) }];
  // The system message must directly follow a user message and be last or followed by an
  // assistant turn. Both hold here; a failed turn is never replayed, so the pair cannot dangle.
  return [
    { role: "user", content: learner.map(text) },
    { role: "system", content: context },
  ];
}

/**
 * An app-authored message in the middle of a turn (the review reminder). It is wrapped as
 * `<oak_context>`, because the persona tells the model that nothing else in a user turn is Oak's voice.
 */
export function appNote(note: string): BetaMessageParam {
  const block = `<oak_context v="${CONTEXT_VERSION}">\n${escapeReserved(note)}\n</oak_context>`;
  return { role: "user", content: [text(block)] };
}

function seedText(entry: TranscriptEntry): string {
  if (entry.text.trim() !== "") return entry.text;
  if (entry.summary !== null && entry.summary.trim() !== "") return `(${entry.summary})`;
  if (entry.review !== null) return "(I delivered the review.)";
  return entry.cardIds.length > 0 ? "(I showed a code card.)" : "";
}

/**
 * Messages for a conversation this backend has no records of (the learner switched backends).
 * Built from the app-level transcript: what the learner typed and what the panel showed. Earlier
 * `<oak_context>` blocks are not stored and are not rebuilt; the new turn carries the current one.
 */
export function seedMessages(transcript: readonly TranscriptEntry[]): BetaMessageParam[] {
  const out: { role: "user" | "assistant"; content: BetaTextBlockParam[] }[] = [];
  for (const entry of transcript) {
    if (entry.excluded) continue;
    let blocks: BetaTextBlockParam[];
    if (entry.role === "user") {
      const user = { oakContext: "", learnerCode: entry.learnerCode, text: entry.text };
      blocks = userTurnBlocks(user).slice(1).map(text);
    } else {
      const shown = seedText(entry);
      if (shown === "") continue;
      blocks = [text(shown)];
    }
    const last = out.at(-1);
    // Same role twice in a row (an assistant entry with nothing to show was skipped): one message.
    if (last && last.role === entry.role) last.content.push(...blocks);
    else if (out.length > 0 || entry.role === "user") out.push({ role: entry.role, content: blocks });
  }
  return out;
}

/** Records come back from the store as `unknown`; anything that is not a message is not sent. */
export function isMessageParam(record: unknown): record is BetaMessageParam {
  if (typeof record !== "object" || record === null) return false;
  const role = (record as { role?: unknown }).role;
  return role === "user" || role === "assistant" || role === "system";
}
