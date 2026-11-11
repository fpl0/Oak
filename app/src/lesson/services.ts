// The lesson and checkpoint players' grading path: the browser grader host's functions for `gradeStep`. Their
// Workbench services are the app's (app/src/lib/workbench-services.ts).
import { analyzeCode, gradeInBrowser } from "../lib/grader-client.ts";
import type { GraderDeps } from "./grading.ts";

export { appWorkbenchServices as lessonServices, catalogText } from "../lib/workbench-services.ts";

export const browserGrader: GraderDeps = {
  grade: (req) => gradeInBrowser(req),
  evaluate: (code, bars, meter) => analyzeCode(code, { mode: "lesson", bars, lint: null, meter }),
};
