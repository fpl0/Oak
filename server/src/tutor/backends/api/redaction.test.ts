// The cassette test of contracts §10.5 for this backend: a scripted model asks every tool for
// everything, and the RAW request bodies the SDK sends are searched for anything the learner's
// rung does not allow. The executors and the context builder do the redacting; this proves that
// nothing gets past them on the way to api.anthropic.com.
import { describe, expect, test } from "bun:test";
import type { Rung } from "../../domain.ts";
import { encodeSse } from "../../events.ts";
import { decodeNested, findLeaks, forbiddenKeys, leakMarkers, normalizeWs } from "../../redaction.ts";
import { GRADE, SOLUTION_CODE, STEP, STEP_ID, VARIANT_CODE } from "../../testing/fixtures.ts";
import { CASSETTE_KEY } from "./cassettes/fake-fetch.ts";
import {
  blocksOf,
  LESSON_THREAD,
  lessonRequest,
  requestAt,
  rig,
  runOn,
  wireMessages,
} from "./cassettes/harness.ts";
import { greedy, rungSmuggling, sequence } from "./cassettes/scenarios.ts";
import type { ContextPlacement } from "./request.ts";

const MARKERS = leakMarkers(STEP, GRADE);
const KINDS = ["chat", "chat", "explain"] as const;
const three = () => sequence("three-greedy-turns", greedy("a"), greedy("b"), greedy("c"));
const flat = (s: string) => normalizeWs(decodeNested(s));

describe("no solution or expected value is sent to the API below the allowed rung", () => {
  const placements: ContextPlacement[] = ["user", "system"];
  const cases = placements.flatMap((p) => ([0, 1, 2, 3] as Rung[]).map((rung) => [p, rung] as const));

  test.each(cases)(
    "context in the %s turn, rung %i: three turns of chat and hints",
    async (placement, rung) => {
      const r = rig(three(), { contextPlacement: placement });
      r.ports.progress.set(STEP_ID, { rung, matchedMistakes: ["melody.degree-off-by-one"] });
      const frames: string[] = [];

      for (const kind of KINDS) {
        const from = r.wire.length;
        // A chat turn never moves the rung; the hint turn may. Each turn is judged at its own level.
        const { prep, events } = await runOn(r, lessonRequest({ kind }));
        const level = prep.ctx.disclosure;
        const sent = r.wire.slice(from);
        expect(sent).toHaveLength(3);
        for (const w of sent) {
          // 1. The whole body, exactly as serialised: prefix, history, context, tool results.
          expect(findLeaks(w.bodyText, MARKERS, level)).toEqual([]);
          expect(flat(w.bodyText).includes(normalizeWs(SOLUTION_CODE))).toBe(false);
          // (Keys are checked in `messages` only: the tool list has an enum value "fix".)
          const messages = flat(wireMessages(w));
          for (const key of forbiddenKeys(level)) expect([key, messages.includes(key)]).toEqual([key, false]);
          expect(w.bodyText.includes(CASSETTE_KEY)).toBe(false);
        }
        frames.push(events.map(encodeSse).join(""));
      }

      const level = (await r.ports.progress.stepState("", STEP_ID)).rung;
      expect(level).toBe(Math.min(3, rung + 1) as Rung);
      // 2. Every SSE frame for the browser, and 3. everything stored.
      expect(findLeaks(frames.join(""), MARKERS, level)).toEqual([]);
      const stored = JSON.stringify([
        await r.ports.conversations.timeline(LESSON_THREAD),
        r.ports.conversations.allBackendRecords(),
      ]);
      expect(findLeaks(stored, MARKERS, level)).toEqual([]);
      expect(flat(stored).includes(normalizeWs(SOLUTION_CODE))).toBe(false);
    },
  );
});

describe("the scan can fail: what a rung allows IS in the request", () => {
  async function bodiesAt(state: { rung: Rung; passed?: boolean }): Promise<string> {
    const r = rig(greedy());
    r.ports.progress.set(STEP_ID, { ...state, matchedMistakes: ["melody.degree-off-by-one"] });
    await runOn(r);
    return flat(r.wire.map((w) => w.bodyText).join("\n"));
  }
  const [first, second] = GRADE.issues;
  const hints = STEP.hints ?? ["", "", "", ""];

  test("rung 4: the reference solution and the wrong variant reach the model", async () => {
    const sent = await bodiesAt({ rung: 4 });
    expect(sent.includes(normalizeWs(SOLUTION_CODE))).toBe(true);
    expect(sent.includes(normalizeWs(VARIANT_CODE))).toBe(true);
    expect(sent.includes(normalizeWs(second?.fix ?? "?"))).toBe(true);
    expect(sent.includes(normalizeWs(hints[3]))).toBe(true);
    expect(findLeaks(sent, MARKERS, 3).length).toBeGreaterThan(0);
  });

  test("a passed step is open at any rung", async () => {
    const sent = await bodiesAt({ rung: 0, passed: true });
    expect(sent.includes(normalizeWs(SOLUTION_CODE))).toBe(true);
  });

  test("rung 3: the fix for the first issue only", async () => {
    const sent = await bodiesAt({ rung: 3 });
    expect(sent.includes(normalizeWs(first?.fix ?? "?"))).toBe(true);
    expect(sent.includes(normalizeWs(first?.expected ?? "?"))).toBe(true);
    expect(sent.includes(normalizeWs(second?.fix ?? "?"))).toBe(false);
    expect(sent.includes(normalizeWs(hints[2]))).toBe(true);
    expect(sent.includes(normalizeWs(SOLUTION_CODE))).toBe(false);
  });

  test("rung 2: what is wrong and the known mistake, but no fix", async () => {
    const sent = await bodiesAt({ rung: 2 });
    expect(sent.includes(normalizeWs(first?.what ?? "?"))).toBe(true);
    expect(sent.includes(normalizeWs(STEP.knownMistakes[0]?.description ?? "?"))).toBe(true);
    expect(sent.includes(normalizeWs(first?.fix ?? "?"))).toBe(false);
  });

  test("rung 1: the nudge and nothing else; rung 0: not even that", async () => {
    const one = await bodiesAt({ rung: 1 });
    expect(one.includes(normalizeWs(hints[0]))).toBe(true);
    expect(one.includes(normalizeWs(hints[1]))).toBe(false);
    expect(one.includes(normalizeWs(first?.what ?? "?"))).toBe(false);
    const zero = await bodiesAt({ rung: 0 });
    expect(zero.includes(normalizeWs(hints[0]))).toBe(false);
    // Where the problem is, and the learner's own code, are always there.
    expect(zero.includes("issue 1: mel bar 1 beat 3")).toBe(true);
  });
});

test("the model cannot supply a rung: a tool call that carries one is rejected whole", async () => {
  const r = rig(rungSmuggling());
  const { events } = await runOn(r);
  const results = blocksOf(requestAt(r, 1), 2);
  expect(results.map((b) => [b.is_error, JSON.parse(b.content ?? "{}").error])).toEqual([
    [true, "INVALID_JSON"],
    [true, "INVALID_JSON"],
  ]);
  expect(r.ports.grader.compared).toEqual([]);
  expect(findLeaks(r.wire[1]?.bodyText ?? "", MARKERS, 0)).toEqual([]);
  expect(events.at(-1)?.type).toBe("done");
});
