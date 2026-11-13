// Exhaustive table tests for the Wave 5 theory seam (docs/design/wave5.md §3.1) over every key, cross-checked with
// tonal: the three minors on all 15 minor tonics (notes, do-based degrees, diatonic triads and sevenths both ways,
// V and vii° from harmonic minor, schema.aeolian and the Andalusian cadence, relative and parallel twins, the
// signature), pentatonics and the blues scale with blue notes on all 15 major tonics, dominant sevenths on every
// root, the 12-bar plans in every key, and bass roles and approach tones under major and minor chords.
import { describe, expect, test } from "bun:test";
import type { KeySpec } from "@oak/content-kit";
import { Chord, Key, Note, Scale } from "tonal";
import { runTheoryCli } from "./cli.ts";
import {
  approachKind,
  approachTones,
  BLUE_NOTES,
  bassRole,
  blueNoteOf,
  bluesKey,
  chordOf,
  chordOfRoman,
  chordPcs,
  degreeOf,
  dominantSeventh,
  isDominantSeventhPcs,
  isDominantSeventhSymbol,
  keyFromFifths,
  keySignature,
  keyTwins,
  MINOR_FORMS,
  minorDegrees,
  minorKey,
  minorKeyChords,
  minorScaleNotes,
  pentatonicKey,
  romanText,
  rootFiveOctave,
  scaleDegrees,
  scaleNotes,
  schemaChords,
  spellBlueNote,
  TWELVE_BAR_VARIANTS,
  twelveBarChords,
  twelveBarFormOf,
  twelveBarPlan,
} from "./index.ts";

const FIFTHS = Array.from({ length: 15 }, (_, i) => i - 7);
const MINOR_TONICS = FIFTHS.map((f) => keyFromFifths(f, "minor").tonic);
const MAJOR_TONICS = FIFTHS.map((f) => keyFromFifths(f, "major").tonic);
const mod12 = (x: number) => ((x % 12) + 12) % 12;
const pc = (name: string): number => mod12(Note.midi(`${name.replace(/-?\d+$/, "")}4`) as number);
/** Pitch classes of a tonal chord name, sorted. */
const tonalPcs = (name: string): number[] =>
  [...new Set(Chord.get(name).notes.map(pc))].sort((a, b) => a - b);
const ourPcs = (c: Parameters<typeof chordPcs>[0]): number[] =>
  [...new Set((chordPcs(c) as number[]).map(mod12))].sort((a, b) => a - b);
/** Oak writes double sharps as "##" and tonal too; flats "b". */
const same = (a: readonly string[]) => a.map((x) => x.replace(/x/g, "##"));

describe("the three minors on all 15 minor tonics", () => {
  test("15 tonics, A♭ to A♯", () => {
    expect(MINOR_TONICS.join(" ")).toBe("Ab Eb Bb F C G D A E B F# C# G# D# A#");
  });
  for (const t of MINOR_TONICS) {
    const tk = Key.minorKey(t);
    test(`${t} minor: natural, harmonic and melodic notes are spelled one letter each, as tonal spells them`, () => {
      expect(same(minorScaleNotes(t, "natural"))).toEqual(tk.natural.scale as string[]);
      expect(same(minorScaleNotes(t, "harmonic"))).toEqual(tk.harmonic.scale as string[]);
      expect(same(minorScaleNotes(t, "melodic"))).toEqual(tk.melodic.scale as string[]);
      for (const f of MINOR_FORMS) expect(new Set(minorScaleNotes(t, f).map((n) => n[0])).size).toBe(7);
    });
    test(`${t} minor: every note of each form reads as its degree with a do-based syllable`, () => {
      for (const f of MINOR_FORMS) {
        const key = minorKey(t, f);
        const degs = minorDegrees(f);
        minorScaleNotes(t, f).forEach((n, i) => {
          const d = degreeOf(Note.midi(`${n}4`) as number, key);
          expect({ f, n, d: d.degree as string, s: d.syllable }).toEqual({
            f,
            n,
            d: String(degs[i]?.degree),
            s: String(degs[i]?.syllable),
          });
        });
      }
      // In natural minor, the raised 6 and 7 read as 6 and 7 (la, ti); the natural ones as ♭6 ♭7 (le, te).
      const nat = { tonic: t, mode: "minor" } as KeySpec;
      const tonic = Note.midi(`${t}4`) as number;
      expect(degreeOf(tonic + 3, nat)).toMatchObject({ degree: "b3", syllable: "me" });
      expect(degreeOf(tonic + 8, nat)).toMatchObject({ degree: "b6", syllable: "le" });
      expect(degreeOf(tonic + 10, nat)).toMatchObject({ degree: "b7", syllable: "te" });
      expect(degreeOf(tonic + 11, nat)).toMatchObject({ degree: "7", syllable: "ti" });
      expect(degreeOf(tonic + 9, nat)).toMatchObject({ degree: "6", syllable: "la" });
    });
    test(`${t} minor: triads i ii° III iv v VI VII; harmonic V and vii°; numerals both ways`, () => {
      const nat = minorKeyChords(t);
      const har = minorKeyChords(t, { form: "harmonic" });
      expect(nat.map((c) => c.rn)).toEqual(["i", "iio", "III", "iv", "v", "VI", "VII"]);
      expect(har.map((c) => c.rn)).toEqual(["i", "iio", "III", "iv", "V", "VI", "viio"]);
      for (const [i, c] of nat.entries())
        expect(ourPcs(c.chord)).toEqual(tonalPcs(tk.natural.triads[i] as string));
      expect(ourPcs((har[4] as (typeof har)[number]).chord)).toEqual(
        tonalPcs(tk.harmonic.triads[4] as string),
      );
      expect(ourPcs((har[6] as (typeof har)[number]).chord)).toEqual(
        tonalPcs(tk.harmonic.triads[6] as string),
      );
      const key = { tonic: t, mode: "minor" } as KeySpec;
      for (const c of [...nat, ...har]) {
        expect(romanText(c.chord, key)).toBe(c.rn);
        expect(ourPcs(chordOfRoman(c.rn, key) as NonNullable<ReturnType<typeof chordOfRoman>>)).toEqual(
          ourPcs(c.chord),
        );
      }
      // The major V holds the raised 7 (the leading tone), a half step under the tonic.
      const v = (har[4] as (typeof har)[number]).chord;
      expect(ourPcs(v)).toContain(mod12(pc(t) + 11));
    });
    test(`${t} minor: sevenths i7 iiø7 IIImaj7 iv7 v7 VImaj7 VII7; harmonic V7 and vii°7`, () => {
      const nat = minorKeyChords(t, { seventh: true });
      const har = minorKeyChords(t, { form: "harmonic", seventh: true });
      for (const [i, c] of nat.entries())
        expect(ourPcs(c.chord)).toEqual(tonalPcs(tk.natural.chords[i] as string));
      expect(ourPcs((har[4] as (typeof har)[number]).chord)).toEqual(
        tonalPcs(tk.harmonic.chords[4] as string),
      );
      expect(ourPcs((har[6] as (typeof har)[number]).chord)).toEqual(
        tonalPcs(tk.harmonic.chords[6] as string),
      );
      expect(isDominantSeventhPcs(chordPcs((har[4] as (typeof har)[number]).chord) as number[])).toBe(true);
    });
    test(`${t} minor: schema.aeolian i–VI–III–VII and the Andalusian i–VII–VI–V`, () => {
      const key = { tonic: t, mode: "minor" } as KeySpec;
      const nat = tk.natural.triads;
      const aeo = schemaChords("schema.aeolian", key);
      expect(aeo.map(ourPcs)).toEqual([nat[0], nat[5], nat[2], nat[6]].map((x) => tonalPcs(x as string)));
      const anda = schemaChords("schema.andalusian", key);
      expect(anda.slice(0, 3).map(ourPcs)).toEqual(
        [nat[0], nat[6], nat[5]].map((x) => tonalPcs(x as string)),
      );
      // The Andalusian lands on the major V (harmonic minor), never the minor v.
      expect(ourPcs(anda[3] as (typeof anda)[number])).toEqual(tonalPcs(tk.harmonic.triads[4] as string));
    });
    test(`${t} minor: relative and parallel twins, and the signature of its relative major`, () => {
      const twins = keyTwins({ tonic: t, mode: "minor" });
      expect(pc(twins.relative.tonic)).toBe(pc(tk.relativeMajor));
      expect(twins.relative.mode).toBe("major");
      expect(twins.parallel).toEqual({ tonic: t, mode: "major" });
      // Harmonic and melodic minor have the natural minor's twins (the raised notes are accidentals).
      expect(keyTwins(minorKey(t, "harmonic")).relative.tonic).toBe(twins.relative.tonic);
      expect(keySignature({ tonic: t, mode: "minor" }).notes).toEqual(
        keySignature({ tonic: twins.relative.tonic, mode: "major" }).notes,
      );
      // And back: the relative minor of the relative major is this key.
      expect(keyTwins(twins.relative).relative).toEqual({ tonic: t, mode: "minor" });
    });
  }
});

describe("pentatonics, the blues scale and blue notes on all 15 major tonics", () => {
  for (const t of MAJOR_TONICS) {
    test(`${t}: major and minor pentatonic and blues notes as tonal spells them`, () => {
      expect(same(scaleNotes(pentatonicKey(t, "major")))).toEqual(Scale.get(`${t} major pentatonic`).notes);
      expect(same(scaleNotes(pentatonicKey(t, "minor")))).toEqual(Scale.get(`${t} minor pentatonic`).notes);
      expect(scaleNotes(bluesKey(t)).map(pc)).toEqual(Scale.get(`${t} blues`).notes.map(pc));
      expect(scaleDegrees(pentatonicKey(t, "major"))).toEqual(["1", "2", "3", "5", "6"]);
      expect(scaleDegrees(pentatonicKey(t, "minor"))).toEqual(["1", "b3", "4", "5", "b7"]);
      expect(scaleDegrees(bluesKey(t))).toEqual(["1", "b3", "4", "b5", "5", "b7"]);
    });
    test(`${t}: the blue notes ♭3 ♭5 ♭7 (me se te), spelled by direction without double accidentals`, () => {
      const key = { tonic: t, mode: "major" } as KeySpec;
      const tonic = 60 + pc(t);
      for (const b of BLUE_NOTES) {
        expect(blueNoteOf(tonic + b.semitones, key)).toEqual(b);
        expect(blueNoteOf(tonic + b.semitones + 12, key)?.degree).toBe(b.degree);
        for (const dir of [1, -1, undefined] as const) {
          const s = spellBlueNote(tonic + b.semitones, key, dir);
          expect(pc(s.name)).toBe(mod12(tonic + b.semitones));
        }
      }
      for (const s of [0, 2, 4, 5, 7, 9, 11]) expect(blueNoteOf(tonic + s, key)).toBeNull();
      expect(blueNoteOf(tonic + 3, key)?.syllable).toBe("me");
      expect(blueNoteOf(tonic + 6, key)?.syllable).toBe("se");
      expect(blueNoteOf(tonic + 10, key)?.syllable).toBe("te");
      // ♭5 goes up as the raised 4th letter and down as the lowered 5th letter, when both are plain spellings.
      const up = spellBlueNote(tonic + 6, key, 1).name[0];
      const down = spellBlueNote(tonic + 6, key, -1).name[0];
      const letters = "CDEFGAB";
      const four = letters[(letters.indexOf(t[0] as string) + 3) % 7];
      const five = letters[(letters.indexOf(t[0] as string) + 4) % 7];
      expect([four, five]).toContain(up);
      expect([four, five]).toContain(down);
    });
  }
});

describe("dominant sevenths on every root", () => {
  for (const t of MAJOR_TONICS) {
    test(`${t}7`, () => {
      expect(ourPcs(dominantSeventh(t))).toEqual(tonalPcs(`${t}7`));
      expect(isDominantSeventhSymbol(`${t}7`)).toBe(true);
      for (const q of ["", "m", "maj7", "m7", "o7", "^7"])
        expect(isDominantSeventhSymbol(`${t}${q}`)).toBe(false);
      const pcs = chordPcs(dominantSeventh(t)) as number[];
      // Every inversion of the four notes is still a dominant seventh; three of its notes are not.
      for (const bass of pcs) expect(isDominantSeventhPcs(pcs, bass)).toBe(true);
      expect(isDominantSeventhPcs(pcs.slice(0, 3))).toBe(false);
      expect(isDominantSeventhPcs(chordPcs(chordOf(t, "maj7")) as number[])).toBe(false);
    });
  }
});

describe("the 12-bar chorus in every key and every form", () => {
  const FORMS = TWELVE_BAR_VARIANTS.flatMap((variant) =>
    [false, true].map((turnaround) => ({ variant, turnaround })),
  );
  for (const t of MAJOR_TONICS)
    test(`${t}: standard and quick change, with and without the turnaround`, () => {
      for (const form of FORMS) {
        const plan = twelveBarPlan(form);
        const chords = twelveBarChords(t, form);
        expect(chords).toHaveLength(12);
        const roots = chords.map((c) => mod12(c.rootPc - pc(t)));
        const want = plan.map((rn) => ({ I7: 0, IV7: 5, V7: 7 })[rn] as number);
        expect(roots).toEqual(want);
        for (const c of chords) expect(c.quality).toBe("7");
        expect(twelveBarFormOf(roots)).toEqual(form);
        // Shifted a whole step it is still a 12-bar chorus of the same form (any key).
        expect(twelveBarFormOf(roots.map((r) => r + 2 - 2))).toEqual(form);
        expect(plan[4]).toBe("IV7");
        expect(plan[8]).toBe("V7");
        expect(plan[1]).toBe(form.variant === "quick-change" ? "IV7" : "I7");
        expect(plan[11]).toBe(form.turnaround ? "V7" : "I7");
      }
      // Not a blues: bar 5 stays on I, or eleven bars.
      const std = twelveBarChords(t, { variant: "standard", turnaround: false }).map((c) =>
        mod12(c.rootPc - pc(t)),
      );
      expect(twelveBarFormOf(std.map((r, i) => (i === 4 ? 0 : r)))).toBeNull();
      expect(twelveBarFormOf(std.slice(0, 11))).toBeNull();
    });
});

describe("bass roles and approach tones under major and minor chords, every root", () => {
  for (const t of MAJOR_TONICS)
    for (const q of ["maj", "min"] as const)
      test(`${t}${q === "min" ? "m" : ""}`, () => {
        const chord = chordOf(t, q);
        const root = 36 + pc(t);
        const rfo = rootFiveOctave(chord, root);
        expect(rfo).toEqual({ root, fifth: root + 7, octave: root + 12 });
        expect(bassRole(root, chord)).toBe("root");
        expect(bassRole(root + 12, chord, { rootMidi: root })).toBe("octave");
        expect(bassRole(root + 7, chord)).toBe("fifth");
        expect(bassRole(root + (q === "maj" ? 4 : 3), chord)).toBe("third");
        expect(bassRole(root + 1, chord)).toBe("other");
        // Into the next chord a 4th up (I → IV), from a half step below.
        const next = chordOf(Note.pitchClass(Note.transpose(`${t}4`, "4P")), "maj");
        const target = root + 5;
        // Under a major chord the note a half step below IV is the chord's own 3rd: a chord tone first.
        expect(bassRole(target - 1, chord, { nextChord: next, beforeChange: true })).toBe(
          q === "maj" ? "third" : "approach",
        );
        expect(bassRole(target - 1, chord, { nextChord: next, beforeChange: false })).toBe(
          q === "maj" ? "third" : "other",
        );
        expect(approachKind(target - 1, next, null)).toBe("chromatic-below");
        expect(approachKind(target + 1, next, null)).toBe("chromatic-above");
        expect(approachKind(target - 5, next, null)).toBe("dominant");
        const key = { tonic: t, mode: q === "maj" ? "major" : "minor" } as KeySpec;
        const tones = approachTones(target, key);
        expect(tones["chromatic-below"].midi).toBe(target - 1);
        expect(tones["chromatic-above"].midi).toBe(target + 1);
        expect(tones.dominant.midi).toBe(target - 5);
        // The scale steps below and above are in the key, one or two half steps away.
        for (const k of ["diatonic-below", "diatonic-above"] as const) {
          const d = Math.abs(tones[k].midi - target);
          expect(d === 1 || d === 2).toBe(true);
          expect(approachKind(tones[k].midi, next, key)).toBe(
            d === 1 ? (k === "diatonic-below" ? "chromatic-below" : "chromatic-above") : k,
          );
        }
      });
});

describe("the theory CLI: Wave 5 ops", () => {
  const json = (...args: string[]) => {
    const r = runTheoryCli(args);
    expect(r.code).toBe(0);
    return JSON.parse(r.out);
  };
  test("minor, twins, schema chords", () => {
    const a = json("minor", "A", "--harmonic");
    expect(a.notes).toEqual(["A", "B", "C", "D", "E", "F", "G#"]);
    expect(a.chords.map((c: { rn: string }) => c.rn).join(" ")).toBe("i iio III iv V VI viio");
    expect(a.chords[6].symbol).toBe("G♯°");
    expect(a.degrees.map((d: { syllable: string }) => d.syllable).join(" ")).toBe("do re me fa sol le ti");
    expect(json("minor", "C", "--sevenths").chords[1].symbol).toBe("Dm7♭5");
    expect(json("twins", "C")).toEqual({ relative: "A minor", parallel: "C minor" });
    expect(json("schema-chords", "schema.andalusian", "D:minor")).toEqual(["Dm", "C", "B♭", "A"]);
    expect(runTheoryCli(["schema-chords", "schema.nope", "C"]).code).toBe(1);
  });
  test("pentatonic, blues, blue notes", () => {
    expect(json("pentatonic", "A", "minor").notes).toEqual(["A", "C", "D", "E", "G"]);
    const b = json("blues", "C");
    expect(b.degrees).toEqual(["1", "b3", "4", "b5", "5", "b7"]);
    expect(b.blueNotes[1]).toMatchObject({ syllable: "se", up: "F#4", down: "Gb4" });
    expect(json("blue", "66", "C", "--down")).toMatchObject({ degree: "b5", spelled: "Gb4" });
    expect(json("blue", "64", "C")).toBeNull();
  });
  test("twelve-bar plans and reading one back", () => {
    const f = json("twelve-bar", "F", "--quick", "--turnaround");
    expect(f.chords.join(" ")).toBe("F7 B♭7 F7 F7 B♭7 B♭7 F7 F7 C7 B♭7 F7 C7");
    expect(json("twelve-bar-of", ...f.code)).toEqual({ variant: "quick-change", turnaround: true });
    expect(runTheoryCli(["twelve-bar-of", "C7", "F7"]).code).toBe(1);
  });
  test("bass roles, approach notes, dominant sevenths", () => {
    expect(json("bass-role", "e2", "F", "--next-chord", "F", "--before", "--key", "C").role).toBe("approach");
    expect(json("bass-role", "g2", "C").role).toBe("fifth");
    expect(json("approach", "55", "C")["chromatic-below"]).toEqual({ midi: 54, name: "F#3" });
    expect(json("dom7", "G7/B").dominantSeventh).toBe(true);
    expect(json("dom7", "Cmaj7").dominantSeventh).toBe(false);
    expect(json("dom7", "B2", "D3", "F3", "G3", "--bass", "B2").dominantSeventh).toBe(true);
  });
});
