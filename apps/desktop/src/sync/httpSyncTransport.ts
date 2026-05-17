import type {
  DeltaPullRequest,
  DeltaPullResponse,
  DeltaPushRequest,
  DeltaPushResponse,
  ListTaskConflictsRequest,
  ListTaskConflictsResponse,
} from "../../../../packages/contracts/src";
import type { SyncRunnerTransport } from "./syncClient";

export type FetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

interface HttpSyncTransportOptions {
  baseUrl: string;
  fetch: FetchLike;
  headers?: () => Promise<Record<string, string>> | Record<string, string>;
}

export function createHttpSyncTransport({
  baseUrl,
  fetch,
  headers,
}: HttpSyncTransportOptions): SyncRunnerTransport {
  return {
    deltaPush(request) {
      return postSyncRoute<DeltaPushResponse>(
        fetch,
        baseUrl,
        headers,
        "/sync/delta/push",
        request,
      );
    },
    deltaPull(request) {
      return postSyncRoute<DeltaPullResponse>(
        fetch,
        baseUrl,
        headers,
        "/sync/delta/pull",
        request,
      );
    },
    listConflicts(request) {
      return postSyncRoute<ListTaskConflictsResponse>(
        fetch,
        baseUrl,
        headers,
        "/sync/conflicts",
        request,
      );
    },
  };
}

async function postSyncRoute<TResponse>(
  fetch: FetchLike,
  baseUrl: string,
  headers: HttpSyncTransportOptions["headers"],
  path: string,
  body: DeltaPushRequest | DeltaPullRequest | ListTaskConflictsRequest,
): Promise<TResponse> {
  if (!baseUrl.trim()) {
    throw new Error("HTTP sync baseUrl is not configured");
  }
  const extraHeaders = headers ? await headers() : {};
  const response = await fetch(joinUrl(baseUrl, path), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  const responseBody = await response.json();
  if (!response.ok) {
    throw new Error(
      `POST ${path} failed with ${response.status}: ${getResponseError(responseBody)}`,
    );
  }
  return responseBody as TResponse;
}

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

function getResponseError(body: unknown) {
  if (body && typeof body === "object" && "error" in body) {
    return String((body as { error: unknown }).error);
  }
  return "HTTP sync transport failed";
}
