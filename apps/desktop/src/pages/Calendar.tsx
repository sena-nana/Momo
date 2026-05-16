import { useEffect, useState } from "react";
import { CalendarDays, Loader2 } from "lucide-react";
import { useTaskRepository } from "../data/TaskRepositoryContext";
import type { Task } from "../domain/tasks";

export default function Calendar() {
  const repository = useTaskRepository();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);

      try {
        setTasks(await repository.listAgenda(start, end));
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  return (
    <section className="page">
      <header className="page__head">
        <h1>Calendar</h1>
        <span className="page__sub">Next 7 days</span>
      </header>

      {loading && (
        <div className="card state">
          <Loader2 className="spin" size={18} aria-hidden="true" />
          <p>Loading agenda...</p>
        </div>
      )}
      {error && <p className="err">{error}</p>}
      {!loading && tasks.length === 0 && (
        <div className="card empty">
          <CalendarDays size={20} aria-hidden="true" />
          <p>No scheduled tasks in the next 7 days.</p>
        </div>
      )}
      {!loading && tasks.length > 0 && (
        <ol className="timeline">
          {tasks.map((task) => (
            <li key={task.id} className="timeline__item">
              <time>{formatAgendaDate(task.dueAt)}</time>
              <div>
                <b>{task.title}</b>
                {task.notes && <p>{task.notes}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function formatAgendaDate(value: string | null) {
  if (!value) return "Unscheduled";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
