// One tool: signature, what it means, its demo, the concept behind it and when it unlocks. The playable demo
// (a small read-only editor) mounts in Wave 2; the demo code is shown as text now.
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useMemo } from "react";
import { useContent } from "../../lib/content.ts";
import { lessonTitles, TOOL_KIND_LABEL, titleOf, unlockSite } from "../../lib/content-model.ts";
import { formatDate } from "../../lib/format.ts";
import { usePageTitle } from "../../lib/nav.ts";
import { useUnlocks } from "../../lib/queries.ts";
import { Card, Chip, EmptyState, Page } from "../../ui/kit/basics.tsx";
import { LoadingState } from "../../ui/kit/QueryState.tsx";

export const Route = createFileRoute("/toolbox/$toolId")({ component: Tool });

function Tool() {
  const { toolId } = Route.useParams();
  const content = useContent();
  const unlocks = useUnlocks();
  const tool = content.data?.toolbox.find((t) => t.id === toolId);
  const titles = useMemo(() => lessonTitles(content.data?.syllabus ?? null), [content.data]);
  usePageTitle(tool?.code ?? "Tool");
  if (content.isPending)
    return (
      <Page width="narrow">
        <LoadingState />
      </Page>
    );
  if (!tool)
    return (
      <Page width="narrow">
        <EmptyState title="No such tool">“{toolId}” is not in the toolbox.</EmptyState>
      </Page>
    );
  const unlock = unlocks.data?.items.find((u) => u.itemId === tool.id);
  const site = unlockSite(tool);
  return (
    <Page width="narrow">
      <Link to="/toolbox" className="mb-3 inline-flex items-center gap-1 text-sm text-text-2 hover:text-text">
        <ChevronLeft aria-hidden className="size-4" /> Toolbox
      </Link>
      <header className="mb-4">
        <h1 className="font-mono text-h2">{tool.code}</h1>
        <p className="mt-2 flex flex-wrap gap-2">
          <Chip>{TOOL_KIND_LABEL[tool.kind] ?? tool.kind}</Chip>
          {unlock ? (
            <Chip tone="accent">Unlocked {formatDate(unlock.unlockedAt)}</Chip>
          ) : (
            <Chip>
              Unlocks at {site} {titles.has(site) ? `· ${titleOf(site, titles)}` : ""}
            </Chip>
          )}
          {tool.audible === false && <Chip tone="issue">not audible in this sound pack</Chip>}
        </p>
      </header>
      <div className="flex flex-col gap-4">
        <Card className="p-4">
          <h2 className="mb-1 font-sans text-sm font-semibold text-text-2">Signature</h2>
          <code className="font-mono">{tool.catalog.signature}</code>
          <h2 className="mt-4 mb-1 font-sans text-sm font-semibold text-text-2">What it does</h2>
          <p className="whitespace-pre-wrap">{tool.catalog.meaning}</p>
          <h2 className="mt-4 mb-1 font-sans text-sm font-semibold text-text-2">Why it's in your toolbox</h2>
          <p>{tool.concept}</p>
        </Card>
        <Card className="overflow-hidden">
          <h2 className="px-4 pt-3 font-sans text-sm font-semibold text-text-2">Demo</h2>
          <pre className="overflow-auto p-4 font-mono text-sm">{tool.catalog.demo}</pre>
        </Card>
      </div>
    </Page>
  );
}
