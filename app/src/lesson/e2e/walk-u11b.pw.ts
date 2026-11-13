// U11 Pentatonic & Blues, lessons 5–8 in the real app: every step of every lesson from the dev seed just before it
// (w5walk.ts), each graded step given one of the lesson's own pinned mistakes first, its feedback read (clean, the
// pinned codes, not the answer), then the right answer; the lesson ends complete on the server. One test per
// lesson, each walk under a minute.
// U11.L05 is walked at the end of walk-u11a.pw.ts (it follows U11.L04 there, chain.ts).
import { walkSuiteW5 } from "./w5walk.ts";

walkSuiteW5(["U11.L06", "U11.L07", "U11.L08"]);
