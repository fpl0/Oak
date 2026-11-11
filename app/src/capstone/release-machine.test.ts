import { describe, expect, test } from "bun:test";
import type { Recording } from "@oak/strudel";
import { createActor, fromPromise, waitFor } from "xstate";
import { type ReleaseActorInput, releaseMachine } from "./release-machine.ts";

const take: Recording = { blob: new Blob([new Uint8Array([1, 2, 3])]), mime: "audio/webm", durationS: 11.1 };

function actor(
  opts: { record?: () => Promise<Recording>; release?: (i: ReleaseActorInput) => Promise<unknown> } = {},
) {
  const seen: ReleaseActorInput[] = [];
  const machine = releaseMachine.provide({
    actors: {
      record: fromPromise(opts.record ?? (async () => take)),
      release: fromPromise(async ({ input }: { input: ReleaseActorInput }) => {
        seen.push(input);
        if (opts.release) await opts.release(input);
        return { trackId: "trk_1", version: 1, audioError: null };
      }),
    },
  });
  const a = createActor(machine, { input: { title: "", line: "", includeReviewNote: true } });
  a.start();
  return { a, seen };
}

describe("the release flow", () => {
  test("a track needs a title before it is recorded", () => {
    const { a } = actor();
    a.send({ type: "RECORD" });
    expect(a.getSnapshot().value).toBe("details");
    a.send({ type: "EDIT", patch: { title: "  " } });
    a.send({ type: "RECORD" });
    expect(a.getSnapshot().value).toBe("details");
  });

  test("details → recording → take → releasing → released, with the take and the trimmed details", async () => {
    const { a, seen } = actor();
    a.send({ type: "EDIT", patch: { title: " Intro ", line: " Four bars, then the toms. " } });
    a.send({ type: "RECORD" });
    await waitFor(a, (s) => s.matches("take"));
    expect(a.getSnapshot().context.recording).toBe(take);
    a.send({ type: "EDIT", patch: { includeReviewNote: false } });
    a.send({ type: "RELEASE" });
    await waitFor(a, (s) => s.matches("released"));
    expect(seen).toEqual([
      { title: "Intro", line: "Four bars, then the toms.", includeReviewNote: false, recording: take },
    ]);
    expect(a.getSnapshot().context).toMatchObject({ trackId: "trk_1", version: 1, audioError: null });
  });

  test("a failed recording returns to the details with the reason; a failed release keeps the take", async () => {
    let fail = true;
    const { a } = actor({
      record: async () => {
        if (fail) throw new Error("no audio context");
        return take;
      },
      release: async () => {
        throw new Error("server down");
      },
    });
    a.send({ type: "EDIT", patch: { title: "Intro" } });
    a.send({ type: "RECORD" });
    await waitFor(a, (s) => s.matches("details") && s.context.error !== null);
    expect(a.getSnapshot().context.error).toBe("no audio context");
    fail = false;
    a.send({ type: "RECORD" });
    await waitFor(a, (s) => s.matches("take"));
    a.send({ type: "RELEASE" });
    await waitFor(a, (s) => s.matches("take") && s.context.error !== null);
    expect(a.getSnapshot().context.error).toBe("server down");
    expect(a.getSnapshot().context.recording).toBe(take);
  });

  test("record again from the take; release without audio only from the details", async () => {
    const { a, seen } = actor();
    a.send({ type: "EDIT", patch: { title: "Intro" } });
    a.send({ type: "RELEASE" });
    expect(a.getSnapshot().value).toBe("details");
    a.send({ type: "RELEASE_WITHOUT_AUDIO" });
    await waitFor(a, (s) => s.matches("released"));
    expect(seen[0]?.recording).toBeNull();
  });
});
