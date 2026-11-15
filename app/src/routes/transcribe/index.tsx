// /transcribe (contracts §11.9): the ladder, the Transcription Gym's next session, the learner's own audio and
// every project. Wave 7: `?item=jazz:blues:F` opens one of the gym's generated jazz or rhythm items, and
// `?analyse=song.bye-bye-blackbird` a standard's analysis, after the core. The pages live in app/src/transcribe.
import { createFileRoute } from "@tanstack/react-router";
import { usePageTitle } from "../../lib/nav.ts";
import { AnalysisPage, GymItemPage } from "../../transcribe/GymPages.tsx";
import { ProjectList } from "../../transcribe/ProjectList.tsx";
import { Page } from "../../ui/kit/basics.tsx";

interface TranscribeSearch {
  item?: string;
  analyse?: string;
}

const text = (v: unknown): string | undefined =>
  typeof v === "string" && /^[A-Za-z0-9.:#-]{1,64}$/.test(v) ? v : undefined;

export const Route = createFileRoute("/transcribe/")({
  validateSearch: (s: Record<string, unknown>): TranscribeSearch => {
    const item = text(s.item);
    const analyse = text(s.analyse);
    return { ...(item ? { item } : {}), ...(analyse ? { analyse } : {}) };
  },
  component: TranscribeList,
});

function TranscribeList() {
  const { item, analyse } = Route.useSearch();
  usePageTitle(item ? "Transcription Gym" : analyse ? "Analysis" : "Transcribe");
  return (
    <Page>
      {item ? <GymItemPage itemId={item} /> : analyse ? <AnalysisPage songId={analyse} /> : <ProjectList />}
    </Page>
  );
}
