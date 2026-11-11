// /dev/workbench (OAK_DEV=1 tooling).
import { createFileRoute } from "@tanstack/react-router";
import { WorkbenchPage } from "./-components/WorkbenchPage.tsx";

export const Route = createFileRoute("/dev/workbench")({ component: WorkbenchPage });
