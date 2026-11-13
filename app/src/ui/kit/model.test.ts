import { describe, expect, test } from "bun:test";
import {
  acceptsFile,
  bytesLabel,
  centsLabel,
  checklistSummary,
  clockLabel,
  decimalsOf,
  fileProblem,
  listKeyIndex,
  rateLabel,
  semitoneLabel,
  sliderFraction,
  sliderKeyValue,
  sliderPointerValue,
  snapValue,
  versionLabel,
} from "./model.ts";

describe("FineSlider keys", () => {
  const rate = { step: 0.05, fine: 0.01, coarse: 0.25 };
  const key = (k: string, mods: { shiftKey?: boolean; altKey?: boolean; metaKey?: boolean } = {}) => ({
    key: k,
    ...mods,
  });

  test("arrows move one step, without float noise", () => {
    expect(sliderKeyValue(key("ArrowRight"), 0.25, 0.25, 1, rate)).toBe(0.3);
    expect(sliderKeyValue(key("ArrowUp"), 0.7, 0.25, 1, rate)).toBe(0.75);
    expect(sliderKeyValue(key("ArrowLeft"), 0.75, 0.25, 1, rate)).toBe(0.7);
    expect(sliderKeyValue(key("ArrowDown"), 0.3, 0.25, 1, rate)).toBe(0.25);
  });

  test("Alt is the fine step, Shift and PageUp/PageDown the coarse step", () => {
    expect(sliderKeyValue(key("ArrowRight", { altKey: true }), 0.75, 0.25, 1, rate)).toBe(0.76);
    expect(sliderKeyValue(key("ArrowLeft", { altKey: true }), 0.75, 0.25, 1, rate)).toBe(0.74);
    expect(sliderKeyValue(key("ArrowRight", { shiftKey: true }), 0.5, 0.25, 1, rate)).toBe(0.75);
    expect(sliderKeyValue(key("PageDown"), 0.75, 0.25, 1, rate)).toBe(0.5);
    expect(sliderKeyValue(key("PageUp"), 0.9, 0.25, 1, rate)).toBe(1);
  });

  test("Home and End jump; the ends clamp", () => {
    expect(sliderKeyValue(key("Home"), 0.6, 0.25, 1, rate)).toBe(0.25);
    expect(sliderKeyValue(key("End"), 0.6, 0.25, 1, rate)).toBe(1);
    expect(sliderKeyValue(key("ArrowRight"), 1, 0.25, 1, rate)).toBe(1);
    expect(sliderKeyValue(key("ArrowLeft"), 0.25, 0.25, 1, rate)).toBe(0.25);
  });

  test("a centred range (cents) steps through zero", () => {
    const cents = { step: 5, fine: 1, coarse: 25 };
    expect(sliderKeyValue(key("ArrowRight"), -5, -50, 50, cents)).toBe(0);
    expect(sliderKeyValue(key("ArrowLeft", { altKey: true }), 0, -50, 50, cents)).toBe(-1);
    expect(sliderKeyValue(key("PageDown"), -40, -50, 50, cents)).toBe(-50);
  });

  test("other keys and Mod chords are not the slider's", () => {
    expect(sliderKeyValue(key("a"), 0.5, 0.25, 1, rate)).toBeNull();
    expect(sliderKeyValue(key("Enter"), 0.5, 0.25, 1, rate)).toBeNull();
    expect(sliderKeyValue(key("ArrowRight", { metaKey: true }), 0.5, 0.25, 1, rate)).toBeNull();
  });

  test("defaults: fine = step, coarse = 10 steps", () => {
    expect(sliderKeyValue(key("ArrowRight", { altKey: true }), 10, 0, 100, { step: 2 })).toBe(12);
    expect(sliderKeyValue(key("PageUp"), 10, 0, 100, { step: 2 })).toBe(30);
  });
});

describe("FineSlider pointer and geometry", () => {
  test("a pointer snaps to the step and clamps", () => {
    expect(sliderPointerValue(0.5, 0.25, 1, 0.05)).toBe(0.65);
    expect(sliderPointerValue(-1, 0.25, 1, 0.05)).toBe(0.25);
    expect(sliderPointerValue(2, 0.25, 1, 0.05)).toBe(1);
    expect(sliderPointerValue(0.51, -50, 50, 5)).toBe(0);
  });
  test("fraction along the track", () => {
    expect(sliderFraction(0, -50, 50)).toBe(0.5);
    expect(sliderFraction(1, 0.25, 1)).toBe(1);
    expect(sliderFraction(5, 5, 5)).toBe(0);
  });
  test("snap and decimals", () => {
    expect(decimalsOf(0.05)).toBe(2);
    expect(decimalsOf(1)).toBe(0);
    expect(decimalsOf(1e-7)).toBe(7);
    expect(snapValue(0.1 + 0.2, 0, 1, 0.1)).toBe(0.3);
    expect(snapValue(7, 0, 10, 0)).toBe(7);
  });
});

describe("FileDropZone checks", () => {
  const audio = ["audio/*", ".mp3", ".wav", ".flac", ".ogg", ".m4a"];
  test("accept rules: wildcards, exact types and extensions", () => {
    expect(acceptsFile({ name: "take.WAV", size: 10, type: "" }, audio)).toBe(true);
    expect(acceptsFile({ name: "song", size: 10, type: "audio/mpeg" }, audio)).toBe(true);
    expect(acceptsFile({ name: "notes.pdf", size: 10, type: "application/pdf" }, audio)).toBe(false);
    expect(acceptsFile({ name: "b.zip", size: 1, type: "application/zip" }, ["application/zip"])).toBe(true);
    expect(acceptsFile({ name: "x", size: 1, type: "" }, [])).toBe(true);
  });
  test("refusals say why", () => {
    const opts = { accept: audio, maxBytes: 300 * 1024 * 1024, kinds: "MP3, WAV, FLAC, OGG or M4A" };
    expect(fileProblem({ name: "a.pdf", size: 5, type: "application/pdf" }, opts)).toEqual({
      code: "type",
      message: "“a.pdf” is not a file Oak can open here: use MP3, WAV, FLAC, OGG or M4A.",
    });
    expect(fileProblem({ name: "big.wav", size: 400 * 1024 * 1024, type: "audio/wav" }, opts)?.message).toBe(
      "“big.wav” is 400 MB; the limit is 300 MB.",
    );
    expect(fileProblem({ name: "e.wav", size: 0, type: "audio/wav" }, opts)?.code).toBe("empty");
    expect(fileProblem({ name: "ok.wav", size: 5000, type: "audio/wav" }, opts)).toBeNull();
  });
  test("byte labels", () => {
    expect(bytesLabel(512)).toBe("512 B");
    expect(bytesLabel(1536)).toBe("1.5 KB");
    expect(bytesLabel(12 * 1024 * 1024)).toBe("12 MB");
    expect(bytesLabel(300 * 1024 * 1024)).toBe("300 MB");
  });
});

describe("checklist, versions, list keys", () => {
  test("the summary counts every line but optional ones", () => {
    expect(checklistSummary(["met", "unmet", "partial", "optional", "met"]).text).toBe("2 of 4 met");
    expect(checklistSummary([]).text).toBe("0 of 0 met");
  });
  test("version labels", () => {
    expect(versionLabel(3)).toBe("v3");
    expect(versionLabel(2, "  Bridge idea ")).toBe("v2 · Bridge idea");
    expect(versionLabel(1, "")).toBe("v1");
  });
  test("roving list keys", () => {
    expect(listKeyIndex("ArrowDown", 0, 3)).toBe(1);
    expect(listKeyIndex("ArrowDown", 2, 3)).toBe(2);
    expect(listKeyIndex("ArrowUp", 0, 3)).toBe(0);
    expect(listKeyIndex("End", 0, 3)).toBe(2);
    expect(listKeyIndex("Home", 2, 3)).toBe(0);
    expect(listKeyIndex("Enter", 1, 3)).toBeNull();
    expect(listKeyIndex("ArrowDown", 0, 0)).toBeNull();
  });
});

describe("transport readouts", () => {
  test("rate, semitones, cents, clock", () => {
    expect(rateLabel(0.75)).toBe("75 %");
    expect(rateLabel(1)).toBe("100 %");
    expect(semitoneLabel(0)).toBe("0 st");
    expect(semitoneLabel(2)).toBe("+2 st");
    expect(semitoneLabel(-3)).toBe("−3 st");
    expect(centsLabel(15)).toBe("+15¢");
    expect(centsLabel(-5)).toBe("−5¢");
    expect(centsLabel(0)).toBe("0¢");
    expect(clockLabel(83.4)).toBe("1:23");
    expect(clockLabel(3725)).toBe("1:02:05");
    expect(clockLabel(Number.NaN)).toBe("0:00");
  });
});
