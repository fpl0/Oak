// Deterministic learner seeds for the isolated harness and SVG snapshots; no clock or server needed.
import type { SkillState } from "@oak/api";
import { skills } from "../../../../content/skills.ts";
import { syllabus } from "../../../../content/syllabus.ts";
import { skillGraphFromDefs } from "../../lib/content-model.ts";
import { buildMapGraph } from "../graph.ts";
import { whatsNext } from "../guide.ts";

export const fixtureGraph = buildMapGraph(skillGraphFromDefs(skills), syllabus);
export type LearnerFixture = "new" | "mid" | "mastered";
export function fixtureState(id: string, changes: Partial<SkillState> = {}): SkillState {
  return {
    skillId: id as SkillState["skillId"],
    P: 0.95,
    R: 0.9,
    D: 3,
    M: 0.855,
    level: "mastered",
    debt: false,
    debtReason: null,
    provisional: false,
    paused: false,
    freshness: 1,
    drying: false,
    updatedAt: "2026-11-13T12:00:00.000Z",
    ...changes,
  };
}
export function learnerFixture(kind: LearnerFixture) {
  const states = new Map(
    fixtureGraph.nodes.map((n, i) => {
      const learned = kind === "mastered" || (kind === "mid" && i < 75);
      const overdue = learned && i % 9 === 4;
      return [
        n.id,
        fixtureState(n.id, {
          level: learned
            ? kind === "mid" && i > 55
              ? i % 2
                ? "learning"
                : "practiced"
              : "mastered"
            : i < 4
              ? "available"
              : "new",
          freshness: overdue ? 0.24 : 1,
          R: overdue ? 0.62 : 0.9,
          drying: overdue && i % 2 === 0,
          paused: learned && n.id === "V03",
        }),
      ] as const;
    }),
  );
  return {
    graph: fixtureGraph,
    states,
    next: whatsNext({ next: kind === "new" ? "U00.L01" : "U08.L01" }, syllabus, fixtureGraph),
    releasedTracks:
      kind === "new"
        ? []
        : [
            { id: "fixture-intro", capstoneId: "C0", title: "A little heartbeat" },
            { id: "fixture-loop", capstoneId: "C1", title: "The kitchen window" },
            { id: "fixture-song", capstoneId: "C2", title: "Something like home" },
            ...(kind === "mastered"
              ? [
                  { id: "fixture-jazz", capstoneId: "JC4", title: "After the rain" },
                  { id: "fixture-bside", capstoneId: null, title: "Night bus" },
                  { id: "fixture-bside-2", capstoneId: null, title: "Second thoughts" },
                ]
              : []),
          ],
  };
}
