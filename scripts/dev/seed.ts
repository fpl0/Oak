// Dev seeding from the command line: fast-forwards the learner on a running dev server (OAK_DEV=1) and moves
// its clock. A thin client of `POST /api/dev/seed` and `PUT /api/dev/clock` (server/src/services/dev-seed.ts).
//
//   bun scripts/dev/seed.ts --port 8801 "after U01.L03"
//   bun scripts/dev/seed.ts --port 8801 "C0 ready" --target 15
//   bun scripts/dev/seed.ts --port 8801 "after U01.L03" --gap 10
//   bun scripts/dev/seed.ts --port 8801 --points            (list the named points)
//   bun scripts/dev/seed.ts --port 8801 --clock +1d         (tomorrow; also +3h, -2d, an ISO instant, "reset")
//
// From a Playwright spec, call the API directly (same headers):
//   await request.post(`${apiURL}/api/dev/seed`, { headers: { "x-oak": "1", origin: apiURL }, data: { point: "C0 ready" } });

export interface SeedArgs {
  port: number;
  point: string | null;
  gapDays: number | null;
  target: 15 | 20 | 25 | null;
  points: boolean;
  clock: string | null;
  practice: boolean;
}

export function parseArgs(argv: readonly string[]): SeedArgs {
  const out: SeedArgs = {
    port: 8787,
    point: null,
    gapDays: null,
    target: null,
    points: false,
    clock: null,
    practice: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--port") out.port = Number(next());
    else if (a === "--gap") out.gapDays = Number(next());
    else if (a === "--target") {
      const t = Number(next());
      if (t !== 15 && t !== 20 && t !== 25) throw new Error("--target is 15, 20 or 25");
      out.target = t;
    } else if (a === "--points") out.points = true;
    else if (a === "--clock") out.clock = next();
    else if (a === "--no-practice") out.practice = false;
    else if (a.startsWith("--")) throw new Error(`unknown flag ${a}`);
    else out.point = out.point === null ? a : `${out.point} ${a}`;
  }
  if (!Number.isInteger(out.port) || out.port <= 0) throw new Error("--port must be a port number");
  return out;
}

/** `+1d`, `-2d`, `+3h`, `+90m`, an ISO instant or `reset` → the body of `PUT /api/dev/clock`. */
export function clockBody(spec: string): Record<string, unknown> {
  if (spec === "reset") return { reset: true };
  const m = /^([+-]\d+)([dhm])$/.exec(spec);
  if (m !== null) {
    const n = Number(m[1]);
    return m[2] === "d" ? { advanceDays: n } : { advanceMs: n * (m[2] === "h" ? 3_600_000 : 60_000) };
  }
  if (Number.isFinite(Date.parse(spec))) return { at: new Date(spec).toISOString() };
  throw new Error(`--clock takes +1d, -2d, +3h, +90m, an ISO instant or reset (got ${spec})`);
}

async function call(port: number, method: string, path: string, body?: unknown): Promise<unknown> {
  const origin = `http://127.0.0.1:${port}`;
  const res = await fetch(`${origin}/api${path}`, {
    method,
    headers: { "x-oak": "1", origin, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} /api${path} → ${res.status} ${text}`);
  return JSON.parse(text);
}

if (import.meta.main) {
  try {
    const args = parseArgs(Bun.argv.slice(2));
    if (args.points) console.log(JSON.stringify(await call(args.port, "GET", "/dev/seed"), null, 2));
    if (args.point !== null)
      console.log(
        JSON.stringify(
          await call(args.port, "POST", "/dev/seed", {
            point: args.point,
            practice: args.practice,
            ...(args.gapDays === null ? {} : { gapDays: args.gapDays }),
            ...(args.target === null ? {} : { targetMinutes: args.target }),
          }),
          null,
          2,
        ),
      );
    if (args.clock !== null)
      console.log(JSON.stringify(await call(args.port, "PUT", "/dev/clock", clockBody(args.clock))));
    if (!args.points && args.point === null && args.clock === null)
      console.log(JSON.stringify(await call(args.port, "GET", "/dev/clock")));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}
