import { describe, expect, it, vi } from "vitest";
import {
  createApiRouter,
  createInMemorySyncEventStore,
  createInMemorySyncStore,
  createInMemoryTaskRepository,
  createSyncApi,
  createSyncEventApi,
  createTaskService,
} from "../../../apps/api/src";
import * as apiModule from "../../../apps/api/src";
import {
  createListSyncEventsRequest,
  createDeltaPushRequest,
  SYNC_CONTRACT_VERSION,
  type ListSyncEventsResponse,
  type SyncEventDto,
  type DeltaPushRequest,
  type DeltaPushResponse,
  type DeltaPullResponse,
  type TaskConflictDto,
} from "../../../packages/contracts/src";
import type { TaskRepository } from "../src/data/taskRepository";
import {
  SYNC_RUN_STATUSES,
  applyDeltaPullResponse,
  applyDeltaPushResponse,
  buildDeltaPushFromPendingChanges,
  createSyncRunner,
  fetchRealtimeEventCatchUp,
  runLocalSyncSimulation,
  summarizeSyncEvents,
  summarizeDeltaPushResponse,
  summarizePendingConflictDetails,
  summarizePendingLocalChanges,
  summarizeRejectedChanges,
  summarizePendingConflicts,
  type ApplyDeltaPushResult,
} from "../src/sync/syncClient";
import { createHttpSyncTransport } from "../src/sync/httpSyncTransport";
import { createHttpLikeSyncTransport } from "../src/sync/httpLikeSyncTransport";
import { createLocalSyncRunner } from "../src/sync/localSyncRunner";
import { createRemoteSyncRunner } from "../src/sync/remoteSyncRunner";
import { createRemoteSyncConfig } from "../src/sync/remoteSyncConfig";

describe("桌面端同步客户端适配器", () => {
  it("导出稳定的同步运行状态列表", () => {
    expect(SYNC_RUN_STATUSES).toEqual([
      "all-synced",
      "has-rejections",
      "has-conflicts",
    ]);
  });

  it("从待同步本地变更构造 delta push 请求", async () => {
    const repository = {
      listPendingChanges: vi.fn().mockResolvedValue([
        {
          id: "change-1",
          entityType: "task",
          entityId: "task-1",
          action: "task.create",
          payload: { title: "Sync me" },
          createdAt: "2026-05-16T10:00:00.000Z",
          syncedAt: null,
        },
      ]),
    } as unknown as TaskRepository;

    await expect(
      buildDeltaPushFromPendingChanges({
        repository,
        workspaceId: "local",
        deviceId: "desktop-1",
        now: new Date("2026-05-16T12:00:00.000Z"),
      }),
    ).resolves.toEqual({
      contractVersion: SYNC_CONTRACT_VERSION,
      workspaceId: "local",
      deviceId: "desktop-1",
      changes: [
        {
          id: "change-1",
          entityType: "task",
          entityId: "task-1",
          action: "task.create",
          payload: { title: "Sync me" },
          createdAt: "2026-05-16T10:00:00.000Z",
        },
      ],
      clientSentAt: "2026-05-16T12:00:00.000Z",
    });
  });

  it("在没有待处理变更时构造空 delta push 请求", async () => {
    const repository = {
      listPendingChanges: vi.fn().mockResolvedValue([]),
    } as unknown as TaskRepository;

    const request = await buildDeltaPushFromPendingChanges({
      repository,
      workspaceId: "local",
      deviceId: "desktop-1",
      now: new Date("2026-05-16T12:00:00.000Z"),
    });

    expect(request.changes).toEqual([]);
    expect(repository.listPendingChanges).toHaveBeenCalledTimes(1);
  });

  it("为设置页只读展示汇总待同步本地变更", () => {
    expect(
      summarizePendingLocalChanges(
        [
          {
            id: "change-1",
            entityType: "task",
            entityId: "task-1",
            action: "task.update",
            payload: {
              id: "task-1",
              baseVersion: 4,
              patch: { title: "Draft plan", priority: 2 },
              updatedAt: "2026-05-16T10:00:00.000Z",
            },
            createdAt: "2026-05-16T10:01:00.000Z",
            syncedAt: null,
          },
          {
            id: "change-2",
            entityType: "task",
            entityId: "task-2",
            action: "task.delete",
            payload: { id: "task-2" },
            createdAt: "2026-05-16T10:02:00.000Z",
            syncedAt: null,
          },
        ],
        1,
      ),
    ).toEqual([
      {
        id: "change-1",
        entityLabel: "task:task-1",
        action: "task.update",
        createdAt: "2026-05-16T10:01:00.000Z",
        payloadSummary: 'patch: {"title":"Draft plan","priority":2}',
      },
    ]);
  });

  it("将被拒绝同步变更关联到待同步本地变更摘要", () => {
    const pendingSummaries = summarizePendingLocalChanges([
      {
        id: "change-2",
        entityType: "task",
        entityId: "task-2",
        action: "task.update",
        payload: {
          id: "task-2",
          baseVersion: 3,
          patch: { title: "Rejected edit" },
          updatedAt: "2026-05-16T10:00:00.000Z",
        },
        createdAt: "2026-05-16T10:01:00.000Z",
        syncedAt: null,
      },
    ]);

    expect(
      summarizeRejectedChanges(
        [
          { id: "change-2", reason: "Invalid payload" },
          { id: "missing-change", reason: "Unknown local change" },
        ],
        pendingSummaries,
      ),
    ).toEqual([
      {
        id: "change-2",
        reason: "Invalid payload",
        localChange: {
          id: "change-2",
          entityLabel: "task:task-2",
          action: "task.update",
          createdAt: "2026-05-16T10:01:00.000Z",
          payloadSummary: 'patch: {"title":"Rejected edit"}',
        },
      },
      {
        id: "missing-change",
        reason: "Unknown local change",
        localChange: null,
      },
    ]);
  });

  it("为只读展示汇总实时同步事件", () => {
    const events: SyncEventDto[] = [
      {
        id: "event-1",
        workspaceId: "local",
        sequence: 1,
        type: "task.changed",
        taskId: "task-1",
        changeId: "change-1",
        payload: { action: "task.create" },
        createdAt: "2026-05-16T12:00:00.000Z",
      },
      {
        id: "event-2",
        workspaceId: "local",
        sequence: 2,
        type: "conflict.raised",
        taskId: "task-1",
        changeId: "change-2",
        conflictId: "conflict-change-2",
        payload: { reason: "任务版本冲突" },
        createdAt: "2026-05-16T12:01:00.000Z",
      },
      {
        id: "event-3",
        workspaceId: "local",
        sequence: 3,
        type: "sync.run.updated",
        payload: { status: "all-synced", acceptedCount: 1 },
        createdAt: "2026-05-16T12:02:00.000Z",
      },
    ];

    expect(summarizeSyncEvents(events)).toEqual([
      {
        id: "event-1",
        kind: "task.changed",
        sequence: 1,
        createdAt: "2026-05-16T12:00:00.000Z",
        taskId: "task-1",
        changeId: "change-1",
        conflictId: null,
        payloadSummary: 'action: "task.create"',
      },
      {
        id: "event-2",
        kind: "conflict.raised",
        sequence: 2,
        createdAt: "2026-05-16T12:01:00.000Z",
        taskId: "task-1",
        changeId: "change-2",
        conflictId: "conflict-change-2",
        payloadSummary: 'reason: "任务版本冲突"',
      },
      {
        id: "event-3",
        kind: "sync.run.updated",
        sequence: 3,
        createdAt: "2026-05-16T12:02:00.000Z",
        taskId: null,
        changeId: null,
        conflictId: null,
        payloadSummary: 'status: "all-synced", acceptedCount: 1',
      },
    ]);
  });

  it("不运行同步也能获取实时事件补拉摘要", async () => {
    const transport = {
      deltaPush: vi.fn(),
      listConflicts: vi.fn(),
      listEvents: vi.fn().mockResolvedValue({
        contractVersion: SYNC_CONTRACT_VERSION,
        events: [
          {
            id: "event-4",
            workspaceId: "local",
            sequence: 4,
            type: "task.changed",
            taskId: "task-2",
            changeId: "change-4",
            payload: { action: "task.status" },
            createdAt: "2026-05-16T12:04:00.000Z",
          },
        ],
        latestSequence: 4,
        serverTime: "2026-05-16T12:04:01.000Z",
      } satisfies ListSyncEventsResponse),
    };

    await expect(
      fetchRealtimeEventCatchUp({
        transport,
        workspaceId: "local",
        deviceId: "desktop-1",
        afterSequence: 3,
        limit: 5,
      }),
    ).resolves.toEqual({
      enabled: true,
      latestSequence: 4,
      serverTime: "2026-05-16T12:04:01.000Z",
      events: [
        {
          id: "event-4",
          kind: "task.changed",
          sequence: 4,
          createdAt: "2026-05-16T12:04:00.000Z",
          taskId: "task-2",
          changeId: "change-4",
          conflictId: null,
          payloadSummary: 'action: "task.status"',
        },
      ],
    });
    expect(transport.listEvents).toHaveBeenCalledWith({
      contractVersion: SYNC_CONTRACT_VERSION,
      workspaceId: "local",
      deviceId: "desktop-1",
      afterSequence: 3,
      limit: 5,
    });
    expect(transport.deltaPush).not.toHaveBeenCalled();
    expect(transport.listConflicts).not.toHaveBeenCalled();
  });

  it("当 transport 不暴露事件时返回禁用的实时补拉结果", async () => {
    await expect(
      fetchRealtimeEventCatchUp({
        transport: {
          deltaPush: vi.fn(),
          listConflicts: vi.fn(),
        },
        workspaceId: "local",
        deviceId: "desktop-1",
        afterSequence: 0,
        limit: 5,
      }),
    ).resolves.toEqual({
      enabled: false,
      reason: "实时事件补拉不可用",
      latestSequence: 0,
      events: [],
    });
  });

  it("使用内存同步 API 运行本地同步模拟", async () => {
    const repository = {
      listPendingChanges: vi.fn().mockResolvedValue([
        {
          id: "change-1",
          entityType: "task",
          entityId: "task-1",
          action: "task.create",
          payload: {
            id: "task-1",
            title: "Local simulated task",
            notes: null,
            status: "active",
            priority: 0,
            dueAt: null,
            estimateMin: null,
            tags: [],
            createdAt: "2026-05-16T10:00:00.000Z",
            updatedAt: "2026-05-16T10:00:00.000Z",
            completedAt: null,
          },
          createdAt: "2026-05-16T10:00:00.000Z",
          syncedAt: null,
        },
      ]),
      markChangeSynced: vi.fn().mockResolvedValue(undefined),
    } as unknown as TaskRepository;
    const syncApi = createSyncApi({
      store: createInMemorySyncStore(),
      now: () => new Date("2026-05-16T12:00:00.000Z"),
    });

    await expect(
      runLocalSyncSimulation({
        repository,
        syncApi,
        workspaceId: "local",
        deviceId: "desktop-1",
        now: new Date("2026-05-16T12:01:00.000Z"),
      }),
    ).resolves.toMatchObject({
      request: {
        workspaceId: "local",
        deviceId: "desktop-1",
        changes: [{ id: "change-1" }],
      },
      push: {
        acceptedChangeIds: ["change-1"],
        summary: {
          status: "all-synced",
          message: "已同步 1 个本地变更",
          serverCursor: "cursor-1",
        },
      },
      pendingConflicts: [],
    });
    expect(repository.markChangeSynced).toHaveBeenCalledWith(
      "change-1",
      new Date("2026-05-16T12:01:00.000Z"),
    );
  });

  it("将同步 runner transport 调用适配到 HTTP-like API router 路由", async () => {
    const eventApi = createSyncEventApi({
      store: createInMemorySyncEventStore(),
      now: () => new Date("2026-05-16T12:00:00.000Z"),
    });
    const router = createApiRouter({
      taskService: createTaskService({
        repository: createInMemoryTaskRepository(),
        now: () => new Date("2026-05-16T12:00:00.000Z"),
        id: () => "task-1",
      }),
      syncApi: createSyncApi({
        store: createInMemorySyncStore(),
        now: () => new Date("2026-05-16T12:00:00.000Z"),
      }),
      syncEventApi: eventApi,
    });
    const transport = createHttpLikeSyncTransport({ router });
    const pushRequest = createDeltaPushRequest({
      workspaceId: "local",
      deviceId: "desktop-1",
      changes: [
        {
          id: "change-1",
          entityType: "task",
          entityId: "task-1",
          action: "task.create",
          payload: {
            id: "task-1",
            title: "Transport task",
            notes: null,
            status: "active",
            priority: 0,
            dueAt: null,
            estimateMin: null,
            tags: [],
            createdAt: "2026-05-16T10:00:00.000Z",
            updatedAt: "2026-05-16T10:00:00.000Z",
            completedAt: null,
          },
          createdAt: "2026-05-16T10:00:00.000Z",
        },
      ],
      now: new Date("2026-05-16T10:01:00.000Z"),
    });

    await expect(transport.deltaPush(pushRequest)).resolves.toMatchObject({
      acceptedChangeIds: ["change-1"],
      serverCursor: "cursor-1",
    });
    await expect(
      transport.deltaPull({
        contractVersion: SYNC_CONTRACT_VERSION,
        workspaceId: "local",
        deviceId: "desktop-1",
        sinceCursor: null,
      }),
    ).resolves.toMatchObject({
      tasks: [{ id: "task-1", title: "Transport task" }],
      serverCursor: "cursor-1",
    });
    await expect(
      transport.listConflicts({
        contractVersion: SYNC_CONTRACT_VERSION,
        workspaceId: "local",
        deviceId: "desktop-1",
      }),
    ).resolves.toMatchObject({
      conflicts: [],
      serverCursor: "cursor-1",
    });
    await expect(
      transport.listEvents?.(
        createListSyncEventsRequest({
          workspaceId: "local",
          deviceId: "desktop-1",
          afterSequence: 0,
          limit: 10,
        }),
      ),
    ).resolves.toMatchObject({
      events: [],
      latestSequence: 0,
    });
  });

  it("将同步 runner transport 调用适配到注入的 HTTP fetch 请求", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        contractVersion: SYNC_CONTRACT_VERSION,
        acceptedChangeIds: ["change-1"],
        rejectedChanges: [],
        conflicts: [],
        serverCursor: "cursor-1",
        serverTime: "2026-05-16T12:00:00.000Z",
      } satisfies DeltaPushResponse),
    });
    const transport = createHttpSyncTransport({
      baseUrl: "https://api.example.test/momo/",
      fetch,
    });
    const request: DeltaPushRequest = createDeltaPushRequest({
      workspaceId: "local",
      deviceId: "desktop-1",
      changes: [],
      now: new Date("2026-05-16T12:00:00.000Z"),
    });

    await expect(transport.deltaPush(request)).resolves.toMatchObject({
      acceptedChangeIds: ["change-1"],
      serverCursor: "cursor-1",
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.test/momo/sync/delta/push",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(request),
      },
    );
  });

  it("通过注入的 HTTP transport 适配实时事件补拉调用", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        contractVersion: SYNC_CONTRACT_VERSION,
        events: [
          {
            id: "event-1",
            workspaceId: "local",
            sequence: 1,
            type: "task.changed",
            taskId: "task-1",
            changeId: "change-1",
            payload: { action: "task.create" },
            createdAt: "2026-05-16T12:00:00.000Z",
          },
        ],
        latestSequence: 1,
        serverTime: "2026-05-16T12:00:00.000Z",
      } satisfies ListSyncEventsResponse),
    });
    const transport = createHttpSyncTransport({
      baseUrl: "https://api.example.test/momo/",
      fetch,
    });
    const request = createListSyncEventsRequest({
      workspaceId: "local",
      deviceId: "desktop-1",
      afterSequence: 0,
      limit: 10,
    });

    await expect(transport.listEvents?.(request)).resolves.toMatchObject({
      events: [
        {
          id: "event-1",
          type: "task.changed",
          taskId: "task-1",
        },
      ],
      latestSequence: 1,
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.test/momo/sync/events",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(request),
      },
    );
  });

  it("为每个请求添加已配置的 HTTP 同步 transport headers", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        contractVersion: SYNC_CONTRACT_VERSION,
        conflicts: [],
        serverCursor: "cursor-0",
        serverTime: "2026-05-16T12:00:00.000Z",
      }),
    });
    const transport = createHttpSyncTransport({
      baseUrl: "https://api.example.test",
      fetch,
      headers: async () => ({
        authorization: "Bearer local-token",
        "x-client-version": "desktop-test",
      }),
    });

    await transport.listConflicts({
      contractVersion: SYNC_CONTRACT_VERSION,
      workspaceId: "local",
      deviceId: "desktop-1",
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.test/sync/conflicts",
      expect.objectContaining({
        headers: {
          "content-type": "application/json",
          authorization: "Bearer local-token",
          "x-client-version": "desktop-test",
        },
      }),
    );
  });

  it("在调用 fetch 前拒绝缺失 HTTP 同步 transport base URL", async () => {
    const fetch = vi.fn();
    const transport = createHttpSyncTransport({
      baseUrl: "   ",
      fetch,
    });

    await expect(
      transport.deltaPull({
        contractVersion: SYNC_CONTRACT_VERSION,
        workspaceId: "local",
        deviceId: "desktop-1",
        sinceCursor: null,
      }),
    ).rejects.toThrow("未配置 HTTP 同步 baseUrl");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("未配置 base URL 时构造禁用的远程同步配置", () => {
    expect(createRemoteSyncConfig({})).toEqual({
      enabled: false,
      reason: "未配置远程同步 base URL",
    });
  });

  it("构造带授权 headers provider 的远程同步配置", async () => {
    const config = createRemoteSyncConfig({
      VITE_MOMO_SYNC_BASE_URL: " https://api.example.test/momo ",
      VITE_MOMO_SYNC_TOKEN: " local-token ",
    });

    expect(config).toMatchObject({
      enabled: true,
      baseUrl: "https://api.example.test/momo",
    });
    expect(config.enabled).toBe(true);
    await expect(config.headers()).resolves.toEqual({
      authorization: "Bearer local-token",
    });
  });

  it("在远程同步禁用时短路远程同步 runner 创建", () => {
    const fetch = vi.fn();
    const repository = {
      listPendingChanges: vi.fn(),
      markChangeSynced: vi.fn(),
      getSyncState: vi.fn(),
      applyRemoteTask: vi.fn(),
      deleteRemoteTask: vi.fn(),
      saveSyncState: vi.fn(),
    } as unknown as TaskRepository;

    expect(
      createRemoteSyncRunner({
        remoteSyncConfig: {
          enabled: false,
          reason: "未配置远程同步 base URL",
        },
        repository,
        workspaceId: "local",
        deviceId: "desktop-1",
        now: () => new Date("2026-05-16T12:00:00.000Z"),
        fetch,
      }),
    ).toEqual({
      kind: "disabled",
      reason: "未配置远程同步 base URL",
      runner: null,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("从启用的远程配置创建远程同步 runner 并连接 HTTP transport", async () => {
    const repository = {
      listPendingChanges: vi.fn().mockResolvedValue([]),
      markChangeSynced: vi.fn().mockResolvedValue(undefined),
      getSyncState: vi.fn().mockResolvedValue({
        serverCursor: "cursor-before",
        lastSyncedAt: "2026-05-16T11:59:00.000Z",
        lastError: null,
        updatedAt: "2026-05-16T11:59:00.000Z",
      }),
      applyRemoteTask: vi.fn().mockResolvedValue(undefined),
      deleteRemoteTask: vi.fn().mockResolvedValue(undefined),
      saveSyncState: vi.fn().mockResolvedValue({
        serverCursor: "cursor-after",
        lastSyncedAt: "2026-05-16T12:00:00.000Z",
        lastError: null,
        updatedAt: "2026-05-16T12:00:00.000Z",
      }),
    } as unknown as TaskRepository;
    const fetch = vi.fn().mockImplementation(async (url: string, init) => {
      expect(init.headers).toEqual(
        expect.objectContaining({
          "content-type": "application/json",
          authorization: "Bearer remote-token",
        }),
      );

      if (url.endsWith("/sync/delta/push")) {
        return {
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({
            contractVersion: SYNC_CONTRACT_VERSION,
            acceptedChangeIds: [],
            rejectedChanges: [],
            conflicts: [],
            serverCursor: "cursor-push",
            serverTime: "2026-05-16T12:00:00.000Z",
          } satisfies DeltaPushResponse),
        };
      }

      if (url.endsWith("/sync/conflicts")) {
        return {
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({
            contractVersion: SYNC_CONTRACT_VERSION,
            conflicts: [],
            serverCursor: "cursor-push",
            serverTime: "2026-05-16T12:00:00.000Z",
          }),
        };
      }

      if (url.endsWith("/sync/delta/pull")) {
        expect(init.body).toContain('"sinceCursor":"cursor-before"');
        return {
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({
            contractVersion: SYNC_CONTRACT_VERSION,
            tasks: [
              {
                id: "task-remote",
                workspaceId: "local",
                title: "Remote task",
                notes: null,
                status: "active",
                priority: 0,
                dueAt: null,
                estimateMin: null,
                tags: [],
                createdAt: "2026-05-16T10:00:00.000Z",
                updatedAt: "2026-05-16T12:00:00.000Z",
                completedAt: null,
                version: 2,
              },
            ],
            deletedTaskIds: ["task-deleted"],
            serverCursor: "cursor-after",
            serverTime: "2026-05-16T12:00:30.000Z",
          } satisfies DeltaPullResponse),
        };
      }

      throw new Error(`Unexpected remote sync URL: ${url}`);
    });

    const runnerResolution = createRemoteSyncRunner({
      remoteSyncConfig: {
        enabled: true,
        baseUrl: "https://api.example.test/momo",
        headers: async () => ({ authorization: "Bearer remote-token" }),
      },
      repository,
      workspaceId: "local",
      deviceId: "desktop-1",
      now: () => new Date("2026-05-16T12:00:00.000Z"),
      fetch,
    });

    expect(runnerResolution.kind).toBe("enabled");
    await expect(runnerResolution.runner.runOnce()).resolves.toMatchObject({
      ok: true,
      result: {
        pull: {
          appliedTaskCount: 1,
          deletedTaskCount: 1,
          serverCursor: "cursor-after",
        },
      },
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.test/momo/sync/delta/push",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.test/momo/sync/conflicts",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.test/momo/sync/delta/pull",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(repository.applyRemoteTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: "task-remote", title: "Remote task" }),
      2,
    );
    expect(repository.deleteRemoteTask).toHaveBeenCalledWith("task-deleted");
    expect(repository.saveSyncState).toHaveBeenCalledWith({
      serverCursor: "cursor-after",
      lastSyncedAt: "2026-05-16T12:00:00.000Z",
      lastError: null,
    });
  });

  it("将注入的 HTTP fetch transport 错误暴露为 method、path 和 status", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: vi.fn().mockResolvedValue({ error: "sync service unavailable" }),
    });
    const transport = createHttpSyncTransport({
      baseUrl: "https://api.example.test",
      fetch,
    });

    await expect(
      transport.deltaPull({
        contractVersion: SYNC_CONTRACT_VERSION,
        workspaceId: "local",
        deviceId: "desktop-1",
        sinceCursor: null,
      }),
    ).rejects.toThrow(
      "POST /sync/delta/pull failed with 503: sync service unavailable",
    );
  });

  it("将 HTTP-like 同步 transport 路由错误暴露为抛出错误", async () => {
    const router = {
      handle: vi.fn().mockResolvedValue({
        status: 400,
        body: { error: "不支持的同步契约版本" },
      }),
    };
    const transport = createHttpLikeSyncTransport({ router });

    await expect(
      transport.deltaPull({
        contractVersion: 1,
        workspaceId: "local",
        deviceId: "desktop-1",
        sinceCursor: null,
      }),
    ).rejects.toThrow(
      "POST /sync/delta/pull failed with 400: 不支持的同步契约版本",
    );
    expect(router.handle).toHaveBeenCalledWith({
      method: "POST",
      path: "/sync/delta/pull",
      body: {
        contractVersion: 1,
        workspaceId: "local",
        deviceId: "desktop-1",
        sinceCursor: null,
      },
    });
  });

  it("将 HTTP-like 实时事件补拉错误暴露为抛出错误", async () => {
    const router = {
      handle: vi.fn().mockResolvedValue({
        status: 404,
        body: { error: "未配置同步事件 API" },
      }),
    };
    const transport = createHttpLikeSyncTransport({ router });
    const request = createListSyncEventsRequest({
      workspaceId: "local",
      deviceId: "desktop-1",
      afterSequence: 2,
      limit: 5,
    });

    await expect(transport.listEvents?.(request)).rejects.toThrow(
      "GET /sync/events failed with 404: 未配置同步事件 API",
    );
    expect(router.handle).toHaveBeenCalledWith({
      method: "GET",
      path: "/sync/events",
      body: request,
    });
  });

  it("通过 HTTP-like API router 边界创建默认本地同步 runner", async () => {
    const repository = {
      listPendingChanges: vi.fn().mockResolvedValue([]),
      markChangeSynced: vi.fn().mockResolvedValue(undefined),
      getSyncState: vi.fn().mockResolvedValue({
        serverCursor: null,
        lastSyncedAt: null,
        lastError: null,
        updatedAt: null,
      }),
      applyRemoteTask: vi.fn().mockResolvedValue(undefined),
      deleteRemoteTask: vi.fn().mockResolvedValue(undefined),
      saveSyncState: vi.fn().mockResolvedValue({
        serverCursor: "cursor-0",
        lastSyncedAt: "2026-05-16T12:00:00.000Z",
        lastError: null,
        updatedAt: "2026-05-16T12:00:00.000Z",
      }),
    } as unknown as TaskRepository;
    const handle = vi.fn().mockImplementation(async (request) => {
      if (request.path === "/sync/delta/push") {
        return {
          status: 200,
          body: {
            contractVersion: SYNC_CONTRACT_VERSION,
            acceptedChangeIds: [],
            rejectedChanges: [],
            conflicts: [],
            serverCursor: "cursor-0",
            serverTime: "2026-05-16T12:00:00.000Z",
          },
        };
      }
      if (request.path === "/sync/delta/pull") {
        return {
          status: 200,
          body: {
            contractVersion: SYNC_CONTRACT_VERSION,
            tasks: [],
            deletedTaskIds: [],
            serverCursor: "cursor-0",
            serverTime: "2026-05-16T12:00:00.000Z",
          },
        };
      }
      return {
        status: 200,
        body: {
          contractVersion: SYNC_CONTRACT_VERSION,
          conflicts: [],
          serverCursor: "cursor-0",
          serverTime: "2026-05-16T12:00:00.000Z",
        },
      };
    });
    const createApiRouterSpy = vi
      .spyOn(apiModule, "createApiRouter")
      .mockReturnValue({ handle });

    const runner = createLocalSyncRunner(repository);
    await expect(runner.runOnce()).resolves.toMatchObject({
      ok: true,
      result: {
        pull: {
          appliedTaskCount: 0,
          deletedTaskCount: 0,
          serverCursor: "cursor-0",
        },
      },
    });

    expect(createApiRouterSpy).toHaveBeenCalledTimes(1);
    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/sync/delta/push",
      }),
    );
    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        path: "/sync/conflicts",
      }),
    );
    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/sync/delta/pull",
      }),
    );
    createApiRouterSpy.mockRestore();
  });

  it("从本地同步模拟返回冲突摘要且不把冲突变更标为 synced", async () => {
    const repository = {
      listPendingChanges: vi.fn().mockResolvedValue([
        {
          id: "change-3",
          entityType: "task",
          entityId: "task-1",
          action: "task.update",
          payload: {
            id: "task-1",
            baseVersion: 1,
            patch: { title: "Stale local edit" },
            updatedAt: "2026-05-16T10:20:00.000Z",
          },
          createdAt: "2026-05-16T10:21:00.000Z",
          syncedAt: null,
        },
      ]),
      markChangeSynced: vi.fn().mockResolvedValue(undefined),
    } as unknown as TaskRepository;
    const syncApi = createSyncApi({
      store: createInMemorySyncStore(),
      now: () => new Date("2026-05-16T12:00:00.000Z"),
    });

    await syncApi.deltaPush({
      contractVersion: SYNC_CONTRACT_VERSION,
      workspaceId: "local",
      deviceId: "desktop-1",
      changes: [
        {
          id: "change-1",
          entityType: "task",
          entityId: "task-1",
          action: "task.create",
          payload: {
            id: "task-1",
            title: "Original task",
            notes: null,
            status: "active",
            priority: 0,
            dueAt: null,
            estimateMin: null,
            tags: [],
            createdAt: "2026-05-16T10:00:00.000Z",
            updatedAt: "2026-05-16T10:00:00.000Z",
            completedAt: null,
          },
          createdAt: "2026-05-16T10:00:00.000Z",
        },
        {
          id: "change-2",
          entityType: "task",
          entityId: "task-1",
          action: "task.update",
          payload: {
            id: "task-1",
            baseVersion: 1,
            patch: { title: "Server edit" },
            updatedAt: "2026-05-16T10:10:00.000Z",
          },
          createdAt: "2026-05-16T10:11:00.000Z",
        },
      ],
      clientSentAt: "2026-05-16T10:12:00.000Z",
    });

    await expect(
      runLocalSyncSimulation({
        repository,
        syncApi,
        workspaceId: "local",
        deviceId: "desktop-1",
        now: new Date("2026-05-16T12:01:00.000Z"),
      }),
    ).resolves.toMatchObject({
      push: {
        acceptedChangeIds: [],
        summary: {
          status: "has-conflicts",
          conflictCount: 1,
          serverCursor: "cursor-2",
        },
      },
      pendingConflictCount: 1,
      pendingConflicts: [
        {
          id: "conflict-change-3",
          taskId: "task-1",
          serverTaskTitle: "Server edit",
          serverTaskVersion: 2,
          clientPayloadSummary: 'patch: {"title":"Stale local edit"}',
        },
      ],
    });
    expect(repository.markChangeSynced).not.toHaveBeenCalled();
  });

  it("通过显式桌面同步 runner 边界运行同步", async () => {
    const repository = {
      listPendingChanges: vi.fn().mockResolvedValue([
        {
          id: "change-1",
          entityType: "task",
          entityId: "task-1",
          action: "task.create",
          payload: { title: "Runner task" },
          createdAt: "2026-05-16T10:00:00.000Z",
          syncedAt: null,
        },
      ]),
      markChangeSynced: vi.fn().mockResolvedValue(undefined),
      getSyncState: vi.fn().mockResolvedValue({
        serverCursor: "cursor-2",
        lastSyncedAt: "2026-05-16T11:59:00.000Z",
        lastError: null,
        updatedAt: "2026-05-16T11:59:00.000Z",
      }),
      applyRemoteTask: vi.fn().mockResolvedValue(undefined),
      deleteRemoteTask: vi.fn().mockResolvedValue(undefined),
      saveSyncState: vi.fn().mockResolvedValue({
        serverCursor: "cursor-8",
        lastSyncedAt: "2026-05-16T12:01:00.000Z",
        lastError: null,
        updatedAt: "2026-05-16T12:01:00.000Z",
      }),
      recordSyncRun: vi.fn().mockResolvedValue({
        id: "run-1",
        status: "succeeded",
        startedAt: "2026-05-16T12:01:00.000Z",
        finishedAt: "2026-05-16T12:01:01.000Z",
        message: "已同步 1 个本地变更",
        serverCursor: "cursor-8",
      }),
    } as unknown as TaskRepository;
    const transport = {
      deltaPush: vi.fn().mockResolvedValue({
        contractVersion: SYNC_CONTRACT_VERSION,
        acceptedChangeIds: ["change-1"],
        rejectedChanges: [],
        conflicts: [],
        serverCursor: "cursor-7",
        serverTime: "2026-05-16T12:02:00.000Z",
      } satisfies DeltaPushResponse),
      listConflicts: vi.fn().mockResolvedValue({
        contractVersion: SYNC_CONTRACT_VERSION,
        conflicts: [],
        serverCursor: "cursor-7",
        serverTime: "2026-05-16T12:02:00.000Z",
      }),
      deltaPull: vi.fn().mockResolvedValue({
        contractVersion: SYNC_CONTRACT_VERSION,
        tasks: [
          {
            id: "task-remote",
            workspaceId: "local",
            title: "Pulled task",
            notes: null,
            status: "active",
            priority: 0,
            dueAt: null,
            estimateMin: null,
            tags: [],
            createdAt: "2026-05-16T10:00:00.000Z",
            updatedAt: "2026-05-16T12:00:00.000Z",
            completedAt: null,
            version: 8,
          },
        ],
        deletedTaskIds: ["task-removed"],
        serverCursor: "cursor-8",
        serverTime: "2026-05-16T12:02:30.000Z",
      } satisfies DeltaPullResponse),
    };

    const runner = createSyncRunner({
      repository,
      transport,
      workspaceId: "local",
      deviceId: "desktop-1",
      now: () => new Date("2026-05-16T12:01:00.000Z"),
    });

    await expect(runner.runOnce()).resolves.toMatchObject({
      ok: true,
      result: {
        request: {
          workspaceId: "local",
          deviceId: "desktop-1",
          changes: [{ id: "change-1" }],
          clientSentAt: "2026-05-16T12:01:00.000Z",
        },
        push: {
          acceptedChangeIds: ["change-1"],
          summary: {
            status: "all-synced",
            message: "已同步 1 个本地变更",
            serverCursor: "cursor-7",
          },
        },
        pendingConflictCount: 0,
        pendingConflicts: [],
        pull: {
          appliedTaskCount: 1,
          deletedTaskCount: 1,
          serverCursor: "cursor-8",
        },
      },
    });
    expect(repository.markChangeSynced).toHaveBeenCalledWith(
      "change-1",
      new Date("2026-05-16T12:01:00.000Z"),
    );
    expect(repository.saveSyncState).toHaveBeenCalledWith({
      serverCursor: "cursor-8",
      lastSyncedAt: "2026-05-16T12:01:00.000Z",
      lastError: null,
    });
    expect(repository.recordSyncRun).toHaveBeenCalledWith({
      status: "succeeded",
      startedAt: "2026-05-16T12:01:00.000Z",
      finishedAt: "2026-05-16T12:01:00.000Z",
      message: "已同步 1 个本地变更",
      serverCursor: "cursor-8",
    });
    expect(transport.deltaPull).toHaveBeenCalledWith({
      contractVersion: SYNC_CONTRACT_VERSION,
      workspaceId: "local",
      deviceId: "desktop-1",
      sinceCursor: "cursor-2",
    });
    expect(repository.applyRemoteTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: "task-remote", title: "Pulled task" }),
      8,
    );
    expect(repository.deleteRemoteTask).toHaveBeenCalledWith("task-removed");
    expect(transport.deltaPush).toHaveBeenCalledTimes(1);
    expect(transport.listConflicts).toHaveBeenCalledTimes(1);
  });

  it("返回同步 runner transport 错误而不是抛进页面", async () => {
    const repository = {
      listPendingChanges: vi.fn().mockResolvedValue([]),
      markChangeSynced: vi.fn().mockResolvedValue(undefined),
      saveSyncState: vi.fn().mockResolvedValue({
        serverCursor: null,
        lastSyncedAt: null,
        lastError: "transport unavailable",
        updatedAt: "2026-05-16T12:01:00.000Z",
      }),
      recordSyncRun: vi.fn().mockResolvedValue({
        id: "run-failed",
        status: "failed",
        startedAt: "2026-05-16T12:01:00.000Z",
        finishedAt: "2026-05-16T12:01:00.000Z",
        message: "transport unavailable",
        serverCursor: null,
      }),
    } as unknown as TaskRepository;
    const transport = {
      deltaPush: vi.fn().mockRejectedValue(new Error("transport unavailable")),
      listConflicts: vi.fn(),
    };
    const runner = createSyncRunner({
      repository,
      transport,
      workspaceId: "local",
      deviceId: "desktop-1",
      now: () => new Date("2026-05-16T12:01:00.000Z"),
    });

    await expect(runner.runOnce()).resolves.toEqual({
      ok: false,
      error: "transport unavailable",
      result: null,
    });
    expect(repository.markChangeSynced).not.toHaveBeenCalled();
    expect(repository.saveSyncState).toHaveBeenCalledWith({
      serverCursor: null,
      lastSyncedAt: null,
      lastError: "transport unavailable",
    });
    expect(repository.recordSyncRun).toHaveBeenCalledWith({
      status: "failed",
      startedAt: "2026-05-16T12:01:00.000Z",
      finishedAt: "2026-05-16T12:01:00.000Z",
      message: "transport unavailable",
      serverCursor: null,
    });
    expect(transport.listConflicts).not.toHaveBeenCalled();
  });

  it("保存同步状态失败时仍保留 route/status transport 错误可见", async () => {
    const repository = {
      listPendingChanges: vi.fn().mockResolvedValue([]),
      markChangeSynced: vi.fn().mockResolvedValue(undefined),
      saveSyncState: vi.fn().mockRejectedValue(new Error("sync_state locked")),
    } as unknown as TaskRepository;
    const transport = createHttpLikeSyncTransport({
      router: {
        handle: vi.fn().mockResolvedValue({
          status: 400,
          body: { error: "不支持的同步契约版本" },
        }),
      },
    });
    const runner = createSyncRunner({
      repository,
      transport,
      workspaceId: "local",
      deviceId: "desktop-1",
      now: () => new Date("2026-05-16T12:01:00.000Z"),
    });

    await expect(runner.runOnce()).resolves.toEqual({
      ok: false,
      error: "POST /sync/delta/push failed with 400: 不支持的同步契约版本",
      result: null,
    });
    expect(repository.saveSyncState).toHaveBeenCalledWith({
      serverCursor: null,
      lastSyncedAt: null,
      lastError: "POST /sync/delta/push failed with 400: 不支持的同步契约版本",
    });
  });

  it("将 delta pull 响应应用到本地任务存储并保存 cursor", async () => {
    const repository = {
      applyRemoteTask: vi.fn().mockResolvedValue(undefined),
      deleteRemoteTask: vi.fn().mockResolvedValue(undefined),
      saveSyncState: vi.fn().mockResolvedValue({
        serverCursor: "cursor-12",
        lastSyncedAt: "2026-05-16T12:05:00.000Z",
        lastError: null,
        updatedAt: "2026-05-16T12:05:00.000Z",
      }),
    } as unknown as TaskRepository;
    const response: DeltaPullResponse = {
      contractVersion: SYNC_CONTRACT_VERSION,
      tasks: [
        {
          id: "task-remote",
          workspaceId: "local",
          title: "Remote task",
          notes: null,
          status: "active",
          priority: 1,
          dueAt: null,
          estimateMin: null,
          tags: [],
          createdAt: "2026-05-16T10:00:00.000Z",
          updatedAt: "2026-05-16T11:00:00.000Z",
          completedAt: null,
          version: 4,
        },
      ],
      deletedTaskIds: ["task-deleted"],
      serverCursor: "cursor-12",
      serverTime: "2026-05-16T12:04:00.000Z",
    };

    await expect(
      applyDeltaPullResponse({
        repository,
        response,
        syncedAt: new Date("2026-05-16T12:05:00.000Z"),
      }),
    ).resolves.toEqual({
      appliedTaskCount: 1,
      deletedTaskCount: 1,
      serverCursor: "cursor-12",
    });
    expect(repository.applyRemoteTask).toHaveBeenCalledWith(
      {
        id: "task-remote",
        title: "Remote task",
        notes: null,
        status: "active",
        priority: 1,
        dueAt: null,
        estimateMin: null,
        tags: [],
        createdAt: "2026-05-16T10:00:00.000Z",
        updatedAt: "2026-05-16T11:00:00.000Z",
        completedAt: null,
      },
      4,
    );
    expect(repository.deleteRemoteTask).toHaveBeenCalledWith("task-deleted");
    expect(repository.saveSyncState).toHaveBeenCalledWith({
      serverCursor: "cursor-12",
      lastSyncedAt: "2026-05-16T12:05:00.000Z",
      lastError: null,
    });
  });

  it("将已接受变更标记为 synced 并返回未解决同步结果", async () => {
    const repository = {
      markChangeSynced: vi.fn().mockResolvedValue(undefined),
    } as unknown as TaskRepository;
    const response: DeltaPushResponse = {
      contractVersion: SYNC_CONTRACT_VERSION,
      acceptedChangeIds: ["change-1", "change-2"],
      rejectedChanges: [{ id: "change-3", reason: "Invalid payload" }],
      conflicts: [
        {
          id: "conflict-1",
          workspaceId: "local",
          taskId: "task-1",
          changeId: "change-4",
          reason: "任务版本冲突",
          clientPayload: { title: "Local" },
          serverTask: null,
          createdAt: "2026-05-16T12:00:00.000Z",
        },
      ],
      serverCursor: "cursor-2",
      serverTime: "2026-05-16T12:00:00.000Z",
    };

    await expect(
      applyDeltaPushResponse({
        repository,
        response,
        syncedAt: new Date("2026-05-16T12:01:00.000Z"),
      }),
    ).resolves.toEqual({
      acceptedChangeIds: ["change-1", "change-2"],
      rejectedChanges: response.rejectedChanges,
      conflicts: response.conflicts,
      serverCursor: "cursor-2",
      summary: {
        status: "has-conflicts",
        message: "1 个同步冲突需要处理",
        acceptedCount: 2,
        rejectedCount: 1,
        conflictCount: 1,
        serverCursor: "cursor-2",
      },
    });

    expect(repository.markChangeSynced).toHaveBeenNthCalledWith(
      1,
      "change-1",
      new Date("2026-05-16T12:01:00.000Z"),
    );
    expect(repository.markChangeSynced).toHaveBeenNthCalledWith(
      2,
      "change-2",
      new Date("2026-05-16T12:01:00.000Z"),
    );
  });

  it("向调用方暴露 apply delta push 结果结构", async () => {
    const repository = {
      markChangeSynced: vi.fn().mockResolvedValue(undefined),
    } as unknown as TaskRepository;
    const response: DeltaPushResponse = {
      contractVersion: SYNC_CONTRACT_VERSION,
      acceptedChangeIds: [],
      rejectedChanges: [],
      conflicts: [],
      serverCursor: "cursor-9",
      serverTime: "2026-05-16T12:00:00.000Z",
    };

    const result: ApplyDeltaPushResult = await applyDeltaPushResponse({
      repository,
      response,
      syncedAt: new Date("2026-05-16T12:01:00.000Z"),
    });

    expect(result).toEqual({
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
    });
    expect(repository.markChangeSynced).not.toHaveBeenCalled();
  });

  it("汇总完全接受的同步运行", () => {
    expect(
      summarizeDeltaPushResponse({
        contractVersion: SYNC_CONTRACT_VERSION,
        acceptedChangeIds: ["change-1"],
        rejectedChanges: [],
        conflicts: [],
        serverCursor: "cursor-1",
        serverTime: "2026-05-16T12:00:00.000Z",
      }),
    ).toEqual({
      status: "all-synced",
      message: "已同步 1 个本地变更",
      acceptedCount: 1,
      rejectedCount: 0,
      conflictCount: 0,
      serverCursor: "cursor-1",
    });
  });

  it("将空同步运行汇总为已完成同步", () => {
    expect(
      summarizeDeltaPushResponse({
        contractVersion: SYNC_CONTRACT_VERSION,
        acceptedChangeIds: [],
        rejectedChanges: [],
        conflicts: [],
        serverCursor: "cursor-4",
        serverTime: "2026-05-16T12:00:00.000Z",
      }),
    ).toEqual({
      status: "all-synced",
      message: "已完成同步",
      acceptedCount: 0,
      rejectedCount: 0,
      conflictCount: 0,
      serverCursor: "cursor-4",
    });
  });

  it("汇总被拒绝的同步变更", () => {
    expect(
      summarizeDeltaPushResponse({
        contractVersion: SYNC_CONTRACT_VERSION,
        acceptedChangeIds: [],
        rejectedChanges: [{ id: "change-2", reason: "Invalid payload" }],
        conflicts: [],
        serverCursor: "cursor-0",
        serverTime: "2026-05-16T12:00:00.000Z",
      }),
    ).toMatchObject({
      status: "has-rejections",
      message: "1 个本地变更需要重试或修复",
      acceptedCount: 0,
      rejectedCount: 1,
      conflictCount: 0,
      serverCursor: "cursor-0",
    });
  });

  it("优先于被拒绝变更汇总同步冲突", () => {
    expect(
      summarizeDeltaPushResponse({
        contractVersion: SYNC_CONTRACT_VERSION,
        acceptedChangeIds: ["change-1"],
        rejectedChanges: [{ id: "change-2", reason: "Invalid payload" }],
        conflicts: [
          {
            id: "conflict-1",
            workspaceId: "local",
            taskId: "task-1",
            changeId: "change-3",
            reason: "任务版本冲突",
            clientPayload: { patch: { title: "Local" } },
            serverTask: null,
            createdAt: "2026-05-16T12:00:00.000Z",
          },
        ],
        serverCursor: "cursor-1",
        serverTime: "2026-05-16T12:00:00.000Z",
      }),
    ).toMatchObject({
      status: "has-conflicts",
      message: "1 个同步冲突需要处理",
      acceptedCount: 1,
      rejectedCount: 1,
      conflictCount: 1,
      serverCursor: "cursor-1",
    });
  });

  it("汇总待处理冲突且不应用解决方案", () => {
    const conflicts: TaskConflictDto[] = [
      {
        id: "conflict-1",
        workspaceId: "local",
        taskId: "task-1",
        changeId: "change-4",
        reason: "任务版本冲突",
        clientPayload: {
          id: "task-1",
          patch: { title: "Local title", priority: 3 },
          updatedAt: "2026-05-16T12:00:00.000Z",
        },
        serverTask: {
          id: "task-1",
          workspaceId: "local",
          title: "Server title",
          notes: null,
          status: "active",
          priority: 1,
          dueAt: null,
          estimateMin: null,
          tags: [],
          createdAt: "2026-05-16T10:00:00.000Z",
          updatedAt: "2026-05-16T11:00:00.000Z",
          completedAt: null,
          version: 5,
        },
        createdAt: "2026-05-16T12:01:00.000Z",
      },
      {
        id: "conflict-2",
        workspaceId: "local",
        taskId: "task-2",
        changeId: "change-5",
        reason: "任务版本冲突",
        clientPayload: { status: "completed" },
        serverTask: null,
        createdAt: "2026-05-16T12:02:00.000Z",
      },
    ];

    expect(summarizePendingConflicts(conflicts)).toEqual([
      {
        id: "conflict-1",
        taskId: "task-1",
        changeId: "change-4",
        reason: "任务版本冲突",
        createdAt: "2026-05-16T12:01:00.000Z",
        serverTaskTitle: "Server title",
        serverTaskVersion: 5,
        clientPayloadSummary: 'patch: {"title":"Local title","priority":3}',
      },
      {
        id: "conflict-2",
        taskId: "task-2",
        changeId: "change-5",
        reason: "任务版本冲突",
        createdAt: "2026-05-16T12:02:00.000Z",
        serverTaskTitle: null,
        serverTaskVersion: null,
        clientPayloadSummary: 'status: "completed"',
      },
    ]);
  });

  it("将待处理同步冲突关联到待同步本地变更摘要", () => {
    const conflicts = summarizePendingConflicts([
      {
        id: "conflict-1",
        workspaceId: "local",
        taskId: "task-1",
        changeId: "change-4",
        reason: "任务版本冲突",
        clientPayload: {
          id: "task-1",
          patch: { title: "Local title" },
          updatedAt: "2026-05-16T12:00:00.000Z",
        },
        serverTask: {
          id: "task-1",
          workspaceId: "local",
          title: "Server title",
          notes: null,
          status: "active",
          priority: 1,
          dueAt: null,
          estimateMin: null,
          tags: [],
          createdAt: "2026-05-16T10:00:00.000Z",
          updatedAt: "2026-05-16T11:00:00.000Z",
          completedAt: null,
          version: 5,
        },
        createdAt: "2026-05-16T12:01:00.000Z",
      },
      {
        id: "conflict-2",
        workspaceId: "local",
        taskId: "task-2",
        changeId: "missing-change",
        reason: "任务版本冲突",
        clientPayload: { status: "completed" },
        serverTask: null,
        createdAt: "2026-05-16T12:02:00.000Z",
      },
    ]);
    const pendingSummaries = summarizePendingLocalChanges([
      {
        id: "change-4",
        entityType: "task",
        entityId: "task-1",
        action: "task.update",
        payload: {
          id: "task-1",
          baseVersion: 4,
          patch: { title: "Local title" },
          updatedAt: "2026-05-16T12:00:00.000Z",
        },
        createdAt: "2026-05-16T12:00:30.000Z",
        syncedAt: null,
      },
    ]);

    expect(summarizePendingConflictDetails(conflicts, pendingSummaries)).toEqual([
      {
        id: "conflict-1",
        taskId: "task-1",
        changeId: "change-4",
        reason: "任务版本冲突",
        createdAt: "2026-05-16T12:01:00.000Z",
        serverTaskTitle: "Server title",
        serverTaskVersion: 5,
        clientPayloadSummary: 'patch: {"title":"Local title"}',
        localChange: {
          id: "change-4",
          entityLabel: "task:task-1",
          action: "task.update",
          createdAt: "2026-05-16T12:00:30.000Z",
          payloadSummary: 'patch: {"title":"Local title"}',
        },
      },
      {
        id: "conflict-2",
        taskId: "task-2",
        changeId: "missing-change",
        reason: "任务版本冲突",
        createdAt: "2026-05-16T12:02:00.000Z",
        serverTaskTitle: null,
        serverTaskVersion: null,
        clientPayloadSummary: 'status: "completed"',
        localChange: null,
      },
    ]);
  });
});
