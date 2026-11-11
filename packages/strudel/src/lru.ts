// The live-mirror budget: at most `max` StrudelMirrors exist; the least recently used one that may be
// evicted is disposed when a new one is mounted (architecture §2.1 "Live mirror budget").

export class LiveBudget<K> {
  readonly max: number;
  /** Least recently used first. */
  #order: K[] = [];
  constructor(max: number) {
    if (!Number.isInteger(max) || max < 1) throw new RangeError(`LiveBudget: max must be ≥ 1, got ${max}`);
    this.max = max;
  }
  /** Marks `key` as the most recently used (adds it when new). */
  touch(key: K): void {
    const i = this.#order.indexOf(key);
    if (i >= 0) this.#order.splice(i, 1);
    this.#order.push(key);
  }
  delete(key: K): void {
    const i = this.#order.indexOf(key);
    if (i >= 0) this.#order.splice(i, 1);
  }
  has(key: K): boolean {
    return this.#order.includes(key);
  }
  get size(): number {
    return this.#order.length;
  }
  /** Least recently used first. */
  keys(): K[] {
    return [...this.#order];
  }
  /**
   * Keys to dispose so that one more fits: least recently used first, skipping the protected ones (a
   * playing or focused editor is never evicted). May return fewer than needed when everything is protected.
   */
  overflow(isProtected: (key: K) => boolean = () => false, incoming = 1): K[] {
    const excess = this.#order.length + incoming - this.max;
    if (excess <= 0) return [];
    const out: K[] = [];
    for (const key of this.#order) {
      if (out.length >= excess) break;
      if (!isProtected(key)) out.push(key);
    }
    return out;
  }
}
