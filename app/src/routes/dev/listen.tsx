// /dev/listen (OAK_DEV=1 tooling).
import { createFileRoute } from "@tanstack/react-router";
import { ListenPage } from "./-components/ListenPage.tsx";

export const Route = createFileRoute("/dev/listen")({ component: ListenPage });
