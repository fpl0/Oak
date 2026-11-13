// U08 Bass Lines in the real app: every step of every lesson from the dev seed just before it
// (w5walk.ts), each graded step given one of the lesson's own pinned mistakes first, its feedback read (clean, the
// pinned codes, not the answer), then the right answer; the lesson ends complete on the server. One test per
// lesson, each walk under a minute.
import { walkSuiteW5 } from "./w5walk.ts";

walkSuiteW5(["U08.L01", "U08.L02", "U08.L03", "U08.L04", "U08.L05"]);
