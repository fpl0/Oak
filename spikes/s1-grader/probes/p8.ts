import { initRealm, __internals, shadowedGlobals } from "../runtime.ts";
await initRealm();
const keys = Object.keys(__internals.core.strudelScope);
console.log("suspicious strudel scope names:", keys.filter((k) => /fetch|load|window|worker|socket|osc|serial|storage|eval|repl|clock|cyclist|time|scope|trigger|log|key|speak|hash|register|worklet|kabel|gamepad|mouse|device|motion|sensor/i.test(k)).join(" "));
console.log("shadow list (", shadowedGlobals().length, "):", shadowedGlobals().join(" "));
// ShadowRealm
try { const sr = new (globalThis as any).ShadowRealm(); console.log("ShadowRealm.evaluate typeof Bun/process/fetch:", sr.evaluate("[typeof Bun, typeof process, typeof fetch, typeof Function].join(',')")); console.log("ShadowRealm Function ctor works:", sr.evaluate("(()=>{}).constructor('return 6*7')()"));
  const read = await sr.importValue("node:fs", "readFileSync"); console.log("ShadowRealm.importValue('node:fs','readFileSync') ->", typeof read, String(read(new URL("./canary.txt", import.meta.url).pathname, "utf8")).trim()); } catch (e: any) { console.log("ShadowRealm error:", e.message); }
