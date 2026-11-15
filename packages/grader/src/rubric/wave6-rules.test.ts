// Wave 6 Build: the rule fields content-kit 5 added (docs/design/wave6.md §3.2), each pinned on real Strudel 1.2.6
// output with a passing piece and the known-wrong pieces, and with the sentence the learner reads. The §6.6
// rubrics of C6, C7, CF-A and CF-T per shipped flavour are in grade/capstone-wave6.test.ts.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { KeySpec, RubricRule } from "@oak/content-kit";
import { strudel } from "../analyze/__support__/fixtures.ts";
import { sectionsFromAst } from "../analyze/sections.ts";
import type { RubricContext } from "./context.ts";
import { evalRule, RULES } from "./rules.ts";
import { unbuiltWave6, unbuiltWave6Matcher, WAVE6_UNBUILT } from "./wave6-rules.ts";

setDefaultTimeout(30_000);
const rule = (body: Record<string, unknown>): RubricRule =>
  ({ id: "w6", label: "w6", required: true, skills: [], ...body }) as unknown as RubricRule;

async function run(
  body: Record<string, unknown>,
  code: string,
  key?: KeySpec,
  bars?: number,
  extra: Partial<RubricContext> = {},
) {
  const s = sectionsFromAst(code);
  const total = bars ?? (s && "totalBars" in s ? s.totalBars : 8);
  const n = await strudel(code, total);
  const ctx: RubricContext = {
    meter: "4/4",
    code,
    params: {},
    bars: total,
    totalBars: total,
    ...(key ? { key } : {}),
    ...extra,
  };
  return evalRule(rule(body), n, ctx);
}
const C: KeySpec = { tonic: "C", mode: "major" };

test("every rule §6.6 names for C6, C7, CF-A and CF-T is registered, and none is waiting to be built", () => {
  for (const name of [
    "mode",
    "bars",
    "contains-rn",
    "progression",
    "key-change",
    "device-count",
    "form",
    "duration-sec",
    "reharmonize",
  ])
    expect(typeof RULES[name as keyof typeof RULES]).toBe("function");
  expect(WAVE6_UNBUILT).toEqual([]);
  expect(
    unbuiltWave6(
      rule({ rule: "reharmonize", melody: "mel", reference: { solutions: [""], bars: 4 }, min: 1 }),
    ),
  ).toBeNull();
  expect(unbuiltWave6Matcher({ m: "harmony", wrongQuality: "none" })).toBeNull();
});

describe("mode: one mode, a choice of modes, the learner's own tonic (C6, U14.L06)", () => {
  const VAMP = `setcpm(96/4)
chords: chord("<G F C G>").voicing()
mel: n("<[6 4 2 4] [6 ~ 4 2] [0 2 4 2] [6 4 2 0]>").scale("G4:mixolydian").s("piano")`;
  const fixed = { rule: "mode", tonic: "G", mode: "mixolydian", requireCharacteristic: true };
  const either = {
    rule: "mode",
    tonic: "declared",
    mode: "mixolydian",
    anyOf: ["mixolydian", "dorian"],
    requireCharacteristic: true,
  };
  test("a Mixolydian vamp with ♭7 on strong beats and home in half the bars passes, by name or by choice", async () => {
    expect((await run(fixed, VAMP, C, 16)).ok).toBe(true);
    const out = await run(either, VAMP, C, 16);
    expect(out.ok).toBe(true);
    expect(out.detail).toBe("G Mixolydian: ♭7 (F) on a strong beat 20 times, home in 50% of the bars");
  });
  test("a leading tone fails, is located, and is not let through as the other mode", async () => {
    const bad = VAMP.replace('n("<[6 4 2 4]', 'n("<[6# 4 2 4]');
    for (const r of [fixed, either]) {
      const out = await run(r, bad, C, 16);
      expect(out.ok).toBe(false);
      expect(out.detail).toBe("F♯ in bar 1 is degree 7; G Mixolydian has ♭7 (F) in its place");
      expect(out.where).toMatchObject({ bar: 1, track: "mel" });
    }
  });
  test("no colour note on a strong beat fails; a major vamp is not Dorian because it has a 6", async () => {
    const plain = `chords: chord("<G C G C>").voicing()\nmel: n("<[0 2 4 2] [4 2 1 0]>").scale("G4:mixolydian").s("piano")`;
    const out = await run(either, plain, C, 16);
    expect(out.ok).toBe(false);
    expect(out.detail).toBe(
      "its colour note ♭7 (F) is on a strong beat 0 times; put it on beat 1 or 3 at least twice",
    );
  });
  test("Dorian passes on its own tonic; natural minor is told what Dorian changes", async () => {
    const dorian = `chords: chord("<Dm G Dm G>").voicing()\nmel: n("<[5 4 2 4] [5 ~ 4 2]>").scale("D4:dorian").s("piano")`;
    expect((await run(either, dorian, C, 16)).detail).toBe(
      "D Dorian: 6 (B) on a strong beat 24 times, home in 50% of the bars",
    );
    const minor = `chords: chord("<Dm Gm Dm Gm>").voicing()\nmel: n("<[5 4 2 4] [5 ~ 4 2]>").scale("D4:minor").s("piano")`;
    const out = await run(either, minor, C, 16);
    expect(out.ok).toBe(false);
    expect(out.detail).toBe(
      "the scale in the code is D minor; the brief asks for Mixolydian or Dorian; B♭ in bar 1 is degree ♭6; D Dorian has 6 (B) in its place; its colour note 6 (B) is on a strong beat 0 times; put it on beat 1 or 3 at least twice",
    );
  });
  test("with no scale in the code the piece is read on its first chord", async () => {
    const names = `chords: chord("<G F C G>").voicing()\nmel: note("<[f4 d4 b3 d4] [f4 ~ d4 b3]>").s("piano")`;
    expect((await run(either, names, C, 16)).ok).toBe(true);
    const lead = `chords: chord("<G D C G>").voicing()\nmel: note("<[f#4 d4 b3 d4] [f#4 ~ d4 b3]>").s("piano")`;
    const out = await run(either, lead, C, 16);
    expect(out.ok).toBe(false);
    expect(
      out.detail.startsWith(
        'no line names a scale, so this is read on G, your first chord: write `.scale("G4:mixolydian")`',
      ),
    ).toBe(true);
  });
  test("a riff over a bass pedal with no chords line has its home in the bass", async () => {
    const pedal = `bass: note("g2*4").s("sawtooth")\nmel: n("<[6 4 2 4] [6 ~ 4 2]>").scale("G4:mixolydian").s("piano")`;
    expect((await run(either, pedal, C, 16)).detail).toBe(
      "G Mixolydian: ♭7 (F) on a strong beat 16 times, home in 100% of the bars",
    );
    const away = pedal.replace('note("g2*4")', 'note("<g2 c2 c2 c2>").struct("x*4")');
    const out = await run(either, away, C, 16);
    expect(out.ok).toBe(false);
    expect(out.detail).toBe("the G bass note is in 25% of the bars; the home chord needs at least 40%");
  });
});

describe("contains-rn: a chord of a kind, a run in order, the key in force (C7, CF-A, U15, U16)", () => {
  const secondary = { rule: "contains-rn", rn: [], min: 1, kind: ["secondary-dominant"], mustResolve: true };
  test("a secondary dominant that resolves, whichever it is", async () => {
    const out = await run(secondary, `chords: chord("<C D7 G7 C>").voicing()`, C);
    expect(out.ok).toBe(true);
    expect(out.detail).toBe("V7/V (D7) → V7 (G7) in bar 2; V7/V (D7) → V7 (G7) in bar 6");
    // A chain: each dominant resolves to the next (by root).
    const chain = await run(secondary, `chords: chord("<C E7 A7 D7 G7 C>").voicing()`, C, 6);
    expect(chain.value).toBe(3);
  });
  test("one that goes elsewhere names where it goes and where it points", async () => {
    const out = await run(secondary, `chords: chord("<C D7 F C>").voicing()`, C);
    expect(out.ok).toBe(false);
    expect(out.detail).toBe("V7/V (D7) in bar 2 doesn't resolve: it goes to IV (F), not to V (G)");
    expect(out.where).toMatchObject({ bar: 2, slot: 2 });
  });
  test("the key's own chords hold none", async () => {
    const out = await run(secondary, `chords: chord("<C Am F G>").voicing()`, C);
    expect(out.detail).toBe(
      "no secondary dominant that resolves yet (the chords here: I (C), vi (Am), IV (F), V (G))",
    );
  });
  test("a borrowed chord of any kind: iv in major; the Dorian IV and the Picardy I in minor", async () => {
    const borrowed = { rule: "contains-rn", rn: [], kind: ["borrowed"], min: 1 };
    expect((await run(borrowed, `chords: chord("<C Fm C G>").voicing()`, C)).detail).toBe(
      "iv (Fm) in bar 2; iv (Fm) in bar 6",
    );
    const minor = await run(borrowed, `chords: chord("<Am D E A>").voicing()`, { tonic: "A", mode: "minor" });
    expect(minor.detail).toBe("IV (D) in bar 2; I (A) in bar 4; IV (D) in bar 6");
    expect((await run(borrowed, `chords: chord("<C Am F G>").voicing()`, C)).ok).toBe(false);
  });
  const run3 = { rule: "contains-rn", rn: ["bVI", "bVII", "I"], min: 1, inOrder: true };
  test("♭VI–♭VII–I in a row passes at a chord a bar and at two beats a chord", async () => {
    expect((await run(run3, `chords: chord("<C Ab Bb C>").voicing()`, C)).detail).toBe(
      "♭VI → ♭VII → I from bar 2 (twice)",
    );
    expect((await run(run3, `chords: chord("<C F [Ab Bb] C>").voicing()`, C)).ok).toBe(true);
  });
  test("the wrong order, ♭VI alone, a landing on vi and no ♭VI at all each say what is missing", async () => {
    const detail = async (chords: string) =>
      (await run(run3, `chords: chord("<${chords}>").voicing()`, C)).detail;
    expect(await detail("C Bb Ab C")).toBe("♭VI is there from bar 3, but then comes I (C), not ♭VII (B♭)");
    expect(await detail("C Ab Ab C")).toBe("♭VI is there from bar 2, but then comes I (C), not ♭VII (B♭)");
    expect(await detail("C Ab Bb Am")).toBe(
      "♭VI → ♭VII is there from bar 2, but then comes vi (Am), not I (C)",
    );
    expect(await detail("C F G C")).toBe(
      "no ♭VI → ♭VII → I in a row yet: there is no ♭VI (A♭) (the chords here: I (C), IV (F), V (G))",
    );
  });
  test("a chain of dominants in order (U15.L05)", async () => {
    const chain = { rule: "contains-rn", rn: ["V/ii", "V/V", "V"], min: 1, inOrder: true };
    expect((await run(chain, `chords: chord("<C A7 D7 G7 C>").voicing()`, C, 5)).ok).toBe(true);
    const visitors = await run(chain, `chords: chord("<C A7 Dm D7 G7 C>").voicing()`, C, 6);
    expect(visitors.ok).toBe(false);
    expect(visitors.detail).toBe("V/ii is there from bar 2, but then comes ii (Dm), not V/V (D)");
  });
  const LIFT = `setcpm(100/4)
const chordsVerse = chord("<C Am F G>").voicing()
const chordsChorus = chord("<F G C Am>").voicing()
const chordsChorus2 = chord("<G A D Bm>").voicing()
const melVerse = n("<[0 2 4 2] [4 2 1 ~]>")
const melChorus = n("<[7 6 4 2] [4 ~ 2 ~]>")
chords: arrange([8, chordsVerse], [8, chordsChorus], [8, chordsVerse], [8, chordsChorus2]).s("piano")
mel: arrange([8, melVerse], [8, melChorus], [8, melVerse], [8, melChorus]).scale("<C4:major!24 D4:major!8>").s("piano")`;
  test("a lifted chorus is read in its own key: its A chord is V of D, not V/ii of C", async () => {
    expect((await run(secondary, LIFT, C)).ok).toBe(false);
    const listed = await run({ rule: "contains-rn", rn: ["V/ii"], min: 1, mustResolve: true }, LIFT, C);
    expect(listed.ok).toBe(false);
    expect(listed.value).toBe(0);
    // The same holds for a rule scoped to the last section: I IV V vi read in D.
    const last = await run({ rule: "contains-rn", rn: ["V"], min: 1, section: "last" }, LIFT, C);
    expect(last.ok).toBe(true);
  });
  test("key-change: the lift passes; chord names left in the old key are named with their bar", async () => {
    const lift = { rule: "key-change", at: "last", semitones: [1, 2], minBarsAfter: 8, sameMelody: true };
    expect((await run(lift, LIFT, C)).detail).toBe("C major → D major at bar 25");
    const stuck = await run(lift, LIFT.replace('chord("<G A D Bm>")', 'chord("<F G C Am>")'), C);
    expect(stuck.ok).toBe(false);
    expect(stuck.detail).toBe(
      "the tune of chorus2 is in D major, but its chords are still the C major ones: bar 25 is F; lifted, it is G",
    );
  });
});

describe("modulation: the key plan first, and the way in (U17.L01, U17.L03)", () => {
  const PIVOT = `setcpm(100/4)
chords: chord("<C Am F G C Am D7 G>").voicing().s("piano")
mel: n("<[0 2 4 2] [4 2 1 ~] [0 2 4 2] [4 2 1 ~] [0 2 4 2] [4 2 1 ~] [0 2 4 2] [4 2 0 ~]>").scale("<C4:major!6 G4:major!2>").s("piano")`;
  const viaPivot = { rule: "modulation", to: "dominant", via: "pivot" };
  test("through a pivot chord to the dominant: the pivot is named in both keys", async () => {
    const out = await run(viaPivot, PIVOT, C, 8);
    expect(out.ok).toBe(true);
    expect(out.detail).toBe("moves to G major at bar 7: Am is vi in C major and ii in G major, then D7");
  });
  test("a chord of one key only before the dominant is no pivot", async () => {
    const out = await run(viaPivot, PIVOT.replace("C Am D7 G", "C F D7 G"), C, 8);
    expect(out.ok).toBe(false);
    expect(out.detail).toBe(
      "moves to G major at bar 7, but not through a pivot chord: F before D7 belongs to one key only; a pivot chord is in both (C, Em, G, Am)",
    );
  });
  test("a jump with no dominant, and a piece that never leaves home", async () => {
    const jump = PIVOT.replace("C Am D7 G", "C Am G G").replace(
      "C4:major!6 G4:major!2",
      "C4:major!7 G4:major!1",
    );
    expect((await run(viaPivot, jump, C, 8)).detail).toBe(
      "moves to G major at bar 8, but not through a pivot chord: the new key arrives with no V of G major (D or D7) before it; go through a chord both keys own (C, Em, G, Am), then D or D7",
    );
    const home = await run(viaPivot, PIVOT.replace("<C4:major!6 G4:major!2>", "C4:major"), C, 8);
    expect(home.detail).toBe("the piece stays in C major; the brief asks for a move to G major");
  });
  test("the bar is named when the key changes somewhere else", async () => {
    const out = await run({ ...viaPivot, atBar: 5 }, PIVOT, C, 8);
    expect(out.ok).toBe(false);
    expect(out.detail).toBe("the key changes in bar 7, not bar 5");
    expect(out.where).toEqual({ bar: 7 });
  });
  test("direct: a lift with no chord to prepare it passes; a pivot does not", async () => {
    const LIFT = `const chordsVerse = chord("<C Am F G>").voicing()
const chordsChorus2 = chord("<D Bm G A>").voicing()
const melVerse = n("<[0 2 4 2] [4 2 1 ~]>")
const melChorus2 = n("<[0 2 4 2] [4 2 1 ~]>")
chords: arrange([8, chordsVerse], [8, chordsChorus2]).s("piano")
mel: arrange([8, melVerse], [8, melChorus2]).scale("<C4:major!8 D4:major!8>").s("piano")`;
    const direct = { rule: "modulation", to: "up-step", via: "direct" };
    expect((await run(direct, LIFT, C)).detail).toBe("moves to D major at bar 9, directly");
    const out = await run({ rule: "modulation", to: "dominant", via: "direct" }, PIVOT, C, 8);
    expect(out.ok).toBe(false);
    expect(out.detail.startsWith("moves to G major at bar 7, but through a pivot chord (Am, then D7)")).toBe(
      true,
    );
    // The wrong destination is named.
    expect((await run({ rule: "modulation", to: "dominant" }, LIFT, C)).detail).toBe(
      "it moves to D major, not to G major",
    );
  });
  test("to the relative minor from the bridge on (U17.L03)", async () => {
    const REL = `setcpm(100/4)
const chordsVerse = chord("<C Am F G>").voicing()
const chordsBridge = chord("<Am Dm E7 Am>").voicing()
const melVerse = n("<[0 2 4 2] [4 2 1 ~]>").scale("C4:major")
const melBridge = n("<[0 2 4 2] [4 2 1 ~] [6 4 2 4] [0 ~ ~ ~]>").scale("A3:harmonic:minor")
chords: arrange([4, chordsVerse], [4, chordsBridge]).s("piano")
mel: arrange([4, melVerse], [4, melBridge]).s("piano")`;
    const r = { rule: "modulation", to: "relative", atBar: 5 };
    expect((await run(r, REL, C)).detail).toBe("moves to A minor at bar 5");
    const stays = REL.replace("A3:harmonic:minor", "C4:major").replace("<Am Dm E7 Am>", "<Am Dm G C>");
    expect((await run(r, stays, C)).ok).toBe(false);
  });
});

describe("guide-tones: which notes are judged, and how far the line may move (U12.L05)", () => {
  const GT = `setcpm(80/4)
chords: chord("<Dm7 G7 C^7 A7>").voicing().s("rhodes")
mel: note("<f4 f4 e4 e4>").s("piano")`;
  const r = { rule: "guide-tones", track: "mel", harmony: "chords", minRatio: 0.75, at: "change" };
  test("a line on 3rds and 7ths at the changes passes", async () => {
    const out = await run(r, GT, C, 8);
    expect(out.ok).toBe(true);
    expect(out.detail).toBe("6 of 8 chord changes meet a 3rd or a 7th (75%)");
  });
  test("a held note names the chord, the note it has and the chord's guide tones", async () => {
    const out = await run(r, GT.replace("<f4 f4 e4 e4>", "a4"), C, 8);
    expect(out.ok).toBe(false);
    expect(out.detail).toBe(
      "0 of 8 chord changes meet a 3rd or a 7th (0%); at least 75%. Bar 1: over Dm7 the line has A (the 5th); Dm7's guide tones are F (the 3rd) and C (the 7th)",
    );
    expect(out.where).toMatchObject({ bar: 1, track: "mel" });
  });
  test("maxMoveSemis: a leap between guide tones is named with the nearest one", async () => {
    const out = await run({ ...r, maxMoveSemis: 2 }, GT.replace("<f4 f4 e4 e4>", "<f4 b4 e4 g4>"), C, 8);
    expect(out.ok).toBe(false);
    expect(out.detail).toBe(
      "8 of 8 chord changes meet a 3rd or a 7th (100%); into bar 2 the line moves 6 half steps (F to B); a guide-tone line moves 2 at most: the nearest guide tone of G7 is F",
    );
    expect((await run({ ...r, maxMoveSemis: 2 }, GT, C, 8)).ok).toBe(true);
  });
  test("at strong: the notes on beats 1 and 3 are judged", async () => {
    const line = "<[f4 a4 c5 a4] [b4 d5 f5 d5] [e4 g4 b4 g4] [g4 e4 c#5 e4]>";
    const out = await run({ ...r, at: "strong" }, GT.replace("<f4 f4 e4 e4>", line), C, 8);
    expect(out.detail).toBe("16 of 16 strong-beat notes meet a 3rd or a 7th (100%)");
  });
  test("without the new fields the Wave 1 reading stands", async () => {
    const out = await run({ rule: "guide-tones", track: "mel", harmony: "chords", minRatio: 0.7 }, GT, C, 8);
    expect(out.ok).toBe(true);
  });
});

describe("velocity-ghosts: one drum, with accents beside the ghost notes (U13.L02)", () => {
  const r = { rule: "velocity-ghosts", track: "snare", min: 3, on: "16th-offbeat", accents: 2 };
  const SNARE = `snare: s("[~ ~ ~ ~] [sd ~ ~ sd] [~ sd ~ ~] [sd ~ ~ sd]").velocity("[1 1 1 1] [1 1 1 .3] [1 .3 1 1] [1 1 1 .3]")`;
  test("three ghost notes between two loud backbeats, counted on one pass of the loop", async () => {
    const out = await run(r, SNARE, C, 4);
    expect(out.ok).toBe(true);
    expect(out.detail).toBe("3 ghost note(s) on 16th off-beats beside 2 accent(s)");
  });
  test("no velocity at all; every hit quiet; the cell written once over the whole line", async () => {
    const flat = await run(r, SNARE.replace(/\.velocity\(.*\)/, ""), C, 4);
    expect(flat.detail).toBe(
      "every hit you can hear is at the same strength: a ghost note sounds at .4 of full strength or less (0 ghost notes on 16th off-beats; at least 3)",
    );
    const quiet = await run(r, SNARE.replace(/\.velocity\(.*\)/, ".velocity(.3)"), C, 4);
    expect(quiet.ok).toBe(false);
    expect(quiet.detail).toBe(
      "every hit is quiet (the loudest is 0.24): keep the accents at full strength, `.velocity()` 1",
    );
    const half = await run(r, SNARE.replace(/\.velocity\(.*\)/, '.velocity("1 .3")'), C, 4);
    expect(half.ok).toBe(false);
    expect(half.detail).toBe(
      "2 ghost note(s) on 16th off-beats; at least 3 (the quiet hit at bar 1, 4 is on the eighth-note grid: a ghost note sits on a sixteenth between the eighths)",
    );
    expect(half.where).toMatchObject({ bar: 1, beat: 4 });
  });
  test("drum: the snare of a whole-kit line; a line under its own gain still has accents", async () => {
    const kit = `drums: stack(s("bd*4"), s("[~ ~ ~ ~] [sd ~ ~ sd] [~ sd ~ ~] [sd ~ ~ sd]").velocity("[1 1 1 1] [1 1 1 .3] [1 .3 1 1] [1 1 1 .3]"))`;
    expect((await run({ ...r, track: "@drums", drum: "snare" }, kit, C, 4)).ok).toBe(true);
    const hats = `hats: s("hh*8").velocity("[1 .4]*4").gain(.5)`;
    const out = await run(
      { rule: "velocity-ghosts", track: "hats", min: 4, on: "any", accents: 4 },
      hats,
      C,
      4,
    );
    expect(out.ok).toBe(true);
  });
  test("without the new fields: ghost notes of one pass of the loop", async () => {
    const out = await run({ rule: "velocity-ghosts", track: "snare", min: 3 }, SNARE, C, 4);
    expect(out.value).toBe(3);
    expect(out.ok).toBe(true);
  });
});

describe("form: a section somewhere, and the form of the picked song (CF-A, CF-T.S4)", () => {
  const SONG = `setcpm(120/4)
const melVerse = n("0 2 4 2")
const melChorus = n("4 5 4 2")
const melBridge = n("5 4 2 0")
const melIntro = n("0 ~ ~ ~")
mel: arrange([4, melIntro], [8, melVerse], [8, melChorus], [8, melVerse], [8, melChorus], [8, melBridge], [8, melChorus]).scale("C4:major").s("piano")`;
  const bridge = { rule: "form", pattern: "*", contains: ["bridge"] };
  test("a bridge wherever it falls", async () => {
    expect((await run(bridge, SONG, C)).detail).toBe("intro verse chorus verse chorus bridge chorus");
    const none = await run(bridge, SONG.replace("[8, melBridge], ", ""), C);
    expect(none.ok).toBe(false);
    expect(none.detail).toBe(
      "the form is intro verse chorus verse chorus chorus: there is no bridge yet (name its section consts `chordsBridge`, `melBridge`)",
    );
    expect(none.extra?.[0]?.id).toBe("form.wrong");
    // A loop has no sections at all.
    expect((await run(bridge, `mel: n("0 2 4 2").scale("C4:major")`, C)).extra?.[0]?.id).toBe(
      "form.no-sections",
    );
  });
  test("a fixed pattern still asks for its place; the Wave 5 patterns are unchanged", async () => {
    expect((await run({ rule: "form", pattern: "? ? ? ? ? bridge ?" }, SONG, C)).ok).toBe(true);
    expect((await run({ rule: "form", pattern: "verse chorus" }, SONG, C)).ok).toBe(false);
  });
  const AABA = `setcpm(120/4)
const melA = n("0 2 4 2")
const melB = n("4 5 4 2")
const melIntro = n("0 ~ ~ ~")
mel: arrange([4, melIntro], [8, melA], [8, melA], [8, melB], [8, melA]).scale("C4:major").s("piano")`;
  const songForm = ["A", "A", "B", "A"].map((label) => ({ label, bars: 8 }));
  const song = { rule: "form", pattern: "@song", extra: ["intro", "outro"] };
  test("@song: the song's sections in order, with an intro around them", async () => {
    expect((await run(song, AABA, C, undefined, { songForm })).ok).toBe(true);
    // Any names of the same shape: verse verse bridge verse.
    const named = AABA.replaceAll("melA", "melVerse").replaceAll("melB", "melBridge");
    expect((await run(song, named, C, undefined, { songForm })).ok).toBe(true);
  });
  test("@song: a missing section, an added one, a short one, and no song to compare with", async () => {
    const d = async (code: string, r: Record<string, unknown> = song) =>
      (await run(r, code, C, undefined, { songForm })).detail;
    expect(await d(AABA.replace("[8, melB], ", ""))).toBe(
      "your arrangement has 3 of the song's 4 sections (A A A); the song goes A A B A",
    );
    expect(await d(AABA, { rule: "form", pattern: "@song" })).toBe(
      "your sections go A B B C B; the song goes A A B A",
    );
    expect(await d(AABA.replace("[8, melB]", "[4, melB]"))).toBe(
      "your b is 4 bars; that section of the song is 8",
    );
    const unknown = await run(song, AABA, C);
    expect(unknown.ok).toBe(false);
    expect(unknown.extra?.[0]?.id).toBe("rubric.unknown");
  });
});

describe("the rules contracts §6.6 names, as they have been since Wave 1", () => {
  test("♭VI–♭VII–I is also found as a `progression` over its bars", async () => {
    const p = { rule: "progression", rn: ["bVI", "bVII", "I"], bars: [2, 4] };
    expect((await run(p, `chords: chord("<C Ab Bb C>").voicing()`, C)).ok).toBe(true);
    expect((await run(p, `chords: chord("<C F G C>").voicing()`, C)).ok).toBe(false);
  });
  test("duration-sec is computed from the arranged bars and the tempo, never played", async () => {
    const SONG = `setcpm(120/4)
const melVerse = n("0 2 4 2")
const melChorus = n("4 5 4 2")
mel: arrange([8, melVerse], [8, melChorus], [8, melVerse], [8, melChorus], [8, melVerse], [8, melChorus]).scale("C4:major").s("piano")`;
    // 48 bars at 120 BPM in 4/4: 2 s a bar, 96 s.
    const short = await run({ rule: "duration-sec", min: 120 }, SONG, C);
    expect(short.ok).toBe(false);
    expect(short.value).toBe(96);
    const long = SONG.replace(
      "[8, melChorus]).scale",
      "[8, melChorus], [8, melChorus], [8, melChorus]).scale",
    );
    expect((await run({ rule: "duration-sec", min: 120 }, long, C)).ok).toBe(true);
  });
});

describe("reharmonize: the same tune over new chords (U16.L05)", () => {
  const TUNE = 'n("<[0 3 2 3] [4 1 4@2] [3 2 1 2] [3@4]>")';
  const piece = (chords: string, tune = TUNE): string =>
    `setcpm(84/4)\nchords: chord("<${chords}>").voicing().s("piano")\nmel: ${tune}.scale("C4:major").s("piano")`;
  const ORIGINAL = piece("C Dm G C");
  const body = {
    rule: "reharmonize",
    melody: "mel",
    reference: { solutions: [ORIGINAL], bars: 4 },
    min: 2,
    kinds: ["borrowed", "secondary-dominant"],
  };
  const check = async (code: string, r: Record<string, unknown> = body) => {
    const ref = await strudel(ORIGINAL, 4);
    return run(r, code, C, 4, { resolveReference: () => ref });
  };
  test("two chords from outside the key under the unchanged tune pass", async () => {
    const out = await check(piece("C D7 G [Ab Bb]"));
    expect(out.ok).toBe(true);
    expect(out.detail).toBe(
      "the tune is unchanged; new colours: V7/V (D7) in bar 2, ♭VI (A♭) in bar 4, ♭VII (B♭) in bar 4",
    );
  });
  test("the starter, and a swap inside the key, are told what to bring in", async () => {
    const same = await check(ORIGINAL);
    expect(same.ok).toBe(false);
    expect(same.detail).toBe(
      "the tune is unchanged, and every chord is still the key's own (the chords here: I (C), ii (Dm), V (G)): bring in a borrowed chord or a secondary dominant, 2 of them",
    );
    const inside = await check(piece("Am Dm G C"));
    expect(inside.ok).toBe(false);
    expect(inside.value).toBe(0);
    const one = await check(piece("C D7 G C"));
    expect(one.detail).toBe(
      "the tune is unchanged; 1 chord(s) from outside the key (V7/V (D7) in bar 2); the brief asks for 2",
    );
  });
  test("a changed note of the tune fails whatever the chords, and is located", async () => {
    const out = await check(piece("C D7 G [Ab Bb]", TUNE.replace("[4 1 4@2]", "[4 2 4@2]")));
    expect(out.ok).toBe(false);
    expect(out.detail).toBe(
      "Bar 2, 2: the tune has D here; yours has E. The tune stays as it is; only the chords change",
    );
    expect(out.where).toMatchObject({ bar: 2, beat: 2 });
    const added = await check(piece("C D7 G [Ab Bb]", TUNE.replace("[3@4]", "[3@2 4@2]")));
    expect(added.ok).toBe(false);
    const dropped = await check(piece("C D7 G [Ab Bb]", TUNE.replace("[0 3 2 3]", "[0 3 2 ~]")));
    expect(dropped.detail.startsWith("Bar 1")).toBe(true);
  });
  test("without kinds: bars with another chord than the original's", async () => {
    const any = { rule: "reharmonize", melody: "mel", reference: body.reference, min: 2 };
    expect((await check(piece("Am Dm Em C"), any)).detail).toBe(
      "the tune is unchanged over new chords in 2 bar(s)",
    );
    expect((await check(piece("C Dm G7 C"), any)).ok).toBe(false);
  });
});

describe("tuplets: a triplet somewhere in the line (U13.L05)", () => {
  const r = { rule: "tuplets", track: "hats", min: 1, division: 3 };
  test("a triplet on any beat counts, wherever in the bar it falls", async () => {
    const first = await run(r, 'hats: s("[hh hh hh] hh hh hh")', C, 2);
    expect(first.ok).toBe(true);
    expect(first.detail).toBe("1 triplet, the first in bar 1, beat 1");
    const third = await run(r, 'hats: s("hh hh [hh hh hh] hh")', C, 2);
    expect(third.detail).toBe("1 triplet, the first in bar 1, beat 3");
    expect(third.where).toEqual({ bar: 1, beat: 3 });
    // `.ply(3)` makes every beat one: four in one pass of the one-bar loop, however long it plays.
    expect((await run({ ...r, min: 4 }, 'hats: s("hh*4").ply(3)', C, 4)).value).toBe(4);
  });
  test("straight eighths and sixteenths hold none, and the fault says how to write one", async () => {
    const out = await run(r, 'hats: s("hh*8")', C, 2);
    expect(out.ok).toBe(false);
    expect(out.detail).toBe(
      "no triplet yet: cut a beat into three equal notes, `[x x x]` inside one beat or `.ply(3)`",
    );
    expect((await run(r, 'hats: s("hh*16")', C, 2)).ok).toBe(false);
  });
  test("in 6/8 the beat already divides in three: eighths are no triplets, a duplet is the tuplet", async () => {
    const six = { meter: "6/8" as const };
    expect((await run(r, 'hats: s("hh*6")', C, 2, six)).ok).toBe(false);
    const duplet = await run(
      { rule: "tuplets", track: "hats", min: 1 },
      'hats: s("[hh hh] [hh hh hh]")',
      C,
      2,
      six,
    );
    expect(duplet.ok).toBe(true);
  });
});

describe("progression by chord changes: a held chord is one chord on both sides", () => {
  const G_MIX: KeySpec = { tonic: "G", mode: "mixolydian" };
  const vamp = { rule: "progression", schema: "schema.mixolydian", allowRotation: true };
  test("I–♭VII–IV–I started on any chord, with its two bars of I side by side", async () => {
    for (const bars of ["G F C G", "F C G G", "C G G F", "G G F C"])
      expect([bars, (await run(vamp, `chords: chord("<${bars}>").voicing()`, G_MIX)).ok]).toEqual([
        bars,
        true,
      ]);
    const other = await run(vamp, `chords: chord("<F G C G>").voicing()`, G_MIX);
    expect(other.ok).toBe(false);
  });
  test("a chain with a chord held for two bars (III7 VI7 VI7 II7 V7 I)", async () => {
    const chain = { rule: "progression", rn: ["I", "V/vi", "V/ii", "V/ii", "V/V", "V", "I"] };
    const five = `chords: chord("<C E7 A7 A7 D7 G7 C G7>").voicing()`;
    expect((await run(chain, five, C)).ok).toBe(true);
    expect((await run(chain, five.replace("D7", "Dm7"), C)).ok).toBe(false);
  });
});

describe("degree-set with a count: one pass of the loop (U14, U15.L01)", () => {
  const twice = { rule: "degree-set", track: "mel", anyOf: ["#4", "b7"], minCount: 2 };
  test("a two-bar loop with one ♯4 has it once, however long it plays; two in the loop pass", async () => {
    const once = await run(twice, 'mel: n("<[4 3# 4 2] [0 2 4 2]>").scale("C4:major")', C, 8);
    expect(once.ok).toBe(false);
    expect(once.value).toBe(1);
    const two = await run(twice, 'mel: n("<[4 3# 4 2] [6b 4 2 0]>").scale("C4:major")', C, 8);
    expect(two.ok).toBe(true);
  });
  test("without a count nothing changes: the note anywhere is enough", async () => {
    const has = { rule: "degree-set", track: "mel", contains: ["b7"] };
    expect((await run(has, 'mel: n("<[4 6b 4 2] [0 2 4 2]>").scale("C4:major")', C, 8)).ok).toBe(true);
  });
});

describe("contains-rn with mustResolve: a leading-tone chord resolves up a half step (U12.L03)", () => {
  const A_MINOR: KeySpec = { tonic: "A", mode: "minor" };
  const body = { rule: "contains-rn", rn: ["iiø7", "viio7"], min: 2, mustResolve: true };
  test("Bm7♭5 → E7 (up a 4th) and G♯°7 → Am7 (up a half step) both resolve", async () => {
    const code = 'chords: chord("<Bm7b5 E7 G#o7 Am7>").voicing().s("piano")';
    const r = await run(body, code, A_MINOR, 4);
    expect(r.ok).toBe(true);
    expect(r.value).toBe(2);
  });
  test("G♯°7 that goes to F does not resolve, and says where it would go", async () => {
    const code = 'chords: chord("<Bm7b5 E7 G#o7 F>").voicing().s("piano")';
    const r = await run(body, code, A_MINOR, 4);
    expect(r.ok).toBe(false);
    expect(r.value).toBe(1);
  });
  test("as a kind: an applied leading-tone chord into its target counts (C♯°7 → Dm in C)", async () => {
    const code = 'chords: chord("<C C#o7 Dm7 G7>").voicing().s("piano")';
    const r = await run(
      { rule: "contains-rn", rn: [], kind: ["applied-leading-tone"], min: 1, mustResolve: true },
      code,
      C,
      4,
    );
    expect(r.ok).toBe(true);
  });
});
