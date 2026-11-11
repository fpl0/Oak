// Milestones (ux §5.5): a full-width banner in the Coda and an entry on the /progress timeline. Each is
// reached when every condition in `when` holds; a capstone in `capstones` means that capstone is released.
// The ux table's M5 (a gym ladder level), M7 (either core finale) and M8–M9 (advanced-track gym levels)
// need conditions MilestoneDef cannot express yet, so they wait for a schema addition.
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
    id: "ms.06",
    title: "You can write in minor and in the blues.",
    description: "A minor ballad and a 12-bar shuffle, both released.",
    when: { capstones: ["C4", "C5"] },
  }),
];
export default milestones;

export const milestoneById: ReadonlyMap<string, MilestoneDef> = new Map(milestones.map((m) => [m.id, m]));
