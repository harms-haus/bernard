import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as autoBackup from "@/lib/backup/autoBackup";

type FsRecord = { content: string; mtime: number };

vi.mock("node:fs/promises", () => {
  const state: {
    files: Map<string, FsRecord>;
    statErrors: Set<string>;
    unlinkErrors: Set<string>;
    readdirError: boolean;
  } = {
    files: new Map(),
    statErrors: new Set(),
    unlinkErrors: new Set(),
    readdirError: false
  };

  const readdir = async (dir: string) => {
    if (state.readdirError) {
      throw new Error("readdir failure");
    }
    const entries: Array<{ name: string; isFile: () => boolean }> = [];
    for (const filePath of state.files.keys()) {
      if (filePath.startsWith(dir + path.sep)) {
        entries.push({
          name: path.basename(filePath),
          isFile: () => true
        });
      }
    }
    return entries;
  };

  const stat = async (filePath: string) => {
    if (state.statErrors.has(filePath)) {
      throw new Error("stat failure");
    }
    const record = state.files.get(filePath);
    if (!record) throw new Error("missing file");
    return { mtime: new Date(record.mtime) };
  };

  const writeFile = async (filePath: string, content: string) => {
    state.files.set(filePath, { content, mtime: Date.now() });
  };

  const unlink = async (filePath: string) => {
    if (state.unlinkErrors.has(filePath)) {
      throw new Error("unlink failure");
    }
    state.files.delete(filePath);
  };

  const api = { readdir, stat, writeFile, unlink };
  return { default: api, ...api, __fsState: state };
});

vi.mock("@/lib/infra/redis", () => ({ getRedis: vi.fn(() => ({ redis: true })) }));

vi.mock("@/lib/config/settingsStore", () => {
  const state = {
    backups: {
      debounceSeconds: 2,
      directory: "/tmp/backups",
      retentionDays: 10,
      retentionCount: 3
    },
    all: { settings: true },
    throwBackups: false
  };
  class SettingsStore {
    async getAll() {
      return state.all;
    }
    async getBackups() {
      if (state.throwBackups) {
        throw new Error("getBackups failed");
      }
      return state.backups;
    }
  }
  return { SettingsStore, __settingsStoreState: state };
});

vi.mock("@/lib/auth/tokenStore", () => {
  const state = { tokens: [{ id: "tok1" }], calls: 0 };
  class TokenStore {
    constructor() {
      state.calls += 1;
    }
    async exportAll() {
      return state.tokens;
    }
  }
  return { TokenStore, __tokenState: state };
});

vi.mock("@/lib/auth/userStore", () => {
  const state = { users: [{ id: "user-1" }], calls: 0 };
  class UserStore {
    constructor() {
      state.calls += 1;
    }
    async list() {
      return state.users;
    }
  }
  return { UserStore, __userState: state };
});

vi.mock("@/lib/auth/sessionStore", () => {
  const state = { sessions: [{ id: "session-1" }], exportCalls: [] as Array<string[]> };
  class SessionStore {
    async exportAll(userIds: string[]) {
      state.exportCalls.push(userIds);
      return state.sessions;
    }
  }
  return { SessionStore, __sessionState: state };
});

const { __fsState } = vi.mocked(await import("node:fs/promises"));
const { __settingsStoreState } = vi.mocked(await import("@/lib/config/settingsStore"));
const { __tokenState } = vi.mocked(await import("@/lib/auth/tokenStore"));
const { __userState } = vi.mocked(await import("@/lib/auth/userStore"));
const { __sessionState } = vi.mocked(await import("@/lib/auth/sessionStore"));

const DAY_MS = 24 * 60 * 60 * 1000;

describe("autoBackup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-02T00:00:00.000Z"));
    __fsState.files.clear();
    __fsState.statErrors.clear();
    __fsState.unlinkErrors.clear();
    __fsState.readdirError = false;
    __settingsStoreState.backups = {
      debounceSeconds: 2,
      directory: "/tmp/backups",
      retentionDays: 10,
      retentionCount: 3
    };
    __settingsStoreState.throwBackups = false;
    __tokenState.tokens = [{ id: "tok1" }];
    __userState.users = [{ id: "user-1" }, { id: "user-2" }];
    __sessionState.sessions = [{ id: "session-1" }];
    __sessionState.exportCalls.length = 0;
    __tokenState.calls = 0;
    __userState.calls = 0;
    autoBackup.resetAutoBackupState();
  });

  afterEach(() => {
    autoBackup.resetAutoBackupState();
    vi.restoreAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  const seedFile = (dir: string, name: string, mtime: number, content = "{}") => {
    const filePath = path.join(dir, name);
    __fsState.files.set(filePath, { mtime, content });
    return filePath;
  };

  it("collects backup payload with reason and user sessions", async () => {
    __tokenState.tokens = [{ id: "tokA" }];
    __userState.users = [{ id: "u1" }, { id: "u2" }];
    __sessionState.sessions = [{ id: "sA" }];

    const payload = await autoBackup.collectBackup("manual");

    expect(payload.reason).toBe("manual");
    expect(payload.tokens).toEqual([{ id: "tokA" }]);
    expect(payload.users).toEqual([{ id: "u1" }, { id: "u2" }]);
    expect(payload.sessions).toEqual([{ id: "sA" }]);
    expect(__sessionState.exportCalls).toEqual([["u1", "u2"]]);
    expect(payload.createdAt).toBe("2024-01-02T00:00:00.000Z");
  });

  it("enforces retention by age and count, tolerating stat failures", async () => {
    const dir = "/tmp/backups";
    const now = Date.now();
    seedFile(dir, "auto-backup-recent.json", now - 1 * 60 * 60 * 1000);
    const oldPath = seedFile(dir, "auto-backup-old.json", now - 2 * DAY_MS);
    seedFile(dir, "auto-backup-1.json", now - 10 * 60 * 1000);
    const oldest = seedFile(dir, "auto-backup-2.json", now - 20 * 60 * 1000);
    seedFile(dir, "ignore.txt", now - 20 * 60 * 1000);
    __fsState.statErrors.add(oldPath);

    await autoBackup.enforceRetention(dir, 1, 2);

    const remainingNames = Array.from(__fsState.files.keys()).map((p) => path.basename(p));
    expect(remainingNames).toContain("auto-backup-1.json");
    expect(remainingNames).toContain("auto-backup-2.json");
    expect(remainingNames).not.toContain("auto-backup-recent.json");
    expect(remainingNames).toContain("ignore.txt");
  });

  it("swallows unlink errors during retention", async () => {
    const dir = "/tmp/backups";
    const target = seedFile(dir, "auto-backup-old.json", Date.now() - 5 * DAY_MS);
    __fsState.unlinkErrors.add(target);

    await expect(autoBackup.enforceRetention(dir, 1, 1)).resolves.not.toThrow();
  });

  it("writes backup file and enforces retention", async () => {
    __settingsStoreState.backups = {
      debounceSeconds: 1,
      directory: "/tmp/backups",
      retentionDays: 5,
      retentionCount: 1
    };
    const stale = path.join("/tmp/backups", "auto-backup-stale.json");
    __fsState.files.set(stale, { content: "stale", mtime: Date.now() - 10 * DAY_MS });

    await autoBackup.writeBackup("nightly");

    const expectedName = "auto-backup-2024-01-02T00-00-00-000Z.json";
    const filePath = path.join("/tmp/backups", expectedName);
    expect(__fsState.files.has(filePath)).toBe(true);
    const stored = __fsState.files.get(filePath);
    expect(stored?.content).toContain('"reason": "nightly"');
    expect(__fsState.files.has(stale)).toBe(false);
  });

  it("debounces scheduled backups and keeps latest reason", async () => {
    __settingsStoreState.backups.debounceSeconds = 1;

    autoBackup.scheduleAutoBackup("first");
    autoBackup.scheduleAutoBackup("second");
    await Promise.resolve();
    await vi.runAllTimersAsync();
    await Promise.resolve();

    const payloads = Array.from(__fsState.files.entries()).map(([filePath, record]) => ({
      filePath,
      payload: JSON.parse(record.content)
    }));
    expect(payloads).toHaveLength(1);
    expect(payloads[0].payload.reason).toBe("second");
  });

  it("retains pending reason when rescheduling without a new one", async () => {
    __settingsStoreState.backups.debounceSeconds = 1;

    autoBackup.scheduleAutoBackup("original");
    autoBackup.scheduleAutoBackup();
    await Promise.resolve();
    await vi.runAllTimersAsync();
    await Promise.resolve();

    const payloads = Array.from(__fsState.files.entries()).map(([filePath, record]) => ({
      filePath,
      payload: JSON.parse(record.content)
    }));
    expect(payloads).toHaveLength(1);
    expect(payloads[0].payload.reason).toBe("original");
  });

  it("logs and skips scheduling when backups config fails", async () => {
    const writeSpy = vi.spyOn(autoBackup, "writeBackup").mockResolvedValue();
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    __settingsStoreState.throwBackups = true;

    autoBackup.scheduleAutoBackup("bad");
    await Promise.resolve();
    await vi.runAllTimersAsync();

    expect(writeSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith("Unable to schedule auto-backup", expect.any(Error));
  });
});

