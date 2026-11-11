// Adversarial music-theory review of the analyzers: real Strudel evaluated headlessly, compared with what a
// trained musician expects. Each `regression:` test failed before its fix.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { KeySpec } from "@oak/content-kit";
import { R, rat } from "@oak/content-kit";
import { strudel } from "./__support__/fixtures.ts";
import { cadenceAt, chordSlots, romanText, slotRomans } from "./chords.ts";
import { onsets } from "./events.ts";
import { claveType, euclidMatch, polyRatio } from "./groove.ts";
import { keyEstimate } from "./key.ts";
import { classifyNct, isStrong, melodyLine, scaleMembership } from "./melody.ts";
import { inferMeter, syncopation } from "./meter.ts";
import { straighten, swingRatio } from "./swing.ts";
import { selectTrack } from "./tracks.ts";

setDefaultTimeout(30_000);
const key = (tonic: string, mode: KeySpec["mode"] = "major"): KeySpec => ({ tonic, mode });

async function cadence(code: string, k: KeySpec, endBar: number, mel = "mel") {
  const n = await strudel(code, endBar);
  const melody = selectTrack(n, mel);
  return cadenceAt(chordSlots(selectTrack(n, "chords"), { bass: n.all }), melodyLine(melody), k, endBar);
}

describe("cadences", () => {
  test("regression: a Picardy third (V → I in A minor) is an authentic cadence", async () => {
    const code = 'chords: chord("<E A>").voicing()\nbass: note("<e2 a2>")\nmel: note("<b4 a4>")';
    expect(await cadence(code, key("A", "minor"), 2)).toBe("PAC");
  });
  test("minor V → i with the raised leading tone is PAC; iv → i is plagal", async () => {
    const code = 'chords: chord("<E7 Am>").voicing()\nbass: note("<e2 a2>")\nmel: note("<g#4 a4>")';
    expect(await cadence(code, key("A", "minor"), 2)).toBe("PAC");
    const pc = 'chords: chord("<Dm Am>").voicing()\nbass: note("<d2 a2>")\nmel: note("<f4 e4>")';
    expect(await cadence(pc, key("A", "minor"), 2)).toBe("PC");
  });
  test("regression: in a blues key the tonic is I7, so V7 → I7 cadences", async () => {
    const code = 'chords: chord("<G7 C7>").voicing()\nbass: note("<g2 c2>")\nmel: note("<d5 c5>")';
    expect(await cadence(code, key("C", "blues"), 2)).toBe("PAC");
  });
  test("regression: vii°7 → I is an imperfect authentic cadence", async () => {
    const code = 'chords: chord("<Bo7 C>").voicing()\nbass: note("<b2 c3>")\nmel: note("<d5 c5>")';
    expect(await cadence(code, key("C"), 2)).toBe("IAC");
  });
  test("regression: chords alone (no melody) can make a PAC; a hand voicing's top note is the soprano", async () => {
    const sym = 'chords: chord("<G C>").voicing()\nbass: note("<g2 c2>")';
    expect(await cadence(sym, key("C"), 2)).toBe("PAC");
    const handOnTonic = 'chords: note("<[g2,b3,d4,g4] [c3,c4,e4,c5]>")';
    expect(await cadence(handOnTonic, key("C"), 2)).toBe("PAC");
    const handOnThird = 'chords: note("<[g2,b3,d4,g4] [c3,c4,g4,e5]>")';
    expect(await cadence(handOnThird, key("C"), 2)).toBe("IAC");
  });
  test("inversions: V6 → I and V → I6 are IAC; ending on V (from a cadential 6-4) is HC", async () => {
    expect(
      await cadence(
        'chords: chord("<G C>").voicing()\nbass: note("<b2 c3>")\nmel: note("<d5 c5>")',
        key("C"),
        2,
      ),
    ).toBe("IAC");
    expect(
      await cadence(
        'chords: chord("<G C>").voicing()\nbass: note("<g2 e3>")\nmel: note("<d5 c5>")',
        key("C"),
        2,
      ),
    ).toBe("IAC");
    expect(
      await cadence(
        'chords: chord("<C G>").voicing()\nbass: note("<g2 g2>")\nmel: note("<e5 d5>")',
        key("C"),
        2,
      ),
    ).toBe("HC");
  });
  test("deceptive cadences: V → vi in major, V → VI in minor; Phrygian HC iv6 → V in minor", async () => {
    expect(await cadence('chords: chord("<G Am>").voicing()\nbass: note("<g2 a2>")', key("C"), 2)).toBe("DC");
    expect(
      await cadence('chords: chord("<E F>").voicing()\nbass: note("<e2 f2>")', key("A", "minor"), 2),
    ).toBe("DC");
    expect(
      await cadence('chords: chord("<Dm E>").voicing()\nbass: note("<f2 e2>")', key("A", "minor"), 2),
    ).toBe("HC");
  });
  test("enharmonic keys: V7 → I in G♭ major and in F♯ major are the same cadence", async () => {
    const gb = 'chords: chord("<Db7 Gb>").voicing()\nbass: note("<db2 gb2>")\nmel: note("<ab4 gb4>")';
    const fs = 'chords: chord("<C#7 F#>").voicing()\nbass: note("<c#2 f#2>")\nmel: note("<g#4 f#4>")';
    expect(await cadence(gb, key("Gb"), 2)).toBe("PAC");
    expect(await cadence(fs, key("F#"), 2)).toBe("PAC");
    expect(await cadence(gb, key("F#"), 2)).toBe("PAC");
  });
});

describe("Roman numerals of real Strudel chord tracks", () => {
  test("regression: D♯°7 in C♯ minor is vii°7/III, never a 'ii°7'", async () => {
    const n = await strudel(
      'chords: chord("<C#m D#o7 E B#o7 C#m>").voicing()\nbass: note("<c#2 d#2 e2 b#1 c#2>")',
      5,
    );
    const slots = chordSlots(selectTrack(n, "chords"), { bass: selectTrack(n, "bass") });
    expect(slotRomans(slots, key("C#", "minor")).map(romanText)).toEqual([
      "i",
      "viio7/III",
      "III",
      "viio7",
      "i",
    ]);
  });
  test("secondary dominants and mixture in C: I V7/V V iv bVI bVII I", async () => {
    const n = await strudel(
      'chords: chord("<C D7 G Fm Ab Bb C>").voicing()\nbass: note("<c2 d2 g2 f2 ab1 bb1 c2>")',
      7,
    );
    const rns = slotRomans(chordSlots(selectTrack(n, "chords"), { bass: selectTrack(n, "bass") }), key("C"));
    expect(rns.map(romanText)).toEqual(["I", "V7/V", "V", "iv", "bVI", "bVII", "I"]);
  });
  test("inversion figures come from a separate bass track: I6 V43 I ii65 V7 I", async () => {
    const n = await strudel(
      'chords: chord("<C G7 C Dm7 G7 C>").voicing()\nbass: note("<e2 d2 c2 f2 g2 c2>")',
      6,
    );
    const rns = slotRomans(chordSlots(selectTrack(n, "chords"), { bass: selectTrack(n, "bass") }), key("C"));
    expect(rns.map(romanText)).toEqual(["I6", "V43", "I", "ii65", "V7", "I"]);
  });
  test('n-stack chords by degree in A minor with the raised 7th ("6#"): i iv V i', async () => {
    const n = await strudel('chords: n("<[0,2,4] [3,5,7] [4,6#,8] [0,2,4]>").scale("A3:minor")', 4);
    const rns = slotRomans(chordSlots(n.all), key("A", "minor"));
    expect(rns.map(romanText)).toEqual(["i", "iv", "V", "i"]);
  });
});

describe("non-chord tones", () => {
  test("regression: a 4–3 suspension tied over the bar line is a suspension", async () => {
    const n = await strudel(
      'chords: chord("<C G>").voicing()\nmel: note("[e5 d5 e5 c5@2 b4 d5 g4]").slow(2)',
      2,
    );
    const mel = melodyLine(selectTrack(n, "mel"));
    const held = mel.find((x) => x.midi === 72) as (typeof mel)[number];
    expect(R.str(held.onset)).toBe("3/4");
    const nct = classifyNct(mel, chordSlots(selectTrack(n, "chords")), "4/4");
    expect(nct.find((x) => x.id === held.id)?.type).toBe("suspension");
  });
  test("a re-struck suspension, passing and neighbour tones", async () => {
    const n = await strudel(
      'chords: chord("<C G>").voicing()\nmel: note("<[e5 d5 c5 c5] [c5 b4 a4 b4]>")',
      2,
    );
    const nct = classifyNct(melodyLine(selectTrack(n, "mel")), chordSlots(selectTrack(n, "chords")), "4/4");
    expect(nct.map((x) => x.type)).toEqual(["passing", "suspension", "neighbor"]);
  });
});

describe("meter, pickups and compound time", () => {
  test("a 6/8 jig and a 3/4 waltz on the same six eighths are told apart by their accents", async () => {
    const jig = await strudel('s("bd hh hh sd hh hh")');
    const waltz = await strudel('s("bd hh sd hh sd hh")');
    expect(inferMeter(jig.all)[0]?.meter).toBe("6/8");
    expect(inferMeter(waltz.all)[0]?.meter).toBe("3/4");
  });
  test("strong beats: 1 and 4 in 6/8; only 1 in 3/4; 1 and 3 in 4/4", () => {
    expect(isStrong(rat(1, 2), "6/8", "strong")).toBe(true);
    expect(isStrong(rat(1, 3), "6/8", "strong")).toBe(false);
    expect(isStrong(rat(1, 3), "3/4", "strong")).toBe(false);
    expect(isStrong(rat(1, 2), "4/4", "strong")).toBe(true);
    expect(isStrong(rat(1, 4), "4/4", "strong")).toBe(false);
  });
  test("syncopation in 6/8: an eighth on the third eighth tied over beat 2 is syncopated", async () => {
    expect(syncopation((await strudel('s("bd ~ ~ bd ~ ~")')).all, "6/8").total).toBe(0);
    const s = syncopation((await strudel('s("bd ~ bd ~ ~ ~")')).all, "6/8");
    expect(s.count).toBe(1);
    expect(s.at).toEqual([rat(1, 3)]);
  });
  test("triplets are not swing; a shuffle written [x ~ x] is triplet swing", async () => {
    expect(swingRatio((await strudel('s("[hh hh hh]*4")')).all, "4/4", 8).n).toBe(0);
    const shuffle = swingRatio((await strudel('s("[hh ~ hh]*4")')).all, "4/4", 8);
    expect(shuffle.cls).toBe("triplet");
    expect(shuffle.ratio).toBeCloseTo(2, 9);
  });
  test("16th swing straightens back to the 16th grid", async () => {
    const sw = (await strudel('s("hh*16").swingBy(1/3, 8)')).all;
    expect(swingRatio(sw, "4/4", 16).cls).toBe("triplet");
    const back = straighten(sw, { subdivision: 16, amount: 1 / 3 }, "4/4");
    expect(back.map((e) => R.str(e.onset))).toEqual(Array.from({ length: 16 }, (_, i) => R.str(rat(i, 16))));
  });
});

describe("clave, tresillo, Euclid and polyrhythm from Strudel", () => {
  test("son 3-2 and 2-3, rumba 3-2 on the 2-bar 8th grid", async () => {
    const son32 = await strudel('s("<[x ~ ~ x ~ ~ x ~] [~ ~ x ~ x ~ ~ ~]>")', 2);
    expect(claveType(onsets(son32.all))).toEqual({ type: "son", direction: "3-2", bars: 2 });
    const son23 = await strudel('s("<[~ ~ x ~ x ~ ~ ~] [x ~ ~ x ~ ~ x ~]>")', 2);
    expect(claveType(onsets(son23.all))).toMatchObject({ type: "son", direction: "2-3" });
    const rumba = await strudel('s("<[x ~ ~ x ~ ~ ~ x] [~ ~ x ~ x ~ ~ ~]>")', 2);
    expect(claveType(onsets(rumba.all))).toMatchObject({ type: "rumba", direction: "3-2" });
  });
  test("tresillo is x(3,8); cinquillo is x(5,8)", async () => {
    expect(claveType(onsets((await strudel('s("x(3,8)")')).all)).type).toBe("tresillo");
    expect(claveType(onsets((await strudel('s("x(5,8)")')).all)).type).toBe("cinquillo");
  });
  test("x(3,8,2) is a rotation of E(3,8); 3:2 polyrhythm", async () => {
    expect(euclidMatch(onsets((await strudel('s("x(3,8,2)")')).all), 3, 8)).toMatchObject({ ok: true });
    const n = await strudel('a: s("x*3")\nb: s("x*2")');
    expect(polyRatio(onsets(selectTrack(n, "a")), onsets(selectTrack(n, "b")))).toEqual([3, 2]);
  });
});

describe("key estimation", () => {
  test("a harmonic-minor line in F♯ minor is read as F♯ minor, not A major", async () => {
    const n = await strudel('note("<[f#4 g#4 a4 b4] [c#5 d5 e#5 f#5] [c#5 a4 g#4 e#4] [f#4 ~ ~ ~]>")', 4);
    expect(keyEstimate(n.all)[0]?.key).toEqual(key("F#", "minor"));
  });
});

describe("in key", () => {
  test("regression: the raised 6th and 7th of A minor (F♯, G♯) are in A minor; B♭ is not", async () => {
    const n = await strudel('note("a4 b4 c5 d5 e5 f#5 g#5 a5 g5 f5 e5 bb4")');
    const m = scaleMembership(n.all, key("A", "minor"));
    expect(m.outside.map((e) => e.midi)).toEqual([70]);
    expect(scaleMembership(n.all, key("A", "minor"), { strict: true }).outside.map((e) => e.midi)).toEqual([
      78, 80, 70,
    ]);
    // A Dorian piece keeps its own scale: G♯ is outside D Dorian.
    expect(scaleMembership(n.all, key("A", "dorian")).outside.map((e) => e.midi)).toEqual([80, 77, 70]);
  });
});
