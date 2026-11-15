import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { OAK_CAPSTONE_UNITS } from "../../../../../content/oak.layout.ts";
import type { MapCommand } from "../../OakMap.tsx";
import { fixtureState, type LearnerFixture, learnerFixture } from "../fixtures.ts";
import { IllustratedOakMap } from "../IllustratedOakMap.tsx";
import "../../../ui/theme/tokens.css";
import "./harness.css";

const params = new URLSearchParams(location.search);
const seed: LearnerFixture =
  params.get("seed") === "mid" ? "mid" : params.get("seed") === "mastered" ? "mastered" : "new";
document.documentElement.dataset.theme = params.get("theme") === "bark" ? "bark" : "paper";
document.documentElement.dataset.motion = params.get("motion") === "full" ? "full" : "reduced";

function Harness() {
  const fixture = useMemo(() => {
    const f = learnerFixture(seed);
    const stress = params.get("stress");
    if (stress === "180" || stress === "whole") {
      const units = [
        "U00",
        "U08",
        "U09",
        "U14",
        "U15",
        "U16",
        "U17",
        "J2",
        "J3",
        "J4",
        "J5",
        "R1",
        "R2",
        "R3",
        "A1",
        "A2",
      ];
      const extras = Array.from({ length: 37 }, (_, i) => {
        const source = f.graph.nodes.find((n) => n.unit === units[i % units.length]);
        if (!source) throw new Error("Missing stress seed unit");
        const n = { ...source, id: `stress-${i}`, name: `Additional skill ${i + 1}`, rank: 999999999 + i };
        f.states.set(n.id, fixtureState(n.id));
        return n;
      });
      const graph = { ...f.graph, nodes: [...f.graph.nodes, ...extras] };
      if (stress === "180") return { ...f, graph, fresh: undefined };
      // The whole course (all 259 sessions done): every leaf grown, all twenty capstones hung as acorns, a full
      // ground of B-sides, and the leaves learned in the last two days glinting — the most the tree ever draws.
      const capstones = Object.keys(OAK_CAPSTONE_UNITS);
      return {
        ...f,
        graph,
        releasedTracks: [
          ...capstones.map((c, i) => ({ id: `whole-${c}`, capstoneId: c, title: `Track ${i + 1}` })),
          ...Array.from({ length: 12 }, (_, i) => ({
            id: `bside-${i}`,
            capstoneId: null,
            title: `B-side ${i + 1}`,
          })),
        ],
        fresh: new Set<string>(f.graph.nodes.slice(-10).map((n) => n.id)) as ReadonlySet<string> | undefined,
      };
    }
    return { ...f, fresh: undefined };
  }, []);
  const [selected, setSelected] = useState<string | null>(null);
  const [command, setCommand] = useState<MapCommand | null>(null);
  const [newLeaves, setNewLeaves] = useState<ReadonlySet<string>>(fixture.fresh ?? new Set());
  const send = (kind: MapCommand["kind"]) => setCommand((c) => ({ kind, seq: (c?.seq ?? 0) + 1 }));
  const close = () => {
    const id = selected;
    const from = document.activeElement;
    setSelected(null);
    // As /oak does: back to the leaf on the next frame, unless a key has moved focus since.
    requestAnimationFrame(() => {
      const now = document.activeElement;
      if (now !== from && now !== null && now !== document.body) return;
      document.querySelector<SVGGElement>(`[data-node="${id}"]`)?.focus();
    });
  };
  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">A little practice. A growing world.</p>
          <h1>The Oak</h1>
          <p>Your music, taking root.</p>
        </div>
        <div className="toolbar" role="toolbar" aria-label="Map view">
          <button type="button" onClick={() => send("zoom-out")} aria-label="Zoom out">
            −
          </button>
          <button type="button" onClick={() => send("zoom-in")} aria-label="Zoom in">
            +
          </button>
          <button type="button" onClick={() => send("fit")}>
            Whole tree
          </button>
          <button type="button" onClick={() => send("fit-width")}>
            Fit width
          </button>
        </div>
      </header>
      <div className="harness-map">
        <IllustratedOakMap
          graph={fixture.graph}
          states={fixture.states}
          next={fixture.next}
          showNext={false}
          selectedId={selected}
          panelOpen={selected !== null}
          onSelect={setSelected}
          onClose={close}
          command={command}
          unitProgress={new Map()}
          initialId={fixture.graph.nodes[0]?.id ?? null}
          releasedTracks={fixture.releasedTracks}
          newlyLearned={newLeaves}
        />
        {selected && (
          <aside className="harness-panel" aria-label="Leaf inspector">
            <h2>{fixture.graph.nodes.find((n) => n.id === selected)?.name}</h2>
            <p>Follow this leaf into the music.</p>
            <button type="button" onClick={close}>
              Close panel
            </button>
          </aside>
        )}
      </div>
      <footer>
        <span>Bud: not started · Veins: practice · Ring: mastered · Paler: ready for a refresh</span>
        <button type="button" onClick={() => setNewLeaves(new Set(["R01"]))}>
          Mark a newly learned leaf
        </button>
      </footer>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing harness root");
createRoot(root).render(<Harness />);
