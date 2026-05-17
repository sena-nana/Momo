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

describe("桌面端 MVP 页面", () => {
  it("显示今日分组并快速添加今日任务", async () => {
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

    await fireEvent.update(screen.getByLabelText("快速添加任务"), "Write brief");
    await fireEvent.click(screen.getByRole("button", { name: "添加到今日" }));

    expect(repository.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Write brief",
        dueAt: expect.any(String),
      }),
    );
  });

  it("快速添加无截止日期任务到收件箱", async () => {
    const repository = fakeRepository();

    renderWithRepository(Today, repository);

    await screen.findByText("今日到期");
    await fireEvent.update(screen.getByLabelText("任务归属"), "inbox");
    await fireEvent.update(screen.getByLabelText("快速添加任务"), "Capture idea");
    await fireEvent.click(screen.getByRole("button", { name: "添加任务" }));

    expect(repository.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Capture idea",
        dueAt: null,
      }),
    );
  });

  it("快速添加带估时和明确截止时间的任务", async () => {
    const repository = fakeRepository();

    renderWithRepository(Today, repository);

    await screen.findByText("今日到期");
    await fireEvent.update(screen.getByLabelText("快速添加任务"), "Deep work");
    await fireEvent.update(screen.getByLabelText("任务截止时间"), "2026-05-18T09:30");
    await fireEvent.update(screen.getByLabelText("任务估时分钟"), "45");
    await fireEvent.click(screen.getByRole("button", { name: "添加到今日" }));

    expect(repository.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Deep work",
        dueAt: expect.any(String),
        estimateMin: 45,
      }),
    );
  });

  it("显示收件箱任务并支持完成和删除操作", async () => {
    const repository = fakeRepository({
      inbox: [task({ id: "inbox-1", title: "Inbox task" })],
    });

    renderWithRepository(Inbox, repository);

    const item = await screen.findByText("Inbox task");
    const row = item.closest("li");
    expect(row).not.toBeNull();

    await fireEvent.click(
      within(row as HTMLElement).getByRole("button", {
        name: "完成 Inbox task",
      }),
    );
    await fireEvent.click(
      within(row as HTMLElement).getByRole("button", {
        name: "删除 Inbox task",
      }),
    );

    expect(repository.setStatus).toHaveBeenCalledWith("inbox-1", "completed");
    expect(repository.deleteTask).toHaveBeenCalledWith("inbox-1");
  });

  it("编辑收件箱任务标题、备注和优先级", async () => {
    const repository = fakeRepository({
      inbox: [task({ id: "inbox-1", title: "Inbox task", notes: "old", priority: 0 })],
    });

    renderWithRepository(Inbox, repository);

    const item = await screen.findByText("Inbox task");
    const row = item.closest("li");
    expect(row).not.toBeNull();

    await fireEvent.click(
      within(row as HTMLElement).getByRole("button", {
        name: "编辑 Inbox task",
      }),
    );
    await fireEvent.update(screen.getByLabelText("编辑 Inbox task 标题"), "Updated task");
    await fireEvent.update(screen.getByLabelText("编辑 Inbox task 备注"), "Deeper detail");
    await fireEvent.update(screen.getByLabelText("编辑 Inbox task 优先级"), "2");
    await fireEvent.click(screen.getByRole("button", { name: "保存 Inbox task" }));

    expect(repository.updateTask).toHaveBeenCalledWith("inbox-1", {
      title: "Updated task",
      notes: "Deeper detail",
      priority: 2,
    });
  });

  it("编辑收件箱任务截止时间和估时", async () => {
    const repository = fakeRepository({
      inbox: [task({ id: "inbox-1", title: "Inbox task" })],
    });

    renderWithRepository(Inbox, repository);

    const item = await screen.findByText("Inbox task");
    const row = item.closest("li");
    expect(row).not.toBeNull();

    await fireEvent.click(
      within(row as HTMLElement).getByRole("button", {
        name: "编辑 Inbox task",
      }),
    );
    await fireEvent.update(screen.getByLabelText("编辑 Inbox task 截止时间"), "2026-05-19T14:15");
    await fireEvent.update(screen.getByLabelText("编辑 Inbox task 估时分钟"), "30");
    await fireEvent.click(screen.getByRole("button", { name: "保存 Inbox task" }));

    expect(repository.updateTask).toHaveBeenCalledWith("inbox-1", {
      title: "Inbox task",
      notes: "",
      priority: 0,
      dueAt: expect.any(String),
      estimateMin: 30,
    });
  });

  it("清除收件箱任务截止时间和估时", async () => {
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
        name: "编辑 Inbox task",
      }),
    );
    await fireEvent.update(screen.getByLabelText("编辑 Inbox task 截止时间"), "");
    await fireEvent.update(screen.getByLabelText("编辑 Inbox task 估时分钟"), "");
    await fireEvent.click(screen.getByRole("button", { name: "保存 Inbox task" }));

    expect(repository.updateTask).toHaveBeenCalledWith("inbox-1", {
      title: "Inbox task",
      notes: "",
      priority: 0,
      dueAt: null,
      estimateMin: null,
    });
  });

  it("使用重试恢复收件箱加载错误", async () => {
    const repository = fakeRepository();
    vi.mocked(repository.listInbox)
      .mockRejectedValueOnce(new Error("database locked"))
      .mockResolvedValueOnce([task({ id: "inbox-1", title: "Recovered task" })]);

    renderWithRepository(Inbox, repository);

    expect(await screen.findByText("错误：database locked")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "重试" }));

    expect(await screen.findByText("Recovered task")).toBeInTheDocument();
  });

  it("显示只读七日日程", async () => {
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
    expect(screen.getByText("未来 7 天")).toBeInTheDocument();
    expect(repository.listAgenda).toHaveBeenCalledTimes(1);
  });

  it("使用重试恢复日历加载错误", async () => {
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

    expect(await screen.findByText("错误：agenda unavailable")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "重试" }));

    expect(await screen.findByText("Recovered agenda")).toBeInTheDocument();
  });

  it("在设置页显示本地数据库状态", async () => {
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
    const pendingRow = screen.getByText("待同步").closest("li");
    expect(pendingRow).not.toBeNull();
    expect(within(pendingRow as HTMLElement).getByText("3")).toBeInTheDocument();
  });

  it("在设置页显示本地同步 cursor 状态", async () => {
    const repository = fakeRepository({
      syncState: {
        serverCursor: "cursor-7",
        lastSyncedAt: "2026-05-16T12:00:00.000Z",
        lastError: "previous sync failure",
        updatedAt: "2026-05-16T12:01:00.000Z",
      },
    });

    renderWithRepository(Settings, repository);

    expect(await screen.findByText("同步状态")).toBeInTheDocument();
    expect(screen.getByText("cursor-7")).toBeInTheDocument();
    expect(screen.getByText("2026-05-16T12:00:00.000Z")).toBeInTheDocument();
    expect(screen.getByText("previous sync failure")).toBeInTheDocument();
  });

  it("在设置页显示最近同步运行历史", async () => {
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
          message: "已完成同步",
          serverCursor: "cursor-8",
        },
      ],
    });

    renderWithRepository(Settings, repository);

    expect(await screen.findByText("同步历史")).toBeInTheDocument();
    expect(repository.listRecentSyncRuns).toHaveBeenCalledWith(3);
    const failedRun = screen.getByText("transport unavailable").closest("li");
    const succeededRun = screen.getByText("已完成同步").closest("li");
    expect(failedRun).not.toBeNull();
    expect(succeededRun).not.toBeNull();
    expect(within(failedRun as HTMLElement).getByText("failed")).toBeInTheDocument();
    expect(within(failedRun as HTMLElement).getByText("无")).toBeInTheDocument();
    expect(within(succeededRun as HTMLElement).getByText("succeeded")).toBeInTheDocument();
    expect(within(succeededRun as HTMLElement).getByText("cursor-8")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sync history/i })).not.toBeInTheDocument();
  });

  it("同步运行历史加载失败时仍保持设置状态可见", async () => {
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
          message: "已完成同步",
          serverCursor: "cursor-8",
        },
      ]);

    renderWithRepository(Settings, repository);

    expect(await screen.findByText("sqlite:momo.db")).toBeInTheDocument();
    expect(screen.getByText("cursor-7")).toBeInTheDocument();
    expect(screen.getByText("错误：history unavailable")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "重试同步历史" }));

    expect(await screen.findByText("同步历史")).toBeInTheDocument();
    expect(screen.getByText("cursor-8")).toBeInTheDocument();
    expect(repository.listRecentSyncRuns).toHaveBeenCalledTimes(2);
  });

  it("在设置页显示待同步本地变更摘要并在同步后刷新", async () => {
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
            message: "已同步 1 个本地变更",
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

    expect(await screen.findByText("待同步变更")).toBeInTheDocument();
    const pendingRow = screen.getByText("change-1").closest("li");
    expect(pendingRow).not.toBeNull();
    expect(within(pendingRow as HTMLElement).getByText("task.update")).toBeInTheDocument();
    expect(
      within(pendingRow as HTMLElement).getByText('patch: {"title":"Draft plan"}'),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete change/i })).not.toBeInTheDocument();

    await fireEvent.click(screen.getByRole("button", { name: "运行本地同步模拟" }));

    expect(await screen.findByText("同步状态")).toBeInTheDocument();
    await waitFor(() => expect(repository.listPendingChanges).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("change-1")).not.toBeInTheDocument());
  });

  it("待同步本地变更加载失败时仍保持设置状态可见", async () => {
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
    expect(screen.getByText("错误：pending changes unavailable")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "重试待同步变更" }));

    expect(await screen.findByText("待同步变更")).toBeInTheDocument();
    expect(screen.getByText("change-2")).toBeInTheDocument();
    expect(repository.listPendingChanges).toHaveBeenCalledTimes(2);
  });

  it("在设置页显示禁用的远程同步配置", async () => {
    const repository = fakeRepository();
    const remoteSyncConfig: RemoteSyncConfig = {
      enabled: false,
      reason: "未配置远程同步 base URL",
    };

    renderWithRepository(Settings, repository, {
      props: { remoteSyncConfig },
    });

    expect(await screen.findByText("远程同步配置")).toBeInTheDocument();
    expect(screen.getByText("已禁用")).toBeInTheDocument();
    expect(screen.getByText("未配置远程同步 base URL")).toBeInTheDocument();
  });

  it("在设置页显示启用的远程同步配置且不暴露 token", async () => {
    const repository = fakeRepository();
    const remoteSyncConfig: RemoteSyncConfig = {
      enabled: true,
      baseUrl: "https://api.example.test/momo",
      headers: async () => ({ authorization: "Bearer secret-token" }),
    };

    renderWithRepository(Settings, repository, {
      props: { remoteSyncConfig },
    });

    expect(await screen.findByText("远程同步配置")).toBeInTheDocument();
    expect(screen.getByText("已启用")).toBeInTheDocument();
    expect(screen.getByText("https://api.example.test/momo")).toBeInTheDocument();
    expect(screen.getByText("已配置")).toBeInTheDocument();
    const syncActionRow = screen.getByText("同步动作").closest("li");
    expect(syncActionRow).not.toBeNull();
    expect(within(syncActionRow as HTMLElement).getByText("本地模拟")).toBeInTheDocument();
    expect(screen.queryByText("secret-token")).not.toBeInTheDocument();
  });

  it("在设置页显示只读待处理同步冲突摘要", async () => {
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
        reason: "任务版本冲突",
        createdAt: "2026-05-16T12:01:00.000Z",
        serverTaskTitle: "Server title",
        serverTaskVersion: 5,
        clientPayloadSummary: 'patch: {"title":"Local title"}',
      },
    ];

    renderWithRepository(Settings, repository, {
      props: { pendingConflicts: conflicts },
    });

    expect(await screen.findByText("同步冲突")).toBeInTheDocument();
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
        "本地变更创建于 2026-05-16T12:00:30.000Z",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /resolve/i })).not.toBeInTheDocument();
  });

  it("在设置页显示只读同步运行摘要", async () => {
    const repository = fakeRepository();
    const syncSummary: SyncRunSummary = {
      status: "has-rejections",
      message: "1 个本地变更需要重试或修复",
      acceptedCount: 2,
      rejectedCount: 1,
      conflictCount: 0,
      serverCursor: "cursor-4",
    };

    renderWithRepository(Settings, repository, {
      props: { syncSummary },
    });

    expect(await screen.findByText("同步状态")).toBeInTheDocument();
    expect(screen.getByText("1 个本地变更需要重试或修复")).toBeInTheDocument();
    expect(screen.getByText("has-rejections")).toBeInTheDocument();
    expect(screen.getByText("cursor-4")).toBeInTheDocument();

    const acceptedRow = screen.getByText("已接受").closest("li");
    const rejectedRow = screen.getByText("已拒绝").closest("li");
    const conflictRow = screen.getByText("冲突").closest("li");
    expect(within(acceptedRow as HTMLElement).getByText("2")).toBeInTheDocument();
    expect(within(rejectedRow as HTMLElement).getByText("1")).toBeInTheDocument();
    expect(within(conflictRow as HTMLElement).getByText("0")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /resolve/i })).not.toBeInTheDocument();
  });

  it("本地同步模拟后显示只读同步拒绝详情", async () => {
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
            message: "1 个本地变更需要重试或修复",
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
      await screen.findByRole("button", { name: "运行本地同步模拟" }),
    );

    expect(await screen.findByText("同步拒绝")).toBeInTheDocument();
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

  it("在设置页运行注入的本地同步模拟", async () => {
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
          message: "已完成同步",
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
      await screen.findByRole("button", { name: "运行本地同步模拟" }),
    );

    expect(onRunLocalSyncSimulation).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("同步状态")).toBeInTheDocument();
    expect(screen.getByText("已完成同步")).toBeInTheDocument();
    expect(screen.getByText("cursor-3")).toBeInTheDocument();
  });

  it("在设置页显示本地同步模拟错误", async () => {
    const repository = fakeRepository();
    const onRunLocalSyncSimulation = vi
      .fn()
      .mockRejectedValue(new Error("simulation unavailable"));

    renderWithRepository(Settings, repository, {
      props: { onRunLocalSyncSimulation },
    });

    await fireEvent.click(
      await screen.findByRole("button", { name: "运行本地同步模拟" }),
    );

    expect(await screen.findByText("错误：simulation unavailable")).toBeInTheDocument();
  });

  it("接受来自设置页模拟回调的同步 runner 结果", async () => {
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
            message: "已完成同步",
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
      await screen.findByRole("button", { name: "运行本地同步模拟" }),
    );

    expect(await screen.findByText("同步状态")).toBeInTheDocument();
    expect(screen.getByText("cursor-9")).toBeInTheDocument();
  });

  it("本地同步模拟后显示只读 delta pull 摘要", async () => {
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
            message: "已完成同步",
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
      await screen.findByRole("button", { name: "运行本地同步模拟" }),
    );

    expect(await screen.findByText("已应用拉取结果")).toBeInTheDocument();
    const appliedRow = screen.getByText("已应用任务").closest("li");
    const deletedRow = screen.getByText("已删除任务").closest("li");
    const cursorRow = screen.getByText("拉取游标").closest("li");
    expect(within(appliedRow as HTMLElement).getByText("2")).toBeInTheDocument();
    expect(within(deletedRow as HTMLElement).getByText("1")).toBeInTheDocument();
    expect(within(cursorRow as HTMLElement).getByText("cursor-12")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pull/i })).not.toBeInTheDocument();
  });

  it("本地同步模拟成功后刷新本地数据库和同步状态", async () => {
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
          message: "已完成同步",
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
            message: "已完成同步",
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
      await screen.findByRole("button", { name: "运行本地同步模拟" }),
    );

    const pendingRow = await screen.findByText("待同步").then((label) =>
      label.closest("li"),
    );
    const serverCursorRow = screen.getByText("服务端游标").closest("li");
    const lastErrorRow = screen.getByText("最近错误").closest("li");
    expect(repository.getStats).toHaveBeenCalledTimes(2);
    expect(repository.getSyncState).toHaveBeenCalledTimes(2);
    expect(repository.listRecentSyncRuns).toHaveBeenCalledTimes(2);
    expect(within(pendingRow as HTMLElement).getByText("0")).toBeInTheDocument();
    expect(
      within(serverCursorRow as HTMLElement).getByText("cursor-from-repository"),
    ).toBeInTheDocument();
    expect(within(lastErrorRow as HTMLElement).getByText("无")).toBeInTheDocument();
    expect(await screen.findByText("同步历史")).toBeInTheDocument();
    expect(screen.getByText("cursor-from-history")).toBeInTheDocument();
  });

  it("在设置页显示同步 runner 错误", async () => {
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
      await screen.findByRole("button", { name: "运行本地同步模拟" }),
    );

    expect(await screen.findByText("错误：transport unavailable")).toBeInTheDocument();
  });

  it("同步 runner 出错后刷新同步状态", async () => {
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
        lastError: "HTTP-like 同步传输失败",
        updatedAt: "2026-05-16T12:00:00.000Z",
      });
    const runnerResult: SyncRunnerRunOnceResult = {
      ok: false,
      error: "HTTP-like 同步传输失败",
      result: null,
    };

    renderWithRepository(Settings, repository, {
      props: { onRunLocalSyncSimulation: vi.fn().mockResolvedValue(runnerResult) },
    });

    expect(await screen.findByText("cursor-before")).toBeInTheDocument();
    await fireEvent.click(
      await screen.findByRole("button", { name: "运行本地同步模拟" }),
    );

    expect(
      await screen.findByText("错误：HTTP-like 同步传输失败"),
    ).toBeInTheDocument();
    expect(await screen.findByText("无")).toBeInTheDocument();
    const serverCursorRow = screen.getByText("服务端游标").closest("li");
    const lastErrorRow = screen.getByText("最近错误").closest("li");
    expect(repository.getSyncState).toHaveBeenCalledTimes(2);
    expect(within(serverCursorRow as HTMLElement).getByText("无")).toBeInTheDocument();
    expect(
      within(lastErrorRow as HTMLElement).getByText("HTTP-like 同步传输失败"),
    ).toBeInTheDocument();
  });

  it("在默认设置页路由显示本地同步模拟入口", async () => {
    const repository = fakeRepository();

    await renderAppAt("/settings", repository);

    expect(screen.getByRole("button", { name: "打开小组件" })).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "运行本地同步模拟" }),
    ).toBeInTheDocument();
  });

  it("保持登录占位路由接入 Vue router", async () => {
    const repository = fakeRepository();

    await renderAppAt("/login", repository);

    await fireEvent.update(screen.getByLabelText("邮箱"), "you@example.com");
    await fireEvent.click(screen.getByRole("button", { name: "继续" }));

    expect(await screen.findByText("今日到期")).toBeInTheDocument();
  });

  it("将远程同步环境配置传入默认设置页路由", async () => {
    vi.stubEnv("VITE_MOMO_SYNC_BASE_URL", "https://api.example.test/momo");
    vi.stubEnv("VITE_MOMO_SYNC_TOKEN", "secret-token");
    const repository = fakeRepository();

    await renderAppAt("/settings", repository);

    expect(await screen.findByText("远程同步配置")).toBeInTheDocument();
    expect(screen.getByText("已启用")).toBeInTheDocument();
    expect(screen.getByText("https://api.example.test/momo")).toBeInTheDocument();
    expect(screen.getByText("已配置")).toBeInTheDocument();
    const syncActionRow = screen.getByText("同步动作").closest("li");
    expect(syncActionRow).not.toBeNull();
    expect(within(syncActionRow as HTMLElement).getByText("本地模拟")).toBeInTheDocument();
    expect(screen.queryByText("secret-token")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "运行本地同步模拟" }),
    ).toBeInTheDocument();
  });

  it("使用重试恢复设置页数据库状态错误", async () => {
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

    expect(await screen.findByText("错误：stats unavailable")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "重试" }));

    expect(await screen.findByText("sqlite:momo.db")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("显示今日任务的紧凑小组件视图", async () => {
    const repository = fakeRepository({
      today: {
        overdue: [task({ id: "late", title: "Late invoice" })],
        dueToday: [task({ id: "focus", title: "Focus block" })],
        completedToday: [],
      },
    });

    renderWithRepository(Widget, repository);

    expect(await screen.findByText("Momo 小组件")).toBeInTheDocument();
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
      message: "已完成同步",
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
