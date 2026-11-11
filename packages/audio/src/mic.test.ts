import { describe, expect, test } from "bun:test";
import { FakeContext, FakeStream, FakeWorkletNode } from "./fakes.test-data.ts";
import { bindMicShortcut, createMicGraphWith, micConstraints, PITCH_PROCESSOR } from "./mic.ts";
import { MicError, type MicState } from "./types.ts";

function setup(over: { getUserMedia?: () => Promise<MediaStream>; createNodeThrowsFor0?: boolean } = {}) {
  const ctx = new FakeContext();
  const nodes: FakeWorkletNode[] = [];
  const streams: FakeStream[] = [];
  const graph = createMicGraphWith(ctx as unknown as AudioContext, {
    workletUrl: "/pitch.worklet.js",
    mediaDevices: {
      getUserMedia:
        over.getUserMedia ??
        (async () => {
          const s = new FakeStream();
          streams.push(s);
          return s as unknown as MediaStream;
        }),
    },
    createNode: (_c, name, options) => {
      if (over.createNodeThrowsFor0 && options.numberOfOutputs === 0) throw new Error("no output-less nodes");
      const n = new FakeWorkletNode(name, options);
      nodes.push(n);
      return n as unknown as AudioWorkletNode;
    },
  });
  const states: MicState[] = [];
  graph.subscribe((s) => states.push(s));
  return { ctx, graph, nodes, streams, states };
}

test("constraints: echo cancellation, noise suppression and AGC off, mono, exact device", () => {
  expect(micConstraints("abc")).toEqual({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
      deviceId: { exact: "abc" },
    },
    video: false,
  });
});

describe("MicGraph", () => {
  test("prepare loads the module once and creates ONE output-less node with the proven options", async () => {
    const { ctx, graph, nodes } = setup();
    await graph.prepare();
    await graph.prepare();
    expect(ctx.modules).toEqual(["/pitch.worklet.js"]);
    expect(nodes.length).toBe(1);
    expect(nodes[0]?.name).toBe(PITCH_PROCESSOR);
    expect(nodes[0]?.options).toMatchObject({
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 1,
      channelCountMode: "explicit",
      processorOptions: { warmUp: 8 },
    });
    expect(graph.outputs).toBe(0);
  });

  test("the spare path: output → GainNode(0) → destination when an output-less node cannot be made", async () => {
    const { ctx, graph, nodes } = setup({ createNodeThrowsFor0: true });
    await graph.prepare();
    expect(graph.outputs).toBe(1);
    expect(nodes[0]?.options.numberOfOutputs).toBe(1);
    expect(ctx.gains[0]?.gain.value).toBe(0);
    expect(ctx.gains[0]?.connected).toContain(ctx.destination);
  });

  test("a failed module load is not memoized", async () => {
    const { ctx, graph } = setup();
    ctx.failModule = true;
    await expect(graph.prepare()).rejects.toMatchObject({ reason: "worklet" });
    ctx.failModule = false;
    await graph.prepare();
    expect(ctx.modules.length).toBe(1);
  });

  test("open → live; frames reach the session; close stops tracks, disconnects, back to closed", async () => {
    const { ctx, graph, nodes, streams, states } = setup();
    ctx.currentTime = 5;
    const s = await graph.open();
    expect(graph.state).toBe("live");
    expect(states).toEqual(["closed", "opening", "live"]);
    const port = nodes[0]?.port;
    const got: number[] = [];
    s.onFrame((f) => got.push(f.t));
    port?.emit({ t: 4.5, hz: 440, clarity: 1, rms: 0.1 }); // before the session: stale, dropped
    port?.emit({ t: 5.05, hz: 440, clarity: 1, rms: 0.1 });
    port?.emit({ type: "pong" });
    expect(got).toEqual([5.05]);
    expect(s.frames().length).toBe(1);
    expect(s.levelDb()).toBeCloseTo(-20, 6);
    expect(s.deviceId).toBe("mic-1");
    expect(ctx.sources[0]?.connected).toContain(nodes[0]);
    s.close();
    expect(streams[0]?.tracks[0]?.stopped).toBe(true);
    expect(ctx.sources[0]?.connected).toEqual([]);
    expect(graph.state).toBe("closed");
    // The node stays for the next session.
    await graph.open();
    expect(nodes.length).toBe(1);
  });

  test("a second open closes the first session; closeAll closes; an ended track closes", async () => {
    const { graph, streams } = setup();
    const a = await graph.open();
    const b = await graph.open();
    expect(streams[0]?.tracks[0]?.stopped).toBe(true);
    expect(graph.state).toBe("live");
    graph.closeAll();
    expect(graph.state).toBe("closed");
    const c = await graph.open();
    streams[2]?.tracks[0]?.end();
    expect(graph.state).toBe("closed");
    expect([a, b, c].length).toBe(3);
  });

  test("permission denied and no device are reported as MicError and as state", async () => {
    const denied = setup({
      getUserMedia: async () => {
        throw Object.assign(new Error("x"), { name: "NotAllowedError" });
      },
    });
    const err = await denied.graph.open().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MicError);
    expect((err as MicError).reason).toBe("denied");
    expect(denied.graph.state).toBe("denied");
    const none = setup({
      getUserMedia: async () => {
        throw Object.assign(new Error("x"), { name: "NotFoundError" });
      },
    });
    await expect(none.graph.open()).rejects.toMatchObject({ reason: "no-device" });
    expect(none.graph.state).toBe("unavailable");
  });

  test("a suspended context is resumed first", async () => {
    const { ctx, graph } = setup();
    ctx.state = "suspended";
    await graph.open();
    expect(ctx.state as AudioContextState).toBe("running");
  });

  test("dispose tells the processor to stop and refuses further use", async () => {
    const { graph, nodes } = setup();
    await graph.open();
    graph.dispose();
    expect(nodes[0]?.port.sent).toContainEqual({ type: "dispose" });
    expect(graph.state).toBe("closed");
    await expect(graph.open()).rejects.toBeInstanceOf(MicError);
  });

  test("Cmd/Ctrl+Shift+M closes the mic", () => {
    let closed = 0;
    const target = new EventTarget();
    const off = bindMicShortcut({ closeAll: () => closed++ }, target);
    const key = (o: Record<string, unknown>) =>
      target.dispatchEvent(Object.assign(new Event("keydown"), { preventDefault() {}, ...o }));
    key({ key: "M", metaKey: true, shiftKey: true, ctrlKey: false });
    key({ key: "m", metaKey: false, shiftKey: true, ctrlKey: true });
    key({ key: "m", metaKey: true, shiftKey: false, ctrlKey: false });
    expect(closed).toBe(2);
    off();
    key({ key: "m", metaKey: true, shiftKey: true, ctrlKey: false });
    expect(closed).toBe(2);
  });
});
