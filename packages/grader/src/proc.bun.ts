// Subprocess entry: NDJSON requests on stdin, responses on stdout. Its first act is to start the
// watchdog (poll process.ppid every 500 ms, SIGKILL self when re-parented), so a child stuck in a loop
// never outlives a dead parent (spike S1).
export {};

throw new Error("@oak/grader: proc.bun.ts is not implemented yet");
