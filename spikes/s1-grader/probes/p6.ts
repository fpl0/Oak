import { GraderHost, type HostMode } from "../host.ts";
const mode = (process.argv[2] ?? "worker") as HostMode;
const t0 = performance.now();
const host = new GraderHost({ mode, timeoutMs: 1500, allowProbe: true });
const ready = await host.ready();
console.log("rss MB at start", (process.memoryUsage().rss / 1e6).toFixed(0));
console.log(mode, "cold start ms", (performance.now() - t0).toFixed(1), "initMs(in-realm)", ready.initMs.toFixed(1), "lockdown", JSON.stringify(ready.lockdown));
let t = performance.now();
console.log("ping", JSON.stringify(await host.request({ kind: "ping" })), (performance.now() - t).toFixed(2), "ms");
t = performance.now();
const r = await host.analyze('drums: s("bd*4")\nmel: n("0 2 4").scale("C4:major")', { bars: 2 });
console.log("first analyze roundtrip ms", (performance.now() - t).toFixed(2), "in-worker ms", r.ms.toFixed(2), r.ok, r.ok && (r.result as any).events.length);
const cpu0 = process.cpuUsage();
t = performance.now();
const loop = await host.analyze('while(true){}\ns("bd")', {});
console.log("while(true):", JSON.stringify(loop), "wall", (performance.now() - t).toFixed(1), "killMs", host.stats.killMs.map((x) => x.toFixed(1)));
t = performance.now();
const next = await host.analyze('s("bd sd")', {});
console.log("next request after kill: ok", next.ok, "roundtrip ms (includes respawn wait)", (performance.now() - t).toFixed(1));
// is the old thread still burning CPU?
const c1 = process.cpuUsage(); await new Promise((r) => setTimeout(r, 500)); const c2 = process.cpuUsage(c1);
console.log("cpu during 500ms idle after kill: user ms", (c2.user / 1000).toFixed(1), "system ms", (c2.system / 1000).toFixed(1));
t = performance.now();
const big = await host.analyze('s("bd*1000000")', {});
console.log("bd*1000000:", JSON.stringify(big.ok ? "OK?!" : big.error), (performance.now() - t).toFixed(1), "ms");
t = performance.now();
const big2 = await host.analyze('s("bd*1000000")', { fuel: 1e12 });
console.log("bd*1000000 with fuel disabled:", JSON.stringify(big2.ok ? "OK?!" : big2.error), (performance.now() - t).toFixed(1), "ms", "rss MB", (process.memoryUsage().rss / 1e6).toFixed(0));
const after = await host.analyze('s("bd sd")', {});
Bun.gc(true); await new Promise((r) => setTimeout(r, 300)); console.log("rss MB after kill + gc", (process.memoryUsage().rss / 1e6).toFixed(0));
// async loop that never yields to the macrotask queue
t = performance.now();
const micro = await host.analyze('const f = async () => { while (true) { await null } }\nawait f()\ns("bd")', {});
console.log("microtask loop:", JSON.stringify(micro.ok ? "OK?!" : micro.error), (performance.now() - t).toFixed(1), "ms");
// 20 consecutive kills
const walls: number[] = [];
for (let i = 0; i < 20; i++) { const a = performance.now(); const k = await host.analyze('for(;;){}\ns("bd")', { timeoutMs: 300 }); if (k.ok || k.error.kind !== "timeout") throw new Error("not killed"); const ok = await host.analyze('s("bd")', {}); if (!ok.ok) throw new Error("not recovered " + JSON.stringify(ok)); walls.push(performance.now() - a); }
console.log("20x (300ms-timeout kill + next request): wall ms min/max", Math.min(...walls).toFixed(0), Math.max(...walls).toFixed(0));
console.log("after:", after.ok, "stats", JSON.stringify(host.stats, (k, v) => (typeof v === "number" ? Math.round(v * 10) / 10 : v)));
await host.dispose();
console.log("disposed");
