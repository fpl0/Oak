// health, bootstrap, settings (incl. the API key), confirm, data reset, profile.
import {
  CONTRACTS_VERSION,
  type Health,
  type KeyStatus,
  type Profile,
  type SettingKey,
  SettingsSchema,
} from "@oak/api";
import { schemaVersion } from "../db/index.ts";
import type { AppDeps } from "../deps.ts";
import { badRequest } from "../errors.ts";
import { isValidTimeZone } from "../lib/days.ts";
import type { Mounter } from "./define.ts";

export async function healthOf(d: AppDeps): Promise<Health> {
  const tutor = d.tutor === null ? { tutor: "unreachable" as const, backend: null } : await d.tutor.status();
  return {
    ok: true,
    appVersion: d.config.appVersion,
    contractsVersion: CONTRACTS_VERSION,
    schemaVersion: schemaVersion(d.db),
    contentVersion: d.content.contentVersion,
    tutor: tutor.tutor,
    tutorBackend: tutor.backend,
    dev: d.config.dev,
  };
}

function checkProfilePatch(patch: Partial<Profile>): void {
  if (patch.timezone !== undefined && !isValidTimeZone(patch.timezone)) throw badRequest("unknown time zone");
}

export function metaRoutes(mount: Mounter, d: AppDeps): void {
  const s = d.services;

  mount("health", () => healthOf(d));

  mount("bootstrap", async () => {
    const day = s.streak.time.day();
    return {
      health: await healthOf(d),
      profile: d.repos.profile.get(),
      settings: d.repos.settings.all(),
      unlocks: s.unlocks.list(),
      streak: s.streak.summary(day),
      terms: d.repos.terms.list(),
      day,
      openSession: s.sessions.openToday(),
    };
  });

  mount("settings.put", ({ params, body }) => {
    const key = params.key as SettingKey;
    const parsed = SettingsSchema.shape[key].safeParse(body.value);
    if (!parsed.success)
      throw badRequest(
        `invalid value for ${key}`,
        parsed.error.issues.map((i) => ({
          path: ["value", ...i.path.map(String)].join("."),
          message: i.message,
        })),
      );
    d.repos.settings.put(key, parsed.data as never, d.clock.now().toISOString());
    if (key === "tutor") d.tutor?.refresh();
    return d.repos.settings.all();
  });

  mount("settings.anthropicKey.set", async ({ body }) => {
    const status = await d.keyValidator(body.key.trim());
    // A key that the API refuses is not stored; an unreachable API stores it (the learner may be offline).
    if (status !== "invalid_key") d.secrets.savePasted(body.key);
    d.tutor?.refresh();
    const result: KeyStatus = { status, source: status === "invalid_key" ? d.secrets.source() : "pasted" };
    return result;
  });

  mount("settings.anthropicKey.delete", async () => {
    d.secrets.deletePasted();
    d.tutor?.refresh();
    const source = d.secrets.source();
    return { status: source === "none" ? "missing_key" : (await healthOf(d)).tutor, source };
  });

  mount("confirm", ({ body }) => d.confirm.issue(body.action, body.target));

  mount("data.reset", () => {
    s.backup.reset();
    return { ok: true as const };
  });

  mount("profile.get", () => d.repos.profile.get());

  mount("profile.put", ({ body }) => {
    const patch = body as Partial<Profile>;
    checkProfilePatch(patch);
    return d.repos.profile.patch(body as never);
  });

  mount("profile.calibration", ({ body }) => {
    checkProfilePatch(body.patch as Partial<Profile>);
    d.repos.profile.addCalibration(body.kind, body.result, d.clock.now().toISOString());
    return d.repos.profile.patch(body.patch as never);
  });
}
