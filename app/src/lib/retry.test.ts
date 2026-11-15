// The retry policy's client rules (docs/design/retry.md §2–§3): the one label, the one key and the line each kind
// of surface shows, and where the focus lands when a result appears.
import { describe, expect, test } from "bun:test";
import { chordOf, createKeymap, expandChord, formatKeys, type KeyContext } from "../ui/keys/keymap.ts";
import { CORE_SECTIONS } from "../ui/keys/sheet.ts";
import {
  CHECKPOINT_LINE,
  MEASURE_LINE,
  PRACTICE_LINE,
  RETRY_KEYS,
  RETRY_LABEL,
  REVEALED_LINE,
  type RetrySurface,
  resultFocusTarget,
  retryCount,
  retryLine,
} from "./retry.ts";

describe("what a retry counts for", () => {
  const judged: RetrySurface[] = [
    "lesson-step",
    "predict",
    "drill-trial",
    "sung-resolution",
    "fact-card",
    "first-sing",
    "capstone-check",
    "ladder-item",
  ];

  test("before anything counted, a take counts as usual and shows no line", () => {
    for (const surface of judged) {
      expect([surface, retryCount({ surface, counted: false })]).toEqual([surface, "counts"]);
      expect([surface, retryLine({ surface, counted: false })]).toEqual([surface, null]);
    }
  });

  test("once a result counts, every further take is practice and says so", () => {
    for (const surface of judged) {
      expect([surface, retryCount({ surface, counted: true })]).toEqual([surface, "practice"]);
      expect([surface, retryLine({ surface, counted: true })]).toEqual([surface, PRACTICE_LINE]);
    }
  });

  test("after a reveal a lesson check can finish the step but never counts as known", () => {
    expect(retryLine({ surface: "lesson-step", counted: false, revealed: true })).toBe(REVEALED_LINE);
    // Once the step passed, the practice line wins.
    expect(retryLine({ surface: "lesson-step", counted: true, revealed: true })).toBe(PRACTICE_LINE);
  });

  test("a checkpoint item replaces its saved answer and says the last one counts", () => {
    for (const counted of [false, true]) {
      expect(retryCount({ surface: "checkpoint-item", counted })).toBe("replaces");
      expect(retryLine({ surface: "checkpoint-item", counted })).toBe(CHECKPOINT_LINE);
    }
  });

  test("a set-up measurement is replaced only by one that works", () => {
    expect(retryCount({ surface: "measurement", counted: true })).toBe("replaces");
    expect(retryLine({ surface: "measurement", counted: true })).toBe(MEASURE_LINE);
    expect(retryLine({ surface: "measurement", counted: false })).toBeNull();
  });

  test("the lines are calm sentences, never a shaming word", () => {
    for (const line of [PRACTICE_LINE, REVEALED_LINE, CHECKPOINT_LINE, MEASURE_LINE]) {
      expect(line).toMatch(/^[A-Z].*\.$/);
      expect(line).not.toMatch(/!|wrong|fail|penal/i);
    }
  });
});

describe("where the focus lands on a result", () => {
  test("on Continue when it is open, on Try again when Continue is held, never out of the editor", () => {
    expect(resultFocusTarget({ continueEnabled: true, retryEnabled: true, inEditor: false })).toBe(
      "continue",
    );
    expect(resultFocusTarget({ continueEnabled: false, retryEnabled: true, inEditor: false })).toBe("retry");
    expect(resultFocusTarget({ continueEnabled: true, retryEnabled: true, inEditor: true })).toBe("stay");
    expect(resultFocusTarget({ continueEnabled: false, retryEnabled: false, inEditor: false })).toBe("stay");
  });
});

describe("the one key", () => {
  const ctx: KeyContext = {
    chain: ["editor", "global"],
    inEditable: true,
    onControl: false,
    focusRoute: true,
    isMac: true,
    macCtrl: false,
  };

  test("Alt+R is read from the physical key (macOS types ® with Option) and shows as ⌥R / Alt+R", () => {
    expect(RETRY_KEYS).toBe("Alt+R");
    expect(RETRY_LABEL).toBe("Try again");
    expect(
      chordOf({ key: "®", code: "KeyR", altKey: true, ctrlKey: false, metaKey: false, shiftKey: false }),
    ).toBe("alt+r");
    expect(expandChord(RETRY_KEYS, true, false)).toEqual(["alt+r"]);
    expect(formatKeys(RETRY_KEYS, true)).toBe("⌥R");
    expect(formatKeys(RETRY_KEYS, false)).toBe("Alt+R");
  });

  test("a binding allowed in inputs fires from the editor; plain R (the workbench's roll) is not it", () => {
    const km = createKeymap();
    let tries = 0;
    km.register([
      {
        id: "result.retry",
        keys: RETRY_KEYS,
        scope: "global",
        description: "Try again",
        allowInInput: true,
        run: () => {
          tries += 1;
        },
      },
    ]);
    const r = { key: "®", code: "KeyR", altKey: true, ctrlKey: false, metaKey: false, shiftKey: false };
    expect(km.handle(r, ctx)).not.toBeNull();
    expect(km.handle({ ...r, key: "r", altKey: false }, ctx)).toBeNull();
    expect(tries).toBe(1);
  });

  test("the shortcut sheet lists it once, and no other sheet row uses Alt+R", () => {
    const rows = CORE_SECTIONS.flatMap((s) => s.rows.map(([k, d]) => ({ section: s.id, k, d })));
    expect(rows.filter((r) => r.k === RETRY_KEYS).map((r) => r.section)).toEqual(["answers"]);
  });
});
