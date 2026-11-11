// SPIKE S1 — orphan watchdog for the subprocess backend.
// A child stuck in `while(true){}` never notices that its stdin closed, so if the server dies (crash, SIGKILL,
// `bun test` timing out) the child would spin at 100% CPU forever. This runs on its OWN thread inside the child
// and kills the whole process as soon as the parent pid changes (orphans are re-parented to launchd/init).
const bornUnder = process.ppid;
setInterval(() => {
  if (process.ppid !== bornUnder) process.kill(process.pid, "SIGKILL");
}, 500);

export {};
