// The Today page's mini Oak (ux §1.4 "TreeGlance"): the illustrated tree, small — every leaf in its place and state,
// the released tracks as acorns, the "what's next" leaves ringed — with one line of counts and a way in.
// Self-contained: it reads its own queries, so the Today page only places it.
//
//   import { OakGlance } from "../map/index.ts";
//   <OakGlance width={240} />            // 180 at 1280×800 (ux §1.4)
import { Link } from "@tanstack/react-router";
import { clsx } from "clsx";
import { useAlbum } from "../lib/queries.ts";
import { Skeleton } from "../ui/kit/basics.tsx";
import { useThemeName } from "../ui/theme/use-theme-name.ts";
import type { MapGraph } from "./graph.ts";
import { layoutIllustratedOak, TREE_SIZE, type TreeLayout } from "./illustrated/layout.ts";
import { TreeDrawing } from "./illustrated/TreeDrawing.tsx";
import { countLeaves } from "./state.ts";
import { useOak } from "./use-oak.ts";

const trees = new WeakMap<MapGraph, TreeLayout>();
function treeLayoutOf(graph: MapGraph): TreeLayout {
  let t = trees.get(graph);
  if (!t) {
    t = layoutIllustratedOak(graph);
    trees.set(graph, t);
  }
  return t;
}

export interface OakGlanceProps {
  /** Drawing width in px (240 at 1440, 180 at 1280). */
  width?: number;
  className?: string;
  /** Show the counts line and the Revive link under the picture (default true). */
  caption?: boolean;
}

export function OakGlance({ width = 240, className, caption = true }: OakGlanceProps) {
  const { model, map, content } = useOak();
  const theme = useThemeName();
  const album = useAlbum();
  const released = [...(album.data?.tracks ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (content.isError || map.isError)
    return <p className={clsx("text-sm text-text-2", className)}>The map is not available right now.</p>;
  if (!model || map.isPending)
    return (
      <div className={className} style={{ width }}>
        <Skeleton className="h-32 w-full" />
      </div>
    );
  // The illustrated tree's layout depends only on the graph: computed once per graph.
  const tree = treeLayoutOf(model.graph);
  const counts = countLeaves(
    model.graph.nodes.map((n) => n.id),
    model.states,
  );
  const next = new Set(model.next.targets);
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
        {/* The illustrated Oak itself, small (Wave 7): the same tree as /oak, so the learner's spatial memory of
            it holds everywhere. The limb names are left out at this size; leaves keep their state and acorns hang. */}
        <svg
          width={width}
          height={Math.round(width * (TREE_SIZE.height / TREE_SIZE.width))}
          viewBox={`0 0 ${TREE_SIZE.width} ${TREE_SIZE.height}`}
          aria-hidden
          className="block"
        >
          <TreeDrawing
            layout={tree}
            states={model.states}
            theme={theme}
            releasedTracks={released}
            labels={false}
            renderLeaf={(n, glyph) => (
              <g transform={`translate(${n.cx} ${n.cy})`} data-dot={n.id}>
                {next.has(n.id) && <circle r={24} fill="none" className="stroke-accent-2" strokeWidth={5} />}
                {glyph}
              </g>
            )}
          />
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
