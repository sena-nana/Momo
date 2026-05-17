<script setup lang="ts">
import { computed, inject, onMounted, ref } from "vue";
import { Database, Loader2, RefreshCw } from "lucide-vue-next";
import { useTaskRepository } from "../data/TaskRepositoryContext";
import type { DatabaseStats, SyncState } from "../data/taskRepository";
import type {
  LocalSyncSimulationResult,
  PendingConflictSummary,
  SyncRunnerRunOnceResult,
  SyncRunSummary,
} from "../sync/syncClient";
import {
  RemoteSyncConfigKey,
  RunLocalSyncSimulationKey,
} from "../data/TaskRepositoryContext";
import type { RemoteSyncConfig } from "../sync/remoteSyncConfig";

interface SettingsProps {
  pendingConflicts?: PendingConflictSummary[];
  remoteSyncConfig?: RemoteSyncConfig;
  syncSummary?: SyncRunSummary | null;
  onRunLocalSyncSimulation?: () => Promise<
    LocalSyncSimulationResult | SyncRunnerRunOnceResult
  >;
}

const props = withDefaults(defineProps<SettingsProps>(), {
  pendingConflicts: () => [],
  remoteSyncConfig: undefined,
  syncSummary: null,
  onRunLocalSyncSimulation: undefined,
});

const injectedRemoteSyncConfig = inject<RemoteSyncConfig | null>(
  RemoteSyncConfigKey,
  null,
);
const injectedRunLocalSyncSimulation = inject(RunLocalSyncSimulationKey, null);
const repository = useTaskRepository();

const stats = ref<DatabaseStats | null>(null);
const syncState = ref<SyncState | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const simulationResult = ref<LocalSyncSimulationResult | null>(null);
const simulationLoading = ref(false);
const simulationError = ref<string | null>(null);

const remoteSyncConfig = computed(
  () => props.remoteSyncConfig ?? injectedRemoteSyncConfig ?? disabledRemoteSyncConfig(),
);
const remoteSyncEnabled = computed(() => remoteSyncConfig.value.enabled);
const remoteSyncBaseUrl = computed(() =>
  remoteSyncConfig.value.enabled ? remoteSyncConfig.value.baseUrl : "",
);
const remoteSyncReason = computed(() =>
  remoteSyncConfig.value.enabled ? "" : remoteSyncConfig.value.reason,
);
const visibleSyncSummary = computed(
  () => simulationResult.value?.push.summary ?? props.syncSummary ?? null,
);
const visiblePullSummary = computed(() => simulationResult.value?.pull ?? null);
const visibleConflicts = computed(
  () => simulationResult.value?.pendingConflicts ?? props.pendingConflicts,
);
const runLocalSyncSimulation = computed(
  () => props.onRunLocalSyncSimulation ?? injectedRunLocalSyncSimulation,
);

onMounted(() => {
  void load();
});

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const [nextStats, nextSyncState] = await Promise.all([
      repository.getStats(),
      repository.getSyncState(),
    ]);
    stats.value = nextStats;
    syncState.value = nextSyncState;
  } catch (e) {
    stats.value = null;
    syncState.value = null;
    error.value = String(e);
  } finally {
    loading.value = false;
  }
}

async function runSimulation() {
  if (!runLocalSyncSimulation.value) return;
  simulationLoading.value = true;
  simulationError.value = null;
  try {
    const result = await runLocalSyncSimulation.value();
    if (isSyncRunnerRunOnceResult(result)) {
      if (result.ok) {
        simulationResult.value = result.result;
        await load();
      } else {
        simulationResult.value = null;
        simulationError.value = result.error;
        await load();
      }
      return;
    }
    simulationResult.value = result;
    await load();
  } catch (e) {
    simulationError.value = String(e);
  } finally {
    simulationLoading.value = false;
  }
}

function isSyncRunnerRunOnceResult(
  result: LocalSyncSimulationResult | SyncRunnerRunOnceResult,
): result is SyncRunnerRunOnceResult {
  return typeof result === "object" && result !== null && "ok" in result;
}

function disabledRemoteSyncConfig(): RemoteSyncConfig {
  return {
    enabled: false,
    reason: "Remote sync base URL is not configured",
  };
}
</script>

<template>
  <section class="page">
    <header class="page__head">
      <h1>Settings</h1>
      <span class="page__sub">偏好 · 同步 · 模型路由 · 安全</span>
    </header>
    <div class="card">
      <h2>Build</h2>
      <ul class="kv">
        <li><span>Stage</span><b>Foundation / MVP-bootstrap</b></li>
        <li><span>Frontend</span><b>Tauri 2 + Vue 3 + TypeScript</b></li>
        <li><span>Backend</span><b>未接入（本地 MVP）</b></li>
      </ul>
    </div>

    <div class="card">
      <div class="section-title">
        <h2>Local database</h2>
        <Database :size="16" aria-hidden="true" />
      </div>
      <div v-if="error" class="state state--error">
        <p>{{ error }}</p>
        <button type="button" @click="load">
          <RefreshCw :size="16" aria-hidden="true" />
          Retry
        </button>
      </div>
      <div v-if="loading && !error" class="state state--inline">
        <Loader2 class="spin" :size="18" aria-hidden="true" />
        <p>Loading database status...</p>
      </div>
      <ul v-if="stats && !loading && !error" class="kv">
        <li><span>Path</span><b>{{ stats.databasePath }}</b></li>
        <li><span>Total tasks</span><b>{{ stats.totalTasks }}</b></li>
        <li><span>Active</span><b>{{ stats.activeTasks }}</b></li>
        <li><span>Completed</span><b>{{ stats.completedTasks }}</b></li>
        <li><span>Pending sync</span><b>{{ stats.pendingLocalChanges }}</b></li>
      </ul>
    </div>

    <div v-if="syncState && !loading && !error" class="card">
      <div class="section-title">
        <h2>Sync state</h2>
      </div>
      <ul class="kv">
        <li><span>Server cursor</span><b>{{ syncState.serverCursor ?? "none" }}</b></li>
        <li><span>Last synced</span><b>{{ syncState.lastSyncedAt ?? "Never synced" }}</b></li>
        <li><span>Last error</span><b>{{ syncState.lastError ?? "None" }}</b></li>
        <li><span>Updated</span><b>{{ syncState.updatedAt ?? "Not recorded" }}</b></li>
      </ul>
    </div>

    <div class="card">
      <div class="section-title">
        <h2>Remote sync config</h2>
        <span class="pill">{{ remoteSyncEnabled ? "enabled" : "disabled" }}</span>
      </div>
      <ul class="kv">
        <template v-if="remoteSyncEnabled">
          <li><span>Base URL</span><b>{{ remoteSyncBaseUrl }}</b></li>
          <li><span>Auth token</span><b>Configured</b></li>
        </template>
        <li v-else><span>Reason</span><b>{{ remoteSyncReason }}</b></li>
        <li><span>Sync action</span><b>Local simulation</b></li>
      </ul>
    </div>

    <div v-if="runLocalSyncSimulation" class="card">
      <div class="section-title">
        <h2>Local sync simulation</h2>
      </div>
      <button type="button" :disabled="simulationLoading" @click="runSimulation">
        <Loader2 v-if="simulationLoading" class="spin" :size="16" aria-hidden="true" />
        Run local sync simulation
      </button>
      <p v-if="simulationError" class="err">
        Error: {{ simulationError.replace(/^Error:\s*/, "") }}
      </p>
    </div>

    <div v-if="visibleConflicts.length > 0" class="card">
      <div class="section-title">
        <h2>Sync conflicts</h2>
        <span class="pill">{{ visibleConflicts.length }}</span>
      </div>
      <ul class="conflict-list">
        <li v-for="conflict in visibleConflicts" :key="conflict.id">
          <div>
            <strong>{{ conflict.serverTaskTitle ?? conflict.taskId }}</strong>
            <span v-if="conflict.serverTaskVersion !== null" class="muted">
              v{{ conflict.serverTaskVersion }}
            </span>
          </div>
          <p>{{ conflict.clientPayloadSummary }}</p>
        </li>
      </ul>
    </div>

    <div v-if="visibleSyncSummary" class="card">
      <div class="section-title">
        <h2>Sync status</h2>
        <span class="pill">{{ visibleSyncSummary.status }}</span>
      </div>
      <p class="empty-text">{{ visibleSyncSummary.message }}</p>
      <ul class="kv">
        <li><span>Accepted</span><b>{{ visibleSyncSummary.acceptedCount }}</b></li>
        <li><span>Rejected</span><b>{{ visibleSyncSummary.rejectedCount }}</b></li>
        <li><span>Conflicts</span><b>{{ visibleSyncSummary.conflictCount }}</b></li>
        <li><span>Cursor</span><b>{{ visibleSyncSummary.serverCursor }}</b></li>
      </ul>
    </div>

    <div v-if="visiblePullSummary" class="card">
      <div class="section-title">
        <h2>Pull applied</h2>
      </div>
      <ul class="kv">
        <li><span>Applied tasks</span><b>{{ visiblePullSummary.appliedTaskCount }}</b></li>
        <li><span>Deleted tasks</span><b>{{ visiblePullSummary.deletedTaskCount }}</b></li>
        <li><span>Pull cursor</span><b>{{ visiblePullSummary.serverCursor }}</b></li>
      </ul>
    </div>
  </section>
</template>
