// /transcribe/$projectId (ux §9): one project — the source, the transport and A/B, the learner's Workbench, and
// the ladder item's Check or own audio's bars, sections and checklist. The page lives in app/src/transcribe.
import { createFileRoute } from "@tanstack/react-router";
import { useTranscription } from "../../lib/queries.ts";
import { ProjectPage } from "../../transcribe/ProjectPage.tsx";
import { Page } from "../../ui/kit/basics.tsx";
import { LoadingState, QueryView } from "../../ui/kit/QueryState.tsx";

export const Route = createFileRoute("/transcribe/$projectId")({ component: ProjectRoute });

function ProjectRoute() {
  const { projectId } = Route.useParams();
  const t = useTranscription(projectId);
  return (
    <QueryView
      query={t}
      loading={
        <Page>
          <LoadingState label="Opening the project" />
        </Page>
      }
    >
      {(p) => <ProjectPage key={p.id} project={p} />}
    </QueryView>
  );
}
