// Wave 6 capstone reading, checked against the real headless grader and Strudel: what C6's, C7's and CF-A's
// checklists say beyond met / not yet (the mode and its colour note, the applied chord and where it goes, the run
// ♭VI–♭VII–I, the key lift, the six devices with their bars, the bridge, the running length), the card of the
// learner's own devices, the Master step's words and liner line, C3's lead sheet in its third session of four
// (d13), and "a later session" rows.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { MasterReading } from "@oak/audio/master-meter";
import { CORE_DEVICES, type RubricRule } from "@oak/content-kit";
import { formView } from "@oak/grader";
import { checklistOf, readiness } from "./checklist.ts";
import {
  DEVICE_INFO,
  deviceBarsText,
  deviceCountText,
  deviceRows,
  deviceRowText,
  deviceSummary,
  notOnRecordText,
  recordRows,
  recordTracks,
} from "./devices.ts";
import {
  C6_NO_COLOUR,
  C6_SHORT,
  C6_VAMP,
  C7_FULL,
  C7_NO_LIFT,
  C7_NO_RUN,
  C7_UNRESOLVED,
  CF_A_NO_BRIDGE,
  CF_A_PLAN,
  CF_A_SHORT,
  CF_A_SINGLE,
} from "./e2e/w6-pieces.ts";
import { composeLiner } from "./liner.ts";
import {
  defaultReference,
  loudestSection,
  MASTER_STEPS,
  masterLinerLine,
  matchWords,
  meterFill,
  referenceVerdict,
  wholeDb,
} from "./master.ts";
import { sessionViews } from "./sessions.ts";
import { partPrefix, planFromSketch, readSketch } from "./sketch-plan.ts";
import { analysePiece, capstone, gradePiece } from "./test-support.ts";
import { pieceForm, rowExtras } from "./wave5.ts";
import {
  appliedFound,
  containsFound,
  liftFound,
  listBars,
  mergeExtras,
  modeFound,
  type PieceRead,
  prettyRn,
  runFound,
  runningLength,
  showsLeadSheet,
  wave6Extras,
} from "./wave6.ts";

setDefaultTimeout(120_000);

const C = { tonic: "C", mode: "major" } as const;
async function read(id: string, code: string, key: PieceRead["key"] = null) {
  const a = await analysePiece(id, code);
  const view = formView(a.n, { code, bars: a.bars });
  const piece: PieceRead = { n: a.n, code, meter: "4/4", key, bars: a.bars };
  return { ...a, piece, form: pieceForm(view, code, capstone(id).brief?.rubric ?? []) };
}
const ruleOf = (id: string, kind: RubricRule["rule"], n = 0): RubricRule => {
  const r = (capstone(id).brief?.rubric ?? []).filter((x) => x.rule === kind)[n];
  if (!r) throw new Error(`${id} has no ${kind} rule`);
  return r;
};

describe("words", () => {
  test("numerals print as the course prints them", () => {
    expect(prettyRn("bVII7")).toBe("♭VII7");
    expect(prettyRn("viio7/ii")).toBe("vii°7/ii");
    expect(prettyRn("V7/V")).toBe("V7/V");
  });
  test("a list of bars names at most four", () => {
    expect(listBars([3])).toBe("3");
    expect(listBars([5, 1, 3, 1])).toBe("1, 3 and 5");
    expect(listBars([1, 2, 4, 5, 6, 8])).toBe("1, 2, 4, 5 and 2 more");
    expect(listBars([1, 2, 3, 4, 5, 6, 7, 8])).toBe("1–8");
    expect(listBars([3, 4])).toBe("3 and 4");
  });
});

describe("C6: the mode and its colour note", () => {
  test("the vamp names its mode and the bars where ♭7 lands on a strong beat", async () => {
    const { piece } = await read("C6", C6_VAMP);
    const [tone, home] = modeFound(piece);
    expect(tone?.ok).toBe(true);
    expect(tone?.text).toMatch(/^G Mixolydian: its colour note ♭7 lands on a strong beat in bars 1, 2, /);
    expect(tone?.anchor).toEqual({ from: 1, to: 1 });
    expect(home).toMatchObject({ ok: true, text: "The home chord is in 50% of the bars." });
  });

  test("a vamp that never plays its colour note says so, and the grader fails `mode` for the same reason", async () => {
    const { piece } = await read("C6", C6_NO_COLOUR);
    const [tone] = modeFound(piece);
    expect(tone).toMatchObject({ ok: false, anchor: null });
    expect(tone?.text).toContain("its colour note ♭7 has not sounded yet");
    const r = await gradePiece("C6", C6_NO_COLOUR);
    expect(r.rubric?.find((x) => x.ruleId === ruleOf("C6", "mode").id)?.ok).toBe(false);
  });

  test("session 1's eight bars: the mode row is met with its bars, the length row is open", async () => {
    const { piece, form, analysis } = await read("C6", C6_SHORT);
    const brief = capstone("C6").brief?.rubric ?? [];
    const result = await gradePiece("C6", C6_SHORT);
    const rows = checklistOf(brief, result);
    expect(rows.find((r) => r.id === ruleOf("C6", "mode").id)?.state).toBe("met");
    expect(rows.find((r) => r.id === ruleOf("C6", "bars").id)?.state).toBe("open");
    const extras = wave6Extras(brief, result, { ...piece, form, analysis });
    const mode = extras[ruleOf("C6", "mode").id];
    expect(mode?.kind).toBe("found");
    if (mode?.kind === "found") expect(mode.items[0]?.text).toContain("bars 1, 2 and 4");
  });

  test("the passing vamp passes the brief", async () => {
    expect((await gradePiece("C6", C6_VAMP)).status).toBe("pass");
  });
});

describe("C7: the secondary dominant, the run and the lift", () => {
  test("a secondary dominant that resolves names itself, its bar and where it lands", async () => {
    const { piece } = await read("C7", C7_FULL, C);
    const found = appliedFound(piece);
    expect(found[0]).toEqual({
      text: "V7/ii (A7) in bar 2 resolves to ii (Dm) in bar 3.",
      anchor: { from: 2, to: 3 },
      ok: true,
    });
  });

  test("one that goes elsewhere says where it went and where it points", async () => {
    const { piece } = await read("C7", C7_UNRESOLVED, C);
    expect(appliedFound(piece)[0]).toEqual({
      text: "V7/ii (A7) in bar 2 goes to IV (F), not to ii.",
      anchor: { from: 2, to: 3 },
      ok: false,
    });
    const r = await gradePiece("C7", C7_UNRESOLVED);
    const rule = (capstone("C7").brief?.rubric ?? []).find(
      (x) => x.rule === "contains-rn" && x.kind?.includes("secondary-dominant"),
    );
    expect(rule && r.rubric?.find((x) => x.ruleId === rule.id)?.ok).toBe(false);
  });

  test("♭VI–♭VII–I is found with its bars; with ♭VII missing, the row says which chord is there", async () => {
    const full = await read("C7", C7_FULL, C);
    expect(runFound(["bVI", "bVII", "I"], full.piece)).toEqual([
      { text: "♭VI–♭VII–I in bars 15–16.", anchor: { from: 15, to: 16 }, ok: true },
    ]);
    const none = await read("C7", C7_NO_RUN, C);
    expect(runFound(["bVI", "bVII", "I"], none.piece)).toEqual([
      { text: "♭VI (A♭) in bar 15; ♭VII is not there yet.", anchor: { from: 15, to: 15 }, ok: false },
    ]);
  });

  test("the lift: from which key to which, at which bar, how far and for how long", async () => {
    const full = await read("C7", C7_FULL, C);
    expect(liftFound(full.piece)).toEqual([
      {
        text: "C major → D major at bar 25: up a whole step, 8 bars.",
        anchor: { from: 25, to: 32 },
        ok: true,
      },
    ]);
    const flat = await read("C7", C7_NO_LIFT, C);
    expect(liftFound(flat.piece)).toEqual([
      { text: "One key throughout: C major.", anchor: null, ok: false },
    ]);
  });

  test("the piece of the second session meets everything but the lift; the full one passes", async () => {
    const s2 = await gradePiece("C7", C7_NO_LIFT);
    const open = (s2.rubric ?? []).filter((r) => r.required && !r.ok).map((r) => r.ruleId);
    expect(open).toEqual([ruleOf("C7", "key-change").id]);
    expect((await gradePiece("C7", C7_FULL)).status).toBe("pass");
  });

  test("every C7 row has something to show, and Wave 5's lines stay where the parts disagree", async () => {
    const { piece, form, analysis } = await read("C7", C7_FULL, C);
    const brief = capstone("C7").brief?.rubric ?? [];
    const result = await gradePiece("C7", C7_FULL);
    const w6 = wave6Extras(brief, result, { ...piece, form, analysis });
    for (const r of brief.filter((x) => x.rule === "contains-rn" || x.rule === "key-change"))
      expect(w6[r.id]?.kind).toBe("found");
    const lift = ruleOf("C7", "key-change").id;
    expect(mergeExtras({ [lift]: { kind: "unread", text: "…" } }, w6)[lift]?.kind).toBe("unread");
    expect(
      mergeExtras({ [lift]: { kind: "section", text: "Read in the last chorus." } }, w6)[lift]?.kind,
    ).toBe("found");
    // A naming hint stays above the found lines.
    const merged = mergeExtras({ [lift]: { kind: "note", text: "Spell it out." } }, w6)[lift];
    expect(merged).toMatchObject({ kind: "found", note: "Spell it out." });
    expect(wave6Extras(brief, { ...result, status: "error" }, { ...piece, form, analysis })).toEqual({});
  });
});

describe("CF-A: the device counter", () => {
  test("the reference single: five of the six with their bars, the sixth still open", async () => {
    const { analysis } = await read("CF-A", CF_A_SINGLE);
    const rows = deviceRows(CORE_DEVICES, analysis.deviceList ?? []);
    expect(rows.map((r) => [r.device, r.bars[0] ?? null])).toEqual([
      ["secondary dominant", 11],
      ["borrowed chord", 33],
      ["modulation", 49],
      ["suspension", 4],
      ["syncopated bass", 1],
      ["modal colour", null],
    ]);
    expect(rows[2]?.span).toEqual({ from: 49, to: 56 });
    expect(deviceRowText(rows[0] as (typeof rows)[number])).toBe("In this song: bars 11, 27, 43 and 1 more");
    expect(deviceRowText(rows[5] as (typeof rows)[number])).toBe("Not yet");
    expect(deviceSummary(rows, 4)).toBe(
      "5 of 6: secondary dominant in bar 11, borrowed chord in bar 33, modulation in bar 49, suspension in bar 4, syncopated bass in bar 1.",
    );
    expect((await gradePiece("CF-A", CF_A_SINGLE)).status).toBe("pass");
  });

  test("the plan of session 1 has none: the count says how many are needed and names what is open", async () => {
    const { analysis } = await read("CF-A", CF_A_PLAN);
    const rows = deviceRows(CORE_DEVICES, analysis.deviceList ?? []);
    expect(rows.every((r) => r.bars.length === 0)).toBe(true);
    expect(deviceCountText(0, 6, 4)).toBe("0 of 6 · 4 needed");
    expect(deviceCountText(5, 6, 4)).toBe("5 of 6");
    expect(deviceSummary(rows, 4)).toBe(
      "0 of 6. No device yet. Still open: secondary dominant, borrowed chord, modulation, suspension, syncopated bass, modal colour.",
    );
  });

  test("bars read as a sentence", () => {
    expect(deviceBarsText([11])).toBe("bar 11");
    expect(deviceBarsText([11, 27])).toBe("bars 11 and 27");
    expect(deviceBarsText([4, 8, 20, 24])).toBe("bars 4, 8, 20 and 1 more");
  });

  test("every core device has its sentence, its lesson and its term", () => {
    for (const d of CORE_DEVICES) {
      const info = DEVICE_INFO[d];
      expect(info?.definition.length).toBeGreaterThan(40);
      expect(info?.taught).toMatch(/^U\d\d\.L\d\d$/);
      expect(info?.term).toMatch(/^term\./);
      expect(info?.definition).not.toContain("!");
    }
  });

  test("the checklist row: the count on the line and six rows under it", async () => {
    const { piece, form, analysis } = await read("CF-A", CF_A_SINGLE);
    const brief = capstone("CF-A").brief?.rubric ?? [];
    const result = await gradePiece("CF-A", CF_A_SINGLE);
    const x = wave6Extras(brief, result, { ...piece, form, analysis })[ruleOf("CF-A", "device-count").id];
    expect(x?.kind).toBe("devices");
    if (x?.kind === "devices") {
      expect(x.rows).toHaveLength(6);
      expect([x.found, x.need]).toEqual([5, 4]);
    }
  });
});

describe("CF-A: the bridge, the length, and what belongs to a later session", () => {
  test("the bridge is found with its bars; without one the row says how the form reads", async () => {
    const full = await read("CF-A", CF_A_SINGLE);
    expect(containsFound(["bridge"], full.form)).toEqual([
      { text: "Bridge: bars 33–40.", anchor: { from: 33, to: 40, label: "Bridge" }, ok: true },
    ]);
    const none = await read("CF-A", CF_A_NO_BRIDGE);
    const [line] = containsFound(["bridge"], none.form);
    expect(line?.ok).toBe(false);
    expect(line?.text).toContain("No bridge yet. The form reads: verse, chorus, verse, chorus, chorus");
    expect(containsFound(["bridge"], null)[0]?.text).toContain("`chordsBridge`");
  });

  test("the running length reads the plan against two minutes", async () => {
    const brief = capstone("CF-A").brief?.rubric ?? [];
    const full = await read("CF-A", CF_A_SINGLE);
    expect(runningLength(brief, { bars: full.bars, durationSec: full.analysis.durationSec })).toEqual({
      text: "56 bars · 2:14 of 2:00",
      ok: true,
    });
    const short = await read("CF-A", CF_A_SHORT);
    expect(runningLength(brief, { bars: short.bars, durationSec: short.analysis.durationSec })).toEqual({
      text: "48 bars · 1:55 of 2:00",
      ok: false,
    });
    expect(runningLength(capstone("C6").brief?.rubric ?? [], { bars: 16, durationSec: 38.4 })).toBeNull();
    // Wave 5's length row says how many bars are missing.
    const result = await gradePiece("CF-A", CF_A_SHORT);
    const x = rowExtras(brief, result, {
      bars: short.bars,
      bpm: 100,
      durationSec: short.analysis.durationSec,
      meter: "4/4",
      form: short.form,
    })[ruleOf("CF-A", "duration-sec").id];
    expect(x?.kind === "duration" && x.finding.moreBars).toBe(2);
  });

  test("a session that names its rules marks the open others as a later session's, except in the last", async () => {
    const brief = capstone("CF-A").brief?.rubric ?? [];
    const result = await gradePiece("CF-A", CF_A_PLAN);
    const devices = ruleOf("CF-A", "device-count").id;
    const bridge = ruleOf("CF-A", "form").id;
    const s1 = checklistOf(brief, result, {}, [bridge, ruleOf("CF-A", "duration-sec").id]);
    expect(s1.find((r) => r.id === devices)).toMatchObject({ state: "open", later: true, focus: false });
    expect(s1.find((r) => r.id === bridge)).toMatchObject({ state: "met", later: false, focus: true });
    const last = checklistOf(brief, result, {}, [bridge], true);
    expect(last.find((r) => r.id === devices)?.later).toBe(false);
    // No focus rules at all (C6, C7 today): nothing is "later".
    expect(checklistOf(brief, result).every((r) => !r.later)).toBe(true);
    expect(readiness(s1).ready).toBe(false);
  });
});

describe("Your devices so far", () => {
  const hit = (device: string, bar: number) => ({ device, bar });
  test("each device lists the learner's tracks in running order with two bars to play", () => {
    const rows = recordRows(CORE_DEVICES, [
      {
        trackId: "t7",
        title: "Chromatic Colour",
        no: 10,
        hits: [hit("secondary dominant", 9), hit("modulation", 25)],
      },
      {
        trackId: "t6",
        title: "Modal Vamp",
        no: 9,
        hits: [hit("modal colour", 1), hit("secondary dominant", 3)],
      },
    ]);
    expect(rows.map((r) => r.device)).toEqual([...CORE_DEVICES]);
    expect(rows[0]?.lines).toEqual([
      { trackId: "t6", title: "Modal Vamp", bar: 3, barsText: "bars 3–4" },
      { trackId: "t7", title: "Chromatic Colour", bar: 9, barsText: "bars 9–10" },
    ]);
    const suspension = rows.find((r) => r.device === "suspension");
    expect(suspension?.lines).toEqual([]);
    expect(notOnRecordText(suspension as NonNullable<typeof suspension>)).toBe(
      "Not on your record yet. Taught in U07.L05.",
    );
  });

  test("the card reads Side A only, in running order, without the capstone being written", () => {
    const t = (id: string, capstoneId: string | null, side: "A" | "B" | "Bside" = "A") => ({
      id,
      capstoneId: capstoneId as never,
      sketchId: null,
      side,
      trackNo: 1,
      title: id,
      flavour: null,
      currentVersion: 1,
      coverSeed: id,
      createdAt: "2026-11-01T10:00:00.000Z",
    });
    const list = recordTracks(
      [t("single", "CF-A"), t("c7", "C7"), t("bside", null, "Bside"), t("cft", "CF-T"), t("c0", "C0")],
      "CF-A",
    );
    expect(list.map((x) => [x.id, x.no])).toEqual([
      ["c0", 1],
      ["c7", 10],
      ["cft", 11],
    ]);
  });
});

describe("the Master step", () => {
  const reading = (o: Partial<MasterReading["limiter"]> & { peakDb?: number; levelDb?: number }) =>
    ({
      peakDb: o.peakDb ?? -4.3,
      levelDb: o.levelDb ?? -16,
      limiter: {
        state: o.state ?? "resting",
        maxReductionDb: o.maxReductionDb ?? 0,
        workingShare: o.workingShare ?? 0,
        firstAtSec: null,
      },
    }) as Pick<MasterReading, "peakDb" | "levelDb" | "limiter">;

  test("four steps, one measured, none with an exclamation mark", () => {
    expect(MASTER_STEPS.map((s) => s.id)).toEqual(["levels", "limiter", "room", "reference"]);
    expect(MASTER_STEPS.filter((s) => s.measured).map((s) => s.id)).toEqual(["limiter"]);
    for (const s of MASTER_STEPS) expect(s.text).not.toContain("!");
  });

  test("the loudest section: the last chorus among those about as loud, else the last of the loudest", () => {
    const s = (text: string, label: string, startBar: number, energy: number) => ({
      text,
      label,
      startBar,
      bars: 8,
      energy,
    });
    const song = [
      s("Verse", "verse", 0, 0.82),
      s("Chorus", "chorus", 8, 0.8),
      s("Bridge", "bridge", 16, 0.5),
      s("Chorus 2", "chorus", 24, 0.78),
    ];
    // The verse is a touch busier, but the last chorus is about as loud: it is the one to loop.
    expect(loudestSection(song)?.text).toBe("Chorus 2");
    // A song whose bridge is clearly the loudest loops the bridge.
    expect(loudestSection([s("Chorus", "chorus", 0, 0.4), s("Bridge", "bridge", 8, 0.9)])?.text).toBe(
      "Bridge",
    );
    expect(loudestSection([s("A", "a", 0, 0.6), s("B", "b", 8, 0.6)])?.text).toBe("B");
    expect(loudestSection([])).toBeNull();
  });

  test("the reference starts on Chromatic Colour, else on the newest recording", () => {
    const t = (trackId: string, capstoneId: string, createdAt: string) => ({
      trackId,
      capstoneId,
      title: trackId,
      version: 1,
      createdAt,
    });
    const c5 = t("c5", "C5", "2026-09-01T10:00:00.000Z");
    const c6 = t("c6", "C6", "2026-10-20T10:00:00.000Z");
    expect(defaultReference([c5, t("c7", "C7", "2026-10-01T10:00:00.000Z"), c6])?.trackId).toBe("c7");
    expect(defaultReference([c5, c6])?.trackId).toBe("c6");
    expect(defaultReference([])).toBeNull();
  });

  test("the liner line says what was done, plainly", () => {
    expect(masterLinerLine({ reference: "Chromatic Colour", reading: reading({}) })).toBe(
      "Mastered against Chromatic Colour. Loudest moment −4 dB; the limiter rested.",
    );
    expect(
      masterLinerLine({ reference: null, reading: reading({ state: "working", workingShare: 0.4 }) }),
    ).toBe("Loudest moment −4 dB; the limiter worked through the loudest section.");
    expect(masterLinerLine({ reference: "Modal Vamp", reading: null })).toBe("Mastered against Modal Vamp.");
    expect(masterLinerLine({ reference: null, reading: null })).toBeNull();
    // Silence measured is nothing measured.
    expect(
      masterLinerLine({ reference: null, reading: reading({ levelDb: Number.NEGATIVE_INFINITY }) }),
    ).toBeNull();
    expect(wholeDb(-3.6)).toBe("−4 dB");
    expect(wholeDb(0.2)).toBe("0 dB");
  });

  test("the liner notes keep the master line whatever is shortened", () => {
    const notes = composeLiner({
      learnerLine: "A song about the long way round, written over a week of evenings at the kitchen table.",
      bars: 56,
      bpm: 100,
      key: C,
      meter: "4/4",
      theory: ["V7/vi→vi bar 11", "iv borrowed bar 33", "modulation to D major bar 49", "suspension bar 4"],
      previewTools: [],
      revealed: [],
      extra: "Mastered against Chromatic Colour. Loudest moment −4 dB; the limiter rested.",
    });
    expect(notes).toContain("Mastered against Chromatic Colour. Loudest moment −4 dB; the limiter rested.");
    expect(notes).toContain("56 bars of 4/4 at 100 BPM in C major.");
  });

  test("the reference listen says which side moved and what is left", () => {
    expect(referenceVerdict({ offsetDb: 0.6 }, "Chromatic Colour")).toBe(
      "Your single is about as loud as Chromatic Colour.",
    );
    expect(referenceVerdict({ offsetDb: -4.2 }, "Modal Vamp")).toBe(
      "Your single is 4 dB quieter than Modal Vamp.",
    );
    expect(matchWords({ referenceDb: -4.2, matched: true, residualDb: 0 })).toBe(
      "The reference is turned down 4.2 dB so both arrive at the same level.",
    );
    expect(matchWords({ referenceDb: 0, matched: true, residualDb: 0 })).toBe(
      "Both play as they are: they are already at the same level.",
    );
    expect(matchWords({ referenceDb: 2, matched: false, residualDb: 3.1 })).toContain(
      "3.1 dB of the difference is left",
    );
  });

  test("the meter bar runs from −48 dB to full scale", () => {
    expect(meterFill(-48)).toBe(0);
    expect(meterFill(0)).toBe(1);
    expect(meterFill(-24)).toBe(0.5);
    expect(meterFill(Number.NEGATIVE_INFINITY)).toBe(0);
    expect(meterFill(3)).toBe(1);
  });
});

describe("d13: C3 in four sessions", () => {
  const c3 = capstone("C3");
  test("the registry has four sessions; only the fourth reviews and releases", () => {
    expect(c3.sessionDefs.map((s) => s.id)).toEqual(["C3.S1", "C3.S2", "C3.S3", "C3.S4"]);
    const views = sessionViews(
      c3,
      { sessions: ["C3.S1", "C3.S2"], sketchId: "sk", status: "in_progress" },
      null,
    );
    expect(views.map((v) => v.status)).toEqual(["done", "done", "in_progress", "locked"]);
    expect(views.map((v) => v.release)).toEqual([false, false, false, true]);
    expect(views.map((v) => v.review)).toEqual([false, false, false, true]);
  });

  test("the lead sheet shows from session 3 (arranging), not before, and stays for the take", () => {
    const rules = c3.brief?.rubric ?? [];
    expect(showsLeadSheet(rules, c3.sessionDefs, 0, false)).toBe(false);
    expect(showsLeadSheet(rules, c3.sessionDefs, 1, false)).toBe(false);
    expect(showsLeadSheet(rules, c3.sessionDefs, 2, false)).toBe(true);
    expect(showsLeadSheet(rules, c3.sessionDefs, 3, true)).toBe(true);
    // A brief with no lead sheet never shows one.
    expect(showsLeadSheet(capstone("C6").brief?.rubric ?? [], capstone("C6").sessionDefs, 1, true)).toBe(
      false,
    );
  });

  test("a learner part-way through the old third session keeps everything: S3 is current, S4 follows", () => {
    // The server's view of the d13 seed: S1–S2 done, S3 in progress with its draft, S4 locked behind it.
    const server = {
      capstoneId: "C3",
      current: "C3.S3",
      sessions: c3.sessionDefs.map((sd, i) => ({
        capstoneSessionId: sd.id,
        status: i < 2 ? "done" : i === 2 ? "in_progress" : "locked",
        draft: i <= 2 ? { sketchId: "sk", version: i + 2 } : null,
        checks: [],
        completedAt: null,
      })),
    } as never;
    const views = sessionViews(
      c3,
      { sessions: ["C3.S1", "C3.S2"], sketchId: "sk", status: "in_progress" },
      server,
    );
    expect(views[2]).toMatchObject({
      status: "in_progress",
      release: false,
      draft: { sketchId: "sk", version: 4 },
    });
    expect(views[3]).toMatchObject({ status: "locked", release: true });
  });
});

describe("CF-A.S1: the single grown from a sketch", () => {
  test("the sketch's parts become verse consts; the tempo, the key and the other consts stay", () => {
    const sketch = `setcpm(92/4)

const changes = "<Dm7 G7>"

// a Dorian groove
chords: chord(changes).voicing()
  .s("rhodes")
bass: n("<0 3>").scale("D2:dorian").s("fingerbass")
_old: s("cp*4")
leadGtr: n("<[5 4 2 4] [0 ~ ~ ~]>").scale("D4:dorian").s("cleangtr")`;
    const read = readSketch(sketch);
    expect(read.tempo).toBe("setcpm(92/4)");
    expect(read.parts.map((p) => p.label)).toEqual(["chords", "bass", "leadGtr"]);
    expect(read.parts[0]?.expr).toBe('chord(changes).voicing()\n  .s("rhodes")');
    expect(read.preamble).toEqual(['const changes = "<Dm7 G7>"', "// a Dorian groove"]);
    const plan = planFromSketch(sketch);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.bars).toBe(48);
    expect(plan.code.startsWith("setcpm(92/4)\n")).toBe(true);
    expect(plan.code).toContain("const leadgtrVerse = n(");
    expect(plan.code).toContain("const leadgtrBridge = leadgtrVerse");
    expect(plan.code).toContain(
      "bass: arrange([8, bassVerse], [8, bassChorus], [8, bassVerse], [8, bassChorus], [8, bassBridge], [8, bassChorus])",
    );
    expect(plan.code).not.toContain("_old");
    expect(partPrefix("lead_2")).toBe("lead2");
  });

  test("the grown draft evaluates, reads verse chorus verse chorus bridge chorus and already has its bridge", async () => {
    const plan = planFromSketch(C6_SHORT);
    if (!plan.ok) throw new Error(plan.problem);
    const { form, bars } = await read("CF-A", plan.code);
    expect(bars).toBe(48);
    expect(form.problem).toBeNull();
    expect(form.sections.map((s) => s.label)).toEqual([
      "verse",
      "chorus",
      "verse",
      "chorus",
      "bridge",
      "chorus",
    ]);
    const result = await gradePiece("CF-A", plan.code);
    expect(result.status).not.toBe("error");
    expect(result.rubric?.find((r) => r.ruleId === ruleOf("CF-A", "form").id)?.ok).toBe(true);
  });

  test("a sketch with no labelled part, or one already in sections, says why it cannot be the verse", () => {
    const none = planFromSketch('setcpm(100/4)\n\nconst kick = s("bd*4")');
    expect(none).toMatchObject({ ok: false });
    expect(!none.ok && none.problem).toContain("no labelled part");
    // Anonymous lines become parts with a name of their own.
    const anon = planFromSketch('setcpm(100/4)\n\n$: s("bd*4")\n$: s("hh*8")');
    expect(anon.ok && anon.code).toContain("part: arrange([8, partVerse]");
    expect(anon.ok && anon.code).toContain('const partbVerse = s("hh*8")');
    expect(anon.ok && anon.code).toContain("partb: arrange([8, partbVerse]");
    const arranged = planFromSketch(C7_FULL);
    expect(!arranged.ok && arranged.problem).toContain("already arranged");
  });
});

describe("the device rows agree with the finale's content (integrate:surfaces)", () => {
  test("every CF-A device has a row here, opened by the same lesson the content names", async () => {
    const { CF_A_DEVICES } = await import("../../../content/capstones.ts");
    const { DEVICE_INFO } = await import("./devices.ts");
    for (const d of CF_A_DEVICES) {
      const info = DEVICE_INFO[d.device];
      expect(info, d.device).toBeDefined();
      expect(info?.taught, d.device).toBe(d.met);
      expect(info?.definition.length, d.device).toBeGreaterThan(20);
    }
  });
});
