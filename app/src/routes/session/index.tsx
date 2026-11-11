// /session: the running session (warm-up → New → Make), app/src/session/host/SessionHost.tsx.
import { createFileRoute } from "@tanstack/react-router";
import { SessionHost } from "../../session/host/SessionHost.tsx";

export const Route = createFileRoute("/session/")({ component: SessionHost });
