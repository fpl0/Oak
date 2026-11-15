import { expect, test } from "bun:test";
import { orderedMix } from "./mix.ts";

/** A small graph double checks routing and disconnect semantics, not Web Audio's DSP. */
class Node {
  static all: Node[] = [];
  edges: { target: Node; output: number; input: number }[] = [];
  constructor(
    readonly context: object,
    readonly value = 0,
  ) {
    Node.all.push(this);
  }
  connect(target: Node, output = 0, input = 0) {
    if (!this.edges.some((e) => e.target === target && e.output === output && e.input === input))
      this.edges.push({ target, output, input });
    return target;
  }
  disconnect(target?: Node | number, output?: number, input?: number) {
    const before = this.edges.length;
    this.edges = this.edges.filter(
      (e) =>
        !(
          target === undefined ||
          (typeof target === "number"
            ? e.output === target
            : e.target === target &&
              (output === undefined || output === e.output) &&
              (input === undefined || input === e.input))
        ),
    );
    if (target instanceof Node && before === this.edges.length) throw new Error("not connected");
  }
}

function sum(node: Node, input = 0): number {
  return Node.all.reduce(
    (value, source) =>
      Math.fround(
        value +
          source.edges
            .filter((e) => e.target === node && e.input === input)
            .reduce((n) => Math.fround(n + sum(source)), 0),
      ),
    node.value,
  );
}

test("ordered sums preserve ports, duplicate connects, disconnects and reused sources", () => {
  const names = ["AudioNode", "AudioParam", "GainNode"] as const;
  const previous = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  const globals = {
    AudioNode: Node,
    AudioParam: class {},
    GainNode: class extends Node {
      constructor(ctx: object) {
        super(ctx);
      }
    },
  };
  for (const name of names)
    Object.defineProperty(globalThis, name, { value: globals[name], configurable: true, writable: true });
  Node.all = [];
  const ctx = {};
  const mix = orderedMix(ctx as OfflineAudioContext);
  try {
    const a = new Node(ctx, 1),
      b = new Node(ctx, 2),
      c = new Node(ctx, 4),
      d = new Node(ctx, 8);
    const master = new Node(ctx);
    a.connect(master);
    b.connect(master);
    c.connect(master);
    a.connect(master); // Not another voice.
    d.connect(master, 0, 1);
    mix.flush();
    expect(sum(master)).toBe(7);
    expect(sum(master, 1)).toBe(8);
    for (const target of Node.all)
      expect(
        Node.all.flatMap((s) => s.edges).filter((e) => e.target === target && e.input === 0).length,
      ).toBeLessThanOrEqual(2);
    b.disconnect(master); // Still addresses the original destination, even though it now routes through a mixer.
    mix.flush();
    expect(sum(master)).toBe(5);
    b.connect(master);
    mix.flush();
    expect(sum(master)).toBe(7);
    a.disconnect();
    c.disconnect(0);
    mix.flush();
    expect(sum(master)).toBe(2);
    expect(sum(master, 1)).toBe(8);
    d.disconnect(master, 0, 1);
    mix.flush();
    expect(sum(master, 1)).toBe(0);
    const other = new Node({});
    b.connect(other);
    mix.flush();
    expect(sum(other)).toBe(2);
    // A finished voice may stay connected until onended arrives. Disconnecting that silent voice
    // must not change floating-point grouping of the remaining voices (a real Chromium regression).
    const target = new Node(ctx);
    const voices = [1e8, 0, -1e8, 1].map((value) => new Node(ctx, value));
    for (const voice of voices) voice.connect(target);
    mix.flush();
    expect(sum(target)).toBe(0);
    voices[1]?.disconnect(target);
    mix.flush();
    expect(sum(target)).toBe(0);
  } finally {
    mix.restore();
    for (const [i, name] of names.entries()) {
      const descriptor = previous[i];
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    Node.all = [];
  }
});
