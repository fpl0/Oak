// `/album` (ux §5.3): the album as a record sleeve. The screen is app/src/album.
import { createFileRoute } from "@tanstack/react-router";
import { AlbumPage } from "../../album/AlbumPage.tsx";

export const Route = createFileRoute("/album/")({ component: AlbumPage });
