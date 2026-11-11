import { type Page, expect, test } from "@playwright/test";

const MODE = process.env.OAK_S4_MODE === "preview" ? "preview" : "dev";
const LIGHT = "rgb(26, 26, 26)";
const DARK = "rgb(230, 230, 230)";
const HL = "rgb(217, 72, 15)";

// biome-ignore lint/suspicious/noExplicitAny: page globals
declare const window: any;

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  await page.evaluate(() => window.__oak.ready);
  return errors;
}
/** Click the centre of an SVG element by coordinates (abcjs hit-tests by mouse position, not by target). */
async function clickCentre(page: Page, sel: string) {
  const loc = page.locator(sel).first();
  await loc.scrollIntoViewIfNeeded();
  const b = (await loc.boundingBox()) as { x: number; y: number; width: number; height: number };
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}
const classesOf = (page: Page, sel: string) =>
  page.evaluate((s) => [...document.querySelectorAll(s)].map((n) => n.getAttribute("class") ?? ""), sel);
const activeIn = (page: Page, staff: string) =>
  page.evaluate(
    (s) =>
      [...document.querySelectorAll(`${s} .oak-active`)].map((n) => ({
        ids: [...n.classList].filter((c) => c.startsWith("oak-e")),
        fill: getComputedStyle(n.querySelector(".abcjs-notehead") as Element).fill,
      })),
    staff,
  );

test("import shape of the lazy-loaded abcjs chunk", async ({ page }) => {
  const errors = await open(page);
  const shape = await page.evaluate(() => window.__oak.state.importShape);
  console.log(`[${MODE}] abcjs import shape: ${JSON.stringify(shape)}`);
  expect(shape.hasDefault).toBe(true);
  expect(shape.defaultRenderAbc).toBe("function");
  expect(shape.signature).toBe("abcjs-basic v6.7.2");
  expect(errors).toEqual([]);
});

test("(a) every note carries its oak-e{id} class on the SVG group", async ({ page }) => {
  await open(page);
  // 01: four notes, four groups
  for (const id of [0, 1, 2, 3]) {
    const loc = page.locator(`#staff-01 .oak-e${id}`);
    await expect(loc).toHaveCount(1);
    expect(await loc.evaluate((n) => `${n.tagName}|${n.getAttribute("data-name")}`)).toBe("g|note");
    await expect(loc).toHaveClass(/abcjs-note/);
  }
  await expect(page.locator("#staff-01 [class*='oak-e']")).toHaveCount(4);
  // responsive:'resize' takes over the container: inline styles on the div, viewBox + absolute SVG
  const resp = await page.evaluate(() => {
    const div = document.querySelector("#staff-01") as HTMLElement;
    const svg = div.querySelector("svg") as SVGSVGElement;
    return {
      divStyle: div.getAttribute("style"),
      divClass: div.getAttribute("class"),
      svgViewBox: svg.getAttribute("viewBox"),
      svgStyle: svg.getAttribute("style"),
      svgWidthAttr: svg.getAttribute("width"),
      rendered: `${Math.round(svg.getBoundingClientRect().width)}x${Math.round(svg.getBoundingClientRect().height)}`,
    };
  });
  console.log(`[${MODE}] responsive container: ${JSON.stringify(resp)}`);
  expect(resp.svgViewBox).toMatch(/^0 0 \d+/);
  // 09: tied pieces of one event share the class -> two groups each
  await expect(page.locator("#staff-09 .oak-e0")).toHaveCount(2);
  await expect(page.locator("#staff-09 .oak-e1")).toHaveCount(2);
  // 08: one group per chord carrying all three event classes; noteheads are addressable by chord-pos
  const chord = await classesOf(page, "#staff-08 g.abcjs-note");
  console.log(`[${MODE}] chord group classes: ${JSON.stringify(chord)}`);
  expect(chord).toHaveLength(2);
  expect(chord[0]).toMatch(/oak-e0 oak-e1 oak-e2$/);
  expect(chord[1]).toMatch(/oak-e3 oak-e4 oak-e5$/);
  expect(await classesOf(page, "#staff-08 .oak-e4 .abcjs-notehead")).toEqual([
    "abcjs-notehead abcjs-chord-pos-1",
    "abcjs-notehead abcjs-chord-pos-2",
    "abcjs-notehead abcjs-chord-pos-3",
  ]);
  // every staff in the gallery: each event id of the model is present in the DOM, rests carry none
  const coverage = await page.evaluate(() =>
    window.__oak.state.rendered.map((r: any) => ({
      name: r.name,
      missing: r.score.slots.flatMap((s: any) => s.eventIds).filter((id: number) => !r.el.querySelector(`.oak-e${id}`)),
      restWithClass: r.el.querySelectorAll(".abcjs-rest[class*='oak-e']").length,
      svgs: r.el.querySelectorAll("svg").length,
    })),
  );
  expect(coverage).toHaveLength(21);
  for (const c of coverage) expect(c).toEqual({ name: c.name, missing: [], restWithClass: 0, svgs: 1 });
});

test("(b) clicking a note fires clickListener with startChar/endChar and the class", async ({ page }) => {
  await open(page);
  await clickCentre(page, "#staff-01 .oak-e2 .abcjs-notehead");
  let clicks = await page.evaluate(() => window.__oak.state.clicks);
  console.log(`[${MODE}] click record: ${JSON.stringify(clicks[0])}`);
  expect(clicks).toHaveLength(1);
  expect(clicks[0]).toMatchObject({
    staff: "staff-01",
    elType: "note",
    oakIds: [2],
    extraClass: "oak-e2",
    abcText: "!class=oak-e2!E4 ",
    pitches: [2],
    argCount: 6,
    locations: [{ start: 12, end: 14 }], // -> `e4` in note("c4 d4 e4 f4")
  });
  expect(clicks[0].classes).toContain("oak-e2");
  expect(clicks[0].endChar).toBeGreaterThan(clicks[0].startChar);
  await expect(page.locator("#staff-01 .oak-e2")).toHaveClass(/oak-clicked/);

  // chord: one group for three events. The centre of a hollow (half-note) head is empty, so the DOM target
  // is the <svg>; abcjs still resolves the chord by coordinates, and geometry tells which head was meant.
  await clickCentre(page, "#staff-08 .oak-e4 .abcjs-chord-pos-2");
  clicks = await page.evaluate(() => window.__oak.state.clicks);
  console.log(`[${MODE}] chord click record: ${JSON.stringify(clicks[1])}`);
  expect(clicks[1]).toMatchObject({
    staff: "staff-08",
    oakIds: [3, 4, 5],
    extraClass: "oak-e3 oak-e4 oak-e5",
    abcText: "!class=oak-e3 oak-e4 oak-e5![FAc]8 ",
    groupIsG: true,
    chordPos: 2,
    hitIds: [4],
    locations: [{ start: 21, end: 23 }], // -> `a4` in note("[c4,e4,g4] [f4,a4,c5]")
  });

  // selectTypes:['note'] ALSO reports rests (el_type 'note' with .rest): the listener must filter them
  await clickCentre(page, "#staff-05 .abcjs-rest");
  clicks = await page.evaluate(() => window.__oak.state.clicks);
  console.log(`[${MODE}] rest click record: ${JSON.stringify(clicks[2])}`);
  expect(clicks).toHaveLength(3);
  expect(clicks[2]).toMatchObject({ staff: "staff-05", isRest: true, oakIds: [], abcText: "z4 ", elType: "note" });
  // ... and empty staff space far from any note gives no callback either
  await page.locator("#staff-01 svg").scrollIntoViewIfNeeded();
  const box = (await page.locator("#staff-01 svg").boundingBox()) as { x: number; y: number; width: number; height: number };
  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.5);
  clicks = await page.evaluate(() => window.__oak.state.clicks);
  console.log(`[${MODE}] clicks after empty-space click: ${clicks.length}`);
  expect(clicks).toHaveLength(3);
  // keyboard: note groups get tabindex=0, but abcjs only wires Enter/Space when `dragging: true` is set
  const tabindex = await page.locator("#staff-01 .oak-e1").getAttribute("tabindex");
  await page.locator("#staff-01 .oak-e1").focus();
  await page.keyboard.press("Enter");
  clicks = await page.evaluate(() => window.__oak.state.clicks);
  console.log(`[${MODE}] tabindex=${tabindex}; clicks after focus+Enter on .oak-e1 (dragging off): ${clicks.length}`);
  expect(tabindex).toBe("0");
  expect(clicks).toHaveLength(3);
});

test("(c) highlighting is driven by an external (fake) clock", async ({ page }) => {
  await open(page);
  const step = async (cycle: number) => {
    await page.evaluate((c) => window.__oak.setCycle(c), cycle);
    return {
      s01: await activeIn(page, "#staff-01"),
      s09: await activeIn(page, "#staff-09"),
      s04: await activeIn(page, "#staff-04"),
      s08: await activeIn(page, "#staff-08"),
    };
  };
  // position 1: cycle 0.10 -> first quarter
  let a = await step(0.1);
  console.log(`[${MODE}] cycle 0.10: ${JSON.stringify(a)}`);
  expect(a.s01).toEqual([{ ids: ["oak-e0"], fill: HL }]);
  expect(a.s09).toEqual([]); // quarter rest
  expect(a.s04).toEqual([{ ids: ["oak-e0"], fill: HL }]);
  expect(a.s08.map((x) => x.ids)).toEqual([["oak-e0", "oak-e1", "oak-e2"]]);
  // position 2: cycle 0.55 -> third quarter; in 09 the tied c4 lights BOTH of its pieces
  a = await step(0.55);
  console.log(`[${MODE}] cycle 0.55: ${JSON.stringify(a)}`);
  expect(a.s01).toEqual([{ ids: ["oak-e2"], fill: HL }]);
  expect(a.s09).toEqual([
    { ids: ["oak-e0"], fill: HL },
    { ids: ["oak-e0"], fill: HL },
  ]);
  expect(a.s04.map((x) => x.ids)).toEqual([["oak-e1"]]);
  expect(a.s08.map((x) => x.ids)).toEqual([["oak-e3", "oak-e4", "oak-e5"]]);
  // position 3: cycle 1.30 -> bar 2 of the two-bar loop; one-bar loops wrap
  a = await step(1.3);
  console.log(`[${MODE}] cycle 1.30: ${JSON.stringify(a)}`);
  expect(a.s04.map((x) => x.ids)).toEqual([["oak-e2"]]);
  expect(a.s01.map((x) => x.ids)).toEqual([["oak-e1"]]);
  expect(a.s09.map((x) => x.ids)).toEqual([["oak-e0"], ["oak-e0"]]); // 0.30: tied c4 again, both pieces
  // exactly one active set at a time, nothing left behind
  expect(await page.locator("#staff-01 .oak-active").count()).toBe(1);
  // non-active notes keep the foreground colour
  expect(await page.locator("#staff-01 .oak-e3 .abcjs-notehead").evaluate((n) => getComputedStyle(n).fill)).toBe(LIGHT);
  // a 60-step sweep costs little (class toggles only, no re-render)
  const ms = await page.evaluate(() => {
    const t = performance.now();
    for (let i = 0; i < 600; i++) window.__oak.setCycle(i / 300);
    return performance.now() - t;
  });
  console.log(`[${MODE}] 600 setCycle() calls over 21 staves: ${ms.toFixed(1)} ms`);
});

test("(d) grand staff and chord symbols render", async ({ page }) => {
  await open(page);
  const info = await page.evaluate(() => {
    const q = (root: string, sel: string) => [...document.querySelectorAll(`${root} ${sel}`)];
    const one = (root: string) => ({
      staves: q(root, ".abcjs-staff").length,
      clefs: q(root, ".abcjs-clef path").map((p) => p.getAttribute("data-name")),
      brace: q(root, ".abcjs-brace").length,
      chords: q(root, ".abcjs-chord").map((t) => t.textContent),
      chordHtml: q(root, ".abcjs-chord").map((t) => t.innerHTML.replace(/<tspan[^>]*>/g, "<tspan>")),
      chordTag: q(root, ".abcjs-chord")[0]?.tagName,
      rhNotes: q(root, ".abcjs-note.abcjs-v0").length,
      lhNotes: q(root, ".abcjs-note.abcjs-v1").length,
      lhClass: q(root, ".oak-e6")[0]?.getAttribute("class"),
      tempo: q(root, ".abcjs-tempo").length,
    });
    return { plain: one("#grand"), jazz: one("#grand-jazz") };
  });
  console.log(`[${MODE}] grand staff: ${JSON.stringify(info)}`);
  expect(info.plain.staves).toBe(2);
  expect(info.plain.clefs).toEqual(["clefs.G", "clefs.F"]);
  expect(info.plain.brace).toBe(1);
  expect(info.plain.chords).toEqual(["C∆7", "D-7", "G7", "Ch7", "B°7"]);
  expect(info.plain.rhNotes).toBe(5);
  expect(info.plain.lhNotes).toBe(5);
  expect(info.plain.lhClass).toContain("abcjs-v1");
  expect([...info.plain.chords[0]].map((ch: string) => ch.codePointAt(0)?.toString(16))).toEqual(["43", "2206", "37"]);

  // how abcjs prints each chord symbol (written -> displayed)
  const probe = await page.evaluate(() => {
    const shown = [...document.querySelectorAll("#chords .abcjs-chord")].map((t) => t.textContent ?? "");
    return (window.__oak.state.chordProbe as string[]).map((w, i) => [w, shown[i]]);
  });
  console.log(`[${MODE}] chord symbols written -> displayed: ${probe.map(([w, d]) => `${w} -> ${d}`).join(" ; ")}`);
  expect(Object.fromEntries(probe)).toMatchObject({ "C^7": "C∆7", "C-7": "C-7", Ch7: "Ch7", Co7: "C°7", C07: "Cø7", Cmaj7: "Cmaj7" });
});

test("(e) dark mode through currentColor, without re-rendering", async ({ page }) => {
  await open(page);
  const probe = () =>
    page.evaluate(() => {
      const cs = (sel: string, prop: "fill" | "stroke" = "fill") => {
        const n = document.querySelector(sel);
        return n ? getComputedStyle(n)[prop] : null;
      };
      return {
        svgFillAttr: document.querySelector("#staff-01 svg")?.getAttribute("fill"),
        noteGroupFillAttr: document.querySelector("#staff-01 .oak-e0")?.getAttribute("fill"),
        notehead: cs("#staff-01 .oak-e0 .abcjs-notehead"),
        stem: cs("#staff-01 .oak-e0 .abcjs-stem"),
        staffLine: cs("#staff-01 .abcjs-staff path"),
        clef: cs("#staff-01 .abcjs-clef path"),
        bar: cs("#staff-01 .abcjs-bar path"),
        beam: cs("#staff-02 .abcjs-beam-elem"),
        tie: cs("#staff-09 .abcjs-tie"),
        tripletNumber: cs("#staff-06 .abcjs-triplet text") ?? cs("#staff-06 .abcjs-triplet"),
        tripletBracket: cs("#staff-06 path[data-name='triplet-bracket']", "stroke"),
        keySig: cs("#staff-07 .abcjs-key-signature path"),
        accidental: cs("#staff-15 path[data-name='accidentals.sharp']"),
        chordText: cs("#grand .abcjs-chord"),
        brace: cs("#grand .abcjs-brace"),
        tempoText: cs("#grand .abcjs-tempo text") ?? cs("#grand .abcjs-tempo"),
        svgCount: document.querySelectorAll("svg").length,
      };
    });
  const light = await probe();
  console.log(`[${MODE}] light: ${JSON.stringify(light)}`);
  expect(light.svgFillAttr).toBe("currentColor");
  expect(light.noteGroupFillAttr).toBe("currentColor");
  const { svgFillAttr: _a, noteGroupFillAttr: _b, svgCount, ...lightColors } = light;
  for (const [k, v] of Object.entries(lightColors)) expect(`${k}=${v}`).toBe(`${k}=${LIGHT}`);
  await page.screenshot({ path: `shots/${MODE}-light.png`, fullPage: true });

  const marker = await page.evaluate(() => {
    const svg = document.querySelector("#staff-01 svg") as any;
    svg.__same = true;
    document.body.classList.add("dark");
    return (document.querySelector("#staff-01 svg") as any).__same === true;
  });
  expect(marker).toBe(true); // same SVG node: nothing was re-rendered
  const dark = await probe();
  console.log(`[${MODE}] dark:  ${JSON.stringify(dark)}`);
  const { svgFillAttr: _c, noteGroupFillAttr: _d, svgCount: svgCount2, ...darkColors } = dark;
  for (const [k, v] of Object.entries(darkColors)) expect(`${k}=${v}`).toBe(`${k}=${DARK}`);
  expect(svgCount2).toBe(svgCount);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(18, 18, 18)");
  // highlight colour also follows the theme variable
  await page.evaluate(() => window.__oak.setCycle(0.1));
  expect(await page.locator("#staff-01 .oak-e0 .abcjs-notehead").evaluate((n) => getComputedStyle(n).fill)).toBe("rgb(255, 169, 77)");
  await page.screenshot({ path: `shots/${MODE}-dark.png`, fullPage: true });
});
