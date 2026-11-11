import { describe, expect, test } from "bun:test";
import { makePorts } from "./testing/fakes.ts";
import { LESSON_ID, MAKE_STEP, STEP, STEP_ID, stepState } from "./testing/fixtures.ts";
import {
  checkBudget,
  conversationId,
  conversationKey,
  coupleHintRung,
  handoffLines,
  learnerDay,
  monthOf,
  openConversation,
  parseConversationId,
  seedNotes,
} from "./threads.ts";
import {
  effortFor,
  type Lane,
  laneFor,
  limitsFor,
  type NewTranscriptEntry,
  THREAD_KINDS,
  type ThreadKind,
} from "./types.ts";
import { callUsage } from "./usage.ts";

const subject = { subjectKind: "lesson", subjectId: LESSON_ID } as const;
const entry = (over: Partial<NewTranscriptEntry> = {}): NewTranscriptEntry => ({
  role: "user",
  kind: "chat",
  text: "hello",
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

describe("thread kinds", () => {
  test("six request kinds map onto the four conversations of the contract, each with a fixed effort", () => {
    const table: [ThreadKind, Lane, string, number, number][] = [
      ["chat", "chat", "medium", 16_000, 6],
      ["hint", "hint", "low", 4_000, 3],
      ["explain", "hint", "low", 4_000, 3],
      ["listening", "note", "low", 4_000, 2],
      ["review-capstone", "review", "high", 32_000, 8],
      ["review-transcription", "review", "high", 32_000, 8],
    ];
    expect(table.map((r) => r[0]).sort()).toEqual([...THREAD_KINDS].sort());
    for (const [kind, lane, effort, maxTokens, maxIterations] of table) {
      expect(laneFor(kind)).toBe(lane);
      expect(effortFor(kind)).toBe(effort as never);
      expect(limitsFor(kind)).toMatchObject({ maxTokens, maxIterations });
    }
    expect(limitsFor("hint")).toMatchObject({ maxWords: 80, maxCards: 1 });
    expect(limitsFor("chat").maxWords).toBe(200);
  });
});

describe("learner-local day with a 04:00 rollover", () => {
  test.each([
    ["2026-11-11T15:00:00Z", "UTC", "2026-11-11"],
    ["2026-11-11T03:59:59Z", "UTC", "2026-11-10"],
    ["2026-11-11T04:00:00Z", "UTC", "2026-11-11"],
    ["2026-11-11T00:30:00Z", "UTC", "2026-11-10"],
    // 23:30 in Lisbon is 23:30 UTC in winter: still the 11th.
    ["2026-11-11T23:30:00Z", "Europe/Lisbon", "2026-11-11"],
    // 02:00 in Tokyo on the 12th: before the rollover, so still the 11th.
    ["2026-11-11T17:00:00Z", "Asia/Tokyo", "2026-11-11"],
    ["2026-11-11T19:00:00Z", "Asia/Tokyo", "2026-11-12"],
    // 20:00 in Los Angeles on the 10th.
    ["2026-11-11T04:00:00Z", "America/Los_Angeles", "2026-11-10"],
    ["2026-01-01T02:00:00Z", "UTC", "2025-12-31"],
    ["2026-03-01T03:00:00Z", "UTC", "2026-02-28"],
    // The night the clocks change in Lisbon (01:00 -> 02:00): the boundary stays at 04:00 local.
    ["2026-03-29T02:30:00Z", "Europe/Lisbon", "2026-03-28"],
    ["2026-03-29T03:00:00Z", "Europe/Lisbon", "2026-03-29"],
  ])("%s in %s is %s", (iso, zone, day) => {
    expect(learnerDay(new Date(iso), zone)).toBe(day);
  });

  test("an unknown zone falls back to UTC instead of throwing", () => {
    expect(learnerDay(new Date("2026-11-11T15:00:00Z"), "Not/AZone")).toBe("2026-11-11");
  });

  test("monthOf", () => {
    expect(monthOf("2026-11-11")).toBe("2026-11");
  });
});

describe("conversation identity", () => {
  test("is <subjectKind>:<subjectId>:<day>:<threadKind>", () => {
    const key = conversationKey(subject, "explain", "2026-12-02");
    expect(key).toEqual({ subjectKind: "lesson", subjectId: "U03.L02", day: "2026-12-02", lane: "hint" });
    expect(conversationId(key)).toBe("lesson:U03.L02:2026-12-02:hint");
    expect(parseConversationId("lesson:U03.L02:2026-12-02:hint")).toEqual(key);
    expect(parseConversationId("sketch:a:b:2026-12-02:chat")).toMatchObject({ subjectId: "a:b" });
    for (const bad of [
      "lesson:U03.L02:2026-12-02",
      "nope:x:2026-12-02:chat",
      "lesson:x:2026-12-02:panel",
      "lesson:x:today:chat",
      "lesson::2026-12-02:chat",
    ]) {
      expect(parseConversationId(bad)).toBeNull();
    }
  });

  test("the first message of a new day starts a new conversation; yesterday's stays as history", async () => {
    const ports = makePorts();
    const init = { effort: "medium" as const, prefixVersion: "p1" };
    const day1 = learnerDay(ports.clock.now(), "UTC");
    const first = await openConversation(ports.conversations, conversationKey(subject, "chat", day1), init);
    expect(first.isFirstTurn).toBe(true);
    await ports.conversations.append(first.record.id, entry());
    await ports.conversations.append(first.record.id, entry({ role: "assistant", text: "hi" }));

    const again = await openConversation(ports.conversations, conversationKey(subject, "chat", day1), init);
    expect(again.record.id).toBe(first.record.id);
    expect(again.isFirstTurn).toBe(false);
    expect(again.transcript.map((e) => e.seq)).toEqual([1, 2]);

    // 03:00 the next morning is still the same learner day; 04:00 is not.
    ports.clock.set("2026-11-12T03:00:00Z");
    expect(learnerDay(ports.clock.now(), "UTC")).toBe(day1);
    ports.clock.set("2026-11-12T04:00:00Z");
    const day2 = learnerDay(ports.clock.now(), "UTC");
    const next = await openConversation(ports.conversations, conversationKey(subject, "chat", day2), init);
    expect(next.record.id).toBe("lesson:U03.L02:2026-11-12:chat");
    expect(next.isFirstTurn).toBe(true);
    expect(next.transcript).toEqual([]);
    // Nothing was deleted: the panel's merged timeline still has day one.
    expect((await ports.conversations.timeline(subject)).map((e) => e.conversationId)).toEqual([
      first.record.id,
      first.record.id,
    ]);
  });

  test("the lanes of one subject and day are separate conversations", async () => {
    const ports = makePorts();
    const init = { effort: "low" as const, prefixVersion: "p1" };
    const hint = await openConversation(
      ports.conversations,
      conversationKey(subject, "hint", "2026-11-11"),
      init,
    );
    const explain = await openConversation(
      ports.conversations,
      conversationKey(subject, "explain", "2026-11-11"),
      init,
    );
    const chat = await openConversation(
      ports.conversations,
      conversationKey(subject, "chat", "2026-11-11"),
      init,
    );
    expect(explain.record.id).toBe(hint.record.id);
    expect(chat.record.id).not.toBe(hint.record.id);
  });

  test("a failed tail is kept but never replayed", async () => {
    const ports = makePorts();
    const open = await openConversation(ports.conversations, conversationKey(subject, "chat", "2026-11-11"), {
      effort: "medium",
      prefixVersion: "p",
    });
    await ports.conversations.append(open.record.id, entry({ excluded: true, errorKind: null }));
    await ports.conversations.append(
      open.record.id,
      entry({ role: "assistant", excluded: true, errorKind: "refusal" }),
    );
    const again = await openConversation(
      ports.conversations,
      conversationKey(subject, "chat", "2026-11-11"),
      { effort: "medium", prefixVersion: "p" },
    );
    expect(again.transcript).toEqual([]);
    expect(again.isFirstTurn).toBe(true);
    expect(await ports.conversations.entries(open.record.id, { includeExcluded: true })).toHaveLength(2);
  });
});

describe("append-only store", () => {
  test("stored history cannot be changed: mutation throws", async () => {
    const ports = makePorts();
    const open = await openConversation(ports.conversations, conversationKey(subject, "chat", "2026-11-11"), {
      effort: "medium",
      prefixVersion: "p",
    });
    const stored = await ports.conversations.append(open.record.id, entry({ cardIds: ["card-1"] }));
    expect(() => {
      (stored as { text: string }).text = "rewritten";
    }).toThrow(TypeError);
    expect(() => stored.cardIds.push("card-2")).toThrow(TypeError);
    const [read] = await ports.conversations.entries(open.record.id);
    expect(() => {
      (read as { excluded: boolean }).excluded = true;
    }).toThrow(TypeError);
    expect(() => {
      (open.record as { effort: string }).effort = "high";
    }).toThrow(TypeError);
    // The port has no way to update or delete a message at all.
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(ports.conversations));
    expect(methods.filter((m) => /update|delete|remove|clear|edit/i.test(m))).toEqual([]);
  });

  test("backend records are append-only too, and an excluded commit is logged but not replayed", async () => {
    const ports = makePorts();
    const open = await openConversation(ports.conversations, conversationKey(subject, "chat", "2026-11-11"), {
      effort: "medium",
      prefixVersion: "p",
    });
    const id = open.record.id;
    await ports.conversations.appendBackendRecords(
      id,
      "anthropic-api",
      [{ role: "user" }, { role: "assistant" }],
      { excluded: false },
    );
    await ports.conversations.appendBackendRecords(id, "anthropic-api", [{ role: "user", refused: true }], {
      excluded: true,
    });
    await ports.conversations.appendBackendRecords(id, "claude-cli", [{ sessionId: "s1" }], {
      excluded: false,
    });
    expect(await ports.conversations.backendRecords(id, "anthropic-api")).toEqual([
      { role: "user" },
      { role: "assistant" },
    ]);
    expect(await ports.conversations.backendRecords(id, "claude-cli")).toEqual([{ sessionId: "s1" }]);
    expect(ports.conversations.allBackendRecords()).toHaveLength(4);
    const [rec] = await ports.conversations.backendRecords(id, "anthropic-api");
    expect(() => {
      (rec as { role: string }).role = "system";
    }).toThrow(TypeError);
  });

  test("a second conversation for the same key is refused", async () => {
    const ports = makePorts();
    const key = conversationKey(subject, "chat", "2026-11-11");
    await ports.conversations.create({ id: conversationId(key), key, effort: "medium", prefixVersion: "p" });
    const again = ports.conversations.create({
      id: conversationId(key),
      key,
      effort: "medium",
      prefixVersion: "p",
    });
    await expect(again).rejects.toThrow("UNIQUE");
  });
});

describe("seeding from tutor notes", () => {
  test("the 10 most recent non-retracted notes: this subject first, then general", async () => {
    const ports = makePorts();
    const add = (subjectKind: string, subjectId: string, text: string) =>
      ports.notes.add({
        day: "2026-11-10",
        subjectKind,
        subjectId,
        source: "observation",
        text,
        skillId: null,
      });
    for (let i = 0; i < 4; i++) await add("general", "general", `g${i}`);
    for (let i = 0; i < 8; i++) await add("lesson", LESSON_ID, `l${i}`);
    await add("lesson", "U09.L01", "other lesson");
    const retracted = await add("lesson", LESSON_ID, "retracted");
    await ports.notes.retract(retracted.id, "2026-11-10T12:00:00Z");

    const seeded = await seedNotes(ports.notes, subject);
    expect(seeded.map((n) => n.text)).toEqual(["l7", "l6", "l5", "l4", "l3", "l2", "l1", "l0", "g3", "g2"]);
    const general = await seedNotes(ports.notes, { subjectKind: "general", subjectId: "general" });
    expect(general.map((n) => n.text)).toEqual(["g3", "g2", "g1", "g0"]);
  });

  test("a retracted note is dropped even if a store returns it", async () => {
    const ports = makePorts();
    const n = await ports.notes.add({
      day: "2026-11-10",
      subjectKind: "lesson",
      subjectId: LESSON_ID,
      source: "listening",
      text: "x",
      skillId: null,
    });
    ports.notes.recent = async () => [{ ...n, retractedAt: "2026-11-10T12:00:00Z" }];
    expect(await seedNotes(ports.notes, subject)).toEqual([]);
  });
});

describe("hand-offs to the chat conversation", () => {
  test("are the summaries other conversations wrote since the last chat turn", async () => {
    const ports = makePorts();
    const init = { effort: "low" as const, prefixVersion: "p" };
    const chat = await openConversation(
      ports.conversations,
      conversationKey(subject, "chat", "2026-11-11"),
      init,
    );
    const hint = await openConversation(
      ports.conversations,
      conversationKey(subject, "hint", "2026-11-11"),
      init,
    );
    await ports.conversations.append(
      hint.record.id,
      entry({ role: "assistant", kind: "hint", summary: "hint at rung 1 on S5" }),
    );
    await ports.conversations.append(chat.record.id, entry());
    await ports.conversations.append(
      hint.record.id,
      entry({ role: "assistant", kind: "hint", summary: "hint at rung 2 on S5" }),
    );
    await ports.conversations.append(
      hint.record.id,
      entry({ role: "assistant", kind: "hint", summary: "failed", excluded: true }),
    );
    const day = await ports.conversations.subjectDay(subject, "2026-11-11");
    expect(handoffLines(day, chat.record.id)).toEqual(["hint at rung 2 on S5"]);
    await ports.conversations.append(chat.record.id, entry());
    expect(handoffLines(await ports.conversations.subjectDay(subject, "2026-11-11"), chat.record.id)).toEqual(
      [],
    );
  });
});

describe("tutor hints count on the same ladder", () => {
  test("a hint request climbs one rung, up to 3 and never to 4", async () => {
    const ports = makePorts();
    let state = stepState({ rung: 0 });
    for (const expected of [1, 2, 3, 3, 3]) {
      ports.progress.states.set(STEP_ID, state);
      state = await coupleHintRung("hint", STEP, state, ports.progress);
      expect(state.rung).toBe(expected as never);
    }
    expect(ports.progress.advances.map((a) => a.to)).toEqual([1, 2, 3]);
  });

  test("'explain' is on the hint conversation and climbs too; chat, notes and reviews never do", async () => {
    const ports = makePorts();
    ports.progress.set(STEP_ID, { rung: 1 });
    expect((await coupleHintRung("explain", STEP, stepState({ rung: 1 }), ports.progress)).rung).toBe(2);
    for (const kind of ["chat", "listening", "review-capstone", "review-transcription"] as const) {
      expect((await coupleHintRung(kind, STEP, stepState({ rung: 1 }), ports.progress)).rung).toBe(1);
    }
  });

  test("no climb on a passed step, a Make step, or after the UI's reveal", async () => {
    const ports = makePorts();
    expect(
      (await coupleHintRung("hint", STEP, stepState({ rung: 1, passed: true }), ports.progress)).rung,
    ).toBe(1);
    expect((await coupleHintRung("hint", MAKE_STEP, stepState({ rung: 0 }), ports.progress)).rung).toBe(0);
    expect((await coupleHintRung("hint", STEP, stepState({ rung: 4 }), ports.progress)).rung).toBe(4);
    expect(ports.progress.advances).toEqual([]);
  });

  test("a store that answers 4 cannot open the reveal from here", async () => {
    const ports = makePorts();
    ports.progress.advanceHintRung = async () => 4;
    expect((await coupleHintRung("hint", STEP, stepState({ rung: 2 }), ports.progress)).rung).toBe(3);
    ports.progress.advanceHintRung = async () => 0;
    expect((await coupleHintRung("hint", STEP, stepState({ rung: 2 }), ports.progress)).rung).toBe(2);
  });
});

describe("budget", () => {
  const spend = async (ports: ReturnType<typeof makePorts>, usd: number, day = "2026-11-05", cli = false) => {
    const usage = callUsage(
      cli ? "claude-cli" : "anthropic-api",
      { input_tokens: 0, output_tokens: (usd / 20) * 1e6 },
      "claude-opus-5-5",
    );
    await ports.usage.record({
      at: `${day}T10:00:00Z`,
      day,
      conversationId: "c",
      kind: "chat",
      lane: "chat",
      usage,
    });
  };

  test("the soft marker warns once and never blocks", async () => {
    const ports = makePorts();
    await spend(ports, 10);
    expect(await checkBudget(ports)).toMatchObject({
      month: "2026-11",
      softPassed: false,
      firstSoftCrossing: false,
    });
    await spend(ports, 20);
    const status = await checkBudget(ports);
    expect(status).toMatchObject({
      softPassed: true,
      firstSoftCrossing: true,
      softMarkerUsd: 25,
    });
    expect(status.monthUsd).toBeCloseTo(30, 6);
    await ports.settings.markSoftWarned("2026-11");
    expect(await checkBudget(ports)).toMatchObject({ softPassed: true, firstSoftCrossing: false });
  });

  test("there is no hard cap: heavy spend only passes the soft marker", async () => {
    const ports = makePorts();
    await spend(ports, 500);
    const status = await checkBudget(ports);
    expect(Object.keys(status).sort()).toEqual([
      "firstSoftCrossing",
      "month",
      "monthUsd",
      "softMarkerUsd",
      "softPassed",
    ]);
    expect(status).toMatchObject({ softPassed: true, firstSoftCrossing: true });
    expect(status.monthUsd).toBeCloseTo(500, 6);
  });

  test("it resets with the month, and subscription usage never counts", async () => {
    const ports = makePorts();
    await spend(ports, 100, "2026-10-28");
    await spend(ports, 100, "2026-11-03", true);
    expect(await checkBudget(ports)).toMatchObject({
      monthUsd: 0,
      softPassed: false,
      firstSoftCrossing: false,
    });
  });
});
