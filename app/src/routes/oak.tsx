// The Oak (skill map, ux §5.2). At v1 the map renders content/.generated/skill-graph.json as a plain graph
// (contracts §4); the illustrated tree arrives later. Three views: tree (the graph), course (units and lessons
// with their status), leaves (a table of every skill's state).
import type { SkillState } from "@oak/api";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { clsx } from "clsx";
import { useMemo, useState } from "react";
import { z } from "zod";
import { useContent } from "../lib/content.ts";
import { layoutSkillGraph, type PlacedNode, REGION_LABEL } from "../lib/content-model.ts";
import { pct } from "../lib/format.ts";
import { usePageTitle } from "../lib/nav.ts";
import { useCourseProgress, useSkillMap } from "../lib/queries.ts";
import { Card, Chip, EmptyState, Page, PageHeader } from "../ui/kit/basics.tsx";
import { ErrorState, LoadingState } from "../ui/kit/QueryState.tsx";
import { Tabs } from "../ui/kit/Tabs.tsx";

const searchSchema = z.object({ view: z.enum(["tree", "course", "leaves"]).catch("tree") });

export const Route = createFileRoute("/oak")({
  validateSearch: (s) => searchSchema.parse(s),
  component: OakPage,
});

const LEVEL_STYLE: Record<SkillState["level"] | "none", string> = {
  none: "fill-surface stroke-border",
  new: "fill-surface stroke-border",
  available: "fill-surface stroke-text-3",
  learning: "fill-accent/25 stroke-accent",
  practiced: "fill-accent/60 stroke-accent",
  mastered: "fill-accent stroke-accent",
};
const LEVEL_LABEL: Record<SkillState["level"], string> = {
  new: "Not started",
  available: "Available",
  learning: "Learning",
  practiced: "Practised",
  mastered: "Mastered",
};

function TreeView({ states }: { states: Map<string, SkillState> }) {
  const content = useContent();
  const [focusId, setFocusId] = useState<string | null>(null);
  const layout = useMemo(
    () => (content.data ? layoutSkillGraph(content.data.skills, { colWidth: 132, rowHeight: 30 }) : null),
    [content.data],
  );
  if (content.isPending) return <LoadingState label="Growing the tree" />;
  if (content.isError || !layout) return <ErrorState error={content.error} />;
  if (layout.nodes.length === 0)
    return <EmptyState title="No skills yet">The content build has no skill graph.</EmptyState>;
  const pos = new Map(layout.nodes.map((n) => [n.id, n]));
  const related = new Set<string>();
  if (focusId)
    for (const [a, b] of layout.edges) {
      if (a === focusId) related.add(b);
      if (b === focusId) related.add(a);
    }
  const nodeLabel = (n: PlacedNode) => {
    const s = states.get(n.id);
    return `${n.name} (${n.id}). ${s ? LEVEL_LABEL[s.level] : "Not started"}${s?.drying ? ", drying" : ""}${n.prerequisites.length ? `. Builds on ${n.prerequisites.join(", ")}` : ""}`;
  };
  return (
    <div className="overflow-auto rounded-card border border-border bg-surface">
      {/* biome-ignore lint/a11y/useSemanticElements: an SVG group cannot be a <fieldset>. */}
      <svg
        role="group"
        aria-label="Skill graph: columns run from foundations on the left to later skills on the right"
        width={layout.width + 120}
        height={layout.height}
        className="block"
      >
        {layout.bands.map((b) => (
          <g key={b.region}>
            <rect
              x={0}
              y={b.y - 8}
              width={layout.width + 120}
              height={b.height + 4}
              className="fill-lane-in"
            />
            <text x={8} y={b.y + 4} className="fill-text-3 text-[11px] font-semibold tracking-wide uppercase">
              {REGION_LABEL[b.region]}
            </text>
          </g>
        ))}
        <g aria-hidden>
          {layout.edges.map(([a, b]) => {
            const p = pos.get(a);
            const q = pos.get(b);
            if (!p || !q) return null;
            const hot = focusId !== null && (a === focusId || b === focusId);
            return (
              <path
                key={`${a}>${b}`}
                d={`M${p.x + 112},${p.y + 14} C${p.x + 128},${p.y + 14} ${q.x - 16},${q.y + 14} ${q.x},${q.y + 14}`}
                className={clsx("fill-none", hot ? "stroke-accent" : "stroke-border")}
                strokeWidth={hot ? 1.5 : 1}
              />
            );
          })}
        </g>
        {layout.nodes.map((n) => {
          const s = states.get(n.id);
          const dim = focusId !== null && focusId !== n.id && !related.has(n.id);
          const opacity = s ? 0.35 + 0.65 * s.freshness : 1;
          return (
            // biome-ignore lint/a11y/useSemanticElements: an SVG node; buttons cannot live inside <svg>.
            <g
              key={n.id}
              role="button"
              tabIndex={0}
              aria-label={nodeLabel(n)}
              transform={`translate(${n.x},${n.y + 16})`}
              onFocus={() => setFocusId(n.id)}
              onBlur={() => setFocusId(null)}
              onMouseEnter={() => setFocusId(n.id)}
              onMouseLeave={() => setFocusId(null)}
              className={clsx(
                "cursor-default outline-none [&:focus-visible>rect]:stroke-[2.5]",
                dim && "opacity-35",
              )}
            >
              <rect
                width={112}
                height={24}
                rx={6}
                style={{ opacity: dim ? undefined : opacity }}
                className={clsx(
                  LEVEL_STYLE[s?.level ?? "none"],
                  s?.drying && "stroke-accent-2 [stroke-dasharray:3_2]",
                )}
              />
              <text
                x={8}
                y={16}
                className={clsx("text-[11px]", s?.level === "mastered" ? "fill-on-accent" : "fill-text")}
              >
                <tspan className="font-mono text-[10px] opacity-70">{n.id}</tspan>{" "}
                {n.name.length > 13 ? `${n.name.slice(0, 12)}…` : n.name}
              </text>
              <title>{nodeLabel(n)}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function CourseView() {
  const content = useContent();
  const progress = useCourseProgress();
  if (content.isPending) return <LoadingState />;
  const units = content.data?.syllabus?.units ?? [];
  const status = new Map(progress.data?.lessons.map((l) => [l.lessonId, l.status]) ?? []);
  if (units.length === 0) return <EmptyState title="No course content">The syllabus is empty.</EmptyState>;
  return (
    <div className="flex flex-col gap-4">
      {progress.isError && (
        <p className="text-sm text-text-3" role="status">
          Lesson progress is unavailable right now; showing the course without it.
        </p>
      )}
      {units.map((u) => (
        <Card key={u.id} className="p-4">
          <h2 className="mb-2 text-h3">
            <span className="mr-2 font-mono text-sm text-text-3">{u.id}</span>
            {u.title}
          </h2>
          <ol className="grid gap-1 sm:grid-cols-2">
            {u.lessons.map((l) => {
              const st = status.get(l.id) ?? "locked";
              return (
                <li key={l.id} className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={clsx(
                      "size-2.5 rounded-full",
                      st === "completed"
                        ? "bg-accent"
                        : st === "in_progress"
                          ? "bg-accent-2"
                          : st === "available"
                            ? "border border-accent"
                            : "bg-border",
                    )}
                  />
                  {st === "locked" ? (
                    <span className="text-text-3">{l.title}</span>
                  ) : (
                    <Link to="/learn/$lessonId" params={{ lessonId: l.id }} className="text-link">
                      {l.title}
                    </Link>
                  )}
                  <span className="sr-only">({st.replace("_", " ")})</span>
                  {l.optional && <Chip>optional</Chip>}
                </li>
              );
            })}
          </ol>
        </Card>
      ))}
    </div>
  );
}

function LeavesView({ states }: { states: Map<string, SkillState> }) {
  const content = useContent();
  if (content.isPending) return <LoadingState />;
  const nodes = content.data?.skills.nodes ?? [];
  return (
    <div className="overflow-auto rounded-card border border-border">
      <table className="w-full text-sm">
        <caption className="sr-only">Every skill with its level, strength and freshness</caption>
        <thead className="bg-surface-2 text-left text-text-2">
          <tr>
            <th className="px-3 py-2 font-medium">Skill</th>
            <th className="px-3 py-2 font-medium">Region</th>
            <th className="px-3 py-2 font-medium">Level</th>
            <th className="px-3 py-2 text-right font-medium">Strength</th>
            <th className="px-3 py-2 text-right font-medium">Freshness</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {nodes.map((n) => {
            const s = states.get(n.id);
            return (
              <tr key={n.id}>
                <td className="px-3 py-1.5">
                  <span className="mr-2 font-mono text-text-3">{n.id}</span>
                  {n.name}
                </td>
                <td className="px-3 py-1.5 text-text-2">{REGION_LABEL[n.region]}</td>
                <td className="px-3 py-1.5">
                  {s ? LEVEL_LABEL[s.level] : "Not started"}
                  {s?.drying && (
                    <Chip tone="amber" className="ml-2">
                      drying
                    </Chip>
                  )}
                  {s?.debt && (
                    <Chip tone="issue" className="ml-2">
                      debt
                    </Chip>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{s ? pct(s.M) : "–"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{s ? pct(s.freshness) : "–"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OakPage() {
  usePageTitle("The Oak");
  const { view } = Route.useSearch();
  const navigate = useNavigate({ from: "/oak" });
  const map = useSkillMap();
  const states = useMemo(() => new Map(map.data?.nodes.map((n) => [n.skillId, n]) ?? []), [map.data]);
  const drying = map.data?.nodes.filter((n) => n.drying).length ?? 0;
  return (
    <Page width="full" className="max-w-[1600px]">
      <PageHeader
        title="The Oak"
        sub={
          map.data
            ? drying > 0
              ? `${drying} leaves are drying. A ${Math.max(1, Math.round(map.data.reviveSec / 60))}-minute set will green them up.`
              : "Every skill you've met, from roots to crown."
            : "Every skill you've met, from roots to crown."
        }
        actions={
          <Tabs
            label="View"
            value={view}
            onChange={(v) => void navigate({ search: { view: v } })}
            items={[
              { value: "tree", label: "Tree" },
              { value: "course", label: "Course" },
              { value: "leaves", label: "Leaves" },
            ]}
          />
        }
      />
      {map.isError && (
        <p className="mb-3 text-sm text-text-3" role="status">
          Your progress could not be loaded, so every leaf shows as not started.
        </p>
      )}
      {view === "tree" && <TreeView states={states} />}
      {view === "course" && <CourseView />}
      {view === "leaves" && <LeavesView states={states} />}
    </Page>
  );
}
