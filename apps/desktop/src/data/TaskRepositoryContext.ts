import { inject, type App, type InjectionKey } from "vue";
import {
  createTaskRepository,
  type TaskRepository,
} from "./taskRepository";
import type {
  LocalSyncSimulationResult,
  SyncRunnerRunOnceResult,
} from "../sync/syncClient";
import type { RemoteSyncConfig } from "../sync/remoteSyncConfig";

export type RunLocalSyncSimulation = () => Promise<
  LocalSyncSimulationResult | SyncRunnerRunOnceResult
>;

const defaultRepository = createTaskRepository();

export const TaskRepositoryKey: InjectionKey<TaskRepository> = Symbol(
  "TaskRepository",
);
export const RemoteSyncConfigKey: InjectionKey<RemoteSyncConfig> = Symbol(
  "RemoteSyncConfig",
);
export const RunLocalSyncSimulationKey: InjectionKey<RunLocalSyncSimulation> =
  Symbol("RunLocalSyncSimulation");

export function installTaskRepository(
  app: App,
  repository: TaskRepository = defaultRepository,
) {
  app.provide(TaskRepositoryKey, repository);
}

export function useTaskRepository() {
  const repository = inject(TaskRepositoryKey);
  if (!repository) {
    throw new Error("Task repository is not provided");
  }
  return repository;
}
