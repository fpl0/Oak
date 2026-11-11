// Location roles and the HighlightBus against real evaluations: code ↔ roll ↔ staff through event IDs.
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { evaluateForGrading, initRealm } from "@oak/grader";
import { callOf, overlaps, primaryRanges } from "./code-roles.ts";
import { FULL_LOOP } from "./examples.ts";
import { HighlightBus, mergeRanges } from "./highlight-bus.ts";
import { buildModel, type WorkbenchModel } from "./model.ts";

setDefaultTimeout(30_000);

beforeAll(async () => {
  await initRealm({ toolbox: [], lockdown: false });
});

async function model(code: string, bars = 1): Promise<WorkbenchModel> {
  const result = await evaluateForGrading(code, { mode: "lesson", bars, lint: null });
  const out = buildModel(code, result, { meter: "4/4", key: { tonic: "C", mode: "major" }, staff: "auto" });
  if (!out.ok) throw new Error(out.error.message);
  return out.model;
}

describe("location roles", () => {
  test("callOf names the call whose string holds an offset", () => {
    const code = 'mel: note("c4 e4").s( "piano" ).scale(`C4:major`)';
    expect(callOf(code, code.indexOf("e4"))).toBe("note");
    expect(callOf(code, code.indexOf("piano"))).toBe("s");
    expect(callOf(code, code.indexOf("C4:"))).toBe("scale");
    expect(callOf(code, 0)).toBeNull();
    expect(callOf("setcpm(92/4)", 8)).toBeNull();
  });

  test("Strudel's own locations for note().s() hold both atoms, later-applied first; the primary is the note", async () => {
    const code = 'note("c4 e4").s("piano")';
    const result = await evaluateForGrading(code, { mode: "lesson", bars: 1, lint: null });
    if (!result.ok) throw new Error(result.error.message);
    const first = result.events[0];
    if (!first) throw new Error("no events");
    const texts = first.locations.map((l) => code.slice(l.start, l.end));
    expect(texts[0]).toBe("piano");
    expect(texts).toContain("c4");
    const ranges = first.locations.map((l) => ({ from: l.start, to: l.end }));
    expect(primaryRanges(code, ranges, true).map((r) => code.slice(r.from, r.to))).toEqual(["c4"]);
  });

  test("drums written with note().s(): the drum role prefers the sound atom", () => {
    const code = 'note("c2").s("bd")';
    const ranges = [
      { from: code.indexOf("bd"), to: code.indexOf("bd") + 2 },
      { from: code.indexOf("c2"), to: code.indexOf("c2") + 2 },
    ];
    expect(primaryRanges(code, ranges, false).map((r) => code.slice(r.from, r.to))).toEqual(["bd"]);
  });

  test("overlaps: a caret touching an atom counts", () => {
    expect(overlaps({ from: 5, to: 5 }, { from: 3, to: 5 })).toBe(true);
    expect(overlaps({ from: 6, to: 6 }, { from: 3, to: 5 })).toBe(false);
    expect(overlaps({ from: 0, to: 3 }, { from: 3, to: 5 })).toBe(false);
    expect(
      mergeRanges([
        { from: 5, to: 7 },
        { from: 1, to: 3 },
        { from: 3, to: 4 },
      ]),
    ).toEqual([
      { from: 1, to: 4 },
      { from: 5, to: 7 },
    ]);
  });
});

describe("HighlightBus", () => {
  let m: WorkbenchModel;
  let bus: HighlightBus;
  beforeAll(async () => {
    m = await model(FULL_LOOP, 4);
    bus = new HighlightBus();
    bus.setEvents(m.events, m.abc);
  });

  test("code → events: a caret on the 'sd' atom selects the snare hit of every bar", () => {
    const at = FULL_LOOP.indexOf("sd");
    bus.select({ code: [{ from: at, to: at }] }, "code");
    const sel = bus.get().selected;
    expect(sel.source).toBe("code");
    expect(sel.events.map((id) => m.byId.get(id)?.bar)).toEqual([1, 2, 3, 4]);
    expect(sel.events.every((id) => m.byId.get(id)?.s === "sd")).toBe(true);
  });

  test("code → events: a caret on the word triangle (no primary atom) falls back to all its notes", () => {
    const at = FULL_LOOP.lastIndexOf("triangle");
    const ids = bus.eventsAtCode({ from: at + 1, to: at + 1 });
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => m.byId.get(id)?.track === "mel")).toBe(true);
  });

  test("roll → code: an event's ranges are its primary atom", () => {
    const e = m.events.find((x) => x.track === "mel" && x.bar === 3 && x.beatLabel === "2");
    if (!e) throw new Error("missing event");
    expect(e.label?.name).toBe("E4"); // n 2 in C4 major
    bus.hover({ events: [e.id] }, "roll");
    const code = bus.get().hover.code;
    expect(code.map((r) => FULL_LOOP.slice(r.from, r.to))).toEqual(["2"]);
  });

  test("staff → events → code round trip through the ABC id map", () => {
    const e = m.events.find((x) => x.track === "mel" && x.bar === 1 && x.beatLabel === "2");
    if (!e) throw new Error("missing event");
    const ns = bus.staffNsOf([e.id]);
    expect(ns.length).toBe(1);
    const back = bus.eventsOfStaffNs(ns);
    expect(back).toContain(e.id);
    bus.select({ events: back }, "staff");
    // "[1 3 5 3]": beat 2 is the step 3
    expect(bus.get().selected.code.map((r) => FULL_LOOP.slice(r.from, r.to))).toEqual(["3"]);
  });

  test("playing set emits only on change", () => {
    let emits = 0;
    const off = bus.subscribe(() => emits++);
    const ids = m.events.slice(0, 2).map((e) => e.id);
    bus.setPlaying(ids);
    bus.setPlaying([...ids]);
    bus.setPlaying(ids.slice().reverse());
    expect(emits).toBe(1);
    bus.setPlaying([]);
    expect(emits).toBe(2);
    off();
  });

  test("re-indexing keeps a code selection and drops vanished event selections", async () => {
    const at = FULL_LOOP.indexOf("bd");
    bus.select({ code: [{ from: at, to: at + 2 }] }, "code");
    const m2 = await model('drums: s("bd*2")', 1);
    bus.setEvents(m2.events, m2.abc);
    // offsets now point into the new code: 'bd' sits elsewhere, so nothing (or the new bd) matches
    const sel = bus.get().selected;
    expect(sel.source).toBe("code");
    for (const id of sel.events) expect(bus.has(id)).toBe(true);
    // IDs are stable for the same music: the bar-1 kick survives, the melody note does not
    const kick = "drums|1|0/1|bd|0";
    const mel = m.events.find((e) => e.track === "mel")?.id ?? "";
    expect(m2.byId.has(kick)).toBe(true);
    bus.setEvents(m.events, m.abc);
    bus.select({ events: [kick, mel] }, "roll");
    bus.setEvents(m2.events, m2.abc);
    expect(bus.get().selected.events).toEqual([kick]);
  });
});
