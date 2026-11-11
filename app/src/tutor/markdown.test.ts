import { describe, expect, test } from "bun:test";
import {
  type Block,
  type Inline,
  parseInline,
  parseMarkdown,
  plainText,
  safeHref,
  tokensIn,
} from "./markdown.ts";

/** Every string the AST could ever hand to the DOM, flattened. */
function strings(blocks: Block[]): string[] {
  const out: string[] = [];
  const inl = (ns: Inline[]) => {
    for (const n of ns) {
      if (n.t === "text" || n.t === "code") out.push(n.text);
      else if (n.t === "token") out.push(n.raw);
      else if (n.t === "link") {
        out.push(n.href);
        inl(n.children);
      } else if (n.t === "strong" || n.t === "em") inl(n.children);
    }
  };
  const blk = (bs: Block[]) => {
    for (const b of bs) {
      if (b.t === "p" || b.t === "h") inl(b.children);
      else if (b.t === "ul" || b.t === "ol") for (const it of b.items) inl(it);
      else if (b.t === "quote") blk(b.children);
      else if (b.t === "pre") out.push(b.text);
    }
  };
  blk(blocks);
  return out;
}

const kinds = (blocks: Block[]) => blocks.map((b) => b.t);
const NODE_KINDS = new Set(["text", "strong", "em", "code", "link", "token", "br"]);
const BLOCK_KINDS = new Set(["p", "h", "ul", "ol", "quote", "pre", "hr"]);

function shapeOk(blocks: Block[]): boolean {
  const inl = (ns: Inline[]): boolean =>
    ns.every(
      (n) =>
        NODE_KINDS.has(n.t) &&
        Object.keys(n).every((k) => ["t", "text", "children", "href", "token", "raw"].includes(k)) &&
        (n.t === "strong" || n.t === "em" || n.t === "link" ? inl(n.children) : true),
    );
  return blocks.every(
    (b) =>
      BLOCK_KINDS.has(b.t) &&
      (b.t === "p" || b.t === "h"
        ? inl(b.children)
        : b.t === "ul" || b.t === "ol"
          ? b.items.every(inl)
          : b.t === "quote"
            ? shapeOk(b.children)
            : true),
  );
}

describe("markdown", () => {
  test("paragraphs, headings, lists, quotes, rules and fences", () => {
    const doc = parseMarkdown(
      [
        "## Bass first",
        "",
        "The bass sits on **one** and *moves* later.",
        "Same paragraph.",
        "",
        "- first",
        '- second with `n("0")`',
        "",
        "3. three",
        "4. four",
        "",
        "> a quote",
        "",
        "---",
        "```js",
        "<script>x</script>",
        "```",
      ].join("\n"),
    );
    expect(kinds(doc)).toEqual(["h", "p", "ul", "ol", "quote", "hr", "pre"]);
    expect(doc[2]).toMatchObject({ t: "ul", items: [[{ t: "text", text: "first" }], expect.any(Array)] });
    expect(doc[3]).toMatchObject({ t: "ol", start: 3 });
    expect(doc[6]).toEqual({ t: "pre", lang: "js", text: "<script>x</script>" });
    expect(plainText([doc[1] as Block])).toBe("The bass sits on one and moves later. Same paragraph.");
  });

  test("snake_case and lone markers stay text; unclosed emphasis is literal while streaming", () => {
    expect(parseInline("use snake_case_name here")).toEqual([
      { t: "text", text: "use snake_case_name here" },
    ]);
    expect(parseInline("2 * 3 = 6")).toEqual([{ t: "text", text: "2 * 3 = 6" }]);
    expect(parseInline("half **bold")).toEqual([{ t: "text", text: "half **bold" }]);
  });

  test("music tokens parse inside emphasis and lists, but not inside code", () => {
    const doc = parseMarkdown(
      "- **[[deg:5]]** over [[rn:V7]] in [[bars:3-4]]\n\n`[[deg:1]]` stays text [[reveal]]",
    );
    expect(tokensIn(doc)).toEqual([
      { kind: "deg", value: "5" },
      { kind: "rn", value: "V7" },
      { kind: "bars", value: "3-4" },
      { kind: "reveal" },
    ]);
    expect(strings(doc)).toContain("[[deg:1]]");
  });

  test("malformed and unknown tokens render as plain text", () => {
    const doc = parseMarkdown("[[deg:9]] [[foo:bar]] [[note:H2]] [[bars:x]] [[deg:5]");
    expect(tokensIn(doc)).toEqual([]);
    expect(plainText(doc)).toBe("[[deg:9]] [[foo:bar]] [[note:H2]] [[bars:x]] [[deg:5]");
  });

  test("every token kind of contracts §10.7", () => {
    const doc = parseMarkdown(
      "[[deg:b3]] [[rn:V7/vi]] [[note:F#4]] [[chord:Am7]] [[bars:2]] [[tool:tb.scale]] [[term:cadence]]",
    );
    expect(tokensIn(doc).map((t) => t.kind)).toEqual(["deg", "rn", "note", "chord", "bars", "tool", "term"]);
  });
});

describe("hostile input renders inert", () => {
  const HOSTILE = [
    "<script>alert(1)</script>",
    '<img src=x onerror="alert(1)">',
    "<iframe src=//evil.example></iframe>",
    "[click](javascript:alert(1))",
    "[click](JaVaScRiPt:alert(1))",
    "[click](//evil.example/path)",
    "[click](https://evil.example)",
    "[click](data:text/html;base64,PHNjcmlwdD4=)",
    "[click](/\\evil.example)",
    "![img](https://evil.example/x.png)",
    '<a href="https://evil.example">x</a>',
    "**<b onmouseover=alert(1)>bold</b>**",
    "[[deg:5]]<svg onload=alert(1)>",
    "<style>body{display:none}</style>",
    "&lt;script&gt; &#x3C;img&#x3E;",
  ];

  for (const src of HOSTILE)
    test(JSON.stringify(src).slice(0, 60), () => {
      const doc = parseMarkdown(src);
      expect(shapeOk(doc)).toBe(true);
      // No link survives unless it is an in-app path.
      const walk = (ns: Inline[]): string[] =>
        ns.flatMap((n) =>
          n.t === "link"
            ? [n.href, ...walk(n.children)]
            : n.t === "strong" || n.t === "em"
              ? walk(n.children)
              : [],
        );
      const hrefs = doc.flatMap((b) => (b.t === "p" ? walk(b.children) : []));
      for (const h of hrefs) expect(h.startsWith("/") && !h.startsWith("//")).toBe(true);
      expect(hrefs).toEqual([]);
      // The angle brackets are still there as characters: React will print them, not parse them.
      if (src.includes("<")) expect(strings(doc).join("")).toContain("<");
    });

  test("in-app links survive; everything else keeps only its words", () => {
    const doc = parseMarkdown("See [the toolbox](/toolbox/tb.scale) and [this](https://x.example).");
    const p = doc[0] as Extract<Block, { t: "p" }>;
    expect(p.children).toEqual([
      { t: "text", text: "See " },
      { t: "link", href: "/toolbox/tb.scale", children: [{ t: "text", text: "the toolbox" }] },
      { t: "text", text: " and this." },
    ]);
  });

  test("safeHref", () => {
    expect(safeHref("/oak?view=tree")).toBe("/oak?view=tree");
    for (const bad of ["//x", "/\\x", "http://x", "javascript:x", "x", "", "/a b", " //x"])
      expect(safeHref(bad)).toBeNull();
  });

  test("pathological input is bounded and never throws", () => {
    const deep = `${"> ".repeat(200)}x`;
    expect(() => parseMarkdown(deep)).not.toThrow();
    const nested = `${"**[".repeat(500)}x${"]**".repeat(500)}`;
    expect(() => parseMarkdown(nested)).not.toThrow();
    const long = "a".repeat(100_000);
    expect(plainText(parseMarkdown(long)).length).toBe(40_000);
    expect(() => parseMarkdown("`".repeat(5000))).not.toThrow();
  });

  test("unclosed brackets and underscores parse in linear time (review: 40k chars took ~1 s per chunk)", () => {
    for (const hostile of [
      "[a".repeat(19_000),
      "_a ".repeat(13_000),
      "*a ".repeat(13_000),
      "[a](".repeat(9_000),
    ]) {
      const t = performance.now();
      parseMarkdown(hostile);
      expect(performance.now() - t).toBeLessThan(150);
    }
    // Ordinary emphasis and links are untouched by the bound.
    expect(parseInline("_one_ and [Oak](/oak)")).toEqual([
      { t: "em", children: [{ t: "text", text: "one" }] },
      { t: "text", text: " and " },
      { t: "link", href: "/oak", children: [{ t: "text", text: "Oak" }] },
    ]);
  });
});
