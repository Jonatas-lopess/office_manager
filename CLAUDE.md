# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

ManagerDesk — offline-first desktop app (Tauri v2 + React 19) for managing Clients and Services (tax filings, MEI, invoices; Brazilian domain: CPF/CNPJ/NIRF fields). No cloud backend: every machine keeps its own local SQLite DB and syncs peer-to-peer over LAN via CRDTs (cr-sqlite).

## Commands

```bash
pnpm dev              # Vite dev server only (browser mode, no Tauri shell)
pnpm tauri dev         # Full desktop app with Rust backend
pnpm build             # tsc typecheck + vite build
pnpm lint              # eslint .
pnpm db:generate       # drizzle-kit generate — after editing src/db/schema.ts, creates a new file in src/db/migrations/
pnpm db:studio         # drizzle-kit studio
```

No test suite/framework is configured in this repo.

Rust backend (`src-tauri/`) builds automatically as part of `pnpm tauri dev` / `pnpm tauri build`; use `cargo check` inside `src-tauri/` for a fast standalone Rust check.

Package manager is pnpm (see `pnpm-lock.yaml`, `pnpm-workspace.yaml`).

## Architecture

Hub-and-spoke LAN sync: every device runs the full app with its own SQLite DB. One device becomes the **Hub**, running a Rust/Axum WebSocket server on port `1234`; all others (**Spokes**) connect to it and exchange change-sets. If the Hub disappears, a Spoke auto-promotes itself. No hub-vs-spoke code path split beyond this — it's runtime election, not a build-time role.

**Boot sequence** (`src/main.tsx`): init cr-sqlite WASM DB → detect Tauri vs. browser (`window.__TAURI_INTERNALS__`) → scan LAN for a Hub (Tauri only, via `find_hub_ip` command) → check network-share updater → render `<App>` with DB context + hub IP.

### Rust side (`src-tauri/src/lib.rs`)
Two jobs only:
- **`start_hub`**: spins up an Axum WS server on `0.0.0.0:1234`. Each connection gets a UUID; the Hub relays `(sender_uuid, msg)` broadcast tuples to everyone *except* the sender (server-side echo cancellation, using `Uuid::nil()` for server-originated messages like presence updates). Retries bind on port conflict; emits `server-error` event to the frontend if it can't bind.
- **`find_hub_ip`**: sweeps the local /24 subnet (`x.x.x.1`–`.255`) with short-timeout TCP connects to port 1234 to find an existing Hub.

`RunEvent::ExitRequested`/`Exit` sends a `oneshot` shutdown signal to cleanly stop the WS server on app close.

### Sync bridge (`src/hooks/useSyncBridge.ts`)
The networking brain, three effects in one hook:
1. **Connection manager** — opens/reconnects the WebSocket, exponential backoff + jitter, calls `find_hub_ip` (Tauri only) to find/elect a Hub.
2. **DB listener** — subscribed via `DBChangeHub` (`src/db/change-hub.ts`, which multiplexes cr-sqlite's single `onUpdate` callback to multiple listeners); pushes any local `crsql_changes` rows newer than the last synced `db_version` up the socket, batched (`SYNC_BATCH_SIZE = 1000`).
3. **Server error logger** — listens for the Rust `server-error` Tauri event.

Sync protocol messages: `identity`, `presence`, `request_sync` (exchanges a per-site `knowledgeMap` of max known `db_version`s, does anti-entropy comparison, replies with `sync` batches), `sync` (raw `crsql_changes` rows applied via `INSERT INTO crsql_changes`), `epoch_reset`.

**Sync epochs**: `resetSyncEpoch` / the `epoch_reset` message pair let one device force all peers onto a fresh, empty shared state — used when the whole network's data should be wiped and restarted. On epoch mismatch, the side with the older epoch wipes its own `CLEARABLE_TABLES` (`payments`, `service_tags`, `services`, `tags`, `clients`, `logs`), clears `crsql_changes`, and rotates its `crsql_site_id` before rejoining. Epoch is persisted in `localStorage` under `sync_epoch`.

BigInt/Uint8Array values (native to cr-sqlite change rows) don't survive plain `JSON.stringify`/`parse` — `useSyncBridge.ts` has custom `serializeMsg`/`deserializeMsg` wrapping them in `{ __type, value }` tags. Reuse these, don't add a second serialization scheme.

### Reactive queries (`src/hooks/useLocalQuery.ts`)
Wraps `useSyncExternalStore` around `DBChangeHub`. Any write to the local DB — from the user or from an incoming sync — re-fetches every active query. This is what makes the UI "live"; there is no manual cache invalidation to wire up when adding a new query.

### DB layer (`src/db/`)
- `schema.ts` — Drizzle table definitions (`clients`, `services`, plus `payments`, `tags`, `service_tags`, `logs`).
- `index.ts` — `initDb()`: loads cr-sqlite WASM, opens the local `.db`, runs migrations, builds a Drizzle `sqlite-proxy` driver over `ctx.exec`/`ctx.execA`, returns `{ db, orm, hub, siteId, siteIdHex, initialVersion }`.
- `migrator.ts` — applies `src/db/migrations/*.sql` (generated via `pnpm db:generate`, never hand-edit generated migration files — edit `schema.ts` and regenerate).
- `validations.ts` — Zod schemas derived from Drizzle schema for form validation.
- `context.tsx` — React context exposing raw `DB` + Drizzle `orm`.
- `sync-context.tsx` — `SyncProvider`/`useSync()`, wraps `useSyncBridge` with `hubIp`/`isTauri`/`isolatedMode` from boot.
- `change-hub.ts` — `DBChangeHub`, see above.

### Frontend conventions
- Path alias `@/*` → `src/*` (both `tsconfig.json` and `vite.config.ts`).
- Routing via `wouter`, pages in `src/pages/`.
- UI primitives in `src/components/ui/` (Radix-based), feature components grouped under `src/components/{panel,service,settings}/`.
- Vite dev server requires COOP/COEP headers (`same-origin`/`require-corp`) for cr-sqlite's OPFS/worker memory sharing — already set in `vite.config.ts`; don't remove if touching that config.
- `@vlcn.io/crsqlite-wasm` is excluded from Vite's dep pre-bundling and needs `esnext` build target — required for top-level await and native WASM loading.

### Internal updater (`src/lib/updater.ts`)
Not an auto-updater service — checks a `version.txt` on a network share path (`VITE_UPDATE_PATH` env var) against the local app version, and if newer, launches the `.msi` from that same share via `@tauri-apps/plugin-opener`.
