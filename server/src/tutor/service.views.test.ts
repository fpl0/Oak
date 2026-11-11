// The service's read side: status for Settings, the warm-up, the panel timeline, and the
// availability cache behind them.
import { describe, expect, test } from "bun:test";
import { PacedBackend } from "./http/testing/paced-backend.ts";
import { createTutorService } from "./service.ts";
import type { ServiceEvent } from "./service-types.ts";
import { type FakePorts, makePorts } from "./testing/fakes.ts";
import { LEARNER_CODE, LESSON_ID, STEP_ID } from "./testing/fixtures.ts";
import { ScriptedBackend } from "./testing/scripted-backend.ts";
import { MODEL, type TurnRequest, type TutorBackend, UNAVAILABLE } from "./types.ts";

const never = new AbortController().signal;
const SECRET = "sk-ant-api03-THIS-IS-THE-KEY-0123456789";
const lesson = { subjectKind: "lesson", subjectId: LESSON_ID } as const;
const chat: TurnRequest = { thread: lesson, kind: "chat", userText: "Why?" };

function setup(backends: (TutorBackend | (() => TutorBackend))[], ports: FakePorts = makePorts()) {
  const service = createTutorService({ ports, backends, log: () => {} });
  const run = async (request: TurnRequest) => {
    const events: ServiceEvent[] = [];
    await service.turn(request, (e) => events.push(e), never);
    return events;
  };
  return { ports, service, run };
}

describe("status", () => {
  test("says which backend is active and why the other is not, and never holds a credential", async () => {
    // A backend object that carries the key, as the real API backend will.
    const api = Object.assign(new PacedBackend("anthropic-api", [{ text: "ok" }]), { apiKey: SECRET });
    const cli = new PacedBackend("claude-cli");
    cli.isAvailable = { ok: false, reason: `not logged in; tried ${SECRET}` };
    const { service, run } = setup([api, cli]);
    await run(chat);
    const status = await service.status();
    expect(status).toMatchObject({
      tutor: "ready",
      active: "anthropic-api",
      setting: "auto",
      reason: "auto",
      guidance: null,
      model: MODEL,
      budget: { softMarkerUsd: 25, softPassed: false, hardCapUsd: null, blocked: false, month: "2026-11" },
    });
    expect(status.backends.map((b) => [b.id, b.ok, b.active, b.reason, b.billing])).toEqual([
      ["anthropic-api", true, true, null, "api"],
      ["claude-cli", false, false, "unreachable", "plan"],
    ]);
    expect(status.usage.inputTokens).toBe(100);
    expect(status.usage.cacheHitRatio).toBeCloseTo(1000 / 1100);
    expect(status.budget.monthUsd).toBeGreaterThan(0);
    const text = JSON.stringify(status);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain("sk-ant");
    expect(text).not.toContain("apiKey");
  });

  test("off and unavailable come with guidance", async () => {
    const api = new PacedBackend("anthropic-api");
    api.isAvailable = { ok: false, reason: UNAVAILABLE.invalidKey };
    const { service, ports } = setup([api]);
    const s = await service.status();
    expect(s).toMatchObject({ tutor: "invalid_key", active: null, reason: "invalid_key" });
    expect(s.guidance).toContain("rejected");
    expect(s.backends[1]).toMatchObject({ id: "claude-cli", wired: false, reason: "not_installed" });
    ports.settings.value.backend = "off";
    expect(await service.status()).toMatchObject({ tutor: "missing_key", active: null, reason: "off" });
  });
});

describe("availability is cached, briefly", () => {
  test("turns reuse one answer; a refresh, a setting change or an auth failure asks again", async () => {
    const api = new PacedBackend("anthropic-api", [{ text: "ok" }]);
    const cli = new PacedBackend("claude-cli", [{ text: "ok" }]);
    const { service, run, ports } = setup([api, cli]);
    await run(chat);
    await run(chat);
    expect(api.availableCalls).toBe(1);
    // The API answered, so selection never spawned the CLI's check.
    expect(cli.availableCalls).toBe(0);

    await service.status();
    expect([api.availableCalls, cli.availableCalls]).toEqual([2, 1]);
    await service.status();
    expect([api.availableCalls, cli.availableCalls]).toEqual([2, 1]);
    await service.status({ refresh: true });
    expect([api.availableCalls, cli.availableCalls]).toEqual([3, 2]);

    ports.settings.value.backend = "claude-cli";
    const events = await run(chat);
    expect(events[0]).toMatchObject({ type: "meta", data: { backend: "claude-cli" } });

    service.refreshBackends();
    const before = cli.availableCalls;
    await run(chat);
    expect(cli.availableCalls).toBe(before + 1);
  });

  test("a turn that fails to sign in drops the cached answer", async () => {
    const api = new ScriptedBackend("anthropic-api", [{ fail: "auth" }]);
    let asked = 0;
    api.available = async () => {
      asked++;
      return { ok: true };
    };
    const { run } = setup([api]);
    await run(chat);
    await run(chat);
    expect(asked).toBe(2);
  });

  test("backends may be thunks; one that throws is reported, not fatal", async () => {
    let built = 0;
    const { service, run } = setup([
      () => {
        built++;
        return new PacedBackend("claude-cli", [{ text: "ok" }]);
      },
      () => {
        throw new Error("SDK missing");
      },
    ]);
    expect(built).toBe(0);
    expect((await run(chat)).at(-1)?.type).toBe("done");
    await service.status();
    expect(built).toBe(1);
    expect((await service.status()).active).toBe("claude-cli");
  });
});

describe("warm-up", () => {
  test("primes the chat prefix once and is not repeated while it is fresh", async () => {
    const api = new PacedBackend("anthropic-api");
    const { service } = setup([api]);
    const [a, b] = await Promise.all([service.warm(), service.warm()]);
    expect(a).toEqual({ warmed: true, backend: "anthropic-api", reason: null });
    expect(b).toEqual(a);
    expect(api.warmCalls).toHaveLength(1);
    expect(api.warmCalls[0]).toMatchObject({ model: MODEL, effort: "medium" });
    expect(api.warmCalls[0]?.tools).toHaveLength(7);
    expect(await service.warm()).toEqual({ warmed: false, backend: "anthropic-api", reason: "fresh" });
    expect(api.warmCalls).toHaveLength(1);
  });

  test("no backend, no warm method, a spent cap and a failing call each answer without throwing", async () => {
    const off = new PacedBackend("anthropic-api");
    off.isAvailable = { ok: false, reason: UNAVAILABLE.missingKey };
    expect(await setup([off]).service.warm()).toEqual({
      warmed: false,
      backend: null,
      reason: "missing_key",
    });

    const scripted = new ScriptedBackend("claude-cli");
    expect(await setup([scripted]).service.warm()).toEqual({
      warmed: false,
      backend: "claude-cli",
      reason: "not_needed",
    });

    const capped = setup([new PacedBackend("anthropic-api", [{ text: "ok" }])]);
    await capped.run(chat);
    capped.ports.settings.value.hardMonthlyUsd = 0.001;
    expect(await capped.service.warm()).toMatchObject({ warmed: false, reason: "budget" });

    const failing = new PacedBackend("anthropic-api");
    failing.warmError = Object.assign(new Error(`bad ${SECRET}`), { status: 529 });
    const res = await setup([failing]).service.warm();
    expect(res).toEqual({ warmed: false, backend: "anthropic-api", reason: "overloaded" });
  });
});

describe("the panel timeline", () => {
  test("merges the subject's conversations in time order, tutor text as segments", async () => {
    const backend = new ScriptedBackend("anthropic-api", [
      { text: "Try [[deg:5]] in [[bars:2-3]]. <img src=x onerror=alert(1)> " },
      { text: "Or ask for the answer: [[reveal]]" },
      {
        tool: {
          name: "propose_code",
          input: {
            kind: "example",
            title: "A <b>climb</b>",
            code: 'mel: n("0 1 2 3").scale("C4:major")',
            explanation: "A different climb.",
            bars: 1,
          },
        },
      },
    ]);
    const { service, run, ports } = setup([backend]);
    const hint: TurnRequest = {
      thread: lesson,
      kind: "hint",
      userText: "",
      learnerCode: LEARNER_CODE,
      stepId: STEP_ID,
    };
    await run(hint);
    await run({ ...chat, stepId: STEP_ID });
    backend.script = [{ fail: "rate_limit" }];
    await run(chat);
    await ports.notes.add({
      day: "2026-11-11",
      subjectKind: "lesson",
      subjectId: LESSON_ID,
      source: "observation",
      text: "mixes up 4 and 6",
      skillId: null,
    });

    const view = await service.thread(lesson);
    expect(view.today).toBe("2026-11-11");
    expect(view.truncated).toBe(false);
    expect(view.entries.map((e) => [e.lane, e.role, e.failed])).toEqual([
      ["hint", "user", false],
      ["hint", "assistant", false],
      ["chat", "user", false],
      ["chat", "assistant", false],
      ["chat", "user", true],
      ["chat", "assistant", true],
    ]);
    const [user, tutor] = view.entries;
    expect(user).toMatchObject({ text: "Give me a nudge.", segments: null, hasLearnerCode: true, rung: 1 });
    expect(JSON.stringify(user)).not.toContain(LEARNER_CODE);
    const kinds = tutor?.segments?.map((s) => s.type);
    expect(kinds).toEqual(["text", "token", "text", "token", "text", "reveal"]);
    // Raw HTML never reaches the panel, in the text or in a card title.
    expect(JSON.stringify(view)).not.toContain("<img");
    expect(JSON.stringify(view)).not.toContain("<b>");
    expect(tutor?.cards).toMatchObject([{ kind: "example", apply: "preview_only", applied: false }]);
    expect(view.entries.at(-1)).toMatchObject({ errorKind: "rate_limit", backend: "anthropic-api" });
    expect(view.notes.map((n) => n.text)).toEqual(["mixes up 4 and 6"]);

    // Once the step has passed there is nothing left to reveal, so the token is plain text again.
    ports.progress.set(STEP_ID, { rung: 1, passed: true });
    const after = await service.thread(lesson);
    expect(after.entries[1]?.segments?.some((s) => s.type === "reveal")).toBe(false);

    const limited = await service.thread(lesson, { limit: 2 });
    expect(limited.entries).toHaveLength(2);
    expect(limited.truncated).toBe(true);
  });

  test("yesterday's messages are history: no live reveal button", async () => {
    const backend = new ScriptedBackend("anthropic-api", [{ text: "[[reveal]]" }]);
    const { service, run, ports } = setup([backend]);
    await run({ ...chat, stepId: STEP_ID });
    expect((await service.thread(lesson)).entries[1]?.segments).toEqual([
      { type: "reveal", raw: "[[reveal]]" },
    ]);
    ports.clock.advance(24 * 3_600_000);
    const next = await service.thread(lesson);
    expect(next.today).toBe("2026-11-12");
    expect(next.entries[1]?.segments).toEqual([{ type: "text", md: "[[reveal]]" }]);
  });

  test("cards can be applied only where the server made them applicable; notes can be retracted", async () => {
    const card = {
      kind: "example",
      title: "t",
      code: 's("bd sd")',
      explanation: "e",
      bars: 1,
    };
    const backend = new ScriptedBackend("anthropic-api", [{ tool: { name: "propose_code", input: card } }]);
    const { service, run, ports } = setup([backend]);
    await run({
      thread: { subjectKind: "general", subjectId: "general" },
      kind: "chat",
      userText: "show me",
    });
    await run({ ...chat, stepId: STEP_ID });
    expect(await service.applyCard("card-1")).toBe("applied");
    expect(await service.applyCard("card-2")).toBe("refused");
    expect(await service.applyCard("card-9")).toBe("unknown");
    expect((await ports.conversations.card("card-1"))?.applied).toBe(true);

    const note = await ports.notes.add({
      day: "2026-11-11",
      subjectKind: "general",
      subjectId: "general",
      source: "observation",
      text: "x",
      skillId: null,
    });
    await service.retractNote(note.id);
    expect(ports.notes.notes[0]?.retractedAt).toBe("2026-11-11T15:00:00.000Z");
  });
});
