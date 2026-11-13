// U11 Pentatonic & Blues, lessons 1–4 in the real app: every step of every lesson from the dev seed just before it
// (w5walk.ts), each graded step given one of the lesson's own pinned mistakes first, its feedback read (clean, the
// pinned codes, not the answer), then the right answer; the lesson ends complete on the server. One test per
// lesson, each walk under a minute.
import { walkSuiteW5 } from "./w5walk.ts";

walkSuiteW5(["U11.L01", "U11.L02", "U11.L03", "U11.L04"]);
