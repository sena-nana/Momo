# Realtime events acceptance checklist

## BE-04 local-only boundary

This checklist verifies the local BE-04 realtime events skeleton. It proves event contracts, in-memory publishing, HTTP-like catch-up, transport adapters, and desktop read-only summaries. It does not prove production realtime collaboration.

## Contract and API checks

- `SyncEventDto` supports `task.changed`, `conflict.raised`, and `sync.run.updated`.
- `createSyncEventApi()` with `createInMemorySyncEventStore()` can publish events and list them by `afterSequence`.
- Accepted task changes publish `task.changed`.
- Raised conflicts publish `conflict.raised`.
- Rejected changes do not publish `task.changed`.

## Catch-up checks

- `GET /sync/events` returns sequence catch-up results with `latestSequence`.
- `createHttpLikeSyncTransport()` can call `GET /sync/events`.
- `createHttpSyncTransport()` can request `/sync/events` through injected `fetch`.
- `summarizeSyncEvents()` maps events into read-only display summaries.
- `fetchRealtimeEventCatchUp()` returns summaries and does not run sync.

## Regression guardrails

- no WebSocket server.
- no Redis/event bus.
- no production backend.
- no notification delivery.
- no background event subscription.
- no default Settings route subscription.
- default Settings route stays on local simulation.
