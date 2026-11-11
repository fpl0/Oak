// Today (ux §1.4). The page lives in app/src/session/today/TodayPage.tsx.
import { createFileRoute } from "@tanstack/react-router";
import { apiQuery } from "../lib/queries.ts";
import { TodayPage } from "../session/today/TodayPage.tsx";

export const Route = createFileRoute("/")({
  loader: ({ context }) => {
    // Warm the cache; the page renders its own loading states, so failures are not awaited here.
    void context.queryClient.prefetchQuery(apiQuery("session.today", {}));
    void context.queryClient.prefetchQuery(apiQuery("bootstrap"));
  },
  component: TodayPage,
});
