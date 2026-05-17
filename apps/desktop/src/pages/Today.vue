<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Check, Loader2, Plus, RefreshCw } from "lucide-vue-next";
import { useTaskRepository } from "../data/TaskRepositoryContext";
import type { TodayTaskGroups } from "../domain/tasks";

const repository = useTaskRepository();
const groups = ref<TodayTaskGroups>({
  overdue: [],
  dueToday: [],
  completedToday: [],
});
const title = ref("");
const destination = ref<"today" | "inbox">("today");
const dueAtInput = ref("");
const estimateInput = ref("");
const loading = ref(true);
const saving = ref(false);
const error = ref<string | null>(null);

onMounted(() => {
  void load();
});

async function load() {
  loading.value = true;
  error.value = null;
  try {
    groups.value = await repository.listToday(new Date());
  } catch (e) {
    error.value = String(e);
  } finally {
    loading.value = false;
  }
}

async function onQuickAdd() {
  if (!title.value.trim()) return;
  saving.value = true;
  error.value = null;
  try {
    await repository.createTask({
      title: title.value,
      dueAt:
        destination.value === "today"
          ? dueAtInputToIso(dueAtInput.value) ?? defaultTodayDueAt()
          : null,
      estimateMin: estimateInputToNumber(estimateInput.value),
    });
    title.value = "";
    dueAtInput.value = "";
    estimateInput.value = "";
    await load();
  } catch (e) {
    error.value = String(e);
  } finally {
    saving.value = false;
  }
}

function dueAtInputToIso(value: string) {
  if (!value) return null;
  return new Date(value).toISOString();
}

function estimateInputToNumber(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function defaultTodayDueAt() {
  const due = new Date();
  due.setHours(12, 0, 0, 0);
  return due.toISOString();
}

function formatDateTime(value: string | null) {
  if (!value) return "无时间";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
</script>

<template>
  <section class="page">
    <header class="page__head">
      <h1>今日</h1>
      <span class="page__sub">今日任务 · 逾期提醒 · 完成回看</span>
    </header>

    <form class="quick-add" @submit.prevent="onQuickAdd">
      <label class="sr-only" for="today-quick-add">快速添加任务</label>
      <div class="row">
        <input
          id="today-quick-add"
          v-model="title"
          placeholder="添加今日任务"
        />
        <label class="sr-only" for="task-destination">任务归属</label>
        <select id="task-destination" v-model="destination">
          <option value="today">今日</option>
          <option value="inbox">收件箱</option>
        </select>
        <label class="sr-only" for="task-due-at">任务截止时间</label>
        <input
          id="task-due-at"
          v-model="dueAtInput"
          type="datetime-local"
          :disabled="destination === 'inbox'"
        />
        <label class="sr-only" for="task-estimate">任务估时分钟</label>
        <input
          id="task-estimate"
          v-model="estimateInput"
          class="estimate-input"
          type="number"
          min="1"
          step="1"
          placeholder="min"
        />
        <button type="submit" :disabled="saving || !title.trim()">
          <Plus :size="16" aria-hidden="true" />
          {{ destination === "today" ? "添加到今日" : "添加任务" }}
        </button>
      </div>
    </form>

    <div v-if="loading" class="card state">
      <Loader2 class="spin" :size="18" aria-hidden="true" />
      <p>正在加载本地任务...</p>
    </div>
    <div v-if="error" class="card state state--error">
      <p>{{ error }}</p>
      <button type="button" @click="load">
        <RefreshCw :size="16" aria-hidden="true" />
        重试
      </button>
    </div>

    <div v-if="!loading && !error" class="task-grid">
      <section class="card task-section">
        <div class="section-title">
          <h2>已逾期</h2>
        </div>
        <p v-if="groups.overdue.length === 0" class="empty-text">暂无内容。</p>
        <ul v-else class="task-list">
          <li v-for="task in groups.overdue" :key="task.id" class="task-item">
            <span class="task-title is-danger">{{ task.title }}</span>
            <span class="task-meta">
              {{ formatDateTime(task.dueAt ?? task.completedAt) }}
            </span>
          </li>
        </ul>
      </section>

      <section class="card task-section">
        <div class="section-title">
          <h2>今日到期</h2>
        </div>
        <p v-if="groups.dueToday.length === 0" class="empty-text">暂无内容。</p>
        <ul v-else class="task-list">
          <li v-for="task in groups.dueToday" :key="task.id" class="task-item">
            <span class="task-title">{{ task.title }}</span>
            <span class="task-meta">
              {{ formatDateTime(task.dueAt ?? task.completedAt) }}
            </span>
          </li>
        </ul>
      </section>

      <section class="card task-section">
        <div class="section-title">
          <h2>今日完成</h2>
          <Check :size="16" aria-hidden="true" />
        </div>
        <p v-if="groups.completedToday.length === 0" class="empty-text">
          暂无内容。
        </p>
        <ul v-else class="task-list">
          <li
            v-for="task in groups.completedToday"
            :key="task.id"
            class="task-item"
          >
            <span class="task-title">{{ task.title }}</span>
            <span class="task-meta">
              {{ formatDateTime(task.dueAt ?? task.completedAt) }}
            </span>
          </li>
        </ul>
      </section>
    </div>
  </section>
</template>
