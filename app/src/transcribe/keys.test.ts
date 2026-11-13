import { describe, expect, test } from "bun:test";
import { createKeymap, type KeyContext } from "../ui/keys/keymap.ts";
import { keyOf, TRANSCRIBE_KEYS, type TranscribeAction, transcribeBindings } from "./keys.ts";

const ctx = (over: Partial<KeyContext> = {}): KeyContext => ({
  chain: ["transcription", "global"],
  inEditable: false,
  onControl: false,
  focusRoute: false,
  isMac: false,
  macCtrl: false,
  ...over,
});
const ev = (key: string, mods: Partial<{ shiftKey: boolean; altKey: boolean }> = {}, code?: string) => ({
  key,
  code: code ?? "",
  metaKey: false,
  ctrlKey: false,
  altKey: mods.altKey ?? false,
  shiftKey: mods.shiftKey ?? false,
});

describe("Transcribe keys", () => {
  test("every transport key of ux §7.10 is bound, each once", () => {
    const keys = TRANSCRIBE_KEYS.map((k) => k.keys);
    for (const k of [
      "Space",
      "[",
      "]",
      "L",
      ",",
      ".",
      "-",
      "=",
      "V",
      "O",
      "T",
      "Alt+ArrowLeft",
      "Alt+ArrowRight",
    ])
      expect(keys).toContain(k);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keyOf("abToggle")).toBe("V");
  });

  test("keys dispatch in the transcription scope, not while typing, and Space leaves buttons alone", () => {
    const hits: TranscribeAction[] = [];
    const km = createKeymap();
    km.register(transcribeBindings((a) => hits.push(a)));
    km.handle(ev(" ", {}, "Space"), ctx());
    km.handle(ev("[", {}, "BracketLeft"), ctx());
    km.handle(ev(".", {}, "Period"), ctx());
    km.handle(ev("v", {}, "KeyV"), ctx());
    km.handle(ev("ArrowRight", { altKey: true }), ctx());
    km.handle(ev("_", { shiftKey: true }, "Minus"), ctx());
    expect(hits).toEqual(["play", "setA", "rateUp", "abToggle", "nextBar", "centsDown"]);
    km.handle(ev("v", {}, "KeyV"), ctx({ inEditable: true }));
    km.handle(ev("v", {}, "KeyV"), ctx({ chain: ["global"] }));
    km.handle(ev(" ", {}, "Space"), ctx({ onControl: true }));
    expect(hits).toHaveLength(6);
  });

  test("a disabled action passes through", () => {
    const hits: TranscribeAction[] = [];
    const km = createKeymap();
    km.register(
      transcribeBindings(
        (a) => hits.push(a),
        (a) => a !== "centsUp",
      ),
    );
    expect(km.handle(ev("+", { shiftKey: true }, "Equal"), ctx())).toBeNull();
    km.handle(ev("_", { shiftKey: true }, "Minus"), ctx());
    expect(hits).toEqual(["centsDown"]);
    hits.length = 0;
    expect(hits).toEqual([]);
  });
});
