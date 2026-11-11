// spawns a subprocess-mode host, gets its child stuck in an infinite loop, then waits to be SIGKILLed
import { GraderHost } from "../host.ts";
const host = new GraderHost({ mode: "subprocess", timeoutMs: 60_000, allowProbe: true });
await host.ready();
const pid = await host.request({ kind: "probe", code: "return process.pid", shadow: false, transpile: false });
console.log("CHILD", pid.ok && pid.result);
void host.analyze("for (;;) {}\ns('bd')");
await new Promise((r) => setTimeout(r, 60_000));
