// The Wave 5 app seams (docs/design/wave5.md §4): line lenses, the form view host and the scope panel / probes.
import { describe, expect, test } from "bun:test";
import type { FormView } from "@oak/grader";
import type { LiveHap } from "@oak/strudel";
import {
  formProblemOf,
  formSectionsOf,
  loopBarsForForm,
  sectionAtBar,
  sectionLoopOf,
  stepSection,
} from "./form-view.ts";
import { effectiveLineLenses, lineLensAvailability, lineLensPrefs } from "./lenses.ts";
import { initialPanelsOf } from "./panels.ts";
import { probeFromHaps, probeUnlocked, scopePanelOf, stepProbeOf } from "./scope-panel.ts";

const base = { degrees: true, solfege: true, noteNames: false };

describe("line lenses", () => {
  test("absent preferences are on; each is gated by its unlock", () => {
    expect(lineLensPrefs(base)).toEqual({ sections: true, bassRoles: true, blueNotes: true });
    expect(lineLensAvailability(new Set())).toEqual({ sections: false, bassRoles: false, blueNotes: false });
    expect(lineLensAvailability(new Set(["tb.lens.form", "scale.blues"]))).toEqual({
      sections: true,
      bassRoles: false,
      blueNotes: true,
    });
    expect(
      effectiveLineLenses(
        { ...base, sections: false },
        new Set(["tb.lens.form", "tb.rootNotes", "scale.blues"]),
      ),
    ).toEqual({ sections: false, bassRoles: true, blueNotes: true });
  });
});

const features = (energy: number) => ({
  density: 4,
  meanPitch: 64,
  low: 48,
  high: 72,
  instrumentation: ["drums"],
  loudness: 0.8,
  harmonicRhythm: 1,
  energy,
});
const VIEW: FormView = {
  kind: "sections",
  totalBars: 24,
  energy: [],
  sections: [
    { label: "verse", tag: "verse", startBar: 0, bars: 8, tracks: ["drums"], features: features(0.3) },
    { label: "chorus", tag: "chorus", startBar: 8, bars: 8, tracks: ["drums"], features: features(0.8) },
    { label: "chorus", tag: "chorus2", startBar: 16, bars: 8, tracks: ["drums"], features: features(0.9) },
  ],
};

describe("form view", () => {
  test("sections with text, letters and energy; a click loops a section", () => {
    const s = formSectionsOf(VIEW);
    expect(s.map((x) => `${x.letter}:${x.text}`)).toEqual(["A:Verse", "B:Chorus", "B:Chorus 2"]);
    expect(s[1]?.energy).toBe(0.8);
    expect(sectionLoopOf(s[2] as NonNullable<(typeof s)[number]>)).toEqual({
      from: 16,
      bars: 8,
      tag: "chorus2",
    });
    expect(sectionAtBar(s, 9)?.tag).toBe("chorus");
    expect(sectionAtBar(s, 24)).toBeNull();
    expect(stepSection(s, s[0] ?? null, 1)?.tag).toBe("chorus");
    expect(stepSection(s, s[2] ?? null, 1)?.tag).toBe("chorus2");
    expect(stepSection(s, null, -1)?.tag).toBe("chorus2");
    expect(loopBarsForForm(24, 4)).toBe(24);
  });
  test("no sections, or tracks that disagree", () => {
    expect(formSectionsOf(null)).toEqual([]);
    const bad: FormView = {
      kind: "inconsistent",
      track: "mel",
      detail: "mel has 2 sections; drums has 3",
      totalBars: 24,
      energy: [],
    };
    expect(formSectionsOf(bad)).toEqual([]);
    expect(formProblemOf(bad)).toBe("mel has 2 sections; drums has 3");
  });
});

describe("scope panel and probes", () => {
  test("a step opens the wave and the spectrum, with a probe on one track", () => {
    const ui = {
      initialPanels: ["scope", "spectrum"] as const,
      probe: { kind: "filter" as const, track: "bass" },
    };
    expect(scopePanelOf({ initialPanels: [...ui.initialPanels], probe: ui.probe }, ["scope"])).toEqual({
      panels: ["scope", "fscope"],
      source: { kind: "track", label: "bass" },
      probe: { kind: "filter", track: "bass" },
    });
    expect(scopePanelOf(null, ["fscope"])).toEqual({
      panels: ["fscope"],
      source: { kind: "master" },
      probe: null,
    });
    expect(stepProbeOf({ probe: { kind: "envelope", track: "@melody" } })).toEqual({
      kind: "envelope",
      track: null,
    });
    expect(initialPanelsOf({ initialPanels: ["scope"] })?.scope).toBe(true);
  });
  test("probes come from the step track's first hap and need their tool", () => {
    const haps: LiveHap[] = [
      { track: "band.drums", begin: 0, end: 0.25, value: { s: "bd" }, locations: [] },
      {
        track: "bass",
        begin: 0,
        end: 0.25,
        value: { note: 36, s: "sawtooth", cutoff: 600, resonance: 6 },
        locations: [],
      },
      {
        track: "pad",
        begin: 0,
        end: 1,
        value: { note: 60, s: "triangle", attack: 0.4, release: 1 },
        locations: [],
      },
    ];
    expect(probeFromHaps({ kind: "filter", track: "bass" }, haps, 0.5)).toEqual({
      kind: "filter",
      filter: "lpf",
      cutoff: 600,
      q: 6,
      slope: 12,
    });
    expect(probeFromHaps({ kind: "envelope", track: "pad" }, haps, 0.5)).toMatchObject({
      attack: 0.4,
      release: 1,
    });
    expect(probeFromHaps({ kind: "harmonics", track: null }, haps, 0.5)).toMatchObject({ wave: "sawtooth" });
    expect(probeFromHaps({ kind: "filter", track: "pad" }, haps, 0.5)).toBeNull();
    expect(probeUnlocked("filter", new Set(["tb.lpf"]))).toBe(true);
    expect(probeUnlocked("envelope", new Set(["tb.lpf"]))).toBe(false);
  });
});

describe("the catalog's author mark never reaches a learner surface (wave 5 gate)", () => {
  test("toolLabel and toolName drop a trailing or inner †", async () => {
    const { toolLabel, toolName } = await import("./tool-label.ts");
    const t = { kind: "tool" as const, code: ".partials([…]) †" };
    expect(toolLabel(t).text).toBe(".partials([…])");
    expect(toolName(t).text).toBe(".partials([…])");
    expect(toolLabel({ kind: "tool", code: ".x() † (sig)" }).text).toBe(".x() (sig)");
  });
});
