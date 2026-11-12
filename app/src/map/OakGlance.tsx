// The Today page's mini Oak (ux §1.4 "TreeGlance"): every leaf as a dot in the map's strand × unit grid,
// shaded like the map, the "what's next" leaves ringed, with one line of counts and a way in. Self-contained:
// it reads its own queries, so the Today page only places it.
//
//   import { OakGlance } from "../map/index.ts";
//   <OakGlance width={240} />            // 180 at 1280×800 (ux §1.4)
import { Link } from "@tanstack/react-router";
import { clsx } from "clsx";
import { Skeleton } from "../ui/kit/basics.tsx";
import { glanceLayout } from "./glance.ts";
import { LEAF_DOT } from "./Leaf.tsx";
import { countLeaves, leafView } from "./state.ts";
import { useOak } from "./use-oak.ts";

export interface OakGlanceProps {
  /** Drawing width in px (240 at 1440, 180 at 1280). */
  width?: number;
  className?: string;
  /** Show the counts line and the Revive link under the picture (default true). */
  caption?: boolean;
}

export function OakGlance({ width = 240, className, caption = true }: OakGlanceProps) {
  const { model, map, content } = useOak();
  if (content.isError || map.isError)
    return <p className={clsx("text-sm text-text-2", className)}>The map is not available right now.</p>;
  if (!model || map.isPending)
    return (
      <div className={className} style={{ width }}>
        <Skeleton className="h-32 w-full" />
      </div>
    );
  const g = glanceLayout(model.graph, width);
  const counts = countLeaves(
    model.graph.nodes.map((n) => n.id),
    model.states,
  );
  const next = new Set(model.next.targets);
  const nowRow = g.rows.find((r) => model.units.get(r.unit)?.current);
  const label = `The Oak: ${counts.grown} of ${counts.total} leaves grown${counts.drying > 0 ? `, ${counts.drying} in today's warm-up` : ""}. Open the map.`;
  return (
    <div className={clsx("flex flex-col gap-2", className)} data-testid="oak-glance">
      <Link
        to="/oak"
        search={{ view: "tree" }}
        aria-label={label}
        className="block rounded-control outline-offset-2"
        style={{ width }}
      >
        <svg
          width={g.width}
          height={g.height}
          viewBox={`0 0 ${g.width} ${g.height}`}
          aria-hidden
          className="block"
        >
          {nowRow && (
            <rect
              x={0}
              y={nowRow.y - 1}
              width={g.width}
              height={nowRow.h + 2}
              rx={2}
              className="fill-accent-2/15"
            />
          )}
          {g.dots.map((d) => {
            const v = leafView(model.states.get(d.id));
            const outline = v.status === "locked" || v.status === "available";
            return (
              <circle
                key={d.id}
                cx={d.x}
                cy={d.y}
                r={d.r}
                data-dot={d.id}
                className={clsx(
                  LEAF_DOT[v.status],
                  next.has(d.id) && "stroke-accent-2",
                  v.drying && "stroke-issue",
                )}
                fillOpacity={outline ? undefined : v.opacity}
                strokeWidth={next.has(d.id) || v.drying || v.status === "available" ? 1 : 0}
              />
            );
          })}
        </svg>
      </Link>
      {caption && (
        <p className="text-sm">
          {counts.grown} of {counts.total} leaves grown
          {counts.drying > 0 && (
            <>
              {" · "}
              {counts.drying} in today's warm-up.{" "}
              <Link to="/session/revive" className="text-link underline-offset-2 hover:underline">
                Revive (≈{Math.max(1, Math.round(model.reviveSec / 60))} min)
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}
