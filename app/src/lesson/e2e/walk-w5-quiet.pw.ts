// Wave 5 lessons with sung steps in Quiet mode (wave5.md §10 item 9; contracts §7.6, §8): U10.L01 (the natural
// minor sung do-based: do re me fa sol le te), U10.L03 (leaning on me, le and te over a minor loop) and U11.L05 (the
// twelve-bar roots) walked with each sung step as its fallback — nothing waits for a voice, nothing is recorded,
// nothing reads as a failure — and every other step as usual; each lesson ends complete on the server.
import { walkSuiteW5 } from "./w5walk.ts";

walkSuiteW5(["U10.L01", "U10.L03", "U11.L05"], { quiet: true });
