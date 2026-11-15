/**
 * Web Audio leaves the addition order of three or more connections unspecified. Chromium can sum an
 * otherwise identical mix in different orders (one-ULP differences). Balanced binary sums fix the
 * grouping without quantizing the PCM. Routing changes happen only while the context is suspended.
 * Keep the logical connections so superdough's disconnects and node pools retain their normal meaning.
 */
export function orderedMix(ctx: OfflineAudioContext): { flush(): void; restore(): void } {
  const nativeConnect = AudioNode.prototype.connect;
  const nativeDisconnect = AudioNode.prototype.disconnect;
  interface Edge {
    source: AudioNode;
    output: number;
    target: AudioNode;
    input: number;
    route: AudioNode;
    port: number;
    active: boolean;
  }
  interface Input {
    edges: Edge[];
    mixers: GainNode[];
  }
  const inputs = new Map<AudioNode, Map<number, Input>>();
  const outputs = new Map<AudioNode, Set<Edge>>();
  // Pools hold WeakRefs. GC must not decide whether this render reuses a node and changes graph order.
  const retained = new Set<AudioNode>();
  const connect = (source: AudioNode, target: AudioNode, output = 0, input = 0) =>
    Reflect.apply(nativeConnect, source, [target, output, input]) as AudioNode;
  const disconnect = (source: AudioNode, target: AudioNode, output: number, input: number) =>
    Reflect.apply(nativeDisconnect, source, [target, output, input]);
  AudioNode.prototype.connect = function (
    this: AudioNode,
    target: AudioNode | AudioParam,
    output: number = 0,
    input: number = 0,
  ) {
    if (this.context !== ctx || !(target instanceof AudioNode))
      return Reflect.apply(
        nativeConnect,
        this,
        target instanceof AudioNode ? [target, output, input] : [target, output],
      );
    const sent = outputs.get(this) ?? new Set<Edge>();
    const existing = [...sent].find((e) => e.target === target && e.input === input && e.output === output);
    if (existing) return target; // Web Audio deduplicates identical connections.
    const ports = inputs.get(target) ?? new Map<number, Input>();
    const port = ports.get(input) ?? { edges: [], mixers: [] };
    const edge: Edge = { source: this, target, output, input, route: target, port: input, active: true };
    connect(this, target, output, input);
    port.edges.push(edge);
    ports.set(input, port);
    inputs.set(target, ports);
    sent.add(edge);
    outputs.set(this, sent);
    retained.add(this);
    retained.add(target);
    return target;
  } as typeof nativeConnect;
  AudioNode.prototype.disconnect = function (this: AudioNode, ...args: unknown[]) {
    if (this.context !== ctx || args[0] instanceof AudioParam)
      return Reflect.apply(nativeDisconnect, this, args);
    const sent = outputs.get(this);
    const target = args[0];
    const selected = [...(sent ?? [])].filter(
      (e) =>
        args.length === 0 ||
        (typeof target === "number"
          ? e.output === target
          : e.target === target &&
            (args[1] === undefined || e.output === args[1]) &&
            (args[2] === undefined || e.input === args[2])),
    );
    if (selected.length === 0) return Reflect.apply(nativeDisconnect, this, args);
    for (const edge of selected) {
      disconnect(this, edge.route, edge.output, edge.port);
      sent?.delete(edge);
      // Leave a silent slot. Removing it would regroup the still-ringing voices depending on when
      // the browser delivered onended, which itself is not sample-clock deterministic.
      edge.active = false;
    }
    // Also disconnect AudioParam connections, which are passed through without routing.
    if (args.length === 0 || typeof target === "number") Reflect.apply(nativeDisconnect, this, args);
  } as typeof nativeDisconnect;
  return {
    restore() {
      AudioNode.prototype.connect = nativeConnect;
      AudioNode.prototype.disconnect = nativeDisconnect;
      inputs.clear();
      outputs.clear();
      retained.clear();
    },
    flush() {
      for (const [target, ports] of inputs)
        for (const [input, port] of ports) {
          const active = port.edges.filter((edge) => edge.active);
          if (active.length < 3 && port.mixers.length === 0) continue;
          for (const edge of active) disconnect(edge.source, edge.route, edge.output, edge.port);
          for (const mixer of port.mixers) Reflect.apply(nativeDisconnect, mixer, []);
          port.mixers = [];
          if (active.length < 3) {
            for (const edge of active) {
              connect(edge.source, target, edge.output, input);
              edge.route = target;
              edge.port = input;
            }
            continue;
          }
          type Branch = { source: AudioNode; output: number; edge?: Edge };
          let level: (Branch | null)[] = port.edges.map((edge) =>
            edge.active
              ? {
                  source: edge.source,
                  output: edge.output,
                  edge,
                }
              : null,
          );
          const route = (branch: Branch, destination: AudioNode, destinationInput = 0) => {
            connect(branch.source, destination, branch.output, destinationInput);
            if (branch.edge) {
              branch.edge.route = destination;
              branch.edge.port = destinationInput;
            }
          };
          while (level.length > 1) {
            const next: (Branch | null)[] = [];
            for (let i = 0; i < level.length; i += 2) {
              const left = level[i];
              const right = level[i + 1];
              if (!left || !right) {
                next.push(left ?? right ?? null);
                continue;
              }
              const sum = new GainNode(ctx, { gain: 1 });
              port.mixers.push(sum);
              route(left, sum);
              route(right, sum);
              next.push({ source: sum, output: 0 });
            }
            level = next;
          }
          const root = level[0];
          if (root) route(root, target, input);
        }
    },
  };
}
