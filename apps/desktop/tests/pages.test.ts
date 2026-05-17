import { fireEvent, render, screen, waitFor, within } from "@testing-library/vue";
import { createMemoryHistory } from "vue-router";
import { describe, expect, it, vi } from "vitest";
import type { Component } from "vue";
import { TaskRepositoryKey } from "../src/data/TaskRepositoryContext";
import type {
  DatabaseStats,
  LocalChange,
  SyncRun,
  SyncState,
  TaskRepository,
} from "../src/data/taskRepository";
import type { CreateTaskInput, Task, TodayTaskGroups } from "../src/domain/tasks";
import type {
  LocalSyncSimulationResult,
  PendingConflictSummary,
  SyncRunnerRunOnceResult,
  SyncRunSummary,
} from "../src/sync/syncClient";
import type { RemoteSyncConfig } from "../src/sync/remoteSyncConfig";
import Today from "../src/pages/Today.vue";
import Inbox from "../src/pages/Inbox.vue";
import Calendar from "../src/pages/Calendar.vue";
import Settings from "../src/pages/Settings.vue";
import Widget from "../src/pages/Widget.vue";
import App from "../src/App.vue";
import { createMomoRouter } from "../src/router";

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

    renderWithRepository(Today, repository);

    expect(await screen.findByText("Late invoice")).toBeInTheDocument();
    expect(screen.getByText("Focus block")).toBeInTheDocument();
    expect(screen.getByText("Done review")).toBeInTheDocument();

    await fireEvent.update(screen.getByLabelText("Quick add task"), "Write brief");
    await fireEvent.click(screen.getByRole("button", { name: "Add for today" }));

    expect(repository.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Write brief",
        dueAt: expect.any(String),
      }),
    );
  });

  it("quick-adds an undated task into inbox", async () => {
    const repository = fakeRepository();

    renderWithRepository(Today, repository);

    await screen.findByText("Due today");
    await fireEvent.update(screen.getByLabelText("Task destination"), "inbox");
    await fireEvent.update(screen.getByLabelText("Quick add task"), "Capture idea");
    await fireEvent.click(screen.getByRole("button", { name: "Add task" }));

    expect(repository.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Capture idea",
        dueAt: null,
      }),
    );
  });

  it("quick-adds a task with estimate and an explicit due date", async () => {
    const repository = fakeRepository();

    renderWithRepository(Today, repository);

    await screen.findByText("Due today");
    await fireEvent.update(screen.getByLabelText("Quick add task"), "Deep work");
    await fireEvent.update(screen.getByLabelText("Task due date"), "2026-05-18T09:30");
    await fireEvent.update(screen.getByLabelText("Task estimate minutes"), "45");
    await fireEvent.click(screen.getByRole("button", { name: "Add for today" }));

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

    renderWithRepository(Inbox, repository);

    const item = await screen.findByText("Inbox task");
    const row = item.closest("li");
    expect(row).not.toBeNull();

    await fireEvent.click(
      within(row as HTMLElement).getByRole("button", {
        name: "Complete Inbox task",
      }),
    );
    await fireEvent.click(
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

    renderWithRepository(Inbox, repository);

    const item = await screen.findByText("Inbox task");
    const row = item.closest("li");
    expect(row).not.toBeNull();

    await fireEvent.click(
      within(row as HTMLElement).getByRole("button", {
        name: "Edit Inbox task",
      }),
    );
    await fireEvent.update(screen.getByLabelText("Edit Inbox task title"), "Updated task");
    await fireEvent.update(screen.getByLabelText("Edit Inbox task notes"), "Deeper detail");
    await fireEvent.update(screen.getByLabelText("Edit Inbox task priority"), "2");
    await fireEvent.click(screen.getByRole("button", { name: "Save Inbox task" }));

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

    renderWithRepository(Inbox, repository);

    const item = await screen.findByText("Inbox task");
    const row = item.closest("li");
    expect(row).not.toBeNull();

    await fireEvent.click(
      within(row as HTMLElement).getByRole("button", {
        name: "Edit Inbox task",
      }),
    );
    await fireEvent.update(screen.getByLabelText("Edit Inbox task due date"), "2026-05-19T14:15");
    await fireEvent.update(screen.getByLabelText("Edit Inbox task estimate minutes"), "30");
    await fireEvent.click(screen.getByRole("button", { name: "Save Inbox task" }));

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

    renderWithRepository(Inbox, repository);

    const item = await screen.findByText("Inbox task");
    const row = item.closest("li");
    expect(row).not.toBeNull();

    await fireEvent.click(
      within(row as HTMLElement).getByRole("button", {
        name: "Edit Inbox task",
      }),
    );
    await fireEvent.update(screen.getByLabelText("Edit Inbox task due date"), "");
    await fireEvent.update(screen.getByLabelText("Edit Inbox task estimate minutes"), "");
    await fireEvent.click(screen.getByRole("button", { name: "Save Inbox task" }));

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

    renderWithRepository(Inbox, repository);

    expect(await screen.findByText("Error: database locked")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Retry" }));

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

    renderWithRepository(Calendar, repository);

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

    renderWithRepository(Calendar, repository);

    expect(await screen.findByText("Error: agenda unavailable")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Retry" }));

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

    renderWithRepository(Settings, repository);

    expect(await screen.findByText("sqlite:momo.db")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    const pendingRow = screen.getByText("Pending sync").closest("li");
    expect(pendingRow).not.toBeNull();
    expect(within(pendingRow as HTMLElement).getByText("3")).toBeInTheDocument();
  });

  it("shows local sync cursor state in settings", async () => {
    const repository = fakeRepository({
      syncState: {
        serverCursor: "cursor-7",
        lastSyncedAt: "2026-05-16T12:00:00.000Z",
        lastError: "previous sync failure",
        updatedAt: "2026-05-16T12:01:00.000Z",
      },
    });

    renderWithRepository(Settings, repository);

    expect(await screen.findByText("Sync state")).toBeInTheDocument();
    expect(screen.getByText("cursor-7")).toBeInTheDocument();
    expect(screen.getByText("2026-05-16T12:00:00.000Z")).toBeInTheDocument();
    expect(screen.getByText("previous sync failure")).toBeInTheDocument();
  });

  it("shows recent sync run history in settings", async () => {
    const repository = fakeRepository({
      syncRuns: [
        {
          id: "run-2",
          status: "failed",
          startedAt: "2026-05-16T12:03:00.000Z",
          finishedAt: "2026-05-16T12:03:05.000Z",
          message: "transport unavailable",
          serverCursor: null,
        },
        {
          id: "run-1",
          status: "succeeded",
          startedAt: "2026-05-16T12:00:00.000Z",
          finishedAt: "2026-05-16T12:00:05.000Z",
          message: "Already synced",
          serverCursor: "cursor-8",
        },
      ],
    });

    renderWithRepository(Settings, repository);

    expect(await screen.findByText("Sync history")).toBeInTheDocument();
    expect(repository.listRecentSyncRuns).toHaveBeenCalledWith(3);
    const failedRun = screen.getByText("transport unavailable").closest("li");
    const succeededRun = screen.getByText("Already synced").closest("li");
    expect(failedRun).not.toBeNull();
    expect(succeededRun).not.toBeNull();
    expect(within(failedRun as HTMLElement).getByText("failed")).toBeInTheDocument();
    expect(within(failedRun as HTMLElement).getByText("none")).toBeInTheDocument();
    expect(within(succeededRun as HTMLElement).getByText("succeeded")).toBeInTheDocument();
    expect(within(succeededRun as HTMLElement).getByText("cursor-8")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sync history/i })).not.toBeInTheDocument();
  });

  it("keeps settings status visible when sync run history fails to load", async () => {
    const repository = fakeRepository({
      stats: {
        databasePath: "sqlite:momo.db",
        totalTasks: 4,
        activeTasks: 2,
        completedTasks: 1,
        pendingLocalChanges: 3,
      },
      syncState: {
        serverCursor: "cursor-7",
        lastSyncedAt: "2026-05-16T12:00:00.000Z",
        lastError: null,
        updatedAt: "2026-05-16T12:01:00.000Z",
      },
    });
    vi.mocked(repository.listRecentSyncRuns)
      .mockRejectedValueOnce(new Error("history unavailable"))
      .mockResolvedValueOnce([
        {
          id: "run-1",
          status: "succeeded",
          startedAt: "2026-05-16T12:00:00.000Z",
          finishedAt: "2026-05-16T12:00:05.000Z",
          message: "Already synced",
          serverCursor: "cursor-8",
        },
      ]);

    renderWithRepository(Settings, repository);

    expect(await screen.findByText("sqlite:momo.db")).toBeInTheDocument();
    expect(screen.getByText("cursor-7")).toBeInTheDocument();
    expect(screen.getByText("Error: history unavailable")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Retry sync history" }));

    expect(await screen.findByText("Sync history")).toBeInTheDocument();
    expect(screen.getByText("cursor-8")).toBeInTheDocument();
    expect(repository.listRecentSyncRuns).toHaveBeenCalledTimes(2);
  });

  it("shows pending local change summaries in settings and refreshes them after sync", async () => {
    const repository = fakeRepository({
      pendingChanges: [
        localChange({
          id: "change-1",
          entityId: "task-1",
          action: "task.update",
          payload: {
            id: "task-1",
            baseVersion: 4,
            patch: { title: "Draft plan" },
            updatedAt: "2026-05-16T10:00:00.000Z",
          },
        }),
      ],
    });
    vi.mocked(repository.listPendingChanges)
      .mockResolvedValueOnce([
        localChange({
          id: "change-1",
          entityId: "task-1",
          action: "task.update",
          payload: {
            id: "task-1",
            baseVersion: 4,
            patch: { title: "Draft plan" },
            updatedAt: "2026-05-16T10:00:00.000Z",
          },
        }),
      ])
      .mockResolvedValueOnce([]);
    const runnerResult: SyncRunnerRunOnceResult = {
      ok: true,
      result: {
        request: {
          contractVersion: 1,
          workspaceId: "local",
          deviceId: "desktop-1",
          changes: [],
          clientSentAt: "2026-05-16T12:00:00.000Z",
        },
        push: {
          acceptedChangeIds: ["change-1"],
          rejectedChanges: [],
          conflicts: [],
          serverCursor: "cursor-1",
          summary: {
            status: "all-synced",
            message: "1 local change synced",
            acceptedCount: 1,
            rejectedCount: 0,
            conflictCount: 0,
            serverCursor: "cursor-1",
          },
        },
        pendingConflictCount: 0,
        pendingConflicts: [],
      },
    };

    renderWithRepository(Settings, repository, {
      props: { onRunLocalSyncSimulation: vi.fn().mockResolvedValue(runnerResult) },
    });

    expect(await screen.findByText("Pending changes")).toBeInTheDocument();
    const pendingRow = screen.getByText("change-1").closest("li");
    expect(pendingRow).not.toBeNull();
    expect(within(pendingRow as HTMLElement).getByText("task.update")).toBeInTheDocument();
    expect(
      within(pendingRow as HTMLElement).getByText('patch: {"title":"Draft plan"}'),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete change/i })).not.toBeInTheDocument();

    await fireEvent.click(screen.getByRole("button", { name: "Run local sync simulation" }));

    expect(await screen.findByText("Sync status")).toBeInTheDocument();
    await waitFor(() => expect(repository.listPendingChanges).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("change-1")).not.toBeInTheDocument());
  });

  it("keeps settings status visible when pending local changes fail to load", async () => {
    const repository = fakeRepository({
      stats: {
        databasePath: "sqlite:momo.db",
        totalTasks: 4,
        activeTasks: 2,
        completedTasks: 1,
        pendingLocalChanges: 3,
      },
      syncState: {
        serverCursor: "cursor-7",
        lastSyncedAt: "2026-05-16T12:00:00.000Z",
        lastError: null,
        updatedAt: "2026-05-16T12:01:00.000Z",
      },
    });
    vi.mocked(repository.listPendingChanges)
      .mockRejectedValueOnce(new Error("pending changes unavailable"))
      .mockResolvedValueOnce([
        localChange({ id: "change-2", entityId: "task-2", action: "task.delete" }),
      ]);

    renderWithRepository(Settings, repository);

    expect(await screen.findByText("sqlite:momo.db")).toBeInTheDocument();
    expect(screen.getByText("cursor-7")).toBeInTheDocument();
    expect(screen.getByText("Error: pending changes unavailable")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Retry pending changes" }));

    expect(await screen.findByText("Pending changes")).toBeInTheDocument();
    expect(screen.getByText("change-2")).toBeInTheDocument();
    expect(repository.listPendingChanges).toHaveBeenCalledTimes(2);
  });

  it("shows disabled remote sync configuration in settings", async () => {
    const repository = fakeRepository();
    const remoteSyncConfig: RemoteSyncConfig = {
      enabled: false,
      reason: "Remote sync base URL is not configured",
    };

    renderWithRepository(Settings, repository, {
      props: { remoteSyncConfig },
    });

    expect(await screen.findByText("Remote sync config")).toBeInTheDocument();
    expect(screen.getByText("disabled")).toBeInTheDocument();
    expect(screen.getByText("Remote sync base URL is not configured")).toBeInTheDocument();
  });

  it("shows enabled remote sync configuration without exposing tokens in settings", async () => {
    const repository = fakeRepository();
    const remoteSyncConfig: RemoteSyncConfig = {
      enabled: true,
      baseUrl: "https://api.example.test/momo",
      headers: async () => ({ authorization: "Bearer secret-token" }),
    };

    renderWithRepository(Settings, repository, {
      props: { remoteSyncConfig },
    });

    expect(await screen.findByText("Remote sync config")).toBeInTheDocument();
    expect(screen.getByText("enabled")).toBeInTheDocument();
    expect(screen.getByText("https://api.example.test/momo")).toBeInTheDocument();
    expect(screen.getByText("Configured")).toBeInTheDocument();
    const syncActionRow = screen.getByText("Sync action").closest("li");
    expect(syncActionRow).not.toBeNull();
    expect(within(syncActionRow as HTMLElement).getByText("Local simulation")).toBeInTheDocument();
    expect(screen.queryByText("secret-token")).not.toBeInTheDocument();
  });

  it("shows read-only pending sync conflict summaries in settings", async () => {
    const repository = fakeRepository({
      pendingChanges: [
        localChange({
          id: "change-4",
          entityId: "task-1",
          action: "task.update",
          payload: {
            id: "task-1",
            baseVersion: 4,
            patch: { title: "Local title" },
            updatedAt: "2026-05-16T12:00:00.000Z",
          },
          createdAt: "2026-05-16T12:00:30.000Z",
        }),
      ],
    });
    const conflicts: PendingConflictSummary[] = [
      {
        id: "conflict-1",
        taskId: "task-1",
        changeId: "change-4",
        reason: "Task version conflict",
        createdAt: "2026-05-16T12:01:00.000Z",
        serverTaskTitle: "Server title",
        serverTaskVersion: 5,
        clientPayloadSummary: 'patch: {"title":"Local title"}',
      },
    ];

    renderWithRepository(Settings, repository, {
      props: { pendingConflicts: conflicts },
    });

    expect(await screen.findByText("Sync conflicts")).toBeInTheDocument();
    const conflictRow = screen.getByText("Server title").closest("li");
    expect(conflictRow).not.toBeNull();
    expect(within(conflictRow as HTMLElement).getByText("v5")).toBeInTheDocument();
    expect(
      within(conflictRow as HTMLElement).getByText('patch: {"title":"Local title"}'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(conflictRow as HTMLElement).getByText("task.update"),
      ).toBeInTheDocument(),
    );
    expect(within(conflictRow as HTMLElement).getByText("task:task-1")).toBeInTheDocument();
    expect(
      within(conflictRow as HTMLElement).getByText(
        "Local change created 2026-05-16T12:00:30.000Z",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /resolve/i })).not.toBeInTheDocument();
  });

  it("shows a read-only sync run summary in settings", async () => {
    const repository = fakeRepository();
    const syncSummary: SyncRunSummary = {
      status: "has-rejections",
      message: "1 local change needs retry or repair",
      acceptedCount: 2,
      rejectedCount: 1,
      conflictCount: 0,
      serverCursor: "cursor-4",
    };

    renderWithRepository(Settings, repository, {
      props: { syncSummary },
    });

    expect(await screen.findByText("Sync status")).toBeInTheDocument();
    expect(screen.getByText("1 local change needs retry or repair")).toBeInTheDocument();
    expect(screen.getByText("has-rejections")).toBeInTheDocument();
    expect(screen.getByText("cursor-4")).toBeInTheDocument();

    const acceptedRow = screen.getByText("Accepted").closest("li");
    const rejectedRow = screen.getByText("Rejected").closest("li");
    const conflictRow = screen.getByText("Conflicts").closest("li");
    expect(within(acceptedRow as HTMLElement).getByText("2")).toBeInTheDocument();
    expect(within(rejectedRow as HTMLElement).getByText("1")).toBeInTheDocument();
    expect(within(conflictRow as HTMLElement).getByText("0")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /resolve/i })).not.toBeInTheDocument();
  });

  it("shows read-only sync rejection details after local sync simulation", async () => {
    const repository = fakeRepository({
      pendingChanges: [
        localChange({
          id: "change-2",
          entityId: "task-2",
          action: "task.update",
          payload: {
            id: "task-2",
            baseVersion: 3,
            patch: { title: "Rejected edit" },
            updatedAt: "2026-05-16T10:00:00.000Z",
          },
          createdAt: "2026-05-16T10:01:00.000Z",
        }),
      ],
    });
    const runnerResult: SyncRunnerRunOnceResult = {
      ok: true,
      result: {
        request: {
          contractVersion: 1,
          workspaceId: "local",
          deviceId: "desktop-1",
          changes: [],
          clientSentAt: "2026-05-16T12:00:00.000Z",
        },
        push: {
          acceptedChangeIds: [],
          rejectedChanges: [{ id: "change-2", reason: "Invalid payload" }],
          conflicts: [],
          serverCursor: "cursor-1",
          summary: {
            status: "has-rejections",
            message: "1 local change needs retry or repair",
            acceptedCount: 0,
            rejectedCount: 1,
            conflictCount: 0,
            serverCursor: "cursor-1",
          },
        },
        pendingConflictCount: 0,
        pendingConflicts: [],
      },
    };

    renderWithRepository(Settings, repository, {
      props: { onRunLocalSyncSimulation: vi.fn().mockResolvedValue(runnerResult) },
    });

    await fireEvent.click(
      await screen.findByRole("button", { name: "Run local sync simulation" }),
    );

    expect(await screen.findByText("Sync rejections")).toBeInTheDocument();
    const rejectionRow = screen.getByText("change-2").closest("li");
    expect(rejectionRow).not.toBeNull();
    expect(
      within(rejectionRow as HTMLElement).getByText("Invalid payload"),
    ).toBeInTheDocument();
    expect(within(rejectionRow as HTMLElement).getByText("task.update")).toBeInTheDocument();
    expect(within(rejectionRow as HTMLElement).getByText("task:task-2")).toBeInTheDocument();
    expect(
      within(rejectionRow as HTMLElement).getByText('patch: {"title":"Rejected edit"}'),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry rejected/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete rejected/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /force/i })).not.toBeInTheDocument();
  });

  it("runs an injected local sync simulation from settings", async () => {
    const repository = fakeRepository();
    const onRunLocalSyncSimulation = vi.fn().mockResolvedValue({
      request: {
        contractVersion: 1,
        workspaceId: "local",
        deviceId: "desktop-1",
        changes: [],
        clientSentAt: "2026-05-16T12:00:00.000Z",
      },
      push: {
        acceptedChangeIds: [],
        rejectedChanges: [],
        conflicts: [],
        serverCursor: "cursor-3",
        summary: {
          status: "all-synced",
          message: "Already synced",
          acceptedCount: 0,
          rejectedCount: 0,
          conflictCount: 0,
          serverCursor: "cursor-3",
        },
      },
      pendingConflictCount: 0,
      pendingConflicts: [],
    } satisfies LocalSyncSimulationResult);

    renderWithRepository(Settings, repository, {
      props: { onRunLocalSyncSimulation },
    });

    await fireEvent.click(
      await screen.findByRole("button", { name: "Run local sync simulation" }),
    );

    expect(onRunLocalSyncSimulation).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Sync status")).toBeInTheDocument();
    expect(screen.getByText("Already synced")).toBeInTheDocument();
    expect(screen.getByText("cursor-3")).toBeInTheDocument();
  });

  it("shows local sync simulation errors in settings", async () => {
    const repository = fakeRepository();
    const onRunLocalSyncSimulation = vi
      .fn()
      .mockRejectedValue(new Error("simulation unavailable"));

    renderWithRepository(Settings, repository, {
      props: { onRunLocalSyncSimulation },
    });

    await fireEvent.click(
      await screen.findByRole("button", { name: "Run local sync simulation" }),
    );

    expect(await screen.findByText("Error: simulation unavailable")).toBeInTheDocument();
  });

  it("accepts sync runner results from the settings simulation callback", async () => {
    const repository = fakeRepository();
    const runnerResult: SyncRunnerRunOnceResult = {
      ok: true,
      result: {
        request: {
          contractVersion: 1,
          workspaceId: "local",
          deviceId: "desktop-1",
          changes: [],
          clientSentAt: "2026-05-16T12:00:00.000Z",
        },
        push: {
          acceptedChangeIds: [],
          rejectedChanges: [],
          conflicts: [],
          serverCursor: "cursor-9",
          summary: {
            status: "all-synced",
            message: "Already synced",
            acceptedCount: 0,
            rejectedCount: 0,
            conflictCount: 0,
            serverCursor: "cursor-9",
          },
        },
        pendingConflictCount: 0,
        pendingConflicts: [],
      },
    };

    renderWithRepository(Settings, repository, {
      props: { onRunLocalSyncSimulation: vi.fn().mockResolvedValue(runnerResult) },
    });

    await fireEvent.click(
      await screen.findByRole("button", { name: "Run local sync simulation" }),
    );

    expect(await screen.findByText("Sync status")).toBeInTheDocument();
    expect(screen.getByText("cursor-9")).toBeInTheDocument();
  });

  it("shows a read-only delta pull summary after local sync simulation", async () => {
    const repository = fakeRepository();
    const runnerResult: SyncRunnerRunOnceResult = {
      ok: true,
      result: {
        request: {
          contractVersion: 1,
          workspaceId: "local",
          deviceId: "desktop-1",
          changes: [],
          clientSentAt: "2026-05-16T12:00:00.000Z",
        },
        push: {
          acceptedChangeIds: [],
          rejectedChanges: [],
          conflicts: [],
          serverCursor: "cursor-9",
          summary: {
            status: "all-synced",
            message: "Already synced",
            acceptedCount: 0,
            rejectedCount: 0,
            conflictCount: 0,
            serverCursor: "cursor-9",
          },
        },
        pull: {
          appliedTaskCount: 2,
          deletedTaskCount: 1,
          serverCursor: "cursor-12",
        },
        pendingConflictCount: 0,
        pendingConflicts: [],
      },
    };

    renderWithRepository(Settings, repository, {
      props: { onRunLocalSyncSimulation: vi.fn().mockResolvedValue(runnerResult) },
    });

    await fireEvent.click(
      await screen.findByRole("button", { name: "Run local sync simulation" }),
    );

    expect(await screen.findByText("Pull applied")).toBeInTheDocument();
    const appliedRow = screen.getByText("Applied tasks").closest("li");
    const deletedRow = screen.getByText("Deleted tasks").closest("li");
    const cursorRow = screen.getByText("Pull cursor").closest("li");
    expect(within(appliedRow as HTMLElement).getByText("2")).toBeInTheDocument();
    expect(within(deletedRow as HTMLElement).getByText("1")).toBeInTheDocument();
    expect(within(cursorRow as HTMLElement).getByText("cursor-12")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pull/i })).not.toBeInTheDocument();
  });

  it("refreshes local database and sync state after local sync simulation succeeds", async () => {
    const repository = fakeRepository();
    vi.mocked(repository.getStats)
      .mockResolvedValueOnce({
        databasePath: "sqlite:momo.db",
        totalTasks: 4,
        activeTasks: 2,
        completedTasks: 1,
        pendingLocalChanges: 2,
      })
      .mockResolvedValueOnce({
        databasePath: "sqlite:momo.db",
        totalTasks: 5,
        activeTasks: 3,
        completedTasks: 1,
        pendingLocalChanges: 0,
      });
    vi.mocked(repository.getSyncState)
      .mockResolvedValueOnce({
        serverCursor: "cursor-before",
        lastSyncedAt: "2026-05-16T11:59:00.000Z",
        lastError: "previous error",
        updatedAt: "2026-05-16T11:59:00.000Z",
      })
      .mockResolvedValueOnce({
        serverCursor: "cursor-from-repository",
        lastSyncedAt: "2026-05-16T12:00:00.000Z",
        lastError: null,
        updatedAt: "2026-05-16T12:00:00.000Z",
      });
    vi.mocked(repository.listRecentSyncRuns)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "run-1",
          status: "succeeded",
          startedAt: "2026-05-16T12:00:00.000Z",
          finishedAt: "2026-05-16T12:00:05.000Z",
          message: "Already synced",
          serverCursor: "cursor-from-history",
        },
      ]);
    const runnerResult: SyncRunnerRunOnceResult = {
      ok: true,
      result: {
        request: {
          contractVersion: 1,
          workspaceId: "local",
          deviceId: "desktop-1",
          changes: [],
          clientSentAt: "2026-05-16T12:00:00.000Z",
        },
        push: {
          acceptedChangeIds: [],
          rejectedChanges: [],
          conflicts: [],
          serverCursor: "cursor-push",
          summary: {
            status: "all-synced",
            message: "Already synced",
            acceptedCount: 0,
            rejectedCount: 0,
            conflictCount: 0,
            serverCursor: "cursor-push",
          },
        },
        pull: {
          appliedTaskCount: 1,
          deletedTaskCount: 0,
          serverCursor: "cursor-pull-result",
        },
        pendingConflictCount: 0,
        pendingConflicts: [],
      },
    };

    renderWithRepository(Settings, repository, {
      props: { onRunLocalSyncSimulation: vi.fn().mockResolvedValue(runnerResult) },
    });

    expect(await screen.findByText("cursor-before")).toBeInTheDocument();
    await fireEvent.click(
      await screen.findByRole("button", { name: "Run local sync simulation" }),
    );

    const pendingRow = await screen.findByText("Pending sync").then((label) =>
      label.closest("li"),
    );
    const serverCursorRow = screen.getByText("Server cursor").closest("li");
    const lastErrorRow = screen.getByText("Last error").closest("li");
    expect(repository.getStats).toHaveBeenCalledTimes(2);
    expect(repository.getSyncState).toHaveBeenCalledTimes(2);
    expect(repository.listRecentSyncRuns).toHaveBeenCalledTimes(2);
    expect(within(pendingRow as HTMLElement).getByText("0")).toBeInTheDocument();
    expect(
      within(serverCursorRow as HTMLElement).getByText("cursor-from-repository"),
    ).toBeInTheDocument();
    expect(within(lastErrorRow as HTMLElement).getByText("None")).toBeInTheDocument();
    expect(await screen.findByText("Sync history")).toBeInTheDocument();
    expect(screen.getByText("cursor-from-history")).toBeInTheDocument();
  });

  it("shows sync runner errors from the settings simulation callback", async () => {
    const repository = fakeRepository();
    const runnerResult: SyncRunnerRunOnceResult = {
      ok: false,
      error: "transport unavailable",
      result: null,
    };

    renderWithRepository(Settings, repository, {
      props: { onRunLocalSyncSimulation: vi.fn().mockResolvedValue(runnerResult) },
    });

    await fireEvent.click(
      await screen.findByRole("button", { name: "Run local sync simulation" }),
    );

    expect(await screen.findByText("Error: transport unavailable")).toBeInTheDocument();
  });

  it("refreshes sync state after sync runner errors", async () => {
    const repository = fakeRepository();
    vi.mocked(repository.getSyncState)
      .mockResolvedValueOnce({
        serverCursor: "cursor-before",
        lastSyncedAt: "2026-05-16T11:59:00.000Z",
        lastError: null,
        updatedAt: "2026-05-16T11:59:00.000Z",
      })
      .mockResolvedValueOnce({
        serverCursor: null,
        lastSyncedAt: null,
        lastError: "HTTP-like sync transport failed",
        updatedAt: "2026-05-16T12:00:00.000Z",
      });
    const runnerResult: SyncRunnerRunOnceResult = {
      ok: false,
      error: "HTTP-like sync transport failed",
      result: null,
    };

    renderWithRepository(Settings, repository, {
      props: { onRunLocalSyncSimulation: vi.fn().mockResolvedValue(runnerResult) },
    });

    expect(await screen.findByText("cursor-before")).toBeInTheDocument();
    await fireEvent.click(
      await screen.findByRole("button", { name: "Run local sync simulation" }),
    );

    expect(
      await screen.findByText("Error: HTTP-like sync transport failed"),
    ).toBeInTheDocument();
    expect(await screen.findByText("none")).toBeInTheDocument();
    const serverCursorRow = screen.getByText("Server cursor").closest("li");
    const lastErrorRow = screen.getByText("Last error").closest("li");
    expect(repository.getSyncState).toHaveBeenCalledTimes(2);
    expect(within(serverCursorRow as HTMLElement).getByText("none")).toBeInTheDocument();
    expect(
      within(lastErrorRow as HTMLElement).getByText("HTTP-like sync transport failed"),
    ).toBeInTheDocument();
  });

  it("shows the local sync simulation entrypoint on the default settings route", async () => {
    const repository = fakeRepository();

    await renderAppAt("/settings", repository);

    expect(screen.getByRole("button", { name: "Open widget" })).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Run local sync simulation" }),
    ).toBeInTheDocument();
  });

  it("keeps the login placeholder route wired into the Vue router", async () => {
    const repository = fakeRepository();

    await renderAppAt("/login", repository);

    await fireEvent.update(screen.getByLabelText("Email"), "you@example.com");
    await fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Due today")).toBeInTheDocument();
  });

  it("passes remote sync env config into the default settings route", async () => {
    vi.stubEnv("VITE_MOMO_SYNC_BASE_URL", "https://api.example.test/momo");
    vi.stubEnv("VITE_MOMO_SYNC_TOKEN", "secret-token");
    const repository = fakeRepository();

    await renderAppAt("/settings", repository);

    expect(await screen.findByText("Remote sync config")).toBeInTheDocument();
    expect(screen.getByText("enabled")).toBeInTheDocument();
    expect(screen.getByText("https://api.example.test/momo")).toBeInTheDocument();
    expect(screen.getByText("Configured")).toBeInTheDocument();
    const syncActionRow = screen.getByText("Sync action").closest("li");
    expect(syncActionRow).not.toBeNull();
    expect(within(syncActionRow as HTMLElement).getByText("Local simulation")).toBeInTheDocument();
    expect(screen.queryByText("secret-token")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Run local sync simulation" }),
    ).toBeInTheDocument();
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

    renderWithRepository(Settings, repository);

    expect(await screen.findByText("Error: stats unavailable")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Retry" }));

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

    renderWithRepository(Widget, repository);

    expect(await screen.findByText("Momo Widget")).toBeInTheDocument();
    expect(await screen.findByText("Late invoice")).toBeInTheDocument();
    expect(screen.getByText("Focus block")).toBeInTheDocument();
  });
});

function renderWithRepository(
  component: Component,
  repository: TaskRepository,
  options: Record<string, unknown> = {},
) {
  return render(component, {
    ...options,
    global: {
      provide: {
        [TaskRepositoryKey as symbol]: repository,
      },
      ...(options.global as Record<string, unknown> | undefined),
    },
  });
}

async function renderAppAt(path: string, repository: TaskRepository) {
  const router = createMomoRouter(createMemoryHistory());
  await router.push(path);
  await router.isReady();

  return renderWithRepository(App, repository, {
    global: {
      plugins: [router],
    },
  });
}

function fakeRepository(overrides: {
  today?: TodayTaskGroups;
  inbox?: Task[];
  agenda?: Task[];
  stats?: DatabaseStats;
  syncState?: SyncState;
  syncRuns?: SyncRun[];
  pendingChanges?: LocalChange[];
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
  const syncState = overrides.syncState ?? {
    serverCursor: null,
    lastSyncedAt: null,
    lastError: null,
    updatedAt: null,
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
    applyRemoteTask: vi.fn().mockResolvedValue(undefined),
    deleteRemoteTask: vi.fn().mockResolvedValue(undefined),
    listToday: vi.fn().mockResolvedValue(today),
    listInbox: vi.fn().mockResolvedValue(overrides.inbox ?? []),
    listAgenda: vi.fn().mockResolvedValue(overrides.agenda ?? []),
    getStats: vi.fn().mockResolvedValue(stats),
    listPendingChanges: vi.fn().mockResolvedValue(overrides.pendingChanges ?? []),
    markChangeSynced: vi.fn().mockResolvedValue(undefined),
    getSyncState: vi.fn().mockResolvedValue(syncState),
    saveSyncState: vi.fn().mockResolvedValue(syncState),
    recordSyncRun: vi.fn().mockResolvedValue({
      id: "run-1",
      status: "succeeded",
      startedAt: "2026-05-16T12:00:00.000Z",
      finishedAt: "2026-05-16T12:00:00.000Z",
      message: "Already synced",
      serverCursor: "cursor-0",
    }),
    listRecentSyncRuns: vi.fn().mockResolvedValue(overrides.syncRuns ?? []),
  };
}

function localChange(overrides: Partial<LocalChange> = {}): LocalChange {
  return {
    id: "change",
    entityType: "task",
    entityId: "task",
    action: "task.create",
    payload: { id: "task", title: "Task" },
    createdAt: "2026-05-16T10:00:00.000Z",
    syncedAt: null,
    ...overrides,
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
