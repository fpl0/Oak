// `bun run e2e`: every browser suite of the repo, with the projects run side by side.
//
// The root playwright.config.ts runs one test at a time (workers: 1): tests inside a project share one server and
// one database, and dev seeds reset it. Projects, though, have their own ports and data dirs, so whole projects can
// run next to each other. This runner starts one Playwright process per UNIT (the projects that share a web server,
// each process still with workers: 1) and merges the results:
//
//   1. builds once (`bun run build`, `bun scripts/content/build.ts`) and tells the configs so (OAK_E2E_PREBUILT=1),
//      so that no two processes write dist/ or content/.generated at the same time;
//   2. the QUIET units first, one after another with nothing beside them: the suites that measure milliseconds
//      or cents (audio, strudel, the voice pitch gate, the transcribe A/B drift);
//   3. every other unit, `--jobs` at a time (default 3: five overloaded a 12-core machine), longest first;
//   4. any test that failed beside other suites is run again with its whole file, alone. It counts as passed only
//      if it passes there, and it is always listed by name as load-sensitive: never hidden.
//
//   bun run e2e                      everything
//   bun run e2e --jobs 5             more processes at once (only on an idle machine)
//   bun run e2e --project lesson     only these projects (repeatable)
//   bun run e2e:serial               the old way: one Playwright process, one test at a time
//
// Logs: test-results/e2e-logs/<unit>.log. The last line printed is `E2E TOTAL: …` and the exit code is 0 only when
// nothing failed and nothing was left unrun.
import { spawn } from "node:child_process";
import { createWriteStream, globSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const LOGS = `${root}test-results/e2e-logs`;
const OUT = `${root}test-results/e2e-out`;
const DURATIONS = `${root}test-results/e2e-durations.json`;

/** Suites that measure time or pitch: they run alone, before anything else. */
const QUIET = new Set([
  "audio",
  "strudel-autoplay",
  "strudel-gesture",
  "voice",
  "transcribe",
  "review-studio",
]);
/** Minutes per project from a recent serial run; replaced by test-results/e2e-durations.json once this has run. */
const DEFAULT_MINUTES: Record<string, number> = {
  journey: 27,
  lesson: 24,
  review: 20,
  drills: 6,
  answers: 5,
};

interface Unit {
  name: string;
  projects: string[];
  quiet: boolean;
}
interface Counts {
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  didNotRun: number;
}
interface Result extends Counts {
  unit: Unit;
  exit: number;
  minutes: number;
  failedTitles: string[];
  loadSensitive: string[];
}

interface ServerLike {
  name?: string;
  command: string;
}

async function discover(): Promise<Map<string, string[]>> {
  // The same convention as the root playwright.config.ts: every area config that exports `area`.
  const servers = new Map<string, string[]>([
    ["platform", ["platform-stack"]],
    ["app", ["platform-stack"]],
    ["strudel-autoplay", ["strudel-vite:5192"]],
    ["strudel-gesture", ["strudel-vite:5192"]],
    ["audio", ["audio-vite:5191"]],
  ]);
  const files = globSync(
    [
      "app/src/**/e2e/playwright.config.ts",
      "e2e/*/playwright.config.ts",
      "packages/*/e2e/playwright.config.ts",
    ],
    { cwd: root, exclude: (f) => f.includes("node_modules") },
  ).sort();
  for (const file of files) {
    const mod = (await import(pathToFileURL(`${root}${file}`).href)) as {
      area?: { name: string; webServer: ServerLike[] };
    };
    if (!mod.area) continue;
    servers.set(
      mod.area.name,
      mod.area.webServer.map((w) => w.name ?? w.command),
    );
  }
  return servers;
}

/** Projects that share a web server must share a process (a second process could not bind the port). */
function toUnits(servers: Map<string, string[]>, only: Set<string> | null): Unit[] {
  const names = [...servers.keys()].filter((n) => only === null || only.has(n));
  const parent = new Map(names.map((n) => [n, n]));
  const find = (n: string): string => {
    let r = n;
    while (parent.get(r) !== r) r = parent.get(r) as string;
    return r;
  };
  const owner = new Map<string, string>();
  for (const n of names)
    for (const s of servers.get(n) ?? []) {
      const prev = owner.get(s);
      if (prev) parent.set(find(n), find(prev));
      else owner.set(s, n);
    }
  const groups = new Map<string, string[]>();
  for (const n of names) groups.set(find(n), [...(groups.get(find(n)) ?? []), n]);
  return [...groups.values()].map((projects) => ({
    name: projects.join("+"),
    projects,
    quiet: projects.some((p) => QUIET.has(p)),
  }));
}

function parseArgs(argv: string[]): { jobs: number; only: Set<string> | null; rest: string[] } {
  let jobs = 3;
  const only = new Set<string>();
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a === "--jobs" && argv[i + 1]) jobs = Number(argv[++i]);
    else if (a.startsWith("--jobs=")) jobs = Number(a.slice("--jobs=".length));
    else if (a === "--project" && argv[i + 1]) only.add(argv[++i] as string);
    else if (a.startsWith("--project=")) only.add(a.slice("--project=".length));
    else rest.push(a);
  }
  if (!Number.isInteger(jobs) || jobs < 1) throw new Error("--jobs must be a positive integer");
  return { jobs, only: only.size > 0 ? only : null, rest };
}

function run(command: string, args: string[], logFile: string, env: Record<string, string>): Promise<number> {
  return new Promise((resolve) => {
    const log = createWriteStream(logFile, { flags: "a" });
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, FORCE_COLOR: "0", ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.on("close", (code) => log.end(() => resolve(code ?? 1)));
    child.on("error", () => log.end(() => resolve(1)));
  });
}

function count(text: string, label: string): number {
  // The reporter's summary lines: "  12 passed (1.2m)", "  1 failed", "  2 did not run".
  const m = [...text.matchAll(new RegExp(`^\\s+(\\d+) ${label}\\b`, "gm"))].at(-1);
  return m ? Number(m[1]) : 0;
}
function readCounts(text: string): Counts {
  return {
    passed: count(text, "passed"),
    failed: count(text, "failed"),
    flaky: count(text, "flaky"),
    skipped: count(text, "skipped"),
    didNotRun: count(text, "did not run"),
  };
}
/** Titles of the tests the list reporter marked as failed ("  ✘  12 [lesson] › file.pw.ts:3:1 › title (1.2s)"). */
function failedTitles(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/^\s+✘\s+\d+\s+(.*?)(?: \([\d.]+(?:ms|s|m)\))?$/gm))
    out.add((m[1] as string).trim());
  return [...out];
}

/**
 * The spec files of some failed tests ("[lesson] › app/src/lesson/e2e/a.pw.ts:3:1 › title"). A failure is run again
 * with its whole file: tests in a serial file depend on the ones before them, so `--last-failed` alone can fail a
 * test that is fine.
 */
function filesOf(titles: string[]): string[] {
  const out = new Set<string>();
  for (const t of titles) {
    const m = /› (\S+?\.ts):\d+:\d+ ›/.exec(t);
    if (m) out.add(m[1] as string);
  }
  return [...out];
}

const playwright = `${root}node_modules/.bin/playwright`;
const projectArgs = (u: Unit): string[] => u.projects.flatMap((p) => ["--project", p]);

async function runUnit(u: Unit, rest: string[]): Promise<Result> {
  const logFile = `${LOGS}/${u.name}.log`;
  const started = performance.now();
  const exit = await run(
    playwright,
    ["test", ...projectArgs(u), "--output", `${OUT}/${u.name}`, "--reporter", "list", ...rest],
    logFile,
    { OAK_E2E_PREBUILT: "1" },
  );
  const text = readFileSync(logFile, "utf8");
  return {
    unit: u,
    exit,
    minutes: (performance.now() - started) / 60_000,
    ...readCounts(text),
    failedTitles: failedTitles(text),
    loadSensitive: [],
  };
}

async function pool<T, R>(items: T[], size: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await worker(items[i] as T);
      }
    }),
  );
  return out;
}

const { jobs, only, rest } = parseArgs(process.argv.slice(2));
const servers = await discover();
if (only) for (const p of only) if (!servers.has(p)) throw new Error(`unknown project "${p}"`);
const units = toUnits(servers, only);

let minutes: Record<string, number> = { ...DEFAULT_MINUTES };
try {
  minutes = { ...minutes, ...(JSON.parse(readFileSync(DURATIONS, "utf8")) as Record<string, number>) };
} catch {
  // first run: the defaults order the queue
}
const weight = (u: Unit): number => u.projects.reduce((s, p) => s + (minutes[p] ?? 3), 0);

rmSync(LOGS, { recursive: true, force: true });
mkdirSync(LOGS, { recursive: true });
mkdirSync(OUT, { recursive: true });

const t0 = performance.now();
const say = (s: string): void => console.log(`[e2e ${((performance.now() - t0) / 60_000).toFixed(1)}m] ${s}`);

say(`build once (content, then the production app)`);
for (const [cmd, args] of [
  ["bun", ["scripts/content/build.ts"]],
  ["bun", ["run", "build"]],
] as const) {
  const code = await run(cmd, [...args], `${LOGS}/_build.log`, {});
  if (code !== 0) {
    console.log(readFileSync(`${LOGS}/_build.log`, "utf8").split("\n").slice(-30).join("\n"));
    console.log(`E2E TOTAL: build failed (${cmd} ${args.join(" ")}); nothing was run`);
    process.exit(1);
  }
}

const quiet = units.filter((u) => u.quiet);
const loud = units.filter((u) => !u.quiet).sort((a, b) => weight(b) - weight(a));
const results: Result[] = [];

const report = (r: Result): void =>
  say(
    `${r.exit === 0 ? "ok  " : "FAIL"} ${r.unit.name}: ${r.passed} passed, ${r.failed} failed, ${r.skipped} skipped${
      r.didNotRun ? `, ${r.didNotRun} did not run` : ""
    } (${r.minutes.toFixed(1)} min)`,
  );

say(`quiet suites, one at a time: ${quiet.map((u) => u.name).join(", ") || "none"}`);
for (const u of quiet) {
  const r = await runUnit(u, rest);
  report(r);
  results.push(r);
}

say(`${loud.length} units, ${jobs} at a time: ${loud.map((u) => u.name).join(", ")}`);
results.push(
  ...(await pool(loud, jobs, async (u) => {
    const r = await runUnit(u, rest);
    report(r);
    return r;
  })),
);

// Tests that failed beside other suites: once more, alone.
for (const r of results) {
  if (r.unit.quiet || r.exit === 0 || r.failedTitles.length === 0) continue;
  say(`again, alone: ${r.unit.name} (${r.failedTitles.length} failed beside other suites)`);
  const logFile = `${LOGS}/${r.unit.name}.alone.log`;
  const exit = await run(
    playwright,
    [
      "test",
      ...projectArgs(r.unit),
      "--output",
      `${OUT}/${r.unit.name}`,
      "--reporter",
      "list",
      ...filesOf(r.failedTitles),
      ...rest,
    ],
    logFile,
    { OAK_E2E_PREBUILT: "1" },
  );
  const text = readFileSync(logFile, "utf8");
  const again = readCounts(text);
  const stillFailed = failedTitles(text);
  r.loadSensitive = r.failedTitles.filter((t) => !stillFailed.includes(t));
  // The file ran whole again: count only the tests that had not passed the first time.
  r.passed += r.failed + r.didNotRun - (again.failed + again.didNotRun);
  r.failed = again.failed;
  r.didNotRun = again.didNotRun;
  r.failedTitles = stillFailed;
  r.exit = exit;
  say(`${exit === 0 ? "ok  " : "FAIL"} ${r.unit.name} alone: ${again.passed} passed, ${again.failed} failed`);
}

const measured: Record<string, number> = {};
for (const r of results)
  for (const p of r.unit.projects) measured[p] = Number((r.minutes / r.unit.projects.length).toFixed(1));
writeFileSync(DURATIONS, `${JSON.stringify({ ...minutes, ...measured }, null, 1)}\n`);

const sum = (k: keyof Counts): number => results.reduce((s, r) => s + r[k], 0);
const failed = results.filter((r) => r.exit !== 0);
const sensitive = results.flatMap((r) => r.loadSensitive);
console.log("");
for (const r of failed) {
  console.log(`FAILED ${r.unit.name} (exit ${r.exit}; log test-results/e2e-logs/${r.unit.name}.log)`);
  for (const t of r.failedTitles) console.log(`  ✘ ${t}`);
}
if (sensitive.length > 0) {
  console.log(`Load-sensitive (failed beside other suites, passed alone): ${sensitive.length}`);
  for (const t of sensitive) console.log(`  ~ ${t}`);
}
const total = `${sum("passed")} passed, ${sum("failed")} failed, ${sum("flaky")} flaky, ${sum("skipped")} skipped, ${sum("didNotRun")} did not run`;
console.log(
  `E2E TOTAL: ${total}; ${sensitive.length} load-sensitive; ${results.length} units in ${((performance.now() - t0) / 60_000).toFixed(1)} min (jobs ${jobs})`,
);
process.exit(failed.length > 0 || sum("didNotRun") > 0 ? 1 : 0);
