// U10 Minor, lessons 6–9 in the real app: every step of every lesson from the dev seed just before it
// (w5walk.ts), each graded step given one of the lesson's own pinned mistakes first, its feedback read (clean, the
// pinned codes, not the answer), then the right answer; the lesson ends complete on the server. One test per
// lesson, each walk under a minute.
import { walkSuiteW5 } from "./w5walk.ts";

walkSuiteW5(["U10.L06", "U10.L07", "U10.L08", "U10.L09"]);
