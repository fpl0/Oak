// The A1 side lessons (waves and harmonics, filters, envelopes, space) in the real app, each from the side-lesson
// seeds (w5walk.ts: the earlier side lessons the seed lacks are walked first, untimed), each graded step given one
// of the lesson's own pinned mistakes first, its feedback read (clean, the pinned codes, not the answer), then the
// right answer; the lesson ends complete on the server. One test per lesson, each walk under a minute.
import { walkSuiteW5 } from "./w5walk.ts";

walkSuiteW5(["A1.L01", "A1.L02", "A1.L03", "A1.L04"]);
