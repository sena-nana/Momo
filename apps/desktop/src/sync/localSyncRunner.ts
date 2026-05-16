import {
  createInMemorySyncStore,
  createSyncApi,
} from "../../../api/src";
import type { TaskRepository } from "../data/taskRepository";
import { createSyncRunner, type SyncRunner } from "./syncClient";

const LOCAL_WORKSPACE_ID = "local";
const LOCAL_DEVICE_ID = "desktop-1";
const localStore = createInMemorySyncStore();

export function createLocalSyncRunner(repository: TaskRepository): SyncRunner {
  return createSyncRunner({
    repository,
    transport: createSyncApi({
      store: localStore,
      now: () => new Date(),
    }),
    workspaceId: LOCAL_WORKSPACE_ID,
    deviceId: LOCAL_DEVICE_ID,
    now: () => new Date(),
  });
}
