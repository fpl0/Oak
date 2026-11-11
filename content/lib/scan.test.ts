// The stand-in scanner (used by content/validate/harness.ts only while @oak/grader's lintOak is a stub):
// golden cases for each form of contracts §3.3, and agreement with the real lint where it exists.
import { describe, expect, test } from "bun:test";
import { lintOak } from "@oak/grader";
import { courseGraph } from "../index.ts";
import { toolbox } from "../toolbox.ts";
import { unlockedAt } from "./course.ts";
import { dialectDiagnostics, scanLint } from "./scan.ts";

const all = new Set(toolbox.map((t) => t.id as string));
const used = (code: string, meter: "4/4" | "3/4" | "6/8" = "4/4") =>
  scanLint(code, { meter, unlocked: all, allowPreview: false }, toolbox).used.sort();

describe("forms", () => {
  test("calls, sounds, banks and mini operators", () => {
    expect<unknown>(used('setcpm(96/4)\n\nkick: s("bd ~ bd ~").bank("RolandTR909")')).toEqual(
      [
        "snd.bank.RolandTR909",
        "snd.drum.bd",
        "tb.bank",
        "tb.label",
        "tb.mini.rest",
        "tb.mini.seq",
        "tb.s",
        "tb.setcpm",
      ].sort(),
    );
  });
  test("degrees, ranges, chromatic steps and scales", () => {
    expect<unknown>(
      used('setcpm(90/4)\n\nmel: n("0 .. 7 3#").scale("A3:harmonic:minor").s("piano")'),
    ).toEqual(
      [
        "scale.harmonic-minor",
        "snd.piano",
        "tb.label",
        "tb.mini.range",
        "tb.mini.seq",
        "tb.n",
        "tb.n.chromatic",
        "tb.n.range",
        "tb.s",
        "tb.s.pitched",
        "tb.scale",
        "tb.setcpm",
      ].sort(),
    );
  });
  test("chord families, dictionaries and modes", () => {
    const u = used(
      'setcpm(90/4)\n\nchords: chord("<Dm7 G7 C^7 Bm7b5>").dict("lefthand").mode("root:g2").voicing()',
    );
    for (const id of [
      "chord.seventh",
      "chord.dom7",
      "chord.seventh-dim",
      "tb.dict.lefthand",
      "tb.mode.root",
      "tb.chord",
      "tb.voicing",
      "tb.mini.alt",
    ])
      expect<unknown>(u).toContain(id);
  });
  test("tempo lines by meter", () => {
    expect<unknown>(used('setcpm(90/3)\n\ndrums: s("bd hh hh")', "3/4")).toContain("tb.meter.3-4");
    expect<unknown>(used('setcpm(90/2)\n\ndrums: s("bd hh hh")', "6/8")).toContain("tb.meter.compound");
  });
  test("locked tools are reported with their family of code", () => {
    const u = unlockedAt(courseGraph(), toolbox, "U01.L01");
    const r = scanLint(
      'setcpm(90/4)\n\nmel: n("0 2").scale("C4:major").s("piano")',
      { meter: "4/4", unlocked: u, allowPreview: false },
      toolbox,
    );
    expect<unknown>(r.ok).toBe(false);
    expect<unknown>(r.diagnostics.map((d) => d.id)).toContain("code.locked-tool");
    expect<unknown>(r.diagnostics.map((d) => d.id)).toContain("code.locked-scale");
    expect<unknown>(r.diagnostics.map((d) => d.id)).toContain("code.locked-sound");
  });
});

test("dialect rules of STYLE §12", () => {
  const ids = (code: string) => dialectDiagnostics(code).map((d) => d.id);
  expect<unknown>(ids('drums: s("bd")')).toContain("code.setcpm-missing");
  expect<unknown>(ids('setcpm(90/4)\n\n$: s("bd")')).toContain("code.dollar-label");
  expect<unknown>(ids('setcpm(90/4)\n\nSnare: s("sd")')).toContain("code.label-solo-prefix");
  expect<unknown>(ids('setcpm(90/4)\n\nsnare: s("sd").late("1/16")')).toContain("code.time-fraction-string");
  expect<unknown>(ids('setcpm(90/4)\n\nmel: n("0..7").scale("C4:major")')).toContain("code.range-spacing");
  expect<unknown>(ids('setcpm(90/4)\n\nmel: n("0 2").scale("C4 major")')).toContain("code.scale-spaces");
  expect<unknown>(ids('setcpm(90/4)\n\nmel: n("0 2").add("2").scale("C4:major")')).toContain(
    "code.add-on-control",
  );
  expect<unknown>(ids('setcpm(90/4)\n\nchords: chord("C/E").voicing()')).toContain("code.slash-chord");
  expect<unknown>(ids('setcpm(90/4)\n\nhats: s("hh*8").nudge(.01)')).toContain("code.nudge-studio-only");
  expect<unknown>(ids('setcpm(90/4)\n\nkick: s("bd ~ bd ~")')).toEqual([]);
});

test("agrees with @oak/grader's lintOak on what a lesson-sized snippet uses (when it is implemented)", () => {
  const code =
    'setcpm(90/4)\n\nkick: s("bd ~ bd ~")\nmel: n("<0 2 4 2>").scale("C4:major").s("piano").room(.3)';
  const ctx = {
    profile: "content" as const,
    unlocked: all as never,
    allowPreview: false,
    meter: "4/4" as const,
    key: null,
  };
  let real: string[] | null = null;
  try {
    real = lintOak(code, ctx, toolbox).used.map(String).sort();
  } catch {
    real = null;
  }
  if (real) expect<unknown>(used(code).filter((id) => !real.includes(id))).toEqual([]);
});
