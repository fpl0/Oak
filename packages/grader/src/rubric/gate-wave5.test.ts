// Wave 5 gate: the grading defects review:studio left open, each pinned on real Strudel output.
// - The length of a piece whose parts agree on every section's bars but not on a name (`melVerse` reused in the
//   chorus) is the arrange() total, not one loop's period.
// - "Ends on 1" on a piece longer than the 16-bar motif cap reads the piece's own last bar.
// - Reading numerals (L6 changes, X2), a chord on the wrong root earns no quality credit, and a wrong chord on a
//   bar line inside a longer target chord is compared and named on its own bar.
// Music: Frankie and Johnny in C, I I I I | IV IV I I | V7 V7 I V7; Careless Love in F, F C7 F F | F F C7 C7 |
// F F B♭ B♭ | F C7 F F (content/repertoire, checked with `bun run theory`).
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { KeySpec, RubricRule, SongDef } from "@oak/content-kit";
import capstones from "../../../../content/capstones.ts";
import careless from "../../../../content/repertoire/careless-love/song.ts";
import frankie from "../../../../content/repertoire/frankie-and-johnny/song.ts";
import { headlessDeps, strudel } from "../analyze/__support__/fixtures.ts";
import { arrangedTotal, sectionsFromAst } from "../analyze/sections.ts";
import { straightenExact } from "../analyze/swing.ts";
import { gradeWith } from "../grade/index.ts";
import { songLadderRequest } from "../grade/song-ladder.ts";
import type { RubricContext } from "./context.ts";
import { evalRule } from "./rules.ts";

setDefaultTimeout(60_000);
const A_MINOR: KeySpec = { tonic: "A", mode: "minor" };
const rule = (b: Record<string, unknown>): RubricRule =>
  ({ id: "r", label: "r", required: true, skills: [], ...b }) as unknown as RubricRule;

describe("the length of a piece whose parts disagree only on a name", () => {
  test("melVerse reused in the chorus: inconsistent names, but 40 bars", () => {
    const code = `const chordsVerse = chord("<D G>").voicing()
const chordsChorus = chord("<G A>").voicing()
const melVerse = n("<0 2>").scale("D4:major")
chords: arrange([8, chordsVerse], [12, chordsChorus], [8, chordsVerse], [12, chordsChorus])
mel: arrange([8, melVerse], [12, melVerse], [8, melVerse], [12, melVerse])`;
    const s = sectionsFromAst(code);
    expect(s && "inconsistent" in s).toBe(true);
    expect(arrangedTotal(s)).toBe(40);
  });
  test("different bar counts stay unknown", () => {
    const s = sectionsFromAst(
      `const a = n("0")\nconst b = n("1")\nx: arrange([8, a], [4, b])\ny: arrange([4, a], [8, b])`,
    );
    expect(arrangedTotal(s)).toBeNull();
  });
});

describe("ends on 1 over i, in a piece longer than 16 bars", () => {
  test("verse, verse, chorus (24 bars) ends on the chorus's last note, A over Am", async () => {
    const code = `const chordsVerse = chord("<Am F C G>").voicing()
const chordsChorus = chord("<F G E Am>").voicing()
const melVerse = n("<[4 ~ 2 ~] [5 ~ 4 ~] [2 ~ 0 ~] [1 ~ ~ ~]>").scale("A3:minor")
const melChorus = n("<[5 7 5 ~] [6 ~ 4 ~] [4 ~ 1 ~] [0 ~ ~ ~]>").scale("A3:minor")
chords: arrange([8, chordsVerse], [8, chordsVerse], [8, chordsChorus]).s("piano")
mel: arrange([8, melVerse], [8, melVerse], [8, melChorus]).s("piano")`;
    const n = await strudel(code, 24);
    const ctx = { meter: "4/4", code, params: {}, bars: 24, totalBars: 24, key: A_MINOR } as RubricContext;
    const r = evalRule(rule({ rule: "ends-on-degree", track: "mel", degrees: ["1"], over: "i" }), n, ctx);
    expect(r.detail).toBe("it ends on 1 over i (Am)");
    expect(r.ok).toBe(true);
  });
});

describe("L6 changes read by numeral, bar by bar", () => {
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
  const item = (song: string) => ({
    itemId: `lad.6.song.${song}`,
    level: 6 as const,
    phrase: [1, 3] as [number, number],
    stage: "changes" as const,
  });
  test("Frankie and Johnny with F F for G7 G7 in bars 9–10 fails and names the change at bar 9", async () => {
    const right = `chord("<C C C C F F C C G7 G7 C G7>").voicing().s("piano")`;
    const ok = await gradeWith(
      songLadderRequest({ item: item("frankie-and-johnny"), song: frankie as SongDef, code: right, ctx }),
      deps,
    );
    expect(ok.status).toBe("pass");
    const wrong = right.replace("G7 G7 C G7", "F F C G7");
    const r = await gradeWith(
      songLadderRequest({ item: item("frankie-and-johnny"), song: frankie as SongDef, code: wrong, ctx }),
      deps,
    );
    expect(r.status).toBe("fail");
    const bars = (r.diagnostics ?? []).filter((d) => d.id === "harmony.rn").map((d) => d.where?.bar);
    expect(bars).toEqual([9]);
  });
  test("Careless Love with B♭ in bars 5–6 under a held F: the change at bar 5 is named", async () => {
    const code = `chord("<F C7 F F Bb Bb C7 C7 F F Bb Bb F C7 F F>").voicing().s("piano")`;
    const r = await gradeWith(
      songLadderRequest({
        item: { ...item("careless-love"), phrase: [1, 4] },
        song: careless as SongDef,
        code,
        ctx,
      }),
      deps,
    );
    const bars = (r.diagnostics ?? []).filter((d) => d.id === "harmony.rn").map((d) => d.where?.bar);
    expect(bars).toEqual([5]);
    expect(r.score).toBeLessThan(0.9);
  });
});

describe("straightening a swing a touch smaller than declared", () => {
  test("`.swingBy(.33, 4)` against a declared 1/3: the off-beat at .665 is straightened, the straight one is not", () => {
    const ev = (onset: [number, number]) => ({ id: String(onset), onset }) as never;
    const out = straightenExact([ev([133, 200]), ev([1, 2]), ev([0, 1])], [1, 3], [1, 1]) as unknown as {
      onset: [number, number];
    }[];
    const at = out.map((e) => e.onset[0] / e.onset[1]);
    expect(at[0]).toBeCloseTo(0.665 - 1 / 6, 6);
    expect(at[1]).toBe(0.5);
    expect(at[2]).toBe(0);
  });
});

describe("a capstone written in another key than its brief", () => {
  const deps = headlessDeps();
  const c4 = capstones.find((c) => c.id === "C4");
  const grade = (code: string) =>
    gradeWith(
      {
        exercise: c4?.brief as never,
        response: { code },
        ctx: {
          exerciseGlobalId: "C4/brief",
          mode: "capstone",
          key: A_MINOR,
          meter: "4/4",
          bpm: 80,
          params: {},
          attemptNo: 1,
          firstAttempt: true,
          rung: 0,
          tutorHints: 0,
          extraReplays: 0,
          lint: null,
        } as never,
      },
      deps,
    );
  const PIECE = `setcpm(80/4)
const chordsVerse = chord("<Am F C G>").voicing()
const chordsChorus = chord("<F G E Am>").voicing()
const bassVerse = n("<0 5 2 6>").scale("A1:minor")
const bassChorus = n("<5 6 4 0>").scale("A1:minor")
const melVerse = n("<[4 ~ 2 ~] [5 ~ 4 ~] [2 ~ 0 ~] [1 ~ ~ ~]>").scale("A3:minor")
const melChorus = n("<[5 7 5 ~] [6 ~ 4 ~] [4 ~ 1 ~] [0 ~ ~ ~]>").scale("A3:minor")
drums: s("bd ~ sd ~, hh*8").gain(.8)
chords: arrange([8, chordsVerse], [8, chordsChorus]).s("acgtr")
bass: arrange([8, bassVerse], [8, bassChorus]).s("ebass").lpf(600)
mel: arrange([8, melVerse], [8, melChorus]).s("piano")`;
  test("the same ballad in D minor fails and says so; in A minor there is no such line", async () => {
    const d = PIECE.replace("<Am F C G>", "<Dm Bb F C>")
      .replace("<F G E Am>", "<Bb C A Dm>")
      .replaceAll("A1:minor", "D2:minor")
      .replaceAll("A3:minor", "D4:minor");
    const r = await grade(d);
    expect(r.status).toBe("fail");
    const first = r.diagnostics?.find((x) => x.id === "harmony.key-mismatch");
    expect(first?.params).toEqual({ got: "D minor", exp: "A minor" });
    const ok = await grade(PIECE);
    expect((ok.diagnostics ?? []).some((x) => x.id === "harmony.key-mismatch")).toBe(false);
  });
});
