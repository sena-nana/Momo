import { FormEvent, useEffect, useState, type ReactNode } from "react";
import { Check, Loader2, Plus, RefreshCw } from "lucide-react";
import { useTaskRepository } from "../data/TaskRepositoryContext";
import type { TodayTaskGroups } from "../domain/tasks";

export default function Today() {
  const repository = useTaskRepository();
  const [groups, setGroups] = useState<TodayTaskGroups>({
    overdue: [],
    dueToday: [],
    completedToday: [],
  });
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setGroups(await repository.listToday(new Date()));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onQuickAdd(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await repository.createTask({
        title,
        dueAt: defaultTodayDueAt(),
      });
      setTitle("");
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page">
      <header className="page__head">
        <h1>Today</h1>
        <span className="page__sub">今日任务 · 逾期提醒 · 完成回看</span>
      </header>

      <form className="quick-add" onSubmit={onQuickAdd}>
        <label className="sr-only" htmlFor="today-quick-add">
          Quick add task
        </label>
        <div className="row">
          <input
            id="today-quick-add"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Add a task for today"
          />
          <button type="submit" disabled={saving || !title.trim()}>
            <Plus size={16} aria-hidden="true" />
            Add for today
          </button>
        </div>
      </form>

      {loading && <LoadingState />}
      {error && (
        <div className="card state state--error">
          <p>{error}</p>
          <button type="button" onClick={load}>
            <RefreshCw size={16} aria-hidden="true" />
            Retry
          </button>
        </div>
      )}

      {!loading && !error && (
        <div className="task-grid">
          <TaskSection title="Overdue" tasks={groups.overdue} tone="danger" />
          <TaskSection title="Due today" tasks={groups.dueToday} />
          <TaskSection
            title="Completed today"
            tasks={groups.completedToday}
            icon={<Check size={16} aria-hidden="true" />}
          />
        </div>
      )}
    </section>
  );
}

function TaskSection({
  title,
  tasks,
  tone,
  icon,
}: {
  title: string;
  tasks: TodayTaskGroups[keyof TodayTaskGroups];
  tone?: "danger";
  icon?: ReactNode;
}) {
  return (
    <section className="card task-section">
      <div className="section-title">
        <h2>{title}</h2>
        {icon}
      </div>
      {tasks.length === 0 ? (
        <p className="empty-text">Nothing here.</p>
      ) : (
        <ul className="task-list">
          {tasks.map((task) => (
            <li key={task.id} className="task-item">
              <span className={tone === "danger" ? "task-title is-danger" : "task-title"}>
                {task.title}
              </span>
              <span className="task-meta">{formatDateTime(task.dueAt ?? task.completedAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LoadingState() {
  return (
    <div className="card state">
      <Loader2 className="spin" size={18} aria-hidden="true" />
      <p>Loading local tasks...</p>
    </div>
  );
}

function defaultTodayDueAt() {
  const due = new Date();
  due.setHours(12, 0, 0, 0);
  return due.toISOString();
}

function formatDateTime(value: string | null) {
  if (!value) return "No time";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
