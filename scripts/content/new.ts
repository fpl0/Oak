// `bun run content:new <lessonId> [--root <dir>] [--force]`: scaffolds content/core/Uxx/Lyy/{lesson.ts,
// lesson.mdx} (track lessons under content/advanced/<unit>/Lyy) from the lesson's row in the syllabus,
// following the template of AUTHORING §3: listen → predict → run → modify → make. The scaffold loads
// and passes `defineLesson`; the author then writes the prompts, the real steps and their tests, and runs
// `bun run content:check <lessonId>`. Starter code uses only tools unlocked at that lesson.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { type LessonId, parseLessonId } from "@oak/content-kit";
import { courseGraph } from "../../content/index.ts";
import { unlockedAt } from "../../content/lib/course.ts";
import { CONTENT_ROOT } from "../../content/lib/load.bun.ts";
import { syllabus } from "../../content/syllabus.ts";
import { toolbox } from "../../content/toolbox.ts";

export interface Scaffold {
  dir: string;
  lessonTs: string;
  lessonMdx: string;
}

/** The starter line the scaffold uses: the richest form the lesson's unlocked tools allow. */
function starterLine(id: LessonId): { line: string; changed: string; label: string } {
  const unlocked = unlockedAt(courseGraph(), toolbox, id);
  if (unlocked.has("tb.n") && unlocked.has("tb.scale"))
    return {
      label: "mel",
      line: 'mel: n("0 2 4 2").scale("C4:major").s("piano")',
      changed: 'mel: n("0 2 4 0").scale("C4:major").s("piano")',
    };
  if (unlocked.has("tb.note"))
    return {
      label: "mel",
      line: 'mel: note("c4 e4 g4 e4").s("piano")',
      changed: 'mel: note("c4 e4 g4 c4").s("piano")',
    };
  return { label: "drums", line: 'drums: s("bd sd bd sd")', changed: 'drums: s("bd sd bd bd")' };
}

export function scaffold(id: LessonId, root = CONTENT_ROOT): Scaffold {
  const parsed = parseLessonId(id);
  const meta = syllabus.units.flatMap((u) => u.lessons).find((l) => l.id === id);
  if (!parsed || !meta) throw new Error(`${id} is not a lesson of content/syllabus.ts`);
  const unit = syllabus.units.find((u) => u.lessons.some((l) => l.id === id));
  const dir = join(
    root,
    unit?.track === "core" ? "core" : "advanced",
    parsed.unit,
    id.split(".")[1] as string,
  );
  const { line, changed, label } = starterLine(id);
  const code = (l: string) => `\`setcpm(90/4)\\n\\n${l.replace(/`/g, "\\`")}\``;
  const band = parsed.unit === "U00" ? "false" : '{ band: "band.two-chord-vamp", followsLearnerKey: true }';
  const panels = "{ roll: true, staff: false, keyboard: false }";
  const lessonTs = `// ${id} ${meta.title}: ${meta.objective}
// Scaffolded by \`bun run content:new ${id}\`. Write the real steps (AUTHORING §3, §9), then run
// \`bun run content:check ${id}\`.
import { defineLesson } from "@oak/content-kit";

const START = ${code(line)};
const CHANGED = ${code(changed)};

export default defineLesson({
  id: "${id}",
  version: 1,
  title: ${JSON.stringify(meta.title)},
  objective: ${JSON.stringify(meta.objective)},
  key: { tonic: "C", mode: "major" },
  meter: "4/4",
  bpm: 90,
  introduces: ${JSON.stringify(meta.introduces)},
  practises: ${JSON.stringify(meta.practises)},
  terms: [],
  canDo: [],
  wrapAt: "S4",
  steps: [
    {
      id: "S1",
      kind: "listen",
      title: "Listen",
      minutes: 0.5,
      ui: { panels: ${panels} },
      exercise: { kind: "listen", id: "listen", version: 1, role: "practice", prompt: "Press Play and listen.", skills: [], hints: null, tests: [], items: [{ code: START, caption: "The idea of this lesson.", bars: 2 }] },
    },
    {
      id: "S2",
      kind: "predict",
      title: "Predict",
      minutes: 0.5,
      ui: { panels: ${panels} },
      exercise: { kind: "predict", id: "predict", version: 1, role: "practice", prompt: "What will this sound like?", skills: [], hints: null, tests: [], code: CHANGED, bars: 1, mode: "hum" },
    },
    {
      id: "S3",
      kind: "run",
      title: "Run it",
      minutes: 0.5,
      ui: { panels: ${panels} },
      exercise: {
        kind: "run-investigate", id: "run", version: 1, role: "practice", prompt: "Run the code.", skills: [], tests: [],
        hints: [{ text: "What does Run do?" }, { text: "Press Ctrl+Enter." }, { text: "The Run button is above the editor." }, "auto"],
        code: { starter: START }, mustPlayLoops: 1, questions: [],
      },
    },
    {
      id: "S4",
      kind: "modify",
      title: "Change it",
      minutes: 1.5,
      graded: true,
      ui: { panels: ${panels} },
      exercise: {
        kind: "code-modify", id: "change-it", version: 1, role: "check", prompt: "Change the last note.", skills: [],
        code: { starter: START },
        reference: { solutions: [CHANGED], bars: 1 },
        matcher: { m: "events", pitch: "absolute", rhythm: "onsets", durations: false },
        target: { audible: true },
        hints: [{ text: "Which note comes last?" }, { text: "Look at the last word in the string." }, { text: "Change only that word." }, "auto"],
        tests: [
          { name: "reference", response: { code: CHANGED }, expect: "pass" },
          { name: "unchanged", response: { code: START }, expect: "fail", feedback: ["code.unchanged"] },
        ],
      },
    },
    {
      id: "S5",
      kind: "make",
      title: "Make",
      minutes: 2.5,
      ui: { panels: ${panels}, band: ${band} },
      exercise: {
        kind: "code-make", id: "make", version: 1, role: "practice", prompt: "Make your own version.", skills: [],
        code: { starter: START }, bars: [1, 4], saveAs: "sketch",
        rubric: [{ id: "plays", label: "Plays a ${label} line", required: true, skills: [], rule: "tracks", min: 1 }],
        hints: [{ text: "What could you change?" }, { text: "Start from the starter." }, { text: "Change one word at a time." }, "auto"],
        tests: [
          { name: "minimal", response: { code: START }, expect: "pass" },
          { name: "beyond the brief", response: { code: CHANGED }, expect: "pass" },
        ],
      },
    },
  ],
});
`;
  const lessonMdx = `{/* ${id} ${meta.title}: prose only, one <Step> per step of lesson.ts. No code fences. */}

<Step id="S1">
Press play and listen.
</Step>

<Step id="S2">
<Predict exercise="predict" hum />
</Step>

<Step id="S3">
Run it.
</Step>

<Step id="S4">
<Editor exercise="change-it" />
</Step>

<Step id="S5">
<Make exercise="make" />
</Step>
`;
  return { dir, lessonTs, lessonMdx };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const id = args.find((a) => !a.startsWith("--")) as LessonId | undefined;
  const rootIdx = args.indexOf("--root");
  const root = rootIdx >= 0 ? resolve(args[rootIdx + 1] as string) : CONTENT_ROOT;
  if (!id) {
    console.error("usage: bun run content:new <lessonId> [--root <dir>] [--force]");
    process.exit(2);
  }
  const s = scaffold(id, root);
  const file = join(s.dir, "lesson.ts");
  if (existsSync(file) && !args.includes("--force")) {
    console.error(`${relative(process.cwd(), file)} exists (use --force to overwrite)`);
    process.exit(1);
  }
  mkdirSync(s.dir, { recursive: true });
  writeFileSync(file, s.lessonTs);
  writeFileSync(join(s.dir, "lesson.mdx"), s.lessonMdx);
  console.log(
    `content:new: wrote ${relative(process.cwd(), s.dir)}/{lesson.ts,lesson.mdx}; next: bun run content:check ${id}`,
  );
}
