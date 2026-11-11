// Studio (ux §2.3): the sketchbook and free play. The list, filters, search and "New sketch" are live; the
// workbench opens on /studio/$sketchId.
import type { Sketch } from "@oak/api";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { NotebookPen, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { formatDate } from "../../lib/format.ts";
import { usePageTitle } from "../../lib/nav.ts";
import { type SketchOrigin, useSketchCreate, useSketches } from "../../lib/queries.ts";
import { Button } from "../../ui/kit/Button.tsx";
import { Card, Chip, EmptyState, Page, PageHeader } from "../../ui/kit/basics.tsx";
import { QueryView } from "../../ui/kit/QueryState.tsx";
import { Tabs } from "../../ui/kit/Tabs.tsx";
import { toast } from "../../ui/kit/Toast.tsx";

const searchSchema = z.object({ new: z.boolean().optional().catch(undefined) });

export const Route = createFileRoute("/studio/")({
  validateSearch: (s) => searchSchema.parse(s),
  component: StudioList,
});

type Filter = "all" | "free" | "lesson-make" | "capstone" | "transcription";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "free", label: "Mine" },
  { value: "lesson-make", label: "From lessons" },
  { value: "capstone", label: "Capstone drafts" },
  { value: "transcription", label: "Transcriptions" },
];
const ORIGIN_LABEL: Record<Sketch["originKind"], string> = {
  "lesson-make": "lesson",
  free: "free play",
  capstone: "capstone",
  transcription: "transcription",
  tutor: "tutor",
  keepalive: "keep-alive",
  checkpoint: "checkpoint",
};

const BLANK_SKETCH = 'setcpm(90/4)\n\ndrums: s("bd ~ sd ~")\n';

function StudioList() {
  usePageTitle("Studio");
  const { new: wantsNew } = Route.useSearch();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"recent" | "title">("recent");
  const sketches = useSketches(filter === "all" ? undefined : (filter as SketchOrigin));
  const create = useSketchCreate();
  const started = useRef(false);

  const newSketch = async () => {
    try {
      const n = (sketches.data?.items.length ?? 0) + 1;
      const saved = await create.mutateAsync({
        body: {
          title: `Sketch ${String(n).padStart(3, "0")}`,
          originKind: "free",
          originId: null,
          sessionId: null,
          code: BLANK_SKETCH,
          bpm: 90,
          meter: "4/4",
          key: null,
          analysis: null,
          note: null,
          tutorAssisted: false,
          band: null,
          flags: { lockedTools: [], previewTools: [] },
          ranOk: false,
        },
      });
      void navigate({ to: "/studio/$sketchId", params: { sketchId: saved.sketch.id } });
    } catch (e) {
      toast.error("Couldn't create the sketch", e instanceof Error ? e.message : undefined);
    }
  };

  // "New sketch" from the command palette arrives as ?new=true.
  useEffect(() => {
    if (wantsNew && !started.current && sketches.isSuccess) {
      started.current = true;
      void navigate({ to: "/studio", search: {}, replace: true });
      void newSketch();
    }
  }, [wantsNew, sketches.isSuccess]);

  const visible = useMemo(() => {
    const items = sketches.data?.items ?? [];
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? items.filter(
          (s) =>
            s.title.toLowerCase().includes(needle) || s.tags.some((t) => t.toLowerCase().includes(needle)),
        )
      : items;
    return [...filtered].sort((a, b) =>
      sort === "title" ? a.title.localeCompare(b.title) : b.updatedAt.localeCompare(a.updatedAt),
    );
  }, [sketches.data, q, sort]);

  return (
    <Page>
      <PageHeader
        title="Studio"
        sub="Free play and your sketchbook."
        actions={
          <Button
            variant="primary"
            icon={<Plus aria-hidden className="size-4" />}
            loading={create.isPending}
            onClick={() => void newSketch()}
          >
            New sketch
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs<Filter> label="Show" value={filter} onChange={setFilter} items={FILTERS} />
        <label className="relative flex items-center">
          <span className="sr-only">Search sketches</span>
          <Search aria-hidden className="pointer-events-none absolute left-2 size-4 text-text-3" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            className="h-8 w-56 rounded-control border border-border bg-surface pr-2 pl-8 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-text-2">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as "recent" | "title")}
            className="h-8 rounded-control border border-border bg-surface px-2 text-text"
          >
            <option value="recent">Recent</option>
            <option value="title">Title</option>
          </select>
        </label>
      </div>
      <QueryView
        query={sketches}
        isEmpty={(d) => d.items.length === 0}
        empty={
          <EmptyState
            icon={<NotebookPen aria-hidden />}
            title="Your sketchbook fills up one session at a time."
            action={
              <Button variant="primary" onClick={() => void newSketch()}>
                New sketch
              </Button>
            }
          />
        }
      >
        {() =>
          visible.length === 0 ? (
            <p className="py-8 text-center text-text-2">No sketches match “{q}”.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((s) => (
                <li key={s.id}>
                  <Link to="/studio/$sketchId" params={{ sketchId: s.id }} className="block rounded-card">
                    <Card interactive className="flex h-full flex-col gap-1 p-4">
                      <span className="font-medium text-text">{s.title}</span>
                      <span className="text-sm text-text-2">
                        v{s.currentVersion} · {formatDate(s.updatedAt)}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        <Chip>{ORIGIN_LABEL[s.originKind]}</Chip>
                        {s.tags.map((t) => (
                          <Chip key={t}>{t}</Chip>
                        ))}
                      </span>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )
        }
      </QueryView>
    </Page>
  );
}
