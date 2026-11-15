// The Wave 7 dev seeds are honest about the track capstones (wave7.md §6): every track capstone the "whole course
// complete" point releases — JC1–JC4, RC1, RC2, AC1 (both versions), AC2 — is graded here against its own brief
// with the real grader, in capstone mode, the way the capstone workspace grades it (the song's melody as
// `GradeContext.songMelody`, AC1's other version as `otherVersion`), and passes every required line. The one line
// that cannot run is JC3's `original` while I Got Rhythm has no answer key (content/repertoire: no 1930 source was
// opened); once the key exists it must pass too. A seed that released a piece failing its brief would show a
// learner a "released" track the course itself refuses — the corrections pass found three (JC3's iii–VI in the A,
// JC4 with one device, AC1 with no sound shaped).
import { beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import type { CapstoneDef, GradeResult, KeySpec, SessionId } from "@oak/content-kit";
import * as grader from "@oak/grader";
import { toolbox } from "../../content/toolbox.ts";
import { unlockedFor } from "../../content/validate/harness.ts";
import { loadContent } from "./content/loader.ts";
import type { ContentSource } from "./content/types.ts";
import { CONTENT_DIR } from "./testing/course.ts";
import { harness } from "./testing/harness.ts";
import { songMelodyOf, songOfCapstone } from "./tutor-adapters/review-facts-w7.ts";

setDefaultTimeout(600_000);

let real: ContentSource;
beforeAll(async () => {
  await grader.initRealm({ toolbox: [...toolbox], lockdown: false });
  real = await loadContent({ contentDir: CONTENT_DIR });
});

const TRACK_CAPSTONES = ["JC1", "JC2", "JC3", "JC4", "RC1", "RC2", "AC1", "AC2"] as const;

test("every track capstone released by “whole course complete” passes its brief's required lines", async () => {
  const h = await harness({ dev: true, content: real, now: "2026-11-15T12:00:00.000Z" });
  try {
    const seeded = await h.req("POST", "/api/dev/seed", { point: "whole course complete", practice: false });
    expect(seeded.status).toBe(200);
    const repos = h.server.deps.repos;
    const failing: Record<string, string[]> = {};
    for (const id of TRACK_CAPSTONES) {
      const def = real.capstones.find((c) => c.id === id) as CapstoneDef;
      const track = repos.album.tracks().find((t) => t.capstoneId === id);
      expect({ id, side: track?.side }).toEqual({ id, side: "B" });
      const versions = [1, 2]
        .map((n) => repos.album.version(track?.id as string, n))
        .filter((v) => v !== null && v !== undefined)
        .map((v) => repos.sketches.version(v.sketchId, v.sketchVersion))
        .filter((v) => v !== null);
      // AC1 releases its two versions as album versions 1 and 2; every other capstone one.
      expect({ id, versions: versions.length }).toEqual({ id, versions: id === "AC1" ? 2 : 1 });
      const sketch = repos.sketches.get(repos.album.version(track?.id as string, 1)?.sketchId as string);
      const song = songOfCapstone(def, sketch?.tags ?? [], real.songs);
      // JC3's model (I Got Rhythm) is the capstone's only song even without a key; JC4 and AC1 are on a written one.
      if (id === "JC4" || id === "AC1")
        expect({ id, song: song?.id ?? null }).not.toEqual({ id, song: null });
      const songMelody = song
        ? await songMelodyOf(song, (c, o) => grader.evaluateForGrading(c, o))
        : undefined;
      const last = def.sessionDefs.at(-1)?.id as SessionId;
      for (const [i, v] of versions.entries()) {
        const other = versions[1 - i];
        const r: GradeResult = await grader.gradeExercise({
          exercise: def.brief as never,
          response: { code: v.code },
          ctx: {
            exerciseGlobalId: `${id}/brief`,
            mode: "capstone",
            key: (v.key ?? def.key ?? { tonic: "C", mode: "major" }) as KeySpec,
            meter: "4/4",
            bpm: v.bpm,
            params: {},
            attemptNo: 1,
            firstAttempt: true,
            rung: 0,
            tutorHints: 0,
            extraReplays: 0,
            ...(songMelody ? { songMelody } : {}),
            ...(id === "AC1" && other ? { otherVersion: { id: i === 0 ? "b" : "a", code: other.code } } : {}),
            lint: {
              profile: "graded",
              unlocked: unlockedFor(last),
              allowPreview: false,
              meter: "4/4",
              key: null,
            },
          } as never,
        });
        const bad = (r.rubric ?? []).filter((x) => x.required && !x.ok).map((x) => x.ruleId);
        if (bad.length > 0) failing[`${id} v${i + 1}`] = bad;
      }
    }
    // JC3 reads I Got Rhythm's head once its key exists, and the brief's stand-in (J4.L04's head) until then
    // (W7 gate, decision 80): every released piece passes every required line either way.
    expect(failing).toEqual({});
  } finally {
    await h.close();
  }
});
