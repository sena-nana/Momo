import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { useTaskRepository } from "../data/TaskRepositoryContext";
import type { TodayTaskGroups } from "../domain/tasks";

export default function Widget() {
  const repository = useTaskRepository();
  const [groups, setGroups] = useState<TodayTaskGroups>({
    overdue: [],
    dueToday: [],
    completedToday: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setGroups(await repository.listToday(new Date()));
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [repository]);

  return (
    <main className="widget">
      <header className="widget__header">
        <div>
          <h1>Momo Widget</h1>
          <p>{formatToday()}</p>
        </div>
        <span>{groups.overdue.length + groups.dueToday.length}</span>
      </header>

      {loading && (
        <div className="widget__state">
          <Loader2 className="spin" size={18} aria-hidden="true" />
          <p>Loading...</p>
        </div>
      )}
      {error && (
        <div className="widget__state widget__state--error">
          <AlertCircle size={18} aria-hidden="true" />
          <p>{error}</p>
        </div>
      )}
      {!loading && !error && (
        <>
          <WidgetSection
            title="Overdue"
            tasks={groups.overdue}
            icon={<AlertCircle size={15} aria-hidden="true" />}
            urgent
          />
          <WidgetSection
            title="Today"
            tasks={groups.dueToday}
            icon={<Clock size={15} aria-hidden="true" />}
          />
          <WidgetSection
            title="Done"
            tasks={groups.completedToday.slice(0, 3)}
            icon={<CheckCircle2 size={15} aria-hidden="true" />}
          />
        </>
      )}
    </main>
  );
}

function WidgetSection({
  title,
  tasks,
  icon,
  urgent,
}: {
  title: string;
  tasks: TodayTaskGroups[keyof TodayTaskGroups];
  icon: React.ReactNode;
  urgent?: boolean;
}) {
  return (
    <section className="widget-section">
      <div className="widget-section__title">
        {icon}
        <h2>{title}</h2>
      </div>
      {tasks.length === 0 ? (
        <p className="widget__empty">Nothing here.</p>
      ) : (
        <ul>
          {tasks.slice(0, 4).map((task) => (
            <li key={task.id} className={urgent ? "is-urgent" : undefined}>
              <span>{task.title}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatToday() {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date());
}
