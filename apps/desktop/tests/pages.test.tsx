import { fireEvent, render, screen, within } from "@testing-library/react";
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

  it("quick-adds an undated task into inbox", async () => {
    const repository = fakeRepository();

    renderWithRepository(<Today />, repository);

    await screen.findByText("Due today");
    await userEvent.selectOptions(screen.getByLabelText("Task destination"), "inbox");
    await userEvent.type(screen.getByLabelText("Quick add task"), "Capture idea");
    await userEvent.click(screen.getByRole("button", { name: "Add task" }));

    expect(repository.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Capture idea",
        dueAt: null,
      }),
    );
  });

  it("quick-adds a task with estimate and an explicit due date", async () => {
    const repository = fakeRepository();

    renderWithRepository(<Today />, repository);

    await screen.findByText("Due today");
    await userEvent.type(screen.getByLabelText("Quick add task"), "Deep work");
    fireEvent.change(screen.getByLabelText("Task due date"), {
      target: { value: "2026-05-18T09:30" },
    });
    await userEvent.type(screen.getByLabelText("Task estimate minutes"), "45");
    await userEvent.click(screen.getByRole("button", { name: "Add for today" }));

    expect(repository.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Deep work",
        dueAt: expect.any(String),
        estimateMin: 45,
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

  it("edits inbox task title, notes, and priority", async () => {
    const repository = fakeRepository({
      inbox: [task({ id: "inbox-1", title: "Inbox task", notes: "old", priority: 0 })],
    });

    renderWithRepository(<Inbox />, repository);

    const item = await screen.findByText("Inbox task");
    const row = item.closest("li");
    expect(row).not.toBeNull();

    await userEvent.click(
      within(row as HTMLElement).getByRole("button", {
        name: "Edit Inbox task",
      }),
    );
    await userEvent.clear(screen.getByLabelText("Edit Inbox task title"));
    await userEvent.type(screen.getByLabelText("Edit Inbox task title"), "Updated task");
    await userEvent.clear(screen.getByLabelText("Edit Inbox task notes"));
    await userEvent.type(screen.getByLabelText("Edit Inbox task notes"), "Deeper detail");
    await userEvent.selectOptions(screen.getByLabelText("Edit Inbox task priority"), "2");
    await userEvent.click(screen.getByRole("button", { name: "Save Inbox task" }));

    expect(repository.updateTask).toHaveBeenCalledWith("inbox-1", {
      title: "Updated task",
      notes: "Deeper detail",
      priority: 2,
    });
  });

  it("edits inbox task due date and estimate", async () => {
    const repository = fakeRepository({
      inbox: [task({ id: "inbox-1", title: "Inbox task" })],
    });

    renderWithRepository(<Inbox />, repository);

    const item = await screen.findByText("Inbox task");
    const row = item.closest("li");
    expect(row).not.toBeNull();

    await userEvent.click(
      within(row as HTMLElement).getByRole("button", {
        name: "Edit Inbox task",
      }),
    );
    fireEvent.change(screen.getByLabelText("Edit Inbox task due date"), {
      target: { value: "2026-05-19T14:15" },
    });
    await userEvent.type(screen.getByLabelText("Edit Inbox task estimate minutes"), "30");
    await userEvent.click(screen.getByRole("button", { name: "Save Inbox task" }));

    expect(repository.updateTask).toHaveBeenCalledWith("inbox-1", {
      title: "Inbox task",
      notes: "",
      priority: 0,
      dueAt: expect.any(String),
      estimateMin: 30,
    });
  });

  it("clears inbox task due date and estimate", async () => {
    const repository = fakeRepository({
      inbox: [
        task({
          id: "inbox-1",
          title: "Inbox task",
          dueAt: "2026-05-19T14:15:00.000Z",
          estimateMin: 30,
        }),
      ],
    });

    renderWithRepository(<Inbox />, repository);

    const item = await screen.findByText("Inbox task");
    const row = item.closest("li");
    expect(row).not.toBeNull();

    await userEvent.click(
      within(row as HTMLElement).getByRole("button", {
        name: "Edit Inbox task",
      }),
    );
    fireEvent.change(screen.getByLabelText("Edit Inbox task due date"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Edit Inbox task estimate minutes"), {
      target: { value: "" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Save Inbox task" }));

    expect(repository.updateTask).toHaveBeenCalledWith("inbox-1", {
      title: "Inbox task",
      notes: "",
      priority: 0,
      dueAt: null,
      estimateMin: null,
    });
  });

  it("recovers inbox loading errors with retry", async () => {
    const repository = fakeRepository();
    vi.mocked(repository.listInbox)
      .mockRejectedValueOnce(new Error("database locked"))
      .mockResolvedValueOnce([task({ id: "inbox-1", title: "Recovered task" })]);

    renderWithRepository(<Inbox />, repository);

    expect(await screen.findByText("Error: database locked")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Recovered task")).toBeInTheDocument();
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

  it("recovers calendar loading errors with retry", async () => {
    const repository = fakeRepository();
    vi.mocked(repository.listAgenda)
      .mockRejectedValueOnce(new Error("agenda unavailable"))
      .mockResolvedValueOnce([
        task({
          id: "agenda-1",
          title: "Recovered agenda",
          dueAt: "2026-05-17T02:30:00.000Z",
        }),
      ]);

    renderWithRepository(<Calendar />, repository);

    expect(await screen.findByText("Error: agenda unavailable")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Recovered agenda")).toBeInTheDocument();
  });

  it("shows local database status in settings", async () => {
    const repository = fakeRepository({
      stats: {
        databasePath: "sqlite:momo.db",
        totalTasks: 4,
        activeTasks: 2,
        completedTasks: 1,
        pendingLocalChanges: 3,
      },
    });

    renderWithRepository(<Settings />, repository);

    expect(await screen.findByText("sqlite:momo.db")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    const pendingRow = screen.getByText("Pending sync").closest("li");
    expect(pendingRow).not.toBeNull();
    expect(within(pendingRow as HTMLElement).getByText("3")).toBeInTheDocument();
  });

  it("recovers settings database status errors with retry", async () => {
    const repository = fakeRepository();
    vi.mocked(repository.getStats)
      .mockRejectedValueOnce(new Error("stats unavailable"))
      .mockResolvedValueOnce({
        databasePath: "sqlite:momo.db",
        totalTasks: 5,
        activeTasks: 3,
        completedTasks: 2,
        pendingLocalChanges: 1,
      });

    renderWithRepository(<Settings />, repository);

    expect(await screen.findByText("Error: stats unavailable")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("sqlite:momo.db")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
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
    pendingLocalChanges: 0,
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
