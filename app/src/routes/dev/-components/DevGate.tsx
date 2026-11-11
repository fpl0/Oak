// The /dev/* pages exist only when the server runs with OAK_DEV=1 (contracts §11.1). The health endpoint says
// so; without it the page explains how to turn the tools on instead of showing an error.
import type { ReactNode } from "react";
import { useHealth } from "../../../lib/queries.ts";
import { EmptyState, Page } from "../../../ui/kit/basics.tsx";
import { ErrorState, LoadingState } from "../../../ui/kit/QueryState.tsx";

export function DevGate({ children }: { children: ReactNode }) {
  const health = useHealth();
  if (health.isPending)
    return (
      <Page>
        <LoadingState rows={2} label="Checking the server" />
      </Page>
    );
  if (health.isError)
    return (
      <Page>
        <ErrorState error={health.error} onRetry={() => void health.refetch()} />
      </Page>
    );
  if (!health.data.dev)
    return (
      <Page>
        <EmptyState title="Developer tools are off">
          These pages read local developer data. Start the server with <code>OAK_DEV=1</code> to use them.
        </EmptyState>
      </Page>
    );
  return <>{children}</>;
}
