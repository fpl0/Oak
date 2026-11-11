// Which backend answers (approved design): the explicit setting, else the API when a key is
// present, else a logged-in `claude` CLI, else the tutor is off. The app is fully usable without
// the tutor, so "off" is a normal result, not an error.
import type { TutorSettings } from "./ports.ts";
import { BACKEND_IDS, type BackendId, type TutorBackend, UNAVAILABLE } from "./types.ts";

export interface BackendSelection {
  backend: TutorBackend | null;
  /** Why this result: `setting`, `auto`, `off`, or the reason the wanted backend is unavailable. */
  reason: string;
  /** Every backend that was asked, with its answer. For Settings -> Tutor. */
  tried: { id: BackendId; ok: boolean; reason: string | null }[];
}

export async function selectBackend(
  setting: TutorSettings["backend"],
  backends: Partial<Record<BackendId, TutorBackend>>,
): Promise<BackendSelection> {
  const tried: BackendSelection["tried"] = [];
  if (setting === "off") return { backend: null, reason: "off", tried };

  const ask = async (id: BackendId): Promise<TutorBackend | null> => {
    const backend = backends[id];
    if (!backend) {
      tried.push({ id, ok: false, reason: UNAVAILABLE.notInstalled });
      return null;
    }
    let res: { ok: boolean; reason?: string };
    try {
      res = await backend.available();
    } catch {
      res = { ok: false, reason: UNAVAILABLE.unreachable };
    }
    tried.push({ id, ok: res.ok, reason: res.ok ? null : (res.reason ?? UNAVAILABLE.unreachable) });
    return res.ok ? backend : null;
  };

  if (setting !== "auto") {
    // An explicit choice is never silently replaced by the other backend: the two bill differently.
    const backend = await ask(setting);
    return { backend, reason: backend ? "setting" : (tried[0]?.reason ?? UNAVAILABLE.unreachable), tried };
  }
  for (const id of BACKEND_IDS) {
    const backend = await ask(id);
    if (backend) return { backend, reason: "auto", tried };
  }
  return { backend: null, reason: tried[0]?.reason ?? UNAVAILABLE.missingKey, tried };
}

export type TutorHealth = "ready" | "missing_key" | "invalid_key" | "unreachable";

/** The `/api/health` enum (contracts §10.1). Nothing but the enum leaves the server. */
export function tutorHealth(selection: BackendSelection): TutorHealth {
  if (selection.backend) return "ready";
  if (selection.reason === UNAVAILABLE.invalidKey) return "invalid_key";
  if (selection.reason === UNAVAILABLE.unreachable) return "unreachable";
  return "missing_key";
}

// --- status for Settings -> Tutor ---------------------------------------------------------------

const KNOWN_REASONS: readonly string[] = Object.values(UNAVAILABLE);

/**
 * A backend's `available().reason` is a code by convention, but nothing stops an implementation
 * from putting an upstream message there, and upstream messages can quote credentials. Only a
 * code ever leaves this file (contracts §11.1 rule 6).
 */
export function reasonCode(reason: string | null | undefined): string {
  if (reason === null || reason === undefined) return UNAVAILABLE.unreachable;
  if (reason === "off" || reason === "setting" || reason === "auto") return reason;
  return KNOWN_REASONS.includes(reason) ? reason : UNAVAILABLE.unreachable;
}

const WORKS_WITHOUT = "Oak works without the tutor: hints use the authored ladder.";

/** What the learner can do about an unavailable tutor. Fixed copy: nothing from upstream is quoted. */
export function setupGuidance(reason: string, id: BackendId | null = null): string {
  switch (reasonCode(reason)) {
    case "off":
      return `The tutor is turned off. Turn it on in Settings, under Tutor. ${WORKS_WITHOUT}`;
    case UNAVAILABLE.invalidKey:
      return `The saved Anthropic API key was rejected. Replace it in Settings, under Tutor. ${WORKS_WITHOUT}`;
    case UNAVAILABLE.notLoggedIn:
      return `Claude Code is installed but not signed in. Run "claude" in a terminal and sign in. ${WORKS_WITHOUT}`;
    case UNAVAILABLE.notInstalled:
      return id === "anthropic-api"
        ? `The API backend is not part of this build. ${WORKS_WITHOUT}`
        : `Claude Code was not found on your PATH. Install it, run "claude" and sign in. ${WORKS_WITHOUT}`;
    case UNAVAILABLE.unreachable:
      return `The tutor could not be reached. Check your connection and try again. ${WORKS_WITHOUT}`;
    default:
      return `The tutor is not set up. Add an Anthropic API key in Settings, under Tutor, or sign in to Claude Code to use your Claude plan. ${WORKS_WITHOUT}`;
  }
}

export interface BackendReport {
  id: BackendId;
  /** False when this build has no such backend. */
  wired: boolean;
  ok: boolean;
  active: boolean;
  /** A code from `UNAVAILABLE`, never free text. */
  reason: string | null;
  guidance: string | null;
  /** `api`: billed per token to the learner's key. `plan`: included in their Claude plan. */
  billing: "api" | "plan";
}

export interface BackendStatus {
  setting: TutorSettings["backend"];
  selection: BackendSelection;
  active: BackendId | null;
  health: TutorHealth;
  /** `setting`, `auto`, `off`, or the code of what is missing. */
  reason: string;
  /** Set when no backend is active. */
  guidance: string | null;
  backends: BackendReport[];
}

/**
 * Selection plus an answer from EVERY backend, for Settings -> Tutor: which one is active and why
 * each other one is not usable. Selection itself stays `selectBackend`, so the two cannot disagree.
 * The result holds codes and fixed copy only.
 */
export async function backendStatus(
  setting: TutorSettings["backend"],
  backends: Partial<Record<BackendId, TutorBackend>>,
): Promise<BackendStatus> {
  const selection = await selectBackend(setting, backends);
  const active = selection.backend?.id ?? null;
  const reports: BackendReport[] = [];
  for (const id of BACKEND_IDS) {
    let answer = selection.tried.find((t) => t.id === id);
    if (answer === undefined) {
      // Selection stopped before asking this one (or the tutor is off); Settings still shows it.
      const backend = backends[id];
      let res: { ok: boolean; reason?: string } = { ok: false, reason: UNAVAILABLE.notInstalled };
      if (backend) {
        try {
          res = await backend.available();
        } catch {
          res = { ok: false, reason: UNAVAILABLE.unreachable };
        }
      }
      answer = { id, ok: res.ok, reason: res.ok ? null : (res.reason ?? UNAVAILABLE.unreachable) };
    }
    const reason = answer.ok ? null : reasonCode(answer.reason);
    reports.push({
      id,
      wired: backends[id] !== undefined,
      ok: answer.ok,
      active: active === id,
      reason,
      guidance: reason === null ? null : setupGuidance(reason, id),
      billing: id === "claude-cli" ? "plan" : "api",
    });
  }
  const reason = reasonCode(selection.reason);
  return {
    setting,
    selection,
    active,
    health: tutorHealth(selection),
    reason,
    guidance:
      active === null
        ? setupGuidance(reason, setting === "auto" || setting === "off" ? null : setting)
        : null,
    backends: reports,
  };
}
