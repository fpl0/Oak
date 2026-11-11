// Settings and profile writes with optimistic feedback: one call per change, an error toast when it fails.
import type { ProfilePatch, SettingKey, Settings } from "@oak/api";
import { toast } from "../ui/kit/Toast.tsx";
import { useProfileUpdate, useSettingsPut } from "./queries.ts";

export function useUpdateSetting() {
  const m = useSettingsPut();
  return {
    pending: m.isPending,
    set<K extends SettingKey>(key: K, value: Settings[K]) {
      m.mutate(
        { params: { key }, body: { value } },
        { onError: (e) => toast.error("That setting wasn't saved", e.message) },
      );
    },
  };
}

export function useUpdateProfile() {
  const m = useProfileUpdate();
  return {
    pending: m.isPending,
    set(patch: ProfilePatch) {
      m.mutate({ body: patch }, { onError: (e) => toast.error("That change wasn't saved", e.message) });
    },
  };
}
