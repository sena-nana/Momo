<script setup lang="ts">
import { provide } from "vue";
import { RouterView } from "vue-router";
import {
  RemoteSyncConfigKey,
  RunLocalSyncSimulationKey,
  useTaskRepository,
} from "./data/TaskRepositoryContext";
import { createDefaultSettingsSyncRuntime } from "./sync/defaultSettingsSyncRuntime";
import {
  createRemoteSyncConfig,
  type RemoteSyncEnv,
} from "./sync/remoteSyncConfig";

const repository = useTaskRepository();
const settingsSyncRuntime = createDefaultSettingsSyncRuntime({
  repository,
  remoteSyncConfig: createRemoteSyncConfig(readRemoteSyncEnv(import.meta.env)),
});

provide(RemoteSyncConfigKey, settingsSyncRuntime.remoteSyncConfig);
provide(RunLocalSyncSimulationKey, settingsSyncRuntime.runLocalSyncSimulation);

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
