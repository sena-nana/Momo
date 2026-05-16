<script setup lang="ts">
import { ref } from "vue";
import { RouterLink, RouterView } from "vue-router";
import { PanelTopOpen } from "lucide-vue-next";
import { openWidgetWindow } from "../window/widgetWindow";

const nav = [
  { to: "/today", label: "Today" },
  { to: "/inbox", label: "Inbox" },
  { to: "/calendar", label: "Calendar" },
  { to: "/settings", label: "Settings" },
];

const widgetError = ref<string | null>(null);

async function onOpenWidget() {
  widgetError.value = null;
  try {
    await openWidgetWindow();
  } catch (e) {
    widgetError.value = String(e);
  }
}
</script>

<template>
  <div class="shell">
    <aside class="shell__sidebar">
      <div class="shell__brand">Momo</div>
      <nav class="shell__nav">
        <RouterLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="shell__nav-item"
          active-class="is-active"
        >
          {{ item.label }}
        </RouterLink>
      </nav>
      <div class="shell__footer">
        <button
          type="button"
          class="shell__widget-button"
          @click="onOpenWidget"
        >
          <PanelTopOpen :size="16" aria-hidden="true" />
          Open widget
        </button>
        <p v-if="widgetError" class="shell__error">{{ widgetError }}</p>
        <RouterLink to="/login" class="shell__nav-item">Sign out</RouterLink>
      </div>
    </aside>
    <main class="shell__main">
      <RouterView />
    </main>
  </div>
</template>
