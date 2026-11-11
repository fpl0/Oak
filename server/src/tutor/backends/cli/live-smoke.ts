// A LIVE check of the claude-cli backend: one real tutor turn through the installed `claude`,
// on your own Claude login. It uses subscription quota, so it does nothing unless you pass --yes.
//
//   bun server/src/tutor/backends/cli/live-smoke.ts --yes
//
// Not part of `bun test`, and never run by it. The lesson, learner state and stores are the
// tutor's test fakes (the fixture lesson, rung 0); the backend, the MCP endpoint, the tool
// executors and the redaction are the real ones. It prints the events as they arrive and then
// checks the things only a live run can show: that the CLI lists exactly Oak's tools, that
// nothing withheld at rung 0 reached it, and that the turn ended with `done`.
export {};

if (!process.argv.includes("--yes")) {
  console.error(
    "This makes one real request through the Claude CLI on your own login.\n" +
      "Nothing was started. Run it again with --yes to go ahead.",
  );
  process.exit(2);
}

// Imported only past the guard, so that a run without --yes loads nothing at all.
const { mkdtempSync, rmSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const { join } = await import("node:path");
const { Hono } = await import("hono");
const { prepareTurn } = await import("../../prepare.ts");
const { findLeaks, leakMarkers } = await import("../../redaction.ts");
const { runTurn } = await import("../../run.ts");
const { makePorts } = await import("../../testing/fakes.ts");
const { GRADE, LEARNER_CODE, LESSON_ID, STEP, STEP_ID } = await import("../../testing/fixtures.ts");
const { createClaudeCliBackend } = await import("./index.ts");
const { createMcpEndpoint, TurnRegistry } = await import("./mcp.ts");

const MOUNT = "/mcp/tutor";
const results: string[] = [];
const registry = new TurnRegistry((r) => results.push(r.content));
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: new Hono().route(MOUNT, createMcpEndpoint({ registry }).app).fetch,
});
// A throw-away directory, so the smoke run leaves no session behind in ~/.oak.
const cwd = mkdtempSync(join(tmpdir(), "oak-cli-smoke-"));
const backend = createClaudeCliBackend({
  registry,
  mcpUrl: `http://127.0.0.1:${server.port}${MOUNT}`,
  cwd,
  log: (line) => console.error(`[log] ${line}`),
});

let failed = false;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) failed = true;
};

try {
  const available = await backend.available();
  console.log("available:", available, await backend.detector.status());
  if (!available.ok) process.exit(1);

  const ports = makePorts();
  const prep = await prepareTurn(
    {
      thread: { subjectKind: "lesson", subjectId: LESSON_ID },
      kind: "chat",
      userText: "My arpeggio sounds unfinished and the checker says something is off. What's wrong?",
      learnerCode: LEARNER_CODE,
      graderResult: GRADE,
      stepId: STEP_ID,
    },
    ports,
  );
  const types: string[] = [];
  let text = "";
  const result = await runTurn(
    prep,
    backend,
    (e) => {
      types.push(e.type);
      if (e.type === "text") text += e.data.delta;
      else console.log(e.type, JSON.stringify(e.data).slice(0, 200));
    },
    AbortSignal.timeout(120_000),
    ports,
  );
  console.log(`\n--- reply ---\n${text}\n-------------\n`);

  const markers = leakMarkers(STEP, GRADE);
  check("the turn completed", result.ok && types.at(-1) === "done");
  check("the model used Oak's tools", results.length > 0);
  check(
    "no withheld text in any tool result (rung 0)",
    findLeaks(results.join("\n"), markers, 0).length === 0,
  );
  check("no withheld text in the prompt (rung 0)", findLeaks(prep.user.oakContext, markers, 0).length === 0);
  check(
    "usage is marked as included in the plan",
    result.usage.includedInPlan && result.usage.costUsd === null,
  );
  console.log("usage:", result.usage);
} finally {
  server.stop(true);
  rmSync(cwd, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
