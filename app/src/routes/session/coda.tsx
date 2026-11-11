// The Coda (focus mode, ux §1.5): app/src/session/coda/CodaPage.tsx.
import { createFileRoute } from "@tanstack/react-router";
import { CodaPage } from "../../session/coda/CodaPage.tsx";

export const Route = createFileRoute("/session/coda")({ component: CodaPage });
