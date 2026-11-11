// /dev/glance (OAK_DEV=1): the mini Oak the Today page places (ux §1.4), at its two sizes, for review.
import { createFileRoute } from "@tanstack/react-router";
import { GlancePage } from "./-components/GlancePage.tsx";

export const Route = createFileRoute("/dev/glance")({ component: GlancePage });
