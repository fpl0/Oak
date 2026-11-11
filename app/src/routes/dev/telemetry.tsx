// /dev/telemetry (OAK_DEV=1 tooling).
import { createFileRoute } from "@tanstack/react-router";
import { TelemetryPage } from "./-components/TelemetryPage.tsx";

export const Route = createFileRoute("/dev/telemetry")({ component: TelemetryPage });
