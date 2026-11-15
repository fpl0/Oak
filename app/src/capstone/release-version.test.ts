// The release take goes on the track version whose draft was released (wave 7 closer): AC1's release puts both of
// its versions on one track (track v1 = version one, v2 = version two), and the take recorded of version one must
// not land on version two, which is the track's current version.
import { describe, expect, test } from "bun:test";
import { releasedVersionOf } from "./release-version.ts";

const v = (version: number, sketchId: string, sketchVersion: number) => ({
  version,
  sketchId,
  sketchVersion,
});

describe("releasedVersionOf", () => {
  test("AC1: version one's draft is track version 1 although version 2 is current", () => {
    const track = { currentVersion: 2, versions: [v(1, "sk_a", 1), v(2, "sk_a", 2)] } as never;
    expect(releasedVersionOf(track, "sk_a", 1)).toBe(1);
    expect(releasedVersionOf(track, "sk_a", 2)).toBe(2);
  });
  test("a revision released twice from the same draft: the newest version holding it", () => {
    const track = { currentVersion: 3, versions: [v(1, "sk", 4), v(2, "sk", 6), v(3, "sk", 6)] } as never;
    expect(releasedVersionOf(track, "sk", 6)).toBe(3);
  });
  test("a draft the track does not hold: the current version, as before", () => {
    const track = { currentVersion: 1, versions: [v(1, "sk", 1)] } as never;
    expect(releasedVersionOf(track, "other", 9)).toBe(1);
  });
});
