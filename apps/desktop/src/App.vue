<script setup lang="ts">
import { provide } from "vue";
import { RouterView } from "vue-router";
import {
  RemoteSyncConfigKey,
  RunLocalSyncSimulationKey,
  useTaskRepository,
} from "./data/TaskRepositoryContext";
import { createLocalSyncRunner } from "./sync/localSyncRunner";
import {
  createRemoteSyncConfig,
  type RemoteSyncEnv,
} from "./sync/remoteSyncConfig";

const repository = useTaskRepository();
const localSyncRunner = createLocalSyncRunner(repository);

provide(
  RemoteSyncConfigKey,
  createRemoteSyncConfig(readRemoteSyncEnv(import.meta.env)),
);
provide(RunLocalSyncSimulationKey, () => localSyncRunner.runOnce());

function readRemoteSyncEnv(env: ImportMetaEnv): RemoteSyncEnv {
  return {
    VITE_MOMO_SYNC_BASE_URL: env.VITE_MOMO_SYNC_BASE_URL,
    VITE_MOMO_SYNC_TOKEN: env.VITE_MOMO_SYNC_TOKEN,
  };
}
</script>

<template>
  <RouterView />
</template>
