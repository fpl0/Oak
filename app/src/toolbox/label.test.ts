// The catalog's "†" (audibility still to be confirmed, contracts §3.2 rule 7) never reaches a learner's label.
import { describe, expect, test } from "bun:test";
import { toolbox } from "../../../content/toolbox.ts";
import { shownToolLabel } from "./label.ts";

describe("tool labels on the Toolbox", () => {
  test("no label a learner sees carries the catalog's †", () => {
    const marked = toolbox.filter((t) => t.code.includes("†"));
    expect(marked.length).toBeGreaterThan(0);
    for (const t of toolbox) expect(shownToolLabel(t).text, t.id).not.toContain("†");
    const partials = toolbox.find((t) => t.id === "tb.partials");
    expect(partials && shownToolLabel(partials).text).toBe(".partials([…])");
  });
});
