// Progress (ux §2.3, §5.5): app/src/session/progress/ProgressPage.tsx.
import { createFileRoute } from "@tanstack/react-router";
import { ProgressPage } from "../session/progress/ProgressPage.tsx";

export const Route = createFileRoute("/progress")({ component: ProgressPage });
