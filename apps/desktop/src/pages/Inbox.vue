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
</script>

<template>
  <section class="page">
    <header class="page__head">
      <h1>Inbox</h1>
      <span class="page__sub">未分类任务 · 无截止时间的本地队列</span>
    </header>

    <div v-if="loading" class="card state">
      <Loader2 class="spin" :size="18" aria-hidden="true" />
      <p>Loading inbox...</p>
    </div>
    <div v-if="error" class="card state state--error">
      <p>{{ error }}</p>
      <button type="button" @click="load">
        <RefreshCw :size="16" aria-hidden="true" />
        Retry
      </button>
    </div>
    <div v-if="!loading && !error && tasks.length === 0" class="card empty">
      <p>No inbox tasks. Add one from Today and choose Inbox.</p>
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
            :aria-label="`Edit ${task.title} title`"
          />
          <input
            v-model="draft.notes"
            :aria-label="`Edit ${task.title} notes`"
            placeholder="Notes"
          />
          <select
            v-model.number="draft.priority"
            :aria-label="`Edit ${task.title} priority`"
          >
            <option :value="0">P0</option>
            <option :value="1">P1</option>
            <option :value="2">P2</option>
            <option :value="3">P3</option>
          </select>
          <input
            v-model="draft.dueAtInput"
            :aria-label="`Edit ${task.title} due date`"
            type="datetime-local"
          />
          <input
            v-model="draft.estimateInput"
            :aria-label="`Edit ${task.title} estimate minutes`"
            type="number"
            min="1"
            step="1"
            placeholder="min"
          />
          <button type="submit" :aria-label="`Save ${task.title}`">
            <Save :size="16" aria-hidden="true" />
          </button>
          <button
            type="button"
            :aria-label="`Cancel ${task.title}`"
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
              :aria-label="`Complete ${task.title}`"
              @click="completeTask(task)"
            >
              <Check :size="16" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="icon-button"
              :aria-label="`Edit ${task.title}`"
              @click="beginEdit(task)"
            >
              <Pencil :size="16" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="icon-button icon-button--danger"
              :aria-label="`Delete ${task.title}`"
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
