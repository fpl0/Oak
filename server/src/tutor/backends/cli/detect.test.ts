import { afterEach, describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { createDetector, type ExecFn, type ExecResult, execWith } from "./detect.ts";
import { childEnv } from "./process.ts";
import { FAKE_CLAUDE, type Harness, startHarness } from "./testing/harness.ts";

const ok = (stdout: string, exitCode = 0): ExecResult => ({
  exitCode,
  stdout,
  timedOut: false,
  missing: false,
});
const LOGGED_IN = ok('{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty"}\n');

function detector(answers: { version?: ExecResult | Error; auth?: ExecResult | Error }, now = { t: 0 }) {
  const calls: string[][] = [];
  const exec: ExecFn = async (argv) => {
    calls.push(argv);
    const a =
      argv[1] === "--version"
        ? (answers.version ?? ok("2.1.322 (Claude Code)\n"))
        : (answers.auth ?? LOGGED_IN);
    if (a instanceof Error) throw a;
    return a;
  };
  const d = createDetector({
    claudePath: "claude",
    cwd: async () => "/tmp",
    env: () => ({}),
    exec,
    now: () => now.t,
  });
  return { d, calls, now };
}

describe("available()", () => {
  test("installed and logged in", async () => {
    const { d, calls } = detector({});
    expect(await d.available()).toEqual({ ok: true });
    expect(calls).toEqual([
      ["claude", "--version"],
      ["claude", "auth", "status"],
    ]);
    expect(await d.status()).toEqual({ ok: true, version: "2.1.322 (Claude Code)", authMethod: "claude.ai" });
  });

  test.each([
    [
      "no binary",
      { version: { exitCode: null, stdout: "", timedOut: false, missing: true } },
      "not_installed",
    ],
    ["--version fails", { version: ok("", 127) }, "not_installed"],
    [
      "--version hangs",
      { version: { exitCode: null, stdout: "", timedOut: true, missing: false } },
      "unreachable",
    ],
    ["logged out", { auth: ok('{"loggedIn":false}\n', 1) }, "not_logged_in"],
    ["loggedIn is not literally true", { auth: ok('{"loggedIn":"yes"}') }, "not_logged_in"],
    ["auth prints no JSON", { auth: ok("Not logged in\n", 1) }, "not_logged_in"],
    ["auth prints broken JSON", { auth: ok("{loggedIn") }, "not_logged_in"],
    ["auth hangs", { auth: { exitCode: null, stdout: "", timedOut: true, missing: false } }, "unreachable"],
    ["exec throws", { version: new Error("EACCES") }, "unreachable"],
  ] as const)("%s -> %s, and it never throws", async (_name, answers, reason) => {
    const { d } = detector(answers);
    expect(await d.available()).toEqual({ ok: false, reason });
  });

  test("the JSON decides, not the exit code; a banner before it is tolerated", async () => {
    const { d } = detector({ auth: ok('Checking...\n{"loggedIn":true,"authMethod":"claude.ai"}\n', 1) });
    expect(await d.available()).toEqual({ ok: true });
  });

  test("cached for a minute, positive or negative; concurrent callers share one probe", async () => {
    const { d, calls, now } = detector({});
    await Promise.all([d.available(), d.available(), d.status()]);
    expect(calls).toHaveLength(2);
    now.t = 59_999;
    await d.available();
    expect(calls).toHaveLength(2);
    now.t = 60_000;
    await d.available();
    expect(calls).toHaveLength(4);

    const off = detector({ auth: ok('{"loggedIn":false}') });
    await off.d.available();
    await off.d.available();
    expect(off.calls).toHaveLength(2);
  });

  test("reset() forgets the answer (after a login, or an auth failure in a turn)", async () => {
    const { d, calls } = detector({});
    await d.available();
    d.reset();
    await d.available();
    expect(calls).toHaveLength(4);
  });
});

describe("against a process", () => {
  let h: Harness;
  afterEach(() => h?.stop());
  const real = (timeoutMs = 4_000) =>
    createDetector({
      claudePath: FAKE_CLAUDE,
      cwd: async () => tmpdir(),
      env: () => childEnv(h.env),
      exec: execWith(),
      timeoutMs,
    });

  test("logged in; the probes run without the server's API key", async () => {
    h = startHarness({ runs: [] });
    expect(await real().status()).toEqual({
      ok: true,
      version: "2.1.322 (Claude Code)",
      authMethod: "claude.ai",
    });
    expect(h.probes().map((p) => p.argv)).toEqual([["--version"], ["auth", "status"]]);
    expect(h.probes().flatMap((p) => p.credentials)).toEqual([]);
  });

  test("logged out", async () => {
    h = startHarness({ runs: [], auth: { json: { loggedIn: false }, exitCode: 1 } });
    expect(await real().available()).toEqual({ ok: false, reason: "not_logged_in" });
  });

  test("a CLI that hangs is given up on after the short timeout", async () => {
    h = startHarness({ runs: [], auth: { hang: true } });
    const t0 = performance.now();
    expect(await real(150).available()).toEqual({ ok: false, reason: "unreachable" });
    expect(performance.now() - t0).toBeLessThan(3_000);
  });

  test("no such binary", async () => {
    const d = createDetector({
      claudePath: "/nonexistent/bin/claude",
      cwd: async () => tmpdir(),
      env: () => ({}),
    });
    expect(await d.available()).toEqual({ ok: false, reason: "not_installed" });
  });
});
