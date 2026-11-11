// Cache warm-up (contracts §10.1): a non-streaming request with `max_tokens: 0` that writes the
// 1-hour prefix entry, so the learner's first question of a session reads it instead of paying
// for it. The prefix must be byte-identical to a chat request's, which is why it goes through
// the same builder.
import type Anthropic from "@anthropic-ai/sdk";
import { classifyThrown, TutorError } from "../../errors.ts";
import type { UsageSummary } from "../../events.ts";
import type { WarmInput } from "../../types.ts";
import { callUsage } from "../../usage.ts";
import { BACKEND_ID } from "./loop.ts";
import { buildRequest } from "./request.ts";

export async function warmPrefix(
  client: Anthropic,
  input: WarmInput,
  signal?: AbortSignal,
): Promise<UsageSummary> {
  const shape = { ...input, maxTokens: 0 };
  // No top-level cache_control: there is no conversation tail worth a second cache entry.
  const params = buildRequest(shape, [{ role: "user", content: "warmup" }], { tailCache: false });
  try {
    // `fallbacks` exists only on the beta namespace, so the warm-up uses it too.
    const msg = await client.beta.messages.create({ ...params, stream: false }, signal ? { signal } : {});
    return callUsage(BACKEND_ID, msg.usage, msg.model);
  } catch (e) {
    const info = classifyThrown(e, { aborted: signal?.aborted === true });
    throw new TutorError(
      info.kind,
      info.retryAfterSec === undefined ? {} : { retryAfterSec: info.retryAfterSec },
    );
  }
}
