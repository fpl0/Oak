/** tonal 6.5.1 APIs the notation pipeline relies on, pinned with their real outputs. */
import { expect, test } from "bun:test";
import { AbcNotation, Key, Note, Scale } from "tonal";
import { abcPitchLetter } from "./abc.ts";
import { keyFromScaleName, keyInfo, normalizeNoteName, spell } from "./quantize.ts";

test("Note.midi / Note.fromMidi / Note.fromMidiSharps", () => {
  expect(Note.midi("C4")).toBe(60);
  expect(Note.midi("c4")).toBe(60); // lowercase letters are accepted
  expect(Note.midi("F#4")).toBe(66);
  expect(Note.midi("E#5")).toBe(77);
  expect(Note.fromMidi(61)).toBe("Db4"); // flats by default
  expect(Note.fromMidiSharps(61)).toBe("C#4");
  expect(Note.fromMidi(60)).toBe("C4");
});

test("tonal rejects Strudel's s/f accidentals and octave-less notes", () => {
  expect(Note.midi("cs4")).toBeNull();
  expect(Note.midi("ef4")).toBeNull();
  expect(Note.get("cs4").empty).toBe(true);
  expect(Note.get("bf3").empty).toBe(true);
  expect(Note.get("fs4").empty).toBe(true);
  expect(Note.get("es4").name).toBe("");
  expect(Note.midi("c")).toBeNull(); // no octave -> no midi (Strudel plays c3)
  expect(Note.get("f4").name).toBe("F4"); // 'f' as a LETTER is fine
});

test("normalizeNoteName maps the Strudel dialect onto tonal", () => {
  expect(normalizeNoteName("cs4")).toBe("C#4");
  expect(normalizeNoteName("ef4")).toBe("Eb4");
  expect(normalizeNoteName("bf3")).toBe("Bb3");
  expect(normalizeNoteName("f4")).toBe("F4");
  expect(normalizeNoteName("ff4")).toBe("Fb4");
  expect(normalizeNoteName("fs4")).toBe("F#4");
  expect(normalizeNoteName("css2")).toBe("C##2");
  expect(normalizeNoteName("c")).toBe("C3");
  expect(normalizeNoteName("F#4")).toBe("F#4");
  expect(normalizeNoteName("h4")).toBeNull();
  expect(["cs4", "ef4", "bf3", "c"].map((n) => Note.midi(normalizeNoteName(n) ?? ""))).toEqual([61, 63, 58, 48]);
});

test("Note.enharmonic(note, pitchClass) respells and fixes the octave", () => {
  expect(Note.enharmonic("C#4")).toBe("Db4");
  expect(Note.enharmonic("Db4", "C#")).toBe("C#4");
  expect(Note.enharmonic("F5", "E#")).toBe("E#5");
  expect(Note.enharmonic("C4", "B#")).toBe("B#3");
  expect(Note.enharmonic("B3", "Cb")).toBe("Cb4");
  expect(Note.enharmonic("C4", "D")).toBe(""); // wrong chroma -> empty string, not a throw
  expect(Note.simplify("E#5")).toBe("F5");
});

test("Key.majorKey / Key.minorKey", () => {
  const d = Key.majorKey("D");
  expect(d.scale).toEqual(["D", "E", "F#", "G", "A", "B", "C#"]);
  expect(d.alteration).toBe(2);
  expect(d.keySignature).toBe("##");
  expect(d.chords).toEqual(["Dmaj7", "Em7", "F#m7", "Gmaj7", "A7", "Bm7", "C#m7b5"]);
  expect(Key.majorKey("F#").scale).toEqual(["F#", "G#", "A#", "B", "C#", "D#", "E#"]);
  expect(Key.majorKey("F#").alteration).toBe(6);
  expect(Key.majorKey("Bb").scale).toEqual(["Bb", "C", "D", "Eb", "F", "G", "A"]);
  expect(Key.majorKey("Bb").alteration).toBe(-2);
  expect(Key.minorKey("A").natural.scale).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
  expect(Key.minorKey("A").harmonic.scale).toEqual(["A", "B", "C", "D", "E", "F", "G#"]);
  expect(Key.minorKey("E").keySignature).toBe("#");
  // A tonic WITH an octave is tolerated by majorKey ...
  expect(Key.majorKey("D4").scale).toEqual(["D", "E", "F#", "G", "A", "B", "C#"]);
  // ... and hap.context.scale is "D4 major" (space, octave kept):
  expect(Scale.get("D4 major").tonic).toBe("D4");
  expect(keyFromScaleName("D4 major")).toEqual({ tonic: "D", mode: "major" });
  expect(keyFromScaleName("F#4 major")).toEqual({ tonic: "F#", mode: "major" });
  expect(keyFromScaleName("bf:minor")).toEqual({ tonic: "Bb", mode: "minor" });
  expect(keyFromScaleName("C4 dorian")).toBeNull(); // modes are out of scope for the spike
});

test("key-aware spelling", () => {
  const fs = { tonic: "F#", mode: "major" } as const;
  expect(spell(77, fs).name).toBe("E#5");
  expect(spell(66, { tonic: "D", mode: "major" }).name).toBe("F#4");
  expect(spell(66, { tonic: "Db", mode: "major" }).name).toBe("Gb4");
  expect(spell(60, { tonic: "C#", mode: "major" }).name).toBe("B#3"); // octave fixed by Note.enharmonic
  expect(spell(61, null).name).toBe("C#4"); // no key: sharps
  expect(spell(61, null, "Db4").name).toBe("Db4"); // ... unless the code spelled it
  expect(spell(61, { tonic: "F", mode: "major" }).name).toBe("Db4"); // flat key: flats
  expect(spell(68, { tonic: "A", mode: "minor" }).name).toBe("G#4"); // raised 7th from harmonic minor
  expect(spell(61, { tonic: "D", mode: "minor" }).name).toBe("C#4"); // not Db, although D minor is a flat key
  expect(keyInfo(fs).sig).toEqual({ C: 1, D: 1, E: 1, F: 1, G: 1, A: 1, B: 0 });
  expect(keyInfo({ tonic: "A", mode: "minor" }).abcKey).toBe("Am");
});

test("ABC pitch letters agree with tonal's AbcNotation", () => {
  expect(AbcNotation.scientificToAbcNotation("C#5")).toBe("^c");
  expect(AbcNotation.scientificToAbcNotation("Bb3")).toBe("_B,");
  expect(AbcNotation.scientificToAbcNotation("F##4")).toBe("^^F");
  for (const [l, o] of [["C", 4], ["C", 5], ["C", 6], ["C", 2], ["B", 3], ["G", 7]] as const) {
    expect(abcPitchLetter(l, o)).toBe(AbcNotation.scientificToAbcNotation(`${l}${o}`));
  }
});
