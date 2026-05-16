import { useEffect, useState } from "react";
import { Database, Loader2, RefreshCw } from "lucide-react";
import { useTaskRepository } from "../data/TaskRepositoryContext";
import type { DatabaseStats } from "../data/taskRepository";
import type { PendingConflictSummary, SyncRunSummary } from "../sync/syncClient";

interface SettingsProps {
  pendingConflicts?: PendingConflictSummary[];
  syncSummary?: SyncRunSummary | null;
}

export default function Settings({
  pendingConflicts = [],
  syncSummary = null,
}: SettingsProps) {
  const repository = useTaskRepository();
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setStats(await repository.getStats());
    } catch (e) {
      setStats(null);
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
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
        {error && (
          <div className="state state--error">
            <p>{error}</p>
            <button type="button" onClick={load}>
              <RefreshCw size={16} aria-hidden="true" />
              Retry
            </button>
          </div>
        )}
        {loading && !error && (
          <div className="state state--inline">
            <Loader2 className="spin" size={18} aria-hidden="true" />
            <p>Loading database status...</p>
          </div>
        )}
        {stats && !loading && !error && (
          <ul className="kv">
            <li><span>Path</span><b>{stats.databasePath}</b></li>
            <li><span>Total tasks</span><b>{stats.totalTasks}</b></li>
            <li><span>Active</span><b>{stats.activeTasks}</b></li>
            <li><span>Completed</span><b>{stats.completedTasks}</b></li>
            <li><span>Pending sync</span><b>{stats.pendingLocalChanges}</b></li>
          </ul>
        )}
      </div>

      {pendingConflicts.length > 0 && (
        <div className="card">
          <div className="section-title">
            <h2>Sync conflicts</h2>
            <span className="pill">{pendingConflicts.length}</span>
          </div>
          <ul className="conflict-list">
            {pendingConflicts.map((conflict) => (
              <li key={conflict.id}>
                <div>
                  <strong>{conflict.serverTaskTitle ?? conflict.taskId}</strong>
                  {conflict.serverTaskVersion !== null && (
                    <span className="muted">v{conflict.serverTaskVersion}</span>
                  )}
                </div>
                <p>{conflict.clientPayloadSummary}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {syncSummary && (
        <div className="card">
          <div className="section-title">
            <h2>Sync status</h2>
            <span className="pill">{syncSummary.status}</span>
          </div>
          <p className="empty-text">{syncSummary.message}</p>
          <ul className="kv">
            <li><span>Accepted</span><b>{syncSummary.acceptedCount}</b></li>
            <li><span>Rejected</span><b>{syncSummary.rejectedCount}</b></li>
            <li><span>Conflicts</span><b>{syncSummary.conflictCount}</b></li>
            <li><span>Cursor</span><b>{syncSummary.serverCursor}</b></li>
          </ul>
        </div>
      )}
    </section>
  );
}
