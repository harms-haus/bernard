import fs from "node:fs/promises";
import path from "node:path";

import { SettingsStore } from "../config/settingsStore";
import { TokenStore } from "../auth/tokenStore";
import { UserStore } from "../auth/userStore";
import { SessionStore } from "../auth/sessionStore";
import { getRedis } from "../infra/redis";

/**
 * Serialized backup payload containing all persisted stores and metadata.
 */
export type BackupPayload = {
  createdAt: string;
  reason?: string;
  settings: Awaited<ReturnType<SettingsStore["getAll"]>>;
  tokens: Awaited<ReturnType<TokenStore["exportAll"]>>;
  users: Awaited<ReturnType<UserStore["list"]>>;
  sessions: Awaited<ReturnType<SessionStore["exportAll"]>>;
};

let pendingTimer: NodeJS.Timeout | null = null;
let pendingReason: string | undefined;

/**
 * Collects settings, tokens, users, and sessions into a single payload.
 */
export async function collectBackup(reason?: string): Promise<BackupPayload> {
  const redis = getRedis();
  const settingsStore = new SettingsStore(redis);
  const tokenStore = new TokenStore(redis);
  const userStore = new UserStore(redis);
  const users = await userStore.list();
  const sessionStore = new SessionStore(redis);

  const [settings, tokens, sessions] = await Promise.all([
    settingsStore.getAll(),
    tokenStore.exportAll(),
    sessionStore.exportAll()
  ]);

  const payload: BackupPayload = {
    createdAt: new Date().toISOString(),
    settings,
    tokens,
    users,
    sessions
  };
  if (reason !== undefined) payload.reason = reason;
  return payload;
}

/**
 * Deletes backups exceeding age or count retention limits.
 */
export async function enforceRetention(dir: string, retentionDays: number, retentionCount: number) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = entries
    .filter((e) => e.isFile())
    .map((entry) => ({
      name: entry.name,
      path: path.join(dir, entry.name)
    }))
    .filter((file) => file.name.startsWith("auto-backup-") && file.name.endsWith(".json"));

  const now = Date.now();
  const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;
  const stats = await Promise.all(
    files.map(async (file) => {
      const stat = await fs.stat(file.path).catch(() => null);
      return stat ? { ...file, mtime: stat.mtime.getTime() } : null;
    })
  );

  const existing = stats.filter((f): f is { name: string; path: string; mtime: number } => Boolean(f));
  const sorted = existing.sort((a, b) => b.mtime - a.mtime);
  const toDelete: Array<{ path: string }> = [];

  sorted.forEach((file, idx) => {
    const tooOld = now - file.mtime > maxAgeMs;
    const exceedsCount = idx >= retentionCount;
    if (tooOld || exceedsCount) {
      toDelete.push({ path: file.path });
    }
  });

  await Promise.all(toDelete.map((file) => fs.unlink(file.path).catch(() => void 0)));
}

/**
 * Writes a backup file and enforces retention policies.
 */
export async function writeBackup(reason?: string) {
  const settingsStore = new SettingsStore(getRedis());
  const backupConfig = await settingsStore.getBackups();
  const payload = await collectBackup(reason);

  const timestamp = payload.createdAt.replace(/[:.]/g, "-");
  const filename = `auto-backup-${timestamp}.json`;
  const filePath = path.join(backupConfig.directory, filename);

  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
  await enforceRetention(backupConfig.directory, backupConfig.retentionDays, backupConfig.retentionCount);
}

/**
 * Schedules a debounced auto-backup using configured delay.
 */
export function scheduleAutoBackup(reason?: string) {
  pendingReason = reason ?? pendingReason;
  const settingsStore = new SettingsStore(getRedis());
  settingsStore
    .getBackups()
    .then((cfg) => {
      if (pendingTimer) {
        clearTimeout(pendingTimer);
      }
      const delay = Math.max(cfg.debounceSeconds, 1) * 1000;
      pendingTimer = setTimeout(() => {
        pendingTimer = null;
        writeBackup(pendingReason).catch((err) => console.error("Auto-backup failed", err));
        pendingReason = undefined;
      }, delay);
    })
    .catch((err) => {
      console.error("Unable to schedule auto-backup", err);
    });
}

/**
 * Resets in-flight backup scheduling state. Intended for tests and shutdown.
 */
export function resetAutoBackupState() {
  if (pendingTimer) {
    clearTimeout(pendingTimer);
  }
  pendingTimer = null;
  pendingReason = undefined;
}

