// What the learner reads when a release, a recording upload or a take goes wrong (ux §7.11: calm, adult, precise).
// The API client's own messages name endpoints and status codes ("capstones.release: HTTP 502"); they are for the
// log, never for the learner. A refusal the server explains in words (409: "every required rule of the brief has
// to pass before release; run the check first") is kept, without the endpoint prefix. Pure: unit-tested.
import { OakApiError } from "@oak/api";

/** The server's own sentence without the client's "<endpoint>: " prefix (and a capital first letter). */
function serverWords(e: OakApiError): string {
  const text = e.message.replace(new RegExp(`^${e.endpoint.replace(/\./g, "\\.")}:\\s*`), "").trim();
  return text ? text[0]?.toUpperCase() + text.slice(1) : "";
}

const unreachable = (e: OakApiError) => e.code === "network" || e.status === 0;
/** Only a refusal the server explains (a conflict, a missing sketch) is worth reading out; anything else is trouble. */
const serverTrouble = (e: OakApiError) =>
  !(e.code === "conflict" || e.code === "not_found") || e.status >= 500 || /HTTP \d{3}$/.test(e.message);

/**
 * Why the release did not go through, and what to do. `kept`: a recorded take is still there (the learner only has
 * to press Release again; the server never makes a second version of the same release).
 */
export function releaseErrorText(e: unknown, kept: boolean): string {
  const again = kept
    ? "Your take is kept: press Release to try again."
    : "Nothing was lost: try the release again.";
  if (e instanceof OakApiError) {
    if (unreachable(e)) return `The Oak server didn't answer, so the track isn't on the album yet. ${again}`;
    if (serverTrouble(e)) return `The album couldn't be saved just now. ${again}`;
    const words = serverWords(e);
    if (words) return words.endsWith(".") ? words : `${words}.`;
  }
  const msg = e instanceof Error ? e.message : String(e);
  return msg || `The release didn't go through. ${again}`;
}

/** Why the recording of a released version was not stored (the version itself is on the album). */
export function audioErrorText(e: unknown): string {
  if (e instanceof OakApiError) {
    if (unreachable(e)) return "The recording couldn't be saved: the Oak server didn't answer.";
    if (e.status === 413 || e.code === "payload_too_large")
      return "The recording couldn't be saved: it is larger than the album accepts.";
    if (serverTrouble(e)) return "The recording couldn't be saved just now.";
    const words = serverWords(e);
    if (words) return `The recording couldn't be saved: ${words[0]?.toLowerCase()}${words.slice(1)}`;
  }
  return "The recording couldn't be saved.";
}
