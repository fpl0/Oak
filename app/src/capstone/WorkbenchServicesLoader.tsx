// Loads the workbench services (the app's one adapter and grader host) for a page that needs a Workbench at once.
// The adapter may exist before a gesture; audio unlocks on the first Play or key press (app/src/lib/oak.ts).
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { appWorkbenchServices } from "../lib/workbench-services.ts";
import { Button } from "../ui/kit/Button.tsx";
import { Skeleton } from "../ui/kit/basics.tsx";
import { WorkbenchServicesProvider } from "../workbench/services.tsx";

export function WorkbenchServicesLoader({ children, label }: { children: ReactNode; label: string }) {
  const services = useQuery({
    queryKey: ["workbench-services"],
    queryFn: appWorkbenchServices,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: 0,
  });
  if (services.data)
    return <WorkbenchServicesProvider value={services.data}>{children}</WorkbenchServicesProvider>;
  if (services.isError)
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-3 rounded-card border border-border bg-surface p-5"
      >
        <p className="font-medium">Sound did not start</p>
        <p className="text-sm text-text-2">
          {services.error instanceof Error ? services.error.message : "The audio engine failed to load."} Your
          draft is saved on the server; nothing is lost.
        </p>
        <Button onClick={() => void services.refetch()}>Try again</Button>
      </div>
    );
  return (
    <div className="flex flex-col gap-3" role="status" aria-busy="true" aria-label={label}>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-56 w-full" />
      <Skeleton className="h-40 w-full" />
      <p className="text-sm text-text-3">Waking the workbench…</p>
    </div>
  );
}
