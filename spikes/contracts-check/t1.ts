import { run, notes, show, out, midi, nm } from "./h.ts";
const r = await run('n("0 2 4").scale("C4:major")');
out(JSON.stringify({ n: notes(r.ev), raw: r.ev.map(e=>e.v.note), err: r.err, logs: r.logs }));
const r2 = await run('setcpm(92/4)\n\ndrums: s("bd ~ sd ~")\nbass: note("c2 ~ g2 ~").s("ebass").lpf(700)\nmel: n("0 2 4 2").scale("C4:major").s("piano")');
out(show(r2.ev), r2.err, r2.cps, r2.tracks, JSON.stringify(r2.logs));
