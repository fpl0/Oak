// Milestones (ux §5.5): a full-width banner in the Coda and an entry on the /progress timeline. Each is
// reached when every condition in `when` holds; a capstone in `capstones` means that capstone is released,
// `ladder` a graded transcription-ladder session passed at that level or higher (counted only from the day
// `after` was completed, when given), and `anyOf` that at least one of its condition sets holds too.
import { defineMilestone, type MilestoneDef } from "@oak/content-kit";

export const milestones: readonly MilestoneDef[] = [
  defineMilestone({
    id: "ms.01",
    title: "You can make a beat.",
    description: "Your first album track is out: a drum intro with a backbeat, steady hats and a fill.",
    when: { capstones: ["C0"] },
  }),
  defineMilestone({
    id: "ms.02",
    title: "You can build a loop with a bass line.",
    description: "A groove, a bass line written in note names and a riff on top, released as one loop.",
    when: { capstones: ["C1"] },
  }),
  defineMilestone({
    id: "ms.03",
    title: "You can now compose a song.",
    description: "Chords that loop and then land, and a melody of your own over them.",
    when: { capstones: ["C2"] },
  }),
  defineMilestone({
    id: "ms.04",
    title: "You can read a lead sheet.",
    description: "Melody on the staff, chord symbols above it: you passed the unit that reads both.",
    when: { sessions: ["U07.CP"] },
  }),
  defineMilestone({
    id: "ms.05",
    title: "You can transcribe a pop song's bass and chords.",
    description:
      "A public-domain song taken down by ear at ladder level 5, bass and chords included, with the minor unit behind you.",
    when: { ladder: { level: 5 }, sessions: ["U10.CP"] },
  }),
  defineMilestone({
    id: "ms.06",
    title: "You can write in minor and in the blues.",
    description: "A minor ballad and a 12-bar shuffle, both released.",
    when: { capstones: ["C4", "C5"] },
  }),
  defineMilestone({
    id: "ms.07",
    title: "You finished the core. Side A is complete.",
    description:
      "Both parts of the core finale are released: your own single, and a standard taken down by ear. You can compose a song and transcribe one.",
    // ux §5.5 "Core Finale", "You have completed the core". The finale has two parts (contracts §2.4) and both
    // complete it: CF-T ends in a gym slot before U17 (session 171 of the default order), so "either" would
    // announce the end of the core fourteen sessions early. In the default order this is CF-A.S4, session 185.
    when: { capstones: ["CF-A", "CF-T"] },
  }),
  defineMilestone({
    id: "ms.08",
    title: "You can transcribe a jazz standard's changes.",
    description: "A ladder level 6 transcription passed while you work through the jazz track.",
    // ux §5.5 "J-track gym L6": a level-6 pass that counts only once the jazz track has started.
    when: { ladder: { level: 6, after: "J1.L01" } },
  }),
  defineMilestone({
    id: "ms.09",
    title: "You can reharmonise a standard.",
    description:
      "A public-domain standard reharmonised with substitutions, its melody untouched, and released.",
    // ux §5.5 "J4": the jazz track's reharmonisation capstone (contracts §2.6, JC4).
    when: { capstones: ["JC4"] },
  }),
  // Wave 5: one milestone per thing the learner can now do in U08–U11 (C4 and C5 together are ms.06).
  defineMilestone({
    id: "ms.10",
    title: "You can now write a bass line.",
    description:
      "Roots on the downbeat, fifths and octaves, approach notes into each change, locked to the kick.",
    when: { sessions: ["U08.L05"] },
  }),
  defineMilestone({
    id: "ms.11",
    title: "You can now write a song with a verse and a chorus.",
    description:
      "Two sections that contrast, arranged verse chorus verse chorus, with a lead sheet to show for it.",
    when: { capstones: ["C3"] },
  }),
  defineMilestone({
    id: "ms.12",
    title: "You can now write in a minor key.",
    description: "Natural, harmonic and melodic minor, and the minor-key chords: you passed the minor unit.",
    when: { sessions: ["U10.CP"] },
  }),
  defineMilestone({
    id: "ms.13",
    title: "You can now play a 12-bar blues.",
    description: "Dominant sevenths, the twelve-bar form, the quick change and the turnaround.",
    when: { sessions: ["U11.L06"] },
  }),
  defineMilestone({
    id: "ms.14",
    title: "You can now transcribe a blues.",
    description: "A blues taken down by ear, bass first, then the changes, then the melody, and released.",
    when: { capstones: ["X2"] },
  }),
  // Wave 6: one milestone per thing the learner can now do in U12–U17 (the end of the core is ms.07).
  defineMilestone({
    id: "ms.15",
    title: "You can now write with seventh chords.",
    description:
      "Major, minor and dominant sevenths, the half-diminished and the diminished, on every degree of a key and under a pianist's left hand.",
    when: { sessions: ["U12.L06"] },
  }),
  defineMilestone({
    id: "ms.16",
    title: "You can now groove with syncopation.",
    description:
      "Pushes, ghost notes, ties and dots, compound meter and triplets: you passed the sevenths and rhythm checkpoint. The jazz and rhythm tracks are open.",
    when: { sessions: ["U13.CP"] },
  }),
  defineMilestone({
    id: "ms.17",
    title: "You can now write in a mode.",
    description: "A modal vamp that leans on its colour note, released.",
    when: { capstones: ["C6"] },
  }),
  defineMilestone({
    id: "ms.18",
    title: "You can now use chords from outside the key.",
    description:
      "Secondary dominants that point at a chord, and chords borrowed from the minor: a folk tune reharmonized with both.",
    when: { sessions: ["U16.L05"] },
  }),
  defineMilestone({
    id: "ms.19",
    title: "You can now change key.",
    description: "A song with colour chords whose last chorus lifts into a new key, released.",
    when: { capstones: ["C7"] },
  }),
  defineMilestone({
    id: "ms.20",
    title: "You can now transcribe a standard.",
    description: "Form, bass, changes and melody of a 1920s standard, taken down by ear and arranged.",
    when: { capstones: ["CF-T"] },
  }),
];
export default milestones;

export const milestoneById: ReadonlyMap<string, MilestoneDef> = new Map(milestones.map((m) => [m.id, m]));
