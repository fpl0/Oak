// Checkpoint (focus mode). The route parameter is the checkpoint ID without `.CP` for core checkpoints (`U07`) and
// the full ID for track checkpoints (`J.CP1`), contracts §11.9. The item runner is Wave 2; this page loads the
// checkpoint's definition and status. No hints and no tutor here (contracts §10.2).
import { checkpointFromRouteParam } from "@oak/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useContent } from "../../lib/content.ts";
import { formatDate, pct } from "../../lib/format.ts";
import { usePageTitle } from "../../lib/nav.ts";
import { useCourseProgress } from "../../lib/queries.ts";
import { buttonClass } from "../../ui/kit/Button.tsx";
import { Card, Chip, EmptyState, Page, WavePlaceholder } from "../../ui/kit/basics.tsx";
import { ErrorState, LoadingState } from "../../ui/kit/QueryState.tsx";
import { useFocusHeaderContent } from "../../ui/shell/focus-header.ts";

export const Route = createFileRoute("/checkpoint/$unitId")({ component: Checkpoint });

function Checkpoint() {
  const { unitId } = Route.useParams();
  const cpId = checkpointFromRouteParam(unitId);
  const content = useContent();
  const progress = useCourseProgress();
  const meta = content.data?.checkpoints.find((c) => c.id === cpId);
  const title = meta ? `Checkpoint · ${meta.title}` : `Checkpoint ${unitId}`;
  usePageTitle(title);
  useFocusHeaderContent(title);

  if (!cpId)
    return (
      <Page width="narrow">
        <EmptyState
          title="No such checkpoint"
          action={
            <Link to="/" className={buttonClass("primary")}>
              Back to Today
            </Link>
          }
        >
          “{unitId}” is not a checkpoint.
        </EmptyState>
      </Page>
    );
  if (content.isPending || progress.isPending)
    return (
      <Page width="narrow">
        <LoadingState />
      </Page>
    );
  const status = progress.data?.checkpoints.find((c) => c.cpId === cpId);
  return (
    <Page width="narrow">
      <div className="flex flex-col gap-4">
        <header>
          <p className="font-mono text-sm text-text-3">{cpId}</p>
          <h1 className="text-h1">{meta?.title ?? cpId}</h1>
          <p className="mt-1 text-text-2">
            No hints, no rush. About 20 minutes; you can split it over two days.
          </p>
        </header>
        {progress.isError ? (
          <ErrorState error={progress.error} onRetry={() => void progress.refetch()} />
        ) : (
          <Card className="flex flex-wrap items-center gap-3 p-4">
            <Chip
              tone={
                status?.status === "passed" || status?.status === "soft-passed"
                  ? "accent"
                  : status?.status === "failed"
                    ? "issue"
                    : "neutral"
              }
            >
              {status?.status ?? "locked"}
            </Chip>
            <span className="text-sm text-text-2">
              {status?.attempts ?? 0} attempt{status?.attempts === 1 ? "" : "s"}
              {status?.lastScore !== null &&
                status?.lastScore !== undefined &&
                ` · last ${pct(status.lastScore)}`}
              {status?.pendingAttemptAt && ` · unfinished since ${formatDate(status.pendingAttemptAt)}`}
            </span>
          </Card>
        )}
        <WavePlaceholder feature="The checkpoint runner">
          {meta && (
            <p className="text-sm text-text-2">
              Covers {meta.covers.join(", ")} · counted skills: {meta.gated.join(", ") || "none"}
              {meta.levelSetting.length > 0 && ` · level-setting: ${meta.levelSetting.join(", ")}`}
            </p>
          )}
        </WavePlaceholder>
      </div>
    </Page>
  );
}
