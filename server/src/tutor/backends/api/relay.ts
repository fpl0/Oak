// Translates Anthropic stream events into the app-level protocol while a response streams.
// A backend may emit only `status`, `text`, `thinking`, `tool_start` and `tool_input`; the tool
// results, cards and reviews come from the executors, and `done` / `error` from the turn runner.
import type { BetaRawMessageStreamEvent } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { TutorEvent } from "../../events.ts";
import { toolStatusLabel } from "../../tools/labels.ts";
import type { Emit } from "../../types.ts";

type Phase = Extract<TutorEvent, { type: "status" }>["data"]["phase"];

/** The one tool with `eager_input_streaming`: its input is forwarded as a card draft. */
const DRAFTED_TOOL = "propose_code";

/** One relay per turn: the status line changes only when the phase or its label does. */
export function createRelay(emit: Emit): (event: BetaRawMessageStreamEvent) => void {
  let shown = "";
  const drafts = new Map<number, string>();

  const status = (phase: Phase, label: string) => {
    const key = `${phase}:${label}`;
    if (key === shown) return;
    shown = key;
    emit({ type: "status", data: { phase, label } });
  };

  return (event) => {
    if (event.type === "message_start") {
      // Content indexes start again with every response.
      drafts.clear();
    } else if (event.type === "content_block_start") {
      const block = event.content_block;
      if (block.type === "thinking") status("thinking", "Thinking");
      else if (block.type === "tool_use") {
        status("tool", toolStatusLabel(block.name));
        // Announced as soon as the block opens; the executor will not announce it again.
        emit({ type: "tool_start", data: { toolUseId: block.id, name: block.name } });
        if (block.name === DRAFTED_TOOL) drafts.set(event.index, block.id);
      }
    } else if (event.type === "content_block_delta") {
      const delta = event.delta;
      if (delta.type === "text_delta") {
        if (delta.text === "") return;
        status("writing", "Writing");
        emit({ type: "text", data: { delta: delta.text } });
      } else if (delta.type === "thinking_delta") {
        // Non-empty only because the request asks for `display: "summarized"`.
        if (delta.thinking !== "") emit({ type: "thinking", data: { delta: delta.thinking } });
      } else if (delta.type === "input_json_delta") {
        const toolUseId = drafts.get(event.index);
        if (toolUseId !== undefined && delta.partial_json !== "") {
          emit({ type: "tool_input", data: { toolUseId, partialJson: delta.partial_json } });
        }
      }
    }
  };
}
