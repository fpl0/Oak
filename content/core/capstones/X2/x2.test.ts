// X2 Blues Transcription (contracts §6.6 X2, content/specs/U11.md): the checks of content/capstones.ts graded
// through the real grader in capstone mode, the way the capstone workspace grades them (`gradePhraseCheck`).
//   - The checks: bass ≥ 0.90, then the changes ≥ 0.85 (after the bass), then the melody line by line ≥ 0.85
//     (after the changes), key-relative like X1's phrases.
//   - Each song of the pool by ID, once author:repertoire's answer key exists (content/repertoire/<slug>/song.ts):
//     its own layers pass every check, and an empty draft fails each one.
//   - Until then, and always as the fixed pin for the marks, a STAND-IN strain shaped as the spec describes the
//     pool's answer keys (12 bars in G, one chord a bar, swing 8ths, a phrase per 4-bar line). Its tune is Oak's
//     own, written for this test; it is not St. Louis Blues and is never served to a learner.
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { PhraseCheck, SongDef, SongId } from "@oak/content-kit";
import * as grader from "@oak/grader";
import { capstoneById, TRANSCRIBE_PASS, X2_CHECKS } from "../../../capstones.ts";
import { toolbox } from "../../../toolbox.ts";
import { unlockedFor } from "../../../validate/harness.ts";

setDefaultTimeout(120_000);

const ctx = {
  params: {},
  attemptNo: 1,
  firstAttempt: true,
  rung: 0 as const,
  tutorHints: 0,
  extraReplays: 0,
  lint: {
    profile: "graded" as const,
    unlocked: unlockedFor("X2.S1" as never),
    allowPreview: false,
    meter: "4/4" as const,
    key: null,
  },
};
const grade = (song: SongDef, check: PhraseCheck, code: string) =>
  grader.gradePhraseCheck({ capstoneId: "X2", check, song, code, ctx });
const passed = (r: Awaited<ReturnType<typeof grade>>) => grader.phraseCheckPassed(r);
const ids = (r: { diagnostics: { id: string }[] }) => r.diagnostics.map((d) => d.id);

const [s1 = [], s2 = []] = X2_CHECKS;
const byId = new Map([...s1, ...s2].map((c) => [c.id, c] as const));
const check = (id: string) => byId.get(id) as PhraseCheck;

// --- the stand-in strain ---------------------------------------------------------------------------------

/** The standard 12 bars in G, a root–5th bass on beats 1 and 3 under them. */
const CHANGES = ["G7", "G7", "G7", "G7", "C7", "C7", "G7", "G7", "D7", "C7", "G7", "D7"];
const ROOT: Record<string, readonly [string, string]> = { C7: ["c2", "g2"], D7: ["d2", "a2"] };
const rootOf = (c: string): readonly [string, string] => ROOT[c] ?? ["g1", "d2"];
const bassOf = (bars: readonly string[]) =>
  `note("<${bars.map((c) => `[${rootOf(c)[0]} ~ ${rootOf(c)[1]} ~]`).join(" ")}>").s("ebass")`;
const chordsOf = (bars: readonly string[]) => `chord("<${bars.join(" ")}>").voicing()`;
/** The tune in degrees over G (`n`, degree − 1), a line of four bars each: call, hold, call, answer. */
const TUNE = [
  "[4 ~ 2 4]",
  "[4 ~ ~ ~]",
  "[4 ~ 2 4]",
  "[5 4 2 ~]",
  "[3 ~ 2 0]",
  "[0 ~ ~ ~]",
  "[2 1 0 ~]",
  "[0 ~ ~ ~]",
  "[1 1 1 0]",
  "[-2 ~ 0 ~]",
  "[0 ~ ~ ~]",
  "[~ ~ -3 -1]",
];
const melodyOf = (tune: readonly string[], scale = "G4:major") =>
  `n("<${tune.join(" ")}>").scale("${scale}").swingBy(1/3, 4).s("piano")`;
const STAND_IN = {
  id: "song.x2-stand-in",
  title: "Stand-in 12-bar strain (test only)",
  year: "trad",
  status: "trad",
  provenance: { source: "Oak test fixture", year: 1930 },
  verifiedBy: "test fixture",
  key: { tonic: "G", mode: "major" },
  meter: "4/4",
  bpm: 96,
  swing: { subdivision: 8, amount: 1 / 3 },
  form: "12-bar blues strain",
  answerKey: {
    bars: 12,
    code: "",
    layers: { bass: bassOf(CHANGES), chords: chordsOf(CHANGES), melody: melodyOf(TUNE) },
    phrases: [
      [1, 4],
      [5, 8],
      [9, 12],
    ],
  },
} as unknown as SongDef;
const HEAD = "setcpm(96/4)\n\n";
const draft = (...lines: string[]) => `${HEAD}${lines.join("\n")}`;

beforeAll(async () => {
  await grader.initRealm({ toolbox: [...toolbox], lockdown: false });
});

describe("X2's checks (contracts §6.6 X2)", () => {
  test("bass ≥ 0.90, then the changes ≥ 0.85, then the melody per 4-bar line ≥ 0.85, in that order", () => {
    expect(s1.map((c) => [c.id, c.layer, c.phrase, c.pass, c.after ?? []])).toEqual([
      ["bass", "bass", [1, 3], 0.9, []],
      ["changes", "chords", [1, 3], 0.85, ["bass"]],
    ]);
    expect(s2.map((c) => [c.id, c.layer, c.phrase, c.pass, c.after ?? []])).toEqual([
      ["melody-1", "melody", 1, 0.85, ["changes"]],
      ["melody-2", "melody", 2, 0.85, ["changes"]],
      ["melody-3", "melody", 3, 0.85, ["changes"]],
    ]);
    expect(TRANSCRIBE_PASS.X2).toMatchObject({ bass: 0.9, changes: 0.85, melody: 0.85 });
    // Every `after` names a check defined earlier (feature `capstone.check-after`).
    const seen = new Set<string>();
    for (const c of [...s1, ...s2]) {
      for (const a of c.after ?? []) expect(seen.has(a)).toBe(true);
      seen.add(c.id);
    }
  });
  test("the sessions: S1 holds bass and changes, S2 the melody and the release", () => {
    const x2 = capstoneById.get("X2");
    expect(x2?.sessionDefs.map((s) => [s.id, (s.checks ?? []).map((c) => c.id), !!s.release])).toEqual([
      ["X2.S1", ["bass", "changes"], false],
      ["X2.S2", ["melody-1", "melody-2", "melody-3"], true],
    ]);
    expect(x2?.reviewRevisions).toBe(2);
  });
  test("melody lines compare key-relative; the bass is given meter, key, tonic and pickup", () => {
    const pitch = (m: PhraseCheck["matcher"]): string | undefined =>
      m.m === "melody" ? m.pitch : m.m === "all" ? m.of.map(pitch).find(Boolean) : undefined;
    for (const c of s2) expect(pitch(c.matcher)).toBe("key-relative");
    expect(check("bass").given).toEqual({ meter: true, key: true, tonic: true, pickup: true });
  });
});

describe("X2 on the stand-in strain (12 bars in G, swing 8ths)", () => {
  const L = STAND_IN.answerKey.layers as Record<"bass" | "chords" | "melody", string>;

  test("bass: the answer passes; a bass that never leaves G fails", async () => {
    const right = await grade(STAND_IN, check("bass"), draft(`bass: ${L.bass}`));
    expect([right.status, right.mode, passed(right)]).toEqual(["pass", "capstone", true]);
    const stuck = await grade(STAND_IN, check("bass"), draft(`bass: ${bassOf(CHANGES.map(() => "G7"))}`));
    expect(passed(stuck)).toBe(false);
  });

  test("bass: three bars wrong (IV and I where V belongs) fall under 0.90", async () => {
    const wrong = [...CHANGES];
    wrong[8] = "C7";
    wrong[9] = "G7";
    wrong[11] = "C7";
    const missed = await grade(STAND_IN, check("bass"), draft(`bass: ${bassOf(wrong)}`));
    expect(missed.score).toBeLessThan(0.9);
    expect(passed(missed)).toBe(false);
  });

  test("changes: the sevenths pass; plain triads for the dominant sevenths fail (d11: a wrong quality earns nothing)", async () => {
    const sevenths = await grade(STAND_IN, check("changes"), draft(`bass: ${L.bass}`, `chords: ${L.chords}`));
    expect(passed(sevenths)).toBe(true);
    const triads = await grade(
      STAND_IN,
      check("changes"),
      draft(`bass: ${L.bass}`, `chords: ${chordsOf(CHANGES.map((c) => c.replace("7", "")))}`),
    );
    expect(passed(triads)).toBe(false);
  });

  test("changes: IV for V in bar 9 alone passes (11 of 12); the whole last line wrong fails", async () => {
    const one = [...CHANGES];
    one[8] = "C7";
    const r = await grade(STAND_IN, check("changes"), draft(`bass: ${L.bass}`, `chords: ${chordsOf(one)}`));
    expect(passed(r)).toBe(true);
    expect(r.score).toBeLessThan(1);
    const line = [...CHANGES.slice(0, 8), "C7", "D7", "C7", "C7"];
    // The learner's own bass under those chords moves with them (a right bass under wrong chords still earns
    // part credit per chord: 0.85, the grader's weights).
    const bad = await grade(
      STAND_IN,
      check("changes"),
      draft(`bass: ${bassOf(line)}`, `chords: ${chordsOf(line)}`),
    );
    expect(passed(bad)).toBe(false);
    expect(ids(bad)).toContain("harmony.rn");
  });

  for (const n of [1, 2, 3])
    test(`melody-${n}: the line passes, in another key too; a degree off throughout fails`, async () => {
      const c = check(`melody-${n}`);
      expect(passed(await grade(STAND_IN, c, draft(`mel: ${L.melody}`)))).toBe(true);
      expect(passed(await grade(STAND_IN, c, draft(`mel: ${melodyOf(TUNE, "C4:major")}`)))).toBe(true);
      const up = TUNE.map((bar) => bar.replace(/-?\d+/g, (d) => String(Number(d) + 1)));
      const off = await grade(STAND_IN, c, draft(`mel: ${melodyOf(up)}`));
      expect(passed(off)).toBe(false);
      expect(ids(off).some((id) => id.startsWith("melody."))).toBe(true);
    });

  test("melody: played straight where the strain swings, the line still passes (swing is given)", async () => {
    const straight = await grade(
      STAND_IN,
      check("melody-1"),
      draft(`mel: ${L.melody.replace(".swingBy(1/3, 4)", "")}`),
    );
    expect(passed(straight)).toBe(true);
  });

  test("an empty draft fails every check", async () => {
    const empty = draft('mel: n("~").s("piano")');
    for (const c of [...s1, ...s2]) expect(passed(await grade(STAND_IN, c, empty))).toBe(false);
  });
});

// --- the pool, by ID ---------------------------------------------------------------------------------------

const REPERTOIRE = join(import.meta.dir, "../../../repertoire");
for (const id of capstoneById.get("X2")?.song ?? []) {
  const slug = (id as SongId).replace(/^song\./, "");
  const file = join(REPERTOIRE, slug, "song.ts");
  describe(`X2 on ${id}`, () => {
    if (!existsSync(file)) {
      test.todo(`${id}: no answer key yet (content/repertoire/${slug}/song.ts, author:repertoire)`);
      return;
    }
    test("the answer key's own layers pass every check; an empty draft fails them", async () => {
      const song = (await import(file)).default as SongDef;
      expect((song.answerKey.phrases ?? []).length).toBeGreaterThanOrEqual(3);
      const l = song.answerKey.layers;
      for (const layer of ["bass", "chords", "melody"] as const) expect(l[layer]).toBeTruthy();
      const head = `setcpm(${song.bpm}/${Number(song.meter.split("/")[0])})\n\n`;
      const all = `${head}bass: ${l.bass}\nchords: ${l.chords}\nmel: ${l.melody}`;
      const empty = `${head}mel: n("~").s("piano")`;
      for (const c of [...s1, ...s2]) {
        const r = await grade(song, c, all);
        expect([c.id, passed(r)]).toEqual([c.id, true]);
        expect([c.id, passed(await grade(song, c, empty))]).toEqual([c.id, false]);
      }
    });
  });
}
