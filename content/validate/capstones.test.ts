// Capstones (contracts §2.4, §2.6, §6.6): starters evaluate and use only what is unlocked when the
// capstone opens in every legal order; the binding rubric fixes are present; transcription capstones name
// a song pool from the repertoire; gates match the course map.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { type CapstoneDef, type RubricRule, stripMarkers } from "@oak/content-kit";
import { capstones } from "../capstones.ts";
import { songById } from "../repertoire/index.ts";
import { BAD_LOG, evaluate, lint } from "./harness.ts";

setDefaultTimeout(60_000);
const rules = (c: CapstoneDef): RubricRule[] => c.brief?.rubric ?? [];
const rule = (id: string, name: string) =>
  rules(capstones.find((c) => c.id === id) as CapstoneDef).find((r) => r.rule === name);

describe("compose capstones", () => {
  for (const c of capstones.filter((x) => x.kind === "compose"))
    test(`${c.id}: the starter evaluates and is unlocked at ${c.sessionDefs[0]?.id}`, async () => {
      const code = stripMarkers(c.brief?.code.starter ?? "").code;
      const r = await evaluate(code, 4);
      expect([r.ok, r.error ?? ""]).toEqual([true, ""]);
      expect(r.events.length).toBeGreaterThan(0);
      expect(r.logs.filter((l) => BAD_LOG.test(l))).toEqual([]);
      const res = lint(code, { session: c.sessionDefs[0]?.id as never, meter: c.meter });
      expect(
        res.diagnostics.filter((d) => d.severity === "error").map((d) => `${d.id} ${d.message}`),
      ).toEqual([]);
      expect(rules(c).filter((r) => r.required).length).toBeGreaterThan(0);
    });
});

test("binding rubric fixes of §6.6", () => {
  expect(rule("C2", "progression")).toMatchObject({ schema: "schema.axis", allowRotation: true });
  expect(rule("C2", "cadence")).toMatchObject({ types: ["PAC", "IAC", "PC"] });
  expect(rule("C2", "motif-reuse")).toMatchObject({ minRatio: 0.5 });
  expect(
    rules(capstones.find((c) => c.id === "C2") as CapstoneDef).find((r) => r.rule === "ends-on-degree")
      ?.required,
  ).toBe(false);
  expect(rule("C3", "contrast")).toMatchObject({ minAxes: 2 });
  expect(rule("C3", "duration-sec")).toMatchObject({ min: 90 });
  expect(rule("C5", "swing")).toMatchObject({
    track: ["hats", "@drums"],
    drums: ["hatClosed", "hatOpen", "ride"],
    subdivision: 8,
    ratio: [1.6, 2.4],
  });
  expect(rule("JC2", "swing")).toMatchObject({ track: ["hats", "@drums", "chords"], subdivision: 8 });
  expect(rule("AC2", "swing")).toMatchObject({
    track: ["hats", "@drums"],
    subdivision: 16,
    ratio: [1.2, 2.4],
  });
  expect(rule("C7", "key-change")).toMatchObject({ semitones: [1, 2], minBarsAfter: 8, sameMelody: true });
  expect(rule("RC2", "clave")).toMatchObject({ type: "son", direction: "3-2" });
  expect(rule("RC2", "uses")).toMatchObject({ tool: "tb.mini.euclid" });
  expect(rule("CF-A", "device-count")).toMatchObject({ min: 4 });
  expect(rule("JC4", "device-count")).toMatchObject({ min: 3 });
  expect(rule("AC2", "sounds")).toMatchObject({ contains: ["snd.rhodes"] });
  expect(rule("C0", "tempo-bpm")).toMatchObject({ min: 70, max: 140 });
  expect(rule("C4", "tempo-bpm")).toMatchObject({ min: 60, max: 95 });
  expect(rule("JC1", "tempo-bpm")).toMatchObject({ min: 56, max: 92 });
});

test("gates of §2.4 and §4.3", () => {
  const gate = (id: string) => capstones.find((c) => c.id === id)?.opensAfter;
  expect(gate("X1")).toEqual({
    checkpoints: ["U07.CP"],
    capstones: ["C2"],
    familyLevels: [{ family: "fam.mel.dictation", level: 4 }],
  });
  expect(gate("X2")).toEqual({ capstones: ["C5"] });
  expect(gate("CF-A")).toEqual({ capstones: ["C7"] });
  expect(gate("CF-T")).toEqual({ lessonsCompleted: ["U15.L01"] });
  expect(gate("AC1")).toEqual({ checkpoints: ["A.CP", "U11.CP"] });
  expect(gate("AC2")).toEqual({ checkpoints: ["A.CP"], lessonsCompleted: ["J3.L04", "R1.L05"] });
  expect(gate("JC2")).toEqual({ lessonsCompleted: ["J4.L04"] });
  expect(capstones.find((c) => c.id === "CF-T")?.inGymSlots).toBe(true);
});

test("transcription capstones draw on the verified-later repertoire pools of §2.4", () => {
  const pool = (id: string) => capstones.find((c) => c.id === id)?.song ?? [];
  expect(pool("X1")).toEqual(["song.aura-lee", "song.red-river-valley"]);
  expect(pool("X2")).toEqual(["song.careless-love", "song.st-louis-blues"]);
  expect(pool("CF-T")).toEqual(["song.five-foot-two", "song.aint-she-sweet", "song.bye-bye-blackbird"]);
  for (const id of ["X1", "X2", "CF-T"]) for (const s of pool(id)) expect(songById.has(s)).toBe(true);
  expect(pool("X1")).not.toContain("song.amazing-grace");
});
