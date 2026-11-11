import { GraderHost, type HostMode } from "../host.ts";
const mode = (process.argv[2] ?? "subprocess") as HostMode;
const N = Number(process.argv[3] ?? 150);
const host = new GraderHost({ mode });
await host.ready();
let bad = 0;
for (let i = 0; i < N; i++) {
  const dead = await host.analyze("for (;;) {}\ns('bd')", { timeoutMs: 50 });
  const alive = await host.analyze("s('bd')", { bars: 1 });
  if (dead.ok || dead.error.kind !== "timeout" || !alive.ok) { bad++; console.log(i, "dead:", JSON.stringify(dead.ok ? "OK" : dead.error), "alive:", JSON.stringify(alive.ok ? "ok" : alive.error)); }
}
console.log(mode, "iterations", N, "bad", bad, "stats", JSON.stringify({ spawns: host.stats.spawns, kills: host.stats.kills, crashes: host.stats.crashes, spawnMax: Math.max(...host.stats.spawnMs).toFixed(0), killMax: Math.max(...host.stats.killMs).toFixed(0) }));
await host.dispose();
