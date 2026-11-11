// What a response's content means for the next request and for accounting.
import type {
  BetaContentBlock,
  BetaMessage,
  BetaToolUseBlock,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";

/**
 * A plain JSON copy: exactly what goes on the wire and into the store. The SDK hangs
 * non-enumerable helpers on the blocks of a final message (`parsed_output`, a lazy tool `input`);
 * a copy keeps stored history independent of them.
 */
export function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * With `fallbacks`, a response can hold content from the model that declined, then a `fallback`
 * block, then the fallback model's content. When the turn is sent back, the `fallback` block stays
 * where it is, and thinking and tool_use blocks from before the LAST one are left out (no
 * tool_result is sent for a tool_use that was left out). From the SDK's own documentation of
 * `BetaFallbackBlockParam`; no fallback-served stream has been observed live yet.
 */
export function normalizeFallbackBoundary(content: readonly BetaContentBlock[]): BetaContentBlock[] {
  const boundary = content.findLastIndex((b) => b.type === "fallback");
  if (boundary < 0) return [...content];
  return content.filter(
    (b, i) =>
      i >= boundary || (b.type !== "thinking" && b.type !== "redacted_thinking" && b.type !== "tool_use"),
  );
}

export function toolUses(content: readonly BetaContentBlock[]): BetaToolUseBlock[] {
  return content.filter((b): b is BetaToolUseBlock => b.type === "tool_use");
}

export function hasVisibleText(content: readonly BetaContentBlock[]): boolean {
  return content.some((b) => b.type === "text" && b.text.trim() !== "");
}

/**
 * Every model that produced part of this response, in order: both sides of each fallback hop (the
 * declining model's output ends at the boundary, the fallback's follows it), the responding model,
 * and any fallback attempt the usage breakdown names.
 */
export function servedModels(msg: BetaMessage): string[] {
  const models: string[] = [];
  for (const block of msg.content)
    if (block.type === "fallback") models.push(block.from.model, block.to.model);
  models.push(msg.model);
  for (const it of msg.usage.iterations ?? []) if (it.type === "fallback_message") models.push(it.model);
  return [...new Set(models)];
}
