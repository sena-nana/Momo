import { createApp } from "vue";
import App from "./App.vue";
import { installTaskRepository } from "./data/TaskRepositoryContext";
import { router } from "./router";
import "./styles.css";

const app = createApp(App);
installTaskRepository(app);
app.use(router);
app.mount("#root");
