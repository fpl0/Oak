// Shared bits of the Wave 5 sing specs: the fake-microphone takes are written before Chromium starts (it reads the
// WAV at launch), and the sing tolerance the course uses (the learner's rung, per-note octave folding).
import { execFileSync } from "node:child_process";

/** Writes .generated/sing-blues.wav and sing-minor.wav (make-fixtures-w5.bun.ts). */
export function writeSingFixtures(): void {
  execFileSync("bun", [`${import.meta.dirname}/make-fixtures-w5.bun.ts`], { stdio: "ignore" });
}

export const SING_TOL = {
  cents: "learner" as const,
  octave: "per-note" as const,
  driftCompCents: 0,
  minCoverage: 0.4,
  passHitRate: 0.8,
};
