<script setup lang="ts">
import { computed, inject, onMounted, ref } from "vue";
import { Database, Loader2, RefreshCw } from "lucide-vue-next";
import { useTaskRepository } from "../data/TaskRepositoryContext";
import type { DatabaseStats, SyncRun, SyncState } from "../data/taskRepository";
import type {
  LocalSyncSimulationResult,
  PendingConflictDetailSummary,
  PendingConflictSummary,
  PendingLocalChangeSummary,
  RejectedChangeSummary,
  SyncRunnerRunOnceResult,
  SyncRunSummary,
} from "../sync/syncClient";
import {
  summarizePendingConflictDetails,
  summarizePendingLocalChanges,
  summarizeRejectedChanges,
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
const syncRuns = ref<SyncRun[]>([]);
const pendingChanges = ref<PendingLocalChangeSummary[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const syncRunsLoading = ref(false);
const syncRunsError = ref<string | null>(null);
const pendingChangesLoading = ref(false);
const pendingChangesError = ref<string | null>(null);
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
const visibleRejections = computed<RejectedChangeSummary[]>(() =>
  summarizeRejectedChanges(
    simulationResult.value?.push.rejectedChanges ?? [],
    pendingChanges.value,
  ),
);
const visibleConflicts = computed<PendingConflictDetailSummary[]>(() =>
  summarizePendingConflictDetails(
    simulationResult.value?.pendingConflicts ?? props.pendingConflicts,
    pendingChanges.value,
  ),
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
  syncRunsError.value = null;
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

  await Promise.all([loadSyncRuns(), loadPendingChanges()]);
}

async function loadSyncRuns() {
  syncRunsLoading.value = true;
  syncRunsError.value = null;
  try {
    syncRuns.value = await repository.listRecentSyncRuns(3);
  } catch (e) {
    syncRuns.value = [];
    syncRunsError.value = String(e);
  } finally {
    syncRunsLoading.value = false;
  }
}

async function loadPendingChanges() {
  pendingChangesLoading.value = true;
  pendingChangesError.value = null;
  try {
    const changes = await repository.listPendingChanges();
    pendingChanges.value = summarizePendingLocalChanges(changes, 5);
  } catch (e) {
    pendingChanges.value = [];
    pendingChangesError.value = String(e);
  } finally {
    pendingChangesLoading.value = false;
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
    reason: "未配置远程同步 base URL",
  };
}

function displayError(value: string) {
  const message = value.replace(/^Error:\s*/, "");
  return `错误：${message}`;
}
</script>

<template>
  <section class="page">
    <header class="page__head">
      <h1>设置</h1>
      <span class="page__sub">偏好 · 同步 · 模型路由 · 安全</span>
    </header>
    <div class="card">
      <h2>构建</h2>
      <ul class="kv">
        <li><span>阶段</span><b>Foundation / MVP-bootstrap</b></li>
        <li><span>前端</span><b>Tauri 2 + Vue 3 + TypeScript</b></li>
        <li><span>后端</span><b>未接入（本地 MVP）</b></li>
      </ul>
    </div>

    <div class="card">
      <div class="section-title">
        <h2>本地数据库</h2>
        <Database :size="16" aria-hidden="true" />
      </div>
      <div v-if="error" class="state state--error">
        <p>{{ displayError(error) }}</p>
        <button type="button" @click="load">
          <RefreshCw :size="16" aria-hidden="true" />
          重试
        </button>
      </div>
      <div v-if="loading && !error" class="state state--inline">
        <Loader2 class="spin" :size="18" aria-hidden="true" />
        <p>正在加载数据库状态...</p>
      </div>
      <ul v-if="stats && !loading && !error" class="kv">
        <li><span>路径</span><b>{{ stats.databasePath }}</b></li>
        <li><span>任务总数</span><b>{{ stats.totalTasks }}</b></li>
        <li><span>进行中</span><b>{{ stats.activeTasks }}</b></li>
        <li><span>已完成</span><b>{{ stats.completedTasks }}</b></li>
        <li><span>待同步</span><b>{{ stats.pendingLocalChanges }}</b></li>
      </ul>
    </div>

    <div v-if="syncState && !loading && !error" class="card">
      <div class="section-title">
        <h2>同步状态</h2>
      </div>
      <ul class="kv">
        <li><span>服务端游标</span><b>{{ syncState.serverCursor ?? "无" }}</b></li>
        <li><span>最近同步</span><b>{{ syncState.lastSyncedAt ?? "从未同步" }}</b></li>
        <li><span>最近错误</span><b>{{ syncState.lastError ?? "无" }}</b></li>
        <li><span>更新时间</span><b>{{ syncState.updatedAt ?? "未记录" }}</b></li>
      </ul>
    </div>

    <div
      v-if="(pendingChanges.length > 0 || pendingChangesError) && !loading && !error"
      class="card"
    >
      <div class="section-title">
        <h2>待同步变更</h2>
        <span class="pill">{{ pendingChanges.length }}</span>
      </div>
      <div v-if="pendingChangesError" class="state state--error">
        <p>{{ displayError(pendingChangesError) }}</p>
        <button type="button" :disabled="pendingChangesLoading" @click="loadPendingChanges">
          <RefreshCw :size="16" aria-hidden="true" />
          重试待同步变更
        </button>
      </div>
      <ul class="conflict-list">
        <li v-for="change in pendingChanges" :key="change.id">
          <div>
            <strong>{{ change.id }}</strong>
            <span class="pill">{{ change.action }}</span>
          </div>
          <p>{{ change.entityLabel }}</p>
          <p>{{ change.payloadSummary }}</p>
          <p class="muted">创建于 {{ change.createdAt }}</p>
        </li>
      </ul>
    </div>

    <div v-if="(syncRuns.length > 0 || syncRunsError) && !loading && !error" class="card">
      <div class="section-title">
        <h2>同步历史</h2>
        <span class="pill">{{ syncRuns.length }}</span>
      </div>
      <div v-if="syncRunsError" class="state state--error">
        <p>{{ displayError(syncRunsError) }}</p>
        <button type="button" :disabled="syncRunsLoading" @click="loadSyncRuns">
          <RefreshCw :size="16" aria-hidden="true" />
          重试同步历史
        </button>
      </div>
      <ul class="conflict-list">
        <li v-for="run in syncRuns" :key="run.id">
          <div>
            <strong>{{ run.message }}</strong>
            <span class="pill">{{ run.status }}</span>
          </div>
          <p>游标：<span>{{ run.serverCursor ?? "无" }}</span></p>
          <p class="muted">开始 {{ run.startedAt }} · 完成 {{ run.finishedAt }}</p>
        </li>
      </ul>
    </div>

    <div class="card">
      <div class="section-title">
        <h2>远程同步配置</h2>
        <span class="pill">{{ remoteSyncEnabled ? "已启用" : "已禁用" }}</span>
      </div>
      <ul class="kv">
        <template v-if="remoteSyncEnabled">
          <li><span>Base URL</span><b>{{ remoteSyncBaseUrl }}</b></li>
          <li><span>认证 token</span><b>已配置</b></li>
        </template>
        <li v-else><span>原因</span><b>{{ remoteSyncReason }}</b></li>
        <li><span>同步动作</span><b>本地模拟</b></li>
      </ul>
    </div>

    <div v-if="runLocalSyncSimulation" class="card">
      <div class="section-title">
        <h2>本地同步模拟</h2>
      </div>
      <button type="button" :disabled="simulationLoading" @click="runSimulation">
        <Loader2 v-if="simulationLoading" class="spin" :size="16" aria-hidden="true" />
        运行本地同步模拟
      </button>
      <p v-if="simulationError" class="err">
        {{ displayError(simulationError) }}
      </p>
    </div>

    <div v-if="visibleConflicts.length > 0" class="card">
      <div class="section-title">
        <h2>同步冲突</h2>
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
          <template v-if="conflict.localChange">
            <div>
              <span class="pill">{{ conflict.localChange.action }}</span>
            </div>
            <p>{{ conflict.localChange.entityLabel }}</p>
            <p>本地变更创建于 {{ conflict.localChange.createdAt }}</p>
          </template>
        </li>
      </ul>
    </div>

    <div v-if="visibleSyncSummary" class="card">
      <div class="section-title">
        <h2>同步状态</h2>
        <span class="pill">{{ visibleSyncSummary.status }}</span>
      </div>
      <p class="empty-text">{{ visibleSyncSummary.message }}</p>
      <ul class="kv">
        <li><span>已接受</span><b>{{ visibleSyncSummary.acceptedCount }}</b></li>
        <li><span>已拒绝</span><b>{{ visibleSyncSummary.rejectedCount }}</b></li>
        <li><span>冲突</span><b>{{ visibleSyncSummary.conflictCount }}</b></li>
        <li><span>游标</span><b>{{ visibleSyncSummary.serverCursor }}</b></li>
      </ul>
    </div>

    <div v-if="visibleRejections.length > 0" class="card">
      <div class="section-title">
        <h2>同步拒绝</h2>
        <span class="pill">{{ visibleRejections.length }}</span>
      </div>
      <ul class="conflict-list">
        <li v-for="rejection in visibleRejections" :key="rejection.id">
          <div>
            <strong>{{ rejection.id }}</strong>
            <span v-if="rejection.localChange" class="pill">
              {{ rejection.localChange.action }}
            </span>
          </div>
          <p>{{ rejection.reason }}</p>
          <template v-if="rejection.localChange">
            <p>{{ rejection.localChange.entityLabel }}</p>
            <p>{{ rejection.localChange.payloadSummary }}</p>
          </template>
        </li>
      </ul>
    </div>

    <div v-if="visiblePullSummary" class="card">
      <div class="section-title">
        <h2>已应用拉取结果</h2>
      </div>
      <ul class="kv">
        <li><span>已应用任务</span><b>{{ visiblePullSummary.appliedTaskCount }}</b></li>
        <li><span>已删除任务</span><b>{{ visiblePullSummary.deletedTaskCount }}</b></li>
        <li><span>拉取游标</span><b>{{ visiblePullSummary.serverCursor }}</b></li>
      </ul>
    </div>
  </section>
</template>
