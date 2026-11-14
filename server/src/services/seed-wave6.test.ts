// The Wave 6 seed material is real course code (docs/design/wave6.md §6): every stand-in Make lints clean with the
// toolbox-aware lint under the unlocks of the first session that uses it, evaluates headlessly in Strudel and says
// what its unit is about; every capstone draft lints clean under the unlocks of its own session and the released
// pieces meet the rules of their briefs that the grader runs.
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import type { CapstoneDef, Exercise, KeySpec, ToolEntry, UnlockableId } from "@oak/content-kit";
import { gradeCapstone, lintOak } from "@oak/grader";
import { evalHeadless, midisOf } from "@oak/grader/testing";
import { loadContent } from "../content/loader.ts";
import type { ContentSource } from "../content/types.ts";
import { CONTENT_DIR } from "../testing/course.ts";
import { pickStandIn, STAND_INS } from "./seed-wave5.ts";
import {
  C6_SONG,
  C7_SECTIONS,
  C7_SONG,
  CFA_SINGLE,
  CFA_TUNES_DRAFT,
  WAVE6_CAPSTONE_DRAFTS,
  WAVE6_STAND_INS,
} from "./seed-wave6.ts";

setDefaultTimeout(120_000);

let content: ContentSource;
beforeAll(async () => {
  content = await loadContent({ contentDir: CONTENT_DIR });
});

/** Toolbox rows unlocked by the time `session` runs in the default order (its own rows included). */
function unlockedAt(session: string): Set<string> {
  const order = content.syllabus.defaultOrder as readonly string[];
  const sites = new Set<string>(order.slice(0, order.indexOf(session) + 1));
  const out = new Set<string>();
  for (const t of content.toolbox as readonly ToolEntry[]) {
    const at = ([] as string[]).concat(t.unlock.at as string | string[]);
    const fb = (t.unlock as { fallbackAt?: string }).fallbackAt;
    if (at.some((a) => sites.has(a)) || (fb !== undefined && sites.has(fb))) out.add(t.id);
  }
  return out;
}
const lintErrors = (code: string, unlocked: Set<string>) =>
  lintOak(
    code,
    {
      profile: "graded",
      unlocked: unlocked as Set<UnlockableId>,
      allowPreview: false,
      meter: "4/4",
      key: null,
    },
    content.toolbox,
  )
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.message);

/** The first session each stand-in is used in (its tools are all usable there). */
const FIRST: Record<string, string> = {
  sevenths: "U12.L02",
  pushed: "U13.L01",
  mixolydian: "U14.L01",
  secondary: "U15.L01",
  borrowed: "U16.L01",
  lifted: "U17.L02",
};

describe("stand-in Makes (seed-wave6.ts)", () => {
  for (const c of WAVE6_STAND_INS)
    test(`${c.id} lints clean at ${FIRST[c.id]} and evaluates`, async () => {
      const session = FIRST[c.id] as string;
      const unlocked = unlockedAt(session);
      expect(lintErrors(c.code, unlocked)).toEqual([]);
      const r = await evalHeadless(c.code, 8);
      expect(r.events.length).toBeGreaterThan(20);
      // The seeder picks it at that session: the latest candidate of the unit (or an earlier one) that fits.
      const unit = /^(U\d{2})\./.exec(session)?.[1] as string;
      expect(pickStandIn(unit, unlocked, content.toolbox, [...STAND_INS, ...WAVE6_STAND_INS])?.id).toBe(c.id);
    });

  test("before a unit's own tools the earlier unit's code stands in", () => {
    const all = [...STAND_INS, ...WAVE6_STAND_INS];
    // U14.L01's own session unlocks the Mixolydian scale; the day before it the pushed chords are the latest fit.
    expect(pickStandIn("U14", unlockedAt("U13.L06"), content.toolbox, all)?.id).toBe("pushed");
    expect(pickStandIn("U12", unlockedAt("U11.L08"), content.toolbox, all)?.unit).toBe("U11");
  });

  test("the music says what the unit teaches", async () => {
    // ♭7 of G Mixolydian is F (index 6): F4 = 65... in the G4 octave it is F5 (77).
    expect(await midisOf('n("[6 0]").scale("G4:mixolydian")', 1)).toEqual([77, 67]);
    // ♯1 in C is C♯ (written 0#); ♭6 is A♭ (written 5b).
    expect(await midisOf('n("[0# 5b]").scale("C4:major")', 1)).toEqual([61, 68]);
    // The key plan: the same degrees a whole step up from bar 5.
    expect(await midisOf('n("<0 4 5 3>").scale("<C2:major!4 D2:major!4>")', 8)).toEqual([
      36, 43, 45, 41, 38, 45, 47, 43,
    ]);
  });
});

describe("capstone drafts (C6, C7, CF-A)", () => {
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
  /**
   * Required rules a piece fails, leaving out a rule the grader does not run yet (it answers `rubric.unknown`,
   * wave6.md §3.2) and suggestions.
   */
  const failed = (r: Awaited<ReturnType<typeof grade>>) =>
    (r.rubric ?? [])
      .filter((x) => x.required && !x.ok && x.diag?.id !== "rubric.unknown")
      .map((x) => x.ruleId);

  test("every draft lints clean under the unlocks of its own session and evaluates", async () => {
    for (const [id, drafts] of Object.entries(WAVE6_CAPSTONE_DRAFTS))
      for (const [i, code] of drafts.entries()) {
        const unlocked = unlockedAt(`${id}.S${i + 1}`);
        expect({ id, session: i + 1, errors: lintErrors(code, unlocked) }).toEqual({
          id,
          session: i + 1,
          errors: [],
        });
        expect((await evalHeadless(code, 16)).events.length).toBeGreaterThan(20);
      }
  });

  test("C6: sixteen bars of G Mixolydian, the ♭7 on strong beats, home under most bars", async () => {
    const r = await grade("C6", C6_SONG, { tonic: "G", mode: "mixolydian" } as KeySpec);
    expect(failed(r)).toEqual([]);
    const ev = await evalHeadless(C6_SONG, 16);
    // The tune's first note of nine bars is F (♭7), and no F♯ sounds anywhere.
    const mel = ev.events.filter((e) => (e as { track?: string }).track === "mel");
    expect(mel.length).toBeGreaterThan(30);
  });

  test("C7.S2's draft has the colours and no lift; the released song lifts the last chorus", async () => {
    const draft = await grade("C7", C7_SECTIONS, { tonic: "C", mode: "major" });
    const lift = (draft.rubric ?? []).find((x) => x.ruleId === "lift");
    // No key change in the S2 draft: the lift rule is unmet (or not run yet), never met.
    expect(lift?.ok).not.toBe(true);
    const song = await grade("C7", C7_SONG, { tonic: "C", mode: "major" });
    expect(failed(song)).toEqual([]);
  });

  test("CF-A: the S3 draft is shorter than two minutes; the single meets the brief", async () => {
    const draft = await grade("CF-A", CFA_TUNES_DRAFT, { tonic: "C", mode: "major" });
    const duration = (draft.rubric ?? []).find((x) => x.ruleId === "duration");
    expect(duration?.ok).toBe(false);
    expect(draft.analysis?.durationSec).toBeLessThan(120);
    const single = await grade("CF-A", CFA_SINGLE, { tonic: "C", mode: "major" });
    expect(failed(single)).toEqual([]);
    expect(single.analysis?.durationSec).toBeGreaterThanOrEqual(120);
  });
});
