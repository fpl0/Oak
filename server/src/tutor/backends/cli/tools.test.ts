// Tool turns end to end: the fake CLI calls Oak's tools over real HTTP against the real endpoint,
// with the token from its command line. What is asserted is what actually left the server: the
// stdin prompt, the command line, and the tool results as the "CLI" received them.
import { afterEach, describe, expect, test } from "bun:test";
import type { Rung } from "../../domain.ts";
import { encodeSse } from "../../events.ts";
import { findLeaks, forbiddenKeys, leakMarkers } from "../../redaction.ts";
import {
  EXERCISE_REF,
  GRADE,
  LEARNER_CODE,
  LESSON_ID,
  SOLUTION_CODE,
  STEP,
  STEP_ID,
} from "../../testing/fixtures.ts";
import { type Harness, LESSON_THREAD, sentUpstream, startHarness } from "./testing/harness.ts";
import type { ScriptedCall } from "./testing/scenario.ts";

const CARD = {
  kind: "example",
  title: "Same shape in C",
  code: 'mel: n("0 2 4").scale("C4:major")',
  explanation: "Listen to the top.",
  bars: 4,
};
/** A "model" that asks every tool for everything it can. */
const GREEDY: ScriptedCall[] = [
  { name: "get_lesson_context", arguments: { lesson_id: LESSON_ID, step_id: STEP_ID } },
  {
    name: "compare_haps",
    arguments: {
      learner_code: null,
      target: { kind: "exercise", ref: EXERCISE_REF },
      from_bar: 1,
      bars: 1,
      mode: "auto",
    },
  },
  { name: "get_learner_progress", arguments: {} },
  { name: "evaluate_strudel", arguments: { code: LEARNER_CODE, from_bar: 1, bars: 1, key: "D dorian" } },
  { name: "propose_code", arguments: CARD },
];
const TOOL_TURN = { fixture: "tool-turn.jsonl", calls: GREEDY };

let h: Harness;
afterEach(() => h?.stop());

/** The text of every tool result as it arrived at the "CLI", taken from the HTTP response bodies. */
function receivedByCli(h: Harness, from = 0): string[] {
  return h
    .mcpLog()
    .filter((m) => m.method === "tools/call")
    .slice(from)
    .map((m) => {
      expect(m.status).toBe(200);
      const body = JSON.parse(m.body) as { result: { content: { text: string }[] } };
      return body.result.content[0]?.text ?? "";
    });
}

describe("no solution or expected value reaches the CLI below the allowed rung", () => {
  test.each([0, 1, 2, 3] as Rung[])("rung %i, over two chat turns and a hint", async (rung) => {
    h = startHarness({ runs: [TOOL_TURN] });
    h.ports.progress.set(STEP_ID, { rung, matchedMistakes: ["melody.degree-off-by-one"] });
    const markers = leakMarkers(STEP, GRADE);

    let checked = 0;
    for (const kind of ["chat", "chat", "explain"] as const) {
      const { events, result } = await h.turn({ kind });
      expect(result.ok).toBe(true);
      // Each turn is held to the rung it ran under: the hint turn climbs one step first.
      const level = (await h.ports.progress.stepState(LESSON_ID, STEP_ID)).rung;
      const start = h.starts().at(-1);
      const results = receivedByCli(h, checked);
      checked += results.length;
      expect(results).toHaveLength(GREEDY.length);

      // 1. The prompt on stdin: <oak_context>, the learner's code and message.
      expect(findLeaks(start?.stdin ?? "", markers, level)).toEqual([]);
      // 2. Every tool result, as received over HTTP.
      expect(findLeaks(results.join("\n"), markers, level)).toEqual([]);
      // 3. The command line (system prompt, MCP config, flags).
      expect(findLeaks(JSON.stringify(start?.argv), markers, level)).toEqual([]);
      // 4. No withheld key appears either (the static tool schemas are not part of this).
      const dynamic = `${start?.stdin}\n${results.join("\n")}`;
      for (const key of forbiddenKeys(level)) expect(dynamic.includes(key)).toBe(false);
      expect(dynamic.includes(SOLUTION_CODE)).toBe(false);
      // 5. What the browser was sent.
      expect(findLeaks(events.map(encodeSse).join(""), markers, level)).toEqual([]);

      // Not vacuous: the tools ran, said what they withheld, and opened up exactly at rung 2.
      expect(results.join("\n")).toContain(`"redacted_to_rung":${level}`);
      expect(results.join("\n").includes("melody.wrong-degree")).toBe(level >= 2);
      expect(start?.stdin).toContain(`hint_rung: ${level} of 4`);
    }
    expect((await h.ports.progress.stepState(LESSON_ID, STEP_ID)).rung).toBe(Math.min(3, rung + 1) as Rung);

    // The endpoint's own record is exactly what went over the wire.
    expect(h.toolResults.map((r) => r.content)).toEqual(receivedByCli(h));
    // And what was stored.
    const stored = JSON.stringify([
      await h.ports.conversations.timeline(LESSON_THREAD),
      h.ports.conversations.allBackendRecords(),
    ]);
    expect(findLeaks(stored, markers, Math.min(3, rung + 1) as Rung)).toEqual([]);
  });

  test("positive control: at rung 4 the reveal arrives, through the same path", async () => {
    // The recording of the spike's own reveal turn (evaluate, then a card, then the explanation).
    h = startHarness({ runs: [{ fixture: "reveal-card.jsonl", calls: GREEDY }] });
    h.ports.progress.set(STEP_ID, { rung: 4 });
    const { events } = await h.turn();
    const results = receivedByCli(h);
    expect(results[0]).toContain("0 2 4 7 4 2");
    expect(results[0]).toContain('"answer_policy":"may_reveal"');
    expect(results[1]).toContain('"redacted_to_rung":4');
    expect(findLeaks(sentUpstream(h), leakMarkers(STEP, GRADE), 3).length).toBeGreaterThan(0);
    expect(h.starts()[0]?.stdin).toContain("hint_rung: 4 of 4 · answer_policy: may_reveal");
    // After hint 4 a card on a graded step may be applied.
    expect(events.find((e) => e.type === "card")?.data).toMatchObject({
      apply: "applicable",
      applyAllowed: true,
    });
  });

  test("the rung is read on the server at every call: raising it mid-thread changes the next turn only", async () => {
    h = startHarness({ runs: [TOOL_TURN] });
    h.ports.progress.set(STEP_ID, { rung: 0 });
    await h.turn();
    expect(receivedByCli(h)[0]).toContain('"rung":0,"passed":false,"attempts":2,"answer_policy":"socratic"');
    expect(receivedByCli(h)[0]).toContain('"solution":null');
    h.ports.progress.set(STEP_ID, { rung: 4 }); // the learner pressed Reveal in the UI
    await h.turn({ userText: "Show me." });
    expect(receivedByCli(h, GREEDY.length)[0]).toContain('"rung":4');
    expect(receivedByCli(h, GREEDY.length)[0]).toContain("0 2 4 7 4 2");
    // Nothing in what the "model" sent could have done that: the scripted arguments are identical.
    expect(JSON.stringify(GREEDY)).not.toMatch(/rung/);
  });
});

describe("tool events and cards", () => {
  test("tool_start and tool_result come from the endpoint, in call order, before the reply", async () => {
    h = startHarness({ runs: [TOOL_TURN] });
    const { events, text } = await h.turn();
    const tools = events.filter((e) => e.type === "tool_start" || e.type === "tool_result");
    expect(tools.map((e) => `${e.type}:${e.data.name}`)).toEqual(
      GREEDY.flatMap((c) => [`tool_start:${c.name}`, `tool_result:${c.name}`]),
    );
    const ids = tools.map((e) => e.data.toolUseId);
    expect(new Set(ids).size).toBe(GREEDY.length);
    for (const id of ids) expect(id).toMatch(/^mcp_[0-9a-f]{8}_\d+$/);
    const firstText = events.findIndex((e) => e.type === "text");
    const lastTool = events.findLastIndex((e) => e.type === "tool_result");
    expect(lastTool).toBeLessThan(firstText);
    expect(text).toStartWith("Your ear is right.");
    expect(events.at(-1)).toMatchObject({ type: "done", data: { iterations: 3 } });
    // Tool results carry no content to the browser, only a summary.
    for (const e of events)
      if (e.type === "tool_result")
        expect(Object.keys(e.data)).toEqual(["toolUseId", "name", "ok", "summary"]);
  });

  test("a card on a graded step below hint 4 is preview-only: the server decides, not the model", async () => {
    h = startHarness({
      runs: [{ fixture: "code-card.jsonl", calls: [{ name: "propose_code", arguments: CARD }] }],
    });
    const { events, result } = await h.turn();
    const cards = events.filter((e) => e.type === "card");
    expect(cards).toHaveLength(1);
    expect(cards[0]?.data).toMatchObject({
      cardId: "card-1",
      kind: "example",
      title: "Same shape in C",
      code: CARD.code,
      bars: 4,
      apply: "preview_only",
      applyAllowed: false,
      lockedTools: [],
    });
    expect(cards[0]?.data.toolUseId).toBe(h.toolResults[0]?.toolUseId as string);
    expect(result.cardIds).toEqual(["card-1"]);
    expect(JSON.parse(h.toolResults[0]?.content ?? "{}")).toMatchObject({
      shown: true,
      apply: "preview_only",
    });
    // The transcript entry points at the card.
    const stored = await h.ports.conversations.timeline(LESSON_THREAD);
    expect(stored[1]?.cardIds).toEqual(["card-1"]);
  });

  test("on a sketch there is nothing to protect: the card may be applied", async () => {
    h = startHarness({
      runs: [{ fixture: "code-card.jsonl", calls: [{ name: "propose_code", arguments: CARD }] }],
    });
    const { events } = await h.turn({
      thread: { subjectKind: "sketch", subjectId: "sk-1" },
      stepId: undefined,
      graderResult: undefined,
    });
    expect(events.find((e) => e.type === "card")?.data).toMatchObject({
      apply: "applicable",
      applyAllowed: true,
    });
  });

  test("model-written code is strict-linted before it is evaluated or shown", async () => {
    const hostile = [
      'mel: n("0 2").scale("C4:major")\nfetch("http://127.0.0.1:8787/api/settings")',
      'mel: n("0 2").scale("C4:major")\nglobalThis["pro" + "cess"].exit(1)',
      'mel: n("0 2").scale("C4:major")\nimport("node:fs")',
    ];
    h = startHarness({
      runs: [
        {
          fixture: "code-card.jsonl",
          calls: [
            ...hostile.map((code) => ({ name: "propose_code", arguments: { ...CARD, code } })),
            { name: "evaluate_strudel", arguments: { code: hostile[0], from_bar: 1, bars: 1, key: null } },
          ],
        },
      ],
    });
    const { events, result } = await h.turn();
    expect(result.ok).toBe(true);
    expect(events.some((e) => e.type === "card")).toBe(false);
    for (const r of h.toolResults.slice(0, 3))
      expect(JSON.parse(r.content)).toMatchObject({ shown: false, card_id: null });
    expect(h.toolResults[3]?.content).toContain("lint");
    // The grader never saw any of it.
    expect(h.ports.grader.evaluated).toEqual([]);
    expect(JSON.stringify(events).includes("fetch(")).toBe(false);
  });

  test("tool inputs are validated although the schemas are strict", async () => {
    h = startHarness({
      runs: [
        {
          fixture: "code-card.jsonl",
          calls: [
            { name: "get_lesson_context", arguments: { lesson_id: LESSON_ID } },
            {
              name: "get_lesson_context",
              arguments: { lesson_id: LESSON_ID, step_id: STEP_ID, hint_rung: 4 },
            },
            { name: "propose_code", arguments: { ...CARD, apply: "applicable" } },
          ],
        },
      ],
    });
    const { events } = await h.turn();
    expect(h.toolResults.map((r) => r.isError)).toEqual([true, true, true]);
    for (const r of h.toolResults) expect(r.content).toContain("INVALID_JSON");
    expect(events.some((e) => e.type === "card")).toBe(false);
  });

  test("after the turn the token is dead: a replayed call reaches nothing", async () => {
    h = startHarness({ runs: [TOOL_TURN] });
    await h.turn();
    const config = JSON.parse(
      h.starts()[0]?.argv[(h.starts()[0]?.argv.indexOf("--mcp-config") as number) + 1] as string,
    );
    const { url, headers } = config.mcpServers.oak;
    const before = h.toolResults.length;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: GREEDY[0] }),
    });
    expect(((await res.json()) as { error: { code: number } }).error.code).toBe(-32001);
    expect(h.toolResults).toHaveLength(before);
    expect(h.registry.size).toBe(0);
  });
});
