<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Check, Loader2, Pencil, RefreshCw, Save, Trash2, X } from "lucide-vue-next";
import { useTaskRepository } from "../data/TaskRepositoryContext";
import type { Task, TaskPriority, UpdateTaskInput } from "../domain/tasks";

interface DraftTask {
  title: string;
  notes: string;
  priority: TaskPriority;
  dueAtInput: string;
  estimateInput: string;
}

const repository = useTaskRepository();
const tasks = ref<Task[]>([]);
const editing = ref<string | null>(null);
const draft = ref<DraftTask>({
  title: "",
  notes: "",
  priority: 0,
  dueAtInput: "",
  estimateInput: "",
});
const loading = ref(true);
const error = ref<string | null>(null);

onMounted(() => {
  void load();
});

async function load() {
  loading.value = true;
  error.value = null;
  try {
    tasks.value = await repository.listInbox();
  } catch (e) {
    error.value = String(e);
  } finally {
    loading.value = false;
  }
}

async function completeTask(task: Task) {
  error.value = null;
  try {
    await repository.setStatus(task.id, "completed");
    await load();
  } catch (e) {
    error.value = String(e);
  }
}

async function deleteTask(task: Task) {
  error.value = null;
  try {
    await repository.deleteTask(task.id);
    await load();
  } catch (e) {
    error.value = String(e);
  }
}

function beginEdit(task: Task) {
  editing.value = task.id;
  draft.value = {
    title: task.title,
    notes: task.notes ?? "",
    priority: task.priority,
    dueAtInput: isoToDateTimeInput(task.dueAt),
    estimateInput: task.estimateMin?.toString() ?? "",
  };
}

async function saveEdit(task: Task) {
  if (!draft.value.title.trim()) return;
  const patch: UpdateTaskInput = {
    title: draft.value.title,
    notes: draft.value.notes,
    priority: draft.value.priority,
  };
  if (draft.value.dueAtInput) {
    patch.dueAt = dateTimeInputToIso(draft.value.dueAtInput);
  } else if (task.dueAt) {
    patch.dueAt = null;
  }
  if (draft.value.estimateInput) {
    patch.estimateMin = estimateInputToNumber(draft.value.estimateInput);
  } else if (task.estimateMin != null) {
    patch.estimateMin = null;
  }
  error.value = null;
  try {
    await repository.updateTask(task.id, patch);
    editing.value = null;
    await load();
  } catch (e) {
    error.value = String(e);
  }
}

function isoToDateTimeInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

function dateTimeInputToIso(value: string) {
  return new Date(value).toISOString();
}

function estimateInputToNumber(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function displayError(value: string) {
  return value.replace(/^Error:\s*/, "错误：");
}
</script>

<template>
  <section class="page">
    <header class="page__head">
      <h1>收件箱</h1>
      <span class="page__sub">未分类任务 · 无截止时间的本地队列</span>
    </header>

    <div v-if="loading" class="card state">
      <Loader2 class="spin" :size="18" aria-hidden="true" />
      <p>正在加载收件箱...</p>
    </div>
    <div v-if="error" class="card state state--error">
      <p>{{ displayError(error) }}</p>
      <button type="button" @click="load">
        <RefreshCw :size="16" aria-hidden="true" />
        重试
      </button>
    </div>
    <div v-if="!loading && !error && tasks.length === 0" class="card empty">
      <p>收件箱暂无任务。可在今日页添加任务并选择收件箱。</p>
    </div>
    <ul
      v-if="!loading && !error && tasks.length > 0"
      class="card task-list task-list--roomy"
    >
      <li
        v-for="task in tasks"
        :key="task.id"
        class="task-item task-item--actions"
      >
        <form
          v-if="editing === task.id"
          class="edit-row"
          @submit.prevent="saveEdit(task)"
        >
          <input
            v-model="draft.title"
            :aria-label="`编辑 ${task.title} 标题`"
          />
          <input
            v-model="draft.notes"
            :aria-label="`编辑 ${task.title} 备注`"
            placeholder="备注"
          />
          <select
            v-model.number="draft.priority"
            :aria-label="`编辑 ${task.title} 优先级`"
          >
            <option :value="0">P0</option>
            <option :value="1">P1</option>
            <option :value="2">P2</option>
            <option :value="3">P3</option>
          </select>
          <input
            v-model="draft.dueAtInput"
            :aria-label="`编辑 ${task.title} 截止时间`"
            type="datetime-local"
          />
          <input
            v-model="draft.estimateInput"
            :aria-label="`编辑 ${task.title} 估时分钟`"
            type="number"
            min="1"
            step="1"
            placeholder="min"
          />
          <button type="submit" :aria-label="`保存 ${task.title}`">
            <Save :size="16" aria-hidden="true" />
          </button>
          <button
            type="button"
            :aria-label="`取消 ${task.title}`"
            @click="editing = null"
          >
            <X :size="16" aria-hidden="true" />
          </button>
        </form>
        <template v-else>
          <div class="task-copy">
            <span class="task-title">{{ task.title }}</span>
            <span v-if="task.notes" class="task-meta">{{ task.notes }}</span>
            <span v-if="task.priority > 0" class="task-badge">
              P{{ task.priority }}
            </span>
          </div>
          <div class="task-actions">
            <button
              type="button"
              class="icon-button"
              :aria-label="`完成 ${task.title}`"
              @click="completeTask(task)"
            >
              <Check :size="16" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="icon-button"
              :aria-label="`编辑 ${task.title}`"
              @click="beginEdit(task)"
            >
              <Pencil :size="16" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="icon-button icon-button--danger"
              :aria-label="`删除 ${task.title}`"
              @click="deleteTask(task)"
            >
              <Trash2 :size="16" aria-hidden="true" />
            </button>
          </div>
        </template>
      </li>
    </ul>
  </section>
</template>
