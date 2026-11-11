// Toolbox (ux §5.1): every tool, sound, scale and chord, unlocked or with the session that unlocks it.
import type { ToolEntry } from "@oak/api";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { clsx } from "clsx";
import { Lock } from "lucide-react";
import { useMemo, useState } from "react";
import { z } from "zod";
import { useContent } from "../../lib/content.ts";
import { lessonTitles, TOOL_KIND_LABEL, unlockSite } from "../../lib/content-model.ts";
import { usePageTitle } from "../../lib/nav.ts";
import { useUnlocks } from "../../lib/queries.ts";
import { Card, Chip, EmptyState, Page, PageHeader } from "../../ui/kit/basics.tsx";
import { ErrorState, LoadingState } from "../../ui/kit/QueryState.tsx";
import { Tabs } from "../../ui/kit/Tabs.tsx";

const searchSchema = z.object({ cat: z.string().optional().catch(undefined) });

export const Route = createFileRoute("/toolbox/")({
  validateSearch: (s) => searchSchema.parse(s),
  component: Toolbox,
});

function Toolbox() {
  usePageTitle("Toolbox");
  const { cat } = Route.useSearch();
  const navigate = useNavigate({ from: "/toolbox/" });
  const content = useContent();
  const unlocks = useUnlocks();
  const [showLocked, setShowLocked] = useState(true);
  const titles = useMemo(() => lessonTitles(content.data?.syllabus ?? null), [content.data]);
  const unlocked = new Set(unlocks.data?.items.map((u) => u.itemId) ?? []);
  const kinds = useMemo(() => [...new Set(content.data?.toolbox.map((t) => t.kind) ?? [])], [content.data]);
  const active = cat && kinds.includes(cat as ToolEntry["kind"]) ? cat : "all";

  if (content.isPending)
    return (
      <Page>
        <LoadingState />
      </Page>
    );
  if (content.isError)
    return (
      <Page>
        <ErrorState error={content.error} />
      </Page>
    );
  const tools = (content.data?.toolbox ?? []).filter(
    (t) => (active === "all" || t.kind === active) && (showLocked || unlocked.has(t.id)),
  );
  return (
    <Page>
      <PageHeader
        title="Toolbox"
        sub={
          unlocks.data
            ? `${unlocks.data.items.length} unlocked so far.`
            : unlocks.isError
              ? "Your unlocks could not be loaded."
              : " "
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs
          label="Category"
          value={active}
          onChange={(v) => void navigate({ search: v === "all" ? {} : { cat: v } })}
          items={[
            { value: "all", label: "All" },
            ...kinds.map((k) => ({ value: k, label: TOOL_KIND_LABEL[k] ?? k })),
          ]}
        />
        <label className="flex items-center gap-2 text-sm text-text-2">
          <input
            type="checkbox"
            checked={showLocked}
            onChange={(e) => setShowLocked(e.target.checked)}
            className="accent-[var(--oak-accent)]"
          />
          Show locked
        </label>
      </div>
      {tools.length === 0 ? (
        <EmptyState title="Nothing here yet">Tools unlock as lessons introduce them.</EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((t) => {
            const open = unlocked.has(t.id);
            const site = unlockSite(t);
            return (
              <li key={t.id}>
                <Link to="/toolbox/$toolId" params={{ toolId: t.id }} className="block rounded-card">
                  <Card
                    interactive
                    className={clsx("flex h-full flex-col gap-1.5 p-4", !open && "opacity-70")}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <code className="truncate font-mono text-sm text-text">{t.code}</code>
                      {!open && <Lock aria-label="locked" className="size-3.5 shrink-0 text-text-3" />}
                    </span>
                    <span className="line-clamp-2 text-sm text-text-2">{t.concept}</span>
                    <span className="mt-auto flex flex-wrap gap-1 pt-1">
                      <Chip>{TOOL_KIND_LABEL[t.kind] ?? t.kind}</Chip>
                      {!open && site && <Chip title={titles.get(site)}>Unlocks at {site}</Chip>}
                    </span>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}
