import { analyze, initRealm } from "../runtime.ts";
const t0 = performance.now(); await initRealm(); console.log("init ms", (performance.now() - t0).toFixed(1));
const lesson = 'drums: s("bd*4, hh*8").bank("RolandTR909")\nchords: chord("<C Am F G>").voicing()\nmel: n("0 2 4 <6 7>").scale("C4:major")';
for (const [code, bars] of [[lesson, 8], [lesson, 64], ['s("bd*16, hh*32, sd*8").swingBy(1/3,4).every(4, x=>x.fast(2))', 64], ['note("c4*16").ply(8).jux(rev).off(1/8, x=>x.add(note(7)))', 64], ['arrange([8, s("bd*4, hh*8")],[8, chord("<C Am F G>").voicing()])', 128], ['s("bd*1000")', 4]] as [string, number][]) {
  const t = performance.now();
  try { const r = await analyze(code, { bars, hapCap: 1e9, fuel: 1e12 }); console.log("OK", r.events.length, "events", r.fuelUsed, "fuel", (r.fuelUsed / r.events.length).toFixed(0), "fuel/event", (performance.now() - t).toFixed(1), "ms", (r.fuelUsed / (performance.now() - t) / 1000).toFixed(0), "kfuel/ms ::", code.slice(0, 60), bars); }
  catch (e: any) { console.log("ERR", e.kind, e.message); }
}
for (const code of ['s("bd*100000")', 's("bd*1000000")', 's("bd*4").fast(1000000)', 's("bd*10000000")', 'note("c4*16").ply(1000).ply(100)', 's("bd").fast(1e12)', 's("bd*4").segment(1e9)', '"~ bd*1000000"', 'chord("C").voicing().fast(1e7)', 's("bd").struct("x*1000000")', 's("bd").euclid(999999,1000000)', 'n(irand(8).segment(1e7)).scale("C:major")']) {
  const t = performance.now();
  try { const r = await analyze(code, { bars: 4, hapCap: 20000 }); console.log(code, "OK", r.events.length, (performance.now() - t).toFixed(1), "ms"); }
  catch (e: any) { console.log(code, "ERR", e.kind, e.message, (performance.now() - t).toFixed(1), "ms", "rss MB", (process.memoryUsage().rss / 1e6).toFixed(0)); }
}
const lat: number[] = [];
for (let i = 0; i < 200; i++) { const t = performance.now(); await analyze(lesson, { bars: 8 }); lat.push(performance.now() - t); }
lat.sort((a, b) => a - b);
console.log("analyze x200 8 bars: p50", lat[100].toFixed(2), "p95", lat[190].toFixed(2), "max", lat[199].toFixed(2));
