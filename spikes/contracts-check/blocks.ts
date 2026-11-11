import { run, out, midi, nm } from "./h.ts";
import { readFileSync } from "node:fs";
for (const f of ["content/STYLE.md", "content/AUTHORING.md"]) {
  const src = readFileSync(new URL("../../" + f, import.meta.url), "utf8");
  const re = /```(js|js bad)\n([\s\S]*?)```/g; let m; let i = 0;
  while ((m = re.exec(src))) {
    i++; const bad = m[1] === "js bad"; const code = m[2];
    const line = src.slice(0, m.index).split("\n").length;
    if (!bad) {
      const r = await run(code, 0, 16);
      const per: Record<string, number> = {}; for (const e of r.ev) per[e.track] = (per[e.track] ?? 0) + 1;
      out(`${f}:${line} OK-block #${i}: err=${r.err} tracks=${JSON.stringify(per)} cps=${r.cps.toFixed(4)} logs=${JSON.stringify(r.logs)}`);
    } else {
      for (const ln of code.split("\n").filter((l) => l.trim())) {
        const stmt = ln.replace(/\s+\/\/.*$/, "");
        const r = await run(stmt, 0, 4);
        const ns = r.ev.slice(0, 12).map((e) => { const mm = midi(e.v); return `${e.b}:${mm == null ? (e.v?.s ?? JSON.stringify(e.v)) : nm(mm)}`; }).join(" ");
        out(`${f}:${line} BAD: ${stmt}\n      -> err=${r.err} n=${r.ev.length} [${ns}] logs=${JSON.stringify(r.logs.map(l => l.replace(/%c|background-color.*$/g, "").trim()))}`);
      }
    }
  }
}
// AUTHORING ts skeleton code strings
const a = readFileSync(new URL("../../content/AUTHORING.md", import.meta.url), "utf8");
const strs = [...a.matchAll(/code: '((?:[^'\\]|\\.)*)'/g), ...a.matchAll(/starter: '((?:[^'\\]|\\.)*)'/g), ...a.matchAll(/solutions: \['((?:[^'\\]|\\.)*)'\]/g)].map((m) => m[1].replace(/\\n/g, "\n").replace(/[⟪⟫]/g, ""));
for (const s of strs) { const r = await run(s, 0, 2); out(`AUTHORING str: ${JSON.stringify(s)} -> err=${r.err} n=${r.ev.length} logs=${JSON.stringify(r.logs)}`); }
const r = await run(`hats: s("hh*16").velocity("1 .35 .6 .35").gain(.7)`); out("hh*16 velocity 4-pattern:", r.ev.map((e) => e.v.velocity).join(" "));
const r2 = await run(`hats: s("hh*16").velocity("[1 .35 .6 .35]*4").gain(.7)`); out("hh*16 velocity [..]*4:", r2.ev.map((e) => e.v.velocity).join(" "));
