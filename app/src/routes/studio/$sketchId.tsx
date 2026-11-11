// One sketch (Studio). Title (inline edit), versions, the code, archive and delete are live. The playable
// workbench is built under app/src/workbench (its own owner) and mounts in the marked slot.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Archive, Trash2 } from "lucide-react";
import { useState } from "react";
import { formatDate, formatKey } from "../../lib/format.ts";
import { usePageTitle } from "../../lib/nav.ts";
import { useSketch, useSketchDelete, useSketchPatch } from "../../lib/queries.ts";
import { keyScope } from "../../ui/keys/KeymapProvider.tsx";
import { Button } from "../../ui/kit/Button.tsx";
import { Card, Chip, Page, WavePlaceholder } from "../../ui/kit/basics.tsx";
import { QueryView } from "../../ui/kit/QueryState.tsx";
import { toast } from "../../ui/kit/Toast.tsx";

export const Route = createFileRoute("/studio/$sketchId")({ component: SketchPage });

function SketchPage() {
  const { sketchId } = Route.useParams();
  const navigate = useNavigate();
  const sketch = useSketch(sketchId);
  const patch = useSketchPatch();
  const del = useSketchDelete();
  const [version, setVersion] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  usePageTitle(sketch.data?.title ?? "Sketch");

  return (
    <Page>
      <div {...keyScope("studio")}>
        <QueryView query={sketch}>
          {(s) => {
            const current =
              s.versions.find((v) => v.version === (version ?? s.currentVersion)) ?? s.versions.at(-1);
            const rename = (title: string) => {
              setEditing(false);
              const t = title.trim();
              if (t && t !== s.title) patch.mutate({ params: { id: s.id }, body: { title: t } });
            };
            return (
              <div className="flex flex-col gap-4">
                <header className="flex flex-wrap items-center justify-between gap-3">
                  {editing ? (
                    <input
                      // biome-ignore lint/a11y/noAutofocus: the learner just asked to rename.
                      autoFocus
                      aria-label="Sketch title"
                      defaultValue={s.title}
                      onBlur={(e) => rename(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") rename(e.currentTarget.value);
                        if (e.key === "Escape") setEditing(false);
                      }}
                      className="h-10 min-w-64 rounded-control border border-border bg-surface px-2 font-display text-h2"
                    />
                  ) : (
                    <h1 className="text-h1">
                      <button
                        type="button"
                        onClick={() => setEditing(true)}
                        className="rounded-control text-left hover:bg-surface-2"
                        title="Rename"
                      >
                        {s.title}
                      </button>
                    </h1>
                  )}
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-sm text-text-2">
                      Version
                      <select
                        value={current?.version ?? ""}
                        onChange={(e) => setVersion(Number(e.target.value))}
                        className="h-8 rounded-control border border-border bg-surface px-2 text-text"
                      >
                        {[...s.versions].reverse().map((v) => (
                          <option key={v.version} value={v.version}>
                            v{v.version} · {formatDate(v.createdAt, true)}
                            {v.note ? ` · ${v.note}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button
                      variant="ghost"
                      icon={<Archive aria-hidden className="size-4" />}
                      onClick={() => patch.mutate({ params: { id: s.id }, body: { archived: !s.archived } })}
                    >
                      {s.archived ? "Unarchive" : "Archive"}
                    </Button>
                    <Button
                      variant="ghost"
                      icon={<Trash2 aria-hidden className="size-4" />}
                      loading={del.isPending}
                      onClick={async () => {
                        try {
                          const r = await del.mutateAsync({
                            target: s.id,
                            question: `Delete the sketch “${s.title}” and all ${s.versions.length} versions? This cannot be undone.`,
                            input: { params: { id: s.id } },
                          });
                          if (r) {
                            toast.success("Sketch deleted");
                            void navigate({ to: "/studio" });
                          }
                        } catch (e) {
                          toast.error(
                            "Couldn't delete the sketch",
                            e instanceof Error ? e.message : undefined,
                          );
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </header>
                {current && (
                  <p className="flex flex-wrap gap-2 text-sm">
                    {current.key && <Chip>{formatKey(current.key)}</Chip>}
                    {current.bpm && <Chip>{current.bpm} BPM</Chip>}
                    {current.meter && <Chip>{current.meter}</Chip>}
                    {current.tutorAssisted && <Chip tone="amber">tutor-assisted</Chip>}
                    {s.originId && s.originKind === "lesson-make" && (
                      <Link to="/learn/$lessonId" params={{ lessonId: s.originId }} className="text-link">
                        from {s.originId}
                      </Link>
                    )}
                  </p>
                )}
                <WavePlaceholder feature="The Studio workbench (editor, roll, staff, layers)">
                  <Card className="overflow-hidden">
                    <figure className="m-0">
                      <figcaption className="sr-only">Code of version {current?.version ?? ""}</figcaption>
                      <pre className="max-h-[50vh] overflow-auto p-4 font-mono text-sm leading-relaxed">
                        {current?.code ?? ""}
                      </pre>
                    </figure>
                  </Card>
                </WavePlaceholder>
                {s.listeningNote && (
                  <Card className="p-4">
                    <h2 className="mb-1 font-sans text-sm font-semibold text-text-2">
                      Claude's listening note
                    </h2>
                    <p>{s.listeningNote}</p>
                  </Card>
                )}
              </div>
            );
          }}
        </QueryView>
      </div>
    </Page>
  );
}
