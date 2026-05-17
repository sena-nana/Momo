# Local sync acceptance checklist

## Scope

This checklist verifies the desktop Settings local sync simulation only. It uses the default local runner, in-memory transport, and local SQLite repository. It makes no real network request, does not call `createRemoteSyncRunner()`, and does not start background sync.

## Vite smoke

- Run `npm run dev`.
- Open `http://localhost:1420/settings`.
- Confirm the page renders `Remote sync config`, `Sync action`, and `Local simulation`.
- Confirm the `Local sync simulation` button is visible and keyboard-accessible.
- Click `Local sync simulation`.
- Confirm Vite smoke only verifies routing, the button, and error handling because a plain browser does not provide the Tauri SQL plugin.

## Tauri WebView full SQLite flow

- Run `npm run tauri dev`.
- Open Settings in the desktop WebView.
- Create or edit a task so `Pending changes` is visible.
- Click `Local sync simulation`.
- Confirm `Sync status` appears and reports either `Already synced` or the local change result.
- Confirm `Sync state` refreshes cursor, last synced, and last error.
- Confirm `Sync history` records the manual run.
- Confirm `Pull applied` appears when the runner returns a delta pull summary.
- When using a fixture or test route that returns failures, confirm `Sync rejections` and `Sync conflicts` show matching pending change diagnostics without resolve, retry, delete, force, or mark-synced actions.

## Remote config display smoke

- Start Vite with `VITE_MOMO_SYNC_BASE_URL=https://api.example.test/momo` and `VITE_MOMO_SYNC_TOKEN=local-dev-token`.
- Open Settings and confirm `Remote sync config` shows enabled.
- Confirm the token is not rendered; only configured status is shown.
- Confirm `Sync action` remains `Local simulation`.
- Confirm the default button still uses local simulation and no real network is attempted.

## Regression guardrails

- Do not switch the default `/settings` route to remote sync.
- Do not call `createRemoteSyncRunner()` from the default Settings runtime.
- Do not start background sync.
- Do not add automatic conflict resolution, rejected-change retry, local change deletion, or force mark-synced actions.
- Keep sync diagnostics read-only: `Pending changes`, `Sync history`, `Sync rejections`, `Sync conflicts`, `Sync status`, `Sync state`, and `Pull applied`.
