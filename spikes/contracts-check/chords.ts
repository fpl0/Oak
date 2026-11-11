import { run, out, midi, pc, nm } from "./h.ts";
const syms = ["C","Cm","Co","Caug","C^7","C7","Cm7","Cm7b5","Co7","Cm6","C69","C6","C7b9","C7#9","C7#11","C7b13","C^9","Cm9","C9","C13","Cm11","C7alt","Csus","C7sus","C^7#11","Cm^7","CmM7","C-^7","C2","Cadd9","C5","Cmaj7","Cdim","Cdim7","Csus4","Csus2","C-","C-7","Ch7","Ch","CM7","CM","cm7","C^","Cm7#5","C7#5","C^7#5","C+","C/E","Bb7","F#m7b5","Ebo7","C^13","Cm69","C11","C9sus","C7b9sus","C13sus","C7#9#5","C7b9b5","C7b9#5","C7#9b5","C13#11","C9#11","C13b9","C7b9#9","C^9#11","Cm13","Cm7b9","Co^7","Cmb6","Cm#5","Ch9","C^#5"];
const dicts = ["(default)","ireal","ireal-ext","triads","lefthand","guidetones","legacy"];
const rows: string[] = [];
rows.push(["symbol", ...dicts].join(" | "));
for (const s of syms) {
  const cells: string[] = [];
  for (const d of dicts) {
    const code = d === "(default)" ? `chord("${s}").voicing()` : `chord("${s}").dict("${d}").voicing()`;
    const r = await run(code);
    if (r.err) { cells.push("ERR:" + r.err.slice(0, 40)); continue; }
    const ms = r.ev.map((e) => midi(e.v)).filter((m) => m != null) as number[];
    cells.push(ms.length ? `${ms.length}:${ms.sort((a,b)=>a-b).map(nm).join(",")}` : "—" + (r.logs.length ? "(log)" : ""));
  }
  rows.push([s, ...cells].join(" | "));
}
out(rows.join("\n"));
const r = await run('chord("Cmaj7").voicing()'); out("LOG Cmaj7:", JSON.stringify(r.logs));
const r2 = await run('chord("C").dict("lefthand").voicing()'); out("LOG C lefthand:", JSON.stringify(r2.logs));
