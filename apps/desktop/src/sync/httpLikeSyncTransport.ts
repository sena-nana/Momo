import type { ApiRouter } from "../../../api/src";
import type {
  DeltaPullRequest,
  DeltaPullResponse,
  DeltaPushRequest,
  DeltaPushResponse,
  ListSyncEventsRequest,
  ListSyncEventsResponse,
  ListTaskConflictsRequest,
  ListTaskConflictsResponse,
} from "../../../../packages/contracts/src";
import type { SyncRunnerTransport } from "./syncClient";

interface HttpLikeSyncTransportOptions {
  router: Pick<ApiRouter, "handle">;
}

export function createHttpLikeSyncTransport({
  router,
}: HttpLikeSyncTransportOptions): SyncRunnerTransport {
  return {
    deltaPush(request) {
      return handleSyncRoute<DeltaPushResponse>(
        router,
        "POST",
        "/sync/delta/push",
        request,
      );
    },
    deltaPull(request) {
      return handleSyncRoute<DeltaPullResponse>(
        router,
        "POST",
        "/sync/delta/pull",
        request,
      );
    },
    listConflicts(request) {
      return handleSyncRoute<ListTaskConflictsResponse>(
        router,
        "GET",
        "/sync/conflicts",
        request,
      );
    },
    listEvents(request) {
      return handleSyncRoute<ListSyncEventsResponse>(
        router,
        "GET",
        "/sync/events",
        request,
      );
    },
  };
}

async function handleSyncRoute<TResponse>(
  router: Pick<ApiRouter, "handle">,
  method: string,
  path: string,
  body:
    | DeltaPushRequest
    | DeltaPullRequest
    | ListTaskConflictsRequest
    | ListSyncEventsRequest,
): Promise<TResponse> {
  const response = await router.handle({ method, path, body });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `${method} ${path} failed with ${response.status}: ${getResponseError(response.body)}`,
    );
  }
  return response.body as TResponse;
}

function getResponseError(body: unknown) {
  if (body && typeof body === "object" && "error" in body) {
    return String((body as { error: unknown }).error);
  }
  return `HTTP-like sync transport failed`;
}
