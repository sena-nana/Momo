import { describe, expect, it, vi } from "vitest";
import type { TaskRepository } from "../src/data/taskRepository";
import { createDefaultSettingsSyncRuntime } from "../src/sync/defaultSettingsSyncRuntime";
import { createLocalSyncRunner } from "../src/sync/localSyncRunner";
import type { RemoteSyncConfig } from "../src/sync/remoteSyncConfig";

vi.mock("../src/sync/localSyncRunner", () => ({
  createLocalSyncRunner: vi.fn(() => ({
    runOnce: vi.fn().mockResolvedValue({
      ok: true,
      result: null,
    }),
  })),
}));

describe("default settings sync runtime", () => {
  it("keeps the default settings runtime on the local runner only", () => {
    const repository = {
      listPendingChanges: vi.fn(),
      markChangeSynced: vi.fn(),
      getSyncState: vi.fn(),
      applyRemoteTask: vi.fn(),
      deleteRemoteTask: vi.fn(),
      saveSyncState: vi.fn(),
    } as unknown as TaskRepository;
    const remoteSyncConfig: RemoteSyncConfig = {
      enabled: true,
      baseUrl: "https://api.example.test/momo",
      headers: async () => ({ authorization: "Bearer remote-token" }),
    };

    const runtime = createDefaultSettingsSyncRuntime({
      repository,
      remoteSyncConfig,
    });

    expect(createLocalSyncRunner).toHaveBeenCalledTimes(1);
    expect(createLocalSyncRunner).toHaveBeenCalledWith(repository);
    expect(runtime.remoteSyncConfig).toBe(remoteSyncConfig);
    expect(runtime.runLocalSyncSimulation).toEqual(expect.any(Function));
  });
});
