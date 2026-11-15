// /dev/kit (OAK_DEV=1 tooling): every shared UI primitive in its states, in the current theme, for review and the
// kit screenshot spec (app/src/ui/kit/e2e). Wave 2 surfaces build on these; check here first before adding a new
// one to your own folder.

import { Link } from "@tanstack/react-router";
import { BookOpen, Music2, Play, Sparkles } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button, buttonClass, IconButton } from "../../../ui/kit/Button.tsx";
import {
  Card,
  CardHeader,
  Chip,
  EmptyState,
  Kbd,
  Page,
  PageHeader,
  Progress,
  type RailStep,
  Skeleton,
  StepRail,
} from "../../../ui/kit/basics.tsx";
import { Callout, SegmentedControl, Stepper } from "../../../ui/kit/Controls.tsx";
import { Dialog } from "../../../ui/kit/Dialog.tsx";
import { Field, Select, Slider, Switch } from "../../../ui/kit/Field.tsx";
import { KitWave4 } from "../../../ui/kit/gallery/KitWave4.tsx";
import { KitWave5 } from "../../../ui/kit/gallery/KitWave5.tsx";
import { KitWave6 } from "../../../ui/kit/gallery/KitWave6.tsx";
import { KitWave7 } from "../../../ui/kit/gallery/KitWave7.tsx";
import { dbToLevel, Meter, MicLevelMeter, ProgressRing } from "../../../ui/kit/Meters.tsx";
import { Tabs, tabPanelProps } from "../../../ui/kit/Tabs.tsx";
import { toast } from "../../../ui/kit/Toast.tsx";
import { usePrefs } from "../../../ui/theme/prefs.ts";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3" data-kit-section={id}>
      <h2 id={id} className="text-h3">
        {title}
      </h2>
      <Card className="flex flex-col gap-4 p-4">{children}</Card>
    </section>
  );
}

/** Specimen buttons answer with a toast naming themselves, so nothing on this page is a dead control. */
const demo = (what: string) => () => toast.info(what, "A specimen on the kit page.");

const Row = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-wrap items-center gap-3">{children}</div>
);

const RAIL: RailStep[] = [
  { id: "S1", label: "Listen", state: "done" },
  { id: "S2", label: "Predict", state: "done" },
  { id: "S3", label: "Run", state: "current" },
  { id: "S4", label: "Modify", state: "todo" },
  { id: "S5", label: "Stretch", state: "optional" },
  { id: "S6", label: "Make", state: "todo" },
];

export function KitGallery() {
  const theme = usePrefs((s) => s.theme);
  const setPrefs = usePrefs((s) => s.set);
  const [target, setTarget] = useState<"15" | "20" | "25">("20");
  const [goal, setGoal] = useState(5);
  const [view, setView] = useState<"tree" | "course" | "leaves">("tree");
  const [db, setDb] = useState(-24);
  const [calm, setCalm] = useState(false);
  const [labels, setLabels] = useState<"auto" | "note" | "degree">("auto");
  const [dialog, setDialog] = useState(false);
  const [callout, setCallout] = useState(true);

  return (
    <Page>
      <PageHeader
        title="UI kit"
        sub="Every shared primitive in its states. Switch the theme to check Paper and Bark."
        actions={
          <SegmentedControl<"paper" | "bark">
            label="Theme"
            value={theme === "bark" ? "bark" : "paper"}
            options={[
              { value: "paper", label: "Paper" },
              { value: "bark", label: "Bark" },
            ]}
            onChange={(v) => setPrefs({ theme: v })}
          />
        }
      />
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
        <Section id="kit-buttons" title="Buttons">
          <Row>
            <Button
              variant="primary"
              icon={<Play aria-hidden className="size-4" />}
              onClick={demo("Start session")}
            >
              Start session
            </Button>
            <Button onClick={demo("Keep going")}>Keep going</Button>
            <Button variant="ghost" onClick={demo("Skip")}>
              Skip
            </Button>
            <Button variant="danger" onClick={demo("Delete sketch")}>
              Delete sketch
            </Button>
          </Row>
          <Row>
            <Button size="sm" onClick={demo("Small")}>
              Small
            </Button>
            <Button size="lg" variant="primary" onClick={demo("Large")}>
              Large
            </Button>
            <Button loading>Checking</Button>
            <Button disabled>Disabled</Button>
            <IconButton
              label="Open the toolbox"
              onClick={demo("Open the toolbox")}
              icon={<BookOpen aria-hidden className="size-4" />}
            />
            <IconButton
              label="Hear it"
              onClick={demo("Hear it")}
              shortcut="Space"
              variant="secondary"
              icon={<Music2 aria-hidden className="size-4" />}
            />
          </Row>
        </Section>

        <Section id="kit-chips" title="Chips and keys">
          <Row>
            <Chip>Warm-up · 5 min</Chip>
            <Chip tone="accent">Passed</Chip>
            <Chip tone="amber">preview: unlocks at U02.L03</Chip>
            <Chip tone="issue">Bar 2, beat 3</Chip>
            <Chip tone="danger">Mic blocked</Chip>
          </Row>
          <Row>
            <span className="text-sm text-text-2">
              Run <Kbd>⌘</Kbd> <Kbd>Enter</Kbd> · Check <Kbd>⌘</Kbd> <Kbd>⇧</Kbd> <Kbd>Enter</Kbd> · Hint{" "}
              <Kbd>H</Kbd>
            </span>
          </Row>
        </Section>

        <Section id="kit-progress" title="Progress, rings and meters">
          <Row>
            <ProgressRing value={1} max={2} label="Capstone sessions done" />
            <ProgressRing value={6} max={9} size={64} stroke={5} label="Unit lessons done" tone="amber" />
            <ProgressRing value={3} max={3} label="Warm-up sets done">
              <Sparkles aria-hidden className="size-4 text-accent" />
            </ProgressRing>
            <div className="min-w-48 flex-1">
              <Progress value={0.4} label="Lesson progress" />
            </div>
          </Row>
          <Meter
            label="Strength"
            value={0.72}
            valueText="72%"
            ticks={[{ at: 0.85, label: "Mastery line" }]}
          />
          <Meter label="Ear-to-voice aim" value={35} min={0} max={70} valueText="±35¢" tone="amber" />
          <Meter label="Recall" value={0.3} valueText="Fading" tone="neutral" />
          <StepRail steps={RAIL} label="Lesson steps" />
        </Section>

        <Section id="kit-mic" title="Microphone level">
          <MicLevelMeter level={dbToLevel(db)} floor={dbToLevel(-52)} live clipping={db > -3} />
          <MicLevelMeter level={0} live={false} />
          <Field label="Simulated input level" help="Drag past −3 dB to see the clipping state.">
            {({ id, describedBy }) => (
              <Slider
                id={id}
                describedBy={describedBy}
                value={db}
                min={-60}
                max={0}
                onChange={setDb}
                format={(v) => `${v} dB`}
              />
            )}
          </Field>
        </Section>

        <Section id="kit-controls" title="Controls">
          <Row>
            <span className="w-28 font-medium">Daily target</span>
            <SegmentedControl<"15" | "20" | "25">
              label="Daily target"
              value={target}
              options={[
                { value: "15", label: "15 min" },
                { value: "20", label: "20 min" },
                { value: "25", label: "25 min" },
              ]}
              onChange={setTarget}
            />
          </Row>
          <Row>
            <span className="w-28 font-medium">Weekly goal</span>
            <Stepper
              id="kit-goal"
              label="Weekly goal"
              value={goal}
              min={3}
              max={7}
              onChange={setGoal}
              format={(v) => (v === 1 ? "day a week" : "days a week")}
            />
          </Row>
          <Row>
            <SegmentedControl<"tree" | "course" | "leaves">
              size="sm"
              label="Map view"
              value={view}
              options={[
                { value: "tree", label: "Tree" },
                { value: "course", label: "Course" },
                { value: "leaves", label: "Leaves", disabled: true },
              ]}
              onChange={setView}
            />
          </Row>
          <div className="flex flex-col divide-y divide-border">
            <Field label="Calm highlighting" help="Steady outlines instead of flashes.">
              {({ id, describedBy }) => (
                <Switch id={id} describedBy={describedBy} checked={calm} onChange={setCalm} />
              )}
            </Field>
            <Field label="Roll labels">
              {({ id }) => (
                <Select<"auto" | "note" | "degree">
                  id={id}
                  value={labels}
                  options={[
                    { value: "auto", label: "Automatic" },
                    { value: "note", label: "Note names" },
                    { value: "degree", label: "Degrees" },
                  ]}
                  onChange={setLabels}
                />
              )}
            </Field>
          </div>
        </Section>

        <Section id="kit-tabs" title="Tabs">
          <Tabs
            label="Views"
            idBase="kit-tabs"
            value={view === "leaves" ? "tree" : view}
            onChange={(v) => setView(v)}
            items={[
              { value: "tree", label: "Tree" },
              { value: "course", label: "Course" },
            ]}
          />
          <div
            {...tabPanelProps("kit-tabs", view === "leaves" ? "tree" : view)}
            className="text-sm text-text-2"
          >
            {view === "course" ? "The course list, unit by unit." : "The Oak: one leaf per skill."}
          </div>
        </Section>

        <Section id="kit-callouts" title="Callouts">
          {callout ? (
            <Callout
              tone="attention"
              title="That's 20 minutes. Wrap up with a quick sketch?"
              onDismiss={() => setCallout(false)}
              actions={
                <>
                  <Button size="sm" variant="primary" onClick={() => setCallout(false)}>
                    Wrap up
                  </Button>
                  <Button size="sm" onClick={() => setCallout(false)}>
                    Keep going
                  </Button>
                </>
              }
            />
          ) : (
            <Button size="sm" onClick={() => setCallout(true)}>
              Show the wrap-up line again
            </Button>
          )}
          <Callout title="The tutor is off">
            No API key and no Claude login found. Oak works fully without it; Settings › Tutor explains both.
          </Callout>
          <Callout tone="success" title="Sketch saved">
            Sketch 012 · C major · 90 BPM
          </Callout>
          <Callout tone="issue" title="That took too long">
            An infinite loop or a huge pattern? Check the last line you changed.
          </Callout>
        </Section>

        <Section id="kit-overlays" title="Cards, overlays and feedback">
          <Card interactive className="overflow-hidden">
            <CardHeader
              title="Next unlock"
              sub="2 lessons to go"
              action={<Chip tone="amber">.voicing()</Chip>}
            />
            <div className="p-4 pt-2 text-sm text-text-2">
              Chords that move smoothly from one to the next.
            </div>
          </Card>
          <Row>
            <Button onClick={() => setDialog(true)}>Open a dialog</Button>
            <Button onClick={() => toast.success("Sketch saved", "Sketch 012")}>Show a toast</Button>
            <Button onClick={() => toast.error("Couldn't save", "Oak's server isn't answering.")}>
              Show an error toast
            </Button>
          </Row>
          <Dialog
            open={dialog}
            onClose={() => setDialog(false)}
            title="Leave the lesson?"
            description="Your place is saved. You'll pick up at step 3 next time."
            footer={
              <>
                <Button onClick={() => setDialog(false)}>Stay</Button>
                <Button variant="primary" onClick={() => setDialog(false)}>
                  Leave
                </Button>
              </>
            }
          />
        </Section>

        <Section id="kit-states" title="Loading and empty states">
          <fieldset className="flex flex-col gap-2 border-0 p-0" aria-label="Loading example">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </fieldset>
          <EmptyState
            icon={<Music2 aria-hidden />}
            title="No sketches yet"
            action={
              <Link to="/studio" className={buttonClass("primary")}>
                New sketch
              </Link>
            }
          >
            Every session ends with one. Your first arrives with today's Make.
          </EmptyState>
        </Section>
      </div>
      <KitWave4 nested />
      <KitWave5 nested />
      <KitWave6 headingLevel={2} />
      <KitWave7 nested />
    </Page>
  );
}
