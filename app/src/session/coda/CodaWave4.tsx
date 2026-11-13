// The Coda's Wave 4 cards. A capstone release: the track joins the album — its Tree Rings cover, where it sits,
// "what you used" (the release's theory tags and the code it uses), and what it opens next. A gym session: a
// realism change, announced once here and never mid-item (contracts §6.12), and a ladder level-up when the server
// offers one (wave4.md §5.4), taken or left with one button. Each card reads its own data and renders nothing
// until there is something true to say.
import { toolsUsed } from "@oak/grader";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TrackCover } from "../../album/TrackCover.tsx";
import { useContent } from "../../lib/content.ts";
import { apiQuery, useAlbum, useCapstoneGate, useLadder, useLadderSetLevel } from "../../lib/queries.ts";
import { toolLabel } from "../../lib/tool-label.ts";
import { Button, buttonClass } from "../../ui/kit/Button.tsx";
import { Card, Chip } from "../../ui/kit/basics.tsx";
import { Callout } from "../../ui/kit/Controls.tsx";
import { toast } from "../../ui/kit/Toast.tsx";
import { capstoneOfSession, releaseOf, releaseTools, usedOnRelease } from "../coda-model.ts";
import { useX1Gate } from "../day-hooks.ts";
import { ladderCoda, levelName, x1Line } from "../gym-day.ts";

type CodaSession = { kind: string; mapItemId: string | null; startedAt: string; day: string };

/** The release card of a capstone session that released (or revised) its track today. */
export function ReleaseCard({ session }: { session: CodaSession }) {
  const capstoneId = capstoneOfSession(session as never);
  const album = useAlbum();
  const track = capstoneId ? album.data?.tracks.find((t) => t.capstoneId === capstoneId) : undefined;
  // No track yet (a capstone session that did not release): nothing to read.
  const detail = useQuery({
    ...apiQuery("album.track", { params: { id: track?.id ?? "none" } }),
    enabled: !!track,
  });
  const release = releaseOf(
    capstoneId,
    album.data?.tracks ?? [],
    track && detail.data?.id === track.id ? detail.data : null,
    session.startedAt,
  );
  const sketch = useQuery({
    ...apiQuery("sketches.get", { params: { id: release?.version.sketchId ?? "none" } }),
    enabled: !!release,
  });
  // A sketch read before the release (the resume card's) may not list the released version yet: read it again.
  const missing =
    !!release &&
    !!sketch.data &&
    !sketch.data.versions.some((v) => v.version === release.version.sketchVersion);
  const refetch = sketch.refetch;
  const fetching = sketch.isFetching;
  const reread = useRef(false);
  useEffect(() => {
    if (!missing || fetching || reread.current) return;
    reread.current = true;
    void refetch();
  }, [missing, fetching, refetch]);
  const content = useContent();
  const x1 = x1Line(useX1Gate());
  // X1 may open with this very release (melodic dictation already at its level): then it is simply next.
  const x1Gate = useCapstoneGate(capstoneId === "C2" ? "X1" : null);
  const x1Open = x1Gate.data?.open === true;
  if (!release) return null;
  const code = sketch.data?.versions.find((v) => v.version === release.version.sketchVersion)?.code ?? null;
  const toolbox = content.data?.toolbox ?? [];
  const order = (content.data?.syllabus?.defaultOrder ?? []) as readonly string[];
  const tools =
    code && toolbox.length > 0 && capstoneId
      ? releaseTools(
          toolsUsed(code, toolbox).map((u) => u.id),
          toolbox,
          order,
          capstoneId,
        ).map((t) => {
          const l = toolLabel(t);
          return { id: t.id as string, label: l.text, mono: l.mono };
        })
      : [];
  const used = usedOnRelease(release.version.theoryTags, tools);
  const { track: t } = release;
  return (
    <section
      aria-labelledby="coda-release-title"
      className="flex flex-col gap-4 rounded-card border border-accent/50 bg-lane-in p-5 animate-fade-in sm:flex-row"
      data-testid="coda-release"
    >
      <Link
        to="/album/$trackId"
        params={{ trackId: t.id }}
        aria-label={`${t.title} on your album`}
        className="shrink-0 self-start rounded-full"
      >
        <TrackCover track={t} size={136} />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div>
          <p className="text-sm text-text-2">
            {release.place} · version {release.version.version}
          </p>
          <h2 id="coda-release-title" className="font-display text-h2">
            {release.revision ? `${t.title}, revised` : `${t.title} joins your album`}
          </h2>
        </div>
        {(used.theory.length > 0 || used.tools.length > 0) && (
          <div className="flex flex-col gap-1.5" data-testid="coda-used">
            <h3 className="font-sans text-sm font-semibold text-text-2">What you used</h3>
            <ul aria-label="What you used" className="flex flex-wrap gap-1.5">
              {used.theory.map((tag) => (
                <li key={`t:${tag}`}>
                  <Chip>{tag}</Chip>
                </li>
              ))}
              {used.tools.map((tool) => (
                <li key={`c:${tool.id}`}>
                  <Chip className={tool.mono ? "font-mono text-[0.8rem]" : undefined}>{tool.label}</Chip>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!x1 && x1Open && capstoneId === "C2" && (
          <p className="text-sm text-text-2" data-testid="coda-release-next">
            <span className="font-medium text-text">Next on the album: X1 Folk Transcription.</span> It is
            open now: a folk song written down by ear, phrase by phrase, over three sessions. Today plans it
            next.
          </p>
        )}
        {x1 && capstoneId === "C2" && (
          <p className="text-sm text-text-2" data-testid="coda-release-next">
            <span className="font-medium text-text">Next on the album: X1 Folk Transcription.</span>{" "}
            {`${x1.title}: they come with your gym slots, or sooner with an extra gym session from Today.`}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/album/$trackId"
            params={{ trackId: t.id }}
            className={buttonClass("secondary", "sm")}
            data-testid="coda-open-track"
          >
            Open the track <ArrowRight aria-hidden className="size-4" />
          </Link>
          <Link to="/album" className={buttonClass("ghost", "sm")}>
            The album
          </Link>
        </div>
      </div>
    </section>
  );
}

/** A realism change and a level-up offer after a session with ladder work. */
export function LadderCard({ session }: { session: CodaSession }) {
  const ladder = useLadder();
  const setLevel = useLadderSetLevel();
  const [left, setLeft] = useState(false);
  const [taken, setTaken] = useState<number | null>(null);
  if (session.kind !== "gym") return null;
  const coda = ladderCoda(ladder.data, session.day);
  if (!coda && taken === null) return null;
  const take = async (to: number) => {
    try {
      await setLevel.mutateAsync({ body: { level: to as 1 | 2 | 3 | 4 } });
      setTaken(to);
    } catch (e) {
      toast.error("That didn't save", e instanceof Error ? e.message : undefined);
    }
  };
  return (
    <div className="flex flex-col gap-3" data-testid="coda-ladder">
      {coda?.today && (
        <Card className="p-4" data-testid="coda-ladder-today" data-passed={coda.today.passed}>
          <p className="text-sm text-text-2">Today's transcription</p>
          <p className="text-text">{coda.today.line}</p>
        </Card>
      )}
      {coda?.realism && (
        <Callout tone="success" title={`Realism R${coda.realism.from} → R${coda.realism.to}`}>
          {coda.realism.line}
        </Callout>
      )}
      {taken !== null ? (
        <Card className="p-4" data-testid="coda-level-taken">
          <h2 className="mb-1 text-h3">
            Level {taken}: {levelName(taken)}
          </h2>
          <p className="text-text-2">
            Your next ladder session is at level {taken}, starting clean at R0. You can step back down from
            Transcribe any time.
          </p>
        </Card>
      ) : (
        coda?.levelUp &&
        !left && (
          <Card className="p-4 animate-fade-in" data-testid="coda-level-up">
            <p className="text-sm text-text-2">The transcription ladder</p>
            <h2 className="mb-1 text-h3">{coda.levelUp.title}</h2>
            <p className="text-text-2">{coda.levelUp.body}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                loading={setLevel.isPending}
                onClick={() => void take(coda.levelUp?.to ?? 1)}
                data-testid="take-level"
              >
                Move up to level {coda.levelUp.to}
              </Button>
              <Button variant="ghost" onClick={() => setLeft(true)} data-testid="stay-level">
                Stay at level {coda.levelUp.from} for now
              </Button>
            </div>
          </Card>
        )
      )}
    </div>
  );
}
