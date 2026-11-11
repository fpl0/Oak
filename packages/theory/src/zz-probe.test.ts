import { test } from "bun:test";
import { evalHeadless } from "@oak/grader/testing";

const pcs = (ms: (number | null)[]) => [...new Set(ms.filter((m): m is number => m != null).map((m) => ((m % 12) + 12) % 12))].sort((a, b) => a - b).join(",");
test("probe", async () => {
  for (const suf of ["-6", "-9", "-11", "M9", "M7#11", "-7b5", "M", "^", "h", "h7", "-^7", "mM7", "sus4", "maj7", "7sus4", "add9", "2", "6/9", "+", "M6", "alt", "7alt", "m^7", "o", "aug", "5"]) {
    for (const d of ["ireal", "triads", "lefthand"]) {
      try {
        const r = await evalHeadless(`chord("C${suf}").dict("${d}").voicing()`);
        console.log(suf, d, pcs(r.events.map((e) => e.midi)) || "—");
      } catch (e) {
        console.log(suf, d, "ERR", String(e).slice(0, 60));
      }
    }
  }
  for (const sc of ["eb4:major", "Eb4:major", "A3:harmonic:minor", "A3:melodic:minor", "C4:major:pentatonic", "C4:minor:pentatonic", "C4:blues", "C4:aeolian", "C4:ionian", "C4:dorian", "C4:phrygian", "C4:lydian", "C4:mixolydian", "C4:locrian", "C:minor", "C4:altered", "C4:lydian:dominant", "C4:bebop", "C4:bebop:major", "C4:pentatonic", "C4:minor:blues", "ef4:major", "F#4:major", "Cb4:major"]) {
    try {
      const r = await evalHeadless(`n("0 1 2 3 4 5 6 7 8 -1 -2 3# 6b 2b 7b 3## 0s 1f").scale("${sc}")`);
      console.log(sc, "|", r.events.map((e) => e.midi).join(" "), "|", r.events[0]?.scale, "|", r.events.map((e) => e.note).join(" "), r.logs.slice(0,1).join(";"));
    } catch (e) {
      console.log(sc, "ERR", String(e).slice(0, 80));
    }
  }
  for (const p of ["bd(3,8)", "bd(5,8)", "bd(3,8,2)", "bd(5,16)", "bd(7,16,3)", "bd(2,5)", "bd(4,9)", "bd(-3,8)", "bd(3,8,-1)", "bd(0,8)", "bd(8,8)", "bd(9,8)"]) {
    try {
      const r = await evalHeadless(`s("${p}")`);
      console.log(p, r.events.map((e) => e.begin).join(" "));
    } catch (e) { console.log(p, "ERR", String(e).slice(0, 80)); }
  }
  for (const nn of ["cs4", "ef4", "f4", "ff4", "c", "bb3", "bf3", "b", "cs#4", "c##4", "c###4", "cb-1", "c10", "E#5", "Bs3", "Fb4"]) {
    const r = await evalHeadless(`note("${nn}")`);
    console.log(nn, r.events.map((e) => e.midi).join(" "));
  }
  const r = await evalHeadless(`n("1.5 2.2 -0.5").scale("C4:major")`);
  console.log("fractional", r.events.map((e) => e.midi).join(" "));
});
