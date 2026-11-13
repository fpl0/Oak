// The scope / spectrum panel and visual probes inside a lesson step (Wave 5, docs/design/wave5.md §4.4). Content
// opens the panels with `StepUi.initialPanels` ("scope", "spectrum"; tb.scope at A1.L01) and asks for a probe with
// `StepUi.probe` (filter, envelope, harmonics; `PROBE_TOOLS`). The code's own `.scope()` / `.fscope()` open the
// same panel (contracts §3.1 rule 9: `EvalOutcome.panels`). The panel reads `OakStrudel.scope` (`ScopeTap`: wave,
// spectrum, source) and draws with `@oak/audio` `steadyWave` / `spectrumBands` / `harmonicLevels`; a probe is
// computed from the step track's first hap with `@oak/strudel/probes` `probeOf`. Frozen after Foundation.
import type { ProbeKind, StepUi } from "@oak/content-kit";
import { PROBE_TOOLS } from "@oak/content-kit";
import type { LiveHap, ScopePanel, ScopeSource } from "@oak/strudel";
import { probeOf, type VisualProbe, type VisualProbeKind } from "@oak/strudel/probes";

/** The probe a step asks for, resolved. */
export interface StepProbe {
  kind: ProbeKind;
  /** The track it reads (the step's `probe.track`), `null`: the first pitched learner track. */
  track: string | null;
}

/** What a lesson host passes the Workbench for the panel (`scopePanel` prop; the workbench engineer draws it). */
export interface ScopePanelHostProps {
  /** Which views are open: the wave (`scope`) and the spectrum (`fscope`). */
  panels: ScopePanel[];
  /** Master bus, or one track (A1.L01 shows one voice; `ScopeTap.setSource`). */
  source: ScopeSource;
  probe: StepProbe | null;
}

/** The step's probe, or `null`. */
export function stepProbeOf(ui: Pick<StepUi, "probe"> | null | undefined): StepProbe | null {
  const p = ui?.probe;
  if (!p) return null;
  return { kind: p.kind, track: typeof p.track === "string" && !p.track.startsWith("@") ? p.track : null };
}

/** The scope panels a step opens (`initialPanels` "scope" → wave, "spectrum" → spectrum). */
export function stepScopePanelsOf(ui: Pick<StepUi, "initialPanels"> | null | undefined): ScopePanel[] {
  const list = ui?.initialPanels ?? [];
  const out: ScopePanel[] = [];
  if (list.includes("scope")) out.push("scope");
  if (list.includes("spectrum")) out.push("fscope");
  return out;
}

/** The panel props for a step: its panels merged with the ones the code asked for, the step's probe, the source. */
export function scopePanelOf(
  ui: Pick<StepUi, "initialPanels" | "probe"> | null | undefined,
  fromCode: readonly ScopePanel[] = [],
): ScopePanelHostProps {
  const panels = [...new Set([...stepScopePanelsOf(ui), ...fromCode])];
  const probe = stepProbeOf(ui);
  return { panels, source: probe?.track ? { kind: "track", label: probe.track } : { kind: "master" }, probe };
}

/** Whether a probe can show for this learner (its toolbox row is unlocked). */
export function probeUnlocked(kind: ProbeKind, unlocked: ReadonlySet<string>): boolean {
  return unlocked.has(PROBE_TOOLS[kind]);
}

const KIND: Record<ProbeKind, VisualProbeKind> = {
  filter: "filter",
  envelope: "envelope",
  harmonics: "harmonics",
};

/**
 * The probe the step shows for the code that just ran: from the first hap of the probe's track (else the first
 * learner track with a pitch), `null` when that hap sets nothing the probe draws (no filter yet: "Add .lpf()").
 */
export function probeFromHaps(probe: StepProbe, haps: readonly LiveHap[], cps: number): VisualProbe | null {
  const learner = haps.filter((h) => !h.track.startsWith("band."));
  const hap = probe.track
    ? learner.find((h) => h.track === probe.track)
    : (learner.find(
        (h) => h.value.note !== undefined || h.value.n !== undefined || h.value.freq !== undefined,
      ) ?? learner[0]);
  if (!hap) return null;
  return probeOf(KIND[probe.kind], hap.value, cps);
}
