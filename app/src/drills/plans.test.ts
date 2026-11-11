import { describe, expect, test } from "bun:test";
import type { Answer, DrillSession, FamilyDef, Trial } from "@oak/api";
import { createRegistry, DEFAULT_PROFILE } from "@oak/drills";
import { evalHeadless } from "@oak/grader/testing";
import { degreeSemitones } from "@oak/theory";
import { families } from "../../../content/families.ts";
import { planDrillSet } from "./model.ts";
import {
  answerPlan,
  clicksPlan,
  comparePlan,
  cuePlan,
  resolutionOf,
  sequence,
  stagingOf,
  targetMidisOf,
} from "./plans.ts";

const registry = createRegistry(families, []);
const def = (id: string) => families.find((f) => f.id === id) as FamilyDef;
function trialsOf(familyId: string, level = 1): Trial[] {
  const d = def(familyId);
  const s = {
    setId: `s-${familyId}`,
    levels: { [familyId]: level },
    openCategories: { [familyId]: d.levels[level - 1]?.categories ?? [] },
    trialsPlanned: 4,
  } as unknown as DrillSession;
  return planDrillSet(registry.family(familyId as never), s, null, DEFAULT_PROFILE).trials.map(
    (t) => t.trial,
  );
}

describe("staging a trial in time", () => {
  test("tap along: the groove from t0, taps measured from its start, no extra click", () => {
    const t = trialsOf("fam.rhy.pulse")[0] as Trial;
    const st = stagingOf(t);
    expect(st.cue).toBeNull();
    expect(st.stimulusAt).toBe(0);
    expect(st.responseAt).toBe(0);
    expect(st.windowClick).toBeNull();
    const targets = t.params.tapTargets as number[];
    expect(st.responseSec).toBeGreaterThan(targets[targets.length - 1] as number);
  });

  test("echo: count-in, the bar, then the response window over a click", () => {
    const t = trialsOf("fam.rhy.echo")[0] as Trial;
    const st = stagingOf(t);
    expect(st.cue).not.toBeNull();
    const bar = 1 / t.cps;
    expect(st.stimulusAt).toBeCloseTo(bar, 6);
    expect(st.responseAt).toBeCloseTo(bar + (t.params.responseAt as number), 6);
    expect(st.windowClick?.events.length).toBeGreaterThan(0);
    expect(st.endAt).toBeGreaterThan(st.responseAt + st.responseSec);
  });

  test("reading: the rhythm is shown, not played; taps start after the count-in", () => {
    const t = trialsOf("fam.rhy.read")[0] as Trial;
    const st = stagingOf(t);
    expect(st.stimulus).toBeNull();
    expect(st.responseAt).toBeCloseTo(1 / t.cps, 6);
    expect(st.windowClick).not.toBeNull();
  });

  test("an FET trial plays its cadence bar, then the target", () => {
    const t = trialsOf("fam.deg.fet-major")[0] as Trial;
    const st = stagingOf(t);
    expect(st.cue).not.toBeNull();
    expect(st.stimulus).not.toBeNull();
    expect(st.responseAt).toBeCloseTo(st.stimulusAt + (st.stimulus?.durationSec ?? 0), 6);
    // The cadence bar sounds before the target bar (I–IV–V–I, then the degree).
    expect(cuePlan(t)?.events.length).toBeGreaterThan(3);
  });

  test("pitch match sings over a window as long as its target, plus a margin", () => {
    const t = trialsOf("fam.pit.match")[0] as Trial;
    const st = stagingOf(t);
    const off = Math.max(...(t.params.singTargets as { off: number }[]).map((x) => x.off));
    expect(st.responseSec).toBeCloseTo(off + 0.6, 6);
  });
});

describe("hear the answer, compare", () => {
  test("the target of a degree trial is the last bar's melody note, which the code also plays", async () => {
    const t = trialsOf("fam.deg.fet-major")[0] as Trial;
    const [target] = targetMidisOf(t);
    const key = t.params.key as { tonic: string };
    const expected = (t.expected as Answer).degrees?.[0] as string;
    // The generated code plays that note in its second bar.
    const { events } = await evalHeadless(t.code, 2);
    const mel = events.filter((e) => e.onset >= 1 && e.midi !== null && e.track === "mel").map((e) => e.midi);
    expect(mel).toContain(target as number);
    // And it is the expected degree above the key's tonic (mod 12).
    const tonicPc = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[key.tonic[0] as "C"] as number;
    const alt = key.tonic.includes("#") ? 1 : key.tonic.includes("b") ? -1 : 0;
    expect(((((target as number) - tonicPc - alt) % 12) + 12) % 12).toBe(degreeSemitones(expected as never));
  });

  test("compare plays your degree, then the right one, in the trial's own register", () => {
    const t = trialsOf("fam.deg.fet-major")[0] as Trial;
    const expected = (t.expected as Answer).degrees?.[0] as string;
    const wrong = expected === "5" ? "3" : "5";
    const plan = comparePlan(t, { taps: null, answer: { degrees: [wrong as never] } }, null);
    expect(plan).not.toBeNull();
    const notes = (plan?.events ?? [])
      .filter((e) => e.value.s === "piano" && e.at > (cuePlan(t)?.durationSec ?? 0))
      .map((e) => e.value.note);
    const [target] = targetMidisOf(t);
    const tonic = (target as number) - degreeSemitones(expected as never);
    expect(notes.slice(-2)).toEqual([tonic + degreeSemitones(wrong as never), target]);
    // Nothing to compare when the answer was right.
    expect(comparePlan(t, { taps: null, answer: { degrees: [expected as never] } }, null)).toBeNull();
  });

  test("compare on a tap trial plays your taps, then the rhythm", () => {
    const t = trialsOf("fam.rhy.echo")[0] as Trial;
    const targets = t.params.tapTargets as number[];
    const plan = comparePlan(t, { taps: [0.05, 0.6], answer: null }, null);
    expect(plan?.events.length).toBe(2 + targets.length);
  });

  test("find the tonic compares the two candidate notes; hear the answer ends on the tonic", () => {
    const t = trialsOf("fam.deg.tonic")[0] as Trial;
    const right = (t.expected as Answer).choice?.[0] as string;
    const options = t.params.options as string[];
    const wrong = options.find((o) => o !== right) as string;
    const plan = comparePlan(t, { taps: null, answer: { choice: [wrong] } }, null);
    expect(plan?.events).toHaveLength(2);
    const answer = answerPlan(t);
    const last = answer.events[answer.events.length - 1];
    const tonicAudio = (t.params.choiceAudio as { id: string; audio: string }[]).find((c) => c.id === right);
    expect(String(last?.value.note)).toBe(/note\((\d+)\)/.exec(tonicAudio?.audio ?? "")?.[1] as string);
  });

  test("hear the answer of a sung trial plays its targets", () => {
    const t = trialsOf("fam.pit.match")[0] as Trial;
    const plan = answerPlan(t);
    expect(plan.events.map((e) => e.value.note)).toEqual(
      (t.params.singTargets as { midi: number }[]).map((x) => x.midi),
    );
  });

  test("FET resolutions: levels 1–2 play the path first, from level 3 the learner sings first", () => {
    const l1 = trialsOf("fam.deg.fet-major", 1)[0] as Trial;
    expect(resolutionOf(l1).playFirst).toBe(true);
    const l3 = trialsOf("fam.deg.fet-major", 3)[0] as Trial;
    expect(resolutionOf(l3).playFirst).toBe(false);
    expect(resolutionOf(l1).plan?.events.length).toBeGreaterThan(0);
  });

  test("sequence and clicks keep time", () => {
    const a = clicksPlan([0, 0.5]);
    const b = clicksPlan([0, 0.25]);
    const s = sequence([a, null, b], 0.5);
    expect(s.events.map((e) => e.at)).toEqual([0, 0.5, a.durationSec + 0.5, a.durationSec + 0.75]);
  });
});
