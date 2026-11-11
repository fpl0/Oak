// /dev/kit (OAK_DEV=1 tooling): the UI kit gallery.
import { createFileRoute } from "@tanstack/react-router";
import { KitGallery } from "./-components/KitGallery.tsx";

export const Route = createFileRoute("/dev/kit")({ component: KitGallery });
