// The learner's own draft played back by the capstone resume card and the recap card (review:journey): linted as
// Studio lints it, so a part named as the learner likes still plays; the content profile refused it.
import { describe, expect, test } from "bun:test";
import { lintOak } from "@oak/grader";
import { toolbox } from "../../../content/toolbox.ts";
import { playbackLint } from "./playback.ts";

const LOOP = '"<[0,2,4] [4,6,8] [5,7,9] [3,5,7] [0,2,4] [4,6,8] [4,6,8] [0,2,4]>"';
const DRAFT = `setcpm(96/4)\n\nchords: n(${LOOP}).scale("C3:major").s("piano")\nmelody: n("<0 ~ ~ ~ ~ ~ ~ ~>").scale("C4:major").s("piano")`;

describe("playback of the learner's own code", () => {
  test("Studio's profile, the version's meter and key", () => {
    const ctx = playbackLint({ meter: "3/4", key: { tonic: "G", mode: "major" } });
    expect(ctx).toMatchObject({ profile: "studio", meter: "3/4", key: { tonic: "G", mode: "major" } });
    expect(playbackLint({})).toMatchObject({ meter: "4/4", key: null });
  });

  test("a C2 draft with a `melody:` part plays (the content profile refused it)", () => {
    const content = lintOak(DRAFT, { ...playbackLint({}), profile: "content" }, toolbox);
    expect(content.diagnostics.some((d) => d.severity === "error" && d.id === "code.label-unknown")).toBe(
      true,
    );
    const r = lintOak(DRAFT, playbackLint({}), toolbox);
    expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });
});
