// The track capstones' workspace logic, checked on a real song (Sweet Georgia Brown, whose answer key exists) with
// the real headless grader: JC4's reharmonisation draft keeps the song's melody (the rule that reads it passes), a
// reharmonisation with a backdoor and a tritone sub is named device by device with its bar, the melody line is
// the one range the editor locks, AC1's A/B is matched in loudness and keeps the place in the tune, and the sounds
// a session grants come from the toolbox's START rows.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { SongDef } from "@oak/content-kit";
import * as grader from "@oak/grader";
import sgb from "../../../content/repertoire/sweet-georgia-brown/song.ts";
import { toolbox } from "../../../content/toolbox.ts";
import { songMelodyOf } from "./song-melody.ts";
import { capstone, ensureRealm, gradePiece } from "./test-support.ts";
import {
  arrangeStarter,
  CAPSTONE_SONGS,
  changesPattern,
  deviceTally,
  lockedMelodyEditable,
  matchedGains,
  matchedText,
  melodySpan,
  melodyTouched,
  missingSessionLines,
  mixParts,
  originalChanges,
  partLabel,
  picksSong,
  reharmRows,
  reharmStarter,
  SESSION_LINES,
  samePlaceIn,
  sessionStartUnlocks,
  songOfDraft,
  songsOf,
  versionDraftIds,
  versionDrafts,
  versionOfSession,
  versionOpen,
  versionsOf,
  withSessionLines,
} from "./tracks.ts";

setDefaultTimeout(60_000);
const song = sgb as SongDef;
const analyze = async (code: string, o: grader.EvalOptions) => {
  await ensureRealm();
  return grader.evaluateForGrading(code, o);
};
const evalPiece = async (code: string) => {
  const ev = await analyze(code, {
    mode: "capstone",
    bars: song.answerKey.bars,
    lint: null,
    meter: song.meter,
  });
  if (!ev.ok) throw new Error(ev.error.message);
  return grader.normalize(ev, { meter: song.meter });
};
/** The reharmonisation: bars 11–12 C7 C7 become the backdoor B♭m7 E♭7, bar 31's C7 the tritone sub G♭7. */
function reharmed(code: string): string {
  const pattern = changesPattern(song);
  const tokens = pattern.slice(1, -1).match(/\[[^\]]*\]|\S+/g) as string[];
  tokens[10] = "Bbm7";
  tokens[11] = "Eb7";
  tokens[30] = "[G7 Gb7]";
  return code.replace(pattern, `<${tokens.join(" ")}>`);
}

describe("songs", () => {
  test("JC3 reads I Got Rhythm; JC4 and AC1 offer two songs each and the learner picks", () => {
    expect(songsOf(capstone("JC3"))).toEqual(CAPSTONE_SONGS.JC3 as never);
    expect(picksSong(capstone("JC3"))).toBe(false);
    expect(picksSong(capstone("JC4"))).toBe(true);
    expect(picksSong(capstone("AC1"))).toBe(true);
    expect(songOfDraft(capstone("JC4"), ["flavour.pop", "song.body-and-soul"])).toBe("song.body-and-soul");
    expect(songOfDraft(capstone("JC4"), ["flavour.pop"])).toBeNull();
    expect(songOfDraft(capstone("JC3"), [])).toBe("song.i-got-rhythm");
  });
  test("the original changes: one chord a bar, 32 bars, the turnaround's G7 in bar 31", () => {
    const ch = originalChanges(song);
    expect(ch).toHaveLength(32);
    expect(ch[0]).toBe("D7");
    expect(ch[30]).toBe("G7");
    expect(changesPattern(song)).toContain("[G7 C7]");
  });
});

describe("JC4: the reharmonisation draft", () => {
  test("the starter evaluates, keeps the song's melody (the rule passes) and has no device yet", async () => {
    const start = reharmStarter(song);
    const mel = await songMelodyOf(song, analyze);
    const r = await gradePiece("JC4", start, song.key, { songMelody: mel });
    expect(r.status).not.toBe("error");
    expect(r.rubric?.find((x) => x.ruleId === "melody")?.ok).toBe(true);
    expect(r.rubric?.find((x) => x.ruleId === "devices")?.ok).toBe(false);
    const view = grader.reharmView(await evalPiece(start), {
      meter: "4/4",
      bars: 32,
      reference: originalChanges(song),
      melody: mel,
    });
    if (grader.isNotBuilt(view)) return;
    expect(view.melodyKept).toBe(true);
    expect(deviceTally(view, 3)).toEqual({
      text: "No device yet; the brief asks for 3 different ones.",
      ok: false,
    });
  });
  test("a backdoor in bar 11 and a tritone sub in bar 31: each named with its bar, two of the three asked", async () => {
    const code = reharmed(reharmStarter(song));
    const mel = await songMelodyOf(song, analyze);
    const view = grader.reharmView(await evalPiece(code), {
      meter: "4/4",
      bars: 32,
      reference: originalChanges(song),
      melody: mel,
    });
    if (grader.isNotBuilt(view)) return;
    const rows = reharmRows(view);
    expect(rows.map((r) => r.text)).toEqual([
      "Bar 11: B♭m7, a backdoor (the song has C7 in this bar).",
      "Bar 31: G♭7, a tritone sub (the song has G7 in this bar).",
    ]);
    expect(deviceTally(view, 3)).toEqual({
      text: "2 different devices of 3: backdoor, tritone sub.",
      ok: false,
    });
    // The grader's own rule agrees: two of three, the melody kept.
    const r = await gradePiece("JC4", code, song.key, { songMelody: mel });
    expect(r.rubric?.find((x) => x.ruleId === "melody")?.ok).toBe(true);
    expect(r.rubric?.find((x) => x.ruleId === "devices")?.ok).toBe(false);
  });
  test("the melody line is the one locked range; a changed melody is noticed (and fails the rule)", async () => {
    const start = reharmStarter(song);
    const span = melodySpan(start);
    expect(span?.text.startsWith("mel: n(")).toBe(true);
    const lock = lockedMelodyEditable(start);
    expect(lock?.editable).toEqual([
      { from: 0, to: span?.from ?? -1 },
      { from: span?.to ?? -1, to: start.length },
    ]);
    expect(melodyTouched(start, song)).toBe(false);
    const changed = start.replace('mel: n("<[-2 -1@2', 'mel: n("<[-2 -2@2');
    expect(changed).not.toBe(start);
    expect(melodyTouched(changed, song)).toBe(true);
    const r = await gradePiece("JC4", changed, song.key, { songMelody: await songMelodyOf(song, analyze) });
    expect(r.rubric?.find((x) => x.ruleId === "melody")?.ok).toBe(false);
    expect(lockedMelodyEditable('chords: chord("<C>")')).toBeUndefined();
  });
});

describe("AC1: two versions", () => {
  const def = capstone("AC1");
  const versions = versionsOf(def);
  test("version one starts in session 1, version two in session 2; session 3 works on the one picked", () => {
    expect(versions.map((v) => [v.id, v.startsIn])).toEqual([
      ["a", "AC1.S1"],
      ["b", "AC1.S2"],
    ]);
    expect(versionOfSession(versions, "AC1.S1", null)).toBe("a");
    expect(versionOfSession(versions, "AC1.S2", "a")).toBe("b");
    expect(versionOfSession(versions, "AC1.S3", "b")).toBe("b");
    const idx = (sid: string) => def.sessionDefs.findIndex((s) => s.id === sid);
    expect(versionOpen(versions, "b", idx, 0)).toBe(false);
    expect(versionOpen(versions, "b", idx, 1)).toBe(true);
  });
  test("each version's draft: the server's, else the tagged sketch; an untagged older draft is version one", () => {
    const sk = (id: string, tags: string[], at: string) => ({
      id,
      originId: "AC1",
      tags,
      archived: false,
      updatedAt: at,
    });
    expect(
      versionDraftIds(null, [sk("s1", ["version:a"], "1"), sk("s2", ["version:b"], "2")], "AC1", null),
    ).toEqual({
      a: "s1",
      b: "s2",
    });
    expect(versionDraftIds(null, [sk("s2", ["version:b"], "2")], "AC1", "old")).toEqual({
      a: "old",
      b: "s2",
    });
    expect(versionsOf(capstone("JC1"))).toEqual([]);
    // A seeded AC1 keeps both versions in one sketch: each version is the draft its starting session saved.
    const sessions = {
      capstoneId: "AC1",
      current: "AC1.S3",
      sessions: [
        { capstoneSessionId: "AC1.S1", draft: { sketchId: "one", sketchVersion: 1, savedAt: "x" } },
        { capstoneSessionId: "AC1.S2", draft: { sketchId: "one", sketchVersion: 2, savedAt: "x" } },
      ],
    } as never;
    expect(versionDrafts(sessions, [], "AC1", "one", versions)).toEqual({
      a: { sketchId: "one", sketchVersion: 1 },
      b: { sketchId: "one", sketchVersion: 2 },
    });
  });
  test("the arrangement starter keeps the tune (the melody rule passes on it), for a learner past U15.L05", async () => {
    // Sweet Georgia Brown opens in AC1 once U15.L05 is done (its chromatic degrees unlock in U15.L01).
    const mel = await songMelodyOf(song, analyze);
    const r = await gradePiece("AC1", arrangeStarter(song), song.key, { songMelody: mel, at: "CF-A.S1" });
    expect(r.status).not.toBe("error");
    expect(r.rubric?.find((x) => x.ruleId === "melody")?.ok).toBe(true);
  });
  test("matched loudness turns the louder down to the quieter, never the quieter up", () => {
    const m = matchedGains(0.2, 0.1);
    expect(m.louder).toBe("a");
    expect(m.a).toBeCloseTo(0.5, 6);
    expect(m.b).toBe(1);
    expect(m.db).toBeCloseTo(6.02, 2);
    expect(matchedText(m, { a: "Version one", b: "Version two" })).toBe(
      "Matched in loudness: version one is turned down 6.0 dB while you compare.",
    );
    expect(matchedGains(0.1, 0.1).louder).toBeNull();
    expect(matchedGains(0, 0.1)).toEqual({ a: 1, b: 1, db: 0, louder: null });
  });
  test("a switch keeps the place in the tune: bar 8 at 120 BPM is bar 8 at 90 BPM", () => {
    // 4/4: cps = bpm / 240. Bar 8 at 0.5 cps is 16 s in; at 0.375 cps it is 21.33 s in.
    expect(samePlaceIn(16, 0.5, 0.375, 100)).toBeCloseTo(21.333, 2);
    expect(samePlaceIn(16, 0.5, 0.375, 10)).toBeCloseTo(9.95, 2);
  });
});

describe("sounds a session grants when it starts", () => {
  test("horns at RC1.S2 and choir at AC2.S1, from the toolbox's START rows", () => {
    expect(sessionStartUnlocks(toolbox, "RC1.S2").map((t) => t.id)).toContain("snd.horns");
    expect(sessionStartUnlocks(toolbox, "AC2.S1").map((t) => t.id)).toContain("snd.choir");
    expect(sessionStartUnlocks(toolbox, "RC1.S1").map((t) => t.id)).not.toContain("snd.horns");
  });
});

describe("AC2's mix, measured part by part", () => {
  test("the parts are the tracks the code writes (a masked one included), then the Band's parts", () => {
    const code =
      'setcpm(76/4)\n\nchords: note("<[d3,f#3,a3]>").s("rhodes")\n  .room(.2)\nhats: s("hh*8").gain(.4)\npad: note("a3").s("choir").gain(.004)\n_bass: note("d2")';
    const band = { tracks: ["bass"] as ("drums" | "bass" | "chords")[] };
    expect(mixParts(code, band)).toEqual(["chords", "hats", "pad", "band.bass"]);
    expect(mixParts(code, null)).toEqual(["chords", "hats", "pad"]);
    expect(partLabel("band.bass")).toBe("Band bass");
    expect(partLabel("chords")).toBe("chords");
  });
});

describe("the lines a session opens with", () => {
  test("RC1.S2 offers the horns line until the draft has one; RC2.S2 its three parts; S1 nothing", () => {
    const pocket = 'setcpm(100/4)\n\nkick: s("bd ~ ~ bd")\nbass: note("c2")';
    expect(missingSessionLines("RC1.S2", pocket)).toEqual(['horns: note("~").s("horns")']);
    expect(missingSessionLines("RC1.S2", `${pocket}\nhorns: note("[eb4,g4]").s("horns")`)).toEqual([]);
    expect(missingSessionLines("RC1.S1", pocket)).toEqual([]);
    expect(missingSessionLines("RC2.S2", 'perc: s("rim")\nkick: s("bd*2")')).toEqual([
      'perc2: s("~")',
      'perc3: s("~")',
    ]);
    // A head written under another usual name is a melody line already.
    expect(missingSessionLines("JC1.S2", 'chords: chord("<Dm7>").voicing()\nmelody: note("f5")')).toEqual([]);
  });
  test("withSessionLines adds the lines at the end; nothing to add leaves the code as it is", () => {
    expect(withSessionLines('kick: s("bd")\n\n', ['horns: note("~").s("horns")'])).toBe(
      'kick: s("bd")\nhorns: note("~").s("horns")\n',
    );
    expect(withSessionLines('kick: s("bd")', [])).toBe('kick: s("bd")');
  });
  test("every offered line evaluates and plays nothing", async () => {
    await ensureRealm();
    for (const lines of Object.values(SESSION_LINES))
      for (const { line } of lines) {
        const ev = await grader.evaluateForGrading(`setcpm(100/4)\n${line}`, {
          mode: "capstone",
          bars: 2,
          lint: null,
          meter: "4/4",
        });
        expect(ev.ok).toBe(true);
        if (ev.ok) expect(grader.normalize(ev, { meter: "4/4" }).all.length).toBe(0);
      }
  });
});
