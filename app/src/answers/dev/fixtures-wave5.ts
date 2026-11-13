// The gallery's Wave 5 examples: the form strip (labels and order), the chord chart (numerals in a blues, symbols
// in A minor), the scale builder (keys and degrees), and minor everywhere: the degree pad with do-based syllables,
// the staff in A minor and D minor, numerals in A minor with the bass filter (c8), sung degrees in minor, and the
// new pick kinds (straight or swung, which minor, which scale colour). Musical claims are checked in
// `fixtures.test.ts` with headless Strudel and @oak/theory.
import type { KeySpec } from "@oak/api";
import { FEEL_OPTIONS, MINOR_OPTIONS, SCALE_COLOUR_OPTIONS } from "@oak/content-kit";
import { appAudio } from "../env.tsx";
import { rnMidis } from "../harmony.ts";
import { degreeNotes } from "../sing.ts";
import type { AnswerKind } from "../types.ts";
import type { Fixture } from "./fixtures.ts";

const fx = <K extends AnswerKind>(f: Fixture<K>): Fixture => f as unknown as Fixture;

export const A_MINOR: KeySpec = { tonic: "A", mode: "minor" };
export const F_BLUES: KeySpec = { tonic: "F", mode: "blues" };
const C_MAJOR: KeySpec = { tonic: "C", mode: "major" };

/** What each section of the form examples plays: four chords, one per half second (a preview, not the song). */
export const FORM_SECTIONS: Readonly<Record<string, readonly string[]>> = {
  verse: ["vi", "IV", "I", "V"],
  chorus: ["I", "V", "vi", "IV"],
  bridge: ["ii", "iii", "IV", "V"],
  A: ["I", "vi", "IV", "V"],
  B: ["IV", "iv", "I", "V"],
};
/** The labelled song: verse chorus verse chorus bridge chorus, 8 bars each and a 4-bar bridge. */
export const FORM_SONG = ["verse", "chorus", "verse", "chorus", "bridge", "chorus"] as const;
export const FORM_SONG_BARS = [8, 8, 8, 8, 4, 8];
export const FORM_AABA = ["A", "A", "B", "A"] as const;

let sectionTimers: number[] = [];
/** Plays a section's four chords in C on the app's piano (the gallery's stand-in for the host's loop). */
export function playSection(name: string): void {
  for (const t of sectionTimers) window.clearTimeout(t);
  sectionTimers = (FORM_SECTIONS[name] ?? []).map((rn, i) =>
    window.setTimeout(() => {
      const m = rnMidis(rn, C_MAJOR);
      if (m) appAudio.playNote(m, { dur: 0.45 });
    }, i * 500),
  );
}

/** U11.CP's F blues (quick change, turnaround in bar 12), as numerals. */
export const F_BLUES_RN = ["I7", "IV7", "I7", "I7", "IV7", "IV7", "I7", "I7", "V7", "IV7", "I7", "V7"];
/** U10's eight bars in A minor with a major V: Am F C G | Am Dm E Am. */
export const MINOR_CHART = ["Am", "F", "C", "G", "Am", "Dm", "E", "Am"];
/** i iv V i in A minor: Am Dm E Am, the bass on 1 4 5 1. */
export const MINOR_RN = ["i", "iv", "V", "i"];
/** U10.CP's Andalusian descent in A minor, i VII VI V (Am G F E), with the bass found first: 1 ♭7 ♭6 5. */
export const ANDALUSIAN_RN = ["i", "VII", "VI", "V"];
export const ANDALUSIAN_BASS = ["1", "b7", "b6", "5"];

/** Hats, straight and swung (STYLE §7: `swingBy(1/3, 4)` swings the eighths in 4/4). */
export const HATS_STRAIGHT = 'setcpm(96/4)\n\nhats: s("hh*8")\nkick: s("bd ~ bd ~")';
export const HATS_SWUNG = 'setcpm(96/4)\n\nhats: s("hh*8").swingBy(1/3, 4)\nkick: s("bd ~ bd ~")';
/** The three A minors, up one octave. */
export const MINOR_SCALES = {
  minor: 'setcpm(100/4)\n\nmel: n("0 1 2 3 4 5 6 7").scale("A4:minor").s("piano")',
  "harmonic minor": 'setcpm(100/4)\n\nmel: n("0 1 2 3 4 5 6 7").scale("A4:harmonic:minor").s("piano")',
  "melodic minor": 'setcpm(100/4)\n\nmel: n("0 1 2 3 4 5 6 7").scale("A4:melodic:minor").s("piano")',
} as const;
/** The three U11 scale colours from C, up and back. */
export const COLOUR_SCALES = {
  "major pentatonic": 'setcpm(100/4)\n\nmel: n("0 1 2 3 4 5 4 3").scale("C4:major:pentatonic").s("piano")',
  "minor pentatonic": 'setcpm(100/4)\n\nmel: n("0 1 2 3 4 5 4 3").scale("C4:minor:pentatonic").s("piano")',
  blues: 'setcpm(100/4)\n\nmel: n("0 1 2 3 4 5 6 5").scale("C4:blues").s("piano")',
} as const;

/** Sight-singing in A minor from A3: 1 ♭3 5 ♭3 1 (do me sol me do). */
export const SING_MINOR = degreeNotes(57, ["1", "b3", "5", "b3", "1"], { beat: 1, start: 0, mode: "minor" });

export const WAVE5_FIXTURES: Fixture[] = [
  fx({
    id: "form-label",
    kind: "form",
    title: "Form: name the sections",
    prompt: "Click each section to hear it, then name it: verse, chorus or bridge.",
    spec: {
      ui: "form",
      sections: 6,
      vocabulary: ["verse", "chorus", "bridge"],
      input: "label",
      sectionBars: FORM_SONG_BARS,
    },
    expected: [...FORM_SONG],
    sample: ["verse", "chorus", "verse", "verse", "bridge", "chorus"],
    wrongMessage: "Section 4 has the chorus's chords: I V vi IV.",
    env: { slots: { play: (i) => playSection(FORM_SONG[i] ?? "verse") } },
  }),
  fx({
    id: "form-letters",
    kind: "form",
    title: "Form: letters",
    prompt: "Four 8-bar phrases. Label them with letters: the same music gets the same letter.",
    spec: { ui: "form", sections: 4, vocabulary: "letters", input: "label", sectionBars: [8, 8, 8, 8] },
    expected: [...FORM_AABA],
    sample: ["A", "B", "B", "A"],
    env: { slots: { play: (i) => playSection(FORM_AABA[i] ?? "A") } },
  }),
  fx({
    id: "form-order",
    kind: "form",
    title: "Form: put the sections in order",
    prompt: "The song played intro, verse, chorus and outro once each. Put them in the order you heard.",
    spec: { ui: "form", sections: 4, vocabulary: ["verse", "outro", "intro", "chorus"], input: "order" },
    expected: ["intro", "verse", "chorus", "outro"],
    sample: ["verse", "intro", "chorus", "outro"],
  }),
  fx({
    id: "bar-grid-blues",
    kind: "bar-grid",
    title: "Chord chart: a 12-bar blues in numerals",
    prompt: "A 12-bar blues in F, played twice. Chart it in numerals; bar 1 is given.",
    spec: { ui: "bar-grid", bars: 12, perRow: 4, entry: "rn", qualities: ["7"], given: [1] },
    expected: F_BLUES_RN,
    sample: ["I7", "IV7", "I7", "I7", "IV7", "IV7", "I7", "I7", "V7", "V7", "I7", "V7"],
    wrongMessage: "Bar 10 goes down to IV7 before home.",
    env: { harmony: { key: F_BLUES, bpm: 120 } },
  }),
  fx({
    id: "bar-grid-symbol",
    kind: "bar-grid",
    title: "Chord chart: symbols in A minor",
    prompt: "Eight bars in A minor. Write the chords; bar 7 is a major chord.",
    spec: { ui: "bar-grid", bars: 8, perRow: 4, entry: "symbol", qualities: ["min", "maj"] },
    expected: MINOR_CHART,
    sample: ["Am", "F", "C", "G", "Am", "Dm", "Em", "Am"],
    wrongMessage: "Bar 7 has G♯ in it: E major, the raised 7th's V.",
    env: { harmony: { key: A_MINOR, bpm: 100 } },
  }),
  fx({
    id: "scale-keys",
    kind: "scale-builder",
    title: "Scale builder: keyboard",
    prompt: "Build G major pentatonic: five notes from G.",
    spec: { ui: "scale-builder", tonic: "G", input: "keyboard" },
    expected: [67, 69, 71, 74, 76],
    sample: [67, 69, 71, 72, 74, 76],
    wrongMessage: "Five notes: leave out the two that sit a half step from a neighbour.",
  }),
  fx({
    id: "scale-blues",
    kind: "scale-builder",
    title: "Scale builder: degrees",
    prompt: "Build the A blues scale on the degree pad.",
    spec: { ui: "scale-builder", tonic: "A", input: "degrees" },
    expected: ["1", "b3", "4", "b5", "5", "b7"],
    sample: ["1", "b3", "4", "5", "b7"],
    wrongMessage: "Add the blue note between 4 and 5: ♭5.",
  }),
  fx({
    id: "scale-minor",
    kind: "scale-builder",
    title: "Scale builder: harmonic minor, solfège lens on",
    prompt: "Build A harmonic minor: natural minor with the 7th raised.",
    spec: {
      ui: "scale-builder",
      tonic: "A",
      input: "degrees",
      palette: ["1", "2", "b3", "3", "4", "5", "b6", "6", "b7", "7"],
    },
    expected: ["1", "2", "b3", "4", "5", "b6", "7"],
    sample: ["1", "2", "b3", "4", "5", "b6", "b7"],
    env: { lenses: { degrees: true, solfege: true, noteNames: false } },
  }),
  fx({
    id: "degree-minor-lens",
    kind: "degree-pad",
    title: "Minor pad, solfège lens on",
    prompt: "In A minor, which degree is F?",
    spec: { ui: "degree-pad", set: ["1", "2", "b3", "4", "5", "b6", "b7"], syllables: false },
    expected: ["b6"],
    sample: ["b7"],
    env: { lenses: { degrees: true, solfege: true, noteNames: false } },
  }),
  fx({
    id: "staff-minor",
    kind: "staff-input",
    title: "Staff input: A minor with the raised 7th",
    prompt: "In A harmonic minor, write 5 ♭6 7 1 as quarters: the 7th needs its sharp.",
    spec: {
      ui: "staff-input",
      clef: "treble",
      bars: 1,
      key: { tonic: "A", mode: "harmonic minor" },
      palette: { durations: ["4"], accidentals: true, ties: false, rests: false },
    },
    expected: "E4:4 F4:4 G#4:4 A4:4",
    sample: "E4:4 F4:4 G4:4 A4:4",
    wrongMessage: "The 7th of harmonic minor is raised: G♯, not G.",
  }),
  fx({
    id: "staff-dminor",
    kind: "staff-input",
    title: "Staff input: D minor",
    prompt: "In D minor, write 1 2 ♭3 4 as quarters, then 5 as a whole note.",
    spec: {
      ui: "staff-input",
      clef: "treble",
      bars: 2,
      key: { tonic: "D", mode: "minor" },
      palette: { durations: ["4", "1"], accidentals: true, ties: false, rests: false },
    },
    expected: "D4:4 E4:4 F4:4 G4:4 | A4:1",
    sample: "D4:4 E4:4 F#4:4 G4:4 | A4:1",
    wrongMessage: "♭3 of D is F, not F♯.",
  }),
  fx({
    id: "rn-minor",
    kind: "rn-palette",
    title: "Roman numerals in A minor",
    prompt: "Am Dm E Am: name each chord in A minor.",
    spec: { ui: "rn-palette", slots: 4, allow: ["triads", "sevenths"] },
    expected: MINOR_RN,
    sample: ["i", "iv", "v", "i"],
    wrongMessage: "Bar 3 is E major (G♯ in it): the raised 7th makes V, not v.",
    env: { harmony: { key: A_MINOR } },
  }),
  fx({
    id: "rn-minor-bass",
    kind: "rn-palette",
    title: "Numerals over a bass, in minor",
    prompt: "The bass went 1 ♭7 ♭6 5. Name the chords over it.",
    spec: { ui: "rn-palette", slots: 4, allow: ["triads"] },
    expected: ANDALUSIAN_RN,
    sample: ["i", "v", "VI", "V"],
    env: { harmony: { key: A_MINOR, bassDegrees: ANDALUSIAN_BASS } },
  }),
  fx({
    id: "sing-minor",
    kind: "mic",
    title: "Sight-singing in minor, Quiet mode",
    prompt: "Sight-sing do me sol me do in A minor, then hear it.",
    spec: { ui: "mic" },
    expected: [],
    sample: [],
    env: {
      quiet: true,
      sing: {
        notes: SING_MINOR,
        mode: "sight",
        labels: "syllables",
        reference: { tonic: 57, mode: "minor", chords: true },
      },
    },
  }),
  fx({
    id: "choice-feel",
    kind: "choice",
    title: "Straight or swung",
    prompt: "Listen to the hi-hats. Straight or swung?",
    spec: {
      ui: "choice",
      layout: "audio-cards",
      options: FEEL_OPTIONS.map((o) => ({ ...o, audio: o.id === "swung" ? HATS_SWUNG : HATS_STRAIGHT })),
    },
    expected: ["swung"],
    sample: ["straight"],
    wrongMessage: "Each pair of hats is long–short: that is swing.",
  }),
  fx({
    id: "choice-minor",
    kind: "choice",
    title: "Which minor",
    prompt: "Which minor scale climbs with both the 6th and the 7th raised?",
    spec: {
      ui: "choice",
      layout: "audio-cards",
      options: MINOR_OPTIONS.map((o) => ({ ...o, audio: MINOR_SCALES[o.id as keyof typeof MINOR_SCALES] })),
    },
    expected: ["melodic minor"],
    sample: ["harmonic minor"],
  }),
  fx({
    id: "choice-colour",
    kind: "choice",
    title: "Scale colour",
    prompt: "Which scale has the blue note ♭5?",
    spec: {
      ui: "choice",
      options: SCALE_COLOUR_OPTIONS.map((o) => ({
        ...o,
        audio: COLOUR_SCALES[o.id as keyof typeof COLOUR_SCALES],
      })),
    },
    expected: ["blues"],
    sample: ["minor pentatonic"],
  }),
];
