// Band layers and flavour kits (contracts §5.10): every (band, flavour) pair evaluates in the key it is
// given, carries exactly the roles it declares, passes the strict lint as a preview context (locked tools
// allowed, dialect enforced), and plays the harmony it says. Kits sit in the production ranges.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { midisOf } from "@oak/grader/testing";
import { bands } from "../bands/index.ts";
import { FLAVOUR_RULES, flavours, PRODUCTION_RANGES } from "../flavours.ts";
import { BAD_LOG, evaluate, lint } from "./harness.ts";

setDefaultTimeout(60_000);
const fill = (code: string, key = "C4:major") =>
  `setcpm(96/4)\n\n${code.replaceAll("{{key}}", key).replaceAll("{{bpm}}", "96")}`;

describe("bands", () => {
  for (const b of bands)
    for (const [flavour, code] of Object.entries(b.code))
      test(`${b.id} × ${flavour}`, async () => {
        for (const key of ["C4:major", "G4:major", "Eb4:major"]) {
          const r = await evaluate(fill(code, key), b.bars);
          expect([key, r.ok, r.error ?? ""]).toEqual([key, true, ""]);
          expect(r.logs.filter((l) => BAD_LOG.test(l))).toEqual([]);
          expect([...r.tracks].sort()).toEqual([...b.roles].sort());
          for (const role of b.roles)
            expect([role, r.events.some((e) => e.track === role)]).toEqual([role, true]);
        }
        const res = lint(fill(code), {
          session: "U01.L01",
          meter: "4/4",
          allowPreview: true,
          profile: "band",
        });
        expect(
          res.diagnostics.filter((d) => d.severity === "error").map((d) => `${d.id} ${d.message}`),
        ).toEqual([]);
      });
  for (const f of flavours)
    test(`every band has a ${f.id} version`, () => {
      for (const b of bands) expect(Object.keys(b.code)).toContain(f.id);
    });
});

describe("harmony (music facts, checked against Strudel)", () => {
  test("the four-chord band plays I–V–vi–IV with roots C2 G2 A2 F2 in C", async () => {
    const code = (bands.find((b) => b.id === "band.axis-4bar")?.code["flavour.pop"] ?? "")
      .split("\n")
      .find((l) => l.startsWith("bass:")) as string;
    expect(await midisOf(fill(code), 4)).toEqual([36, 43, 45, 41]);
  });
  test("its chords are C–E–G, G–B–D, A–C–E, F–A–C", async () => {
    const line = (bands.find((b) => b.id === "band.axis-4bar")?.code["flavour.pop"] ?? "")
      .split("\n")
      .find((l) => l.startsWith("chords:")) as string;
    const r = await evaluate(fill(line.replace(/\.struct\("[^"]*"\)/, "")), 4);
    const byBar = [0, 1, 2, 3].map((b) =>
      r.events.filter((e) => Math.floor(e.onset) === b).map((e) => e.midi),
    );
    expect(byBar).toEqual([
      [48, 52, 55],
      [55, 59, 62],
      [57, 60, 64],
      [53, 57, 60],
    ]);
  });
  test("the jazz-soul version stacks sevenths: Cmaj7 is C E G B", async () => {
    const line = (bands.find((b) => b.id === "band.axis-4bar")?.code["flavour.jazz-soul"] ?? "")
      .split("\n")
      .find((l) => l.startsWith("chords:")) as string;
    const r = await evaluate(
      fill(line.replace(/\.struct\("[^"]*"\)/, "").replace(/\.swingBy\([^)]*\)/, "")),
      1,
    );
    expect(r.events.map((e) => e.midi)).toEqual([48, 52, 55, 59]);
  });
  test("the band follows the key: in G the vamp is G and C", async () => {
    const line = (bands.find((b) => b.id === "band.two-chord-vamp")?.code["flavour.pop"] ?? "")
      .split("\n")
      .find((l) => l.startsWith("bass:")) as string;
    expect(await midisOf(fill(line, "G4:major"), 2)).toEqual([43, 48]);
  });
});

describe("flavour kits", () => {
  test("production defaults sit in the ranges of §5.10", () => {
    for (const f of flavours) {
      expect(f.production.room).toBeGreaterThanOrEqual(PRODUCTION_RANGES.room[0]);
      expect(f.production.room).toBeLessThanOrEqual(PRODUCTION_RANGES.room[1]);
      expect(f.production.bassLpf).toBeGreaterThanOrEqual(PRODUCTION_RANGES.bassLpf[0]);
      expect(f.production.bassLpf).toBeLessThanOrEqual(PRODUCTION_RANGES.bassLpf[1]);
      expect(f.production.humanizeVelocity).toBe(PRODUCTION_RANGES.humanizeVelocity);
      expect(f.production.pan.bass).toBe(0.5);
    }
  });
  test("the table of §5.10", () => {
    const row = (id: string) => flavours.find((f) => f.id === id);
    expect(row("flavour.jazz-soul")).toMatchObject({
      drums: "snd.jazzkit",
      bass: "snd.upright",
      chords: "snd.rhodes",
      lead: "snd.vibes",
      chordDepth: "seventh",
      swing: { subdivision: 8, amount: 1 / 3 },
    });
    expect(row("flavour.indie")).toMatchObject({
      drums: "snd.bank.LinnDrum",
      bass: "snd.ebass",
      chords: "snd.cleangtr",
      lead: "snd.acgtr",
      chordDepth: "triad",
    });
    expect(row("flavour.funk")).toMatchObject({
      drums: "snd.bank.RolandTR808",
      bass: "snd.fingerbass",
      chords: "snd.clav",
      lead: "snd.organ",
      chordDepth: "seventh",
    });
    expect(row("flavour.pop")).toMatchObject({
      bass: "snd.ebass",
      chords: "snd.piano",
      lead: "snd.piano",
      chordDepth: "triad",
    });
    expect(FLAVOUR_RULES["flavour.jazz-soul"].seventhsFrom).toBe("U03.L01");
    expect(FLAVOUR_RULES["flavour.funk"].seventhsFrom).toBe("U06.L01");
  });
});
