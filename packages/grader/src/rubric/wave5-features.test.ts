// Wave 5 rule fields and messages (content-kit features `rubric.section`, `chord-qualities.depth`,
// `degree-set.any-of`, `ends-on-degree.over`, `blues-form.choruses`), everything key-relative in minor (numerals
// with the major V, schema.aeolian, the Andalusian cadence, ♭3 ♭6 ♭7 and the raised 7), and the detail lines that
// name the actual fault ("bar 5 should move to IV", "the chorus is no louder … than the verse: change two of
// these", "plays straight 8ths; add .swingBy(1/3, 4)"). Music checked by hand and with `bun run theory`.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { KeySpec, RubricRule } from "@oak/content-kit";
import { strudel } from "../analyze/__support__/fixtures.ts";
import type { RubricContext } from "./context.ts";
import { evaluateRubric } from "./index.ts";

setDefaultTimeout(30_000);
const A_MINOR: KeySpec = { tonic: "A", mode: "minor" };
const C_BLUES: KeySpec = { tonic: "C", mode: "blues" };
const C: KeySpec = { tonic: "C", mode: "major" };

const rule = (body: Record<string, unknown>): RubricRule =>
  ({ id: "r", label: "rule", required: true, skills: [], ...body }) as unknown as RubricRule;
async function check(
  r: RubricRule,
  code: string,
  bars: number,
  key: KeySpec | null = C,
  o: Partial<RubricContext> = {},
) {
  const n = await strudel(code, bars);
  const ctx: RubricContext = {
    meter: "4/4",
    code,
    params: {},
    bars,
    totalBars: bars,
    ...(key ? { key } : {}),
    ...o,
  };
  const out = evaluateRubric([r], n, ctx);
  const row = out.rows[0];
  return {
    ok: row?.ok ?? false,
    detail: String(row?.diag?.params.detail ?? ""),
    value: row?.value,
    extra: out.extra,
    where: row?.diag?.where,
  };
}

const twelve = (bars: string) => `chords: chord("<${bars}>").voicing()`;
const STD = "C7 C7 C7 C7 F7 F7 C7 C7 G7 F7 C7 G7";

describe("minor is minor: numerals with the major V, schemas, degrees", () => {
  const BALLAD = 'chords: chord("<Am F C G Am F E Am>").voicing()';
  test("contains-rn V (with the raised 7) followed by i; the minor v does not count", async () => {
    const r = rule({ rule: "contains-rn", rn: ["V"], min: 1, mustResolve: true });
    expect((await check(r, BALLAD, 8, A_MINOR)).ok).toBe(true);
    const natural = await check(r, BALLAD.replace(" E Am", " Em Am"), 8, A_MINOR);
    expect(natural.ok).toBe(false);
    // V that does not go home: counted as unresolved.
    expect((await check(r, BALLAD.replace(" E Am", " Am E"), 8, A_MINOR)).ok).toBe(false);
  });
  test("progression schema.aeolian i–VI–III–VII in A minor; the Andalusian i–VII–VI–V in D minor", async () => {
    const aeo = rule({ rule: "progression", schema: "schema.aeolian" });
    expect((await check(aeo, 'chords: chord("<Am F C G>").voicing()', 4, A_MINOR)).ok).toBe(true);
    const bad = await check(aeo, 'chords: chord("<Am F Dm G>").voicing()', 4, A_MINOR);
    expect(bad.ok).toBe(false);
    expect(bad.detail).toContain("chord 3 is iv, the brief wants III");
    const anda = rule({ rule: "progression", schema: "schema.andalusian" });
    expect(
      (await check(anda, 'chords: chord("<Dm C Bb A>").voicing()', 4, { tonic: "D", mode: "minor" })).ok,
    ).toBe(true);
  });
  test("degree-set: ♭3 and ♭6 in A minor; the harmonic minor's G♯ reads as 7, not ♭7", async () => {
    const r = rule({ rule: "degree-set", track: "mel", contains: ["b3", "b6"] });
    expect((await check(r, 'mel: n("0 2 5 4 6 7").scale("A4:minor")', 1, A_MINOR)).ok).toBe(true);
    const noLe = await check(r, 'mel: n("0 2 4 3 1 0").scale("A4:minor")', 1, A_MINOR);
    expect(noLe.ok).toBe(false);
    expect(noLe.detail).toBe("no ♭6 in the line yet");
    const raised = rule({ rule: "degree-set", track: "mel", contains: ["7"] });
    expect((await check(raised, 'mel: n("0 6 7").scale("A4:harmonic:minor")', 1, A_MINOR)).ok).toBe(true);
    expect((await check(raised, 'mel: n("0 6 7").scale("A4:minor")', 1, A_MINOR)).ok).toBe(false);
  });
  test("cadences in minor: V–i is authentic, iv–i plagal, the minor v–i is no cadence (and says so in i, iv)", async () => {
    const r = rule({ rule: "cadence", types: ["PAC", "IAC", "PC"], at: { bar: 3 } });
    const tune = (c: string, b: string) =>
      `chords: chord("<${c}>").voicing()\nbass: note("<${b}>")\nmel: n("<[3 1] [1 ~] [0 ~] [0 ~]>").scale("A4:minor")`;
    expect((await check(r, tune("Dm E Am Am", "d2 e2 a1 a1"), 4, A_MINOR)).ok).toBe(true);
    expect((await check(r, tune("Am Dm Am Am", "a1 d2 a1 a1"), 4, A_MINOR)).ok).toBe(true);
    const v = await check(r, tune("Dm Em Am Am", "d2 e2 a1 a1"), 4, A_MINOR);
    expect(v.ok).toBe(false);
    expect(v.detail).toBe("bar 3 ends v → i: no cadence; the brief asks for V → i or iv → i");
  });
  test("bass-line in minor: roots and fifths under Am and E", async () => {
    const r = rule({
      rule: "bass-line",
      track: "bass",
      members: { allowed: ["root", "fifth", "octave"], minRatio: 0.9, each: true },
    });
    const code = 'chords: chord("<Am E>").voicing()\nbass: note("<[a1 e2 a2 e2] [e2 b2 e3 b2]>")';
    expect((await check(r, code, 2, A_MINOR)).ok).toBe(true);
  });
});

describe("rubric.section: a rule read on one section or bar window", () => {
  const SONG = `const chordsVerse = chord("<Am F C G>").voicing()
const chordsChorus = chord("<F G Am Am>").voicing()
chords: arrange([4, chordsVerse], [4, chordsChorus], [4, chordsVerse], [4, chordsChorus])`;
  test("the verse is the aeolian loop even though the chorus is not", async () => {
    const r = rule({ rule: "progression", schema: "schema.aeolian", section: { section: "verse" } });
    expect((await check(r, SONG, 16, A_MINOR)).ok).toBe(true);
    // The second verse is read too (`nth`), and the window counts from its own bar 1.
    expect(
      (
        await check(
          rule({ rule: "progression", schema: "schema.aeolian", section: { section: "verse", nth: 2 } }),
          SONG,
          16,
          A_MINOR,
        )
      ).ok,
    ).toBe(true);
    const chorus = await check(
      rule({ rule: "progression", schema: "schema.aeolian", section: { section: "chorus" } }),
      SONG,
      16,
      A_MINOR,
    );
    expect(chorus.ok).toBe(false);
    expect(chorus.detail).toMatch(/^The chorus: /);
  });
  test("a section the piece does not have, and a piece with no arrange()", async () => {
    const r = rule({ rule: "progression", schema: "schema.aeolian", section: { section: "bridge" } });
    const none = await check(r, SONG, 16, A_MINOR);
    expect(none.ok).toBe(false);
    expect(none.detail).toBe("there is no bridge in your sections (verse chorus verse chorus)");
    expect(none.extra.map((d) => d.id)).toEqual(["form.no-section"]);
    const flat = await check(r, 'chords: chord("<Am F C G>").voicing()', 4, A_MINOR);
    expect(flat.extra.map((d) => d.id)).toEqual(["form.no-sections"]);
  });
  test("bar 12 contains V (C5): a bar window, bars counted from 1", async () => {
    const r = rule({ rule: "contains-rn", rn: ["V"], min: 1, section: { bars: [12, 12] } });
    expect((await check(r, twelve(STD), 12, C_BLUES)).ok).toBe(true);
    const home = await check(r, twelve(STD.replace(/G7$/, "C7")), 12, C_BLUES);
    expect(home.ok).toBe(false);
    expect(home.detail).toMatch(/^Bar 12: 0 × V/);
  });
});

describe("C5's fields: dominant sevenths, blue notes, the 12-bar form", () => {
  test("chord-qualities depth seventh: every chord a dominant seventh (symbol or hand-voiced)", async () => {
    const r = rule({ rule: "chord-qualities", track: "chords", subsetOf: ["7"], depth: "seventh" });
    expect((await check(r, twelve(STD), 12, C_BLUES)).ok).toBe(true);
    expect((await check(r, 'chords: note("<[c3,e3,g3,bb3] [f3,a3,c4,eb4]>")', 2, C_BLUES)).ok).toBe(true);
    const triad = await check(r, twelve(STD.replace("F7 F7", "F F7")), 12, C_BLUES);
    expect(triad.ok).toBe(false);
    expect(triad.detail).toContain("bar 5 is F (major); the brief allows dominant 7th: write F7");
    // At triad depth the seventh is read as its triad: C7 counts as major.
    const core = rule({ rule: "chord-qualities", track: "chords", subsetOf: ["maj"] });
    expect((await check(core, twelve(STD), 12, C_BLUES)).ok).toBe(true);
    expect((await check({ ...core, depth: "seventh" } as RubricRule, twelve(STD), 12, C_BLUES)).ok).toBe(
      false,
    );
  });
  test("degree-set anyOf: ♭3 or ♭5 at least twice", async () => {
    const r = rule({ rule: "degree-set", track: "mel", anyOf: ["b3", "b5"], minCount: 2 });
    expect((await check(r, 'mel: note("c4 eb4 f4 gb4 g4 bb4")', 1, C_BLUES)).ok).toBe(true);
    const once = await check(r, 'mel: note("c4 eb4 f4 g4")', 1, C_BLUES);
    expect(once.ok).toBe(false);
    expect(once.detail).toBe("♭3 or ♭5 once; at least 2");
    const none = await check(r, 'mel: note("c4 e4 g4 a4")', 1, C_BLUES);
    expect(none.detail).toBe("no ♭3 or ♭5 in the line yet; use one at least 2 times");
  });
  test("blues-form: two choruses, standard or quick change; a broken bar says where it should move", async () => {
    const r = rule({ rule: "blues-form", variant: "standard", choruses: 2, quickChangeOk: true });
    expect((await check(r, twelve(`${STD} ${STD}`), 24, C_BLUES)).ok).toBe(true);
    const qc = STD.replace("C7 C7 C7 C7", "C7 F7 C7 C7");
    expect((await check(r, twelve(`${qc} ${qc}`), 24, C_BLUES)).ok).toBe(true);
    const one = await check(r, twelve(STD), 12, C_BLUES);
    expect(one.ok).toBe(false);
    expect(one.detail).toBe(
      "1 chorus (12 bars); the brief asks for 2 (24 bars): write the next chorus out with `arrange([12, …], [12, …])` and change something in it (the riff, an answer, the drums), since a chorus that only repeats the last one reads as the same 12 bars looping",
    );
    const bar5 = STD.replace("C7 C7 F7 F7", "C7 C7 C7 F7");
    const wrong = await check(r, twelve(`${bar5} ${bar5}`), 24, C_BLUES);
    expect(wrong.ok).toBe(false);
    expect(wrong.detail).toBe("bar 5 should move to IV (F7); it is I (C7) (and 1 more bar)");
    expect(wrong.where?.bar).toBe(5);
    expect(wrong.extra.map((d) => d.id)).toEqual(["harmony.blues-bar"]);
    // No key given: the tonic is read from bar 1, so a blues in F is a blues.
    const inF = "F7 F7 F7 F7 Bb7 Bb7 F7 F7 C7 Bb7 F7 C7";
    expect((await check(r, twelve(`${inF} ${inF}`), 24, null)).ok).toBe(true);
  });
  test("ends-on-degree over i (C4): 1 over Am passes, 1 over F does not", async () => {
    const r = rule({ rule: "ends-on-degree", degrees: ["1"], track: "mel", over: "i" });
    const code =
      'chords: chord("<F E Am Am>").voicing()\nmel: n("<[4 2] [1 ~] [2 1] [0@2]>").scale("A4:minor")';
    expect((await check(r, code, 4, A_MINOR)).ok).toBe(true);
    const overVI = await check(r, code.replace("<F E Am Am>", "<Am E Am F>"), 4, A_MINOR);
    expect(overVI.ok).toBe(false);
    expect(overVI.detail).toBe("it ends on 1, but the last note sounds over VI (F); end on i (Am) under it");
  });
  test("ends-on-degree over i: a 1-bar riff in an 8-bar section ends over the loop's last chord, not bar 1's", async () => {
    // C4's template shape: the riff ends on 1 every bar, but the section's last bar is G (VII), so it fails.
    const r = rule({ rule: "ends-on-degree", degrees: ["1"], track: "mel", over: "i" });
    const code = `const chordsVerse = chord("<Am F C G>").voicing()
const melVerse = n("[4 2 1 0]").scale("A4:minor")
chords: arrange([8, chordsVerse])
mel: arrange([8, melVerse])`;
    const overVII = await check(r, code, 8, A_MINOR);
    expect(overVII.ok).toBe(false);
    expect(overVII.detail).toBe(
      "it ends on 1, but the last note sounds over VII (G); end on i (Am) under it",
    );
    expect(overVII.where?.bar).toBe(4);
    // The same riff over a loop that comes home in its last bar passes.
    expect((await check(r, code.replace("<Am F C G>", "<F G E Am>"), 8, A_MINOR)).ok).toBe(true);
  });
});

describe("messages that name the fault", () => {
  test("contrast: a chorus no different from the verse names the axes to change", async () => {
    const code = `const melVerse = n("<[0 2 4 2] [1 3 2 0]>").scale("C4:major")
const melChorus = n("<[0 2 4 2] [1 3 2 0]>").scale("C4:major")
mel: arrange([2, melVerse], [2, melChorus], [2, melVerse], [2, melChorus])`;
    const r = rule({
      rule: "contrast",
      a: { section: "chorus" },
      b: { section: "verse" },
      axes: ["pitch", "density", "energy"],
      minAxes: 2,
    });
    const out = await check(r, code, 8);
    expect(out.ok).toBe(false);
    expect(out.detail).toBe(
      "the chorus is no higher or lower in tune, busier or sparser or louder or fuller than the verse: change two of these",
    );
    expect(out.extra.map((d) => d.id)).toEqual(["form.contrast"]);
  });
  test("swing: straight hats are told the fix; too hard a swing is told to ease off", async () => {
    const r = rule({
      rule: "swing",
      track: ["hats", "@drums"],
      drums: ["hatClosed", "hatOpen", "ride"],
      subdivision: 8,
      ratio: [1.6, 2.4],
    });
    const straight = await check(r, 'hats: s("hh*8")', 1);
    expect(straight.detail).toBe("`hats` plays straight 8ths; add `.swingBy(1/3, 4)`");
    expect(straight.extra.map((d) => d.id)).toEqual(["rhythm.swing-missing"]);
    const hard = await check(r, 'hats: s("hh*8").swingBy(0.6, 4)', 1);
    expect(hard.ok).toBe(false);
    expect(hard.extra.map((d) => d.id)).toEqual(["rhythm.swing-amount"]);
    // 3/4 counts three beats a bar.
    const waltz = await check(r, 'hats: s("hh*6")', 1, C, { meter: "3/4" });
    expect(waltz.detail).toContain("`.swingBy(1/3, 3)`");
  });
  test("groove-lock names a bar where the bass plays without the kick", async () => {
    const r = rule({ rule: "groove-lock", kick: "drums", bass: "bass", min: 0.75 });
    const out = await check(r, 'drums: s("bd ~ bd ~")\nbass: note("c2 c2 c2 c2")', 1);
    expect(out.ok).toBe(false);
    expect(out.detail).toBe(
      "50% of the bass notes land with a kick; at least 75% (bar 1, 2: the bass plays without the kick; move one of them)",
    );
  });
});
