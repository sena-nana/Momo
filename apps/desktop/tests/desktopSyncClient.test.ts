import { describe, expect, it, vi } from "vitest";
import {
  createApiRouter,
  createInMemorySyncStore,
  createInMemoryTaskRepository,
  createSyncApi,
  createTaskService,
} from "../../../apps/api/src";
import * as apiModule from "../../../apps/api/src";
import {
  createDeltaPushRequest,
  SYNC_CONTRACT_VERSION,
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
  runLocalSyncSimulation,
  summarizeDeltaPushResponse,
  summarizePendingConflicts,
  type ApplyDeltaPushResult,
} from "../src/sync/syncClient";
import { createHttpSyncTransport } from "../src/sync/httpSyncTransport";
import { createHttpLikeSyncTransport } from "../src/sync/httpLikeSyncTransport";
import { createLocalSyncRunner } from "../src/sync/localSyncRunner";
import { createRemoteSyncRunner } from "../src/sync/remoteSyncRunner";
import { createRemoteSyncConfig } from "../src/sync/remoteSyncConfig";

describe("desktop sync client adapter", () => {
  it("exports the stable sync run status list", () => {
    expect(SYNC_RUN_STATUSES).toEqual([
      "all-synced",
      "has-rejections",
      "has-conflicts",
    ]);
  });

  it("builds a delta push request from pending local changes", async () => {
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

  it("builds an empty delta push request when there is nothing pending", async () => {
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

  it("runs a local sync simulation with the in-memory sync API", async () => {
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
          message: "1 local change synced",
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

  it("adapts sync runner transport calls to HTTP-like API router routes", async () => {
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
  });

  it("adapts sync runner transport calls to injected HTTP fetch requests", async () => {
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

  it("adds configured HTTP sync transport headers to every request", async () => {
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

  it("rejects missing HTTP sync transport base URLs before calling fetch", async () => {
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
    ).rejects.toThrow("HTTP sync baseUrl is not configured");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("builds disabled remote sync config when no base URL is configured", () => {
    expect(createRemoteSyncConfig({})).toEqual({
      enabled: false,
      reason: "Remote sync base URL is not configured",
    });
  });

  it("builds remote sync config with an authorization headers provider", async () => {
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

  it("short-circuits remote sync runner creation when remote sync is disabled", () => {
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
          reason: "Remote sync base URL is not configured",
        },
        repository,
        workspaceId: "local",
        deviceId: "desktop-1",
        now: () => new Date("2026-05-16T12:00:00.000Z"),
        fetch,
      }),
    ).toEqual({
      kind: "disabled",
      reason: "Remote sync base URL is not configured",
      runner: null,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("creates a remote sync runner from enabled remote config and wires HTTP transport", async () => {
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
    );
    expect(repository.deleteRemoteTask).toHaveBeenCalledWith("task-deleted");
    expect(repository.saveSyncState).toHaveBeenCalledWith({
      serverCursor: "cursor-after",
      lastSyncedAt: "2026-05-16T12:00:00.000Z",
      lastError: null,
    });
  });

  it("surfaces injected HTTP fetch transport errors with method path and status", async () => {
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

  it("surfaces HTTP-like sync transport route errors as thrown errors", async () => {
    const router = {
      handle: vi.fn().mockResolvedValue({
        status: 400,
        body: { error: "Unsupported sync contract version" },
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
      "POST /sync/delta/pull failed with 400: Unsupported sync contract version",
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

  it("creates the default local sync runner through the HTTP-like API router boundary", async () => {
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

  it("returns conflict summaries from a local sync simulation without marking the conflicting change synced", async () => {
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

  it("runs sync through an explicit desktop sync runner boundary", async () => {
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
            message: "1 local change synced",
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
    expect(transport.deltaPull).toHaveBeenCalledWith({
      contractVersion: SYNC_CONTRACT_VERSION,
      workspaceId: "local",
      deviceId: "desktop-1",
      sinceCursor: "cursor-2",
    });
    expect(repository.applyRemoteTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: "task-remote", title: "Pulled task" }),
    );
    expect(repository.deleteRemoteTask).toHaveBeenCalledWith("task-removed");
    expect(transport.deltaPush).toHaveBeenCalledTimes(1);
    expect(transport.listConflicts).toHaveBeenCalledTimes(1);
  });

  it("returns sync runner transport errors instead of throwing them into pages", async () => {
    const repository = {
      listPendingChanges: vi.fn().mockResolvedValue([]),
      markChangeSynced: vi.fn().mockResolvedValue(undefined),
      saveSyncState: vi.fn().mockResolvedValue({
        serverCursor: null,
        lastSyncedAt: null,
        lastError: "transport unavailable",
        updatedAt: "2026-05-16T12:01:00.000Z",
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
    expect(transport.listConflicts).not.toHaveBeenCalled();
  });

  it("keeps route and status transport errors visible when saving sync state fails", async () => {
    const repository = {
      listPendingChanges: vi.fn().mockResolvedValue([]),
      markChangeSynced: vi.fn().mockResolvedValue(undefined),
      saveSyncState: vi.fn().mockRejectedValue(new Error("sync_state locked")),
    } as unknown as TaskRepository;
    const transport = createHttpLikeSyncTransport({
      router: {
        handle: vi.fn().mockResolvedValue({
          status: 400,
          body: { error: "Unsupported sync contract version" },
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
      error: "POST /sync/delta/push failed with 400: Unsupported sync contract version",
      result: null,
    });
    expect(repository.saveSyncState).toHaveBeenCalledWith({
      serverCursor: null,
      lastSyncedAt: null,
      lastError: "POST /sync/delta/push failed with 400: Unsupported sync contract version",
    });
  });

  it("applies delta pull responses into local task storage and saves the cursor", async () => {
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
    expect(repository.applyRemoteTask).toHaveBeenCalledWith({
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
    });
    expect(repository.deleteRemoteTask).toHaveBeenCalledWith("task-deleted");
    expect(repository.saveSyncState).toHaveBeenCalledWith({
      serverCursor: "cursor-12",
      lastSyncedAt: "2026-05-16T12:05:00.000Z",
      lastError: null,
    });
  });

  it("marks accepted changes as synced and returns unresolved sync results", async () => {
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
          reason: "Task version conflict",
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
        message: "1 sync conflict needs review",
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

  it("exposes the apply delta push result shape for callers", async () => {
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
        message: "Already synced",
        acceptedCount: 0,
        rejectedCount: 0,
        conflictCount: 0,
        serverCursor: "cursor-9",
      },
    });
    expect(repository.markChangeSynced).not.toHaveBeenCalled();
  });

  it("summarizes a fully accepted sync run", () => {
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
      message: "1 local change synced",
      acceptedCount: 1,
      rejectedCount: 0,
      conflictCount: 0,
      serverCursor: "cursor-1",
    });
  });

  it("summarizes an empty sync run as already synced", () => {
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
      message: "Already synced",
      acceptedCount: 0,
      rejectedCount: 0,
      conflictCount: 0,
      serverCursor: "cursor-4",
    });
  });

  it("summarizes rejected sync changes", () => {
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
      message: "1 local change needs retry or repair",
      acceptedCount: 0,
      rejectedCount: 1,
      conflictCount: 0,
      serverCursor: "cursor-0",
    });
  });

  it("summarizes sync conflicts before rejected changes", () => {
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
            reason: "Task version conflict",
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
      message: "1 sync conflict needs review",
      acceptedCount: 1,
      rejectedCount: 1,
      conflictCount: 1,
      serverCursor: "cursor-1",
    });
  });

  it("summarizes pending conflicts without applying a resolution", () => {
    const conflicts: TaskConflictDto[] = [
      {
        id: "conflict-1",
        workspaceId: "local",
        taskId: "task-1",
        changeId: "change-4",
        reason: "Task version conflict",
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
        reason: "Task version conflict",
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
        reason: "Task version conflict",
        createdAt: "2026-05-16T12:01:00.000Z",
        serverTaskTitle: "Server title",
        serverTaskVersion: 5,
        clientPayloadSummary: 'patch: {"title":"Local title","priority":3}',
      },
      {
        id: "conflict-2",
        taskId: "task-2",
        changeId: "change-5",
        reason: "Task version conflict",
        createdAt: "2026-05-16T12:02:00.000Z",
        serverTaskTitle: null,
        serverTaskVersion: null,
        clientPayloadSummary: 'status: "completed"',
      },
    ]);
  });
});
