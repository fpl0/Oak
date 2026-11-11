import { describe, expect, test } from "bun:test";
import type { FamilyId } from "@oak/content-kit";
import {
  type CompositeMember,
  cardWeight,
  compositeSetSec,
  createSrs,
  factMeta,
  familyMeta,
  freshness,
  isDueOn,
  memberAccuracy,
  memberNeedsRecall,
  nodeFreshness,
  nodeOpacity,
  nodeRetrievability,
  planCompositeSet,
  reviewItem,
  stepLevel,
} from "./index.ts";

const fam = (s: string) => `fam.${s}` as FamilyId;
const member = (id: string, credits: number[] = [1, 1, 1, 1, 1, 1], mic = false): CompositeMember => ({
  family: fam(id),
  recentCredits: credits,
  mic,
});

describe("composite cards", () => {
  test("recall: the last 6 composite trials average below 0.65", () => {
    expect(memberNeedsRecall([1, 1, 0, 0, 0, 1])).toBe(true); // 0.5
    expect(memberNeedsRecall([1, 1, 1, 0, 0, 1])).toBe(false); // 0.67
    expect(memberNeedsRecall([0, 0, 0])).toBe(false); // not enough evidence yet
    expect(memberNeedsRecall([0, 0, 0, 0, 1, 1, 1, 1, 1, 0])).toBe(false); // the window is the last 6
    expect(memberAccuracy([])).toBe(0.5);
  });

  test("one set: up to 10 trials, 2 per member, at most one sung member, none in Quiet mode", () => {
    const members = [
      member("deg.sing", undefined, true),
      member("int.sing", undefined, true),
      ...["a", "b", "c", "d", "e", "f"].map((x) => member(`x.${x}`)),
    ];
    const set = planCompositeSet(members, { quiet: false, setKey: "fam.mix.pitch:3" });
    expect(set.trials).toBe(10);
    expect(set.members).toHaveLength(5);
    expect(set.members.every((m) => m.trials === 2)).toBe(true);
    expect(set.members.filter((m) => m.family.includes("sing")).length).toBeLessThanOrEqual(1);
    const quiet = planCompositeSet(members, { quiet: true, setKey: "fam.mix.pitch:3" });
    expect(quiet.members.some((m) => m.family.includes("sing"))).toBe(false);
    expect(planCompositeSet(members.slice(2, 4), { quiet: false, setKey: "k" }).trials).toBe(4);
    expect(planCompositeSet(members, { quiet: false, setKey: "same" })).toEqual(
      planCompositeSet(members, { quiet: false, setKey: "same" }),
    );
  });

  test("recalled members are always in; members rotate weighted toward the lowest recent accuracy", () => {
    const strong = ["a", "b", "c", "d", "e", "f", "g"].map((x) => member(`s.${x}`));
    const weak = member("w.weak", [0, 1, 0, 1, 0, 1]);
    const recalled = { ...member("r.back"), recalled: true };
    let weakIn = 0;
    let strongIn = 0;
    for (let k = 0; k < 400; k++) {
      const set = planCompositeSet([...strong, weak, recalled], { quiet: false, setKey: `mix:${k}` });
      expect(set.members.some((m) => m.family === fam("r.back"))).toBe(true);
      if (set.members.some((m) => m.family === fam("w.weak"))) weakIn++;
      if (set.members.some((m) => m.family === fam("s.a"))) strongIn++;
    }
    expect(weakIn).toBeGreaterThan(strongIn * 1.5);
    expect(strongIn).toBeGreaterThan(0);
  });

  test("planning estimate of a composite set", () => {
    expect(compositeSetSec(1)).toBe(15);
    expect(compositeSetSec(9)).toBe(75);
  });
});

describe("skill-map shading (contracts §7.10)", () => {
  test("freshness is relative to each card's own desired retention", () => {
    expect(freshness(0.9, 0.9)).toBe(1);
    expect(freshness(0.85, 0.9)).toBeCloseTo(1, 9); // the 0.05 band
    expect(freshness(0.6, 0.9)).toBe(0);
    expect(freshness(0.725, 0.9)).toBeCloseTo(0.5, 9);
    expect(freshness(0.8, 0.8)).toBe(1); // a composite on schedule is fully fresh
    expect(freshness(0.8, 0.9)).toBeCloseTo(0.8, 9);
  });
  test("the node: weighted mean (perceptual ×2), never the minimum; opacity 0.35 + 0.65·F", () => {
    const cards = [
      { retrievability: 0.6, desiredRetention: 0.9, weight: 1 }, // 0
      { retrievability: 0.85, desiredRetention: 0.85, weight: cardWeight("family", true) }, // 1, ×2
    ];
    expect(nodeFreshness(cards)).toBeCloseTo(2 / 3, 9);
    expect(nodeOpacity(cards)).toBeCloseTo(0.35 + 0.65 * (2 / 3), 9);
    expect(nodeOpacity([])).toBeNull();
    expect(nodeRetrievability(cards)).toBeCloseTo((0.6 + 1.7) / 3, 9);
    expect([
      cardWeight("fact", false),
      cardWeight("concept", false),
      cardWeight("family", false),
      cardWeight("composite", true),
    ]).toEqual([1, 1, 1, 2]);
  });
});

describe("level staircase", () => {
  const lim = { maxOpenLevel: 5, topLevel: 6 };
  test("promote after two sets ≥ 0.90 on two different days; demote after one set < 0.60", () => {
    let s = stepLevel({ level: 2, promoDay: null }, 0.92, 100, lim);
    expect(s).toEqual({ level: 2, promoDay: 100, change: null });
    s = stepLevel(s, 0.95, 100, lim); // same day: no
    expect(s.level).toBe(2);
    s = stepLevel(s, 0.9, 101, lim);
    expect(s).toEqual({ level: 3, promoDay: null, change: "promoted" });
    expect(stepLevel(s, 0.59, 102, lim)).toEqual({ level: 2, promoDay: null, change: "demoted" });
    expect(stepLevel({ level: 1, promoDay: 5 }, 0.3, 102, lim)).toEqual({
      level: 1,
      promoDay: null,
      change: null,
    });
    expect(stepLevel({ level: 3, promoDay: 7 }, 0.8, 9, lim)).toEqual({
      level: 3,
      promoDay: 7,
      change: null,
    });
  });
  test("never past the highest open level; the strong day is remembered for when the gate opens", () => {
    const s = stepLevel({ level: 5, promoDay: 10 }, 0.95, 12, lim);
    expect(s).toEqual({ level: 5, promoDay: 10, change: null });
    expect(stepLevel(s, 0.95, 13, { maxOpenLevel: 6, topLevel: 6 }).level).toBe(6);
  });
});

describe("review items from stored cards", () => {
  test("due by learner day, fresh only for never-reviewed facts, cadence passed to the forecast", async () => {
    const srs = await createSrs({ timeZone: "Europe/Lisbon" });
    const now = new Date("2027-03-01T10:00:00Z");
    const today = srs.dayOf(now);
    const def = {
      id: fam("deg.fet-major"),
      kind: "perceptual" as const,
      domain: "degree" as const,
      skills: [
        { skill: "E04" as const, w: 1 },
        { skill: "E05/b6" as const, w: 1 },
        { skill: "E04/x" as const, w: 0.5 },
      ],
      trialsPerSet: 8,
      estTrialSec: 9,
    };
    const meta = familyMeta(def, { blockedIntroPending: true, repeatDays: 7 });
    expect(meta).toMatchObject({
      cls: "family",
      perceptual: true,
      sec: 72,
      mic: false,
      skills: ["E04", "E05"],
    });
    const card = srs.createCard("family", def.id, now);
    const it = reviewItem(srs, card, meta, now);
    expect(it).toMatchObject({
      cardId: def.id,
      dueDay: today,
      recall: 0,
      blockedIntroPending: true,
      repeatDays: 7,
    });
    expect(it.fresh).toBeUndefined();
    const fact = reviewItem(srs, srs.createCard("fact", "fact.x", now), factMeta(["S04"]), now);
    expect(fact).toMatchObject({ cls: "fact", sec: 8, fresh: true, domain: "fact" });
    const reviewed = srs.rate(card, 3, now).card;
    expect(isDueOn(srs, reviewed, today)).toBe(false);
    expect(isDueOn(srs, reviewed, srs.dayOf(reviewed.dueAt))).toBe(true);
    expect(familyMeta({ ...def, kind: "concept" }).cls).toBe("concept");
  });
});
