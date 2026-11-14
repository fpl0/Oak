// The learner's own recording beside the Workbench (contracts §6.12 L7; ux §9 "BeatGrid", "Your songs"): the
// bar grid (tempo by tapping, the first downbeat, the meter), named sections, the learner's notes, and the
// self-assessed checklist. Own-audio work is graded by the learner (`grading.mode: 'self'`): nothing here is a
// pass or a fail.
import type { TranscriptionDetail } from "@oak/api";
import { OakApiError } from "@oak/api";
import type { KeySpec, MeterId, SwingSpec } from "@oak/content-kit";
import { clsx } from "clsx";
import { Bookmark, ChevronsLeft, ChevronsRight, Hand, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranscriptionPatch, useTranscriptionSettings } from "../lib/queries.ts";
import { Button } from "../ui/kit/Button.tsx";
import { Card, Kbd } from "../ui/kit/basics.tsx";
import { SegmentedControl } from "../ui/kit/Controls.tsx";
import { toast } from "../ui/kit/Toast.tsx";
import { type FormMap, formLettersOf, formSummary, sectionsOf, setLabel } from "./form-map.ts";
import {
  type BarGrid,
  beatSecOfGrid,
  bpmFromTaps,
  downbeatFromTaps,
  formatTime,
  type GridFeel,
  isCompound,
  type Loop,
  nudgeDownbeat,
  scaleTempo,
  tapProgress,
} from "./grid.ts";
import { CHECK_LEVELS, checklistProgress, checklistRows, selfScoreOf } from "./import.ts";
import type { Section } from "./SourceView.tsx";

const METER_CHOICES: MeterId[] = ["4/4", "3/4", "6/8", "12/8", "2/4"];
/** Tonics as Oak spells keys (sharps up the circle, flats down it). */
const TONICS = ["C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"] as const;
const MODES = ["major", "minor"] as const;
const show = (t: string) => t.replace("#", "♯").replace(/(?<=[A-G])b/, "♭");

/**
 * The bar grid of the learner's recording (ux §9 "BeatGrid"). A first run is two steps: tap along (eight taps on
 * the beat, from a bar's first beat, set the tempo and bar 1), then check bar 1 and move it by a beat if the taps
 * started on another beat (Shift+←/→), or halve or double the tempo. Then the meter, the key and the feel: a
 * recording that swings shows its off-beat eighths at the swung place on the grid (W).
 */
export function TempoCard({
  project,
  grid,
  taps,
  onClearTaps,
  onApply,
  getTime,
  onTap,
  playing,
  swing,
  onSwing,
  feel,
  onFeel,
  busy = false,
}: {
  project: TranscriptionDetail;
  grid: BarGrid | null;
  taps: readonly number[];
  onClearTaps(): void;
  onApply(p: { bpm?: number; downbeatS?: number; meter?: MeterId; key?: KeySpec | null }): void;
  /** The playhead now (for "bar 1 starts here"). */
  getTime(): number;
  /** One tap (also the key T); starts the recording when it is stopped. */
  onTap(): void;
  /**
   * A tempo or bar-1 change is being saved: the steps that start from the saved value (double, halve) wait for
   * it, so a quick second click never starts from the old tempo.
   */
  busy?: boolean;
  playing: boolean;
  swing: boolean;
  onSwing(on: boolean): void;
  /**
   * Wave 6: the feel of the grid, with triplets as a third choice (the grid then divides each beat in three). When
   * given, the feel switch offers all three and reports through `onFeel`; a compound meter needs no feel.
   */
  feel?: GridFeel;
  onFeel?(feel: GridFeel): void;
}) {
  const compound = isCompound(project.meter);
  const bpm = bpmFromTaps(taps);
  const down = downbeatFromTaps(taps);
  const bpmId = useId();
  const firstRun = !grid || project.downbeatS === null;
  const prog = tapProgress(taps);
  const beat = grid ? beatSecOfGrid(grid, (project.meter ?? "4/4") as MeterId) : null;
  const earlier =
    beat !== null && project.downbeatS !== null ? nudgeDownbeat(project.downbeatS, beat, -1) : null;
  const later =
    beat !== null && project.downbeatS !== null ? nudgeDownbeat(project.downbeatS, beat, 1) : null;
  return (
    <Card
      className={clsx("flex flex-col gap-2.5 p-4", firstRun && "border-accent")}
      data-testid="tempo-card"
      data-first-run={firstRun || undefined}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-h3">{firstRun ? "Set the bars" : "Bars"}</h2>
        {grid ? (
          <span className="text-sm text-text-3 tabular-nums" data-testid="grid-summary">
            {Math.round((project.bpm ?? 0) * 10) / 10} BPM · bar 1 at {formatTime(project.downbeatS ?? 0)}
          </span>
        ) : null}
      </div>

      <section aria-labelledby={`${bpmId}-tap`} className="flex flex-col gap-1.5" data-testid="tap-step">
        <h3 id={`${bpmId}-tap`} className="font-sans text-sm font-semibold text-text-2">
          <span className="mr-1 text-text-3">1</span> Tap along
        </h3>
        {firstRun ? (
          <p className="text-sm text-text-2">
            {playing
              ? "Tap on each beat, starting on a bar's first beat."
              : "Press Tap to start the recording, then tap on each beat from a bar's first beat."}{" "}
            Eight taps set the tempo and where bar 1 starts.
            {compound
              ? ` In ${project.meter} the beat is the dotted quarter: tap the slow pulse, ${project.meter === "12/8" ? "four" : project.meter === "9/8" ? "three" : "two"} to a bar.`
              : ""}
          </p>
        ) : (
          <p className="text-sm text-text-2">Tap again to reset the tempo and bar 1.</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={firstRun ? "primary" : "secondary"}
            icon={<Hand aria-hidden className="size-4" />}
            onClick={onTap}
            data-testid="tap-button"
          >
            {playing ? "Tap" : "Play and tap"} <Kbd tone={firstRun ? "inverse" : "default"}>T</Kbd>
          </Button>
          <span className="flex items-center gap-1" aria-hidden>
            {Array.from({ length: prog.of }, (_, i) => (
              <span
                key={i}
                className={clsx("size-2 rounded-full", i < prog.count ? "bg-accent" : "bg-border")}
              />
            ))}
          </span>
          <span className="text-sm text-text-2 tabular-nums" aria-live="polite" data-testid="taps">
            {taps.length === 0
              ? "No taps yet"
              : `${prog.count} of ${prog.of}${bpm !== null ? ` · about ${Math.round(bpm)} BPM` : ""}${down !== null ? ` · bar 1 at ${formatTime(down)}` : ""}`}
          </span>
          {bpm !== null && down !== null && taps.length < prog.of ? (
            <Button size="sm" onClick={() => onApply({ bpm, downbeatS: down })} data-testid="use-taps">
              Use this
            </Button>
          ) : null}
          {taps.length > 0 ? (
            <Button size="sm" variant="ghost" onClick={onClearTaps}>
              Clear taps
            </Button>
          ) : null}
        </div>
      </section>

      <section
        aria-labelledby={`${bpmId}-check`}
        className={clsx("flex flex-col gap-1.5", !grid && "opacity-60")}
        data-testid="check-step"
      >
        <h3 id={`${bpmId}-check`} className="font-sans text-sm font-semibold text-text-2">
          <span className="mr-1 text-text-3">2</span> Check bar 1
        </h3>
        <p className="text-sm text-text-2">
          {grid
            ? "Play from the start: bar 1's line should fall on the strong beat. If your taps began on another beat, move bar 1 by a beat."
            : "Once the taps set the bars, check that bar 1 falls on the strong beat."}
        </p>
        <p className="text-sm">
          <span className="text-text-2">Bar 1 at </span>
          <span className="tabular-nums" data-testid="downbeat">
            {project.downbeatS !== null ? formatTime(project.downbeatS) : "not set"}
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            icon={<ChevronsLeft aria-hidden className="size-4" />}
            disabled={earlier === null}
            onClick={() => earlier !== null && onApply({ downbeatS: earlier })}
            aria-label="Move bar 1 a beat earlier (Shift+Left)"
            data-testid="beat-earlier"
          >
            A beat earlier
          </Button>
          <Button
            size="sm"
            icon={<ChevronsRight aria-hidden className="size-4" />}
            disabled={later === null}
            onClick={() => later !== null && onApply({ downbeatS: later })}
            aria-label="Move bar 1 a beat later (Shift+Right)"
            data-testid="beat-later"
          >
            A beat later
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={project.downbeatS === null}
            aria-label="Move bar 1 earlier by 10 milliseconds"
            onClick={() => onApply({ downbeatS: Math.max(0, (project.downbeatS ?? 0) - 0.01) })}
          >
            −10 ms
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={project.downbeatS === null}
            aria-label="Move bar 1 later by 10 milliseconds"
            onClick={() => onApply({ downbeatS: (project.downbeatS ?? 0) + 0.01 })}
          >
            +10 ms
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onApply({ downbeatS: Math.max(0, getTime()) })}>
            Bar 1 starts here
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm text-text-2">Tapped every other beat, or every half beat?</span>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || project.bpm === null || scaleTempo(project.bpm, 2) === null}
            onClick={() =>
              project.bpm !== null && onApply({ bpm: scaleTempo(project.bpm, 2) ?? project.bpm })
            }
            data-testid="tempo-double"
          >
            Double it
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || project.bpm === null || scaleTempo(project.bpm, 0.5) === null}
            onClick={() =>
              project.bpm !== null && onApply({ bpm: scaleTempo(project.bpm, 0.5) ?? project.bpm })
            }
            data-testid="tempo-half"
          >
            Halve it
          </Button>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2.5">
        <label className="flex items-center gap-1.5 text-sm" htmlFor={bpmId}>
          <span className="text-text-2">Tempo</span>
          <input
            id={bpmId}
            type="number"
            min={30}
            max={300}
            step={0.5}
            value={project.bpm ?? ""}
            placeholder="BPM"
            onChange={(e) => {
              const n = Number(e.target.value);
              if (e.target.value !== "" && n >= 30 && n <= 300) onApply({ bpm: n });
            }}
            className="h-8 w-20 rounded-control border border-border bg-surface px-2 tabular-nums text-text"
            data-testid="bpm-input"
          />
          <span className="text-text-2">BPM</span>
        </label>
        <span className="flex items-center gap-1.5 text-sm">
          <span className="text-text-2">Key</span>
          <select
            aria-label="Key: tonic"
            value={project.key?.tonic ?? ""}
            onChange={(e) =>
              onApply({
                key: e.target.value ? { tonic: e.target.value, mode: project.key?.mode ?? "major" } : null,
              })
            }
            className="h-8 rounded-control border border-border bg-surface px-1.5 text-text"
            data-testid="key-tonic"
          >
            <option value="">not set</option>
            {TONICS.map((t) => (
              <option key={t} value={t}>
                {show(t)}
              </option>
            ))}
          </select>
          <select
            aria-label="Key: mode"
            value={project.key?.mode === "minor" ? "minor" : "major"}
            disabled={!project.key}
            onChange={(e) =>
              project.key &&
              onApply({ key: { ...project.key, mode: e.target.value as (typeof MODES)[number] } })
            }
            className="h-8 rounded-control border border-border bg-surface px-1.5 text-text disabled:opacity-50"
          >
            {MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </span>
        <SegmentedControl
          label="Meter"
          size="sm"
          value={(project.meter ?? "4/4") as MeterId}
          options={METER_CHOICES.map((m) => ({ value: m, label: m }))}
          onChange={(m) => onApply({ meter: m })}
        />
        <span className="flex items-center gap-1.5" data-testid="swing-switch">
          {feel !== undefined && onFeel ? (
            <SegmentedControl
              label="Feel (W swings)"
              size="sm"
              value={compound ? "straight" : feel}
              options={[
                { value: "straight" as GridFeel, label: compound ? "In three" : "Straight" },
                { value: "swing" as GridFeel, label: "Swing 8ths", disabled: !swingMeter(project.meter) },
                { value: "triplet" as GridFeel, label: "Triplets", disabled: compound },
              ]}
              onChange={(v) => onFeel(v)}
            />
          ) : (
            <SegmentedControl
              label="Feel (W)"
              size="sm"
              value={swing ? "swing" : "straight"}
              options={[
                { value: "straight", label: "Straight" },
                { value: "swing", label: "Swing 8ths", disabled: !swingMeter(project.meter) },
              ]}
              onChange={(v) => onSwing(v === "swing")}
            />
          )}
          <Kbd>W</Kbd>
        </span>
      </div>
      {grid ? (
        <p className="text-sm text-text-3">
          A bar is {grid.barSec.toFixed(2)} s.{" "}
          {compound
            ? `BPM counts the dotted quarter; the grid marks each beat's three eighths. `
            : feel === "triplet"
              ? "The grid marks three to each beat. "
              : swing
                ? "The grid marks the swung off-beats at two thirds of each beat. "
                : ""}
          A/B plays your code with the recording from the start of the bar the playhead is in.
        </p>
      ) : null}
    </Card>
  );
}

/** Swing is for simple meters only (contracts §6.10: never in compound meters). */
export const swingMeter = (meter: string | null): boolean => meter === null || !/^(6|9|12)\/8$/.test(meter);

const SWING_KEY = (id: string) => `oak.transcribe.swing.${id}`;
/** The feel of an own-audio project (kept in this browser until the server keeps it: apiNotes). */
export function readSwing(id: string): boolean {
  try {
    return localStorage.getItem(SWING_KEY(id)) === "1";
  } catch {
    return false;
  }
}
/**
 * The own-audio feel: the server's `settings.swing` (Wave 5, `null` straight), else what this browser remembered
 * before the server kept it (projects switched before the field existed).
 */
export function projectSwing(p: {
  id: string;
  settings?: { swing?: SwingSpec | null | undefined } | undefined;
}): boolean {
  const kept = p.settings?.swing;
  return kept === undefined ? readSwing(p.id) : kept !== null;
}
const FEEL_KEY = (id: string) => `oak.transcribe.feel.${id}`;
/**
 * Triplets on the grid of an own-audio project. The server keeps the swing (`settings.swing`); it has no field for
 * a triplet grid yet (apiNotes), so this browser remembers it.
 */
export function readTriplets(id: string): boolean {
  try {
    return localStorage.getItem(FEEL_KEY(id)) === "triplet";
  } catch {
    return false;
  }
}
export function writeTriplets(id: string, on: boolean): void {
  try {
    if (on) localStorage.setItem(FEEL_KEY(id), "triplet");
    else localStorage.removeItem(FEEL_KEY(id));
  } catch {
    // storage blocked: the choice lasts for this visit
  }
}
/** The feel the swing switch stores: triplet swing on the eighths, or straight. */
export const SWUNG_EIGHTHS: SwingSpec = { subdivision: 8, amount: 1 / 3 };
export function writeSwing(id: string, on: boolean): void {
  try {
    if (on) localStorage.setItem(SWING_KEY(id), "1");
    else localStorage.removeItem(SWING_KEY(id));
  } catch {
    // storage blocked: the switch lasts for this visit
  }
}

export function SectionsCard({
  sections,
  loop,
  onAdd,
  onRemove,
  onLoop,
}: {
  sections: readonly Section[];
  loop: Loop | null;
  onAdd(label: string): void;
  onRemove(id: string): void;
  onLoop(s: Section): void;
}) {
  const [name, setName] = useState("");
  const inputId = useId();
  return (
    <Card className="flex flex-col gap-2 p-4" data-testid="sections">
      <h2 className="text-h3">Sections</h2>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!loop || !name.trim()) return;
          onAdd(name.trim());
          setName("");
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Section name
        </label>
        <input
          id={inputId}
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          placeholder={loop ? "Name this loop: Verse, Chorus…" : "Set a loop first"}
          disabled={!loop}
          className="h-8 min-w-0 flex-1 rounded-control border border-border bg-surface px-2 text-sm text-text disabled:opacity-60"
        />
        <Button
          size="sm"
          type="submit"
          icon={<Bookmark aria-hidden className="size-4" />}
          disabled={!loop || !name.trim()}
        >
          Add
        </Button>
      </form>
      {sections.length === 0 ? (
        <p className="text-sm text-text-3">Named sections appear on the waveform; click one to loop it.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {sections.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <button
                type="button"
                onClick={() => onLoop(s)}
                className="flex-1 rounded-control px-1 py-0.5 text-left hover:bg-surface-2"
              >
                <span className="font-medium">{s.label}</span>{" "}
                <span className="tabular-nums text-text-3">
                  {formatTime(s.startS)}–{formatTime(s.endS)}
                </span>
              </button>
              <button
                type="button"
                aria-label={`Remove the section ${s.label}`}
                onClick={() => onRemove(s.id)}
                className="inline-flex size-7 items-center justify-center rounded-control text-text-3 hover:bg-surface-2 hover:text-text"
              >
                <Trash2 aria-hidden className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function NotesCard({ project }: { project: TranscriptionDetail }) {
  const put = useTranscriptionSettings();
  const [text, setText] = useState(project.settings?.notes ?? "");
  const [state, setState] = useState<"saved" | "saving" | "unsaved" | "unavailable">("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const save = (value: string) => {
    setState("saving");
    put.mutate(
      { params: { id: project.id }, body: { notes: value } },
      {
        onSuccess: () => setState("saved"),
        onError: (e) =>
          setState(e instanceof OakApiError && e.code === "not_implemented" ? "unavailable" : "unsaved"),
      },
    );
  };
  return (
    <Card className="flex flex-col gap-1.5 p-4">
      <label htmlFor={id} className="text-h3">
        Notes
      </label>
      <textarea
        id={id}
        value={text}
        maxLength={4000}
        rows={3}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          setState("unsaved");
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => save(v), 800);
        }}
        placeholder="What you hear: the form, where the chords change, a lyric that marks the chorus…"
        className="w-full resize-y rounded-control border border-border bg-surface p-2 text-sm text-text"
        data-testid="notes"
      />
      <p className="text-sm text-text-3" aria-live="polite" data-testid="notes-state">
        {state === "saving"
          ? "Saving…"
          : state === "unsaved"
            ? "Not saved yet"
            : state === "unavailable"
              ? "Notes can't be kept on this server yet."
              : "Your own notes. Claude sees them only if you paste them into the tutor."}
      </p>
    </Card>
  );
}

export function ChecklistCard({
  project,
  withForm = false,
}: {
  project: TranscriptionDetail;
  /** The recording's sections are mapped (a full arrangement): the checklist asks about the form too. */
  withForm?: boolean;
}) {
  const patch = useTranscriptionPatch();
  const [list, setList] = useState<Record<string, number>>(project.checklist);
  const rows = checklistRows(withForm || typeof list.form === "number");
  const prog = checklistProgress(list, rows);
  const set = (id: string, v: number) => {
    const next = { ...list, [id]: v };
    setList(next);
    patch.mutate(
      { params: { id: project.id }, body: { checklist: next, selfScore: selfScoreOf(next, rows) } },
      { onError: (e) => toast.error("Couldn't save the checklist", e.message) },
    );
  };
  return (
    <Card className="flex flex-col gap-2 p-4" data-testid="checklist">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-h3">How close is it?</h2>
        <span className="text-sm text-text-3">
          {prog.answered} of {prog.total}
        </span>
      </div>
      <p className="text-sm text-text-2">
        Your own audio has no answer key: compare with A/B and judge each part yourself.
      </p>
      <ul className="flex flex-col gap-2.5">
        {rows.map((row) => {
          const v = list[row.id];
          return (
            <li key={row.id} className="flex flex-col gap-1">
              <span className={clsx("text-sm", v === undefined ? "text-text-2" : "text-text")}>
                {row.label}
              </span>
              <fieldset className="m-0 flex gap-1 border-0 p-0">
                <legend className="sr-only">{row.label}</legend>
                {CHECK_LEVELS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    aria-pressed={v === c.value}
                    onClick={() => set(row.id, c.value)}
                    className="h-7 rounded-control border border-border px-2.5 text-sm text-text-2 hover:bg-surface-2 aria-pressed:border-accent aria-pressed:bg-lane-in aria-pressed:font-medium aria-pressed:text-text"
                    data-testid={`check-${row.id}-${c.value}`}
                  >
                    {c.label}
                  </button>
                ))}
              </fieldset>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          variant={project.status === "done" ? "ghost" : "secondary"}
          onClick={() =>
            patch.mutate({
              params: { id: project.id },
              body: { status: project.status === "done" ? "in_progress" : "done" },
            })
          }
          data-testid="mark-done"
        >
          {project.status === "done" ? "Mark as in progress" : "Mark as done"}
        </Button>
      </div>
    </Card>
  );
}

/**
 * The form of the learner's own recording (L7, full arrangement; CF.md "Own audio"): the sections they cut on the
 * strip under the waveform, each named here, looped with a click. Nothing is graded. The map is kept as the
 * project's sections, so a backup exports it with the project; "Write it into my code" puts it at the top of the
 * code as a comment, so every saved version carries it too.
 */
export function FormCard({
  map,
  onChange,
  onLoop,
  onWrite,
}: {
  map: FormMap;
  onChange(m: FormMap): void;
  onLoop(from: number, to: number): void;
  /** Put the form at the top of the code as a comment. */
  onWrite(): void;
}) {
  const sections = sectionsOf(map);
  const mapped = sections.length > 1 || Boolean(sections[0]?.label);
  return (
    <Card className="flex flex-col gap-2 p-4" data-testid="form-card">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-h3">Form</h2>
        {mapped ? (
          <span className="text-sm text-text-3" data-testid="form-summary">
            {formLettersOf(map).split("").join(" ")}
          </span>
        ) : null}
      </div>
      {mapped ? (
        <>
          <ol className="flex flex-col gap-1.5">
            {sections.map((s) => (
              <li key={s.from} className="flex items-center gap-2 text-sm">
                <span className="w-24 shrink-0 tabular-nums text-text-2">
                  bars {s.from}–{s.to}
                </span>
                <input
                  aria-label={`Name of section ${s.index + 1}, bars ${s.from} to ${s.to}`}
                  defaultValue={s.label}
                  key={`${s.from}-${s.label}`}
                  maxLength={24}
                  placeholder="verse, chorus, A…"
                  onBlur={(e) => {
                    if (e.target.value.trim() !== s.label) onChange(setLabel(map, s.index, e.target.value));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  className="h-8 min-w-0 flex-1 rounded-control border border-border bg-surface px-2 text-text"
                  data-testid="form-name"
                />
                <Button size="sm" variant="ghost" onClick={() => onLoop(s.from, s.to)}>
                  Loop
                </Button>
              </li>
            ))}
          </ol>
          <p className="text-sm text-text-3">{formSummary(map)}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={onWrite} data-testid="form-to-code">
              Write it into my code
            </Button>
            <span className="text-sm text-text-3">Kept with the project and in its backup.</span>
          </div>
        </>
      ) : (
        <p className="text-sm text-text-2">
          Map the recording's sections on the strip under the waveform: press <Kbd>X</Kbd> while it plays
          where a new section starts, or click a bar line. Then name them here.
        </p>
      )}
    </Card>
  );
}
