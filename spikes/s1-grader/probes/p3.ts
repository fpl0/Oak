import { analyze, initRealm } from "../runtime.ts";
await initRealm();
const brief = (e: any) => `${e.begin}-${e.end} ${e.note ?? ""}${e.midi != null ? "(" + e.midi + ")" : ""}${e.s ? " s=" + e.s : ""}${e.n != null ? " n=" + e.n : ""}${e.bank ? " bank=" + e.bank : ""}`;
const show = async (code: string, bars = 1, full = false) => {
  try {
    const r = await analyze(code, { bars });
    console.log("\n>>>", code.replace(/\n/g, " ⏎ "), `[bars=${bars}] cps=${r.cps}`);
    if (r.logs.length) console.log("  logs", JSON.stringify(r.logs));
    if (r.diagnostics.length) console.log("  diag", JSON.stringify(r.diagnostics));
    if (full) for (const e of r.events) console.log("  ", JSON.stringify(e));
    else console.log("  ", r.events.map(brief).join(" | "));
    return r;
  } catch (e: any) {
    console.log("\n>>>", code.replace(/\n/g, " ⏎ "), "\n  ERROR", e.kind, e.message, JSON.stringify(e.logs));
  }
};
console.log("===== (a) voicing");
await show('chord("<C Am F G>").voicing()', 4);
await show('chord("<Cmaj7 Cdim c am>").voicing()', 4);
await show('chord("<C^7 Am7 Dm7 G7>").voicing()', 4);
await show('chord("<C Am F G>").dict("triads").voicing()', 4);
await show('n("0 1 2 3").chord("<C Am>").voicing()', 2);
const syms = ["C", "Cm", "C-", "Co", "Caug", "C+", "C^7", "C7", "Cm7", "C-7", "Cm7b5", "Ch7", "Co7", "CM7", "CM", "Cmaj7", "Cdim", "C6", "Csus4", "C9", "Cm9", "C^9"];
const dicts = ["ireal", "triads", "lefthand", "guidetones", "legacy", "ireal-ext"];
const table: Record<string, Record<string, string>> = {};
for (const sym of syms) {
  table[sym] = {};
  for (const d of dicts) {
    const code = d === "ireal" ? `chord('${sym}').voicing()` : `chord('${sym}').dict('${d}').voicing()`;
    try {
      const r = await analyze(code, { bars: 1 });
      table[sym][d] = r.events.length ? r.events.map((e) => e.note).join(" ") : "SILENT" + (r.logs.length ? " +log" : " NOLOG");
    } catch (e: any) { table[sym][d] = "ERR " + e.message.slice(0, 60); }
  }
}
console.log(["sym", ...dicts].join("\t"));
for (const sym of syms) console.log([sym, ...dicts.map((d) => table[sym][d])].join("\t"));
console.log("===== (b) chromatic degrees");
await show('n("3#").scale("C4:major")');
await show('n("6b").scale("C4:major")');
await show('n("2b").scale("C4:major")');
await show('n("0 1 2 3 4 5 6 7 -1").scale("C4:major")');
await show('n("0# 3b 7# -1b").scale("C4:major")');
await show('n("0 2 4").scale("C:minor")');
await show('n("0 2 4").scale("<C:major A:minor>")', 2);
console.log("===== (c) bank"); await show('s("bd sd").bank("RolandTR909")', 1, true); await show('s("bd:3 hh:1")', 1, true);
console.log("===== (d) swing"); await show('s("hh*8").swingBy(1/3, 4)'); await show('s("hh*8").swing(4)'); await show('s("hh*8")');
console.log("===== (e) setcpm"); await show('setcpm(120/4)\ns("bd")'); await show('setcpm(90)\ns("bd")'); await show('setcps(1)\ns("bd")'); await show('setCpm(140/4)\ns("bd")'); await show('setcps("0.75")\ns("bd")');
await show('s("bd*4").cpm(60)', 1);
console.log("===== (f) transpose"); await show('note("c4 e4").transpose(2)'); await show('note("c4 e4").transpose("<0 12>")', 2); await show('note("60 64").transpose(2)'); await show('note("c4 e4").transpose("3M")');
await show('n("0 2 4").scale("C4:major").scaleTranspose(1)'); await show('n("0 2 4").scale("C4:major").scaleTranspose("<0 -2>")', 2); await show('note("c4 e4").scale("C:major").scaleTranspose(1)'); await show('note("c4 e4").scaleTranspose(1)');
await show('"x y".transpose(2)');
console.log("===== (g) arrange"); await show('arrange([2, note("c4")], [2, note("e4 g4")])', 5); await show('arrange([1, s("bd*2")], [3, s("hh")])', 4);
console.log("===== (h) locations");
const r = await show('note("c4 [e4 g4]").s("piano")', 1, true);
console.log("  miniLocations", JSON.stringify(r?.miniLocations), "widgets", JSON.stringify(r?.widgets));
const r2 = await show('note(`c4 e4`).add(note("<0 12>"))', 1, true);
console.log("  miniLocations", JSON.stringify(r2?.miniLocations));
console.log("===== (i) logs");
await show('note("c4 e4").transpose("x")');
await show('chord("<Cmaj7 Cmaj7>").voicing()', 2);
await show('chord("<Cmaj7 Cmaj7>").voicing()', 2);
await show('n("0 2").scale("C:notascale")');
await show('note("c4").log()');
await show('console.log("hi", 3)\nnote("c4")');
