// CF-A Album Single (contracts §6.6 CF-A, content/specs/CF.md): the brief of content/capstones.ts graded through the
// real grader in capstone mode, the way the capstone workspace grades a save.
//   - The rubric: the three required lines of §6.6 (four of the six devices, a bridge, two minutes), the five
//     suggestions of the spec (never blocking), and the rules each session works on.
//   - The plan of CF-A.S1 meets the bridge and the length and has none of the devices.
//   - One passing piece per shipped flavour with four, five and six devices, each device named with its bar; three
//     devices fail and the line says which three and which are still open.
//   - The device list the brief and the card use: the six of `CORE_DEVICES`, each met in a lesson before CF-A.
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import type { ComposeBriefEx, GradeResult, KeySpec, SessionId } from "@oak/content-kit";
import { CORE_DEVICES, stripMarkers } from "@oak/content-kit";
import * as grader from "@oak/grader";
import {
  CAPSTONE_LINER_PROMPTS,
  CAPSTONE_LINER_SEEDS,
  CF_A_DEVICES,
  CF_A_PIECES,
  capstoneById,
} from "../../../capstones.ts";
import { syllabus } from "../../../syllabus.ts";
import { toolbox } from "../../../toolbox.ts";
import { evaluate, lint, unlockedFor } from "../../../validate/harness.ts";

setDefaultTimeout(120_000);

const cfa = capstoneById.get("CF-A");
const brief = cfa?.brief as ComposeBriefEx;
const C: KeySpec = { tonic: "C", mode: "major" };

/** Graded as the workspace grades a save: capstone mode, the brief's rubric, the key the code states. */
const grade = (code: string, key: KeySpec = C, session = "CF-A.S1") =>
  grader.gradeExercise({
    exercise: brief,
    response: { code },
    ctx: {
      exerciseGlobalId: "CF-A/brief",
      mode: "capstone",
      key,
      meter: "4/4",
      bpm: 100,
      params: {},
      attemptNo: 1,
      firstAttempt: true,
      rung: 0,
      tutorHints: 0,
      extraReplays: 0,
      lint: {
        profile: "graded",
        unlocked: unlockedFor(session as SessionId),
        allowPreview: false,
        meter: "4/4",
        key: null,
      },
    },
  });
const failing = (r: GradeResult) => (r.rubric ?? []).filter((x) => !x.ok).map((x) => x.ruleId);
const requiredFailing = (r: GradeResult) => {
  const required = new Set(brief.rubric.filter((x) => x.required).map((x) => x.id));
  return failing(r).filter((id) => required.has(id));
};
const detail = (r: GradeResult, id: string): string =>
  String((r.rubric ?? []).find((x) => x.ruleId === id)?.diag?.params.detail ?? "");
/** The devices the song has, by name, each at the bar where it first sounds. */
const devices = (r: GradeResult): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const d of r.analysis?.deviceList ?? [])
    if ((CORE_DEVICES as readonly string[]).includes(d.device) && !(d.device in out)) out[d.device] = d.bar;
  return out;
};

beforeAll(async () => {
  await grader.initRealm({ toolbox: [...toolbox], lockdown: false });
});

describe("CF-A's brief", () => {
  test("three required lines, exactly as contracts §6.6 writes them, then the spec's five suggestions", () => {
    expect(brief.rubric.map((r) => [r.id, r.rule, r.required])).toEqual([
      ["devices", "device-count", true],
      ["bridge", "form", true],
      ["duration", "duration-sec", true],
      ["groove-lock", "groove-lock", false],
      ["contrast", "contrast", false],
      ["motif", "motif-reuse", false],
      ["chord-tones", "chord-tones-strong", false],
      ["range", "range", false],
    ]);
    const [devices, bridge, duration] = brief.rubric;
    expect(devices).toMatchObject({ devices: [...CORE_DEVICES], min: 4 });
    expect(bridge).toMatchObject({ pattern: "*", contains: ["bridge"] });
    expect(duration).toMatchObject({ min: 120 });
    expect(brief.minDurationSec).toBe(120);
  });
  test("each session works on its own lines; S1 opens the plan; only S4 reviews and releases", () => {
    const ids = new Set(brief.rubric.map((r) => r.id));
    expect(cfa?.sessionDefs.map((s) => s.focusRules)).toEqual([
      ["bridge", "duration", "groove-lock"],
      ["devices"],
      ["devices", "bridge", "contrast", "motif", "chord-tones", "range"],
      [...ids],
    ]);
    for (const s of cfa?.sessionDefs ?? []) for (const f of s.focusRules ?? []) expect(ids.has(f)).toBe(true);
    expect(cfa?.sessionDefs[0]?.starter).toBe(CF_A_PIECES.template);
    expect(brief.code.starter).toBe(CF_A_PIECES.template);
    expect(cfa?.sessionDefs.map((s) => [!!s.review, !!s.release])).toEqual([
      [false, false],
      [false, false],
      [false, false],
      [true, true],
    ]);
    expect(cfa?.reviewRevisions).toBe(2);
  });
  test("the release asks what the song is about and offers three first lines", () => {
    expect(CAPSTONE_LINER_PROMPTS["CF-A"]).toBe("What is this song about?");
    expect(CAPSTONE_LINER_SEEDS["CF-A"]?.length).toBe(3);
    for (const t of [...(CAPSTONE_LINER_SEEDS["CF-A"] ?? []), ...(CAPSTONE_LINER_SEEDS["CF-T"] ?? [])])
      expect([t, /!|amazing|awesome|easy|simply|just /i.test(t)]).toEqual([t, false]);
  });
});

describe("the six devices the brief lists", () => {
  test("the six of CORE_DEVICES, in order, each met in a lesson the learner has finished before CF-A", () => {
    expect(CF_A_DEVICES.map((d) => d.device)).toEqual([...CORE_DEVICES]);
    const order = syllabus.defaultOrder as readonly string[];
    const at = order.indexOf("CF-A.S1");
    expect(at).toBeGreaterThan(0);
    const titles = new Map(syllabus.units.flatMap((u) => u.lessons.map((l) => [l.id as string, l.title])));
    for (const d of CF_A_DEVICES) {
      expect([d.device, titles.get(d.met)]).toEqual([d.device, d.metIn]);
      expect([d.device, order.indexOf(d.met) >= 0 && order.indexOf(d.met) < at]).toEqual([d.device, true]);
      expect(d.what.split(/\s+/).length).toBeLessThanOrEqual(45);
    }
  });
});

describe("every piece plays and lints clean when CF-A opens", () => {
  for (const [name, code] of Object.entries(CF_A_PIECES))
    test(name, async () => {
      const plain = stripMarkers(code).code;
      const r = await evaluate(plain, 8);
      expect([r.ok, r.error ?? "", r.events.length > 0]).toEqual([true, "", true]);
      for (const session of ["CF-A.S1", "CF-A.S4"] as SessionId[])
        expect(
          lint(plain, { session, meter: "4/4", key: C })
            .diagnostics.filter((d) => d.severity === "error")
            .map((d) => `${d.id}: ${d.message}`),
        ).toEqual([]);
    });
});

describe("CF-A on the real grader (capstone mode)", () => {
  test("the plan: 56 bars, 134.4 s, a bridge, and none of the six devices", async () => {
    const r = await grade(stripMarkers(CF_A_PIECES.template).code);
    expect(requiredFailing(r)).toEqual(["devices"]);
    expect(r.analysis?.durationSec).toBe(134.4);
    expect(detail(r, "devices")).toBe(
      "0 of the 4 asked for; still open: secondary dominant, borrowed chord, modulation, suspension, syncopated bass, modal colour",
    );
  });
  test("pop, five devices, each with its bar (♭VII beside ♭VI is a borrowed chord, not a modal colour)", async () => {
    const r = await grade(CF_A_PIECES.pop);
    // Its bass is the syncopated-bass device, pushed off a kick on 1 and 3: the groove-lock suggestion stays open.
    expect([r.status, failing(r)]).toEqual(["pass", ["groove-lock"]]);
    expect(r.analysis?.durationSec).toBe(134.4);
    expect(devices(r)).toEqual({
      "syncopated bass": 1,
      suspension: 4,
      "secondary dominant": 11,
      "borrowed chord": 33,
      modulation: 49,
    });
  });
  test("pop, all six: the Mixolydian verse adds the modal colour", async () => {
    const r = await grade(CF_A_PIECES.six);
    expect(r.status).toBe("pass");
    expect(Object.keys(devices(r)).sort()).toEqual([...CORE_DEVICES].sort());
    expect(devices(r)["modal colour"]).toBe(2);
  });
  // Each flavour read in the key its code states, as the workspace reads it (engine.ts: the code's own `.scale()`).
  const fours: [string, string, KeySpec, Record<string, number>][] = [
    [
      "indie: I–♭VII–IV, V7/V into the chorus, a 9–8, eight bars in A minor",
      CF_A_PIECES.indie,
      C,
      { "modal colour": 2, suspension: 11, "secondary dominant": 14, modulation: 25 },
    ],
    [
      "jazz-soul: the borrowed B♭m7, a chain of dominants, a pushed upright, a 4–3",
      CF_A_PIECES.jazzSoul,
      { tonic: "F", mode: "major" },
      { "syncopated bass": 1, suspension: 4, "borrowed chord": 10, "secondary dominant": 12 },
    ],
    [
      "funk: an E Dorian verse, F♯7 to B7, a sixteenth-note bass, the last chorus a half step up",
      CF_A_PIECES.funk,
      { tonic: "E", mode: "minor" },
      { "modal colour": 1, "syncopated bass": 1, "secondary dominant": 14, modulation: 49 },
    ],
  ];
  for (const [name, code, key, want] of fours)
    test(`exactly four, ${name}`, async () => {
      const r = await grade(code, key);
      expect([r.status, requiredFailing(r)]).toEqual(["pass", []]);
      expect(devices(r)).toEqual(want);
      // Content CI reads a brief without a key in C major: the piece passes there too, with four devices.
      const inC = await grade(code, C);
      expect([inC.status, Object.keys(devices(inC)).length]).toEqual(["pass", 4]);
    });
  test("three devices fail, naming the three and what is still open", async () => {
    const r = await grade(CF_A_PIECES.three);
    expect(requiredFailing(r)).toEqual(["devices"]);
    expect(detail(r, "devices")).toBe(
      "3 of the 4 asked for: secondary dominant (bar 11), borrowed chord (bar 33), suspension (bar 4); still open: modulation, syncopated bass, modal colour",
    );
  });
  test("no bridge fails `bridge` and says how to name one", async () => {
    const r = await grade(CF_A_PIECES.noBridge);
    expect(requiredFailing(r)).toContain("bridge");
    expect(detail(r, "bridge")).toStartWith(
      "the form is verse chorus verse chorus verse chorus chorus2: there is no bridge yet",
    );
  });
  // Corrections pass (theory-g 1): a device has to be heard. Every line muted is no song, however it is written;
  // the same lines played quietly are still the song.
  test("every line muted with `.gain(0)` fails; the same lines at `.gain(.2)` still pass", async () => {
    const tail = (g: string) =>
      CF_A_PIECES.pop
        .split("\n")
        .map((l) => (/^[a-z]+:/.test(l) ? `${l}.gain(${g})` : l))
        .join("\n");
    const muted = await grade(tail("0"));
    expect(muted.status).toBe("fail");
    expect(muted.diagnostics.map((d) => d.id)).toContain("make.silent");
    expect((await grade(tail(".2"))).status).toBe("pass");
  });
  test("48 bars at 100 BPM are 115.2 s: `duration` fails alone", async () => {
    const r = await grade(CF_A_PIECES.short);
    expect(requiredFailing(r)).toEqual(["duration"]);
    expect(detail(r, "duration")).toBe("115.2 s long; at least 120 s");
  });
});
