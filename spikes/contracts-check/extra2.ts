import { run, out, midi, nm, show } from "./h.ts";
const V = (r: any) => r.ev.map((e: any) => `${e.b}:${nm(midi(e.v)!)}(${e.ctx?.scale ?? ""})`).join(" ");
let r = await run(`const melVerse = n("<[0 2 4 2] [4 2 1 ~]>")\nconst melChorus = n("<[7 6 4 2] [4 ~ 2 ~]>")\nmel: arrange([4, melVerse], [4, melChorus], [4, melChorus]).scale("<C4:major!8 D4:major!4>").s("piano")`, 7, 9);
out("key plan bars 8-9:", V(r));
r = await run(`n("0 .. 7").chord("C").voicing()`); out("n 0..7 over C voicing:", r.ev.map((e: any) => nm(midi(e.v)!)).join(" "));
r = await run(`n("0 1 2 3").chord("<C Am>").voicing()`, 0, 2); out("n first two bars:", r.ev.map((e: any) => `${e.b}:${nm(midi(e.v)!)}`).join(" "));
r = await run(`s("hh ~ hh hh")`); out("hh ~ hh hh:", r.ev.map((e: any) => e.b).join(" "));
r = await run(`n("4 3 2 1 0").scale("C4:major")`); out("5 4 3 2 1:", r.ev.map((e: any) => nm(midi(e.v)!)).join(" "));
