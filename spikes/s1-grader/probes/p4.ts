import { evaluateCode, initRealm, __internals } from "../runtime.ts";
await initRealm();
const { core } = __internals;
const q = async (code: string, bars = 1) => {
  const ev = await evaluateCode(code);
  const haps = ev.pattern.queryArc(0, bars).filter((h: any) => h.hasOnset());
  console.log(">>>", code);
  for (const h of haps) console.log("   ", h.whole.begin.toFraction(), h.whole.end.toFraction(), JSON.stringify(h.value), JSON.stringify(h.context));
  return haps;
};
await q('note("c4 e4").transpose("x")');
await q('arrange([2, note("<c d>")],[2, note("<e f g a>")])', 4);
await q('n("0 2").scale("C4:major")');
await q('chord("<C>").voicing()');
await q('drums: s("bd").bank("RolandTR909")');
const h = (await q('note("c4")'))[0];
console.log("hap keys", Object.keys(h), "whole keys", Object.keys(h.whole), "begin type", h.whole.begin.constructor.name, typeof h.whole.begin.n, "show:", h.show?.(), "hap.show(true)", h.show?.(true));
console.log("JSON.stringify(hap) throws?"); try { console.log(JSON.stringify(h).slice(0,200)); } catch (e: any) { console.log("  yes:", e.message); }
// logger dedupe proof
const seen: string[] = []; const orig = console.log; console.log = (...a: any[]) => seen.push(String(a[0]));
core.logger("[voicing]: same"); core.logger("[voicing]: same"); core.logger("[x] other"); core.logger("[voicing]: same");
console.log = orig; console.log("logger dedupe:", JSON.stringify(seen));
console.log("typeof document", typeof (globalThis as any).document, "CustomEvent", typeof CustomEvent);
