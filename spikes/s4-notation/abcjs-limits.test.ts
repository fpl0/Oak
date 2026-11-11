/** abcjs 6.7.2 parser facts the emitter depends on, pinned headlessly (abcjs.parseOnly needs no DOM). */
import { expect, test } from "bun:test";

// biome-ignore lint/suspicious/noExplicitAny: abcjs is CJS
const mod: any = await import("abcjs");
const abcjs = mod.default ?? mod;
const HEAD = "X:1\nM:4/4\nL:1/16\nK:C\n";
// biome-ignore lint/suspicious/noExplicitAny: abcjs element shape
const parse = (body: string): { warnings: string[]; notes: any[] } => {
  const t = abcjs.parseOnly(HEAD + body)[0];
  // biome-ignore lint/suspicious/noExplicitAny: abcjs element shape
  return { warnings: t.warnings ?? [], notes: t.lines[0].staff[0].voices[0].filter((e: any) => e.el_type === "note") };
};

test("import shape under Bun: named exports and default both exist", () => {
  expect(typeof mod.renderAbc).toBe("function");
  expect(typeof mod.default.renderAbc).toBe("function");
  expect(abcjs.signature).toBe("abcjs-basic v6.7.2");
});

test("!class=...! becomes abcElem.extraClass; startChar/endChar include the decoration and trailing space", () => {
  const { warnings, notes } = parse("!class=oak-e0!C4 !class=oak-e1!D4 z8 |]");
  expect(warnings).toEqual([]);
  expect(notes.map((n) => n.extraClass)).toEqual(["oak-e0", "oak-e1", undefined]);
  expect((HEAD + "!class=oak-e0!C4 !class=oak-e1!D4 z8 |]").slice(notes[0].startChar, notes[0].endChar)).toBe("!class=oak-e0!C4 ");
});

test("one class decoration per element, but its value may hold several space-separated classes", () => {
  const multi = parse("!class=oak-e0 oak-e1 oak-e2![CEG]8 z8 |]");
  expect(multi.warnings).toEqual([]);
  expect(multi.notes[0].extraClass).toBe("oak-e0 oak-e1 oak-e2");
  // two decorations: the LAST one wins silently
  expect(parse("!class=oak-e0!!class=oak-e1!C4 z12 |]").notes[0].extraClass).toBe("oak-e1");
  // inside chord brackets the class is NOT applied (it lands in .decoration as a bogus entry, no warning)
  const inner = parse("[!class=oak-e0!C!class=oak-e1!E]8 z8 |]");
  expect(inner.warnings).toEqual([]);
  expect(inner.notes[0].extraClass).toBeUndefined();
  expect(inner.notes[0].decoration).toEqual(["class=oak-e0", "class=oak-e1"]);
  // rests accept a class too
  expect(parse("!class=oak-r0!z16 |]").notes[0].extraClass).toBe("oak-r0");
});

test("tuplets: (p:q:r with single digits only; 5, 7 and 9 work, 11 does not", () => {
  const ok = parse("(5:4:5CDEFG (7:4:7CDEFGAB (9:8:9C/D/E/F/G/A/B/c/d/ z4 |]");
  expect(ok.warnings).toEqual([]);
  expect(ok.notes.filter((n) => n.startTriplet).map((n) => [n.startTriplet, n.tripletMultiplier, n.tripletR])).toEqual([
    [5, 4 / 5, 5],
    [7, 4 / 7, 7],
    [9, 8 / 9, 9],
  ]);
  const p11 = parse("(11:8:11CDEFGABcdef z8 |]");
  expect(p11.warnings.length).toBeGreaterThan(0);
  expect(p11.notes.some((n) => n.startTriplet)).toBe(false);
  // r > 9 is read as r = 1 followed by a stray digit
  const r12 = parse("(3:2:12CDEFGABcdefg z8 |]");
  expect(r12.warnings.length).toBe(1);
  expect(r12.notes[0].tripletR).toBe(1);
  // a tuplet may contain a tie, a rest and a space (beam break) without warnings
  const mixed = parse("(3:2:4C2-C z2 D2 z12 |]");
  expect(mixed.warnings).toEqual([]);
});

test("beams follow adjacency only: a space ends the beam, abcjs never beams by meter", () => {
  const { notes } = parse("C2D2E2F2 G2 A2 B2c2 |]");
  // startBeam/endBeam are set by the parser on the outer notes of each unspaced run
  expect(notes.map((n) => `${n.startBeam ? "[" : ""}${n.pitches[0].name}${n.endBeam ? "]" : ""}`).join(" ")).toBe(
    "[C D E F] G A [B c]",
  );
});
