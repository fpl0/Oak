import { describe, expect, test } from "bun:test";
import type { FamilyDef, FamilyId, SkillId } from "@oak/content-kit";
import { type CardKind, type CardStatus, dayFromIndex } from "@oak/srs";
import type { SrsRepo } from "../db/repos/srs.ts";
import {
  type FamilyStateRow,
  type RevlogEntry,
  type SrsCatalogPort,
  type SrsLearnerPort,
  SrsService,
  type SrsStore,
  type SrsWorkingState,
  type StoredCard,
} from "./srs.ts";

// The SQLite repository satisfies the port structurally (a compile-time check).
const _repoIsStore = (r: SrsRepo): SrsStore => r;
void _repoIsStore;

class MemoryStore implements SrsStore {
  cardsById = new Map<string, StoredCard>();
  fams = new Map<string, FamilyStateRow>();
  revlogs: RevlogEntry[] = [];
  card(id: string) {
    const s = this.cardsById.get(id);
    return s ? structuredClone(s) : null;
  }
  cards(f: { status?: CardStatus; kind?: CardKind } = {}) {
    return [...this.cardsById.values()]
      .filter(
        (s) =>
          (f.status === undefined || s.card.status === f.status) &&
          (f.kind === undefined || s.card.kind === f.kind),
      )
      .map((s) => structuredClone(s));
  }
  saveCard(
    card: StoredCard["card"],
    meta: {
      desiredRetention: number;
      payload?: unknown;
      introducedBy?: string | null;
      releasedAt?: string | null;
    },
    at: string,
  ) {
    const prev = this.cardsById.get(card.id);
    const s: StoredCard = {
      card: structuredClone(card),
      desiredRetention: meta.desiredRetention,
      payload: meta.payload ?? prev?.payload ?? null,
      introducedBy: meta.introducedBy ?? prev?.introducedBy ?? null,
      releasedAt: meta.releasedAt ?? prev?.releasedAt ?? null,
      createdAt: prev?.createdAt ?? at,
      updatedAt: at,
    };
    this.cardsById.set(card.id, s);
    return structuredClone(s);
  }
  setCardStatus(id: string, status: CardStatus) {
    const s = this.cardsById.get(id);
    if (s) s.card.status = status;
  }
  addRevlog(e: RevlogEntry) {
    this.revlogs.push(e);
    return this.revlogs.length;
  }
  family(id: string) {
    const f = this.fams.get(id);
    return f ? structuredClone(f) : null;
  }
  families() {
    return [...this.fams.values()].map((f) => structuredClone(f));
  }
  saveFamily(f: FamilyStateRow) {
    this.fams.set(f.familyId, structuredClone(f));
    return f;
  }
}

const famDef = (
  id: string,
  kind: FamilyDef["kind"],
  o: Partial<
    Pick<FamilyDef, "mix" | "mic" | "masteryLevel" | "trialsPerSet" | "estTrialSec" | "domain">
  > = {},
): FamilyDef =>
  ({
    id: id as FamilyId,
    title: id,
    kind,
    domain: o.domain ?? "degree",
    skills: [{ skill: "E04" as SkillId, w: 1 }],
    unlock: { lesson: "U03.L02" },
    categories: [],
    levels: Array.from({ length: 6 }, () => ({
      categories: [],
      replays: 2,
      instruments: [],
      keys: "C",
      tempo: [80, 100],
    })),
    masteryLevel: o.masteryLevel ?? 2,
    trialsPerSet: o.trialsPerSet ?? 6,
    fastRtMs: 2500,
    estTrialSec: o.estTrialSec ?? 10,
    retention: 0.85,
    mix: o.mix === undefined ? (kind === "concept" ? null : "pitch") : o.mix,
    answer: "choice",
    mic: o.mic ?? false,
    generator: "x",
  }) as unknown as FamilyDef;

function setup(
  opts: {
    quiet?: boolean;
    families?: FamilyDef[];
    deck?: { cardId: string; deckId: string; newPerDay: number }[];
  } = {},
) {
  const store = new MemoryStore();
  let state: SrsWorkingState | null = null;
  const families = new Map<string, FamilyDef>((opts.families ?? []).map((f) => [f.id, f]));
  const openLevel = new Map<string, number>();
  const catalog: SrsCatalogPort = {
    family: (id) => families.get(id) ?? null,
    levelLimits: (id) => ({ maxOpenLevel: openLevel.get(id) ?? 6, topLevel: 6, openCategories: ["a"] }),
    fact: (id) => (id.startsWith("fact.") ? { fastRtMs: 3000, skills: ["S04" as SkillId] } : null),
    openDeckCards: () => opts.deck ?? [],
  };
  const learner: SrsLearnerPort = {
    profile: () => ({
      targetMinutes: 20,
      timeZone: "Europe/Lisbon",
      rolloverHour: 4,
      quiet: opts.quiet ?? false,
      weeklyGoal: 5,
      singToleranceCents: 50,
    }),
    repairFamilies: () => [],
    debtSkills: () => [],
    nextLessonSkills: () => [],
  };
  return {
    store,
    openLevel,
    families,
    stateRef: () => state,
    deps: {
      store,
      catalog,
      learner,
      state: {
        get: () => state,
        put: (s: SrsWorkingState) => {
          state = structuredClone(s);
        },
      },
    },
  };
}

const day = (n: number, hour = 18) => new Date(Date.UTC(2027, 2, 1 + n, hour, 0, 0)); // March 2027, Lisbon = UTC
const outcome = (
  meanCredit: number,
  o: Partial<{
    medianRtMs: number;
    revealed: boolean;
    playedLevel: number | null;
    hintRung: 0 | 1 | 2 | 3 | 4;
  }> = {},
) => ({
  meanCredit,
  medianRtMs: o.medianRtMs ?? 3000,
  extraReplays: 0,
  hintRung: o.hintRung ?? 0,
  revealed: o.revealed ?? false,
  playedLevel: o.playedLevel ?? null,
  meanAbsCents: null,
});

describe("SrsService: seeding from a lesson", () => {
  test("families start active with blocked-intro sets, concept and term cards are rated by the seeding step, 2 terms per lesson", async () => {
    const t = setup({
      families: [
        famDef("fam.deg.fet-major", "perceptual"),
        famDef("fam.deg.index", "concept"),
        famDef("fam.deg.sing", "production", { mic: true }),
      ],
    });
    const svc = await SrsService.create(t.deps);
    const r = svc.seedFromLesson(
      {
        lessonId: "U03.L02",
        families: ["fam.deg.fet-major", "fam.deg.index", "fam.deg.sing"] as FamilyId[],
        conceptScores: { ["fam.deg.index" as FamilyId]: 0.9 },
        terms: [
          { factId: "fact.tonic", score: 1 },
          { factId: "fact.degree", score: 0.7 },
          { factId: "fact.scale", score: 1 },
        ],
      },
      day(0),
    );
    expect(r.glossaryOnly).toEqual(["fact.scale"]);
    expect(r.active.sort()).toEqual(
      ["fact.degree", "fact.tonic", "fam.deg.fet-major", "fam.deg.sing"].sort(),
    );
    // Only 2 new families a day: the concept family waits (it is the third).
    expect(r.deferred).toEqual(["fam.deg.index"]);
    expect(t.store.family("fam.deg.fet-major")?.blockedRemaining).toBe(2);
    expect(t.store.card("fam.deg.fet-major")?.card.reps).toBe(0);
    expect(t.store.card("fact.tonic")?.card.reps).toBe(1);
    expect(t.store.card("fact.degree")?.card.lastRatings).toEqual([2]); // 0.7 < 0.80 → Hard
    expect(t.store.card("fact.tonic")?.desiredRetention).toBe(0.85); // decision 2
    expect(t.store.revlogs).toHaveLength(2);
  });

  test("Quiet mode: a production family is created paused and never planned", async () => {
    const t = setup({ quiet: true, families: [famDef("fam.deg.sing", "production", { mic: true })] });
    const svc = await SrsService.create(t.deps);
    svc.seedFromLesson({ lessonId: "U03.L02", families: ["fam.deg.sing" as FamilyId], terms: [] }, day(0));
    expect(t.store.card("fam.deg.sing")?.card.status).toBe("paused");
    svc.prepareDay(day(1), 0);
    expect(svc.planWarmup(day(1), { gapDays: 0 }).items).toHaveLength(0);
  });

  test("the 12-family cap: the 13th family is deferred, then released oldest first when there is room", async () => {
    const defs = Array.from({ length: 13 }, (_, i) =>
      famDef(`fam.p.f${String(i).padStart(2, "0")}`, "perceptual", { masteryLevel: 6 }),
    );
    const t = setup({ families: defs });
    const svc = await SrsService.create(t.deps);
    for (let i = 0; i < 13; i++)
      svc.seedFromLesson({ lessonId: "U03.L02", families: [defs[i]?.id as FamilyId], terms: [] }, day(i));
    const active = t.store.cards({ status: "active", kind: "family" });
    expect(active.length).toBeLessThanOrEqual(12);
    expect(t.store.cards({ status: "deferred" }).length).toBeGreaterThan(0);
  });
});

describe("SrsService: warm-up and reviews", () => {
  test("the day after the lesson: blocked-intro sets are planned with their level and trial count", async () => {
    const t = setup({
      families: [
        famDef("fam.deg.fet-major", "perceptual"),
        famDef("fam.int.in-key", "perceptual", { domain: "interval" }),
      ],
    });
    const svc = await SrsService.create(t.deps);
    svc.seedFromLesson(
      { lessonId: "U04.L01", families: ["fam.deg.fet-major", "fam.int.in-key"] as FamilyId[], terms: [] },
      day(0),
    );
    svc.prepareDay(day(1), 0);
    const { items, plan } = svc.planWarmup(day(1), { gapDays: 0 });
    const sets = items.filter((i) => i.kind !== "listen");
    expect(sets.map((i) => i.kind)).toEqual(["blocked-intro", "blocked-intro"]);
    expect(sets[0]).toMatchObject({ level: 1, trials: 6, estSec: 60, rated: true, mic: false });
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    expect(plan.plannedSec).toBeLessThanOrEqual(300);
  });

  test("a family set: graded, capped at the 7-day cadence, level staircase, revlog, blocked-intro count", async () => {
    const t = setup({ families: [famDef("fam.deg.fet-major", "perceptual", { masteryLevel: 6 })] });
    const svc = await SrsService.create(t.deps);
    svc.seedFromLesson(
      { lessonId: "U03.L02", families: ["fam.deg.fet-major" as FamilyId], terms: [] },
      day(0),
    );
    let r = svc.review(
      {
        cardId: "fam.deg.fet-major",
        drillSessionId: "d1",
        outcome: outcome(0.96, { medianRtMs: 2000, playedLevel: 1 }),
      },
      day(1),
    );
    expect(r.rating).toBe("Easy");
    expect(r.scheduledDays).toBeLessThanOrEqual(7);
    expect(r.familyState?.blockedRemaining).toBe(1);
    expect(r.levelChange).toBeNull();
    r = svc.review(
      { cardId: "fam.deg.fet-major", drillSessionId: "d2", outcome: outcome(0.93, { playedLevel: 1 }) },
      day(2),
    );
    expect(r.rating).toBe("Good");
    expect(r.levelChange).toBe("promoted");
    expect(r.familyState?.level).toBe(2);
    r = svc.review({ cardId: "fam.deg.fet-major", drillSessionId: "d3", outcome: outcome(0.5) }, day(3));
    expect(r.rating).toBe("Again");
    expect(r.levelChange).toBe("demoted");
    expect(r.scheduledDays).toBe(1);
    expect(t.store.revlogs.map((l) => l.drillSessionId)).toEqual(["d1", "d2", "d3"]);
    expect(
      svc.review(
        { cardId: "fam.deg.fet-major", drillSessionId: null, outcome: outcome(1), disputed: true },
        day(4),
      ).rating,
    ).toBeNull();
  });

  test("a fact card: fast and right is Easy, revealed is Again", async () => {
    const t = setup();
    const svc = await SrsService.create(t.deps);
    svc.seedFromLesson(
      { lessonId: "U03.L06", families: [], terms: [{ factId: "fact.sharp", score: 1 }] },
      day(0),
    );
    expect(
      svc.review(
        { cardId: "fact.sharp", drillSessionId: null, outcome: outcome(1, { medianRtMs: 2000 }) },
        day(3),
      ).rating,
    ).toBe("Easy");
    expect(
      svc.review(
        { cardId: "fact.sharp", drillSessionId: null, outcome: outcome(1, { revealed: true }) },
        day(40),
      ).rating,
    ).toBe("Again");
  });

  test("graduation into a composite, composite sets with members, and recall of a weak member", async () => {
    const t = setup({
      families: [
        famDef("fam.deg.tonic", "perceptual", { masteryLevel: 2 }),
        famDef("fam.pit.compare", "perceptual", { masteryLevel: 2, domain: "pitch" }),
      ],
    });
    const svc = await SrsService.create(t.deps);
    svc.seedFromLesson(
      { lessonId: "U03.L01", families: ["fam.deg.tonic", "fam.pit.compare"] as FamilyId[], terms: [] },
      day(0),
    );
    let d = 1;
    let graduated = false;
    for (let i = 0; i < 12 && !graduated; i++) {
      const due = t.store.card("fam.deg.tonic")?.card.dueAt as string;
      d = Math.max(d + 1, Math.ceil((Date.parse(due) - Date.UTC(2027, 2, 1)) / 86_400_000));
      graduated = svc.review(
        { cardId: "fam.deg.tonic", drillSessionId: null, outcome: outcome(0.93) },
        day(d),
      ).graduated;
    }
    expect(graduated).toBe(true);
    expect(t.store.card("fam.deg.tonic")?.card.status).toBe("graduated");
    expect(t.store.family("fam.deg.tonic")?.compositeId).toBe("fam.mix.pitch");
    expect(t.store.card("fam.mix.pitch")?.card.kind).toBe("composite");
    // The composite set samples its members.
    const comp = t.store.card("fam.mix.pitch")?.card;
    const when = new Date(Date.parse(comp?.dueAt as string) + 3_600_000 * 10);
    svc.prepareDay(when, 0);
    const set = svc.planWarmup(when, { gapDays: 0 }).items.find((i) => i.kind === "composite-set");
    expect(set?.members).toEqual(["fam.deg.tonic"]);
    expect(set?.trials).toBe(2);
    // Six failed composite trials: the member is recalled into a free slot, in relearning.
    svc.review(
      {
        cardId: "fam.mix.pitch",
        drillSessionId: null,
        outcome: outcome(0.3),
        trials: Array.from({ length: 6 }, () => ({ familyId: "fam.deg.tonic", credit: 0 })),
      },
      when,
    );
    expect(t.stateRef()?.recallPending).toEqual(["fam.deg.tonic"]);
    const later = new Date(when.getTime() + 86_400_000);
    svc.prepareDay(later, 0);
    expect(t.store.card("fam.deg.tonic")?.card.status).toBe("active");
    expect(t.store.card("fam.deg.tonic")?.card.state).toBe(3);
    expect(t.store.family("fam.deg.tonic")?.compositeId).toBeNull();
    // Mastery's R and the shading see the composite through a graduated family.
    const recalls = svc.cardRecalls(later);
    expect(recalls.find((c) => c.cardId === "fam.pit.compare")?.weight).toBe(2);
  });

  test("a gated ladder: a graduated member is recalled when its next level opens", async () => {
    const t = setup({
      families: [
        famDef("fam.har.schema", "perceptual", { masteryLevel: 3, domain: "harmony", mix: "harmony" }),
      ],
    });
    const svc = await SrsService.create(t.deps);
    t.openLevel.set("fam.har.schema", 1);
    svc.seedFromLesson({ lessonId: "U06.L06", families: ["fam.har.schema" as FamilyId], terms: [] }, day(0));
    let d = 1;
    let graduated = false;
    for (let i = 0; i < 12 && !graduated; i++) {
      const due = t.store.card("fam.har.schema")?.card.dueAt as string;
      d = Math.max(d + 1, Math.ceil((Date.parse(due) - Date.UTC(2027, 2, 1)) / 86_400_000));
      graduated = svc.review(
        { cardId: "fam.har.schema", drillSessionId: null, outcome: outcome(0.93) },
        day(d),
      ).graduated;
    }
    expect(graduated).toBe(true); // at level 1 of a ladder whose level 2 is still closed
    expect(svc.recallOpenedLadders(day(d + 1))).toEqual([]);
    t.openLevel.set("fam.har.schema", 3);
    expect(svc.recallOpenedLadders(day(d + 1))).toEqual(["fam.har.schema"]);
  });

  test("evidence from other work: review-if-due within 2 days, otherwise the level moves and the schedule does not", async () => {
    const t = setup({ families: [famDef("fam.deg.fet-major", "perceptual", { masteryLevel: 6 })] });
    const svc = await SrsService.create(t.deps);
    svc.seedFromLesson(
      { lessonId: "U03.L02", families: ["fam.deg.fet-major" as FamilyId], terms: [] },
      day(0),
    );
    svc.review({ cardId: "fam.deg.fet-major", drillSessionId: null, outcome: outcome(0.92) }, day(1));
    const dueBefore = t.store.card("fam.deg.fet-major")?.card.dueAt;
    const ev = svc.otherWork(
      {
        source: "lesson",
        familyId: "fam.deg.fet-major" as FamilyId,
        meanCredit: 0.95,
        medianRtMs: 3000,
        playedLevel: 1,
      },
      day(2),
    );
    expect(ev.reviewed).toBeNull();
    expect(ev.levelChange).toBe("promoted");
    expect(t.store.card("fam.deg.fet-major")?.card.dueAt).toBe(dueBefore);
    const dueDay = Math.ceil((Date.parse(dueBefore as string) - Date.UTC(2027, 2, 1)) / 86_400_000);
    const r = svc.otherWork(
      {
        source: "gym",
        familyId: "fam.deg.fet-major" as FamilyId,
        meanCredit: 0.9,
        medianRtMs: 3000,
        playedLevel: 2,
      },
      day(dueDay - 1),
    );
    expect(r.reviewed?.rating).toBe("Good");
  });
});

describe("SrsService: the day", () => {
  test("deck cards arrive at the deck's daily pace", async () => {
    const deck = Array.from({ length: 10 }, (_, i) => ({
      cardId: `fact.keysig.${i}`,
      deckId: "deck.key.signature",
      newPerDay: 4,
    }));
    const t = setup({ deck });
    const svc = await SrsService.create(t.deps);
    svc.prepareDay(day(0), 0);
    expect(t.store.cards({ kind: "fact" })).toHaveLength(4);
    svc.prepareDay(day(0), 0); // idempotent within the day's caps
    expect(t.store.cards({ kind: "fact" })).toHaveLength(4);
    svc.prepareDay(day(1), 0);
    expect(t.store.cards({ kind: "fact" })).toHaveLength(8);
    const plan = svc.planWarmup(day(1), { gapDays: 0 });
    expect(plan.items.find((i) => i.kind === "fact-set")?.cardIds.length).toBeGreaterThan(0);
  });

  test("after a gap the backlog is spread over 5 to 7 days and no new cards arrive until it clears", async () => {
    const deck = Array.from({ length: 200 }, (_, i) => ({
      cardId: `fact.staff.${i}`,
      deckId: "deck.pit.staff-names",
      newPerDay: 6,
    }));
    const t = setup({ deck });
    const svc = await SrsService.create(t.deps);
    for (let d = 0; d < 20; d++) {
      svc.prepareDay(day(d), 0);
      for (const c of t.store.cards({ status: "active", kind: "fact" })) {
        if (svc.srs.dayOf(c.card.dueAt) <= svc.srs.dayOf(day(d))) {
          svc.review(
            { cardId: c.card.id, drillSessionId: null, outcome: outcome(1, { medianRtMs: 5000 }) },
            day(d),
          );
        }
      }
    }
    const n = t.store.cards({ kind: "fact" }).length;
    svc.prepareDay(day(40), 19);
    const s = t.stateRef() as SrsWorkingState;
    expect(s.backlogUntil).not.toBeNull();
    const deferred = Object.values(s.deferUntil);
    expect(deferred.length).toBeGreaterThan(0);
    const days = deferred.map((x) => x).sort();
    expect((days[days.length - 1] ?? "") <= dayFromIndex(svc.srs.dayOf(day(40)) + 6)).toBe(true);
    expect(t.store.cards({ kind: "fact" }).length).toBe(n); // no deck intake during the backlog
    const plan = svc.planWarmup(day(40), { gapDays: 19 });
    expect(plan.plan.plannedSec).toBeLessThanOrEqual(300);
    expect(svc.cardDto(t.store.cards()[0] as StoredCard, day(40)).retrievability).toBeGreaterThanOrEqual(0);
  });
});

describe("SrsService over the SQLite repository", () => {
  test("seed, plan, review and graduate through db/repos/srs.ts", async () => {
    const { openDb } = await import("../db/index.ts");
    const { SrsRepo } = await import("../db/repos/srs.ts");
    const db = openDb(":memory:");
    const t = setup({ families: [famDef("fam.deg.tonic", "perceptual", { masteryLevel: 2 })] });
    const repo = new SrsRepo(db);
    const svc = await SrsService.create({ ...t.deps, store: repo });
    svc.seedFromLesson(
      {
        lessonId: "U03.L01",
        families: ["fam.deg.tonic" as FamilyId],
        terms: [{ factId: "fact.tonic", score: 1 }],
      },
      day(0),
    );
    expect(repo.card("fam.deg.tonic")?.card.status).toBe("active");
    expect(repo.family("fam.deg.tonic")?.blockedRemaining).toBe(2);
    svc.prepareDay(day(1), 0);
    expect(svc.planWarmup(day(1), { gapDays: 0 }).items.some((i) => i.kind === "blocked-intro")).toBe(true);
    let graduated = false;
    let d = 0;
    for (let i = 0; i < 12 && !graduated; i++) {
      const due = repo.card("fam.deg.tonic")?.card.dueAt as string;
      d = Math.max(d + 1, Math.ceil((Date.parse(due) - Date.UTC(2027, 2, 1)) / 86_400_000));
      graduated = svc.review(
        { cardId: "fam.deg.tonic", drillSessionId: null, outcome: outcome(0.93) },
        day(d),
      ).graduated;
    }
    expect(graduated).toBe(true);
    expect(repo.card("fam.deg.tonic")?.card.status).toBe("graduated");
    expect(repo.card("fam.mix.pitch")?.card.kind).toBe("composite");
    expect(repo.revlog("fam.deg.tonic").length).toBeGreaterThanOrEqual(2);
    // The stored card round-trips: the model name and the last ratings survive.
    expect(repo.card("fam.deg.tonic")?.card.model).toBe("fsrs-7");
    expect(repo.card("fam.deg.tonic")?.card.lastRatings.length).toBe(2);
    db.close();
  });
});

describe("SrsService: the Again cascade", () => {
  test("in a backlog, after the third card entering relearning, weak items wait for tomorrow", async () => {
    const deck = Array.from({ length: 30 }, (_, i) => ({
      cardId: `fact.c.${String(i).padStart(2, "0")}`,
      deckId: "deck.chd.symbols",
      newPerDay: 6,
    }));
    const t = setup({ deck });
    const svc = await SrsService.create(t.deps);
    for (let d = 0; d < 6; d++) {
      svc.prepareDay(day(d), 0);
      for (const c of t.store.cards({ status: "active", kind: "fact" }))
        if (svc.srs.dayOf(c.card.dueAt) <= svc.srs.dayOf(day(d)))
          svc.review(
            { cardId: c.card.id, drillSessionId: null, outcome: outcome(1, { medianRtMs: 5000 }) },
            day(d),
          );
    }
    const back = day(80);
    svc.prepareDay(back, 70);
    const before = svc.planWarmup(back, { gapDays: 70 }).items.flatMap((i) => i.cardIds);
    expect(before.length).toBeGreaterThan(3);
    for (const id of before.slice(0, 3))
      svc.review({ cardId: id, drillSessionId: null, outcome: outcome(0) }, back);
    expect(t.stateRef()?.today.agains).toBe(3);
    const after = svc.planWarmup(back, { gapDays: 70, continuation: true });
    for (const id of after.items.flatMap((i) => i.cardIds)) {
      const c = t.store.card(id)?.card;
      if (c && c.reps > 0 && c.state === 2)
        expect(svc.srs.retrievability(c, back)).toBeGreaterThanOrEqual(0.6);
    }
  });
});
