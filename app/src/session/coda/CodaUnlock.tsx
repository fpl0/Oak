// The unlock ceremony in the Coda (ux §5.1, contracts §9.3): a short, calm moment for what the session unlocked.
// The tool appears, a soft I–IV–V–I arpeggio sounds, then a few seconds of the tool working — for a feature the
// feature itself (degree labels arriving under the notes, syllables, the key signature in its order, the circle
// of fifths), for code its demo with the tool's own tokens marked — and "Try it" and "About it". At most
// 8 seconds; `Esc` or Skip ends it; under reduced motion everything is shown at once (the sound still plays).
// The unlocks are marked seen when it ends (they stay replayable from the Toolbox).
import type { ToolEntry } from "@oak/content-kit";
import type { PatternPlayer } from "@oak/strudel";
import { Link } from "@tanstack/react-router";
import { clsx } from "clsx";
import { Play, Sparkles } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useContent } from "../../lib/content.ts";
import { peekOak } from "../../lib/oak.ts";
import { useUnlockSeen, useUnlocks } from "../../lib/queries.ts";
import { unlockArpeggio } from "../../toolbox/index.ts";
import { Button, buttonClass } from "../../ui/kit/Button.tsx";
import { Kbd } from "../../ui/kit/basics.tsx";
import { useReducedMotion } from "../../ui/theme/motion.ts";
import {
  ceremonyTimeline,
  circleStep,
  displayNote,
  litNotes,
  ringAngle,
  type Showcase,
  type ShowNote,
  showcaseOf,
} from "../ceremony-model.ts";
import { toolName as toolLabel } from "../tool-name.ts";

const KIND: Record<ToolEntry["kind"], string> = {
  tool: "Code",
  sound: "Sound",
  scale: "Scale",
  chord: "Chords",
  feature: "Feature",
  lens: "Lens",
  template: "Template",
};

/** `inline code` in a catalog sentence. */
function Prose({ text }: { text: string }) {
  const parts = text.split("`");
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <code key={i} className="rounded bg-surface-2 px-1 font-mono text-[0.9em]">
            {p}
          </code>
        ) : (
          p
        ),
      )}
    </>
  );
}

// --- the showcases ---------------------------------------------------------------------------------

const ROLL_W = 480;
const ROLL_H = 132;

/** A two-bar roll; each note takes its labels once it has sounded (`lit` notes from the start). */
function Roll({
  notes,
  lit,
  labels,
  caption,
  live,
}: {
  notes: readonly ShowNote[];
  lit: number;
  live: boolean;
  labels: ("degree" | "syllable" | "name")[];
  caption: string;
}) {
  const lo = Math.min(...notes.map((n) => n.midi)) - 1;
  const hi = Math.max(...notes.map((n) => n.midi)) + 1;
  const laneH = 52;
  const rowH = (ROLL_H - laneH) / (hi - lo + 1);
  const x = (bar: number) => 8 + (bar / 2) * (ROLL_W - 16);
  return (
    <figure className="flex flex-col gap-1" data-testid="ceremony-roll">
      <svg
        viewBox={`0 0 ${ROLL_W} ${ROLL_H}`}
        className="h-auto w-full max-w-[520px]"
        role="img"
        aria-label={`${caption}: ${notes.map((n) => labels.map((l) => (l === "degree" ? n.degree : l === "syllable" ? n.syllable : n.name)).join(" ")).join(", ")}`}
      >
        <line x1={x(1)} x2={x(1)} y1={0} y2={ROLL_H - laneH} className="stroke-border" strokeWidth={1} />
        {notes.map((n, i) => {
          const on = i < lit;
          const now = live && i === lit - 1;
          const y = (hi - n.midi) * rowH;
          const cx = x(n.at) + (x(n.at + n.dur) - x(n.at)) / 2;
          return (
            <g key={i} data-lit={on || undefined}>
              <rect
                x={x(n.at) + 1}
                y={y + 1}
                width={x(n.at + n.dur) - x(n.at) - 2}
                height={Math.max(4, rowH - 2)}
                rx={3}
                className={clsx(
                  "transition-colors duration-150",
                  on ? "fill-accent" : "fill-surface-2 stroke-border",
                  now && "fill-accent-2",
                )}
              />
              {labels.map((l, li) => (
                <text
                  key={l}
                  x={cx}
                  y={ROLL_H - laneH + 18 + li * 18}
                  textAnchor="middle"
                  className={clsx(
                    "transition-opacity duration-150",
                    l === "degree" ? "fill-text text-[15px] font-semibold" : "fill-text-2 text-[13px]",
                  )}
                  opacity={on ? 1 : 0}
                >
                  {l === "degree" ? n.degree : l === "syllable" ? n.syllable : n.name}
                </text>
              ))}
            </g>
          );
        })}
      </svg>
      <figcaption className="text-sm text-text-2">{caption}</figcaption>
    </figure>
  );
}

function Circle({
  ring,
  path,
  step,
  live,
}: {
  ring: { tonic: string; fifths: number }[];
  path: string[];
  step: number;
  live: boolean;
}) {
  const R = 74;
  const c = 96;
  const pos = (fifths: number) => {
    const a = ((ringAngle(fifths) - 90) * Math.PI) / 180;
    return { x: c + R * Math.cos(a), y: c + R * Math.sin(a) };
  };
  const litKeys = path.slice(0, step + 1);
  const at = (t: string) => ring.find((k) => k.tonic === t)?.fifths ?? 0;
  return (
    <figure className="flex flex-wrap items-center gap-4" data-testid="ceremony-circle">
      <svg
        viewBox="0 0 192 192"
        className="size-44 shrink-0"
        role="img"
        aria-label={`The circle of fifths: ${litKeys.map(displayNote).join(", then ")}`}
      >
        <circle cx={c} cy={c} r={R} className="fill-none stroke-border" strokeWidth={1} />
        {litKeys.slice(1).map((t, i) => {
          const a = pos(at(litKeys[i] as string));
          const b = pos(at(t));
          return (
            <line key={t} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="stroke-accent-2" strokeWidth={2} />
          );
        })}
        {ring.map((k) => {
          const p = pos(k.fifths);
          const on = litKeys.includes(k.tonic);
          const now = live && litKeys.at(-1) === k.tonic;
          return (
            <g key={k.tonic} data-lit={on || undefined}>
              <circle
                cx={p.x}
                cy={p.y}
                r={14}
                className={clsx(
                  "transition-colors duration-150",
                  now ? "fill-accent-2" : on ? "fill-accent" : "fill-surface stroke-border",
                )}
              />
              <text
                x={p.x}
                y={p.y + 4.5}
                textAnchor="middle"
                className={clsx("text-[12px] font-semibold", on ? "fill-surface" : "fill-text")}
              >
                {displayNote(k.tonic)}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="max-w-[34ch] text-sm text-text-2">
        The demo moves one key a bar, a step anticlockwise each time: {path.map(displayNote).join(" → ")}.
        Each step adds a flat.
      </figcaption>
    </figure>
  );
}

function CodeMarks({ code, marks, on }: { code: string; marks: [number, number][]; on: boolean }) {
  const parts: ReactNode[] = [];
  let i = 0;
  for (const [a, b] of marks) {
    if (a > i) parts.push(code.slice(i, a));
    parts.push(
      <mark
        key={a}
        className={clsx(
          "rounded px-0.5 transition-colors duration-150",
          on ? "bg-accent-2/25 text-text" : "bg-transparent text-text",
        )}
      >
        {code.slice(a, b)}
      </mark>,
    );
    i = b;
  }
  if (i < code.length) parts.push(code.slice(i));
  return (
    <pre
      className="overflow-x-auto rounded-control border border-border bg-surface-2 px-3 py-2 font-mono text-sm"
      data-testid="ceremony-code"
    >
      {parts}
    </pre>
  );
}

function ShowcaseView({ show, bar, live }: { show: Showcase; bar: number; live: boolean }) {
  switch (show.kind) {
    case "roll":
      return (
        <Roll
          notes={show.notes}
          lit={litNotes(show.notes, bar)}
          live={live}
          labels={show.labels}
          caption={
            show.labels.includes("syllable")
              ? `In ${show.keyName}: degree numbers with do re mi under them. Do is always home.`
              : `In ${show.keyName}: each note numbered by its degree, 1 for home.`
          }
        />
      );
    case "signature": {
      const shown = show.accidentals.filter((_, i) => bar >= i * 0.25).length;
      return (
        <div className="flex flex-col gap-2">
          <p className="flex flex-wrap items-baseline gap-2" data-testid="ceremony-signature">
            <span className="font-medium">{show.keyName}:</span>
            {show.accidentals.map((a, i) => (
              <span
                key={a}
                className={clsx(
                  "rounded-full border px-2 py-0.5 font-mono text-sm transition-opacity duration-150",
                  i < shown ? "border-accent/60 bg-lane-in opacity-100" : "border-border opacity-30",
                )}
              >
                {a}
              </span>
            ))}
            <span className="text-sm text-text-2">
              written once, in this order, at the start of every line
            </span>
          </p>
          <Roll
            notes={show.notes}
            lit={litNotes(show.notes, bar)}
            live={live}
            labels={["name"]}
            caption="Every F and C in the tune is sharp because the signature says so."
          />
        </div>
      );
    }
    case "circle":
      return (
        <Circle ring={show.ring} path={show.path} step={circleStep(show.path.length, bar)} live={live} />
      );
    case "code":
      return show.code ? <CodeMarks code={show.code} marks={show.marks} on={bar >= 0} /> : null;
  }
}

/** None of the ids is in this content build (content mid-edit): skip straight to the compact list. */
function NoTools({ ready, onDone }: { ready: boolean; onDone(): void }) {
  useEffect(() => {
    if (ready) onDone();
  }, [ready, onDone]);
  return null;
}

// --- the moment ------------------------------------------------------------------------------------

export interface CodaUnlockProps {
  toolIds: readonly string[];
  /** The moment ended (Continue, Skip, Esc): the Coda shows the compact list instead. */
  onDone(): void;
}

type Phase = "intro" | "playing" | "done";

export function CodaUnlock({ toolIds, onDone }: CodaUnlockProps) {
  const content = useContent();
  const unlocks = useUnlocks();
  const seen = useUnlockSeen();
  const reduced = useReducedMotion();
  const titleId = useId();
  const byId = new Map((content.data?.toolbox ?? []).map((t) => [t.id as string, t]));
  const tools = toolIds.map((id) => byId.get(id)).filter((t): t is ToolEntry => !!t);
  const first = tools[0];
  const [phase, setPhase] = useState<Phase>("intro");
  const [bar, setBar] = useState(-1);
  const player = useRef<PatternPlayer | null>(null);
  const ended = useRef(false);
  const continueRef = useRef<HTMLButtonElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const toolIdsRef = useRef(toolIds);
  toolIdsRef.current = toolIds;
  const unseenRef = useRef<Set<string>>(new Set());
  unseenRef.current = new Set(
    (unlocks.data?.items ?? []).filter((u) => !u.seen).map((u) => u.itemId as string),
  );
  const seenRef = useRef(seen);
  seenRef.current = seen;

  const stopAudio = () => {
    player.current?.stop();
  };

  // "Seen" means the ceremony was shown (`Unlock.seen`): marked once, when the demo starts or the learner
  // moves on, whichever comes first. A reload after that does not replay it; the Toolbox does.
  const marked = useRef(new Set<string>());
  const markSeen = () => {
    for (const id of toolIdsRef.current)
      if (unseenRef.current.has(id) && !marked.current.has(id)) {
        marked.current.add(id);
        seenRef.current.mutate({ params: { id } });
      }
  };
  const finish = () => {
    if (ended.current) return;
    ended.current = true;
    stopAudio();
    markSeen();
    doneRef.current();
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  // Esc skips (capture: before the shell's own Esc, which would leave the focus route).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      e.stopPropagation();
      finishRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // The audio never outlives the card.
  useEffect(() => {
    ended.current = false;
    return () => {
      ended.current = true;
      player.current?.dispose();
      player.current = null;
    };
  }, []);

  // The timeline: arpeggio, then the demo for at most two bars, the picture following the demo's position.
  const playDemo = async (t: ToolEntry, demoMs: number): Promise<boolean> => {
    const oak = peekOak();
    if (!oak || !t.catalog.demo.trim()) return false;
    try {
      player.current ??= oak.createPatternPlayer();
      const p = player.current;
      const out = await p.load(t.catalog.demo, {
        bars: 2,
        cps: 0,
        lint: { profile: "content", unlocked: new Set(), allowPreview: true, meter: "4/4", key: null },
      });
      if (!out.ok || ended.current) return false;
      await p.play();
      setTimeout(() => p.stop(), demoMs);
      return true;
    } catch {
      return false;
    }
  };

  const run = (withArpeggio: boolean) => {
    if (!first) return () => {};
    const { demoAt, demoMs } = ceremonyTimeline(first.catalog.demo);
    const barMs = demoMs / 2;
    let raf = 0;
    let started = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const oak = peekOak();
    if (withArpeggio && oak) {
      try {
        oak.ui.play(unlockArpeggio().map((n) => ({ midi: n.midi, at: n.at, dur: n.dur })));
      } catch {
        // UI sounds are a nicety.
      }
    }
    setPhase("intro");
    setBar(-1);
    timers.push(
      setTimeout(
        () => {
          if (ended.current) return;
          void playDemo(first, demoMs);
          setPhase("playing");
          markSeen();
          started = performance.now();
          if (reduced) {
            // Content appears at once; the sound still plays.
            setBar(2);
          } else {
            const tick = () => {
              const p = player.current;
              const pos = p?.playing ? p.position() : (performance.now() - started) / barMs;
              setBar(pos);
              if (performance.now() - started < demoMs) raf = requestAnimationFrame(tick);
            };
            raf = requestAnimationFrame(tick);
          }
          timers.push(
            setTimeout(() => {
              if (ended.current) return;
              setBar(2);
              setPhase("done");
            }, demoMs),
          );
        },
        withArpeggio ? demoAt : 0,
      ),
    );
    return () => {
      for (const t of timers) clearTimeout(t);
      cancelAnimationFrame(raf);
    };
  };
  const runRef = useRef(run);
  runRef.current = run;

  // Plays once per first tool.
  useEffect(() => runRef.current(true), [first?.id]);

  // Once the moment has played, Continue takes the focus (Enter then moves on).
  useEffect(() => {
    if (phase === "done") continueRef.current?.focus({ preventScroll: true });
  }, [phase]);

  if (!first) return <NoTools ready={content.data !== undefined} onDone={onDone} />;
  const show = showcaseOf(first);
  const label = toolLabel(first);
  const rest = tools.slice(1);
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-4 rounded-card border border-accent/50 bg-surface p-4 shadow-overlay animate-pop-in"
      data-testid="coda-unlock-moment"
      data-phase={phase}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id={titleId} className="flex items-center gap-2 text-h3">
          <Sparkles aria-hidden className="size-5 text-accent-2" />
          New in your toolbox
        </h2>
        {phase !== "done" && (
          <Button variant="ghost" size="sm" onClick={finish} data-testid="ceremony-skip">
            Skip <Kbd>Esc</Kbd>
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm text-text-2">{KIND[first.kind]}</p>
        <p className={clsx("text-h3 text-text", label.mono && "font-mono")} data-testid="ceremony-tool">
          {label.text}
        </p>
        <p className="max-w-[68ch] text-text">
          <Prose text={first.catalog.meaning} />
        </p>
      </div>
      {/* The picture's height is reserved while it draws (a roll, a staff, the circle); a code demo is one block of
          known height, so it gets no reserve and no empty band under it (review:journey). */}
      <div className={show.kind === "code" ? undefined : "min-h-[96px]"} aria-live="off">
        <ShowcaseView show={show} bar={bar} live={phase === "playing"} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/studio"
          search={{ try: first.id }}
          className={buttonClass("secondary", "md")}
          onClick={finish}
          data-testid="ceremony-try"
        >
          Try it
        </Link>
        <Link
          to="/toolbox/$toolId"
          params={{ toolId: first.id }}
          className={buttonClass("ghost", "md")}
          onClick={finish}
          data-testid="ceremony-about"
        >
          About it
        </Link>
        {phase === "done" && first.catalog.demo.trim() && peekOak() && (
          <Button
            variant="ghost"
            icon={<Play aria-hidden className="size-4" />}
            onClick={() => {
              runRef.current(false);
            }}
          >
            Hear it again
          </Button>
        )}
        <span className="flex-1" />
        <Button ref={continueRef} variant="primary" onClick={finish} data-testid="unlock-continue">
          See the rest of today
        </Button>
      </div>
      {rest.length > 0 && (
        <ul className="flex flex-col gap-2 border-t border-border pt-3" aria-label="Also new today">
          {rest.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className={clsx(toolLabel(t).mono && "font-mono")}>{toolLabel(t).text}</span>
              <span className="flex items-center gap-2">
                <Link
                  to="/studio"
                  search={{ try: t.id }}
                  className={buttonClass("secondary", "sm")}
                  onClick={finish}
                >
                  Try it
                </Link>
                <Link
                  to="/toolbox/$toolId"
                  params={{ toolId: t.id }}
                  className={buttonClass("ghost", "sm")}
                  onClick={finish}
                >
                  About it
                </Link>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
