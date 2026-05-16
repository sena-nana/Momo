<script setup lang="ts">
import { onMounted, ref } from "vue";
import { CalendarDays, Loader2, RefreshCw } from "lucide-vue-next";
import { useTaskRepository } from "../data/TaskRepositoryContext";
import type { Task } from "../domain/tasks";

const repository = useTaskRepository();
const tasks = ref<Task[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

onMounted(() => {
  void load();
});

async function load() {
  loading.value = true;
  error.value = null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  try {
    tasks.value = await repository.listAgenda(start, end);
  } catch (e) {
    error.value = String(e);
  } finally {
    loading.value = false;
  }
}

function formatAgendaDate(value: string | null) {
  if (!value) return "Unscheduled";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
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
      <h1>Calendar</h1>
      <span class="page__sub">Next 7 days</span>
    </header>

    <div v-if="loading" class="card state">
      <Loader2 class="spin" :size="18" aria-hidden="true" />
      <p>Loading agenda...</p>
    </div>
    <div v-if="error" class="card state state--error">
      <p>{{ error }}</p>
      <button type="button" @click="load">
        <RefreshCw :size="16" aria-hidden="true" />
        Retry
      </button>
    </div>
    <div v-if="!loading && !error && tasks.length === 0" class="card empty">
      <CalendarDays :size="20" aria-hidden="true" />
      <p>No scheduled tasks in the next 7 days.</p>
    </div>
    <ol v-if="!loading && !error && tasks.length > 0" class="timeline">
      <li v-for="task in tasks" :key="task.id" class="timeline__item">
        <time>{{ formatAgendaDate(task.dueAt) }}</time>
        <div>
          <b>{{ task.title }}</b>
          <p v-if="task.notes">{{ task.notes }}</p>
        </div>
      </li>
    </ol>
  </section>
</template>
