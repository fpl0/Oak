// The lesson MDX component set (content/lib/mdx.ts `MDX_COMPONENTS`, architecture §3.3) as React: the whole
// `lesson.mdx` renders through these, and <Step id> shows only the step on screen. Components that bind an
// exercise (<Editor>, <Predict>, <Choice>, <Tap>, <Sing>, <StaffInput>, <Parsons>, <Make>, <EarDrill>) render
// nothing here: the step's renderer draws the exercise. The rest draw prose furniture: examples to hear,
// static staff and roll, a keyboard diagram, scale degrees, terms, callouts, unlocks, can-dos and the recap.
import type { CalibrationRecord, KeySpec, LessonDef, StepDef } from "@oak/api";
import { parseKeyText, scaleNotes } from "@oak/theory";
import { Link } from "@tanstack/react-router";
import { Pause, Play } from "lucide-react";
import { createContext, type ReactNode, use, useRef, useState } from "react";
import type { ContentBundle } from "../lib/content-model.ts";
import { useCalibrations } from "../lib/queries.ts";
import { Button } from "../ui/kit/Button.tsx";
import { Chip, Skeleton } from "../ui/kit/basics.tsx";
import { Callout as KitCallout } from "../ui/kit/Controls.tsx";
import { mdxComponents } from "../ui/mdx.tsx";
import { SETUP_PARTS, SetupPart, type SetupPartId } from "../voice/index.tsx";
import { useExamplePlayer } from "./audio.ts";
import type { MdxComponents } from "./content.ts";
import { CodeMusic } from "./music.tsx";

export interface MdxStep {
  lesson: LessonDef;
  step: StepDef;
  /** OnPass blocks show once the step is passed (or revealed). */
  passed: boolean;
  content: ContentBundle | null;
  /** <Setup part> finished: the concept step is complete. */
  markDone(): void;
}

const MdxStepContext = createContext<MdxStep | null>(null);
const useMdxStep = () => use(MdxStepContext);

const PlayerContext = createContext<ReturnType<typeof useExamplePlayer> | null>(null);

export function MdxStepProvider({ value, children }: { value: MdxStep; children: ReactNode }) {
  const player = useExamplePlayer();
  return (
    <MdxStepContext value={value}>
      <PlayerContext value={player}>{children}</PlayerContext>
    </MdxStepContext>
  );
}

/** Every example of the lesson by slug (step examples; listen items are examples of their own step). */
function exampleOf(lesson: LessonDef, id: string): { code: string; bars: number } | null {
  for (const s of lesson.steps)
    if (s.example?.id === id) return { code: s.example.code, bars: s.example.bars };
  return null;
}

type P = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

function Step(p: P) {
  const ctx = useMdxStep();
  if (!ctx || str(p.id) !== ctx.step.id) return null;
  return <>{p.children as ReactNode}</>;
}

function ExampleButton({ id, label }: { id: string; label: string }) {
  const ctx = useMdxStep();
  const player = use(PlayerContext);
  const ex = ctx ? exampleOf(ctx.lesson, id) : null;
  const [failed, setFailed] = useState(false);
  if (!ex || !player) return null;
  const playing = player.playingId === id;
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="sm"
        icon={
          playing ? <Pause aria-hidden className="size-3.5" /> : <Play aria-hidden className="size-3.5" />
        }
        onClick={() => {
          if (playing) player.stop();
          else
            void player.play(id, ex.code, ex.bars).then(
              (ok) => setFailed(!ok),
              () => setFailed(true),
            );
        }}
        aria-pressed={playing}
        data-example={id}
      >
        {playing ? "Stop" : label}
      </Button>
      {failed && <span className="text-sm text-text-3">That example did not play.</span>}
    </span>
  );
}

function Example(p: P) {
  const ctx = useMdxStep();
  const id = str(p.id);
  // The step's own example is the Workbench beside the prose: no second player for it.
  if (ctx?.step.example?.id === id) return null;
  return (
    <p className="mb-3">
      <ExampleButton id={id} label="Hear the example" />
    </p>
  );
}

function Compare(p: P) {
  return (
    <fieldset className="mb-3 flex flex-wrap items-center gap-2">
      <legend className="sr-only">Compare two versions</legend>
      <ExampleButton id={str(p.a)} label="Hear A" />
      <ExampleButton id={str(p.b)} label="Hear B" />
    </fieldset>
  );
}

/** A static roll or staff of an example, with a button to hear it. */
function ExampleMusic({ id, view }: { id: string; view: "roll" | "staff" | "lead" }) {
  const ctx = useMdxStep();
  const ex = ctx ? exampleOf(ctx.lesson, id) : null;
  if (!ex || !ctx) return null;
  return (
    <div className="mb-3 flex flex-col gap-1">
      <CodeMusic
        code={ex.code}
        bars={ex.bars}
        view={view}
        label={`Example ${id}`}
        meter={ctx.lesson.meter}
        keySpec={ctx.lesson.key}
      />
      <span>
        <ExampleButton id={id} label="Hear it" />
      </span>
    </div>
  );
}

const WHITE = [0, 2, 4, 5, 7, 9, 11];
const NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

function midiOf(name: string): number | null {
  const m = /^([a-gA-G])([#b]?)(-?\d)?$/.exec(name.trim());
  if (!m) return null;
  const base: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  const pc = (base[(m[1] as string).toLowerCase()] as number) + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
  const oct = m[3] !== undefined ? Number(m[3]) : 4;
  return 12 * (oct + 1) + pc;
}

/** A two-octave keyboard diagram with the named notes (or degrees of a key) marked and labelled. */
function Keyboard(p: P) {
  const ctx = useMdxStep();
  const marks = new Map<number, string>();
  const notes = str(p.notes);
  const degrees = str(p.degrees);
  if (notes)
    for (const n of notes.split(/\s+/)) {
      const m = midiOf(n);
      if (m !== null) marks.set(m, n.replace(/\d$/, "").toUpperCase());
    }
  if (degrees) {
    // `key` is React's own prop: MDX's <Keyboard key="…"> never reaches the component, so the lesson's key is used.
    const key: KeySpec = ctx?.lesson.key ?? { tonic: "C", mode: "major" };
    const scale = scaleNotes(key);
    for (const d of degrees.split(/\s+/)) {
      const i = Number(d) - 1;
      const name = scale[i];
      const m = name ? midiOf(`${name}4`) : null;
      if (m !== null) marks.set(m, d);
    }
  }
  const lo = 60;
  const whites = Array.from({ length: 15 }, (_, i) => lo + Math.floor(i / 7) * 12 + (WHITE[i % 7] as number));
  const w = 22;
  const label = [...marks.entries()].map(([m, l]) => `${NAMES[m % 12]} (${l})`).join(", ");
  return (
    <figure className="mb-3">
      <svg
        role="img"
        aria-label={`Keyboard with ${label || "no keys"} marked`}
        viewBox={`0 0 ${whites.length * w} 70`}
        className="h-[70px] w-auto max-w-full"
      >
        {whites.map((m, i) => (
          <g key={m}>
            <rect
              x={i * w}
              y={0}
              width={w - 1}
              height={68}
              rx={2}
              fill={marks.has(m) ? "var(--oak-accent)" : "#fbf8f2"}
              stroke="#8a7f72"
            />
            {marks.has(m) && (
              <text
                x={i * w + w / 2 - 0.5}
                y={60}
                textAnchor="middle"
                fontSize={10}
                fill="var(--oak-on-accent)"
              >
                {marks.get(m)}
              </text>
            )}
          </g>
        ))}
        {whites.map((m, i) => {
          const black = m + 1;
          if ([4, 11].includes(m % 12) || i === whites.length - 1) return null;
          return (
            <rect
              key={`b${black}`}
              x={i * w + w * 0.65}
              y={0}
              width={w * 0.7}
              height={40}
              rx={2}
              fill={marks.has(black) ? "var(--oak-accent-2)" : "#2a241d"}
            />
          );
        })}
      </svg>
      {label && <figcaption className="mt-1 text-sm text-text-2">{label}</figcaption>}
    </figure>
  );
}

/** The degrees of a key in a row, the ones named in `show` highlighted. */
function Degrees(p: P) {
  // `key` is React's own prop (MDX passes it as the element key): the lesson's key stands in for it.
  const ctx = useMdxStep();
  const key: KeySpec = parseKeyText(str(p.scale)) ?? ctx?.lesson.key ?? { tonic: "C", mode: "major" };
  const notes = scaleNotes(key);
  const show = new Set(str(p.show).split(/\s+/));
  return (
    <ol className="mb-3 flex flex-wrap gap-1.5" aria-label={`Degrees of ${key.tonic} ${key.mode}`}>
      {notes.map((n, i) => {
        const d = String(i + 1);
        const on = show.has(d);
        return (
          <li
            key={d}
            className={`flex min-w-9 flex-col items-center rounded-control border px-1.5 py-0.5 ${
              on ? "border-accent bg-lane-in" : "border-border text-text-3"
            }`}
          >
            <span className="font-mono text-sm font-semibold">{d}</span>
            <span className="text-xs">{n}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Term(p: P) {
  const ctx = useMdxStep();
  const t = ctx?.content?.terms.find((x) => x.id === str(p.id));
  return (
    <dfn className="font-semibold not-italic" title={t?.definition}>
      {(p.children as ReactNode) ?? t?.term}
    </dfn>
  );
}

function CodeRef(p: P) {
  const ctx = useMdxStep();
  const fn = str(p.fn);
  const tool = ctx?.content?.toolbox.find(
    (t) => t.id === `tb.${fn}` || (t.matches ?? []).includes(fn) || t.id.endsWith(`.${fn}`),
  );
  const code = <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.9em]">{fn}()</code>;
  if (!tool) return code;
  return (
    <Link
      to="/toolbox/$toolId"
      params={{ toolId: tool.id }}
      className="underline decoration-dotted underline-offset-2"
      title={tool.catalog.meaning}
    >
      {code}
    </Link>
  );
}

const CALLOUT_TITLE: Record<string, string> = { tip: "Tip", trap: "Watch out", why: "Why it works" };
function Callout(p: P) {
  const kind = str(p.kind);
  return (
    <KitCallout
      tone={kind === "trap" ? "attention" : "info"}
      title={CALLOUT_TITLE[kind] ?? "Note"}
      className="mb-3"
    >
      {p.children as ReactNode}
    </KitCallout>
  );
}

function Unlock(p: P) {
  const name = str(p.fn) ? `${str(p.fn)}()` : `"${str(p.sound)}"`;
  return (
    <p className="mb-2 text-sm text-text-2">
      <Chip tone="amber">New</Chip> <code className="font-mono">{name}</code> is yours to use once this lesson
      is done.
    </p>
  );
}

function CanDo(p: P) {
  const ctx = useMdxStep();
  const c = ctx?.content?.candos.find((x) => x.id === str(p.id));
  if (!c) return null;
  return (
    <p className="mb-2 flex items-start gap-2 text-sm">
      <Chip tone="accent">Can-do</Chip>
      <span>{c.statement}</span>
    </p>
  );
}

function Recap() {
  const ctx = useMdxStep();
  if (!ctx) return null;
  const terms = ctx.lesson.terms
    .map((t) => ctx.content?.terms.find((x) => x.id === t.id)?.term)
    .filter((x): x is string => !!x);
  return (
    <section className="mb-3 rounded-card border border-border bg-surface p-3 text-sm" aria-label="Recap">
      <p className="font-medium">In this lesson</p>
      <p className="mt-1 text-text-2">{ctx.lesson.objective}</p>
      {terms.length > 0 && <p className="mt-1 text-text-2">Words you met: {terms.join(", ")}.</p>}
    </section>
  );
}

function OnPass(p: P) {
  const ctx = useMdxStep();
  if (!ctx?.passed) return null;
  return (
    <div
      className="mb-3 rounded-control border-l-2 border-accent bg-lane-in px-3 py-2"
      data-testid="on-pass"
      role="status"
    >
      {p.children as ReactNode}
    </div>
  );
}

/** The calibration runs that stand for a set-up part (a part done in onboarding need not be done again). */
const PART_RUNS: Record<SetupPartId, readonly CalibrationRecord["kind"][]> = {
  headphones: ["output"],
  mic: ["noise", "bleed"],
  noise: ["noise"],
  bleed: ["bleed"],
  latency: ["tap-latency", "sing-latency"],
  "tap-latency": ["tap-latency"],
  "sing-latency": ["sing-latency"],
  range: ["range"],
  "first-sing": ["pitch-match"],
  match: ["pitch-match"],
};

/**
 * A set-up screen inside a concept step (U00.L02): the same screens as onboarding and Settings → Voice, saved to
 * the profile. Finishing it, skipping it or choosing Quiet mode completes the step. A part already measured (in
 * onboarding) offers to keep that result.
 */
function Setup(p: P) {
  const ctx = useMdxStep();
  const runs = useCalibrations();
  const raw = str(p.part);
  const part = (SETUP_PARTS as readonly string[]).includes(raw) ? (raw as SetupPartId) : null;
  const [mode, setMode] = useState<"auto" | "redo" | "done">("auto");
  const box = useRef<HTMLDivElement | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const finish = () => {
    setMode("done");
    ctx?.markDone();
    // The button that finished the part (Keep it, Continue, Set up later) unmounts with it: hand the keyboard
    // focus to the step's Continue rather than dropping it on <body>.
    // The next set-up part of the same step when there is one (S2 holds mic, noise and bleed), else Continue.
    const here = box.current;
    const parts = [...document.querySelectorAll<HTMLElement>("[data-setup-part]")];
    const after = here
      ? parts.filter((el) => here.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)
      : [];
    setTimeout(() => {
      const a = document.activeElement;
      if (a && a !== document.body && a.isConnected) return;
      const next = after
        .filter((el) => el.isConnected)
        // Its primary (the start of its measurement, in the result row's pair), never "Set up later" at the left.
        .map(
          (el) =>
            el.querySelector<HTMLElement>("[data-result-pair] button:not([disabled])") ??
            el.querySelector<HTMLElement>("button:not([disabled])"),
        )
        .find(Boolean);
      (next ?? document.querySelector<HTMLElement>('[data-testid="continue"]'))?.focus();
    }, 0);
  };
  if (!part) return null;
  if (mode === "done")
    return (
      <p
        className="mb-3 rounded-card border border-border bg-surface p-3 text-sm text-text-2"
        data-testid="setup-done"
      >
        Saved to your profile. You can redo it any time in Settings → Voice.
      </p>
    );
  if (mode === "auto" && runs.isPending) return <Skeleton className="mb-3 h-24 w-full" />;
  // What was measured BEFORE this step opened: the runs list refetches when a part saves, and a live reading
  // turned a part the learner was doing right now into "Already set up. You did this in onboarding".
  if (seen.current === null && runs.data) seen.current = new Set(runs.data.items.map((r) => r.kind));
  const kinds = seen.current ?? new Set<string>();
  const already = PART_RUNS[part].every((k) => kinds.has(k));
  if (mode === "auto" && already)
    return (
      <div
        ref={box}
        data-setup-part={part}
        className="mb-3 flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-3"
        data-testid={`setup-${part}-kept`}
      >
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-medium">Already set up.</span>{" "}
          <span className="text-text-2">You did this in onboarding; the result is in your profile.</span>
        </p>
        <Button size="sm" variant="primary" onClick={finish} data-testid="setup-keep">
          Keep it
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setMode("redo")}>
          Do it again
        </Button>
      </div>
    );
  return (
    <div
      ref={box}
      data-setup-part={part}
      className="mb-3 rounded-card border border-border bg-surface p-3"
      data-testid={`setup-${part}`}
    >
      <SetupPart part={part} context="lesson" onDone={finish} onSkip={finish} onQuiet={finish} />
    </div>
  );
}

const none = () => null;

export const lessonMdxComponents: MdxComponents = {
  ...(mdxComponents as unknown as MdxComponents),
  Step,
  Example,
  Compare,
  Staff: (p: P) => <ExampleMusic id={str(p.example)} view="staff" />,
  PianoRoll: (p: P) => <ExampleMusic id={str(p.example)} view="roll" />,
  LeadSheet: (p: P) => <ExampleMusic id={str(p.example)} view="lead" />,
  Keyboard,
  Degrees,
  Term,
  CodeRef,
  Callout,
  Unlock,
  CanDo,
  Recap,
  OnPass,
  Setup,
  Editor: none,
  Predict: none,
  Choice: none,
  EarDrill: none,
  Sing: none,
  Tap: none,
  StaffInput: none,
  Parsons: none,
  Make: none,
};
