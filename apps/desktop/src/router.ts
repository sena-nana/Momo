import {
  createRouter,
  createWebHistory,
  type RouterHistory,
} from "vue-router";
import AppShell from "./layouts/AppShell.vue";
import Login from "./pages/Login.vue";
import Today from "./pages/Today.vue";
import Inbox from "./pages/Inbox.vue";
import Calendar from "./pages/Calendar.vue";
import Settings from "./pages/Settings.vue";
import Widget from "./pages/Widget.vue";

export function createMomoRouter(history: RouterHistory = createWebHistory()) {
  return createRouter({
    history,
    routes: [
      { path: "/login", component: Login },
      { path: "/widget", component: Widget },
      {
        path: "/",
        component: AppShell,
        children: [
          { path: "", redirect: "/today" },
          { path: "today", component: Today },
          { path: "inbox", component: Inbox },
          { path: "calendar", component: Calendar },
          { path: "settings", component: Settings },
        ],
      },
      { path: "/:pathMatch(.*)*", redirect: "/today" },
    ],
  });
}

export const router = createMomoRouter();
