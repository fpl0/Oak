import type { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen.ts";
import { ErrorState, LoadingState } from "./ui/kit/QueryState.tsx";
import { NotFound } from "./ui/shell/NotFound.tsx";

export interface RouterContext {
  queryClient: QueryClient;
}

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    // Server data is cached by TanStack Query; the router does not cache loader results itself.
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    defaultPendingComponent: () => (
      <div className="p-6">
        <LoadingState />
      </div>
    ),
    defaultErrorComponent: ({ error, reset }) => (
      <div className="p-6">
        <ErrorState error={error} onRetry={reset} />
      </div>
    ),
    defaultNotFoundComponent: NotFound,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
