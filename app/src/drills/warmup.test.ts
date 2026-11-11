import { describe, expect, test } from "bun:test";
import type { DrillSession, FamilyDef, FamilyId, WarmupItem } from "@oak/api";
import { createRegistry, DEFAULT_PROFILE } from "@oak/drills";
import { families } from "../../../content/families.ts";
import {
  clearInflight,
  doneItems,
  inflightKey,
  loadInflight,
  markItemDone,
  saveInflight,
} from "./inflight.ts";
import type { ResumeState } from "./machine.ts";
import type { TrialOutcome } from "./model.ts";
import { compositeSource, plannedSource, staircaseSource } from "./sources.ts";
import { budgetSpent, dayOfItem, itemKey, stepOf, warmupOrder } from "./warmup-model.ts";

const defs = new Map<string, FamilyDef>(families.map((f) => [f.id, f]));
const registry = createRegistry(families, []);

function item(over: Partial<WarmupItem>): WarmupItem {
  return {
    id: "2026-11-11:w:0",
    kind: "family-set",
    familyId: "fam.pit.compare" as FamilyId,
    members: [],
    cardIds: ["fam.pit.compare"],
    level: 1,
    trials: 10,
    estSec: 60,
    mic: false,
    rated: true,
    ...over,
  };
}

class MemoryStorage implements Storage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
}

function session(familyIds: string[], over: Partial<DrillSession> = {}): DrillSession {
  return {
    id: "drl_x",
    sessionId: null,
    purpose: "srs",
    familyIds: familyIds as FamilyId[],
    setId: "set_x",
    levels: Object.fromEntries(familyIds.map((f) => [f, 1])),
    openCategories: Object.fromEntries(familyIds.map((f) => [f, defs.get(f)?.levels[0]?.categories ?? []])),
    focus: {},
    trialsPlanned: 6,
    startedAt: "2026-11-11T10:00:00.000Z",
    finishedAt: null,
    ...over,
  };
}

describe("warm-up plan", () => {
  test("the anchor (the easy win) goes first; otherwise the server's interleaved order stands", () => {
    const a = item({ id: "d:w:0", kind: "family-set" });
    const b = item({ id: "d:w:1", kind: "anchor", familyId: "fam.rhy.pulse" as FamilyId });
    const c = item({ id: "d:w:2", kind: "listen" });
    expect(warmupOrder([a, b, c]).map((i) => i.id)).toEqual(["d:w:1", "d:w:0", "d:w:2"]);
    expect(warmupOrder([b, a, c]).map((i) => i.id)).toEqual(["d:w:1", "d:w:0", "d:w:2"]);
  });

  test("what each item runs as", () => {
    expect(stepOf(item({}), defs, false)).toMatchObject({
      kind: "set",
      purpose: "srs",
      familyIds: ["fam.pit.compare"],
    });
    expect(stepOf(item({ kind: "anchor" }), defs, false)).toMatchObject({ kind: "set", purpose: "anchor" });
    expect(stepOf(item({ kind: "repair" }), defs, false)).toMatchObject({ kind: "set", purpose: "repair" });
    expect(stepOf(item({ kind: "blocked-intro" }), defs, false)).toMatchObject({
      kind: "set",
      listenFirst: true,
    });
    expect(stepOf(item({ kind: "listen", level: 2 }), defs, false)).toEqual({
      kind: "listen",
      familyId: "fam.pit.compare",
      level: 2,
    });
    expect(
      stepOf(item({ kind: "fact-set", familyId: null, cardIds: ["fact.staff.treble.C4"] }), defs, false),
    ).toEqual({
      kind: "facts",
      cardIds: ["fact.staff.treble.C4"],
    });
    // A sung set in Quiet mode, a generator still pending, an unknown family: passed over.
    expect(stepOf(item({ familyId: "fam.pit.match" as FamilyId, mic: true }), defs, true)).toMatchObject({
      kind: "skip",
    });
    const withPending = new Map(defs);
    const subs = defs.get("fam.jzz.subs") as FamilyDef;
    withPending.set("fam.jzz.subs", { ...subs, generator: "pending:jazz-subs" });
    expect(stepOf(item({ familyId: "fam.jzz.subs" as FamilyId }), withPending, false)).toMatchObject({
      kind: "skip",
      reason: "pending",
    });
    expect(stepOf(item({ familyId: "fam.nope" as FamilyId }), defs, false)).toMatchObject({ kind: "skip" });
    // A composite review runs its playable members, without the sung one in Quiet mode.
    const mix = item({
      kind: "composite-set",
      familyId: "fam.mix.pitch" as FamilyId,
      members: ["fam.pit.compare", "fam.pit.match"] as FamilyId[],
    });
    expect(stepOf(mix, defs, false)).toMatchObject({
      kind: "set",
      familyIds: ["fam.pit.compare", "fam.pit.match"],
    });
    expect(stepOf(mix, defs, true)).toMatchObject({ kind: "set", familyIds: ["fam.pit.compare"] });
  });

  test("budget: sets stop once the warm-up runs a quarter past its minutes", () => {
    expect(budgetSpent(300, 300)).toBe(false);
    expect(budgetSpent(375, 300)).toBe(true);
    expect(budgetSpent(1000, 0)).toBe(false);
    expect(dayOfItem("2026-11-11:w:3")).toBe("2026-11-11");
    expect(itemKey(item({}))).toBe(itemKey(item({ id: "2026-11-11:w:9" })));
  });
});

describe("the set in flight", () => {
  const state: ResumeState = { session: session(["fam.pit.compare"]), outcomes: [], records: [] };

  test("saves, loads, expires after 12 hours, and clears", () => {
    const s = new MemoryStorage();
    const key = inflightKey({ warmupItemId: "d:w:0", familyIds: ["fam.pit.compare"], purpose: "srs" });
    expect(key).toBe("w:d:w:0|fam.pit.compare");
    expect(inflightKey({ warmupItemId: null, familyIds: ["fam.pit.compare"], purpose: "practice" })).toBe(
      "practice:fam.pit.compare",
    );
    saveInflight(key, state, 1_000, s);
    expect(loadInflight(key, 2_000, s)?.session.id).toBe("drl_x");
    expect(loadInflight("other", 2_000, s)).toBeNull();
    expect(loadInflight(key, 1_000 + 13 * 3_600_000, s)).toBeNull();
    saveInflight(key, state, 1_000, s);
    clearInflight(key, s);
    expect(loadInflight(key, 2_000, s)).toBeNull();
  });

  test("survives broken or missing storage", () => {
    const s = new MemoryStorage();
    s.setItem("oak.drills.inflight.v1", "{not json");
    expect(loadInflight("k", 0, s)).toBeNull();
    saveInflight("k", state, 0, s);
    expect(loadInflight("k", 1, s)).not.toBeNull();
    expect(loadInflight("k", 1, null)).toBeNull();
    saveInflight("k", state, 0, null);
  });

  test("a finished set is never resumed", () => {
    const s = new MemoryStorage();
    saveInflight(
      "k",
      { ...state, session: { ...state.session, finishedAt: "2026-11-11T10:05:00.000Z" } },
      0,
      s,
    );
    expect(loadInflight("k", 1, s)).toBeNull();
  });

  test("items done today are remembered per day", () => {
    const s = new MemoryStorage();
    markItemDone("2026-11-11", "a", s);
    markItemDone("2026-11-11", "b", s);
    expect([...doneItems("2026-11-11", s)]).toEqual(["a", "b"]);
    expect(doneItems("2026-11-12", s).size).toBe(0);
  });
});

describe("trial sources", () => {
  const env = { registry, states: new Map(), profile: DEFAULT_PROFILE, easyFirst: false, sungResolutions: 2 };
  const out = (correct: boolean): TrialOutcome => ({
    index: 0,
    familyId: "fam.pit.compare" as FamilyId,
    result: { credit: correct ? 1 : 0, correct, rtMs: 500, replays: 0, diagnostics: [] },
    revealed: false,
    sung: null,
    resolutionCredit: null,
  });

  test("a planned set is fixed by its session", () => {
    const fam = registry.family("fam.pit.compare" as FamilyId);
    const s = session(["fam.pit.compare"]);
    const a = plannedSource(env, fam, s);
    const b = plannedSource(env, fam, s);
    expect(a.total).toBe(6);
    expect(a.at(3, []).trial.seed).toBe(b.at(3, []).trial.seed);
  });

  test("a composite review interleaves its members, two trials each", () => {
    const src = compositeSource(env, session(["fam.pit.compare", "fam.rhy.pulse"]));
    expect(src.total).toBe(4);
    const fams = Array.from({ length: 4 }, (_, i) => src.at(i, []).trial.family);
    expect(new Set(fams)).toEqual(new Set(["fam.pit.compare", "fam.rhy.pulse"]));
    expect(fams[0]).not.toBe(fams[1]);
  });

  test("the free-practice staircase climbs after a run of right answers and eases back after a miss", () => {
    const fam = registry.family("fam.pit.compare" as FamilyId);
    const src = staircaseSource(
      fam,
      session(["fam.pit.compare"], { purpose: "practice" }),
      DEFAULT_PROFILE,
      1,
      3,
    );
    expect(src.total).toBe(10);
    expect(src.at(0, []).trial.level).toBe(1);
    // +0.10 per right answer: ten in a row reach level 2.
    const rights = Array.from({ length: 10 }, () => out(true));
    expect(src.levelAt(rights)).toBe(2);
    // −0.567 per miss: one miss drops back.
    expect(src.levelAt([...rights, out(false)])).toBe(1);
    // Capped at the highest open level; deterministic per index and history.
    expect(src.levelAt(Array.from({ length: 60 }, () => out(true)))).toBe(3);
    expect(src.at(4, rights).trial.seed).toBe(src.at(4, rights).trial.seed);
    // Skipped trials do not move the staircase.
    expect(src.levelAt([{ ...out(false), result: { ...out(false).result, skipped: true } }])).toBe(1);
  });
});
