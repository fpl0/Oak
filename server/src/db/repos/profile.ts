// learner_profile (one row), calibration_runs, settings.
import {
  DEFAULT_SETTINGS,
  type Profile,
  type ProfilePatch,
  SETTING_KEYS,
  type SettingKey,
  type Settings,
  SettingsSchema,
} from "@oak/api";
import { all, bool, type Db, fromJson, get, int, run, toJson } from "../index.ts";

interface ProfileRow {
  display_name: string | null;
  timezone: string;
  rollover_hour: number;
  daily_minutes: number;
  weekly_goal: number;
  flavour: string;
  vocal_low_midi: number | null;
  vocal_high_midi: number | null;
  comfort_low_midi: number | null;
  comfort_high_midi: number | null;
  sing_tolerance_cents: number;
  sing_tol_mode: string;
  output_latency_ms: number | null;
  input_latency_ms: number | null;
  sing_latency_ms: number | null;
  tap_latency_ms: number | null;
  tap_jitter_ms: number | null;
  visual_offset_ms: number;
  output_kind: string;
  input_kind: string;
  input_device_id: string | null;
  noise_floor_db: number | null;
  quiet: number;
  solfege: string;
  onboarded_at: string | null;
  created_at: string;
}

/** DTO field → column. */
const PROFILE_COLUMNS: Readonly<Record<keyof Omit<Profile, "createdAt">, string>> = {
  displayName: "display_name",
  timezone: "timezone",
  rolloverHour: "rollover_hour",
  targetMinutes: "daily_minutes",
  weeklyGoal: "weekly_goal",
  flavour: "flavour",
  vocalLowMidi: "vocal_low_midi",
  vocalHighMidi: "vocal_high_midi",
  comfortLowMidi: "comfort_low_midi",
  comfortHighMidi: "comfort_high_midi",
  singToleranceCents: "sing_tolerance_cents",
  singTolMode: "sing_tol_mode",
  outputLatencyMs: "output_latency_ms",
  inputLatencyMs: "input_latency_ms",
  singLatencyMs: "sing_latency_ms",
  tapLatencyMs: "tap_latency_ms",
  tapJitterMs: "tap_jitter_ms",
  visualOffsetMs: "visual_offset_ms",
  outputKind: "output_kind",
  inputKind: "input_kind",
  inputDeviceId: "input_device_id",
  noiseFloorDb: "noise_floor_db",
  quiet: "quiet",
  solfege: "solfege",
  onboardedAt: "onboarded_at",
};

function toProfile(r: ProfileRow): Profile {
  return {
    displayName: r.display_name,
    timezone: r.timezone,
    rolloverHour: r.rollover_hour,
    targetMinutes: r.daily_minutes as Profile["targetMinutes"],
    weeklyGoal: r.weekly_goal,
    flavour: r.flavour as Profile["flavour"],
    vocalLowMidi: r.vocal_low_midi,
    vocalHighMidi: r.vocal_high_midi,
    comfortLowMidi: r.comfort_low_midi,
    comfortHighMidi: r.comfort_high_midi,
    singToleranceCents: r.sing_tolerance_cents as Profile["singToleranceCents"],
    singTolMode: r.sing_tol_mode as Profile["singTolMode"],
    outputLatencyMs: r.output_latency_ms,
    inputLatencyMs: r.input_latency_ms,
    singLatencyMs: r.sing_latency_ms,
    tapLatencyMs: r.tap_latency_ms,
    tapJitterMs: r.tap_jitter_ms,
    visualOffsetMs: r.visual_offset_ms,
    outputKind: r.output_kind as Profile["outputKind"],
    inputKind: r.input_kind as Profile["inputKind"],
    inputDeviceId: r.input_device_id,
    noiseFloorDb: r.noise_floor_db,
    quiet: bool(r.quiet),
    solfege: r.solfege as Profile["solfege"],
    onboardedAt: r.onboarded_at,
    createdAt: r.created_at,
  };
}

export class ProfileRepo {
  constructor(
    private readonly db: Db,
    private readonly defaults: { timezone: string; now: () => Date },
  ) {}

  /** The one profile row, created with defaults on first use. */
  get(): Profile {
    let row = get<ProfileRow>(this.db, "SELECT * FROM learner_profile WHERE id = 1");
    if (row === null) {
      run(
        this.db,
        "INSERT INTO learner_profile (id, timezone, flavour, created_at) VALUES (1, ?, 'flavour.pop', ?)",
        this.defaults.timezone,
        this.defaults.now().toISOString(),
      );
      row = get<ProfileRow>(this.db, "SELECT * FROM learner_profile WHERE id = 1") as ProfileRow;
    }
    return toProfile(row);
  }

  patch(patch: ProfilePatch): Profile {
    this.get();
    const sets: string[] = [];
    const values: (string | number | null)[] = [];
    for (const [field, value] of Object.entries(patch) as [keyof typeof PROFILE_COLUMNS, unknown][]) {
      const column = PROFILE_COLUMNS[field];
      if (column === undefined || value === undefined) continue;
      sets.push(`${column} = ?`);
      values.push(typeof value === "boolean" ? int(value) : (value as string | number | null));
    }
    if (sets.length > 0) run(this.db, `UPDATE learner_profile SET ${sets.join(", ")} WHERE id = 1`, ...values);
    return this.get();
  }

  addCalibration(kind: string, result: unknown, at: string): void {
    run(this.db, "INSERT INTO calibration_runs (kind, result_json, at) VALUES (?, ?, ?)", kind, toJson(result), at);
  }

  calibrations(): { id: number; kind: string; result: unknown; at: string }[] {
    return all<{ id: number; kind: string; result_json: string; at: string }>(
      this.db,
      "SELECT * FROM calibration_runs ORDER BY id",
    ).map((r) => ({ id: r.id, kind: r.kind, result: fromJson(r.result_json, null), at: r.at }));
  }
}

export class SettingsRepo {
  constructor(private readonly db: Db) {}

  /** Every setting, stored values over the defaults. A stored value that no longer validates falls back to its default. */
  all(): Settings {
    const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    for (const row of all<{ key: string; value_json: string }>(this.db, "SELECT key, value_json FROM settings")) {
      if (!(SETTING_KEYS as string[]).includes(row.key)) continue;
      const parsed = SettingsSchema.shape[row.key as SettingKey].safeParse(fromJson(row.value_json, undefined));
      if (parsed.success) out[row.key] = parsed.data;
    }
    return out as Settings;
  }

  get<K extends SettingKey>(key: K): Settings[K] {
    return this.all()[key];
  }

  put<K extends SettingKey>(key: K, value: Settings[K], at: string): void {
    run(
      this.db,
      `INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
      key,
      toJson(value),
      at,
    );
  }
}
