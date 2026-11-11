// Settings › Tutor. The page lives in app/src/tutor/TutorSettings.tsx.
import { createFileRoute } from "@tanstack/react-router";
import { usePageTitle } from "../../lib/nav.ts";
import { TutorSettingsPage } from "../../tutor/TutorSettings.tsx";

export const Route = createFileRoute("/settings/tutor")({ component: Page });

function Page() {
  usePageTitle("Settings · Tutor");
  return <TutorSettingsPage />;
}
