// @oak/notation's DOM half against real abcjs SVG: measureStaff + hitTest find every engraved note at its
// head with its pitch, bar and onset (treble, bass, grand staff, several systems, key signatures), the ghost
// positions land on the heads, a click edits the answer, and the annotation lines carry their classes.
import { expect, type Page, test } from "@playwright/test";
import type { Shown, ShowOptions } from "./page.ts";

async function open(page: Page): Promise<void> {
  await page.routeWebSocket(/.*/, () => {});
  await page.goto("/");
  await page.waitForFunction(() => window.oakReady === true);
}
const show = (page: Page, o: ShowOptions): Promise<Shown> =>
  page.evaluate((o) => window.oakNotation.show(o), o);

/** Every engraved note: its first head's centre hit-tests back to the note, its pitch, bar and onset. */
async function roundTrip(page: Page, id: string, o: ShowOptions): Promise<number> {
  return page.evaluate(
    ({ id, o }) => {
      const N = window.oakNotation;
      const el = document.getElementById(id) as HTMLElement;
      const meter = N.METERS[o.meter ?? "4/4"];
      const key = N.resolveKeySignature(o.key ?? null);
      const input = o.input ?? N.noteListInput(o.list ?? "", { meter, key, bars: o.bars ?? 1 });
      const { score, abc } = N.notate(
        { ...input, ...(o.staff ? { staff: o.staff } : {}) },
        { barsPerLine: o.barsPerLine ?? 4 },
      );
      const geom = N.measureStaff(el, abc, score);
      let checked = 0;
      for (const g of geom.notes) {
        const head = g.heads[0];
        if (!head) throw new Error(`note ${g.n} has no head`);
        const pt = { x: head.x + head.width / 2, y: head.y + head.height / 2 };
        const hit = N.hitTest(geom, pt, { meter, key });
        const e = abc.idMap[g.n];
        if (!hit || !e) throw new Error(`note ${g.n}: no hit`);
        const want = N.parseNoteList(`${e.pitches[0]}:4`)[0]?.written ?? "";
        const got = hit.pitch ? `${hit.pitch.letter}${hit.pitch.oct}` : "";
        const wantStep = want.replace(/[#b]+/, "");
        if (hit.note !== g.n) throw new Error(`note ${g.n}: hit note ${hit.note}`);
        if (got !== wantStep) throw new Error(`note ${g.n} (${e.pitches[0]}): hit pitch ${got}`);
        if (hit.staff !== g.staff) throw new Error(`note ${g.n}: staff ${hit.staff} vs ${g.staff}`);
        if (hit.onset[0] * e.onset[1] !== e.onset[0] * hit.onset[1])
          throw new Error(`note ${g.n}: onset ${hit.onset} vs ${e.onset}`);
        // Ghost positions: the step's y and the onset's x land on the head.
        const band = geom.staves.find((b) => b.staff === hit.staff && b.system === hit.system);
        if (!band) throw new Error("no band");
        if (Math.abs(N.stepY(band, hit.step) - pt.y) > band.lineSpacing / 4)
          throw new Error(`note ${g.n}: stepY`);
        const x = N.onsetX(band, e.onset);
        if (x === null || Math.abs(x - pt.x) > 1) throw new Error(`note ${g.n}: onsetX ${x} vs ${pt.x}`);
        checked++;
      }
      return checked;
    },
    { id, o },
  );
}

test.beforeEach(async ({ page }) => open(page));

test("treble in G major: every note hit-tests back (accidentals, naturals, ledger lines, rests)", async ({
  page,
}) => {
  const o: ShowOptions = {
    list: "G4:4 A4:8 B4:8 C5:4 F#5:4 | E5:2 F5:4 r:4 | C4:8 B3:8 A3:4 G5:4 A5:4 | C6:2 r:2",
    key: "G",
    bars: 4,
    title: "G major, treble",
  };
  const s = await show(page, o);
  expect(s.abc).toContain("K:G\n");
  expect(await roundTrip(page, s.id, o)).toBe(13);
  // One system, four bars, ticks for every item.
  expect(s.geometry.staves.map((b) => b.bars.map((x) => x.cycle))).toEqual([[0, 1, 2, 3]]);
  expect(s.geometry.staves[0]?.bars.map((b) => b.ticks?.length)).toEqual([5, 3, 5, 2]);
});

test("bass clef and the grand staff split at middle C, each staff hit-tests in its clef", async ({
  page,
}) => {
  const bass: ShowOptions = { list: "C2:4 E2:4 G2:4 C3:4 | D4:2 E4:2", bars: 2, staff: "bass", key: "C" };
  const b = await show(page, bass);
  expect(b.abc).toContain("clef=bass");
  expect(await roundTrip(page, b.id, bass)).toBe(6);
  const grand: ShowOptions = {
    list: "[C3,G3,E4]:2 [B2,D4,G4]:2 | [C3,C4,E5]:1",
    key: "C",
    bars: 2,
    staff: "grand",
    title: "grand staff",
  };
  const g = await show(page, grand);
  expect(g.abc).toContain("%%score {RH LH}");
  expect(g.geometry.staves.map((x) => `${x.staff}:${x.clef}`)).toEqual(["RH:treble", "LH:bass"]);
  const [rh, lh] = g.geometry.staves;
  expect((rh?.y1 ?? 0) <= (lh?.y0 ?? 0) + 0.01).toBe(true);
  expect(await roundTrip(page, g.id, grand)).toBe(6);
});

test("several systems: bars keep their cycles across lines", async ({ page }) => {
  const o: ShowOptions = {
    list: "C5:4 D5:4 E5:4 F5:4 | G5:1 | A5:2 G5:2 | F5:4 E5:4 D5:4 C5:4",
    bars: 4,
    barsPerLine: 2,
  };
  const s = await show(page, o);
  const sys = s.geometry.staves.map((b) => [b.system, b.bars.map((x) => x.cycle)]);
  expect(sys).toEqual([
    [0, [0, 1]],
    [1, [2, 3]],
  ]);
  expect(await roundTrip(page, s.id, o)).toBe(11);
});

test("every major key signature: the right number of accidentals in both clefs", async ({ page }) => {
  const counts = await page.evaluate(async () => {
    const N = window.oakNotation;
    const out: string[] = [];
    for (let f = -7; f <= 7; f++) {
      for (const staff of ["treble", "bass"] as const) {
        const s = await N.show({ list: "", key: f, staff, bars: 1 });
        const el = document.getElementById(s.id) as HTMLElement;
        const glyphs = el.querySelectorAll(".abcjs-key-signature path").length;
        out.push(`${f}:${staff}:${glyphs}`);
      }
    }
    return out;
  });
  for (let f = -7; f <= 7; f++)
    for (const staff of ["treble", "bass"]) expect(counts).toContain(`${f}:${staff}:${Math.abs(f)}`);
});

test("a theoretical key is drawn with its own signature (G# major: seven glyphs, F double sharp)", async ({
  page,
}) => {
  const s = await show(page, {
    list: "G#4:4 A#4:4 B#4:4 F##5:4",
    key: { tonic: "G#", mode: "major" } as never,
  });
  expect(s.abc).toContain("K:C exp ^^f ^c ^g ^d ^a ^e ^b");
  const glyphs = await page.locator(`#${s.id} .abcjs-key-signature path`).count();
  expect(glyphs).toBe(7);
});

test("a click on an empty slot writes the note there (pointer → hitTest → editNoteList)", async ({
  page,
}) => {
  const s = await show(page, { list: "C5:4 r:4 r:2", key: "D", bars: 1 });
  // The point: halfway between the first tick and the bar end → beat 3, on the top space (E5 in D major).
  const target = await page.evaluate((s) => {
    const band = s.geometry.staves[0];
    const bar = band?.bars[0];
    if (!band || !bar) throw new Error("no bar");
    const x = window.oakNotation.onsetX(band, [1, 2]) as number;
    return { x, y: window.oakNotation.stepY(band, 1), bar };
  }, s);
  await page.mouse.click(target.x, target.y);
  const result = await page.evaluate(
    ({ id, x, y }) => {
      const N = window.oakNotation;
      const meter = N.METERS["4/4"];
      const key = N.resolveKeySignature("D");
      const ctx = { meter, key, bars: 1 };
      const el = document.getElementById(id) as HTMLElement;
      const before = N.notate(N.noteListInput("C5:4 r:4 r:2", ctx));
      const geom = N.measureStaff(el, before.abc, before.score);
      const hit = N.hitTest(geom, { x, y }, { meter, key, grid: [1, 4] });
      if (!hit?.pitch) throw new Error("no hit");
      const out = N.editNoteList(
        "C5:4 r:4 r:2",
        { op: "insert", onset: hit.onset, dur: [1, 4], pitch: hit.pitch.name },
        ctx,
      );
      return { list: out.list, onset: hit.onset, pitch: hit.pitch.name };
    },
    { id: s.id, x: target.x, y: target.y },
  );
  expect(result).toEqual({ list: "C5:4 r:4 E5:4 r:4", onset: [1, 2], pitch: "E5" });
});

test("annotations: degree, solfège and name lines tagged with stable classes; above; drawn; replaced", async ({
  page,
}) => {
  const s = await show(page, {
    list: "D4:4 F#4:4 [A4,D5]:4 C5:4~ | C5:4 G4:4 E4:2",
    key: "D",
    bars: 2,
    annotations: { degree: true, solfege: true, noteName: true },
  });
  expect(s.abc).toContain("w:1 3 5~1 ♭7 | * 4 2");
  const text = async (sel: string) =>
    (await page.locator(`#${s.id} ${sel}`).allTextContents()).map((t) => t.replace(/\s+/g, " "));
  expect(await text(".oak-ann-degree")).toEqual(["1", "3", "5 1", "♭7", "4", "2"]);
  expect(await text(".oak-ann-solfege")).toEqual(["do", "mi", "sol do", "te", "fa", "re"]);
  expect(await text(".oak-ann-name")).toEqual(["D4", "F♯4", "A4 D5", "C5", "G4", "E4"]);
  expect(await text(".oak-ann-e2")).toEqual(["5 1", "sol do", "A4 D5"]);
  expect(await page.locator(`#${s.id} [data-oak-ann="drawn"]`).count()).toBe(0);
  // Placing again replaces (no duplicates).
  await page.evaluate((id) => {
    const N = window.oakNotation;
    const meter = N.METERS["4/4"];
    const input = N.noteListInput("D4:4 F#4:4 [A4,D5]:4 C5:4~ | C5:4 G4:4 E4:2", {
      meter,
      key: N.resolveKeySignature("D"),
      bars: 2,
    });
    const { score } = N.notate(input);
    N.placeAnnotations(
      document.getElementById(id) as HTMLElement,
      N.noteAnnotations(score, { degree: true }),
      { degree: true },
    );
  }, s.id);
  expect(await page.locator(`#${s.id} .oak-ann`).count()).toBe(6);
  expect(await page.locator(`#${s.id} .oak-ann-solfege`).count()).toBe(0);

  const above = await show(page, {
    list: "A3:4 C4:4 E4:4 G#4:4",
    key: "Am",
    annotations: { degree: true, solfege: true, position: "above" },
  });
  expect(above.abc).toContain('"^1""^do"');
  expect(await page.locator(`#${above.id} .oak-ann-solfege`).allTextContents()).toEqual([
    "do",
    "me",
    "sol",
    "ti",
  ]);
  expect(await page.locator(`#${above.id} [data-oak-ann="tagged"]`).count()).toBe(8);
  expect(await page.locator(`#${above.id} [data-oak-ann="drawn"]`).count()).toBe(0);
  // A staff engraved without annotation lines gets drawn texts under the staff.
  const drawn = await show(page, {
    list: "E4:2 G4:2",
    key: "C",
    annotations: { degree: true, noteName: true },
    domAnnotations: true,
  });
  expect(drawn.abc).not.toContain("w:");
  expect(await page.locator(`#${drawn.id} text.oak-ann-degree`).allTextContents()).toEqual(["3", "5"]);
  expect(await page.locator(`#${drawn.id} [data-oak-ann="drawn"]`).count()).toBe(4);
  const ys = await page.evaluate((id) => {
    const el = document.getElementById(id) as HTMLElement;
    const staff = el.querySelector("g.abcjs-staff")?.getBoundingClientRect();
    const t = el.querySelector("text.oak-ann-degree")?.getBoundingClientRect();
    return { staffBottom: staff?.bottom ?? 0, textTop: t?.top ?? 0 };
  }, drawn.id);
  expect(ys.textTop).toBeGreaterThan(ys.staffBottom);
});
