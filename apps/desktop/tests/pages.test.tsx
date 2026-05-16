import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TaskRepositoryProvider } from "../src/data/TaskRepositoryContext";
import type {
  DatabaseStats,
  TaskRepository,
} from "../src/data/taskRepository";
import type { CreateTaskInput, Task, TodayTaskGroups } from "../src/domain/tasks";
import Today from "../src/pages/Today";
import Inbox from "../src/pages/Inbox";
import Calendar from "../src/pages/Calendar";
import Settings from "../src/pages/Settings";
import Widget from "../src/pages/Widget";

describe("desktop MVP pages", () => {
  it("shows today's groups and quick-adds a task for today", async () => {
    const repository = fakeRepository({
      today: {
        overdue: [task({ id: "late", title: "Late invoice" })],
        dueToday: [task({ id: "focus", title: "Focus block" })],
        completedToday: [
          task({ id: "done", title: "Done review", status: "completed" }),
        ],
      },
    });

    renderWithRepository(<Today />, repository);

    expect(await screen.findByText("Late invoice")).toBeInTheDocument();
    expect(screen.getByText("Focus block")).toBeInTheDocument();
    expect(screen.getByText("Done review")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Quick add task"), "Write brief");
    await userEvent.click(screen.getByRole("button", { name: "Add for today" }));

    expect(repository.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Write brief",
        dueAt: expect.any(String),
      }),
    );
  });

  it("shows inbox tasks and supports complete/delete actions", async () => {
    const repository = fakeRepository({
      inbox: [task({ id: "inbox-1", title: "Inbox task" })],
    });

    renderWithRepository(<Inbox />, repository);

    const item = await screen.findByText("Inbox task");
    const row = item.closest("li");
    expect(row).not.toBeNull();

    await userEvent.click(
      within(row as HTMLElement).getByRole("button", {
        name: "Complete Inbox task",
      }),
    );
    await userEvent.click(
      within(row as HTMLElement).getByRole("button", {
        name: "Delete Inbox task",
      }),
    );

    expect(repository.setStatus).toHaveBeenCalledWith("inbox-1", "completed");
    expect(repository.deleteTask).toHaveBeenCalledWith("inbox-1");
  });

  it("shows a read-only seven-day agenda", async () => {
    const repository = fakeRepository({
      agenda: [
        task({
          id: "agenda-1",
          title: "Planning session",
          dueAt: "2026-05-17T02:30:00.000Z",
        }),
      ],
    });

    renderWithRepository(<Calendar />, repository);

    expect(await screen.findByText("Planning session")).toBeInTheDocument();
    expect(screen.getByText("Next 7 days")).toBeInTheDocument();
    expect(repository.listAgenda).toHaveBeenCalledTimes(1);
  });

  it("shows local database status in settings", async () => {
    const repository = fakeRepository({
      stats: {
        databasePath: "sqlite:momo.db",
        totalTasks: 4,
        activeTasks: 2,
        completedTasks: 1,
      },
    });

    renderWithRepository(<Settings />, repository);

    expect(await screen.findByText("sqlite:momo.db")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("shows a compact widget view of today's tasks", async () => {
    const repository = fakeRepository({
      today: {
        overdue: [task({ id: "late", title: "Late invoice" })],
        dueToday: [task({ id: "focus", title: "Focus block" })],
        completedToday: [],
      },
    });

    renderWithRepository(<Widget />, repository);

    expect(await screen.findByText("Momo Widget")).toBeInTheDocument();
    expect(screen.getByText("Late invoice")).toBeInTheDocument();
    expect(screen.getByText("Focus block")).toBeInTheDocument();
  });
});

function renderWithRepository(ui: React.ReactElement, repository: TaskRepository) {
  return render(
    <TaskRepositoryProvider repository={repository}>{ui}</TaskRepositoryProvider>,
  );
}

function fakeRepository(overrides: {
  today?: TodayTaskGroups;
  inbox?: Task[];
  agenda?: Task[];
  stats?: DatabaseStats;
} = {}): TaskRepository {
  const today = overrides.today ?? {
    overdue: [],
    dueToday: [],
    completedToday: [],
  };
  const stats = overrides.stats ?? {
    databasePath: "sqlite:momo.db",
    totalTasks: 0,
    activeTasks: 0,
    completedTasks: 0,
  };

  return {
    databasePath: "sqlite:momo.db",
    init: vi.fn().mockResolvedValue(undefined),
    createTask: vi
      .fn()
      .mockImplementation((input: CreateTaskInput) =>
        Promise.resolve(task({ title: input.title, dueAt: input.dueAt ?? null })),
      ),
    updateTask: vi.fn(),
    setStatus: vi.fn().mockResolvedValue(task({ status: "completed" })),
    deleteTask: vi.fn().mockResolvedValue(undefined),
    listToday: vi.fn().mockResolvedValue(today),
    listInbox: vi.fn().mockResolvedValue(overrides.inbox ?? []),
    listAgenda: vi.fn().mockResolvedValue(overrides.agenda ?? []),
    getStats: vi.fn().mockResolvedValue(stats),
  };
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task",
    title: "Task",
    notes: null,
    status: "active",
    priority: 0,
    dueAt: null,
    estimateMin: null,
    tags: [],
    createdAt: "2026-05-16T00:00:00.000Z",
    updatedAt: "2026-05-16T00:00:00.000Z",
    completedAt: null,
    ...overrides,
  };
}
