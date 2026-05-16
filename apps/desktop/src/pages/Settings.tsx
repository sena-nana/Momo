import { useEffect, useState } from "react";
import { Database, Loader2 } from "lucide-react";
import { useTaskRepository } from "../data/TaskRepositoryContext";
import type { DatabaseStats } from "../data/taskRepository";

export default function Settings() {
  const repository = useTaskRepository();
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setStats(await repository.getStats());
      } catch (e) {
        setError(String(e));
      }
    }

    void load();
  }, []);

  return (
    <section className="page">
      <header className="page__head">
        <h1>Settings</h1>
        <span className="page__sub">偏好 · 同步 · 模型路由 · 安全</span>
      </header>
      <div className="card">
        <h2>Build</h2>
        <ul className="kv">
          <li><span>Stage</span><b>Foundation / MVP-bootstrap</b></li>
          <li><span>Frontend</span><b>Tauri 2 + React 19 + TypeScript</b></li>
          <li><span>Backend</span><b>未接入（本地 MVP）</b></li>
        </ul>
      </div>

      <div className="card">
        <div className="section-title">
          <h2>Local database</h2>
          <Database size={16} aria-hidden="true" />
        </div>
        {error && <p className="err">{error}</p>}
        {!stats && !error && (
          <div className="state state--inline">
            <Loader2 className="spin" size={18} aria-hidden="true" />
            <p>Loading database status...</p>
          </div>
        )}
        {stats && (
          <ul className="kv">
            <li><span>Path</span><b>{stats.databasePath}</b></li>
            <li><span>Total tasks</span><b>{stats.totalTasks}</b></li>
            <li><span>Active</span><b>{stats.activeTasks}</b></li>
            <li><span>Completed</span><b>{stats.completedTasks}</b></li>
          </ul>
        )}
      </div>
    </section>
  );
}
