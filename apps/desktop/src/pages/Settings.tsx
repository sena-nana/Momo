import { useEffect, useState } from "react";
import { Database, Loader2, RefreshCw } from "lucide-react";
import { useTaskRepository } from "../data/TaskRepositoryContext";
import type { DatabaseStats, SyncState } from "../data/taskRepository";
import type {
  LocalSyncSimulationResult,
  PendingConflictSummary,
  SyncRunnerRunOnceResult,
  SyncRunSummary,
} from "../sync/syncClient";

interface SettingsProps {
  pendingConflicts?: PendingConflictSummary[];
  syncSummary?: SyncRunSummary | null;
  onRunLocalSyncSimulation?: () => Promise<
    LocalSyncSimulationResult | SyncRunnerRunOnceResult
  >;
}

export default function Settings({
  pendingConflicts = [],
  syncSummary = null,
  onRunLocalSyncSimulation,
}: SettingsProps) {
  const repository = useTaskRepository();
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [simulationResult, setSimulationResult] =
    useState<LocalSyncSimulationResult | null>(null);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);

  const visibleSyncSummary = simulationResult?.push.summary ?? syncSummary;
  const visiblePullSummary = simulationResult?.pull ?? null;
  const visibleConflicts = simulationResult?.pendingConflicts ?? pendingConflicts;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [nextStats, nextSyncState] = await Promise.all([
        repository.getStats(),
        repository.getSyncState(),
      ]);
      setStats(nextStats);
      setSyncState(nextSyncState);
    } catch (e) {
      setStats(null);
      setSyncState(null);
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function runSimulation() {
    if (!onRunLocalSyncSimulation) return;
    setSimulationLoading(true);
    setSimulationError(null);
    try {
      const result = await onRunLocalSyncSimulation();
      if (isSyncRunnerRunOnceResult(result)) {
        if (result.ok) {
          setSimulationResult(result.result);
        } else {
          setSimulationResult(null);
          setSimulationError(result.error);
        }
        return;
      }
      setSimulationResult(result);
    } catch (e) {
      setSimulationError(String(e));
    } finally {
      setSimulationLoading(false);
    }
  }

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

      {syncState && !loading && !error && (
        <div className="card">
          <div className="section-title">
            <h2>Sync state</h2>
          </div>
          <ul className="kv">
            <li><span>Server cursor</span><b>{syncState.serverCursor ?? "none"}</b></li>
            <li><span>Last synced</span><b>{syncState.lastSyncedAt ?? "Never synced"}</b></li>
            <li><span>Last error</span><b>{syncState.lastError ?? "None"}</b></li>
            <li><span>Updated</span><b>{syncState.updatedAt ?? "Not recorded"}</b></li>
          </ul>
        </div>
      )}

      {onRunLocalSyncSimulation && (
        <div className="card">
          <div className="section-title">
            <h2>Local sync simulation</h2>
          </div>
          <button type="button" onClick={runSimulation} disabled={simulationLoading}>
            {simulationLoading && <Loader2 className="spin" size={16} aria-hidden="true" />}
            Run local sync simulation
          </button>
          {simulationError && (
            <p className="err">Error: {simulationError.replace(/^Error:\s*/, "")}</p>
          )}
        </div>
      )}

      {visibleConflicts.length > 0 && (
        <div className="card">
          <div className="section-title">
            <h2>Sync conflicts</h2>
            <span className="pill">{visibleConflicts.length}</span>
          </div>
          <ul className="conflict-list">
            {visibleConflicts.map((conflict) => (
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

      {visibleSyncSummary && (
        <div className="card">
          <div className="section-title">
            <h2>Sync status</h2>
            <span className="pill">{visibleSyncSummary.status}</span>
          </div>
          <p className="empty-text">{visibleSyncSummary.message}</p>
          <ul className="kv">
            <li><span>Accepted</span><b>{visibleSyncSummary.acceptedCount}</b></li>
            <li><span>Rejected</span><b>{visibleSyncSummary.rejectedCount}</b></li>
            <li><span>Conflicts</span><b>{visibleSyncSummary.conflictCount}</b></li>
            <li><span>Cursor</span><b>{visibleSyncSummary.serverCursor}</b></li>
          </ul>
        </div>
      )}

      {visiblePullSummary && (
        <div className="card">
          <div className="section-title">
            <h2>Pull applied</h2>
          </div>
          <ul className="kv">
            <li><span>Applied tasks</span><b>{visiblePullSummary.appliedTaskCount}</b></li>
            <li><span>Deleted tasks</span><b>{visiblePullSummary.deletedTaskCount}</b></li>
            <li><span>Pull cursor</span><b>{visiblePullSummary.serverCursor}</b></li>
          </ul>
        </div>
      )}
    </section>
  );
}

function isSyncRunnerRunOnceResult(
  result: LocalSyncSimulationResult | SyncRunnerRunOnceResult,
): result is SyncRunnerRunOnceResult {
  return typeof result === "object" && result !== null && "ok" in result;
}
