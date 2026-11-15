// JC4 Reharmonize a Standard: the brief tests on Georgia on My Mind's own pieces (./pieces.ts). They read the song's
// answer key, so they live here and join the brief's tests in content CI only (content/validate/song-tests.ts): no
// module the app loads may import a song's answer key (on the L8 ladder Georgia is a standard to transcribe, and
// app/src/album/e2e/w6-studio.pw.ts pins that no repertoire song.ts reaches that page).
import type { TestCase } from "@oak/content-kit";
import { JC4_PIECES } from "./pieces.ts";

export const JC4_BRIEF_TESTS: TestCase[] = [
  {
    name: "the song as the host sets it: no device of the learner's",
    response: { code: JC4_PIECES.plain },
    expect: "fail",
    feedback: ["rubric.unmet"],
  },
  {
    name: "minimal: a tritone sub, a backdoor and a passing diminished chord where the tune agrees",
    response: { code: JC4_PIECES.three },
    expect: "pass",
  },
  {
    name: "the same devices on the piano, on every beat",
    response: { code: JC4_PIECES.piano },
    expect: "pass",
  },
  {
    name: "beyond the brief: slower, with the ride and the hi-hat",
    response: { code: JC4_PIECES.ride },
    expect: "pass",
  },
  { name: "the same devices over a bass in two", response: { code: JC4_PIECES.twoFeel }, expect: "pass" },
  {
    name: "two devices of the learner's own: the chart's own ii–V in bar 2 is the song's, not a third",
    response: { code: JC4_PIECES.twoOwn },
    expect: "fail",
    feedback: ["rubric.unmet"],
  },
  {
    name: "the right devices written, the chords at gain 0: not heard",
    response: { code: JC4_PIECES.muted },
    expect: "fail",
    feedback: ["rubric.unmet"],
  },
  {
    name: "the devices in, the tune's first note moved a half step",
    response: { code: JC4_PIECES.tuneMoved },
    expect: "fail",
    feedback: ["rubric.unmet"],
  },
];
