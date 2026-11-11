// The server's grader hosts (contracts §10.A, §11.4; interfaces §5):
//   learner  a `bun-worker` host for the learner's own code and `POST /api/grade`;
//   tutor    a `bun-subprocess` host for model-written code (tutor cards, review `tryCode`, the tutor's
//            evaluate_strudel / compare_haps): the only backend with memory isolation.
// Both start with `env: {}`, are initialised with the generated toolbox, and are disposed together.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type LintContext, schemas, type ToolEntry } from "@oak/content-kit";
import type { EvalOptions, GraderHost } from "@oak/grader";
import { createBunGraderHost } from "@oak/grader/host/bun";
import { z } from "zod";

export interface GraderHosts {
  /** The learner's own code: lesson steps, Make, capstones, Studio analysis, `POST /api/grade`. */
  learner: GraderHost;
  /** Code the learner did not type (model-written): evaluated in a separate process. */
  tutor: GraderHost;
  toolbox: readonly ToolEntry[];
  dispose(): Promise<void>;
}

export interface GraderHostsOptions {
  /** The unlock table. Default: `content/.generated/toolbox.json` under `contentDir`, or none. */
  toolbox?: readonly ToolEntry[];
  /** Where `.generated/toolbox.json` is read from (the server's `contentDir`). */
  contentDir?: string;
  /** Keep a warm spare realm per host (default true; tests turn it off). */
  spare?: boolean;
}

const ToolboxSchema = z.array(schemas.ToolEntrySchema);

/**
 * Reads `content/.generated/toolbox.json` (written by `bun run content:build`). A missing file is an
 * empty toolbox: the lint then skips its toolbox pass (no locked or uncatalogued findings). A malformed
 * file is a start-up error.
 */
export function loadToolbox(contentDir: string): ToolEntry[] {
  const path = join(contentDir, ".generated", "toolbox.json");
  if (!existsSync(path)) return [];
  const parsed = ToolboxSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
  if (!parsed.success) {
    throw new Error(
      `${path} does not match the ToolEntry schema: ${parsed.error.issues[0]?.message ?? "invalid"}`,
    );
  }
  return parsed.data;
}

export function createGraderHosts(options: GraderHostsOptions = {}): GraderHosts {
  // The API key never reaches a grader: `env: {}` on every backend, and the server deletes it from its
  // own environment at start-up (secrets.ts) before this runs.
  const toolbox = [...(options.toolbox ?? (options.contentDir ? loadToolbox(options.contentDir) : []))];
  const spare = options.spare ?? true;
  const learner = createBunGraderHost({ backend: "bun-worker", toolbox, spare });
  const tutor = createBunGraderHost({ backend: "bun-subprocess", toolbox, spare });
  return {
    learner,
    tutor,
    toolbox,
    async dispose() {
      await Promise.all([learner.dispose(), tutor.dispose()]);
    },
  };
}

/**
 * Options for evaluating model-written code (contracts §6.4 `tutor` mode, §11.3 strict profile): a
 * window of at most 16 bars from `fromBar`, 1500 ms, 5000 haps, and the `tutor-card` lint, so a card
 * that fails the strict profile is never evaluated and locked tools are reported in `lint.lockedTools`.
 */
export function tutorEvalOptions(
  lint: Omit<LintContext, "profile">,
  window: { fromBar: number; bars: number },
): EvalOptions {
  return {
    mode: "tutor",
    bars: Math.max(1, Math.min(16, Math.floor(window.bars))),
    fromBar: Math.max(1, Math.floor(window.fromBar)),
    lint: { ...lint, profile: "tutor-card" },
    meter: lint.meter,
  };
}
