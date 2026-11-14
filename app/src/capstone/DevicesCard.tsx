// "Your devices so far" (content/specs/CF.md): the card beside CF-A's brief. One row per device of the brief: what
// counts, in one sentence, and where the learner has already done it — every released Side A track whose current
// version has the device, with a button that plays those two bars of that track from its code. A device no track
// has yet says so, names its lesson, plays the lesson's own example and links back to the lesson. It answers "have I
// done this before?" with the learner's own music; nothing on it is graded.

import type { PatternPlayer } from "@oak/strudel";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Play, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "../ui/kit/Toast.tsx";
import { useWorkbenchServices } from "../workbench/services.tsx";
import { RuleLabel } from "./Checklist.tsx";
import { notOnRecordText, type RecordRow } from "./devices.ts";

export interface DevicePieces {
  /** The code and length of a released track's current version, by track id. */
  track(trackId: string): { code: string; bars: number } | null;
  /** A glossary term's example code (`content/terms.ts`), or `null`. */
  term(termId: string): string | null;
}

/** Plays two bars of a piece through a hidden pattern player; one thing sounds at a time. */
function useTwoBars() {
  const { oak } = useWorkbenchServices();
  const player = useRef<PatternPlayer | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    player.current?.stop();
    setPlayingId(null);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      player.current?.dispose();
      player.current = null;
    },
    [],
  );
  const play = async (id: string, code: string, o: { bars: number; fromBar: number; span: number }) => {
    if (playingId === id) return stop();
    stop();
    setBusyId(id);
    try {
      await oak.unlock();
      // The editor and anything else stop first: the example is heard alone.
      oak.stopAll();
      player.current ??= oak.createPatternPlayer();
      const p = player.current;
      const out = await p.load(code, { bars: Math.max(1, o.bars), cps: 0 });
      if (!out.ok) {
        toast.info("This example cannot play here.");
        return;
      }
      const from = Math.max(0, Math.min(o.fromBar, Math.max(0, o.bars - 1)));
      const span = Math.max(1, Math.min(o.span, o.bars - from));
      p.setLoop({ fromBar: from, bars: span });
      await p.play();
      setPlayingId(id);
      const cps = out.cps && out.cps > 0 ? out.cps : oak.transport.cps() || 0.5;
      timer.current = setTimeout(stop, Math.min(20_000, (span / cps) * 1000));
    } catch (e) {
      toast.error("Sound did not start", e instanceof Error ? e.message : undefined);
    } finally {
      setBusyId(null);
    }
  };
  return { play, stop, playingId, busyId };
}

export function DevicesCard({
  rows,
  pending,
  pieces,
  defaultOpen,
}: {
  rows: readonly RecordRow[];
  /** The learner's tracks are still being read. */
  pending: boolean;
  pieces: DevicePieces;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const sound = useTwoBars();
  const onRecord = rows.filter((r) => r.lines.length > 0).length;
  return (
    <section aria-labelledby="cap-devices" className="border-t border-border pt-4" data-testid="devices-card">
      <h2 id="cap-devices" className="font-sans text-sm font-semibold text-text-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="cap-devices-body"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 rounded-control text-left hover:text-text"
        >
          <span>Your devices so far</span>
          <ChevronDown
            aria-hidden
            className={`size-4 shrink-0 transition-transform reduced:transition-none ${open ? "rotate-180" : ""}`}
          />
        </button>
      </h2>
      <p className="mt-0.5 text-sm text-text-3 tabular-nums" data-testid="devices-on-record">
        {pending ? "Reading your tracks…" : `${onRecord} of ${rows.length} are on your record already.`}
      </p>
      {open && (
        <ul id="cap-devices-body" className="mt-2 flex flex-col gap-3">
          {rows.map((r) => {
            const example = pieces.term(r.term);
            const exampleId = `term:${r.device}`;
            return (
              <li
                key={r.device}
                data-device={r.device}
                data-on-record={r.lines.length > 0 ? "true" : "false"}
              >
                <p className="text-sm font-medium">{r.title}</p>
                <p className="mt-0.5 text-sm leading-snug text-text-2">
                  <RuleLabel label={r.definition} />
                </p>
                {r.lines.length > 0 ? (
                  <ul className="mt-1 flex flex-col gap-1" aria-label={`${r.title} in your tracks`}>
                    {r.lines.map((l) => {
                      const id = `${r.device}:${l.trackId}`;
                      const piece = pieces.track(l.trackId);
                      return (
                        <li key={l.trackId} className="flex items-center gap-1.5 text-sm">
                          <PlayChip
                            playing={sound.playingId === id}
                            busy={sound.busyId === id}
                            disabled={!piece}
                            label={`${l.title}, ${l.barsText}`}
                            onClick={() =>
                              piece &&
                              void sound.play(id, piece.code, {
                                bars: piece.bars,
                                fromBar: l.bar - 1,
                                span: 2,
                              })
                            }
                          />
                          <span className="min-w-0">
                            <span className="text-text">{l.title}</span>
                            <span className="text-text-2">, {l.barsText}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-text-2">
                    {example && (
                      <PlayChip
                        playing={sound.playingId === exampleId}
                        busy={sound.busyId === exampleId}
                        label={`the example from ${r.taught}`}
                        onClick={() => void sound.play(exampleId, example, { bars: 4, fromBar: 0, span: 4 })}
                      />
                    )}
                    <span>{pending ? "Reading your tracks…" : notOnRecordText(r)}</span>
                    {!pending && (
                      <Link
                        to="/learn/$lessonId"
                        params={{ lessonId: r.taught }}
                        className="text-link underline underline-offset-2"
                      >
                        Replay the lesson
                      </Link>
                    )}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function PlayChip({
  playing,
  busy,
  disabled,
  label,
  onClick,
}: {
  playing: boolean;
  busy: boolean;
  disabled?: boolean;
  label: string;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      aria-pressed={playing}
      aria-label={playing ? `Stop ${label}` : `Play ${label}`}
      onClick={onClick}
      data-testid="device-play"
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-text hover:border-accent hover:text-accent disabled:opacity-50"
    >
      {playing ? <Square aria-hidden className="size-3" /> : <Play aria-hidden className="size-3" />}
    </button>
  );
}
