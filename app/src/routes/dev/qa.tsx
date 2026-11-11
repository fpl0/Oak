// /dev/qa (OAK_DEV=1 tooling).
import { createFileRoute } from "@tanstack/react-router";
import { QaPage } from "./-components/QaPage.tsx";

export const Route = createFileRoute("/dev/qa")({ component: QaPage });
