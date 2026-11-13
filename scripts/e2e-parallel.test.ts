import { describe, expect, test } from "bun:test";
import { E2E_SUFFIX, oakStack, parseShift, shifted } from "../e2e/support/stack.ts";
import {
  balance,
  type Durations,
  type Listed,
  merge,
  outcomeOf,
  type Project,
  parseArgs,
  plan,
  projectsFor,
  readReport,
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
    const files = new Set(["a.pw.ts"]);
    const fileOf = (k: string) => k.split(" › ")[1] as string;
    const m = merge(first, settle([a, b], report({ [a.key]: "passed", [b.key]: "failed" })), files, fileOf);
    expect(m.loadSensitive).toEqual([a.key]);
    expect(m.outcomes.get(b.key)).toBe("failed");
    // Alone, its server could not start: not load-sensitive, and not passed.
    const m2 = merge(first, settle([a, b], report({}, 1, ["webServer"])), files, fileOf);
    expect(m2.loadSensitive).toEqual([]);
    expect(m2.outcomes.get(a.key)).toBe("notRun");
    expect(m2.errors).toEqual(["webServer"]);
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
