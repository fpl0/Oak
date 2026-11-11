// Album (ux §5.3): side A (core capstones), side B (advanced capstones), B-sides (promoted sketches).
import type { AlbumTrack } from "@oak/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FLAVOUR_LABEL, formatDate } from "../../lib/format.ts";
import { usePageTitle } from "../../lib/nav.ts";
import { useAlbum } from "../../lib/queries.ts";
import { AlbumCover } from "../../ui/AlbumCover.tsx";
import { RingIcon } from "../../ui/icons/index.tsx";
import { EmptyState, Page, PageHeader } from "../../ui/kit/basics.tsx";
import { QueryView } from "../../ui/kit/QueryState.tsx";

export const Route = createFileRoute("/album/")({ component: Album });

const SIDES: { side: AlbumTrack["side"]; title: string; sub: string }[] = [
  { side: "A", title: "Side A", sub: "Core capstones" },
  { side: "B", title: "Side B", sub: "Track capstones" },
  { side: "Bside", title: "B-sides", sub: "Sketches you promoted" },
];

function Album() {
  usePageTitle("Album");
  const album = useAlbum();
  return (
    <Page>
      <PageHeader title="Album" sub="Every capstone you release lands here, with its liner notes." />
      <QueryView
        query={album}
        isEmpty={(d) => d.tracks.length === 0}
        empty={
          <EmptyState icon={<RingIcon size={32} />} title="Your album is waiting for its first track">
            Capstones release here. The first one comes after unit 2.
          </EmptyState>
        }
      >
        {(d) => (
          <div className="flex flex-col gap-8">
            {SIDES.map(({ side, title, sub }) => {
              const tracks = d.tracks.filter((t) => t.side === side).sort((a, b) => a.trackNo - b.trackNo);
              if (tracks.length === 0) return null;
              return (
                <section key={side} aria-labelledby={`side-${side}`}>
                  <h2 id={`side-${side}`} className="text-h2">
                    {title}
                  </h2>
                  <p className="mb-3 text-text-2">{sub}</p>
                  <ol className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                    {tracks.map((t) => (
                      <li key={t.id}>
                        <Link
                          to="/album/$trackId"
                          params={{ trackId: t.id }}
                          className="group flex flex-col gap-2 rounded-card"
                        >
                          <AlbumCover seed={t.coverSeed} title={t.title} size={160} />
                          <span>
                            <span className="text-sm text-text-3">{t.trackNo}. </span>
                            <span className="font-medium group-hover:underline">{t.title}</span>
                          </span>
                          <span className="text-sm text-text-2">
                            {t.flavour ? `${FLAVOUR_LABEL[t.flavour] ?? t.flavour} · ` : ""}
                            {formatDate(t.createdAt, true)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                </section>
              );
            })}
          </div>
        )}
      </QueryView>
    </Page>
  );
}
