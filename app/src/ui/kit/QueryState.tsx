// Loading, error and empty states for server data. Every page renders through these so the three states look
// and read the same everywhere.
import { OakApiError } from "@oak/api";
import type { UseQueryResult } from "@tanstack/react-query";
import { CloudOff, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./Button.tsx";
import { EmptyState, Skeleton } from "./basics.tsx";

/** Learner-facing copy for an API failure. Never shows a stack or a raw status line. */
export function describeError(error: unknown): { title: string; body: string } {
  if (error instanceof OakApiError) {
    switch (error.code) {
      case "network":
        return {
          title: "Oak's server isn't answering",
          body: "Start it with `bun run dev` (or `bun run oak`) and this page will fill in.",
        };
      case "not_found":
        return { title: "Nothing here", body: "This item doesn't exist, or it was deleted." };
      case "contract":
        return {
          title: "The server and the app disagree",
          body: "They are from different versions. Restart Oak to bring them back in step.",
        };
      case "forbidden":
        return { title: "Request refused", body: "Oak only answers its own page on this computer." };
      default:
        return { title: "Something went wrong", body: error.message };
    }
  }
  return { title: "Something went wrong", body: error instanceof Error ? error.message : String(error) };
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { title, body } = describeError(error);
  return (
    <div role="alert" data-state="error">
      <EmptyState
        icon={<CloudOff aria-hidden />}
        title={title}
        action={
          onRetry && (
            <Button icon={<RotateCcw aria-hidden className="size-4" />} onClick={onRetry}>
              Try again
            </Button>
          )
        }
      >
        {body}
      </EmptyState>
    </div>
  );
}

export function LoadingState({ rows = 3, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} data-state="loading" className="flex flex-col gap-3">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

/**
 * Renders `children(data)` once a query has data, a skeleton while it loads, an error state with retry when it
 * fails, and `empty` when `isEmpty(data)` holds.
 */
export function QueryView<T>({
  query,
  children,
  empty,
  isEmpty,
  loading,
}: {
  query: Pick<UseQueryResult<T>, "data" | "error" | "isPending" | "isError" | "refetch">;
  children: (data: T) => ReactNode;
  empty?: ReactNode;
  isEmpty?: (data: T) => boolean;
  loading?: ReactNode;
}) {
  if (query.isPending) return <>{loading ?? <LoadingState />}</>;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const data = query.data as T;
  if (empty !== undefined && isEmpty?.(data)) return <div data-state="empty">{empty}</div>;
  return <>{children(data)}</>;
}
