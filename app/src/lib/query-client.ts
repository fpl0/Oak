import { OakApiError } from "@oak/api";
import { QueryClient } from "@tanstack/react-query";

/** No retry for answers that will not change on a retry (server down, missing item, contract mismatch). */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (
    error instanceof OakApiError &&
    ["network", "not_found", "contract", "forbidden", "bad_request"].includes(error.code)
  )
    return false;
  return failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        staleTime: 10_000,
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },
    },
  });
}
