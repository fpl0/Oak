// The Wave 6 app seams (docs/design/wave6.md §4): the music lenses, how deep the chord and degree lenses write,
// the tab's own session (d21), and the query helpers.
import { afterEach, describe, expect, test } from "bun:test";
import type { Session } from "@oak/api";
import { type ChordId, parseChordSymbol } from "@oak/theory";
import { withTab } from "./api.ts";
import {
  chordLensText,
  degreeLensText,
  FULL_HARMONY_DEPTH,
  HARMONY_DEPTH_GATES,
  harmonyDepth,
} from "./harmony-lens.ts";
import { effectiveMusicLenses, MUSIC_LENS_UNLOCKS, musicLensAvailability, musicLensPrefs } from "./lenses.ts";
import { albumTakeUrl } from "./queries.ts";
import { otherOpenSessions, ownOpenSession, resetTabIdForTests, tabId } from "./tab-session.ts";

const base = { degrees: true, solfege: true, noteNames: false };
const C = { tonic: "C", mode: "major" } as const;
const ch = (s: string): ChordId => parseChordSymbol(s) as ChordId;

describe("music lenses", () => {
  test("absent preferences are on; each is gated by its unlock", () => {
    expect(musicLensPrefs(base)).toEqual({ guideTones: true, keyPlan: true, beatGrid: true });
    expect(musicLensAvailability(new Set())).toEqual({ guideTones: false, keyPlan: false, beatGrid: false });
    expect(musicLensAvailability(new Set(["chord.seventh", "tb.ply"]))).toEqual({
      guideTones: true,
      keyPlan: false,
      beatGrid: true,
    });
    // The beat grid opens with compound meter (U13.L04) or with triplets (U13.L05), whichever comes first.
    expect(musicLensAvailability(new Set(["tb.meter.compound"])).beatGrid).toBe(true);
    // Pushes (U13.L01) come first of all: the grid opens with .early() or .late() as well (integrate:surfaces).
    expect(musicLensAvailability(new Set(["tb.early"])).beatGrid).toBe(true);
    expect(musicLensAvailability(new Set(["tb.late"])).beatGrid).toBe(true);
    expect(
      effectiveMusicLenses(
        { ...base, keyPlan: false },
        new Set(["chord.seventh", "tb.scale.patterned", "tb.meter.compound"]),
      ),
    ).toEqual({ guideTones: true, keyPlan: false, beatGrid: true });
    expect(Object.keys(MUSIC_LENS_UNLOCKS)).toEqual(["guideTones", "keyPlan", "beatGrid"]);
  });
});

describe("how deep the chord lens writes", () => {
  const none = harmonyDepth(new Set(), new Set());
  test("gates: a tool row where the unlock table has one, else the lesson that teaches it", () => {
    expect(none).toEqual({ sevenths: false, applied: false, borrowed: false, chromatic: false });
    expect(harmonyDepth(new Set(["chord.dom7"]), new Set()).sevenths).toBe(true);
    expect(harmonyDepth(new Set(["chord.seventh"]), new Set()).sevenths).toBe(true);
    expect(harmonyDepth(new Set(), new Set(["U15.L02"])).applied).toBe(true);
    expect(harmonyDepth(new Set(), new Set(["U16.L01"])).borrowed).toBe(true);
    expect(harmonyDepth(new Set(["tb.n.chromatic"]), new Set()).chromatic).toBe(true);
    expect(HARMONY_DEPTH_GATES.applied.lesson).toBe("U15.L02");
  });
  const view = (symbol: string, rn: string, kind: "diatonic" | "applied" | "borrowed" | "other") => ({
    chord: ch(symbol),
    key: C,
    kind,
    rn,
    symbol: symbol.replace("^7", "maj7").replace("b", "♭"),
    seventh: null,
  });
  test("a seventh is written as its triad until sevenths are open, never renamed wrongly", () => {
    expect(chordLensText(view("G7", "V7", "diatonic"), none)).toEqual({
      symbol: "G",
      rn: "V",
      reduced: true,
    });
    expect(chordLensText(view("Dm7", "ii7", "diatonic"), none)).toEqual({
      symbol: "Dm",
      rn: "ii",
      reduced: true,
    });
    expect(chordLensText(view("G7", "V7", "diatonic"), FULL_HARMONY_DEPTH)).toEqual({
      symbol: "G7",
      rn: "V7",
      reduced: false,
    });
    expect(chordLensText(view("C", "I", "diatonic"), none).reduced).toBe(false);
  });
  test("an applied or borrowed chord keeps its symbol and has no numeral until its lesson", () => {
    const sevenths = { ...none, sevenths: true };
    expect(chordLensText(view("D7", "V7/V", "applied"), sevenths)).toEqual({
      symbol: "D7",
      rn: null,
      reduced: true,
    });
    expect(chordLensText(view("D7", "V7/V", "applied"), { ...sevenths, applied: true }).rn).toBe("V7/V");
    expect(chordLensText(view("Ab", "bVI", "borrowed"), sevenths)).toEqual({
      symbol: "A♭",
      rn: null,
      reduced: true,
    });
    expect(chordLensText(view("Ab", "bVI", "borrowed"), FULL_HARMONY_DEPTH).rn).toBe("bVI");
    // A chord the course never names has no numeral at any depth.
    expect(chordLensText(view("F#", "#IV", "other"), FULL_HARMONY_DEPTH)).toEqual({
      symbol: "F#",
      rn: null,
      reduced: false,
    });
  });
});

describe("the degree lens on chromatic notes", () => {
  test("before U15.L01: the degree alone, unless the syllable is already known (the blue notes)", () => {
    expect(degreeLensText(66, C, { chromatic: false })).toEqual({
      degree: "♯4",
      syllable: "",
      chromatic: true,
    });
    expect(degreeLensText(70, C, { chromatic: false })).toEqual({
      degree: "♭7",
      syllable: "te",
      chromatic: true,
    });
    expect(degreeLensText(64, C, { chromatic: false })).toEqual({
      degree: "3",
      syllable: "mi",
      chromatic: false,
    });
  });
  test("from U15.L01: chromatic syllables, named by the chord under the note", () => {
    const on = { chromatic: true };
    expect(degreeLensText(66, C, on)).toEqual({ degree: "♯4", syllable: "fi", chromatic: true });
    expect(degreeLensText(68, C, on, { chord: ch("E7") })).toEqual({
      degree: "♯5",
      syllable: "si",
      chromatic: true,
    });
    expect(degreeLensText(68, C, on, { chord: ch("Ab") })).toEqual({
      degree: "♭6",
      syllable: "le",
      chromatic: true,
    });
    expect(degreeLensText(61, C, on, { direction: 1 }).syllable).toBe("di");
    expect(degreeLensText(61, C, on, { direction: -1 }).syllable).toBe("ra");
  });
  test("a minor key keeps its own labels", () => {
    const Am = { tonic: "A", mode: "minor" } as const;
    expect(degreeLensText(60, Am, { chromatic: false })).toEqual({
      degree: "♭3",
      syllable: "me",
      chromatic: false,
    });
  });
  test("before U15.L01 a minor key's raised 6 and 7 keep la and ti (U10.L06, U10.L08)", () => {
    const Am = { tonic: "A", mode: "minor" } as const;
    expect(degreeLensText(68, Am, { chromatic: false })).toMatchObject({ degree: "7", syllable: "ti" });
    expect(degreeLensText(66, Am, { chromatic: false })).toMatchObject({ degree: "6", syllable: "la" });
    // A major key's chromatic notes are still the degree alone.
    expect(degreeLensText(66, C, { chromatic: false }).syllable).toBe("");
  });
});

describe("the tab's own session (d21)", () => {
  afterEach(() => resetTabIdForTests());
  const session = (id: string, tab: string | null): Session => ({
    id,
    day: "2026-11-13",
    kind: "lesson",
    targetMinutes: 20,
    mapItemId: "U12.L02",
    contentVersion: null,
    startedAt: "2026-11-13T10:00:00.000Z",
    endedAt: null,
    activeMinutes: 0,
    phase: "main",
    tabId: tab,
  });
  test("the id is stable for the tab and well formed", () => {
    const id = tabId();
    expect(id).toMatch(/^tab_[0-9a-f]{16}$/);
    expect(tabId()).toBe(id);
  });
  test("this tab's session is its own; another tab's is never joined", () => {
    const mine = session("s1", "tab_aaaaaaaaaaaaaaaa");
    const theirs = session("s2", "tab_bbbbbbbbbbbbbbbb");
    const day = { open: mine, openSessions: [theirs, mine] };
    expect(ownOpenSession(day, "tab_aaaaaaaaaaaaaaaa")?.id).toBe("s1");
    expect(ownOpenSession(day, "tab_cccccccccccccccc")).toBeNull();
    expect(otherOpenSessions(day, "tab_aaaaaaaaaaaaaaaa").map((s) => s.id)).toEqual(["s2"]);
    expect(ownOpenSession(null)).toBeNull();
  });
  test("an older server (no openSessions) keeps the one open session, as before", () => {
    const only = session("s1", null);
    expect(ownOpenSession({ open: only })?.id).toBe("s1");
    expect(otherOpenSessions({ open: only })).toEqual([]);
  });
  test("session.start and session.day carry the tab; other calls are untouched", () => {
    const id = tabId();
    expect(
      withTab("session.start", { body: { kind: "lesson", mapItemId: "U12.L02", targetMinutes: 20 } }),
    ).toEqual({
      body: { kind: "lesson", mapItemId: "U12.L02", targetMinutes: 20, tabId: id },
    });
    expect(withTab("session.start", { body: { kind: "gym", tabId: "tab_0000000000000000" } })).toEqual({
      body: { kind: "gym", tabId: "tab_0000000000000000" },
    });
    expect(withTab("session.day", undefined)).toEqual({ query: { tab: id } });
    expect(withTab("session.today", { query: { targetMinutes: "20" } })).toEqual({
      query: { targetMinutes: "20" },
    });
    expect(withTab("lessons.progress", undefined)).toBeUndefined();
  });
});

describe("query helpers", () => {
  test("a take's audio is the version's media URL with ?take=", () => {
    expect(albumTakeUrl("trk_1", 2)).toBe("/api/album/tracks/trk_1/versions/2/audio");
    expect(albumTakeUrl("trk_1", 2, 3)).toBe("/api/album/tracks/trk_1/versions/2/audio?take=3");
  });
});
