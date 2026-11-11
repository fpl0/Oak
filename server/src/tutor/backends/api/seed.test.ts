import { describe, expect, test } from "bun:test";
import { prepareTurn } from "../../prepare.ts";
import { runTurn } from "../../run.ts";
import { makePorts } from "../../testing/fakes.ts";
import { ScriptedBackend } from "../../testing/scripted-backend.ts";
import type { TranscriptEntry } from "../../types.ts";
import { lessonRequest, messagesOf, requestAt, rig, runOn } from "./cassettes/harness.ts";
import { sequence, textOnly } from "./cassettes/scenarios.ts";
import { isMessageParam, seedMessages } from "./request.ts";

describe("a conversation this backend has no records of", () => {
  const entry = (over: Partial<TranscriptEntry>): TranscriptEntry => ({
    conversationId: "c",
    seq: 1,
    at: "2026-11-11T15:00:00.000Z",
    role: "user",
    kind: "chat",
    text: "",
    learnerCode: null,
    cardIds: [],
    review: null,
    stepId: null,
    rung: null,
    summary: null,
    backend: null,
    excluded: false,
    errorKind: null,
    ...over,
  });

  test("seedMessages: learner turns in their wrappers, tutor text as it was shown", () => {
    const seeded = seedMessages([
      entry({ role: "assistant", text: "An orphan reply with no question before it." }),
      entry({ text: "Why 7?", learnerCode: 'n("0 6")' }),
      entry({ role: "assistant", text: "Count from zero." }),
      entry({ text: "This one failed.", excluded: true }),
      entry({ text: "Show me." }),
      entry({ role: "assistant", text: "", cardIds: ["card-1"] }),
      entry({ text: "Thanks" }),
      entry({ role: "assistant", text: "", summary: "hint at rung 2 on S5" }),
    ]);
    expect(seeded).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: '<learner_code>\nn("0 6")\n</learner_code>' },
          { type: "text", text: "<learner_message>\nWhy 7?\n</learner_message>" },
        ],
      },
      { role: "assistant", content: [{ type: "text", text: "Count from zero." }] },
      { role: "user", content: [{ type: "text", text: "<learner_message>\nShow me.\n</learner_message>" }] },
      { role: "assistant", content: [{ type: "text", text: "(I showed a code card.)" }] },
      { role: "user", content: [{ type: "text", text: "<learner_message>\nThanks\n</learner_message>" }] },
      { role: "assistant", content: [{ type: "text", text: "(hint at rung 2 on S5)" }] },
    ]);
    expect(JSON.stringify(seeded)).not.toContain("oak_context");
  });

  test("after a switch of backend the transcript seeds the request and becomes part of the records", async () => {
    const ports = makePorts();
    // One turn answered by the other backend: a transcript entry, but no 'anthropic-api' records.
    const cli = new ScriptedBackend("claude-cli", [{ text: "Count from zero." }]);
    const prep = await prepareTurn(lessonRequest(), ports);
    await runTurn(prep, cli, () => {}, new AbortController().signal, ports);

    const r = rig(sequence("switch", textOnly(["Yes."]), textOnly(["Still yes."])), {}, ports);
    await runOn(r, lessonRequest({ userText: "So is it 7?" }));
    const sent = messagesOf(requestAt(r, 0));
    expect(sent.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(sent[1]?.content).toEqual([{ type: "text", text: "Count from zero." }]);
    expect(JSON.stringify(sent[2])).toContain("So is it 7?");

    // The seed was committed with the turn, so the next request extends this one exactly.
    await runOn(r, lessonRequest({ userText: "Sure?" }));
    const next = messagesOf(requestAt(r, 1));
    expect(next.slice(0, 3)).toEqual(sent as never);
    expect(next.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant", "user"]);
  });

  test("a stored record that is not a message is not sent", () => {
    expect(isMessageParam({ role: "user", content: "x" })).toBe(true);
    expect(isMessageParam({ sessionId: "s-1" })).toBe(false);
    expect(isMessageParam(null)).toBe(false);
  });
});
