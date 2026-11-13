// `bun run e2e`: every browser suite of the repo, side by side, as fast as the machine allows.
//
// The root playwright.config.ts runs one test at a time per process (workers: 1): the tests of one project share one
// server and one database, and dev seeds reset it. Projects have their own ports and data dirs, and
// `OAK_E2E_SHIFT=<n>` (e2e/support/stack.ts) moves every port and data dir of a process by n, so this runner can
// start several Playwright processes at once, even several of ONE project:
//
//   1. builds once (`bun scripts/content/build.ts`, `bun run build`) and writes every fake-microphone fixture once,
//      then tells the configs so (OAK_E2E_PREBUILT=1): no two processes write dist/, content/.generated or a WAV
//      another Chromium is reading;
//   2. the QUIET files first, with nothing loud beside them: the specs that measure milliseconds or cents on real
//      audio (QUIET below), `--quiet-jobs` at a time (default 1);
//   3. every other file, `--jobs` processes at a time (default: from the free cores, 2–6), longest first. A project
//      whose files add up to more than CHAIN_MINUTES is cut into SHARDS (up to MAX_SHARDS), files balanced by their
//      measured seconds, shard k on the base shift + 100·k, so no serial chain sets the floor of the run;
//   4. a test that failed (or did not run) beside other suites is run again with its whole file, alone. The alone
//      outcome is the one that counts; one that passes only alone is listed by name as load-sensitive and still
//      fails the run (fix it, or move its file to QUIET with the evidence): never hidden.
//
// Every listed test is accounted for: the summary names each failed test, each one that never ran (a serial file
// stopped early, a web server that did not start, a dead process) and each skip the spec asked for, and prints the
// counts per project, which must add up to the listing.
//
//   bun run e2e                          everything
//   bun run e2e --jobs 3                 at most three processes at once (a shared machine)
//   bun run e2e --project lesson         only these projects (repeatable)
//   bun run e2e --since origin/main      only the projects that cover the paths changed since that ref (committed,
//                                        staged, unstaged and untracked); a shared path selects everything
//   bun run e2e --shift 300              every port and data dir moved by 300 (a second run beside a first one)
//   bun run e2e --plan                   print the plan (units, shards, files) and exit
//   bun run e2e -- --grep foo            anything after `--` goes to every Playwright process
//   bun run e2e:serial                   the old way: one Playwright process, one test at a time
//
// Logs: test-results/e2e-logs/<unit>.log. Durations: test-results/e2e-durations.json (per project and per file; the
// next run balances its shards with them). The last line printed is `E2E TOTAL: …`; the exit code is 0 only when
// nothing failed, nothing was left unrun and nothing failed only under load.
//
//   bun run e2e --config <file>          another config (the runner's own failure fixtures): its state is kept
//                                        beside that file, and Oak's build is skipped
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, loadavg } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const playwright = `${root}node_modules/.bin/playwright`;

/**
 * The config every Playwright process runs and where the run keeps its logs, reports and durations. The root config
 * by default; `--config <file>` points the runner at another one (the runner's own failure fixtures), which keeps
 * its state beside that file and skips Oak's build.
 */
const where = {
  config: `${root}playwright.config.ts`,
  configDir: root,
  logs: `${root}test-results/e2e-logs`,
  out: `${root}test-results/e2e-out`,
  durations: `${root}test-results/e2e-durations.json`,
};
function pointAt(file: string): void {
  const config = resolve(root, file);
  const dir = dirname(config);
  Object.assign(where, {
    config,
    configDir: `${dir}/`,
    logs: `${dir}/.e2e-state/logs`,
    out: `${dir}/.e2e-state/out`,
    durations: `${dir}/.e2e-state/durations.json`,
  });
}

/** A serial chain longer than this (minutes) is cut into shards. */
const CHAIN_MINUTES = 7;
const MAX_SHARDS = 6;
/** Shard k of a project runs on the base shift + SHARD_STEP·k (every standard port lies in a window under 100). */
const SHARD_STEP = 100;
/** No test should take longer (docs/design/wave5.md, Browser tests): the run lists every one that does. */
const TEST_CEILING_S = 90;

/**
 * The files that measure time or pitch on real audio: they run first, with nothing loud beside them. "all" is the
 * whole project. The other files of these projects run in the loud pool like any other.
 */
const QUIET: Record<string, "all" | string[]> = {
  audio: [
    "packages/audio/e2e/ab-gate.pw.ts",
    "packages/audio/e2e/bleed.pw.ts",
    "packages/audio/e2e/hum.pw.ts",
    "packages/audio/e2e/mic.pw.ts",
    "packages/audio/e2e/stretch.pw.ts",
    "packages/audio/e2e/stretch-player.pw.ts",
  ],
  "strudel-autoplay": ["packages/strudel/e2e/sounds.pw.ts", "packages/strudel/e2e/editors.pw.ts"],
  "strudel-gesture": ["packages/strudel/e2e/editors.pw.ts"],
  // The pitch gate, the pitch-match trials and the bleed check read the fake microphone frame by frame.
  voice: [
    "app/src/voice/e2e/gate.pw.ts",
    "app/src/voice/e2e/settings.pw.ts",
    "app/src/voice/e2e/bleed.pw.ts",
  ],
  transcribe: [
    "app/src/transcribe/e2e/ab-drift.pw.ts",
    "app/src/transcribe/e2e/hum.pw.ts",
    "app/src/transcribe/e2e/own-audio.pw.ts",
  ],
  // The drift at 0.25×–1× and the click at the A/B switch, measured on the captured audio.
  "review-studio": ["app/src/album/e2e/transcribe.pw.ts"],
  // Failed beside three other suites and passed alone (Wave 5 test-speed runs): the metronome's level on the
  // master bus, and the playhead, roll and staff lit in time.
  workbench: ["app/src/workbench/e2e/loop.pw.ts", "app/src/workbench/e2e/workbench.pw.ts"],
};

/**
 * `--since`: which projects cover a changed path. Checked in order; the first prefix that matches decides. A path
 * inside a project's own test folder always selects that project; a path no rule names selects EVERYTHING (a shared
 * path: the stack, the server's core, the app's shell, the build). NONE selects nothing (documentation).
 */
const ALL = "*";
const NONE: string[] = [];
const LESSON_PATH = ["lesson", "journey", "review", "ui-review"];
const SESSION_PATH = ["session", "session-seeds", "map", "journey", "review"];
const DRILL_PATH = ["drills", "session-seeds", "journey", "review"];
const CAPSTONE_PATH = ["capstone", "review-studio", "ui-review", "journey"];
const VOICE_PATH = ["voice", "onboarding", "audio", "drills", "journey", "review"];
const WORKBENCH_PATH = ["workbench", "studio", "workbench-w3", "ui-review", "lesson", "journey", "platform"];
const CONTENT_PATH = [
  "lesson",
  "answers",
  "drills",
  "session-seeds",
  "capstone",
  "transcribe",
  "journey",
  "review",
  "ui-review",
];
export const SINCE_MAP: [prefix: string, projects: string[] | typeof ALL][] = [
  ["docs/", NONE],
  ["content/STYLE.md", NONE],
  ["content/AUTHORING.md", NONE],
  ["README", NONE],
  ["spikes/", NONE],
  ["app/playwright.config.ts", ["app"]],
  ["app/src/lesson/", LESSON_PATH],
  ["app/src/routes/learn/", LESSON_PATH],
  ["app/src/routes/checkpoint/", LESSON_PATH],
  ["app/src/answers/", ["answers", ...LESSON_PATH, "drills"]],
  ["app/src/drills/", DRILL_PATH],
  ["app/src/routes/practice/", DRILL_PATH],
  ["packages/drills/", DRILL_PATH],
  ["packages/srs/", [...DRILL_PATH, "session"]],
  ["content/families.ts", DRILL_PATH],
  ["content/decks/", DRILL_PATH],
  ["content/gym/", [...DRILL_PATH, "transcribe"]],
  ["app/src/session/", SESSION_PATH],
  ["app/src/map/", SESSION_PATH],
  ["app/src/routes/session/", SESSION_PATH],
  ["app/src/routes/index.tsx", SESSION_PATH],
  ["app/src/routes/progress.tsx", SESSION_PATH],
  ["app/src/routes/oak.tsx", [...SESSION_PATH, "ui-review"]],
  ["app/src/routes/dev/", [...SESSION_PATH, "platform"]],
  ["app/src/capstone/", CAPSTONE_PATH],
  ["app/src/album/", CAPSTONE_PATH],
  ["app/src/routes/capstone/", CAPSTONE_PATH],
  ["app/src/routes/album/", CAPSTONE_PATH],
  ["content/capstones.ts", [...CAPSTONE_PATH, "session-seeds"]],
  ["app/src/tutor/", ["tutor", "ui-review", "lesson", "journey"]],
  ["server/src/tutor/", ["tutor", "ui-review", "lesson", "journey"]],
  ["scripts/tutor/", ["tutor"]],
  ["app/src/lib/tutor-stream.ts", ["tutor", "ui-review", "journey"]],
  ["app/src/routes/settings/tutor.tsx", ["tutor", "kit"]],
  ["app/src/transcribe/", ["transcribe", "review-studio", "journey"]],
  ["app/src/routes/transcribe/", ["transcribe", "review-studio", "journey"]],
  ["content/repertoire/", ["transcribe", "review-studio", "capstone", "journey"]],
  ["app/src/workbench/", WORKBENCH_PATH],
  ["app/src/studio/", WORKBENCH_PATH],
  ["app/src/toolbox/", WORKBENCH_PATH],
  ["app/src/routes/studio/", WORKBENCH_PATH],
  ["app/src/routes/toolbox/", WORKBENCH_PATH],
  ["app/src/voice/", VOICE_PATH],
  ["app/src/onboarding/", VOICE_PATH],
  ["app/src/routes/onboarding/", VOICE_PATH],
  ["app/src/lib/mic", [...VOICE_PATH, "platform"]],
  ["app/src/routes/settings_.voice.setup.tsx", VOICE_PATH],
  ["app/src/routes/settings/voice.tsx", VOICE_PATH],
  ["app/src/routes/settings/audio.tsx", VOICE_PATH],
  ["packages/audio/", [...VOICE_PATH, "transcribe", "review-studio", "capstone"]],
  ["packages/pitch/", VOICE_PATH],
  ["app/src/ui/review/", ["ui-review"]],
  ["packages/notation/", ["notation", "lesson", "drills", "answers", "ui-review", "journey", "review"]],
  ["packages/strudel/", ALL],
  ["sounds/", ALL],
  ["scripts/sounds/", ["strudel-autoplay", "strudel-gesture", "platform"]],
  ["packages/grader/", CONTENT_PATH],
  ["packages/theory/", CONTENT_PATH],
  ["packages/content-kit/", CONTENT_PATH],
  ["content/core/", ["lesson", "journey", "review", "session-seeds", "ui-review"]],
  ["content/checkpoints.ts", ["lesson", "journey", "review", "session-seeds"]],
  ["content/bands/", ["lesson", "capstone", "transcribe", "strudel-autoplay"]],
];

export interface Project {
  name: string;
  /** Spec files (repo-relative) with their test counts, from `playwright test --list`. */
  files: Map<string, number>;
  /** The web servers it starts (projects that share one share a process). */
  servers: string[];
  /** Its own test folder (repo-relative), for `--since`. */
  testDir: string;
}
export interface Unit {
  name: string;
  projects: string[];
  /** Files to run (repo-relative); empty = every file of the projects. */
  files: string[];
  quiet: boolean;
  shift: number;
  /** Expected minutes (for ordering). */
  weight: number;
}
/**
 * What became of one listed test. `notRun`: it never ran: a serial file stopped before it, its web server did not
 * start, the process died, or no report of it came back at all. `skipped` is only a skip the spec asked for
 * (`test.skip`, `test.fixme`).
 */
export type Outcome = "passed" | "failed" | "flaky" | "skipped" | "notRun";
export const OUTCOMES: readonly Outcome[] = ["passed", "failed", "flaky", "skipped", "notRun"];
/** One listed test: `project › file › describe › title` (file repo-relative). */
export type TestKey = string;
export interface Listed {
  key: TestKey;
  project: string;
  file: string;
}
interface Result {
  unit: Unit;
  exit: number;
  minutes: number;
  /** The final outcome of every test the unit was given (the alone re-run's, for the files it re-ran). */
  outcomes: Map<TestKey, Outcome>;
  /** Errors outside any test (a web server that did not start, a config error), from the deciding run. */
  errors: string[];
  /** Failed beside other suites, passed alone (by name; units whose web server failed only under load too). */
  loadSensitive: string[];
}
export interface Durations {
  generated: string;
  /** Minutes of test time per project. */
  projects: Record<string, number>;
  /** Seconds of test time per `project › file`. */
  files: Record<string, number>;
  /** Seconds per `project › file › test title` (the last run of each). */
  tests?: Record<string, number>;
}

// --- arguments ---------------------------------------------------------------------------------------------------

interface Args {
  jobs: number | "auto";
  quietJobs: number;
  only: Set<string> | null;
  since: string | null;
  shift: number;
  plan: boolean;
  config: string | null;
  rest: string[];
}

export function parseArgs(argv: string[]): Args {
  const a: Args = {
    jobs: "auto",
    quietJobs: 1,
    only: null,
    since: null,
    shift: Number(process.env.OAK_E2E_SHIFT ?? 0),
    plan: false,
    config: null,
    rest: [],
  };
  const only = new Set<string>();
  const value = (i: number, flag: string): string => {
    const v = argv[i + 1];
    if (v === undefined) throw new Error(`${flag} needs a value`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    const [flag, inline] = arg.includes("=")
      ? (arg.split(/=(.*)/s, 2) as [string, string])
      : [arg, undefined];
    const take = (): string => inline ?? value(i++, flag);
    if (arg === "--") {
      a.rest.push(...argv.slice(i + 1));
      break;
    } else if (flag === "--jobs") {
      const v = take();
      a.jobs = v === "auto" ? "auto" : Number(v);
    } else if (flag === "--quiet-jobs") a.quietJobs = Number(take());
    else if (flag === "--project") only.add(take());
    else if (flag === "--since") a.since = take();
    else if (flag === "--shift") a.shift = Number(take());
    else if (flag === "--plan") a.plan = true;
    else if (flag === "--config") a.config = take();
    else a.rest.push(arg);
  }
  if (a.jobs !== "auto" && (!Number.isInteger(a.jobs) || a.jobs < 1))
    throw new Error("--jobs must be a positive integer or auto");
  if (!Number.isInteger(a.quietJobs) || a.quietJobs < 1)
    throw new Error("--quiet-jobs must be a positive integer");
  if (
    !Number.isInteger(a.shift) ||
    a.shift < 0 ||
    a.shift % 10 !== 0 ||
    a.shift + SHARD_STEP * MAX_SHARDS >= 5000
  )
    throw new Error("--shift must be a multiple of 10 in 0–4590");
  a.only = only.size > 0 ? only : null;
  return a;
}

/** From the free cores: each process is a Vite, a Bun server and a Chromium (about two busy cores together). */
function autoJobs(): number {
  const cores = availableParallelism();
  const busy = loadavg()[0] ?? 0;
  return Math.max(2, Math.min(6, Math.floor((cores - busy) / 2)));
}

// --- discovery ---------------------------------------------------------------------------------------------------

/** The shape `--list --reporter json` and the JSON reporter share (only what the runner reads). */
interface ReportResult {
  status?: string;
  duration: number;
  annotations?: { type: string }[];
}
interface ReportTest {
  projectName: string;
  status?: string;
  annotations?: { type: string }[];
  results: ReportResult[];
}
interface ReportSuite {
  file?: string;
  title?: string;
  specs?: { title: string; tests: ReportTest[] }[];
  suites?: ReportSuite[];
}
interface Report {
  suites?: ReportSuite[];
  errors?: { message?: string }[];
}

/** Every test of a report (or a listing) with its key, project and repo-relative file. */
export function eachTest(
  report: Report,
  rel: (file: string) => string = relFile,
): (Listed & { test: ReportTest })[] {
  const out: (Listed & { test: ReportTest })[] = [];
  const walk = (s: ReportSuite, file: string, path: string[]): void => {
    for (const spec of s.specs ?? [])
      for (const t of spec.tests)
        out.push({
          key: `${t.projectName} › ${file} › ${[...path, spec.title].join(" › ")}`,
          project: t.projectName,
          file,
          test: t,
        });
    for (const c of s.suites ?? []) walk(c, file, c.title ? [...path, c.title] : path);
  };
  for (const s of report.suites ?? []) walk(s, rel(s.file ?? ""), []);
  return out;
}

/** Every project with its spec files and test counts, and its web servers, from the config itself. */
async function discover(
  shift: number,
  rest: string[],
): Promise<{ projects: Map<string, Project>; listed: Listed[] }> {
  const env = { ...process.env, OAK_E2E_SHIFT: String(shift), FORCE_COLOR: "0" };
  // The pass-through (`-- --grep x`) narrows the listing exactly as it narrows the runs.
  const listing = spawnSync(
    playwright,
    ["test", "-c", where.config, "--list", "--reporter", "json", ...rest],
    {
      cwd: root,
      env,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    },
  );
  if (listing.status !== 0)
    throw new Error(`playwright test --list failed:\n${listing.stderr}${listing.stdout}`);
  const json = JSON.parse(listing.stdout) as Report & {
    config: { projects: { name: string; testDir: string }[] };
  };
  const projects = new Map<string, Project>();
  for (const p of json.config.projects)
    projects.set(p.name, {
      name: p.name,
      files: new Map(),
      servers: [],
      testDir: p.testDir.startsWith(root) ? p.testDir.slice(root.length) : p.testDir,
    });
  const listed: Listed[] = [];
  for (const t of eachTest(json)) {
    const p = projects.get(t.project);
    if (!p) continue;
    p.files.set(t.file, (p.files.get(t.file) ?? 0) + 1);
    listed.push({ key: t.key, project: t.project, file: t.file });
  }

  // The web servers: the same convention the root config uses (process.env is this runner's, so set the shift).
  process.env.OAK_E2E_SHIFT = String(shift);
  process.env.OAK_E2E_PREBUILT = "1";
  const { projectServers } = (await import(where.config)) as {
    projectServers: Record<string, string[]>;
  };
  for (const [name, servers] of Object.entries(projectServers)) {
    const p = projects.get(name);
    if (p) p.servers = servers;
  }
  return { projects, listed };
}

/** A spec path as a JSON report gives it (relative to the config's folder, or absolute) → repo-relative. */
function relFile(f: string): string {
  return relative(root, resolve(where.configDir, f));
}

// --- --since -----------------------------------------------------------------------------------------------------

function changedPaths(ref: string): string[] {
  const git = (args: string[]): string[] => {
    const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
    return r.stdout.split("\n").filter(Boolean);
  };
  const base = git(["merge-base", ref, "HEAD"])[0] ?? ref;
  return [
    ...new Set([
      ...git(["diff", "--name-only", base]),
      ...git(["ls-files", "--others", "--exclude-standard"]),
    ]),
  ].sort();
}

/** The projects that cover these paths, with the reason for each (`ALL` when a shared path is among them). */
export function projectsFor(
  paths: string[],
  projects: Map<string, Project>,
): { selected: Set<string> | typeof ALL; why: string[] } {
  const selected = new Set<string>();
  const why: string[] = [];
  for (const path of paths) {
    // A file in a project's own test folder (its specs, helpers, fixtures, config).
    const own = [...projects.values()].filter(
      (p) => p.testDir && (path.startsWith(`${p.testDir}/`) || p.files.has(path)),
    );
    if (own.length > 0) {
      for (const p of own) selected.add(p.name);
      why.push(`${path} → ${own.map((p) => p.name).join(", ")} (its own tests)`);
      continue;
    }
    const rule = SINCE_MAP.find(([prefix]) => path.startsWith(prefix));
    if (!rule) {
      why.push(`${path} → everything (a shared path)`);
      return { selected: ALL, why };
    }
    const [, to] = rule;
    if (to === ALL) {
      why.push(`${path} → everything (${rule[0]})`);
      return { selected: ALL, why };
    }
    for (const p of to) if (projects.has(p)) selected.add(p);
    if (to.length > 0) why.push(`${path} → ${to.join(", ")}`);
  }
  return { selected, why };
}

// --- planning ----------------------------------------------------------------------------------------------------

function readDurations(): Durations {
  const empty: Durations = { generated: "", projects: {}, files: {} };
  try {
    const raw = JSON.parse(readFileSync(where.durations, "utf8")) as Partial<Durations> &
      Record<string, unknown>;
    if (raw.files && raw.projects) return raw as Durations;
    // The first runner's format: { project: minutes }.
    return { ...empty, projects: raw as unknown as Record<string, number> };
  } catch {
    return empty;
  }
}

/** Seconds a file is expected to take: measured, else its project's average per test, else 20 s a test. */
function fileSeconds(d: Durations, p: Project, file: string): number {
  const measured = d.files[`${p.name} › ${file}`];
  if (measured !== undefined) return measured;
  const tests = [...p.files.values()].reduce((s, n) => s + n, 0);
  const minutes = d.projects[p.name];
  const perTest = minutes !== undefined && tests > 0 ? (minutes * 60) / tests : 20;
  return perTest * (p.files.get(file) ?? 1);
}

/** Projects that share a web server share a process (a second process could not bind the port). */
function groups(projects: Project[]): Project[][] {
  const parent = new Map(projects.map((p) => [p.name, p.name]));
  const find = (n: string): string => {
    let r = n;
    while (parent.get(r) !== r) r = parent.get(r) as string;
    return r;
  };
  const owner = new Map<string, string>();
  for (const p of projects)
    for (const s of p.servers) {
      const prev = owner.get(s);
      if (prev) parent.set(find(p.name), find(prev));
      else owner.set(s, p.name);
    }
  const out = new Map<string, Project[]>();
  for (const p of projects) out.set(find(p.name), [...(out.get(find(p.name)) ?? []), p]);
  return [...out.values()];
}

/** Longest-processing-time-first: each file to the lightest shard so far. */
export function balance(files: [string, number][], n: number): { files: string[]; seconds: number }[] {
  const shards = Array.from({ length: n }, () => ({ files: [] as string[], seconds: 0 }));
  for (const [f, s] of [...files].sort((a, b) => b[1] - a[1])) {
    const lightest = shards.reduce((m, x) => (x.seconds < m.seconds ? x : m));
    lightest.files.push(f);
    lightest.seconds += s;
  }
  return shards.filter((s) => s.files.length > 0);
}

export function plan(projects: Project[], d: Durations, shift: number): Unit[] {
  const units: Unit[] = [];
  for (const group of groups(projects)) {
    const name = group.map((p) => p.name).join("+");
    const seconds = new Map<string, number>();
    for (const p of group)
      for (const f of p.files.keys()) seconds.set(f, (seconds.get(f) ?? 0) + fileSeconds(d, p, f));
    const quietFiles = new Set<string>();
    for (const p of group) {
      const q = QUIET[p.name];
      if (q === "all") for (const f of p.files.keys()) quietFiles.add(f);
      else if (q) for (const f of q) if (p.files.has(f)) quietFiles.add(f);
    }
    const quiet = [...seconds].filter(([f]) => quietFiles.has(f));
    const loud = [...seconds].filter(([f]) => !quietFiles.has(f));
    const minutes = (xs: [string, number][]): number => xs.reduce((s, [, v]) => s + v, 0) / 60;
    const all = quiet.length === 0 || loud.length === 0;
    if (quiet.length > 0)
      units.push({
        name: loud.length > 0 ? `${name}.quiet` : name,
        projects: group.map((p) => p.name),
        files: all ? [] : quiet.map(([f]) => f),
        quiet: true,
        shift,
        weight: minutes(quiet),
      });
    if (loud.length === 0) continue;
    // A project alone on its servers can be cut into shards; a shared stack cannot (one process owns its ports).
    const n =
      group.length === 1
        ? Math.min(MAX_SHARDS, loud.length, Math.max(1, Math.ceil(minutes(loud) / CHAIN_MINUTES)))
        : 1;
    if (n === 1) {
      units.push({
        name: quiet.length > 0 ? `${name}.loud` : name,
        projects: group.map((p) => p.name),
        files: all ? [] : loud.map(([f]) => f),
        quiet: false,
        shift,
        weight: minutes(loud),
      });
      continue;
    }
    const shards = balance(loud, n);
    for (const [k, s] of shards.entries())
      units.push({
        name: `${name}.${k + 1}of${shards.length}`,
        projects: group.map((p) => p.name),
        files: s.files,
        quiet: false,
        shift: shift + SHARD_STEP * k,
        weight: s.seconds / 60,
      });
  }
  return units;
}

// --- running -----------------------------------------------------------------------------------------------------

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

/**
 * One test's outcome from the JSON reporter. A test with no result, or one Playwright reports "skipped" without a
 * skip the spec asked for (the rest of a serial file after a failure), or one interrupted, did not run.
 */
export function outcomeOf(t: ReportTest): Outcome {
  if (t.results.length === 0) return "notRun";
  if (t.results.some((r) => r.status === "interrupted")) return "notRun";
  if (t.status === "expected") return "passed";
  if (t.status === "flaky") return "flaky";
  if (t.status === "unexpected") return "failed";
  const asked = [...(t.annotations ?? []), ...t.results.flatMap((r) => r.annotations ?? [])].some(
    (a) => a.type === "skip" || a.type === "fixme",
  );
  return asked ? "skipped" : "notRun";
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A Playwright file filter that matches exactly this repo-relative file. */
const fileFilter = (f: string): string => `${escapeRe(`${root}${f}`)}$`;

interface Times {
  /** Seconds per `project › file`. */
  files: Record<string, number>;
  /** Seconds per `project › file › title`. */
  tests: Record<string, number>;
}
interface RunReport {
  exit: number;
  /** Every test the report names, with its outcome. */
  outcomes: Map<TestKey, Outcome>;
  /** Errors outside any test (the web server, the config, a global hook). */
  errors: string[];
  times: Times;
}

/** Reads a JSON report: outcomes, errors outside tests, and seconds per file and per test. */
export function readReport(report: Report, exit: number): RunReport {
  const out: RunReport = {
    exit,
    outcomes: new Map(),
    errors: (report.errors ?? []).map((e) => (e.message ?? "an error").split("\n")[0] as string),
    times: { files: {}, tests: {} },
  };
  for (const t of eachTest(report)) {
    out.outcomes.set(t.key, outcomeOf(t.test));
    if (t.test.results.length === 0) continue;
    const sec = t.test.results.reduce((sum, r) => sum + r.duration, 0) / 1000;
    const fileKey = `${t.project} › ${t.file}`;
    out.times.files[fileKey] = (out.times.files[fileKey] ?? 0) + sec;
    out.times.tests[t.key] = sec;
  }
  return out;
}

/**
 * The outcome of every test a run was given: what its report says, and `notRun` for each one the report does not
 * name at all (the process died, or its web server never started). A run that exits non-zero with every test
 * accounted for and passed, and no error named, still fails: the exit code is kept as an error.
 */
export function settle(
  expected: Listed[],
  r: RunReport,
): { outcomes: Map<TestKey, Outcome>; errors: string[] } {
  const outcomes = new Map<TestKey, Outcome>();
  for (const t of expected) outcomes.set(t.key, r.outcomes.get(t.key) ?? "notRun");
  // A test the listing did not have (a spec saved mid-run) still counts.
  for (const [k, o] of r.outcomes) if (!outcomes.has(k)) outcomes.set(k, o);
  const errors = [...r.errors];
  const bad = [...outcomes.values()].some((o) => o === "failed" || o === "notRun");
  if (r.exit !== 0 && errors.length === 0 && !bad)
    errors.push(`Playwright exited ${r.exit} with no failed test`);
  return { outcomes, errors };
}

/**
 * After the alone re-run of some files: the alone outcome replaces the first one for every test of those files. A
 * test is load-sensitive only if it FAILED beside other suites and PASSED alone; one that fails, or cannot run,
 * alone is a failure, whatever it did before.
 */
export function merge(
  first: { outcomes: Map<TestKey, Outcome>; errors: string[] },
  alone: { outcomes: Map<TestKey, Outcome>; errors: string[] },
  rerunFiles: Set<string>,
  fileOf: (k: TestKey) => string,
): { outcomes: Map<TestKey, Outcome>; errors: string[]; loadSensitive: string[] } {
  const outcomes = new Map(first.outcomes);
  const loadSensitive: string[] = [];
  for (const [k, before] of first.outcomes) {
    if (!rerunFiles.has(fileOf(k))) continue;
    const after = alone.outcomes.get(k) ?? "notRun";
    outcomes.set(k, after);
    if (before === "failed" && (after === "passed" || after === "flaky")) loadSensitive.push(k);
  }
  for (const [k, o] of alone.outcomes) if (!outcomes.has(k)) outcomes.set(k, o);
  if (first.errors.length > 0 && alone.errors.length === 0)
    loadSensitive.push(...first.errors.map((e) => `(beside other suites: ${e})`));
  return { outcomes, errors: alone.errors, loadSensitive };
}

/** Counts per project; every listed test lands in exactly one column. */
export function tally(outcomes: Map<TestKey, Outcome>): Map<string, Record<Outcome, number>> {
  const out = new Map<string, Record<Outcome, number>>();
  for (const [k, o] of outcomes) {
    const p = k.split(" › ")[0] as string;
    const row = out.get(p) ?? { passed: 0, failed: 0, flaky: 0, skipped: 0, notRun: 0 };
    row[o]++;
    out.set(p, row);
  }
  return out;
}

const projectArgs = (u: Unit): string[] => u.projects.map((p) => `--project=${p}`);

async function runPlaywright(u: Unit, files: string[], tag: string, rest: string[]): Promise<RunReport> {
  const logFile = `${where.logs}/${u.name}${tag}.log`;
  const json = `${where.out}/${u.name}${tag}.json`;
  rmSync(json, { force: true });
  const exit = await run(
    playwright,
    [
      "test",
      "-c",
      where.config,
      ...projectArgs(u),
      "--output",
      `${where.out}/${u.name}${tag}`,
      "--reporter",
      "list,json",
      "--pass-with-no-tests",
      ...files.map(fileFilter),
      ...rest,
    ],
    logFile,
    {
      OAK_E2E_PREBUILT: "1",
      OAK_E2E_SHIFT: String(u.shift),
      PLAYWRIGHT_JSON_OUTPUT_NAME: json,
    },
  );
  let report: Report = {};
  try {
    report = JSON.parse(readFileSync(json, "utf8")) as Report;
  } catch {
    report = { errors: [{ message: `no JSON report (see ${relative(root, logFile)})` }] };
  }
  return readReport(report, exit);
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

// --- main --------------------------------------------------------------------------------------------------------

if (import.meta.main) {
  const args = parseArgs(process.argv.slice(2));
  if (args.config) pointAt(args.config);
  const t0 = performance.now();
  const say = (s: string): void =>
    console.log(`[e2e ${((performance.now() - t0) / 60_000).toFixed(1)}m] ${s}`);

  const { projects: all, listed } = await discover(args.shift, args.rest);
  if (args.only) for (const p of args.only) if (!all.has(p)) throw new Error(`unknown project "${p}"`);
  let wanted: Set<string> = args.only ?? new Set(all.keys());
  if (args.since) {
    const paths = changedPaths(args.since);
    const { selected, why } = projectsFor(paths, all);
    say(`--since ${args.since}: ${paths.length} changed paths`);
    for (const w of why) console.log(`  ${w}`);
    if (selected !== ALL) wanted = new Set([...wanted].filter((p) => selected.has(p)));
    if (wanted.size === 0) {
      console.log("E2E TOTAL: nothing to run (no project covers the changed paths)");
      process.exit(0);
    }
  }
  const durations = readDurations();
  const units = plan(
    [...all.values()].filter((p) => wanted.has(p.name) && p.files.size > 0),
    durations,
    args.shift,
  );
  // The tests each unit is given (its projects, its files): what its report must account for.
  const given = (u: Unit): Listed[] =>
    listed.filter(
      (t) => u.projects.includes(t.project) && (u.files.length === 0 || u.files.includes(t.file)),
    );
  const jobs = args.jobs === "auto" ? autoJobs() : args.jobs;
  const quiet = units.filter((u) => u.quiet).sort((a, b) => b.weight - a.weight);
  const loud = units.filter((u) => !u.quiet).sort((a, b) => b.weight - a.weight);
  say(
    `plan: ${units.length} units (${quiet.length} quiet, ${loud.length} loud), jobs ${jobs}, quiet jobs ${args.quietJobs}, base shift ${args.shift}`,
  );
  for (const u of [...quiet, ...loud])
    console.log(
      `  ${u.quiet ? "quiet" : "loud "} ${u.name.padEnd(28)} ~${u.weight.toFixed(1)} min  shift ${u.shift}  ${given(u).length} tests${
        u.files.length > 0 ? `  ${u.files.length} files` : ""
      }`,
    );
  if (args.plan) {
    for (const u of units.filter((x) => x.files.length > 0)) console.log(`${u.name}: ${u.files.join(" ")}`);
    process.exit(0);
  }

  rmSync(where.logs, { recursive: true, force: true });
  mkdirSync(where.logs, { recursive: true });
  mkdirSync(where.out, { recursive: true });

  // Oak's build and fixtures (not for another config: the runner's own fixtures need neither).
  const prepare: [string, string[], string?][] = args.config
    ? []
    : [
        ["bun", ["scripts/content/build.ts"]],
        ["bun", ["run", "build"]],
        ["bun", ["app/src/onboarding/e2e/make-fixtures.bun.ts"]],
        ["bun", ["e2e/review/make-fixtures.bun.ts"]],
        ["bun", ["app/src/voice/e2e/make-fixtures.bun.ts"]],
        [
          "bun",
          ["-e", 'import { writeMicFixtures } from "./app/src/answers/e2e/fixtures.ts"; writeMicFixtures();'],
        ],
        ["bun", ["make-fixtures.bun.ts"], "packages/audio/e2e"],
      ];
  if (prepare.length > 0)
    say("build once (content, the production app) and write the fake-microphone fixtures");
  for (const [cmd, cmdArgs, cwd] of prepare) {
    const code = await new Promise<number>((resolve) => {
      const log = createWriteStream(`${where.logs}/_build.log`, { flags: "a" });
      const child = spawn(cmd, cmdArgs, {
        cwd: cwd ? `${root}${cwd}` : root,
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.pipe(log, { end: false });
      child.stderr.pipe(log, { end: false });
      child.on("close", (c) => log.end(() => resolve(c ?? 1)));
    });
    if (code !== 0) {
      console.log(readFileSync(`${where.logs}/_build.log`, "utf8").split("\n").slice(-30).join("\n"));
      console.log(`E2E TOTAL: build failed (${cmd} ${cmdArgs.join(" ")}); nothing was run`);
      process.exit(1);
    }
  }

  const times: Record<string, number> = {};
  const tests: Record<string, number> = {};
  const results: Result[] = [];
  const line = (o: Map<TestKey, Outcome>): string => {
    const n = (x: Outcome): number => [...o.values()].filter((v) => v === x).length;
    return `${n("passed")} passed, ${n("failed")} failed, ${n("skipped")} skipped${n("notRun") ? `, ${n("notRun")} did not run` : ""}`;
  };
  const runUnit = async (u: Unit): Promise<Result> => {
    const started = performance.now();
    const r = await runPlaywright(u, u.files, "", args.rest);
    Object.assign(times, r.times.files);
    Object.assign(tests, r.times.tests);
    const s = settle(given(u), r);
    const res: Result = {
      unit: u,
      exit: r.exit,
      minutes: (performance.now() - started) / 60_000,
      outcomes: s.outcomes,
      errors: s.errors,
      loadSensitive: [],
    };
    const ok =
      s.errors.length === 0 && ![...s.outcomes.values()].some((o) => o === "failed" || o === "notRun");
    say(`${ok ? "ok  " : "FAIL"} ${u.name}: ${line(s.outcomes)} (${res.minutes.toFixed(1)} min)`);
    for (const e of s.errors) console.log(`       ${e}`);
    return res;
  };

  if (quiet.length > 0) {
    say(`quiet files, ${args.quietJobs} at a time: ${quiet.map((u) => u.name).join(", ")}`);
    results.push(...(await pool(quiet, args.quietJobs, runUnit)));
  }
  if (loud.length > 0) {
    say(`${loud.length} loud units, ${jobs} at a time`);
    results.push(...(await pool(loud, jobs, runUnit)));
  }

  // Tests that failed or could not run beside other suites: their whole files once more, alone (a serial file's
  // tests depend on the ones before them). The alone outcome is the one that counts.
  const fileOf = (k: TestKey): string => k.split(" › ")[1] as string;
  for (const r of results) {
    if (r.unit.quiet) continue;
    const bad = [...r.outcomes].filter(([, o]) => o === "failed" || o === "notRun").map(([k]) => k);
    if (bad.length === 0 && r.errors.length === 0) continue;
    const files = new Set(bad.map(fileOf));
    // An error outside the tests with nothing failed (a teardown, an exit code): every file, alone.
    if (files.size === 0) for (const t of given(r.unit)) files.add(t.file);
    say(`again, alone: ${r.unit.name} (${bad.length} failed or not run beside other suites)`);
    const again = await runPlaywright(r.unit, [...files], ".alone", args.rest);
    const expected = given(r.unit).filter((t) => files.has(t.file));
    const m = merge({ outcomes: r.outcomes, errors: r.errors }, settle(expected, again), files, fileOf);
    r.outcomes = m.outcomes;
    r.errors = m.errors;
    r.loadSensitive = m.loadSensitive;
    r.exit = again.exit;
    const ok =
      m.errors.length === 0 && ![...m.outcomes.values()].some((o) => o === "failed" || o === "notRun");
    say(`${ok ? "ok  " : "FAIL"} ${r.unit.name} alone: ${line(settle(expected, again).outcomes)}`);
    for (const e of m.errors) console.log(`       ${e}`);
  }

  // Durations: this run's measurements over the previous ones.
  const projectMinutes: Record<string, number> = {};
  for (const [key, s] of Object.entries(times)) {
    const p = key.split(" › ")[0] as string;
    projectMinutes[p] = (projectMinutes[p] ?? 0) + s / 60;
  }
  const next: Durations = {
    generated: new Date().toISOString(),
    projects: {
      ...durations.projects,
      ...Object.fromEntries(Object.entries(projectMinutes).map(([k, v]) => [k, Number(v.toFixed(2))])),
    },
    files: {
      ...durations.files,
      ...Object.fromEntries(Object.entries(times).map(([k, v]) => [k, Number(v.toFixed(1))])),
    },
    tests: {
      ...durations.tests,
      ...Object.fromEntries(Object.entries(tests).map(([k, v]) => [k, Number(v.toFixed(1))])),
    },
  };
  writeFileSync(where.durations, `${JSON.stringify(next, null, 1)}\n`);

  console.log("");
  console.log("Units (wall minutes):");
  for (const r of [...results].sort((a, b) => b.minutes - a.minutes))
    console.log(`  ${r.minutes.toFixed(1).padStart(5)}  ${r.unit.name}`);
  console.log("Slowest ten files (seconds of test time, this run):");
  for (const [k, v] of Object.entries(times)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10))
    console.log(`  ${v.toFixed(0).padStart(5)}  ${k}`);

  const over = Object.entries(tests).filter(([, v]) => v > TEST_CEILING_S);
  if (over.length > 0) {
    console.log(`Tests over ${TEST_CEILING_S} s (split them, or start them from a seed): ${over.length}`);
    for (const [k, v] of over.sort((a, b) => b[1] - a[1])) console.log(`  ${v.toFixed(0).padStart(5)}  ${k}`);
  }

  // Every listed test, once, with its final outcome; then the counts per project, which must add up to the listing.
  const final = new Map<TestKey, Outcome>();
  for (const r of results) for (const [k, o] of r.outcomes) final.set(k, o);
  const wantedListed = listed.filter((t) => wanted.has(t.project));
  for (const t of wantedListed) if (!final.has(t.key)) final.set(t.key, "notRun");
  const byOutcome = (o: Outcome): TestKey[] => [...final].filter(([, v]) => v === o).map(([k]) => k);
  const rows = tally(final);
  console.log("Per project (listed = passed + failed + flaky + skipped + did not run):");
  const listedOf = (p: string): number => wantedListed.filter((t) => t.project === p).length;
  let mismatch = false;
  for (const [p, row] of [...rows].sort((a, b) => a[0].localeCompare(b[0]))) {
    const sum = OUTCOMES.reduce((s, o) => s + row[o], 0);
    if (sum !== listedOf(p)) mismatch = true;
    console.log(
      `  ${p.padEnd(18)} listed ${String(listedOf(p)).padStart(4)}  ${OUTCOMES.map((o) => `${o === "notRun" ? "did not run" : o} ${row[o]}`).join(", ")}${sum !== listedOf(p) ? `  (adds up to ${sum}: tests not in the listing ran)` : ""}`,
    );
  }
  const totalOf = (o: Outcome): number => [...rows.values()].reduce((s, r) => s + r[o], 0);
  const sumAll = OUTCOMES.reduce((s, o) => s + totalOf(o), 0);
  if (sumAll !== wantedListed.length) mismatch = true;

  const failedUnits = results.filter((r) => r.errors.length > 0);
  for (const r of failedUnits) {
    console.log(
      `FAILED ${r.unit.name} outside its tests (log ${relative(root, where.logs)}/${r.unit.name}.log):`,
    );
    for (const e of r.errors) console.log(`  ✘ ${e}`);
  }
  const failed = byOutcome("failed");
  if (failed.length > 0) {
    console.log(`Failed: ${failed.length}`);
    for (const k of failed) console.log(`  ✘ ${k}`);
  }
  const notRun = byOutcome("notRun");
  if (notRun.length > 0) {
    console.log(`Did not run (listed, never ran): ${notRun.length}`);
    for (const k of notRun) console.log(`  ∅ ${k}`);
  }
  const skipped = byOutcome("skipped");
  if (skipped.length > 0) {
    console.log(`Skipped by the spec itself (test.skip / test.fixme): ${skipped.length}`);
    for (const k of skipped) console.log(`  - ${k}`);
  }
  const sensitive = results.flatMap((r) => r.loadSensitive);
  // Still a failed run: the test is not to be trusted beside others until it is fixed or moved to QUIET with the
  // evidence (docs/design/wave5.md, Browser tests). Never hidden, never counted as a pass of the whole run.
  if (sensitive.length > 0) {
    console.log(
      `Load-sensitive (failed beside other suites, passed alone; the run fails): ${sensitive.length}`,
    );
    for (const t of sensitive) console.log(`  ~ ${t}`);
  }
  if (mismatch)
    console.log(`COUNTS DO NOT ADD UP: ${sumAll} outcomes for ${wantedListed.length} listed tests`);
  const total = `${wantedListed.length} listed: ${totalOf("passed")} passed, ${totalOf("failed")} failed, ${totalOf("flaky")} flaky, ${totalOf("skipped")} skipped, ${totalOf("notRun")} did not run`;
  console.log(
    `E2E TOTAL: ${total}; ${sensitive.length} load-sensitive; ${results.length} units in ${((performance.now() - t0) / 60_000).toFixed(1)} min (jobs ${jobs})`,
  );
  process.exit(
    failedUnits.length > 0 || failed.length > 0 || notRun.length > 0 || sensitive.length > 0 || mismatch
      ? 1
      : 0,
  );
}
