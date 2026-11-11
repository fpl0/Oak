import { out, run, show } from "./h.ts";
const r = await run(`setcpm(92/4)

drums: s("bd ~ sd ~, hh*8").bank("RolandTR808").gain(.8)
bass: note("<c2 a1 f1 g1>").s("ebass").lpf(800)
chords: chord("<C Am F G>").voicing().s("rhodes").gain(.5)
mel: n("<[4 ~ 2 4] [0 ~ ~ 2] [5 ~ 3 5] [4 ~ ~ ~]>").scale("C4:major").s("piano")`, 4);
out(r.err, r.logs, r.bpmOver, r.tracks);
out(show(r.ev, 4));
