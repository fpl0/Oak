// Adversarial review of Wave 5 grading (review:robustness): valid answers the builders did not think of, and wrong
// answers that look right, each graded correctly with a message that names the fault. Every piece was run headless
// against Strudel 1.2.6; the music was checked by hand and with `bun run theory` (A minor: V is E with G♯; the
// C blues: bar 9 V, bar 10 IV, bar 12 V; Careless Love in F: F C7 F F | F F C7 C7 | F F B♭ B♭ | F C7 F F).
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { KeySpec, RubricRule, SongDef } from "@oak/content-kit";
import careless from "../../../../content/repertoire/careless-love/song.ts";
import { headlessDeps, strudel } from "../analyze/__support__/fixtures.ts";
import { sectionsFromAst } from "../analyze/sections.ts";
import { gradeWith } from "../grade/index.ts";
import { songLadderRequest } from "../grade/song-ladder.ts";
import type { RubricContext } from "./context.ts";
import { evalRule } from "./rules.ts";

setDefaultTimeout(60_000);
const A_MINOR: KeySpec = { tonic: "A", mode: "minor" };
const C_BLUES: KeySpec = { tonic: "C", mode: "blues" };
const rule = (b: Record<string, unknown>): RubricRule =>
  ({ id: "r", label: "r", required: true, skills: [], ...b }) as unknown as RubricRule;
async function run(
  r: RubricRule,
  code: string,
  bars: number,
  key: KeySpec | null,
  o: Partial<RubricContext> = {},
) {
  const n = await strudel(code, bars);
  const ctx = {
    meter: "4/4",
    code,
    params: {},
    bars,
    totalBars: bars,
    ...(key ? { key } : {}),
    ...o,
  } as RubricContext;
  return evalRule(r, n, ctx);
}
const MAJOR_V = rule({ rule: "contains-rn", rn: ["V"], min: 1, mustResolve: true });

describe("minor: V vs v, the dominant that goes home, the relative major", () => {
  test("a chorus voiced by hand under a verse of chord() symbols is read (it was 'no chord')", async () => {
    const code = `const chordsVerse = chord("<Am F C G>").voicing()
const chordsChorus = note("<[d3,f3,a3] [g3,b3,d4] [e3,g#3,b3] [a3,c4,e4]>")
chords: arrange([4, chordsVerse], [4, chordsChorus]).s("piano")`;
    const r = await run(MAJOR_V, code, 8, A_MINOR);
    expect(r.ok).toBe(true);
    expect(r.detail).toBe("1 × V that resolve; at least 1");
  });
  test("v (Em) where V is asked: the message names the minor chord and the raised 7th", async () => {
    const r = await run(MAJOR_V, `chords: chord("<Am Dm Em Am>").voicing()`, 4, A_MINOR);
    expect(r.ok).toBe(false);
    expect(r.detail).toBe(
      "0 × V that resolve; at least 1 (v (Em) is minor: V is E major, with G♯, the raised 7th)",
    );
    expect(r.where?.bar).toBe(3);
  });
  test("V that goes to VI (a deceptive move) does not count, and says where it went", async () => {
    const r = await run(MAJOR_V, `chords: chord("<Am Dm E F>").voicing()`, 4, A_MINOR);
    expect(r.ok).toBe(false);
    expect(r.detail).toBe(
      "0 × V that resolve; at least 1 (V (E) doesn't resolve: it goes to VI (F), not home to i (Am))",
    );
  });
  test("a chromatic chord in the piece never crashes the message (♭II in A minor)", async () => {
    const r = await run(MAJOR_V, `chords: chord("<Dm Bb F C>").voicing()`, 4, A_MINOR);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("♭II (B♭)");
  });
  test("the Aeolian loop started on III is the relative major's I–V–vi–IV: refused, and named", async () => {
    const aeolian = rule({ rule: "progression", schema: "schema.aeolian" });
    const rel = await run(aeolian, `chords: chord("<C G Am F>").voicing()`, 4, A_MINOR);
    expect(rel.ok).toBe(false);
    expect(rel.detail).toBe(
      "the loop starts on III (C), so it sounds like C major (I V vi IV), the relative major; start it on i (Am) to sound in A minor (i VI III VII)",
    );
    // With no key given the estimate (C major) is read as its relative minor: still the same refusal.
    expect((await run(aeolian, `chords: chord("<C G Am F>").voicing()`, 4, null)).ok).toBe(false);
    // From i, and from VI (it lands on i), the loop passes.
    expect((await run(aeolian, `chords: chord("<Am F C G>").voicing()`, 4, A_MINOR)).ok).toBe(true);
    expect((await run(aeolian, `chords: chord("<F C G Am>").voicing()`, 4, A_MINOR)).ok).toBe(true);
  });
});

describe("12-bar blues: numerals by quality, the pickup, the turnaround", () => {
  const FORM = rule({ rule: "blues-form", variant: "standard" });
  test("a jazz blues under 'standard' names Gm7 as v, never V, and bar 4 'stays on' I", async () => {
    const jazz = "C7 F7 C7 [Gm7 C7] F7 F7 C7 [Em7 A7] Dm7 G7 [C7 A7] [Dm7 G7]";
    const r = await run(
      rule({ rule: "blues-form", variant: "standard" }),
      `chords: chord("<${jazz}>").voicing()`,
      12,
      null,
    );
    expect(r.ok).toBe(false);
    // Wave 7 Build: read against the variant asked (standard, or quick-change it accepts), not the closest other one.
    expect(r.detail).toBe("bar 4 should stay on I (C7); it is v (Gm7) (and 3 more bars)");
  });
  test("with a pickup, bar 1 is the first full bar (contracts §6.11)", async () => {
    const code = `chords: chord("<~ C7 C7 C7 C7 F7 F7 C7 C7 G7 F7 C7 G7>").voicing()`;
    const r = await run(FORM, code, 13, null, { pickup: { units: [1, 1] } } as Partial<RubricContext>);
    expect(r.ok).toBe(true);
    expect(r.detail).toBe("1 chorus of standard blues");
  });
  test("bar 12 on I: the turnaround names the chord that is there", async () => {
    const code = `chords: chord("<C7 C7 C7 C7 F7 F7 C7 C7 G7 F7 C7 C7>").voicing()`;
    const n = await strudel(code, 12);
    const ctx = { meter: "4/4", code, params: {}, bars: 12, totalBars: 12, key: C_BLUES } as RubricContext;
    const r = evalRule(
      rule({ rule: "contains-rn", rn: ["V", "V7"], min: 1, section: { bars: [12, 12] } }),
      n,
      ctx,
    );
    expect(r.ok).toBe(false);
    expect(r.detail).toBe("Bar 12: 0 × V/V7; at least 1 (the chords here: I (C7))");
  });
});

describe("swing: which line, and on which subdivision", () => {
  const SWING = rule({
    rule: "swing",
    track: ["hats", "@drums"],
    drums: ["hatClosed", "hatOpen", "ride"],
    subdivision: 8,
    ratio: [1.6, 2.4],
  });
  test("a whole-kit line whose hats play the off-beats swings with its kick and snare on the beats", async () => {
    const r = await run(SWING, `drums: s("[bd hh] [sd hh] [bd hh] [sd hh]").swingBy(1/3, 4)`, 2, null);
    expect(r.ok).toBe(true);
    expect(r.detail).toBe("`drums` swings at 2:1");
    const straight = await run(SWING, `drums: s("[bd hh] [sd hh] [bd hh] [sd hh]")`, 2, null);
    expect(straight.ok).toBe(false);
    expect(straight.detail).toBe("`drums` plays straight 8ths; swing them, long–short");
  });
  test("swung 16ths where swung 8ths are asked: named as such, not 'no steady 8ths'", async () => {
    const r = await run(SWING, `hats: s("hh*16").swingBy(1/3, 8)`, 2, null);
    expect(r.ok).toBe(false);
    expect(r.detail).toBe("`hats` swings 16ths; the brief asks for swung 8ths: swing the 8ths instead");
  });
  test("triplet hats written out (`[hh ~ hh]*4`) are a shuffle", async () => {
    expect((await run(SWING, `hats: s("[hh ~ hh]*4")`, 2, null)).ok).toBe(true);
  });
});

describe("sections: a time change after arrange() makes the bar counts untrue", () => {
  test("`.fast(2)` after arrange(): form.inconsistent-arrange, so the AST total never claims 32 bars of 16", () => {
    const code = `const melVerse = n("<0 2>").scale("C4:major")\nconst melChorus = n("<4 5>").scale("C4:major")\nmel: arrange([8, melVerse], [8, melChorus]).fast(2).s("piano")`;
    const s = sectionsFromAst(code);
    expect(s && "inconsistent" in s ? s.inconsistent.detail : null).toBe(
      "`.fast(2)` after arrange() on mel changes how long every section lasts, so its bar counts are no longer true; set the tempo with setcpm() instead",
    );
    expect(sectionsFromAst(code.replace(".fast(2)", ".fast(1)"))).toMatchObject({ totalBars: 16 });
    expect(sectionsFromAst(code.replace(".fast(2)", ".room(.2)"))).toMatchObject({ totalBars: 16 });
  });
});

describe("ladder L6 on Careless Love (the shipped answer key)", () => {
  const deps = headlessDeps();
  const ctx = {
    params: {},
    attemptNo: 1,
    firstAttempt: true,
    rung: 0 as const,
    tutorHints: 0,
    extraReplays: 0,
    lint: {
      profile: "graded" as const,
      unlocked: new Set<never>(),
      allowPreview: false,
      meter: "4/4" as const,
      key: null,
    },
  };
  const song = careless as SongDef;
  const item = (stage: "bass" | "changes") => ({
    itemId: "lad.6.song.careless-love",
    level: 6 as const,
    phrase: [1, 4] as [number, number],
    stage,
  });
  test("the right changes in G: one message naming the key and the move, and a fail", async () => {
    const code = `chord("<G D7 G G G G D7 D7 G G C C G D7 G G>").voicing().s("piano")`;
    const r = await gradeWith(songLadderRequest({ item: item("changes"), song, code, ctx }), deps);
    expect(r.status).toBe("fail");
    const ids = (r.diagnostics ?? []).map((d) => d.id);
    expect(ids).toContain("harmony.transposed");
    expect(ids).not.toContain("harmony.rn");
    expect((r.diagnostics ?? []).find((d) => d.id === "harmony.transposed")?.params).toEqual({
      gotKey: "G major",
      expKey: "F major",
      semis: "2 half steps",
      dir: "down",
    });
  });
  test("the bass written an octave up in one unlabelled line is still the bass (it scored 0, 'no line')", async () => {
    const code = `note("<f3 c3 f3 f3 f3 f3 c3 c3 f3 f3 bb2 bb2 f3 c3 f3 f3>").s("piano")`;
    const r = await gradeWith(songLadderRequest({ item: item("bass"), song, code, ctx }), deps);
    expect(r.status).toBe("pass");
    expect(r.score).toBe(1);
  });
});
