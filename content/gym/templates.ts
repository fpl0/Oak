// Transcribe project templates for the learner's own audio (contracts §3.1 rule 12): the
// `tb.feature.transcribe.*` modes. Ladder levels, X1, X2 and CF-T always present the layers their stage
// needs, whatever is unlocked; these templates are for own-audio projects only.
import type { GymTemplate, ToolId } from "@oak/content-kit";

export interface GymTemplateEntry extends GymTemplate {
  /** The tool that unlocks the mode. */
  tool: ToolId;
}

export const templates: readonly GymTemplateEntry[] = [
  {
    id: "melody",
    tool: "tb.feature.transcribe",
    title: "Melody",
    layers: ["melody"],
    starter: 'setcpm(90/4)\n\nmel: note("c4 ~ ~ ~").s("piano")',
    checklist: [
      { id: "tonic", label: "I found home (the tonic) and set the key" },
      { id: "rhythm", label: "The rhythm of each phrase matches when I play along" },
      { id: "pitches", label: "Every note matches on the slowed-down loop" },
    ],
  },
  {
    id: "chords",
    tool: "tb.feature.transcribe.chords",
    title: "Chords",
    layers: ["bass", "chords"],
    starter: 'setcpm(90/4)\n\nbass: note("c2 ~ ~ ~").s("piano")\nchords: note("[c4,e4,g4]").s("piano")',
    checklist: [
      { id: "bass", label: "I wrote the bass first" },
      { id: "quality", label: "Each chord's quality matches (major, minor, seventh)" },
      { id: "rhythm", label: "The chords change when the song changes" },
    ],
  },
  {
    id: "bass",
    tool: "tb.feature.transcribe.bass",
    title: "Bass",
    layers: ["bass"],
    starter: 'setcpm(90/4)\n\nbass: note("c2 ~ ~ ~").s("piano")',
    checklist: [
      { id: "roots", label: "The roots on beat 1 match" },
      { id: "rhythm", label: "The bass rhythm locks with the kick" },
      { id: "passing", label: "Passing and approach notes match" },
    ],
  },
  {
    id: "full",
    tool: "tb.feature.transcribe.full",
    title: "Full arrangement",
    layers: ["form", "drums", "bass", "chords", "melody"],
    starter:
      'setcpm(90/4)\n\ndrums: s("bd ~ sd ~")\nbass: note("c2 ~ ~ ~").s("piano")\nchords: note("[c4,e4,g4]").s("piano")\nmel: note("c4 ~ ~ ~").s("piano")',
    checklist: [
      { id: "form", label: "I mapped the sections and their lengths" },
      { id: "groove", label: "The drums and bass match" },
      { id: "changes", label: "The changes match bar by bar" },
      { id: "melody", label: "The melody matches" },
    ],
  },
];
export default templates;
