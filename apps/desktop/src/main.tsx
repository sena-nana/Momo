import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { TaskRepositoryProvider } from "./data/TaskRepositoryContext";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <TaskRepositoryProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </TaskRepositoryProvider>
  </React.StrictMode>,
);
