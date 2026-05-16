interface RemoteSyncEnv {
  VITE_MOMO_SYNC_BASE_URL?: string;
  VITE_MOMO_SYNC_TOKEN?: string;
}

export type RemoteSyncConfig =
  | {
    enabled: true;
    baseUrl: string;
    headers: () => Promise<Record<string, string>>;
  }
  | {
    enabled: false;
    reason: string;
  };

export function createRemoteSyncConfig(env: RemoteSyncEnv): RemoteSyncConfig {
  const baseUrl = env.VITE_MOMO_SYNC_BASE_URL?.trim();
  if (!baseUrl) {
    return {
      enabled: false,
      reason: "Remote sync base URL is not configured",
    };
  }

  const token = env.VITE_MOMO_SYNC_TOKEN?.trim();
  return {
    enabled: true,
    baseUrl,
    async headers() {
      const headers: Record<string, string> = {};
      if (token) {
        headers.authorization = `Bearer ${token}`;
      }
      return headers;
    },
  };
}
