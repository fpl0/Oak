import { describe, expect, test } from "bun:test";
import { ALBUM_TITLE_MAX, cleanAlbumTitle, DEFAULT_ALBUM_TITLE } from "./title.ts";

describe("album title", () => {
  test("a typed name is trimmed, collapsed and capped; empty goes back to the default", () => {
    expect(DEFAULT_ALBUM_TITLE).toBe("Oak Sessions");
    expect(cleanAlbumTitle("  Night   Loops ")).toBe("Night Loops");
    expect(cleanAlbumTitle("   ")).toBeNull();
    expect(cleanAlbumTitle("x".repeat(80))?.length).toBe(ALBUM_TITLE_MAX);
    expect(cleanAlbumTitle("a\nb")).toBe("a b");
  });
});

describe("album title: control characters", () => {
  test("characters the server refuses become spaces", () => {
    expect(cleanAlbumTitle("Night\u0000Loops")).toBe("Night Loops");
    expect(cleanAlbumTitle("\u0007")).toBeNull();
  });
});

describe("album title: emoji at the cap", () => {
  test("the cap never leaves half an emoji (a lone surrogate) at the end", () => {
    const t = cleanAlbumTitle(`${"x".repeat(ALBUM_TITLE_MAX - 1)}🌳🌳`);
    expect(t).toBe("x".repeat(ALBUM_TITLE_MAX - 1));
    expect(cleanAlbumTitle(`${"x".repeat(ALBUM_TITLE_MAX - 2)}🌳`)).toBe(
      `${"x".repeat(ALBUM_TITLE_MAX - 2)}🌳`,
    );
  });
});
