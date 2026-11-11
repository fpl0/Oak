import { analyze, initRealm } from "../runtime.ts";
const info = await initRealm();
console.log("init", JSON.stringify(info));
const show = async (code: string, bars = 1) => {
  try {
    const r = await analyze(code, { bars });
    console.log("\n>>>", code.replace(/\n/g, " ⏎ "));
    console.log("  cps", r.cps, r.cpsSet, "tracks", r.tracks, "logs", JSON.stringify(r.logs), "diag", JSON.stringify(r.diagnostics));
    for (const e of r.events) console.log("  ", JSON.stringify(e));
    return r;
  } catch (e: any) {
    console.log("\n>>>", code.replace(/\n/g, " ⏎ "), "\n  ERROR", e.kind, e.message, JSON.stringify(e.logs));
  }
};
await show('n("0 2 4").scale("C4:major")');
await show('drums: s("bd sd")\nbass: note("c2 e2")');
await show('$: s("bd")\n$: s("hh*2")\n_$: s("cp")\n_x: s("rim")\ny_: s("rim")');
await show('$: s("bd")\nS$: s("hh*2")\nSolo: s("cp")\nS: s("rim")');
await show('note("c e4 60 c#5 eb2")');
await show('note(60)');
await show('"c4 e4"');
await show('freq("440 220")');
await show('n("0 1 2")');
await show('s("bd:3 sd").n(2)');
await show('s("bd sd").bank("RolandTR909")');
await show('note("c4 [e4")');
await show('note("c4").foo()');
await show('note("c4").fmap(x => { throw new Error("boom") })');
await show('const x = 1');
await show('42');
await show('setcpm(120/4)\nnote("c4")');
await show('setcps("0.75")\nnote("c4").pianoroll()._scope().punchcard().color("red")');
await show('all(x => x.fast(2))\ndrums: s("bd")\nmel: note("c4")');
await show('slider(0.5, 0, 1).fmap(x => x)');
