import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  E2E_SUFFIX,
  frontEndCommand,
  oakStack,
  parseShift,
  REPO_ROOT,
  shifted,
} from "../e2e/support/stack.ts";
import {
  autoJobs,
  type BudgetFile,
  balance,
  checkBudgets,
  type Durations,
  type Listed,
  merge,
  outcomeOf,
  type Project,
  parseArgs,
  plan,
  projectsFor,
  readBudgets,
  readReport,
  rerunPlan,
  SERIAL_RE,
  settle,
  tally,
} from "./e2e-parallel.ts";

const project = (
  name: string,
  files: Record<string, number>,
  servers: string[],
  testDir: string,
): Project => ({
  name,
  files: new Map(Object.entries(files)),
  servers,
  testDir,
});

const PROJECTS = new Map<string, Project>([
  ["lesson", project("lesson", { "app/src/lesson/e2e/a.pw.ts": 2 }, ["oak-api:8801"], "app/src/lesson/e2e")],
  ["drills", project("drills", { "app/src/drills/e2e/d.pw.ts": 1 }, ["oak-api:8803"], "app/src/drills/e2e")],
  ["session-seeds", project("session-seeds", {}, ["oak-api:8835"], "app/src/session/seeds/e2e")],
  ["session", project("session", {}, ["oak-api:8805"], "app/src/session/e2e")],
  ["journey", project("journey", {}, ["oak-api:8812"], "e2e/journey")],
  ["review", project("review", {}, ["oak-api:8821"], "e2e/review")],
  ["map", project("map", {}, ["oak-api:8807"], "app/src/map/e2e")],
  ["ui-review", project("ui-review", {}, ["oak-api:8822"], "app/src/ui/review/e2e")],
]);

describe("--since", () => {
  test("a spec or helper in a project's own folder selects that project", () => {
    const r = projectsFor(["app/src/session/seeds/e2e/support.ts"], PROJECTS);
    expect(r.selected).toEqual(new Set(["session-seeds"]));
  });
  test("an area's source selects the projects that cover it", () => {
    const r = projectsFor(["app/src/drills/DrillRunner.tsx"], PROJECTS);
    expect(r.selected).toEqual(new Set(["drills", "session-seeds", "journey", "review"]));
  });
  test("documentation selects nothing", () => {
    expect(projectsFor(["docs/design/wave5.md"], PROJECTS).selected).toEqual(new Set());
  });
  test("a shared path selects everything", () => {
    expect(projectsFor(["server/src/app.ts"], PROJECTS).selected).toBe("*");
    expect(projectsFor(["e2e/support/stack.ts"], PROJECTS).selected).toBe("*");
    expect(projectsFor(["app/src/ui/kit/Button.tsx"], PROJECTS).selected).toBe("*");
  });
});

describe("shards", () => {
  test("files are balanced longest first", () => {
    const s = balance(
      [
        ["a", 300],
        ["b", 200],
        ["c", 200],
        ["d", 100],
      ],
      2,
    );
    expect(s.map((x) => x.seconds).sort()).toEqual([400, 400]);
  });
  test("a long project alone on its stack is cut into shards on shifted ports; shared stacks are not", () => {
    const files: Record<string, number> = {};
    const d: Durations = { generated: "", projects: {}, files: {} };
    for (let i = 0; i < 6; i++) {
      files[`e2e/journey/j${i}.pw.ts`] = 1;
      d.files[`journey › e2e/journey/j${i}.pw.ts`] = 300;
    }
    const units = plan(
      [
        project("journey", files, ["oak-api:8812"], "e2e/journey"),
        project("platform", { "e2e/p.pw.ts": 1 }, ["platform-api:8787"], "e2e"),
        project("app", { "app/e2e/s.pw.ts": 1 }, ["platform-api:8787"], "app/e2e"),
      ],
      d,
      300,
    );
    const journey = units.filter((u) => u.projects.includes("journey"));
    expect(journey.length).toBe(5); // 30 minutes / 7 per chain
    expect(new Set(journey.map((u) => u.shift)).size).toBe(journey.length);
    expect(journey.every((u) => u.shift >= 300 && u.shift % 100 === 0)).toBe(true);
    expect(journey.flatMap((u) => u.files).sort()).toEqual(Object.keys(files).sort());
    const platform = units.filter((u) => u.projects.includes("platform"));
    expect(platform).toHaveLength(1);
    expect(platform[0]?.projects).toEqual(["platform", "app"]);
  });
  test("quiet files run apart from the loud rest of their project", () => {
    const units = plan(
      [
        project(
          "transcribe",
          { "app/src/transcribe/e2e/ab-drift.pw.ts": 1, "app/src/transcribe/e2e/ladder.pw.ts": 5 },
          ["oak-api:8813"],
          "app/src/transcribe/e2e",
        ),
      ],
      { generated: "", projects: {}, files: {} },
      0,
    );
    expect(units.map((u) => [u.name, u.quiet, u.files])).toEqual([
      ["transcribe.quiet", true, ["app/src/transcribe/e2e/ab-drift.pw.ts"]],
      ["transcribe.loud", false, ["app/src/transcribe/e2e/ladder.pw.ts"]],
    ]);
  });
});

describe("arguments", () => {
  test("flags and the pass-through", () => {
    const a = parseArgs([
      "--jobs",
      "3",
      "--project=lesson",
      "--since",
      "HEAD~1",
      "--shift=300",
      "--",
      "--grep",
      "x",
    ]);
    expect(a).toMatchObject({ jobs: 3, since: "HEAD~1", shift: 300, config: null, rest: ["--grep", "x"] });
    expect(parseArgs(["--config", "test-results/x/playwright.config.ts"]).config).toBe(
      "test-results/x/playwright.config.ts",
    );
    expect(a.only).toEqual(new Set(["lesson"]));
  });
  test("a shift must leave room for the shards", () => {
    expect(() => parseArgs(["--shift", "4999"])).toThrow();
    expect(() => parseArgs(["--shift", "305"])).toThrow();
  });
});

describe("outcomes", () => {
  const t = (status: string, results: { status: string; annotations?: { type: string }[] }[]) => ({
    projectName: "p",
    status,
    results: results.map((r) => ({ ...r, duration: 1000 })),
  });
  test("a skip the spec asked for is skipped; Playwright's other 'skipped' and a missing result did not run", () => {
    expect(outcomeOf(t("expected", [{ status: "passed" }]))).toBe("passed");
    expect(outcomeOf(t("unexpected", [{ status: "failed" }]))).toBe("failed");
    expect(outcomeOf(t("skipped", [{ status: "skipped", annotations: [{ type: "skip" }] }]))).toBe("skipped");
    expect(outcomeOf(t("skipped", [{ status: "skipped", annotations: [{ type: "fixme" }] }]))).toBe(
      "skipped",
    );
    // The rest of a serial file after a failure: reported "skipped" with no skip asked for.
    expect(outcomeOf(t("skipped", [{ status: "skipped" }]))).toBe("notRun");
    expect(outcomeOf(t("unexpected", [{ status: "interrupted" }]))).toBe("notRun");
    expect(outcomeOf(t("skipped", []))).toBe("notRun");
  });

  const L = (project: string, file: string, title: string): Listed => ({
    key: `${project} › ${file} › ${title}`,
    project,
    file,
  });
  const a = L("p", "a.pw.ts", "one");
  const b = L("p", "a.pw.ts", "two");
  const c = L("q", "c.pw.ts", "three");
  const report = (o: Record<string, string>, exit = 1, errors: string[] = []) => {
    const r = readReport({ errors: errors.map((message) => ({ message })) }, exit);
    for (const [k, v] of Object.entries(o)) r.outcomes.set(k, v as never);
    return r;
  };

  test("a listed test the report does not name did not run; a server that never started names every test", () => {
    const s = settle(
      [a, b, c],
      report({}, 1, ["Error: Process from config.webServer was not able to start."]),
    );
    expect([...s.outcomes.values()]).toEqual(["notRun", "notRun", "notRun"]);
    expect(s.errors).toHaveLength(1);
    expect(settle([a], report({ [a.key]: "passed" }, 0)).errors).toEqual([]);
    // A non-zero exit with everything passed is still a failure.
    expect(settle([a], report({ [a.key]: "passed" }, 1)).errors).toHaveLength(1);
  });

  test("load-sensitive only when it failed beside others and passed alone; a test failing alone never is", () => {
    const first = settle([a, b, c], report({ [a.key]: "failed", [b.key]: "failed", [c.key]: "passed" }));
    const rerun = new Set([a.key, b.key]);
    const m = merge(first, settle([a, b], report({ [a.key]: "passed", [b.key]: "failed" })), rerun);
    expect(m.loadSensitive).toEqual([a.key]);
    expect(m.outcomes.get(b.key)).toBe("failed");
    // Alone, its server could not start: not load-sensitive, and not passed.
    const m2 = merge(first, settle([a, b], report({}, 1, ["webServer"])), rerun);
    expect(m2.loadSensitive).toEqual([]);
    expect(m2.outcomes.get(a.key)).toBe("notRun");
    expect(m2.errors).toEqual(["webServer"]);
  });

  test("only the tests run again are decided by the alone run; the others keep their first outcome", () => {
    const first = settle([a, b, c], report({ [a.key]: "failed", [b.key]: "passed", [c.key]: "passed" }));
    // The alone run of a.pw.ts:<line of a> reports only a.
    const m = merge(first, settle([a], report({ [a.key]: "passed" }, 0)), new Set([a.key]));
    expect(m.loadSensitive).toEqual([a.key]);
    expect(m.outcomes.get(b.key)).toBe("passed");
    expect(m.outcomes.get(c.key)).toBe("passed");
  });

  test("per-project counts add up to the listing", () => {
    const rows = tally(
      new Map([
        [a.key, "passed"],
        [b.key, "notRun"],
        [c.key, "skipped"],
      ] as const),
    );
    expect(rows.get("p")).toEqual({ passed: 1, failed: 0, flaky: 0, skipped: 0, notRun: 1 });
    expect(rows.get("q")).toEqual({ passed: 0, failed: 0, flaky: 0, skipped: 1, notRun: 0 });
  });
});

// e2e/support/stack.ts (bunfig ignores e2e/**, so its logic is tested here)

test("OAK_E2E_SHIFT: a multiple of 10 below 5000", () => {
  expect(parseShift(undefined)).toBe(0);
  expect(parseShift("")).toBe(0);
  expect(parseShift("300")).toBe(300);
  expect(() => parseShift("-100")).toThrow();
  expect(() => parseShift("305")).toThrow();
  expect(() => parseShift("5000")).toThrow();
  expect(() => parseShift("abc")).toThrow();
});

test("oakStack takes the standard ports and moves them by this process's shift", () => {
  const s = oakStack({ vitePort: 5201, apiPort: 8801, dataDirName: "lesson" });
  expect(s.baseURL).toBe(`http://127.0.0.1:${shifted(5201)}`);
  expect(s.apiURL).toBe(`http://127.0.0.1:${shifted(8801)}`);
  expect(s.dataDir.endsWith(`test-results/stacks/lesson${E2E_SUFFIX}`)).toBe(true);
  expect(s.webServer.map((w) => w.name)).toEqual([`oak-api:${shifted(8801)}`, `oak-vite:${shifted(5201)}`]);
  expect(s.webServer[1]?.command).toContain("e2e/support/vite.e2e.config.ts");
});

describe("the alone re-run", () => {
  const T = (file: string, title: string, line: number): Listed => ({
    key: `p › ${file} › ${title}`,
    project: "p",
    file,
    line,
  });
  const x1 = T("x.pw.ts", "one", 10);
  const x2 = T("x.pw.ts", "two", 20);
  const x3 = T("x.pw.ts", "three", 30);
  const loopA = T("y.pw.ts", "cell paper", 5);
  const loopB = T("y.pw.ts", "cell bark", 5);
  const s1 = T("s.pw.ts", "first", 3);
  const s2 = T("s.pw.ts", "second", 9);
  const tests = [x1, x2, x3, loopA, loopB, s1, s2];
  const serial = (f: string) => f === "s.pw.ts";

  test("a file whose tests stand alone: exactly the failed and not-run tests, by line", () => {
    const r = rerunPlan([x2.key, x3.key], tests, serial);
    expect(r.filters).toHaveLength(2);
    expect(r.filters[0]?.endsWith("x\\.pw\\.ts$:20")).toBe(true);
    expect(r.filters[1]?.endsWith("x\\.pw\\.ts$:30")).toBe(true);
    expect(r.keys).toEqual(new Set([x2.key, x3.key]));
  });
  test("tests made in a loop share a line: all of them run again and are decided by it", () => {
    const r = rerunPlan([loopB.key], tests, serial);
    expect(r.filters).toHaveLength(1);
    expect(r.keys).toEqual(new Set([loopA.key, loopB.key]));
  });
  test("a serial file runs again whole", () => {
    const r = rerunPlan([s2.key], tests, serial);
    expect(r.filters).toHaveLength(1);
    expect(r.filters[0]?.endsWith("s\\.pw\\.ts$")).toBe(true);
    expect(r.keys).toEqual(new Set([s1.key, s2.key]));
  });
  test("a test with no known line (not in the listing) runs its whole file", () => {
    const r = rerunPlan(["p › z.pw.ts › ghost"], tests, serial);
    expect(r.filters).toHaveLength(1);
    expect(r.keys).toEqual(new Set(["p › z.pw.ts › ghost"]));
  });
  test("serial files are recognised by their source", () => {
    expect(SERIAL_RE.test('test.describe.configure({ mode: "serial" });')).toBe(true);
    expect(SERIAL_RE.test("test.describe.serial('x', () => {})")).toBe(true);
    expect(SERIAL_RE.test('test.describe.configure({ mode: "parallel" });')).toBe(false);
    expect(SERIAL_RE.test("test('serial numbers', () => {})")).toBe(false);
  });
});

describe("budgets", () => {
  const file: BudgetFile = {
    totalMinutes: 20,
    tolerance: 0.15,
    budgets: [
      { name: "lesson", projects: ["lesson"], minutes: 10 },
      { name: "days", projects: ["drills", "map"], minutes: 6 },
    ],
  };
  const verdicts = (r: ReturnType<typeof checkBudgets>) =>
    Object.fromEntries([...r.rows, ...(r.total ? [r.total] : [])].map((x) => [x.name, x.verdict]));

  test("under, within the 15 % tolerance, and over it", () => {
    expect(verdicts(checkBudgets(file, { lesson: 9.9 }, new Set(["lesson"]), false))).toEqual({
      lesson: "under",
    });
    const within = checkBudgets(file, { lesson: 11.4 }, new Set(["lesson"]), false);
    expect(verdicts(within)).toEqual({ lesson: "within tolerance" });
    expect(within.failed).toBe(false);
    const over = checkBudgets(file, { lesson: 11.6 }, new Set(["lesson"]), false);
    expect(verdicts(over)).toEqual({ lesson: "OVER" });
    expect(over.failed).toBe(true);
  });
  test("a group is checked on the sum of its projects, and only when all of them ran", () => {
    const all = checkBudgets(file, { drills: 4, map: 2.8 }, new Set(["drills", "map"]), false);
    expect(all.rows[0]).toMatchObject({ name: "days", measured: 6.8, verdict: "within tolerance" });
    const part = checkBudgets(file, { drills: 9 }, new Set(["drills"]), false);
    expect(verdicts(part)).toEqual({ days: "partial" });
    expect(part.failed).toBe(false);
  });
  test("a partial run checks only what it ran and never the total; a full run checks the total", () => {
    expect(checkBudgets(file, { lesson: 5 }, new Set(["lesson"]), false).total).toBeNull();
    const full = checkBudgets(
      file,
      { lesson: 10, drills: 6, map: 5 },
      new Set(["lesson", "drills", "map"]),
      true,
    );
    expect(full.total).toMatchObject({ measured: 21, verdict: "OVER" });
    expect(full.failed).toBe(true);
    const ok = checkBudgets(
      file,
      { lesson: 10, drills: 5, map: 1 },
      new Set(["lesson", "drills", "map"]),
      true,
    );
    expect(ok.failed).toBe(false);
  });
  test("a project that ran with no budget fails the run", () => {
    const r = checkBudgets(file, { lesson: 1, novel: 0.1 }, new Set(["lesson", "novel"]), false);
    expect(verdicts(r)).toEqual({ lesson: "under", novel: "no budget" });
    expect(r.failed).toBe(true);
  });
  test("a project may not sit in two budgets; e2e/budgets.json is valid and covers every project", () => {
    expect(() =>
      readBudgets({ ...file, budgets: [...file.budgets, { name: "x", projects: ["map"], minutes: 1 }] }),
    ).toThrow();
    const real = readBudgets(JSON.parse(readFileSync(`${REPO_ROOT}e2e/budgets.json`, "utf8")));
    expect(real.totalMinutes).toBe(105);
    const covered = new Set(real.budgets.flatMap((b) => b.projects));
    for (const p of [
      "lesson",
      "journey",
      "review",
      "session-seeds",
      "drills",
      "onboarding",
      "session",
      "map",
      "ui-review",
      "capstone",
      "answers",
      "review-studio",
      "tutor",
      "studio",
      "workbench-w3",
      "kit",
      "platform",
      "app",
      "notation",
      "strudel-autoplay",
      "strudel-gesture",
      "audio",
      "voice",
      "transcribe",
      "workbench",
    ])
      expect(covered.has(p)).toBe(true);
  });
  test("flags: --no-budget, --no-bundle; quiet streams default to 2", () => {
    expect(parseArgs([])).toMatchObject({ budget: true, bundle: true, quietJobs: 2 });
    expect(parseArgs(["--no-budget", "--no-bundle", "--quiet-jobs", "1"])).toMatchObject({
      budget: false,
      bundle: false,
      quietJobs: 1,
    });
  });
});

test("jobs from the machine's size: 8 on 12 cores and 32 GB; memory caps it; never under 2 or over 10", () => {
  const GB = 2 ** 30;
  expect(autoJobs(12, 32 * GB)).toBe(8);
  expect(autoJobs(12, 16 * GB)).toBe(5);
  expect(autoJobs(2, 4 * GB)).toBe(2);
  expect(autoJobs(32, 128 * GB)).toBe(10);
});

test("a stack serves the runner's development bundle with vite preview when it has one, else the dev server", () => {
  expect(frontEndCommand("/tmp/bundle")).toContain(
    'preview --config e2e/support/vite.e2e.config.ts --outDir "/tmp/bundle"',
  );
  expect(frontEndCommand(null)).not.toContain("preview");
  expect(frontEndCommand(null)).toContain("--config e2e/support/vite.e2e.config.ts");
});
