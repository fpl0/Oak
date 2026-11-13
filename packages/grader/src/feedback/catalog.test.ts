import { describe, expect, test } from "bun:test";
import type { Diagnostic } from "@oak/content-kit";
import { isFeedbackId } from "@oak/content-kit";
import {
  catalogSeverity,
  diag,
  FEEDBACK_CATALOG,
  messagesOf,
  renderFeedback,
  sortDiagnostics,
  unknownCodes,
} from "./catalog.ts";

// Every code named in exercises §2.6 and in the table of contracts §5.7.
const REQUIRED = [
  "eval.syntax",
  "eval.mini-parse",
  "eval.timeout",
  "eval.too-many-events",
  "eval.runtime",
  "eval.query",
  "eval.silent",
  "eval.truncated",
  "code.single-quoted-pattern",
  "code.n-without-scale",
  "code.bare-value",
  "code.no-pitch",
  "code.unknown-chord",
  "code.lowercase-chord-root",
  "code.must-call",
  "code.must-not-call",
  "code.arg-mismatch",
  "code.mini-uses",
  "code.mini-avoids",
  "code.no-note-names",
  "code.no-randomness",
  "code.unchanged",
  "code.edit-outside",
  "code.too-many-changes",
  "code.labels",
  "code.tempo",
  "code.octave-default",
  "code.locked-tool",
  "code.locked-sound",
  "code.locked-scale",
  "code.locked-chord",
  "code.locked-mini",
  "code.preview-tool",
  "code.uncatalogued",
  "code.dollar-label",
  "code.label-unknown",
  "code.label-solo-prefix",
  "code.muted-label",
  "code.chord-not-in-dict",
  "code.slash-chord",
  "code.scale-no-octave",
  "code.scale-spaces",
  "code.chromatic-step",
  "code.mode-above",
  "code.transpose-after-scale",
  "code.add-on-control",
  "code.nudge-studio-only",
  "code.swing-convention",
  "code.swing-fraction-string",
  "code.setcpm-missing",
  "code.setcpm-form",
  "code.range-spacing",
  "code.time-fraction-string",
  "code.arranged-scale-pattern",
  "form.section-period",
  "lint.strict.computed-member",
  "lint.strict.this",
  "lint.strict.reserved-string",
  "lint.strict.construct",
  "rhythm.swing-missing",
  "rhythm.pickup-missing",
  "form.inconsistent-arrange",
  "make.beyond-brief",
  "rhythm.missing",
  "rhythm.extra",
  "rhythm.displaced",
  "rhythm.subdivision",
  "rhythm.duration",
  "rhythm.period",
  "rhythm.role-missing",
  "melody.wrong-degree",
  "melody.octave",
  "melody.index-shift",
  "melody.transposed",
  "melody.missing-note",
  "melody.extra-note",
  "melody.contour-right",
  "melody.rhythm-only",
  "melody.ends-on",
  "harmony.bass",
  "harmony.root",
  "harmony.quality",
  "harmony.inversion",
  "harmony.rn-case",
  "harmony.missing-chord",
  "harmony.extra-chord",
  "harmony.schema-rotation",
  "harmony.not-in-key",
  "spell.enharmonic",
  "spell.wrong",
  "spell.order",
  "keysig.wrong",
  "sing.no-voice",
  "sing.bleed",
  "sing.sharp",
  "sing.flat",
  "sing.wrong-note",
  "sing.missed",
  "sing.octave-jump",
  "sing.drift",
  "sing.unstable",
  "sing.early",
  "sing.late",
  "tap.missed",
  "tap.extra",
  "tap.offset",
  "tap.rushing",
  "tap.dragging",
  "id.wrong",
  "id.confusion",
  "fill.blank-wrong",
  "parsons.swap",
  "parsons.distractor",
  "hunt.not-here",
  "investigate.not-here",
  "rubric.unmet",
  "rubric.met",
  "pass.perfect",
  "pass.close",
];

describe("feedback catalog", () => {
  test("covers every code of exercises §2.6 and contracts §5.7", () => {
    expect(REQUIRED.filter((id) => !(id in FEEDBACK_CATALOG))).toEqual([]);
  });
  test("every code is a valid FeedbackId in a registered area", () => {
    expect(Object.keys(FEEDBACK_CATALOG).filter((id) => !isFeedbackId(id))).toEqual([]);
  });
  test("severities by profile: a locked tool is an error when graded, info in Studio", () => {
    expect(catalogSeverity("code.locked-tool", "graded")).toBe("error");
    expect(catalogSeverity("code.locked-tool", "studio")).toBe("info");
    expect(catalogSeverity("code.dollar-label", "content")).toBe("error");
    expect(catalogSeverity("rubric.met")).toBe("praise");
  });
  test("every template renders with no slot left over", () => {
    for (const [id, t] of Object.entries(FEEDBACK_CATALOG)) {
      const params = Object.fromEntries(
        [...t.template.matchAll(/\{(\w+)\}/g)].map((m) => [m[1] as string, "X"]),
      );
      const text = renderFeedback({ id: id as Diagnostic["id"], severity: "error", params });
      expect(text).not.toMatch(/[{}]/);
      expect(text.length).toBeGreaterThan(3);
    }
  });
});

describe("rendering", () => {
  test("slots come from params, then from where; the pickup bar reads as 'Pickup'", () => {
    const d = diag("rhythm.missing", { role: " (snare)" }, { bar: 3, beatLabel: "2&" });
    expect(renderFeedback(d)).toBe("Bar 3, 2&: missing hit (snare).");
    expect(renderFeedback(diag("rhythm.missing", { role: "" }, { bar: 0, beatLabel: "3" }))).toBe(
      "Pickup, 3: missing hit.",
    );
  });
  test("an exercise may override the text, never the code", () => {
    const d = diag("melody.ends-on", { got: "5", expected: "1" });
    expect(renderFeedback(d, { "melody.ends-on": "Land on home ({expected}), not {got}." })).toBe(
      "Land on home (1), not 5.",
    );
  });
  test("deterministic: the same diagnostic renders the same text", () => {
    const d = diag(
      "melody.wrong-degree",
      { got: "5", gotSyl: "sol", exp: "1", expSyl: "do" },
      { bar: 2, beatLabel: "4" },
    );
    expect(renderFeedback(d)).toBe(renderFeedback(structuredClone(d)));
    expect(renderFeedback(d)).toBe("Bar 2, 4: you have 5 (sol); the melody has 1 (do).");
    // The line is named by the producer (a bass track says "the bass has"); a stored finding without it reads
    // "the melody".
    expect(renderFeedback({ ...d, params: { ...d.params, line: "bass" } })).toBe(
      "Bar 2, 4: you have 5 (sol); the bass has 1 (do).",
    );
  });
  test("sorted by severity, then bar, then beat; top three plus 'n more'", () => {
    const ds = [
      diag("pass.close", { n: 1 }),
      diag("rhythm.extra", { role: "" }, { bar: 2, beat: 1, beatLabel: "1" }),
      diag("melody.octave", { dir: "higher" }, { bar: 1, beat: 3, beatLabel: "3" }),
      diag("rhythm.missing", { role: "" }, { bar: 1, beat: 2, beatLabel: "2" }),
      diag("rhythm.missing", { role: "" }, { bar: 1, beat: 1, beatLabel: "1" }),
    ];
    expect(sortDiagnostics(ds).map((d) => `${d.id}@${d.where?.bar ?? "-"}.${d.where?.beat ?? "-"}`)).toEqual([
      "rhythm.missing@1.1",
      "rhythm.missing@1.2",
      "rhythm.extra@2.1",
      "melody.octave@1.3",
      "pass.close@-.-",
    ]);
    const m = messagesOf(ds);
    expect(m.length).toBe(4);
    expect(m[3]?.text).toBe("2 more");
  });
  test("messagesOf says an identical finding once (an `all` matcher's members both report it)", () => {
    const m = messagesOf([
      diag("rhythm.pickup-missing"),
      diag("rhythm.pickup-missing"),
      diag("rhythm.missing"),
    ]);
    expect(m).toHaveLength(2);
    expect(m.filter((x) => x.id === "rhythm.pickup-missing")).toHaveLength(1);
  });
  test("unknownCodes flags codes outside the catalog", () => {
    expect(
      unknownCodes([diag("rhythm.missing"), { id: "rhythm.nope", severity: "info", params: {} }]),
    ).toEqual(["rhythm.nope"]);
  });
});
