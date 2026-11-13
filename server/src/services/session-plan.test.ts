import { describe, expect, test } from "bun:test";
import type { WarmupItem } from "@oak/api";
import type { LessonId, SessionId } from "@oak/content-kit";
import type { WarmupPlan } from "@oak/srs";
import {
  type CourseItem,
  gapDays,
  type LessonProgressView,
  lightConstraint,
  SessionPlanService,
  transcriptionSlotDue,
  warmupLabel,
} from "./session-plan.ts";

/** Contracts §2.5, sessions 1 to 183. */
const DEFAULT_ORDER = `U00.L01 U00.L02 U01.L01 U01.L02 U01.L03 U01.L04 U01.L05 U01.L06 U01.L07 U01.L08
U01.L09 U02.L01 U01.CP C0.S1 U02.L02 U02.L03 U02.L04 U02.L05 U02.L06 U02.L07
U02.L08 U03.L01 U02.CP C1.S1 U03.L02 U03.L03 U03.L04 U03.L05 U03.L06 U03.L07
U03.L08 U03.L09 U03.L10 U03.L11 U04.L01 U03.CP U04.L02 U04.L03 U04.L04 U05.L01
U04.CP U05.L02 U05.L03 U05.L04 U05.L05 U05.L06 U05.L07 U05.L08 U06.L01 U05.CP
U06.L02 U06.L03 U06.L04 U06.L05 U06.L06 U06.L07 U06.L08 U06.L09 U06.L10 U06.L11
U06.L12 U07.L01 U06.CP U07.L02 U07.L03 GYM.01 U07.L04 U07.L05 U07.L06 U07.L07
GYM.02 U07.L08 U07.L09 U07.L10 U08.L01 GYM.03 U07.CP C2.S1 C2.S2 X1.S1 X1.S2
X1.S3 U08.L02 U08.L03 U08.L04 U08.L05 GYM.04 U09.L01 U09.L02 U09.L03 U09.L04
GYM.05 U09.L05 U10.L01 U09.CP C3.S1 C3.S2 C3.S3 GYM.06 U10.L02 U10.L03
U10.L04 U10.L05 GYM.07 U10.L06 U10.L07 U10.L08 U10.L09 GYM.08 U11.L01
U10.CP C4.S1 C4.S2 GYM.09 U11.L02 U11.L03 U11.L04 U11.L05 GYM.10
U11.L06 U11.L07 U11.L08 U12.L01 GYM.11 U11.CP C5.S1 C5.S2 X2.S1 X2.S2
U12.L02 U12.L03 U12.L04 U12.L05 GYM.12 U12.L06 U13.L01 U13.L02 U13.L03
GYM.13 U13.L04 U13.L05 U13.L06 U14.L01 GYM.14 U13.CP U14.L02 U14.L03
U14.L04 GYM.15 U14.L05 U14.L06 U15.L01 U14.CP CF-T.S1 C6.S1 C6.S2
U15.L02 U15.L03 CF-T.S2 U15.L04 U15.L05 U15.L06 U16.L01 CF-T.S3 U16.L02
U16.L03 U16.L04 U16.L05 CF-T.S4 U17.L01 U17.L02 U17.L03 U17.L04 GYM.16
U17.CP C7.S1 C7.S2 C7.S3 GYM.17 CF-A.S1 CF-A.S2 CF-A.S3 CF-A.S4`
  .split(/\s+/)
  .filter(Boolean);

describe("the transcription slot rule (contracts §2.5)", () => {
  test("replaying the order without its gym and CF-T sessions reproduces all 183 sessions exactly", () => {
    expect(DEFAULT_ORDER).toHaveLength(183);
    const queue = DEFAULT_ORDER.filter((id) => !id.startsWith("GYM.") && !id.startsWith("CF-T."));
    const history: string[] = [];
    let gym = 0;
    let cft = 0;
    while (queue.length > 0 || history.length < 183) {
      const next = queue[0] ?? null;
      if (transcriptionSlotDue(history, next)) {
        // CF-T fills the slot once U15.L01 is done and while it is unfinished.
        if (history.includes("U15.L01") && cft < 4) history.push(`CF-T.S${++cft}`);
        else history.push(`GYM.${String(++gym).padStart(2, "0")}`);
      } else if (next !== null) {
        history.push(queue.shift() as string);
      } else break;
    }
    expect(history).toEqual(DEFAULT_ORDER);
  });

  test("not before U07.L01, not in the advanced tracks, never into a running capstone", () => {
    expect(transcriptionSlotDue(["U05.L01", "U05.L02", "U05.L03", "U05.L04", "U05.L05"], "U05.L06")).toBe(
      false,
    );
    const four = ["U07.L01", "U07.L02", "U07.L03", "U07.L04"];
    expect(transcriptionSlotDue(four, "U07.L05")).toBe(true);
    expect(transcriptionSlotDue(four, "C2.S2")).toBe(false);
    expect(transcriptionSlotDue(four, "X1.S1")).toBe(false);
    expect(transcriptionSlotDue(four, "J1.L01")).toBe(false);
    // Wave 4: a day with no other map item (the next lessons are not written yet) still takes the slot.
    expect(transcriptionSlotDue(four, null)).toBe(true);
  });
});

describe("helpers", () => {
  test("gap = days missed since the last qualifying day", () => {
    expect(gapDays(null, "2027-03-10")).toBe(0);
    expect(gapDays("2027-03-09", "2027-03-10")).toBe(0);
    expect(gapDays("2027-03-05", "2027-03-08")).toBe(2); // Friday → Monday: a weekend off is normal
    expect(gapDays("2027-03-01", "2027-03-05")).toBe(3);
  });
  test("labels never show counts; the Light constraint is deterministic", () => {
    expect(warmupLabel(0)).toBe("No review today");
    expect(warmupLabel(281)).toBe("Today's review ≈ 5 min");
    expect(warmupLabel(20)).toBe("Today's review ≈ 1 min");
    expect(lightConstraint("U05.L03", "2027-03-01")).toBe(lightConstraint("U05.L03", "2027-03-01"));
  });
});

function fixture(o: {
  next?: CourseItem | null;
  history?: string[];
  target?: 15 | 20 | 25;
  lastQualifying?: string | null;
  progress?: LessonProgressView | null;
  scaled?: number;
  cft?: string | null;
  gymCount?: number;
  audio?: boolean;
}) {
  const budgets: number[] = [];
  const prepared: number[] = [];
  const plan = (budgetSec: number): { plan: WarmupPlan; items: WarmupItem[] } => ({
    plan: { budgetSec, plannedSec: Math.round(budgetSec * 0.8), items: [], overflow: [], overflowSec: 0 },
    items: [],
  });
  const svc = new SessionPlanService({
    srs: {
      day: () => "2027-03-10",
      prepareDay: (_now, gap) => void prepared.push(gap),
      planWarmup: (_now, opts) => {
        budgets.push(opts.budgetSec ?? 300);
        return plan(opts.budgetSec ?? 300);
      },
      planReviewDay: () => ({ blocks: [plan(300).plan, plan(300).plan], overflow: [] }),
    },
    course: {
      next: () =>
        o.next === undefined ? { id: "U05.L03" as SessionId, kind: "lesson", title: "Inversions" } : o.next,
      history: () => (o.history ?? ["U05.L01", "U05.L02"]) as SessionId[],
      nextCftSession: () => (o.cft ?? null) as SessionId | null,
      gymCount: () => o.gymCount ?? 0,
      hasAudioProject: () => o.audio ?? false,
      lessonProgress: () => o.progress ?? null,
      lessonScaledMinutes: () => o.scaled ?? 12,
      lastCompletedLesson: () => "U05.L02" as LessonId,
      alternatives: () => [],
    },
    learner: {
      profile: () => ({ targetMinutes: o.target ?? 20, timeZone: "UTC", rolloverHour: 4 }),
      lastQualifyingDayBefore: () => (o.lastQualifying === undefined ? "2027-03-09" : o.lastQualifying),
      lastCanDo: () => null,
      lastSketchId: () => "sk1",
      tutorNote: () => null,
    },
  });
  return { svc, budgets, prepared };
}
const NOW = new Date("2027-03-10T18:00:00Z");

describe("SessionPlanService.today", () => {
  test("a normal lesson day: the target's warm-up budget, the lesson, resume where it stopped", () => {
    const f = fixture({ progress: { status: "in_progress", currentStep: "S4", splitPart: null } });
    const p = f.svc.today(NOW);
    expect(p).toMatchObject({
      kind: "lesson",
      mapItemId: "U05.L03",
      targetMinutes: 20,
      returning: null,
      day: "2027-03-10",
    });
    expect(p.main).toMatchObject({ resumeStep: "S4", splitPart: null, light: null, estMinutes: 13 });
    expect(p.warmup).toMatchObject({ budgetSec: 300, label: "Today's review ≈ 4 min", moreAvailable: false });
    expect(f.prepared).toEqual([0]);
    expect(f.svc.today(NOW, 25).warmup.budgetSec).toBe(360);
  });

  test("the 15-minute split: part A, then part B; a short lesson is not split", () => {
    expect(fixture({ target: 15, scaled: 12 }).svc.today(NOW).main).toMatchObject({
      splitPart: "A",
      estMinutes: 8.5,
    });
    expect(
      fixture({
        target: 15,
        scaled: 12,
        progress: { status: "in_progress", currentStep: "S6", splitPart: "A" },
      }).svc.today(NOW).main,
    ).toMatchObject({
      splitPart: "B",
      resumeStep: "S6",
      estMinutes: 9.5,
    });
    expect(fixture({ target: 15, scaled: 9 }).svc.today(NOW).main?.splitPart).toBeNull();
    expect(fixture({ target: 20, scaled: 12 }).svc.today(NOW).main?.splitPart).toBeNull();
  });

  test("checkpoint and capstone days plan a 3-minute warm-up; a 15-minute learner is told about 20 minutes", () => {
    const cp = fixture({
      target: 15,
      next: { id: "U05.CP" as SessionId, kind: "checkpoint", title: "Triads checkpoint" },
    });
    const p = cp.svc.today(NOW);
    expect(p).toMatchObject({
      kind: "checkpoint",
      mapItemId: "U05.CP",
      note: "Checkpoint day: about 20 minutes",
    });
    expect(p.warmup.budgetSec).toBe(180);
    const cap = fixture({
      next: { id: "C2.S1" as SessionId, kind: "capstone", title: "First song" },
    }).svc.today(NOW);
    expect(cap).toMatchObject({ kind: "capstone", note: null });
    expect(cap.warmup.budgetSec).toBe(180);
    expect(cap.main?.estMinutes).toBe(15);
  });

  test("gym slots: every 5th session from U07.L01, odd ladder, even own audio, CF-T when open", () => {
    const history = ["U06.L12", "U07.L01", "U06.CP", "U07.L02", "U07.L03"];
    const next = { id: "U07.L04" as SessionId, kind: "lesson" as const, title: "x" };
    const g1 = fixture({ history, next }).svc.today(NOW);
    expect(g1).toMatchObject({ kind: "gym", mapItemId: "GYM.01", title: "Transcription Gym: ladder" });
    expect(g1.warmup.budgetSec).toBe(240);
    expect(g1.main?.estMinutes).toBe(14);
    expect(fixture({ history, next, gymCount: 1, audio: true }).svc.today(NOW).title).toBe(
      "Transcription Gym: your own audio",
    );
    const noAudio = fixture({ history, next, gymCount: 1 }).svc.today(NOW);
    expect(noAudio.mapItemId).toBe("GYM.02");
    expect(noAudio.note).toContain("one realism level up");
    expect(fixture({ history, next, cft: "CF-T.S2" }).svc.today(NOW).mapItemId).toBe("CF-T.S2");
  });

  test("return policy: a break of 3+ days brings the recap; 10+ a Light lesson; 21+ the offer to loosen", () => {
    const back = fixture({ lastQualifying: "2027-03-05" }).svc.today(NOW); // 4 days missed
    expect(back.kind).toBe("lesson");
    expect(back.returning).toEqual({ recap: { canDoId: null, sketchId: "sk1" }, offerLoosen: false });
    const f = fixture({ lastQualifying: "2027-02-27" }); // 10 days missed
    const light = f.svc.today(NOW);
    expect(light).toMatchObject({ kind: "light", mapItemId: null });
    expect(light.main?.light?.lessonId).toBe("U05.L02");
    expect(light.main?.estMinutes).toBe(4);
    expect(f.prepared).toEqual([10]);
    expect(fixture({ lastQualifying: "2027-02-10" }).svc.today(NOW).returning?.offerLoosen).toBe(true);
  });

  test("nothing left on the map: a reviews-only day that offers a little more", () => {
    const p = fixture({ next: null }).svc.today(NOW);
    expect(p).toMatchObject({ kind: "review", mapItemId: null, main: null });
    expect(p.warmup.moreAvailable).toBe(true);
  });
});
