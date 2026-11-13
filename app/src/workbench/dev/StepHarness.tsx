// The Wave 4 lesson-step harness of the workbench's e2e page (`/?w4=step`): a Workbench as a lesson step hosts it
// (the content decides the labels; `initialPanels` from the step; a code-modify region drawn from the editor's
// live ranges; a Band; a lead sheet with a pickup). Query: `panels=chords,function,chord-tones,range,key,circle`,
// `piece=axis|pickup|band`, `staff=lead`, `band=1`, `locked=1` (nothing unlocked). Needs a services provider.
import type { LintContext, UnlockableId, WorkbenchPanelId } from "@oak/content-kit";
import type { BandSetup } from "@oak/strudel";
import { useMemo } from "react";
import { bandCodeAt, bands } from "../../../../content/bands/index.ts";
import { toolbox } from "../../../../content/toolbox.ts";
import { initialPanelsOf } from "../../lib/panels.ts";
import { Workbench } from "../Workbench.tsx";

const ALL: ReadonlySet<UnlockableId> = new Set(toolbox.map((t) => t.id as UnlockableId));

/** Pieces, each checked in wave4.test.ts / the e2e spec with headless Strudel. */
export const STEP_PIECES = {
  // I V vi IV in C under a melody: 7 of its 8 strong-beat notes are chord tones (bar 2 over G: G, a passing F,
  // then E on beat 3, not in the chord).
  axis: {
    code: `setcpm(90/4)

chords: n("<[0,2,4] [4,6,8] [5,7,9] [3,5,7]>").scale("C3:major").s("piano")
mel: n("<[4 2 0 2] [4 3 2 ~] [2 0 2 4] [3 5 7 ~]>").scale("C4:major").s("piano")`,
    region: "<[0,2,4] [4,6,8] [5,7,9] [3,5,7]>",
    bars: 4,
    meter: "4/4" as const,
  },
  // 3/4 with a one-beat pickup (contracts §6.11): bar 0 holds only G4.
  pickup: {
    code: `setcpm(90/3)

chords: n("<~ [0,2,4] [3,5,7] [4,6,8]>").scale("C3:major").s("piano")
mel: n("<[~ ~ 4] [0 2 4] [3 5 7] [6 4 1]>").scale("C4:major").s("piano")`,
    region: "<[~ ~ 4] [0 2 4] [3 5 7] [6 4 1]>",
    bars: 4,
    meter: "3/4" as const,
  },
  // A melody alone, over the Band (its chords and bass name the harmony).
  band: {
    code: `setcpm(90/4)

mel: n("<[4 2 0 2] [5 3 5 7] [4 2 0 2] [5 3 5 7]>").scale("C4:major").s("piano")`,
    region: "<[4 2 0 2] [5 3 5 7] [4 2 0 2] [5 3 5 7]>",
    bars: 4,
    meter: "4/4" as const,
  },
};

function bandSetup(): BandSetup | null {
  const def = bands.find((b) => b.id === "band.axis-4bar") ?? bands[0];
  const code = def ? bandCodeAt(def, "flavour.pop", () => true) : "";
  if (!def || !code) return null;
  return {
    band: def.id,
    flavour: "flavour.pop",
    code: code.replaceAll("{{key}}", "C4:major"),
    followsLearnerKey: true,
    tracks: ["drums", "bass", "chords"],
  };
}

export function StepHarness() {
  const params = new URLSearchParams(location.search);
  const pieceId = (params.get("piece") ?? "axis") as keyof typeof STEP_PIECES;
  const piece = STEP_PIECES[pieceId] ?? STEP_PIECES.axis;
  const panels = (params.get("panels") ?? "").split(",").filter(Boolean) as WorkbenchPanelId[];
  const locked = params.get("locked") === "1";
  const unlocked = locked ? new Set<UnlockableId>() : ALL;
  const key = { tonic: "C", mode: "major" } as const;
  const lint: LintContext = useMemo(
    () => ({ profile: "graded", unlocked, allowPreview: true, meter: piece.meter, key }),
    [unlocked, piece.meter],
  );
  const at = piece.code.indexOf(piece.region);
  const editable = [{ from: at, to: at + piece.region.length }];
  const band = params.get("band") === "1" ? bandSetup() : null;
  const initialPanels = initialPanelsOf({ initialPanels: panels }) ?? undefined;
  return (
    <section data-testid="step-harness" style={{ maxWidth: 1100 }}>
      <p>
        Step harness: piece {pieceId}, panels {panels.join(" ") || "none"}
      </p>
      <Workbench
        id="w4step"
        code={piece.code}
        lessonCtx={{ key, meter: piece.meter, defaultBpm: 90, loopBars: piece.bars }}
        lint={lint}
        views={["roll", "staff"]}
        roll={{ labels: "degree" }}
        staff={{ labels: "none", ...(params.get("staff") === "lead" ? { kind: "lead" as const } : {}) }}
        readOnly={{ editable }}
        targetRegions
        band={band}
        {...(initialPanels ? { initialPanels } : {})}
        {...(pieceId === "pickup" ? { pickup: { units: [1, 1] as [number, number] } } : {})}
      />
    </section>
  );
}
