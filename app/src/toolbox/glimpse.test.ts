// The unlock glimpses are the features' own toolbox demos: the phrases match the demos as headless Strudel plays
// them, the lines are the degrees and syllables of @oak/theory, and the panel and ring keys are the demos' keys.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { midisOf } from "@oak/grader/testing";
import { parseNoteList } from "@oak/notation";
import { labelPitch } from "@oak/theory";
import { toolbox } from "../../../content/toolbox.ts";
import { GLIMPSES, glimpseAbc } from "./glimpse.ts";

setDefaultTimeout(30_000);

const demo = (id: string) => toolbox.find((t) => t.id === id)?.catalog.demo ?? "";

describe("feature glimpses", () => {
  for (const [id, g] of Object.entries(GLIMPSES)) {
    if (g.kind !== "staff") continue;
    test(`${id}: the phrase is the demo's first two bars, labelled by theory`, async () => {
      const heard = (await midisOf(demo(id), g.bars)).filter((m): m is number => m !== null);
      const written = parseNoteList(g.notes)
        .map((e) => e.midi)
        .filter((m): m is number => m !== null);
      expect(written).toEqual(heard);
      const abc = glimpseAbc(g);
      const w = abc.split("\n").filter((l) => l.startsWith("w:"));
      const degrees = written.map((m) => labelPitch(m, g.key).degreeDisplay);
      expect(w[0]?.slice(2).replace(/ \| /g, " ").split(" ")).toEqual(degrees);
      if (g.lines.solfege)
        expect(w[1]?.slice(2).replace(/ \| /g, " ").split(" ")).toEqual(
          written.map((m) => labelPitch(m, g.key).syllable),
        );
    });
  }

  test("the key panel and the ring show the demos' keys", () => {
    const keysig = GLIMPSES["tb.feature.keysig"];
    expect(keysig?.kind === "key-panel" && keysig.key).toEqual({ tonic: "D", mode: "major" });
    expect(demo("tb.feature.keysig")).toContain('.scale("D4:major")');
    const circle = GLIMPSES["tb.feature.circle"];
    if (circle?.kind !== "circle") throw new Error("circle glimpse");
    expect(circle.keys.map((k) => k.tonic)).toEqual(["C", "F", "Bb", "Eb"]);
    expect(demo("tb.feature.circle")).toContain("<C4:major F4:major Bb3:major Eb4:major>");
  });
});
