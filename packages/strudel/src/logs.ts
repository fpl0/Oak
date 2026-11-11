// Parsing of Strudel's log lines (the `strudel.log` document event and superdough's logger).
import type { StrudelLog } from "./types.ts";

const TAGS = ["query", "getTrigger", "cyclist", "voicing", "tonal", "mini", "webaudio", "sampler", "eval"] as const;

/** `[sampler] loading sound "RolandTR909_bd:0" took too long` (samples) and `[webaudio] skip hap: still loading` (soundfonts). */
const SAMPLER_SKIP = /^\[sampler\] loading sound "([^"]+)" took too long/;
const WEBAUDIO_SKIP = /^\[webaudio\] skip hap: still loading/;
const NOT_FOUND = /sound (\S+) not found! Is it loaded\?/;

/** True for the two messages that mean "a sound was not ready in time" (docs/spikes.md, s3 gotchas). */
export function isSkipMessage(message: string): boolean {
  return SAMPLER_SKIP.test(message) || WEBAUDIO_SKIP.test(message);
}

/**
 * One log line to a `StrudelLog`. `coldSound` names the sound most recently triggered while its buffer
 * was not warm: the soundfont skip message carries no name of its own.
 */
export function parseStrudelLog(message: string, coldSound?: string): StrudelLog {
  const text = String(message);
  const m = /^\[([A-Za-z]+)\]/.exec(text);
  const tag = (TAGS as readonly string[]).includes(m?.[1] ?? "") ? (m?.[1] as StrudelLog["tag"]) : "other";
  const log: StrudelLog = { tag, message: text };
  const sampler = SAMPLER_SKIP.exec(text);
  if (sampler?.[1]) log.skippedSound = sampler[1];
  else if (WEBAUDIO_SKIP.test(text) && coldSound) log.skippedSound = coldSound;
  return log;
}

/** The sound a `[getTrigger] error: sound x not found! Is it loaded?` line names, or null. */
export function missingSoundOf(message: string): string | null {
  return NOT_FOUND.exec(message)?.[1] ?? null;
}

/** Dev builds of superdough log this on every released source; it is noise (docs/spikes.md, s3). */
export function isNoise(message: string): boolean {
  return message.includes("Deprecation warning") && message.includes("onended");
}
