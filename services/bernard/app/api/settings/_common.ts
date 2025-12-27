import { scheduleAutoBackup } from "@/lib/backup/autoBackup";
import { clearSettingsCache, SettingsStore } from "@/lib/config";
import { getRedis } from "@/lib/infra/redis";

export function settingsStore() {
  return new SettingsStore(getRedis(), {
    onChange: () => {
      clearSettingsCache();
      scheduleAutoBackup("settings changed");
    }
  });
}

