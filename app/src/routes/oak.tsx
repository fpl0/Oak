// The Oak (skill map v1, ux §5.2, contracts §4 and §7.10). Three views: Tree (the skill graph by strand and
// unit, shaded by the server's mastery and freshness), Course (units and lessons with their status) and
// Leaves (a sortable table of every skill). The illustrated tree arrives in a later wave.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { clsx } from "clsx";
import { GitBranch } from "lucide-react";
import { Fragment } from "react";
import { z } from "zod";
import { usePageTitle } from "../lib/nav.ts";
import { LeavesTable, OakTree, useOak } from "../map/index.ts";
import { countLeaves } from "../map/state.ts";
import { isWritten } from "../session/edge.ts";
import { Card, Chip, EmptyState, Page, PageHeader } from "../ui/kit/basics.tsx";
import { ErrorState, LoadingState } from "../ui/kit/QueryState.tsx";
import { Tabs } from "../ui/kit/Tabs.tsx";

const searchSchema = z.object({
  view: z.enum(["tree", "course", "leaves"]).catch("tree"),
  leaf: z.string().max(12).optional().catch(undefined),
});

export const Route = createFileRoute("/oak")({
  validateSearch: (s) => searchSchema.parse(s),
  component: OakPage,
});

const STATUS_TEXT: Record<string, string> = {
  completed: "done",
  in_progress: "in progress",
  available: "open",
  locked: "not open yet",
};

function CourseView() {
  const { content, progress, model } = useOak();
  if (content.isError) return <ErrorState error={content.error} onRetry={() => void content.refetch()} />;
  if (content.isPending || progress.isPending) return <LoadingState rows={4} label="Loading the course" />;
  const units = content.data?.syllabus?.units ?? [];
  if (units.length === 0)
    return (
      <EmptyState title="No course content">
        The syllabus is empty. Run <code>bun run content:build</code> and reload.
      </EmptyState>
    );
  const status = new Map(progress.data?.lessons.map((l) => [l.lessonId, l.status]) ?? []);
  // What the Oak calls next (an unwritten lesson gives way to today's written item, use-oak.ts).
  const next = model?.next.sessionId ?? progress.data?.next ?? null;
  // Wave 6: the advanced tracks follow the core as branches, each under its own header with its honest line.
  const branchOf = new Map((model?.tracks ?? []).map((t) => [t.trackId as string, t]));
  const seenTracks = new Set<string>();
  return (
    <div className="flex flex-col gap-4">
      {progress.isError && (
        <p className="text-sm text-text-2" role="status">
          Lesson progress is unavailable right now; showing the course without it.
        </p>
      )}
      {units.map((u) => {
        const p = model?.units.get(u.id);
        const branch = u.track !== "core" ? (branchOf.get(u.track) ?? null) : null;
        const header = branch && !seenTracks.has(u.track) ? branch : null;
        if (u.track !== "core") seenTracks.add(u.track);
        const firstTrack = header !== null && seenTracks.size === 1;
        // On an open branch the header says what is written; its lessons carry no chip each.
        const unwrittenBranch = branch?.open === true && branch.next === null;
        return (
          <Fragment key={u.id}>
            {firstTrack && (
              <div className="mt-4 border-t border-border pt-4" data-testid="course-tracks">
                <h2 className="text-h2">Tracks</h2>
                <p className="text-sm text-text-2">
                  Branches off the core. The core stays your path; a track is never required.
                </p>
              </div>
            )}
            {header && (
              <div
                className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5"
                data-testid="course-branch"
                data-track={header.trackId}
                data-open={header.open}
              >
                <h3 className="flex items-center gap-1.5 text-h3">
                  <GitBranch
                    aria-hidden
                    className={clsx("size-4", header.open ? "text-accent" : "text-text-3")}
                  />
                  {header.title}
                </h3>
                <Chip tone={header.open ? "accent" : "neutral"}>{header.open ? "open" : "ahead"}</Chip>
                <span className="text-sm text-text-2">
                  {header.next ? `Next: ${header.next}.` : header.note}
                </span>
              </div>
            )}
            <Card className={clsx("p-4", p?.current && "border-accent-2")}>
              <h2 className="mb-2 flex flex-wrap items-baseline gap-x-2 text-h3">
                <span className="font-mono text-sm text-text-3">{u.id}</span>
                {u.title}
                {p && p.total > 0 && !unwrittenBranch && (
                  <span className="text-sm font-normal text-text-2">
                    {p.done} of {p.total} done
                  </span>
                )}
              </h2>
              <ol className="grid gap-1 sm:grid-cols-2">
                {u.lessons.map((l) => {
                  const st = status.get(l.id) ?? "locked";
                  return (
                    <li key={l.id} className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className={clsx(
                          "size-2.5 shrink-0 rounded-full",
                          st === "completed"
                            ? "bg-accent"
                            : st === "in_progress"
                              ? "bg-accent-2"
                              : st === "available"
                                ? "border border-accent"
                                : "bg-border",
                        )}
                      />
                      {st === "locked" || (model && !isWritten(l.id, model.authored)) ? (
                        <span className="text-text-3">{l.title}</span>
                      ) : (
                        <Link
                          to="/learn/$lessonId"
                          params={{ lessonId: l.id }}
                          search={{ from: "map" }}
                          className="text-link"
                        >
                          {l.title}
                        </Link>
                      )}
                      <span className="sr-only">({STATUS_TEXT[st] ?? st})</span>
                      {next === l.id && <Chip tone="amber">next</Chip>}
                      {st !== "locked" &&
                        st !== "completed" &&
                        !unwrittenBranch &&
                        model &&
                        !isWritten(l.id, model.authored) && <Chip>being written</Chip>}
                      {l.optional && <Chip>optional</Chip>}
                    </li>
                  );
                })}
              </ol>
            </Card>
          </Fragment>
        );
      })}
    </div>
  );
}

function OakPage() {
  usePageTitle("The Oak");
  const { view, leaf } = Route.useSearch();
  const navigate = useNavigate({ from: "/oak" });
  const { model, map } = useOak();
  const counts = model
    ? countLeaves(
        model.graph.nodes.map((n) => n.id),
        model.states,
      )
    : null;
  const sub =
    counts && map.data
      ? `${counts.grown} of ${counts.total} leaves grown${
          counts.byStatus.introduced > 0 ? `, ${counts.byStatus.introduced} introduced` : ""
        }.${
          counts.drying > 0
            ? ` ${counts.drying} ${counts.drying === 1 ? "is" : "are"} in today's warm-up.`
            : ""
        }`
      : "Every skill in the course, from first pulse to reharmonization.";
  return (
    <Page width="full" className="max-w-[1600px] pt-5 pb-4">
      <PageHeader
        title="The Oak"
        sub={sub}
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
      {view === "tree" && <OakTree key={leaf ?? "tree"} leaf={leaf ?? null} />}
      {view === "course" && <CourseView />}
      {view === "leaves" && <LeavesTable />}
    </Page>
  );
}
