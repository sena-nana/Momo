<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { AlertCircle, CheckCircle2, Clock, Loader2 } from "lucide-vue-next";
import { useTaskRepository } from "../data/TaskRepositoryContext";
import type { TodayTaskGroups } from "../domain/tasks";

const repository = useTaskRepository();
const groups = ref<TodayTaskGroups>({
  overdue: [],
  dueToday: [],
  completedToday: [],
});
const loading = ref(true);
const error = ref<string | null>(null);
const activeTaskCount = computed(
  () => groups.value.overdue.length + groups.value.dueToday.length,
);
const completedPreview = computed(() => groups.value.completedToday.slice(0, 3));

onMounted(() => {
  void load();
});

async function load() {
  try {
    groups.value = await repository.listToday(new Date());
  } catch (e) {
    error.value = String(e);
  } finally {
    loading.value = false;
  }
}

function formatToday() {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date());
}
</script>

<template>
  <main class="widget">
    <header class="widget__header">
      <div>
        <h1>Momo 小组件</h1>
        <p>{{ formatToday() }}</p>
      </div>
      <span>{{ activeTaskCount }}</span>
    </header>

    <div v-if="loading" class="widget__state">
      <Loader2 class="spin" :size="18" aria-hidden="true" />
      <p>正在加载...</p>
    </div>
    <div v-if="error" class="widget__state widget__state--error">
      <AlertCircle :size="18" aria-hidden="true" />
      <p>{{ error }}</p>
    </div>
    <template v-if="!loading && !error">
      <section class="widget-section">
        <div class="widget-section__title">
          <AlertCircle :size="15" aria-hidden="true" />
          <h2>已逾期</h2>
        </div>
        <p v-if="groups.overdue.length === 0" class="widget__empty">
          暂无内容。
        </p>
        <ul v-else>
          <li v-for="task in groups.overdue.slice(0, 4)" :key="task.id" class="is-urgent">
            <span>{{ task.title }}</span>
          </li>
        </ul>
      </section>

      <section class="widget-section">
        <div class="widget-section__title">
          <Clock :size="15" aria-hidden="true" />
          <h2>今日</h2>
        </div>
        <p v-if="groups.dueToday.length === 0" class="widget__empty">
          暂无内容。
        </p>
        <ul v-else>
          <li v-for="task in groups.dueToday.slice(0, 4)" :key="task.id">
            <span>{{ task.title }}</span>
          </li>
        </ul>
      </section>

      <section class="widget-section">
        <div class="widget-section__title">
          <CheckCircle2 :size="15" aria-hidden="true" />
          <h2>已完成</h2>
        </div>
        <p v-if="completedPreview.length === 0" class="widget__empty">
          暂无内容。
        </p>
        <ul v-else>
          <li v-for="task in completedPreview" :key="task.id">
            <span>{{ task.title }}</span>
          </li>
        </ul>
      </section>
    </template>
  </main>
</template>
