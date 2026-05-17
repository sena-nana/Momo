import { createHttpSyncTransport, type FetchLike } from "./httpSyncTransport";
import type { RemoteSyncConfig } from "./remoteSyncConfig";
import {
  createSyncRunner,
  type SyncRunner,
  type SyncRunnerOptions,
} from "./syncClient";

export interface CreateRemoteSyncRunnerOptions {
  remoteSyncConfig: RemoteSyncConfig;
  repository: SyncRunnerOptions["repository"];
  workspaceId: string;
  deviceId: string;
  now: () => Date;
  fetch: FetchLike;
}

export type RemoteSyncRunnerResolution =
  | {
    kind: "disabled";
    reason: string;
    runner: null;
  }
  | {
    kind: "enabled";
    runner: SyncRunner;
  };

export function createRemoteSyncRunner({
  remoteSyncConfig,
  repository,
  workspaceId,
  deviceId,
  now,
  fetch,
}: CreateRemoteSyncRunnerOptions): RemoteSyncRunnerResolution {
  if (!remoteSyncConfig.enabled) {
    return {
      kind: "disabled",
      reason: remoteSyncConfig.reason,
      runner: null,
    };
  }

  return {
    kind: "enabled",
    runner: createSyncRunner({
      repository,
      transport: createHttpSyncTransport({
        baseUrl: remoteSyncConfig.baseUrl,
        fetch,
        headers: remoteSyncConfig.headers,
      }),
      workspaceId,
      deviceId,
      now,
    }),
  };
}
