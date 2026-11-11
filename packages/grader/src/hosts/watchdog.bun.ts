// Watchdog for the subprocess backend, on its own thread inside the child (a realm stuck in
// `while(true){}` or in a huge allocation cannot run anything itself):
//  - orphans: a child never notices that its stdin closed, so if the server dies (crash, SIGKILL, a test
//    runner timing out) it would spin forever. It kills the whole process as soon as the parent pid
//    changes (an orphan is re-parented to launchd/init). Proven in spike S1 (467 ms).
//  - memory: the host's wall-clock limit alone lets an allocation loop take gigabytes first (S1 measured
//    ~11 GB/s). Past `--oak-max-rss-mb` (resident set of the whole process) it says so on stderr, which
//    the host keeps for the crash report, and kills the process; the host answers the request with
//    `crashed` and the spare serves the next one.
import { writeSync } from "node:fs";
import { maxRssBytes } from "./limits.ts";

const bornUnder = process.ppid;
// A worker's process.argv is its own; the child's entry posts the limit it was started with.
let limit: number | null = maxRssBytes(process.argv);
(
  globalThis as unknown as { addEventListener(type: "message", fn: (ev: MessageEvent) => void): void }
).addEventListener("message", (ev: MessageEvent) => {
  const v = (ev.data as { maxRssBytes?: unknown } | null)?.maxRssBytes;
  if (typeof v === "number" && v > 0) limit = v;
});
let ticks = 0;
setInterval(() => {
  if (limit !== null && process.memoryUsage.rss() > limit) {
    // Synchronous: the kill follows at once and an async write might never reach the pipe.
    writeSync(2, `oak: the grader went over its memory limit (${Math.round(limit / 1024 / 1024)} MB)\n`);
    process.kill(process.pid, "SIGKILL");
  }
  if (++ticks % 10 === 0 && process.ppid !== bornUnder) process.kill(process.pid, "SIGKILL");
}, 50);
