// The Wave 5 seed material is real course code (docs/design/wave5.md §6): every stand-in Make lints clean with the
// toolbox-aware lint under the unlocks of the first session that uses it (in every legal order the default order
// reaches it: the sites up to that session, plus the session's own rows, contracts §3.1 rule 2), evaluates headlessly
// in Strudel, and says what the unit is about. The C3 and C4 drafts pass the real rubric of their briefs.
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import type { CapstoneDef, Exercise, KeySpec, ToolEntry, UnlockableId } from "@oak/content-kit";
import { gradeCapstone, lintOak } from "@oak/grader";
import { evalHeadless, midisOf } from "@oak/grader/testing";
import { loadContent } from "../content/loader.ts";
import type { ContentSource } from "../content/types.ts";
import { CONTENT_DIR } from "../testing/course.ts";
import {
  AEOLIAN_LOOP,
  C3_SONG,
  C4_SONG,
  C5_SONG,
  CAPSTONE_DRAFTS,
  HARMONIC_MINOR,
  pickStandIn,
  ROOT_FIFTH_BASS,
  STAND_INS,
  TWELVE_BAR,
} from "./seed-wave5.ts";

setDefaultTimeout(60_000);

let content: ContentSource;
beforeAll(async () => {
  content = await loadContent({ contentDir: CONTENT_DIR });
});

/** Toolbox rows unlocked by the time `session` runs in the default order (plus side lessons taken before it). */
function unlockedAt(session: string, extraSites: readonly string[] = []): Set<string> {
  const order = content.syllabus.defaultOrder as readonly string[];
  const i = order.indexOf(session);
  const sites = new Set<string>([
    ...order.slice(0, i < 0 ? order.indexOf("U03.L02") + 1 : i + 1),
    ...extraSites,
  ]);
  const out = new Set<string>();
  for (const t of content.toolbox as readonly ToolEntry[]) {
    const at = ([] as string[]).concat(t.unlock.at as string | string[]);
    const fb = (t.unlock as { fallbackAt?: string }).fallbackAt;
    if (at.some((a) => sites.has(a)) || (fb !== undefined && sites.has(fb))) out.add(t.id);
  }
  return out;
}

/** The first session of each candidate's unit that it stands in for (its tools are all usable there). */
const FIRST: Record<string, { session: string; side?: string[] }> = {
  "root-fifth": { session: "U08.L02" },
  "const-bass": { session: "U08.L04" },
  "verse-chorus": { session: "U09.L02" },
  aeolian: { session: "U10.L01" },
  "harmonic-minor": { session: "U10.L06" },
  pentatonic: { session: "U11.L02" },
  "twelve-bar": { session: "U11.L05" },
  shuffle: { session: "U11.L07" },
  filters: { session: "A1.L02", side: ["A1.L01", "A1.L02"] },
  envelopes: { session: "A1.L03", side: ["A1.L01", "A1.L02", "A1.L03"] },
  space: { session: "A1.L04", side: ["A1.L01", "A1.L02", "A1.L03", "A1.L04"] },
};

describe("stand-in Makes (seed-wave5.ts)", () => {
  for (const c of STAND_INS)
    test(`${c.id} lints clean at ${FIRST[c.id]?.session} and evaluates`, async () => {
      const at = FIRST[c.id] as { session: string; side?: string[] };
      const unlocked = unlockedAt(at.session, at.side ?? []);
      const lint = lintOak(
        c.code,
        {
          profile: "graded",
          unlocked: unlocked as Set<UnlockableId>,
          allowPreview: false,
          meter: "4/4",
          key: null,
        },
        content.toolbox,
      );
      expect(lint.diagnostics.filter((d) => d.severity === "error").map((d) => d.message)).toEqual([]);
      const r = await evalHeadless(c.code, 12);
      expect(r.events.length).toBeGreaterThan(20);
      // The seeder picks it at that session (it is the latest candidate of the unit the learner can run).
      const unit = /^([A-Z]\d{1,2})\./.exec(at.session)?.[1] as string;
      expect(pickStandIn(unit, unlocked, content.toolbox)?.id).toBe(c.id);
    });

  test("before a unit's tools, an earlier unit's code (or the Wave 3 fallback) stands in", () => {
    expect(pickStandIn("U08", unlockedAt("U07.L10"), content.toolbox)?.id).toBe("root-fifth");
    expect(pickStandIn("U03", unlockedAt("U03.L02"), content.toolbox)).toBeNull();
    expect(pickStandIn("A1", unlockedAt("U03.L02", ["A1.L01"]), content.toolbox)).toBeNull();
  });

  test("the music says what the unit teaches", async () => {
    // Root then fifth under C G Am F: C–G, G–D, A–E, F–C.
    expect(await midisOf('n("<[0 ~ 0 4] [4 ~ 4 1] [5 ~ 5 2] [3 ~ 3 0]>").scale("C2:major")', 4)).toEqual([
      36, 36, 43, 43, 43, 38, 45, 45, 40, 41, 41, 36,
    ]);
    expect(ROOT_FIFTH_BASS).toContain('n("<[0 ~ 0 4] [4 ~ 4 1] [5 ~ 5 2] [3 ~ 3 0]>").scale("C2:major")');
    // The Aeolian loop i–VI–III–VII in A minor: Am F C G (roots A F C G).
    expect(await midisOf('n("<0 5 2 6>").scale("A1:minor")', 4)).toEqual([33, 41, 36, 43]);
    expect(AEOLIAN_LOOP).toContain('n("<0 5 2 6>")');
    // Harmonic minor: the melody's 7 over E is G♯ (raised), and its last note is A.
    expect(await midisOf('n("[6 4 7]").scale("A4:harmonic:minor")', 1)).toEqual([80, 76, 81]);
    expect(HARMONIC_MINOR).toContain('chord("<Am F C G Am F E Am>")');
    // The C blues scale: C E♭ F G♭ G B♭.
    expect(await midisOf('n("[0 1 2 3 4 5]").scale("C3:blues")', 1)).toEqual([48, 51, 53, 54, 55, 58]);
    expect(TWELVE_BAR).toContain("<C7!4 F7!2 C7!2 G7 F7 C7 G7>");
  });
});

describe("capstone drafts (C3, C4) pass the real rubric of their briefs", () => {
  const grade = async (id: string, code: string, key: KeySpec) => {
    const def = content.capstones.find((c) => c.id === id) as CapstoneDef;
    const unlocked = new Set(content.toolbox.map((t) => t.id)) as Set<UnlockableId>;
    return gradeCapstone({
      exercise: def.brief as Exercise,
      response: { code },
      ctx: {
        exerciseGlobalId: `${id}/brief`,
        key,
        meter: "4/4",
        bpm: 100,
        params: {},
        attemptNo: 1,
        firstAttempt: true,
        rung: 0,
        tutorHints: 0,
        extraReplays: 0,
        lint: { profile: "graded", unlocked, allowPreview: false, meter: "4/4", key },
      },
    } as never);
  };
  /** Rules the capstones author still writes as `custom` (not graded until replaced by the Wave 5 shapes). */
  const custom = (id: string) =>
    new Set(
      ((content.capstones.find((c) => c.id === id)?.brief?.rubric ?? []) as { id: string; rule: string }[])
        .filter((r) => r.rule === "custom")
        .map((r) => r.id),
    );

  test("C3: verse, chorus, verse, chorus; contrast; 96 seconds; the bass on the kick", async () => {
    const r = await grade("C3", C3_SONG, { tonic: "C", mode: "major" });
    const skip = custom("C3");
    const failed = (r.rubric ?? [])
      .filter((x) => x.required && !x.ok && !skip.has(x.ruleId))
      .map((x) => x.ruleId);
    expect(failed).toEqual([]);
  });

  test("C4: the Aeolian verse, a major V resolving to i, ♭3 and ♭6, ending on 1 (A minor)", async () => {
    const r = await grade("C4", C4_SONG, { tonic: "A", mode: "minor" });
    const skip = custom("C4");
    const failed = (r.rubric ?? [])
      .filter((x) => x.required && !x.ok && !skip.has(x.ruleId))
      .map((x) => x.ruleId);
    expect(failed).toEqual([]);
  });

  test("every draft lints clean with the whole toolbox and evaluates", async () => {
    const all = new Set(content.toolbox.map((t) => t.id)) as Set<UnlockableId>;
    for (const [id, drafts] of Object.entries(CAPSTONE_DRAFTS))
      for (const code of drafts) {
        const lint = lintOak(
          code,
          { profile: "graded", unlocked: all, allowPreview: false, meter: "4/4", key: null },
          content.toolbox,
        );
        expect({
          id,
          errors: lint.diagnostics.filter((d) => d.severity === "error").map((d) => d.message),
        }).toEqual({
          id,
          errors: [],
        });
        expect((await evalHeadless(code, 24)).events.length).toBeGreaterThan(20);
      }
    expect(C5_SONG).toContain("arrange([12, melChorus], [12, melChorus2])");
  });
});
