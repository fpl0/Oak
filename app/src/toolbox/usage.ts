// "Lessons that use it" for the tool pages: every authored code snippet of the built course
// (`content/.generated/examples.json`, written by `bun run content:build`) linted once by the app's grader
// worker; the lint's `used` list credits the snippet's lesson. Cached for the session.
import type { LintContext } from "@oak/content-kit";
import { useQuery } from "@tanstack/react-query";
import { lintInBrowser } from "../lib/grader-client.ts";
import { type ExampleRow, usageFrom, usedOf } from "./model.ts";

const generated = import.meta.glob<unknown>("../../../content/.generated/examples.json", {
  import: "default",
});

async function loadExamples(): Promise<ExampleRow[]> {
  const load = Object.values(generated)[0];
  if (!load) return [];
  const raw = await load();
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (r): r is ExampleRow =>
      !!r &&
      typeof r === "object" &&
      typeof (r as ExampleRow).ref === "string" &&
      typeof (r as ExampleRow).code === "string",
  );
}

const CTX: LintContext = {
  profile: "studio",
  unlocked: new Set(),
  allowPreview: true,
  meter: "4/4",
  key: null,
};

async function computeUsage(): Promise<Map<string, string[]>> {
  const rows = await loadExamples();
  const seen = new Map<string, string[]>();
  const out: { ref: string; used: string[] }[] = [];
  for (const r of rows) {
    let used = seen.get(r.code);
    if (!used) {
      try {
        used = usedOf(await lintInBrowser(r.code, { ...CTX, meter: r.meter ?? "4/4" }));
      } catch {
        used = [];
      }
      seen.set(r.code, used);
    }
    out.push({ ref: r.ref, used });
  }
  return usageFrom(out);
}

export function useToolUsage() {
  return useQuery({
    queryKey: ["toolbox", "usage"],
    queryFn: computeUsage,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: 0,
  });
}
