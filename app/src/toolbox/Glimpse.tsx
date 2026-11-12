// A feature at work, at its unlock moment (Wave 3): the degree and solfège lines under a staff, the
// key-signature panel, the circle of fifths. Static (no adapter, no editor): it renders before sound is awake
// and never plays by itself; the moment's own demo plays the sound.
import { renderStaff } from "@oak/notation/render";
import { useEffect, useRef } from "react";
import "../workbench/workbench.css";
import { CircleOfFifths } from "../workbench/CircleOfFifths.tsx";
import { KeyPanel } from "../workbench/KeyPanel.tsx";
import { keyName } from "../workbench/key-tools.ts";
import { colourHeads } from "../workbench/staff-colour.ts";
import { type Glimpse, glimpseStaff } from "./glimpse.ts";

function GlimpseStaff({ g }: { g: Extract<Glimpse, { kind: "staff" }> }) {
  const host = useRef<HTMLDivElement>(null);
  const staff = glimpseStaff(g);
  const abc = staff.abc;
  const headsRef = useRef(staff.heads);
  headsRef.current = staff.heads;
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let live = true;
    void renderStaff(el, abc, { params: { staffwidth: 460, scale: 0.9 } as never })
      .then(() => {
        if (!live) return;
        colourHeads(el, headsRef.current);
        el.dataset.ready = "1";
      })
      .catch(() => {
        if (live) el.textContent = g.caption;
      });
    return () => {
      live = false;
      el.replaceChildren();
    };
  }, [abc, g.caption]);
  const lines = [g.lines.degree ? "degrees" : null, g.lines.solfege ? "syllables" : null].filter(Boolean);
  return (
    <div
      ref={host}
      className="max-w-[30rem] text-text"
      role="img"
      aria-label={`${keyName(g.key)} on the staff with ${lines.join(" and ")} under every note`}
      data-testid="glimpse-staff"
    />
  );
}

export function FeatureGlimpse({ glimpse }: { glimpse: Glimpse }) {
  return (
    <figure className="oak-workbench m-0 flex flex-col gap-1" data-testid="feature-glimpse">
      {glimpse.kind === "staff" ? (
        <GlimpseStaff g={glimpse} />
      ) : glimpse.kind === "key-panel" ? (
        <KeyPanel current={glimpse.key} keys={[glimpse.key]} preview={null} />
      ) : (
        <CircleOfFifths current={glimpse.key} keys={glimpse.keys} preview={null} />
      )}
      <figcaption className="text-sm text-text-2">{glimpse.caption}</figcaption>
    </figure>
  );
}
