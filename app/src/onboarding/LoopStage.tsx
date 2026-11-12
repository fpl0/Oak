// The loop, the edit and the reaction (ux §8 `onb.loop`, `onb.edit`, `onb.react`) on one Workbench that stays
// mounted across the three screens, so the music never stops between them. The build-up is conducted from
// outside the workbench: the editor's mutes open one layer per bar (drums, bass in bar 2, chords in bar 3, the
// melody in bar 5) on the transport's own clock.
import type { OnboardingStep } from "@oak/api";
import type { CodeRange } from "@oak/content-kit";
import { type EvalOutcome, editorId } from "@oak/strudel";
import { clsx } from "clsx";
import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/kit/Button.tsx";
import { Chip, Kbd } from "../ui/kit/basics.tsx";
import { Callout } from "../ui/kit/Controls.tsx";
import { useWorkbenchServices, Workbench } from "../workbench/index.ts";
import {
  BUILD_BARS,
  editableRange,
  isChanged,
  LAYERS,
  type Layer,
  lineRanges,
  mutedAt,
  ONBOARDING_LOOP,
  REACTIONS,
  readEdit,
  STARTER_VALUE,
  withEdit,
} from "./loop.ts";
import { LOOP_LESSON_CTX, ONBOARDING_LINT } from "./services.ts";

export const LOOP_EDITOR = "onb-loop";
const EDITOR_ID = editorId(LOOP_EDITOR, 0);

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export interface LoopStageProps {
  step: Extract<OnboardingStep, "loop" | "edit" | "react">;
  /** The number the learner chose earlier (a resumed session starts from it). */
  firstEdit: number | null;
  onEdited(value: number, code: string): void;
  onContinue(): void;
  onCode?(code: string): void;
}

/** Bars of the build-up heard so far (0 before it starts); `null` while stopped. */
function useBuildUp(active: boolean): { bar: number | null; playing: boolean; restart(): void } {
  const { oak } = useWorkbenchServices();
  const [bar, setBar] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const start = useRef<number | null>(null);
  const lastMutes = useRef<string>("");
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let iv: ReturnType<typeof setInterval> | null = null;
    start.current = null;
    lastMutes.current = "";
    const apply = (muted: Layer[]) => {
      const h = oak.editors.get(EDITOR_ID);
      const key = muted.join(",");
      if (!h || h.disposed || key === lastMutes.current) return;
      // The learner touched the mute chips: the build-up is theirs now.
      const cur = [...h.getMutes().muted].sort().join(",");
      if (lastMutes.current !== "" && cur !== [...lastMutes.current.split(",")].sort().join(",")) return;
      h.setMutes({ muted: new Set(muted), solo: null });
      lastMutes.current = key;
    };
    const run = async () => {
      // Wait for the workbench's editor.
      for (let i = 0; i < 100 && !oak.editors.get(EDITOR_ID); i++)
        await new Promise((r) => setTimeout(r, 30));
      const h = oak.editors.get(EDITOR_ID);
      if (!h || stopped) return;
      apply(mutedAt(0));
      await oak.unlock();
      if (!h.playing) await h.play();
      if (stopped) return;
      start.current = Math.floor(oak.transport.audibleCycle() + 1e-6);
      iv = setInterval(() => {
        if (h.disposed) return;
        setPlaying(h.playing);
        if (!h.playing || start.current === null) return;
        const b = Math.max(0, Math.floor(oak.transport.audibleCycle() - start.current));
        setBar(b);
        if (b <= BUILD_BARS) apply(mutedAt(b));
      }, 80);
    };
    void run();
    return () => {
      stopped = true;
      if (iv) clearInterval(iv);
    };
  }, [active, oak, epoch]);

  return {
    bar,
    playing,
    restart: () => {
      setBar(null);
      setEpoch((e) => e + 1);
    },
  };
}

function LayerRow({ bar }: { bar: number | null }) {
  const muted = new Set(bar === null ? [] : mutedAt(bar));
  return (
    <ul className="flex flex-wrap gap-2" aria-label="The four musicians" data-testid="layers">
      {LAYERS.map((l) => {
        const on = bar !== null && !muted.has(l.id);
        return (
          <li
            key={l.id}
            data-layer={l.id}
            data-on={on ? "1" : "0"}
            className={clsx(
              "flex items-center gap-2 rounded-card border px-3 py-1.5 text-sm transition-colors duration-200",
              on ? "border-accent/50 bg-lane-in" : "border-border bg-surface",
            )}
          >
            <span
              className={clsx("size-2 rounded-full", on ? "bg-accent" : "border border-text-3")}
              aria-hidden
            />
            <span className="font-medium">{l.name}</span>
            <span className="text-text-3">
              {on ? "playing" : bar === null ? `enters in bar ${l.entersAtBar}` : `in bar ${l.entersAtBar}`}
            </span>
            <Chip
              className="hidden xl:inline-flex"
              title={`You write ${l.tool} yourself from ${l.unlockLesson}`}
            >
              you'll unlock this
            </Chip>
          </li>
        );
      })}
    </ul>
  );
}

export function LoopStage(props: LoopStageProps) {
  const { oak } = useWorkbenchServices();
  const { step, firstEdit } = props;
  const [code, setCode] = useState(() =>
    firstEdit !== null && step !== "loop" ? withEdit(ONBOARDING_LOOP, firstEdit) : ONBOARDING_LOOP,
  );
  const [ran, setRan] = useState<number | null>(firstEdit);
  const [problem, setProblem] = useState<string | null>(null);
  const build = useBuildUp(step === "loop");
  const heard = build.bar !== null && build.bar >= BUILD_BARS;
  const propsRef = useRef(props);
  propsRef.current = props;

  // The one editable number: computed once per mode (the editor maps the region through the learner's edits, so
  // an emptied slot stays typeable), with a dashed box around it while editing.
  const editMode = step === "loop" ? "listen" : "edit";
  const ro = useRef<{ mode: string; value: true | { editable: CodeRange[] } } | null>(null);
  if (ro.current?.mode !== editMode) {
    const r = editableRange(code);
    ro.current = { mode: editMode, value: editMode === "listen" || !r ? true : { editable: [r] } };
  }
  const readOnly = ro.current.value;
  useEffect(() => {
    const h = oak.editors.get(EDITOR_ID);
    if (!h || h.disposed) return;
    const r = editableRange(h.getCode());
    h.setMarks(editMode === "edit" && r ? [{ range: r, kind: "target" }] : []);
    // From the edit on, the whole band plays: the build-up is over.
    if (editMode === "edit") h.setMutes({ muted: new Set(), solo: null });
  }, [editMode, oak]);

  const onEvaluated = (o: EvalOutcome) => {
    if (step === "loop" || !o.ok) return;
    const { text, value } = readEdit(o.code);
    if (value === null) {
      setProblem(
        text === ""
          ? "The slot is empty. Type a number from 0 to 7."
          : `"${text}" isn't a number from 0 to 7. The melody uses eight notes, numbered 0 to 7.`,
      );
      return;
    }
    if (!isChanged(value) && ran === null) {
      setProblem(`That's still ${STARTER_VALUE}, the number it started with. Try another one.`);
      return;
    }
    setProblem(null);
    setRan(value);
    propsRef.current.onEdited(value, o.code);
  };

  const run = async () => {
    const h = oak.editors.get(EDITOR_ID);
    if (!h || h.disposed) return;
    await oak.unlock();
    await h.evaluate({ autostart: true });
  };

  const mod = isMac() ? "⌘" : "Ctrl";
  const reaction = ran !== null ? REACTIONS[ran] : undefined;
  const lines = lineRanges(code);

  return (
    <div className="flex flex-col gap-4">
      {step === "loop" && (
        <section className="flex flex-col gap-3" data-testid="screen-loop" aria-labelledby="loop-title">
          <h1 id="loop-title" className="text-h1 outline-none" tabIndex={-1}>
            This is code. Each line is a musician.
          </h1>
          <p className="max-w-measure text-text-2">
            Four lines, four players. They come in one at a time: drums, then bass, then chords, then the
            melody. You'll learn to write every one of them.
          </p>
          <LayerRow bar={build.bar} />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              disabled={!heard}
              onClick={props.onContinue}
              data-testid="loop-continue"
              autoFocus={heard}
            >
              {heard ? "Continue" : "Listen to the build-up…"}
            </Button>
            {!build.playing && build.bar !== null && (
              <Button onClick={build.restart} icon={<Play aria-hidden className="size-4" />}>
                Play it again
              </Button>
            )}
          </div>
        </section>
      )}

      {step === "edit" && (
        <section className="flex flex-col gap-3" data-testid="screen-edit" aria-labelledby="edit-title">
          <h1 id="edit-title" className="text-h1 outline-none" tabIndex={-1}>
            Change one number
          </h1>
          <p className="max-w-measure text-text-2">
            The boxed <span className="font-mono text-text">4</span> in the last line is the melody's final
            note. Change it to any number from 0 to 7, then press <Kbd>{mod}</Kbd> <Kbd>Enter</Kbd> to run it.
            You'll hear it in the fourth bar of every loop.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={() => void run()} data-testid="edit-run">
              Run it
            </Button>
            <span className="text-sm text-text-3">
              or <Kbd>{mod}</Kbd> <Kbd>Enter</Kbd> in the editor
            </span>
          </div>
          {problem && <Callout tone="attention" title={problem} />}
        </section>
      )}

      {step === "react" && reaction && (
        <section className="flex flex-col gap-3" data-testid="screen-react" aria-labelledby="react-title">
          <h1 id="react-title" className="text-h1 outline-none" tabIndex={-1}>
            {reaction.title}
          </h1>
          <p className="max-w-measure text-text-2">{reaction.body}</p>
          <p className="max-w-measure text-text-3">{reaction.listen}</p>
          {problem && <Callout tone="attention" title={problem} />}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={props.onContinue} data-testid="react-continue" autoFocus>
              Continue
            </Button>
            <span className="text-sm text-text-3">
              Try another number in the box and run it again; the note above follows.
            </span>
          </div>
        </section>
      )}

      <div
        className={clsx("onb-loop", step === "loop" && "onb-loop--build")}
        data-lines={Object.keys(lines).join(" ")}
      >
        <Workbench
          id={LOOP_EDITOR}
          code={code}
          lessonCtx={LOOP_LESSON_CTX}
          lint={ONBOARDING_LINT}
          unit="U00"
          views={["roll"]}
          variant="compact"
          roll={{ color: "part", labels: "none" }}
          readOnly={readOnly}
          onChange={(c) => {
            setCode(c);
            props.onCode?.(c);
          }}
          onEvaluated={onEvaluated}
        />
      </div>
    </div>
  );
}
