// U17 Modulation in the real app: every step of each lesson from the dev seed just before it (w6walk.ts), each graded
// step given one of the lesson's own pinned mistakes first, its feedback read (clean, the pinned codes, not the
// answer), then the right answer; the lesson ends complete on the server. One test per lesson, each walk under a
// minute.
import { walkSuiteW6 } from "./w6walk.ts";

walkSuiteW6(["U17.L01", "U17.L02", "U17.L03", "U17.L04"]);
