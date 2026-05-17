import type { TaskRepository } from "../data/taskRepository";
import { createLocalSyncRunner } from "./localSyncRunner";
import type { RemoteSyncConfig } from "./remoteSyncConfig";
import type { SyncRunnerRunOnceResult } from "./syncClient";

export interface DefaultSettingsSyncRuntimeOptions {
  repository: TaskRepository;
  remoteSyncConfig: RemoteSyncConfig;
}

export interface DefaultSettingsSyncRuntime {
  remoteSyncConfig: RemoteSyncConfig;
  runLocalSyncSimulation: () => Promise<SyncRunnerRunOnceResult>;
}

export function createDefaultSettingsSyncRuntime({
  repository,
  remoteSyncConfig,
}: DefaultSettingsSyncRuntimeOptions): DefaultSettingsSyncRuntime {
  const localSyncRunner = createLocalSyncRunner(repository);

  return {
    remoteSyncConfig,
    runLocalSyncSimulation: () => localSyncRunner.runOnce(),
  };
}
