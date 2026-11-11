import { describe, expect, test } from "bun:test";
import { codeTokens, fillStarter, starterParts, tokenAt, tokenOnLine } from "./code-tokens.ts";

describe("code-fill starters", () => {
  test("blanks split the clean starter; editable-region markers are dropped", () => {
    const starter = '⟪mel: n("⟦steps⟧").s("⟦sound⟧")⟫';
    expect(starterParts(starter)).toEqual([
      { kind: "text", text: 'mel: n("' },
      { kind: "blank", id: "steps" },
      { kind: "text", text: '").s("' },
      { kind: "blank", id: "sound" },
      { kind: "text", text: '")' },
    ]);
    expect(fillStarter(starter, { steps: "0 2 4", sound: "piano" })).toBe('mel: n("0 2 4").s("piano")');
    expect(fillStarter(starter, {})).toBe('mel: n("").s("")');
  });
});

describe("click-code tokens", () => {
  const code = 'setcpm(90/4)\n\nkick: s("bd ~ bd ~")\nsnare: s("~ sd*2 [~ sd]") // backbeat';
  const tokens = codeTokens(code);
  test("words, numbers and every mini-notation atom, with clean-code offsets", () => {
    expect(tokens.map((t) => t.text)).toEqual([
      "setcpm",
      "90",
      "/",
      "4",
      "kick",
      "s",
      "bd",
      "~",
      "bd",
      "~",
      "snare",
      "s",
      "~",
      "sd",
      "2",
      "~",
      "sd",
    ]);
    for (const t of tokens) expect(code.slice(t.from, t.to)).toBe(t.text);
    expect(tokens.find((t) => t.text === "sd")?.line).toBe(3);
    expect(tokens.filter((t) => t.kind === "atom").map((t) => t.text)).toEqual([
      "bd",
      "~",
      "bd",
      "~",
      "~",
      "sd",
      "2",
      "~",
      "sd",
    ]);
  });
  test("a range finds its token; up and down skip empty lines", () => {
    const sd = code.indexOf("sd");
    expect(tokens[tokenAt(tokens, { from: sd, to: sd + 2 })]?.text).toBe("sd");
    expect(tokens[tokenAt(tokens, { from: sd + 1, to: sd + 3 })]?.text).toBe("sd");
    expect(tokenAt(tokens, null)).toBe(-1);
    const down = tokenOnLine(tokens, code, 0, 1);
    expect(tokens[down]?.text).toBe("kick");
    expect(tokens[tokenOnLine(tokens, code, down, 1)]?.text).toBe("snare");
    expect(tokenOnLine(tokens, code, 0, -1)).toBe(0);
  });
});
