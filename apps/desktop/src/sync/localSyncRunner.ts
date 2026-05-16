import {
  createApiRouter,
  createInMemorySyncStore,
  createInMemoryTaskRepository,
  createSyncApi,
  createTaskService,
} from "../../../api/src";
import type { TaskRepository } from "../data/taskRepository";
import { createHttpLikeSyncTransport } from "./httpLikeSyncTransport";
import { createSyncRunner, type SyncRunner } from "./syncClient";

const LOCAL_WORKSPACE_ID = "local";
const LOCAL_DEVICE_ID = "desktop-1";
const localStore = createInMemorySyncStore();
const localTaskRepository = createInMemoryTaskRepository();

export function createLocalSyncRunner(repository: TaskRepository): SyncRunner {
  const router = createApiRouter({
    taskService: createTaskService({
      repository: localTaskRepository,
      now: () => new Date(),
    }),
    syncApi: createSyncApi({
      store: localStore,
      now: () => new Date(),
    }),
  });

  return createSyncRunner({
    repository,
    transport: createHttpLikeSyncTransport({ router }),
    workspaceId: LOCAL_WORKSPACE_ID,
    deviceId: LOCAL_DEVICE_ID,
    now: () => new Date(),
  });
}
