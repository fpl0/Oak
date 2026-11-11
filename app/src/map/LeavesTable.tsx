// The Leaves tab: every skill with its state, sortable by any column (ux §5.2). A row's name opens the
// leaf on the map.
import { Link } from "@tanstack/react-router";
import { clsx } from "clsx";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useState } from "react";
import { REGION_LABEL } from "../lib/content-model.ts";
import { Chip } from "../ui/kit/basics.tsx";
import { ErrorState, LoadingState } from "../ui/kit/QueryState.tsx";
import { LeafSwatch } from "./Leaf.tsx";
import { type LeafColumn, leafRows, sortLeaves } from "./leaves.ts";
import { leafView, pctText, STATUS_LABEL } from "./state.ts";
import { useOak } from "./use-oak.ts";

const HEADERS: { col: LeafColumn; label: string; numeric?: boolean }[] = [
  { col: "name", label: "Skill" },
  { col: "strand", label: "Strand" },
  { col: "unit", label: "Unit" },
  { col: "status", label: "Status" },
  { col: "strength", label: "Strength", numeric: true },
  { col: "recall", label: "Recall", numeric: true },
  { col: "freshness", label: "Freshness", numeric: true },
];

export function LeavesTable() {
  const { model, content, map } = useOak();
  const [sort, setSort] = useState<{ by: LeafColumn; dir: "asc" | "desc" }>({ by: "course", dir: "asc" });
  if (content.isError) return <ErrorState error={content.error} onRetry={() => void content.refetch()} />;
  if (!model || map.isPending) return <LoadingState rows={6} label="Loading the leaves" />;
  const rows = sortLeaves(
    leafRows(model.graph.nodes, model.states),
    sort.by,
    sort.dir,
    model.graph.regions,
    model.graph.units.map((u) => u.id),
  );
  const toggle = (col: LeafColumn) =>
    setSort((s) =>
      s.by === col
        ? { by: col, dir: s.dir === "asc" ? "desc" : "asc" }
        : { by: col, dir: col === "name" ? "asc" : "desc" },
    );
  return (
    <div className="flex flex-col gap-2">
      {map.isError && (
        <p className="text-sm text-text-2" role="status">
          Your progress could not be loaded, so every leaf shows as not open yet.
        </p>
      )}
      <div className="flex items-center justify-between gap-2 text-sm text-text-2">
        <p>{rows.length} skills. Sort by any column; select a name to see it on the map.</p>
        {sort.by !== "course" && (
          <button
            type="button"
            className="text-link underline-offset-2 hover:underline"
            onClick={() => setSort({ by: "course", dir: "asc" })}
          >
            Back to course order
          </button>
        )}
      </div>
      <div className="overflow-auto rounded-card border border-border">
        <table className="w-full text-sm" data-testid="leaves-table">
          <caption className="sr-only">Every skill with its status, strength, recall and freshness</caption>
          <thead className="sticky top-0 bg-surface-2 text-left text-text-2">
            <tr>
              {HEADERS.map((h) => {
                const active = sort.by === h.col;
                return (
                  <th
                    key={h.col}
                    scope="col"
                    aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                    className={clsx("px-3 py-2 font-medium", h.numeric && "text-right")}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(h.col)}
                      className={clsx(
                        "inline-flex items-center gap-1 rounded-control hover:text-text",
                        active && "text-text",
                      )}
                    >
                      {h.label}
                      {active &&
                        (sort.dir === "asc" ? (
                          <ArrowUp aria-hidden className="size-3.5" />
                        ) : (
                          <ArrowDown aria-hidden className="size-3.5" />
                        ))}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface">
            {rows.map((r) => {
              const v = leafView(model.states.get(r.node.id));
              return (
                <tr key={r.node.id} data-leaf-row={r.node.id}>
                  <td className="px-3 py-1.5">
                    <Link
                      to="/oak"
                      search={{ view: "tree", leaf: r.node.id }}
                      className="inline-flex items-center gap-2 underline-offset-2 hover:underline"
                    >
                      <LeafSwatch view={v} />
                      <span className="font-mono text-text-3">{r.node.id}</span>
                      {r.node.name}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5 text-text-2">{REGION_LABEL[r.node.region]}</td>
                  <td className="px-3 py-1.5 font-mono text-text-2">{r.node.unit}</td>
                  <td className="px-3 py-1.5">
                    {STATUS_LABEL[r.status]}
                    {r.drying && (
                      <Chip tone="amber" className="ml-2">
                        in today's warm-up
                      </Chip>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{pctText(r.strength)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{pctText(r.recall)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{pctText(r.freshness)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
