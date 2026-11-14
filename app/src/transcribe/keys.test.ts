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

  test("song keys: digits loop phrase or line n, PageUp/PageDown step, C the chorus, Shift+B the bass alone", () => {
    const hits: string[] = [];
    const km = createKeymap();
    km.register(transcribeBindings((a, n) => hits.push(n === undefined ? a : `${a}:${n}`)));
    km.handle(ev("3", {}, "Digit3"), ctx());
    km.handle(ev("9", {}, "Digit9"), ctx());
    km.handle(ev("PageDown", {}, "PageDown"), ctx());
    km.handle(ev("PageUp", {}, "PageUp"), ctx());
    km.handle(ev("c", {}, "KeyC"), ctx());
    km.handle(ev("B", { shiftKey: true }, "KeyB"), ctx());
    km.handle(ev("M", { shiftKey: true }, "KeyM"), ctx());
    km.handle(ev("ArrowLeft", { shiftKey: true }, "ArrowLeft"), ctx());
    km.handle(ev("w", {}, "KeyW"), ctx());
    expect(hits).toEqual([
      "loopLine:3",
      "loopLine:9",
      "nextLine",
      "prevLine",
      "loopChorus",
      "listenBass",
      "listenNoMelody",
      "downbeatEarlier",
      "swing",
    ]);
    // A focused button keeps PageDown (and Space) for itself.
    km.handle(ev("PageDown", {}, "PageDown"), ctx({ onControl: true }));
    expect(hits).toHaveLength(9);
    // Wave 6: the form map. X cuts at the playing bar (the key the form answer cuts with), Shift+X goes to the strip.
    km.handle(ev("x", {}, "KeyX"), ctx());
    km.handle(ev("X", { shiftKey: true }, "KeyX"), ctx());
    expect(hits.slice(9)).toEqual(["formCut", "formFocus"]);
    km.handle(ev("x", {}, "KeyX"), ctx({ inEditable: true }));
    expect(hits).toHaveLength(11);
    // One row in the sheet stands for the nine digits.
    const grouped = transcribeBindings(() => {}).filter(
      (b) => b.id.startsWith("transcribe:loopLine") && b.group,
    );
    expect(grouped.map((b) => b.keys)).toEqual(["1"]);
  });
});
