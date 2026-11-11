import { GraderHost, type HostMode } from "../host.ts";
for (const mode of ["worker", "subprocess"] as HostMode[]) {
  const host = new GraderHost({ mode, allowProbe: true, lockdown: false });
  await host.ready();
  const p = async (label: string, code: string, o = {}) => { const r = await host.request({ kind: "probe", code, transpile: false, ...o }); console.log(mode, "nolock", label, "=>", r.ok ? JSON.stringify(r.result) : "THROWS " + r.error.kind + ": " + r.error.message.slice(0, 120)); };
  await p("[shadow] Function ctor escape", `return (()=>{}).constructor('return typeof Bun + "," + typeof process')()`);
  await p("[shadow] ShadowRealm via Function ctor", `return (()=>{}).constructor('return typeof ShadowRealm')()`);
  await p("[shadow] native SyntaxError kept", `return String(SyntaxError).includes('[native code]')`);
  const r1 = await host.analyze("Promise.reject(new Error('late rejection'))\ns('bd')", {});
  console.log(mode, "unhandled rejection request:", r1.ok ? "ok " + (r1.result as any).events.length : JSON.stringify(r1.error));
  await new Promise((r) => setTimeout(r, 200));
  const r2 = await host.analyze("s('bd sd')", {});
  console.log(mode, "next:", r2.ok ? "ok" : JSON.stringify(r2.error), "stats", JSON.stringify({ spawns: host.stats.spawns, kills: host.stats.kills, crashes: host.stats.crashes }));
  const r3 = await host.analyze("s('bd sd')", {});
  console.log(mode, "next2:", r3.ok ? "ok" : JSON.stringify(r3.error), "stats", JSON.stringify({ spawns: host.stats.spawns, kills: host.stats.kills, crashes: host.stats.crashes }));
  await host.dispose();
}
