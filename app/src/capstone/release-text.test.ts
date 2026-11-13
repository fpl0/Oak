// Review: a release whose answer was lost read "capstones.release: HTTP 502", and an upload that failed put
// "album.putAudio: HTTP 500" on the ceremony. The learner reads what happened and what to do instead.
import { describe, expect, test } from "bun:test";
import { OakApiError } from "@oak/api";
import { audioErrorText, releaseErrorText } from "./release-text.ts";

describe("release error text", () => {
  test("no endpoint names or status codes reach the learner", () => {
    const bad = new OakApiError("capstones.release", 502, "internal", "capstones.release: HTTP 502");
    const text = releaseErrorText(bad, true);
    expect(text).toBe("The album couldn't be saved just now. Your take is kept: press Release to try again.");
    expect(text).not.toContain("capstones.release");
    expect(text).not.toContain("502");
  });
  test("the server unreachable, with and without a take", () => {
    const off = new OakApiError(
      "capstones.release",
      0,
      "network",
      "capstones.release: the Oak server could not be reached",
    );
    expect(releaseErrorText(off, true)).toBe(
      "The Oak server didn't answer, so the track isn't on the album yet. Your take is kept: press Release to try again.",
    );
    expect(releaseErrorText(off, false)).toContain("Nothing was lost: try the release again.");
  });
  test("a refusal the server explains is read out as a sentence", () => {
    const refused = new OakApiError(
      "capstones.release",
      409,
      "conflict",
      "every required rule of the brief has to pass before release; run the check first",
    );
    expect(releaseErrorText(refused, true)).toBe(
      "Every required rule of the brief has to pass before release; run the check first.",
    );
    const invalid = new OakApiError("capstones.release", 400, "bad_request", "invalid body");
    expect(releaseErrorText(invalid, false)).toBe(
      "The album couldn't be saved just now. Nothing was lost: try the release again.",
    );
  });
  test("the recording upload", () => {
    expect(
      audioErrorText(new OakApiError("album.putAudio", 500, "internal", "album.putAudio: HTTP 500")),
    ).toBe("The recording couldn't be saved just now.");
    expect(audioErrorText(new OakApiError("album.putAudio", 413, "payload_too_large", "too large"))).toBe(
      "The recording couldn't be saved: it is larger than the album accepts.",
    );
    expect(audioErrorText(new TypeError("Failed to fetch"))).toBe("The recording couldn't be saved.");
  });
});
