import { FormEvent, useEffect, useState } from "react";
import { Check, Loader2, Pencil, Save, Trash2, X } from "lucide-react";
import { useTaskRepository } from "../data/TaskRepositoryContext";
import type { Task, TaskPriority } from "../domain/tasks";

interface DraftTask {
  title: string;
  notes: string;
  priority: TaskPriority;
}

export default function Inbox() {
  const repository = useTaskRepository();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftTask>({
    title: "",
    notes: "",
    priority: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setTasks(await repository.listInbox());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function completeTask(task: Task) {
    await repository.setStatus(task.id, "completed");
    await load();
  }

  async function deleteTask(task: Task) {
    await repository.deleteTask(task.id);
    await load();
  }

  function beginEdit(task: Task) {
    setEditing(task.id);
    setDraft({
      title: task.title,
      notes: task.notes ?? "",
      priority: task.priority,
    });
  }

  async function saveEdit(event: FormEvent, task: Task) {
    event.preventDefault();
    if (!draft.title.trim()) return;
    await repository.updateTask(task.id, {
      title: draft.title,
      notes: draft.notes,
      priority: draft.priority,
    });
    setEditing(null);
    await load();
  }

  return (
    <section className="page">
      <header className="page__head">
        <h1>Inbox</h1>
        <span className="page__sub">未分类任务 · 无截止时间的本地队列</span>
      </header>

      {loading && (
        <div className="card state">
          <Loader2 className="spin" size={18} aria-hidden="true" />
          <p>Loading inbox...</p>
        </div>
      )}
      {error && <p className="err">{error}</p>}
      {!loading && tasks.length === 0 && (
        <div className="card empty">
          <p>No inbox tasks. Add one from Today without a date in a later capture flow.</p>
        </div>
      )}
      {!loading && tasks.length > 0 && (
        <ul className="card task-list task-list--roomy">
          {tasks.map((task) => (
            <li key={task.id} className="task-item task-item--actions">
              {editing === task.id ? (
                <form className="edit-row" onSubmit={(event) => saveEdit(event, task)}>
                  <input
                    aria-label={`Edit ${task.title} title`}
                    value={draft.title}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, title: event.target.value }))
                    }
                  />
                  <input
                    aria-label={`Edit ${task.title} notes`}
                    value={draft.notes}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, notes: event.target.value }))
                    }
                    placeholder="Notes"
                  />
                  <select
                    aria-label={`Edit ${task.title} priority`}
                    value={draft.priority}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        priority: Number(event.target.value) as TaskPriority,
                      }))
                    }
                  >
                    <option value={0}>P0</option>
                    <option value={1}>P1</option>
                    <option value={2}>P2</option>
                    <option value={3}>P3</option>
                  </select>
                  <button type="submit" aria-label={`Save ${task.title}`}>
                    <Save size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Cancel ${task.title}`}
                    onClick={() => setEditing(null)}
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </form>
              ) : (
                <>
                  <div className="task-copy">
                    <span className="task-title">{task.title}</span>
                    {task.notes && <span className="task-meta">{task.notes}</span>}
                    {task.priority > 0 && (
                      <span className="task-badge">P{task.priority}</span>
                    )}
                  </div>
                  <div className="task-actions">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Complete ${task.title}`}
                      onClick={() => completeTask(task)}
                    >
                      <Check size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Edit ${task.title}`}
                      onClick={() => beginEdit(task)}
                    >
                      <Pencil size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="icon-button icon-button--danger"
                      aria-label={`Delete ${task.title}`}
                      onClick={() => deleteTask(task)}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
