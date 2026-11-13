// /transcribe (contracts §11.9): the ladder, the Transcription Gym's next session, the learner's own audio and
// every project. The page lives in app/src/transcribe.
import { createFileRoute } from "@tanstack/react-router";
import { usePageTitle } from "../../lib/nav.ts";
import { ProjectList } from "../../transcribe/ProjectList.tsx";
import { Page } from "../../ui/kit/basics.tsx";

export const Route = createFileRoute("/transcribe/")({ component: TranscribeList });

function TranscribeList() {
  usePageTitle("Transcribe");
  return (
    <Page>
      <ProjectList />
    </Page>
  );
}
