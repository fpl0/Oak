import { afterEach, describe, expect, test } from "bun:test";
import { TRANSCRIBE_KEYS } from "../../transcribe/keys.ts";
import {
  CORE_SECTIONS,
  formatSheetKeys,
  registerShortcutSection,
  sheetSections,
  useSheetSections,
} from "./sheet.ts";

afterEach(() => useSheetSections.setState({ sections: [] }));

describe("shortcut sheet sections", () => {
  test("the core sections come in order, the tutor composer last", () => {
    expect(sheetSections([]).map((s) => s.id)).toEqual([
      "editor",
      "workbench",
      "answers",
      "staff-input",
      "keys-intervals",
      "harmony",
      "transcribe",
      "tutor",
    ]);
    expect(CORE_SECTIONS.find((s) => s.id === "workbench")?.rows.some(([k]) => k === "L")).toBe(true);
  });

  test("every Wave 3 key is listed: the lens bar and panels, staff input, key signatures, intervals", () => {
    const rows = (id: string) => CORE_SECTIONS.find((s) => s.id === id)?.rows.map(([k]) => k) ?? [];
    expect(rows("workbench")).toEqual(expect.arrayContaining(["D", "S", "Shift+N", "Shift+K", "Shift+C"]));
    expect(rows("staff-input")).toEqual(
      expect.arrayContaining([
        "C",
        "ArrowRight",
        "Shift+ArrowUp",
        "Mod+ArrowUp",
        "#",
        "-",
        "=",
        ".",
        "0",
        "4",
      ]),
    );
    expect(rows("keys-intervals")).toEqual(expect.arrayContaining(["#", ".", "3", "Shift+M", "Backspace"]));
    // No section lists the same keys twice with different meanings.
    for (const s of CORE_SECTIONS)
      expect([s.id, new Set(s.rows.map(([k, d]) => `${k}|${d}`)).size]).toEqual([s.id, s.rows.length]);
  });

  test("an area registers its own keys; the same id replaces; unregistering removes it", () => {
    const off = registerShortcutSection({
      id: "staff-input",
      title: "Staff input",
      order: 35,
      rows: [
        ["C", "Pitch letter"],
        ["ArrowUp", "Up a step"],
      ],
    });
    let ids = sheetSections(useSheetSections.getState().sections).map((s) => s.id);
    // The registered section replaces the core one of the same id, at its own order (35: after 34).
    expect(ids).toEqual([
      "editor",
      "workbench",
      "answers",
      "keys-intervals",
      "staff-input",
      "harmony",
      "transcribe",
      "tutor",
    ]);
    registerShortcutSection({ id: "staff-input", title: "Staff input", order: 35, rows: [["0", "Rest"]] });
    expect(useSheetSections.getState().sections).toHaveLength(1);
    expect(
      sheetSections(useSheetSections.getState().sections).find((s) => s.id === "staff-input")?.rows,
    ).toEqual([["0", "Rest"]]);
    off(); // the replaced registration's remover leaves the newer one alone
    expect(useSheetSections.getState().sections).toHaveLength(1);
    ids = sheetSections([{ id: "editor", title: "Editor", rows: [["Mod+Enter", "Run"]], order: 10 }]).map(
      (s) => s.id,
    );
    expect(ids[0]).toBe("editor");
    expect(
      sheetSections([{ id: "editor", title: "Editor", rows: [["Mod+Enter", "Run"]], order: 10 }])[0]?.rows,
    ).toHaveLength(1);
  });

  test("a row a live page group already lists is not repeated; an emptied section is dropped", () => {
    const live = new Set([
      "Enter|Send",
      "Shift+Enter|New line",
      "Escape|Stop the answer",
      "ArrowUp|Recall your last message (empty composer)",
    ]);
    expect(sheetSections([], live).map((s) => s.id)).toEqual([
      "editor",
      "workbench",
      "answers",
      "staff-input",
      "keys-intervals",
      "harmony",
      "transcribe",
    ]);
  });

  test("Wave 4: every Transcribe key and the harmony answers' keys are listed from any page", () => {
    const rows = (id: string) => CORE_SECTIONS.find((s) => s.id === id)?.rows ?? [];
    expect(rows("transcribe").map(([k]) => k)).toEqual(TRANSCRIBE_KEYS.map((k) => k.keys));
    expect(rows("harmony").map(([k]) => k)).toEqual(
      expect.arrayContaining(["M", "I", "Shift+5", "-", "P", "Backspace", "ArrowRight"]),
    );
    // A live Transcribe page group lists the same rows: the static copy steps aside.
    const live = new Set(TRANSCRIBE_KEYS.map((k) => `${k.keys}|${k.description}`));
    expect(sheetSections([], live).some((s) => s.id === "transcribe")).toBe(false);
  });

  test("rows that list several keys are shown as keys, sequences as sequences", () => {
    expect(formatSheetKeys("G T", false)).toBe("G then T");
    expect(formatSheetKeys("Mod+Enter", false)).toBe("Ctrl+Enter");
    expect(formatSheetKeys("A B C D E F G", false)).toBe("A B C D E F G");
    expect(formatSheetKeys("ArrowRight / ArrowLeft", false)).toBe("→ / ←");
    expect(formatSheetKeys("Shift+A … Shift+G", true)).toBe("⇧A … ⇧G");
  });
});
