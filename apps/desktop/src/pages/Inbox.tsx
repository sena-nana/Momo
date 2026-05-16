import { FormEvent, useEffect, useState } from "react";
import { Check, Loader2, Pencil, Save, Trash2, X } from "lucide-react";
import { useTaskRepository } from "../data/TaskRepositoryContext";
import type { Task } from "../domain/tasks";

export default function Inbox() {
  const repository = useTaskRepository();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
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
    setDraft(task.title);
  }

  async function saveEdit(event: FormEvent, task: Task) {
    event.preventDefault();
    if (!draft.trim()) return;
    await repository.updateTask(task.id, { title: draft });
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
                    aria-label={`Edit ${task.title}`}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                  />
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
                  <span className="task-title">{task.title}</span>
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
