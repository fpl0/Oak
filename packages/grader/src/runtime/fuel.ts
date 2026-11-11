// Fuel: a deterministic work budget for one request. Every Strudel query is made of Fraction arithmetic,
// so metering fraction.js' prototype aborts a runaway pattern from INSIDE the query, before it allocates.
// Measured in spike S1: counting haps after the query is no defence (`s("bd*1000000")` builds 1M haps,
// about 4 s and 3.9 GB, before the first count); a normal lesson spends 40 to 55 fuel per event.
import { core } from "./strudel.ts";

const METERED = ["add", "sub", "mul", "div", "floor", "compare", "equals"] as const;

export const FUEL = { used: 0, limit: Number.POSITIVE_INFINITY, exceeded: false };

export class FuelExhausted extends Error {
  constructor() {
    super("oak: work budget exhausted");
    this.name = "FuelExhausted";
  }
}

let installed = false;

/** Wraps the metered Fraction methods once per realm. Idle cost: one increment and one compare per call. */
export function installFuel(): void {
  if (installed) return;
  installed = true;
  const proto = Object.getPrototypeOf(core.Fraction(0)) as Record<string, unknown>;
  for (const name of METERED) {
    const original = proto[name];
    if (typeof original !== "function") continue;
    proto[name] = function (this: unknown, a: unknown, b: unknown) {
      if (++FUEL.used > FUEL.limit) {
        // Sticky: Strudel catches errors in a few places (tonal's try/catch → silence); the flag still tells.
        FUEL.exceeded = true;
        throw new FuelExhausted();
      }
      return (original as (...args: unknown[]) => unknown).call(this, a, b);
    };
  }
}

export function startFuel(limit: number): void {
  FUEL.used = 0;
  FUEL.exceeded = false;
  FUEL.limit = limit;
}

export function stopFuel(): void {
  FUEL.limit = Number.POSITIVE_INFINITY;
}
