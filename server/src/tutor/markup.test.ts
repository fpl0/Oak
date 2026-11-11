import { describe, expect, test } from "bun:test";
import {
  countWords,
  HtmlGuard,
  parseMarkup,
  rewriteLinks,
  type Segment,
  sanitizeMarkdown,
  termUsage,
} from "./markup.ts";

const tokens = (text: string, opts = {}) =>
  parseMarkup(text, opts).filter((s) => s.type === "token" || s.type === "reveal");
const one = (text: string, opts = {}): Segment | undefined => tokens(text, opts)[0];

describe("tokens", () => {
  test("the grammar of contracts §10.7", () => {
    expect(one("[[deg:5]]")).toEqual({ type: "token", kind: "deg", value: "5", raw: "[[deg:5]]" });
    expect(one("[[deg:b3]]")).toMatchObject({ kind: "deg", value: "b3" });
    expect(one("[[deg:#4]]")).toMatchObject({ kind: "deg", value: "#4" });
    expect(one("[[rn:V7]]")).toMatchObject({ kind: "rn", value: "V7" });
    expect(one("[[rn:V7/vi]]")).toMatchObject({ kind: "rn", value: "V7/vi" });
    expect(one("[[rn:bVII]]")).toMatchObject({ kind: "rn", value: "bVII" });
    expect(one("[[rn:vii°]]")).toMatchObject({ kind: "rn", value: "vii°" });
    expect(one("[[note:F#4]]")).toMatchObject({ kind: "note", value: "F#4" });
    expect(one("[[note:c4]]")).toMatchObject({ kind: "note", value: "C4" });
    expect(one("[[chord:Am7]]")).toMatchObject({ kind: "chord", value: "Am7", display: "Am7" });
    expect(one("[[chord:C^7]]")).toMatchObject({ kind: "chord", display: "Cmaj7" });
    expect(one("[[chord:Bbm7b5]]")).toMatchObject({ kind: "chord", display: "B♭m7♭5" });
    expect(one("[[chord:F#o7]]")).toMatchObject({ kind: "chord", display: "F♯°7" });
    expect(one("[[bars:3-4]]")).toMatchObject({ kind: "bars", bars: [3, 4] });
    expect(one("[[bars:3]]")).toMatchObject({ kind: "bars", bars: [3, 3] });
    expect(one("[[tool:tb.voicing]]")).toMatchObject({ kind: "tool", value: "tb.voicing" });
    expect(one("[[term:cadence]]")).toMatchObject({ kind: "term", value: "term.cadence" });
    expect(one("[[term:term.cadence]]")).toMatchObject({ kind: "term", value: "term.cadence" });
  });

  test.each([
    "[[deg:8]]",
    "[[deg:0]]",
    "[[deg:bb3]]",
    "[[rn:VIII]]",
    "[[rn:H7]]",
    "[[note:H4]]",
    "[[note:F#]]",
    "[[chord:Cmaj7]]",
    "[[chord:c]]",
    "[[bars:0]]",
    "[[bars:4-3]]",
    "[[bars:a-b]]",
    "[[tool:voicing]]",
    "[[term:Cadence!]]",
    "[[unknown:x]]",
    "[[deg: 5]]",
    "[[deg:5]",
    "[[reveal:now]]",
    "[[]]",
  ])("malformed or unknown %p stays plain text", (text) => {
    expect(parseMarkup(`a ${text} b`)).toEqual([{ type: "text", md: `a ${text} b` }]);
  });

  test("text around tokens is kept in order", () => {
    expect(parseMarkup("Bar [[bars:3]]: your bass is on [[deg:6]].")).toEqual([
      { type: "text", md: "Bar " },
      { type: "token", kind: "bars", value: "3", raw: "[[bars:3]]", bars: [3, 3] },
      { type: "text", md: ": your bass is on " },
      { type: "token", kind: "deg", value: "6", raw: "[[deg:6]]" },
      { type: "text", md: "." },
    ]);
  });

  test("[[reveal]] is a button only where the turn allows it, and only once", () => {
    expect(parseMarkup("Take hint 4? [[reveal]]")).toEqual([{ type: "text", md: "Take hint 4? [[reveal]]" }]);
    const segs = parseMarkup("Take hint 4? [[reveal]] or [[reveal]]", { revealAllowed: true });
    expect(segs.filter((s) => s.type === "reveal")).toHaveLength(1);
    expect(segs.at(-1)).toEqual({ type: "text", md: " or [[reveal]]" });
  });

  test("terms outside the introduced list are previews; locked tools are marked", () => {
    const introducedTerms = new Set(["term.octave"]);
    expect(one("[[term:octave]]", { introducedTerms })).toMatchObject({ preview: false });
    expect(one("[[term:cadence]]", { introducedTerms })).toMatchObject({ preview: true });
    expect(one("[[term:cadence]]")).not.toHaveProperty("preview");
    const unlockedTools = new Set(["tb.scale"]);
    expect(one("[[tool:tb.scale]]", { unlockedTools })).toMatchObject({ locked: false });
    expect(one("[[tool:tb.voicing]]", { unlockedTools })).toMatchObject({ locked: true });
  });

  test("termUsage: the introduced-terms rule of §10.8", () => {
    const introduced = new Set(["term.octave", "term.scale-degree"]);
    const u = termUsage(
      "The [[term:octave]] is where a [[term:cadence]] lands. A [[term:cadence]] closes.",
      introduced,
    );
    expect(u).toEqual({
      introduced: ["term.octave"],
      preview: ["term.cadence"],
      repeatedPreview: ["term.cadence"],
    });
    expect(termUsage("Count up to the [[term:octave]].", introduced).preview).toEqual([]);
  });

  test("tokens inside code are code, not tokens", () => {
    expect(parseMarkup("`[[deg:5]]`")).toEqual([{ type: "code_inline", code: "[[deg:5]]" }]);
  });
});

describe("code", () => {
  test("a fenced block is plain, non-playable text", () => {
    const segs = parseMarkup(
      'Try this:\n```strudel\nmel: n("<0 2 4>")\n  .scale("C4:major")\n```\nThen listen.',
    );
    expect(segs).toEqual([
      { type: "text", md: "Try this:\n" },
      {
        type: "code_block",
        lang: "strudel",
        code: 'mel: n("<0 2 4>")\n  .scale("C4:major")',
        playable: false,
      },
      { type: "text", md: "Then listen." },
    ]);
  });

  test("inline code keeps mini-notation angle brackets", () => {
    expect(parseMarkup('Use `note("<c3 e3>")` here.')).toEqual([
      { type: "text", md: "Use " },
      { type: "code_inline", code: 'note("<c3 e3>")' },
      { type: "text", md: " here." },
    ]);
  });

  test("an unclosed fence runs to the end; tilde fences and longer closers work", () => {
    expect(parseMarkup("```\n<b>x")).toEqual([
      { type: "code_block", lang: null, code: "<b>x", playable: false },
    ]);
    expect(parseMarkup("~~~js\na\n~~~~\nb")).toEqual([
      { type: "code_block", lang: "js", code: "a", playable: false },
      { type: "text", md: "b" },
    ]);
  });
});

describe("no raw HTML", () => {
  const TAG = /<[A-Za-z/!?]/;
  const hostile = [
    "<script>alert(1)</script>",
    "hello <img src=x onerror=alert(1)> world",
    "<iframe src='//evil.example'></iframe>",
    "<!-- comment --><b>bold</b>",
    "<?php x ?> and <!DOCTYPE html>",
    "line\n<div>\nblock\n</div>",
    "<a href='javascript:alert(1)'>x</a>",
    "an autolink <https://evil.example> here",
    "`unclosed <script>alert(1)</script>",
    "`a\n<script>alert(1)</script> `",
    "# title `x\n<script>alert(1)</script> `",
    "\\`<script>alert(1)</script>\\`",
    "| `a | <b>` |",
    "1. item\n   ```\n   code\n<script>alert(1)</script>",
    "> ```\n> code\n<script>alert(1)</script>",
    "```\rcode\r```\r<script>alert(1)</script>",
    "```js <script>\nx\n```\n<script>",
    "``` `<script>`\n<script>",
    "x<scr\0ipt>",
  ];

  test.each(hostile)("escapes every tag in %p", (text) => {
    const safe = sanitizeMarkdown(text);
    const prose = parseMarkup(text)
      .filter((s) => s.type === "text")
      .map((s) => (s as { md: string }).md)
      .join("");
    expect(prose).not.toMatch(TAG);
    // Outside of what is certainly code, the sanitized string has no tag either.
    const outsideCode = safe.replace(/^```[\s\S]*?(^```\s*$|$(?![\s\S]))/gm, "").replace(/`[^`\n|]*`/g, "");
    expect(outsideCode).not.toMatch(TAG);
  });

  test("harmless angle brackets survive", () => {
    expect(sanitizeMarkdown("3 < 4 and a <- b, 5 <= 6 <")).toBe("3 < 4 and a <- b, 5 <= 6 <");
  });

  test("sanitizing is idempotent", () => {
    for (const text of hostile) expect(sanitizeMarkdown(sanitizeMarkdown(text))).toBe(sanitizeMarkdown(text));
  });

  test("no images, and links only into the app", () => {
    expect(rewriteLinks("![a chart](https://evil.example/pixel.png)")).toBe("a chart");
    expect(rewriteLinks("[click](https://evil.example)")).toBe("click");
    expect(rewriteLinks("[click](javascript:alert(1))")).toBe("click)");
    expect(rewriteLinks("[x](//evil.example)")).toBe("x");
    expect(rewriteLinks("[x](/\\evil.example)")).toBe("x");
    expect(rewriteLinks("[[x]](https://evil.example)")).toBe("[x]");
    expect(rewriteLinks("[the toolbox](/toolbox/tb.voicing)")).toBe("[the toolbox](/toolbox/tb.voicing)");
    expect(rewriteLinks('[t](/oak?view=tree "title")')).toBe('[t](/oak?view=tree "title")');
    expect(rewriteLinks("see [ref]\n\n[ref]: https://evil.example\n")).toBe("see [ref]\n\n\n");
  });

  test("links that CommonMark accepts in less obvious spellings do not survive either", () => {
    // Whitespace or a line break before the destination, other title quotes, an angle-bracket destination.
    for (const md of [
      "[x]( https://evil.example/a)",
      "[x](\nhttps://evil.example/a)",
      "[x](https://evil.example/a 'title')",
      "[x](https://evil.example/a (title))",
      "[x](<https://evil.example/a b>)",
      "[x](<javascript:alert(1)>)",
      "![x]( https://evil.example/p.png )",
    ]) {
      const out = sanitizeMarkdown(md);
      expect(out).not.toContain("](");
      expect(sanitizeMarkdown(out)).toBe(out);
    }
    expect(sanitizeMarkdown('[ok]( /learn/U03.L02 "t" )')).toBe('[ok]( /learn/U03.L02 "t" )');
    // A reference definition that the line-based rule misses (quoted, or with its URL on the next
    // line) is defused: `]\:` renders as `]:` and defines nothing.
    for (const md of ["> [r]: https://evil.example\n\n[go][r]", "[r]:\nhttps://evil.example\n\n[go][r]"]) {
      const out = sanitizeMarkdown(md);
      expect(out).not.toMatch(/\]:/);
      expect(out).toContain("]\\:");
      expect(sanitizeMarkdown(out)).toBe(out);
    }
    // Code is never touched.
    expect(sanitizeMarkdown("`[x]( https://e.example)`")).toBe("`[x]( https://e.example)`");
    expect(sanitizeMarkdown("`[a](http://x)` and [a](http://x)")).toBe("`[a](http://x)` and a");
  });
});

describe("HtmlGuard as a stream", () => {
  const samples = [
    'Bar 3: try `note("<c3 e3>")` not <b>this</b>.\n\n```strudel\nmel: n("<0 2>")\n```\nDone <i>ok</i>',
    "a `` code ` with tick `` and <u>x</u> and ``` not a fence ``` <s>",
    "tail backtick `",
    "tail lt <",
    "\\<b> and \\` and `ok` \\\n```\n<x>\n```",
    "```\r\ncode <a>\r\n```\r\n<b>",
    "  ```\n<in indented fence>\n  ```\n<b>",
    `\`${"x".repeat(500)}<b>\``,
  ];

  test.each(samples)("any chunking gives the same output as the whole text: %p", (text) => {
    const whole = sanitizeHtmlOnly(text);
    for (let size = 1; size <= 7; size++) {
      const g = new HtmlGuard();
      let out = "";
      for (let i = 0; i < text.length; i += size) out += g.push(text.slice(i, i + size));
      out += g.flush();
      expect(out).toBe(whole);
    }
  });

  test("prose is forwarded as it arrives; only a possible construct is held back", () => {
    const g = new HtmlGuard();
    expect(g.push("Hello wor")).toBe("Hello wor");
    expect(g.push("ld <")).toBe("ld ");
    expect(g.push("b>bold")).toBe("&lt;b>bold");
    expect(g.push(" `co")).toBe(" ");
    expect(g.push("de` x")).toBe("`code` x");
    expect(g.flush()).toBe("");
  });

  function sanitizeHtmlOnly(text: string): string {
    const g = new HtmlGuard();
    return g.push(text) + g.flush();
  }
});

test("countWords", () => {
  expect(countWords("")).toBe(0);
  expect(countWords("  one  two\nthree ")).toBe(3);
});
