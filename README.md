# 🏢 Office Manager

> A desktop business-management app that works **offline by default** and syncs automatically across every computer on your local network — no cloud required.

---

## What Does It Do?

Office Manager lets you manage **Clients** and **Services** (think: tax declarations, MEI filings, invoices) from any device in your office. Every copy of the app keeps its own local database, so you can read and write data **instantly** — even if the network cable is unplugged.

When two or more machines are on the same LAN, they discover each other and merge their data in real-time using a technology called **CRDTs** (Conflict-free Replicated Data Types). This means two people can edit the same record on different computers while offline, and the app will merge both versions without losing anything. No "sync conflict" pop-ups, ever.

### Key Features

| Feature | What It Means |
|---|---|
| ✏️ **Offline-First** | Read & write data with zero latency — no server or internet needed. |
| 🔄 **Auto-Sync** | Changes travel between machines automatically when a LAN connection exists. |
| 🧠 **Conflict-Free Merges** | Simultaneous offline edits are resolved mathematically — no manual conflict resolution. |
| 📡 **LAN Hub Discovery** | On startup, each device scans the local network to find (or become) the sync hub. |
| 💡 **Dynamic Failover** | If the hub machine goes offline, another device automatically takes over. |
| 👥 **Live Presence** | See how many devices are currently connected to the sync network. |

---

## How It Works (The Big Picture)

The app follows a **"Hub and Spoke"** model:

```
  ┌──────────┐          ┌──────────┐
  │ Spoke A  │◄────────►│   Hub    │◄────────►┌──────────┐
  │ (SQLite) │  WS/LAN  │ (SQLite) │  WS/LAN  │ Spoke B  │
  └──────────┘          └──────────┘          │ (SQLite) │
                                              └──────────┘
```

1. **Every device** runs the full app with its own SQLite database.
2. **One device** acts as the **Hub** — it runs a lightweight WebSocket server on port `1234`.
3. **All other devices** (Spokes) connect to the Hub and exchange change-sets.
4. If the Hub disappears, a Spoke **promotes itself** to the new Hub automatically.

> **No cloud.** No accounts. No subscriptions. Just your office LAN.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 · TypeScript · Vite 7 |
| Desktop Shell | Tauri v2 (Rust) |
| Routing | Wouter |
| UI Components | Radix UI · Tailwind CSS v4 · Framer Motion |
| Database | SQLite + [cr-sqlite](https://github.com/vlcn-io/cr-sqlite) (CRDT extension) via WebAssembly |
| ORM | Drizzle ORM + Zod validation |
| Networking | Axum 0.7 WebSockets (Rust) · `tokio::sync::broadcast` |
| Hub Discovery | Custom LAN scanner via Tauri commands (Rust → `local-ip-address` crate) |

---

## Project Structure

A quick tour of what lives where:

```
office_manager/
├── src/                          # Frontend (React + TypeScript)
│   ├── main.tsx                  # Boot sequence: init DB → scan LAN → render
│   ├── App.tsx                   # Top-level router and sync bridge
│   ├── pages/                    # One file per page
│   │   ├── dashboard.tsx         # Overview / home page
│   │   ├── clients.tsx           # Client management (CRUD)
│   │   ├── services.tsx          # Service management (CRUD)
│   │   ├── logs.tsx              # Activity logs viewer
│   │   └── settings.tsx          # Network info & app settings
│   ├── hooks/
│   │   ├── useSyncBridge.ts      # Core networking hook (connect, sync, failover)
│   │   └── useLocalQuery.ts      # Reactive query hook (auto-refetches on DB changes)
│   ├── db/
│   │   ├── schema.ts             # Drizzle table definitions (clients, services)
│   │   ├── index.ts              # WASM database initializer
│   │   ├── migrator.ts           # Schema migrations runner
│   │   ├── validations.ts        # Zod schemas for form validation
│   │   └── context.tsx           # React context provider for the DB
│   ├── components/
│   │   ├── ui/                   # Reusable UI primitives (Radix-based)
│   │   └── panel/                # Layout panels
│   └── lib/
│       ├── utils.ts              # General utility functions
│       └── masks.ts              # Input masks (CPF, CNPJ, phone, etc.)
│
├── src-tauri/                    # Backend (Rust / Tauri)
│   ├── src/
│   │   ├── main.rs               # Tauri entry point
│   │   └── lib.rs                # WebSocket hub server & LAN scanner
│   ├── Cargo.toml                # Rust dependencies
│   └── tauri.conf.json           # Tauri app config
│
├── package.json                  # Node dependencies & scripts
├── vite.config.ts                # Vite bundler config
├── drizzle.config.ts             # Drizzle Kit config
└── tsconfig.json                 # TypeScript config
```

---

## Architecture Deep Dive

### 1. Rust Backend — `src-tauri/src/lib.rs`

The backend is a small but critical piece. It does **two things**:

- **Runs the WebSocket Hub** — An Axum server on `0.0.0.0:1234` that accepts WebSocket connections, assigns each one a UUID, and relays messages between clients.
- **Scans the LAN** — The `find_hub_ip` Tauri command pings every IP on the local subnet (`x.x.x.1` → `x.x.x.255`) to find an existing Hub.

**Echo Cancellation:** When a device sends a change, the Hub broadcasts it to *every* connected device — but the Hub skips sending the message back to the device that sent it. This prevents infinite sync loops, using the per-connection UUID as the identifier.

**Graceful Shutdown:** When you close the app window, the Rust side sends a `oneshot` signal that cleanly stops the WebSocket server before the process exits.

---

### 2. Sync Bridge — `src/hooks/useSyncBridge.ts`

This React hook is the networking brain. It manages three separate concerns:

| Effect | What It Does |
|---|---|
| **Connection Manager** | Opens/reconnects the WebSocket. On disconnect, uses exponential backoff + random jitter to avoid reconnection storms. Calls `find_hub_ip` to discover a new Hub or promotes `localhost`. |
| **Database Listener** | Listens for local writes via `ctx.onUpdate()`. Any new changes (`WHERE db_version > lastVersion`) are serialized and sent up the WebSocket. |
| **Server Error Logger** | Listens for Tauri events (`server-error`) in case port `1234` is already in use. |

**Custom Serializers:** SQLite operations involve `BigInt` and `Uint8Array` values, which standard `JSON.stringify` cannot handle. The hook includes custom `serializeMsg` / `deserializeMsg` functions that wrap these types safely.

---

### 3. Reactive Queries — `src/hooks/useLocalQuery.ts`

A lightweight hook that wraps `useSyncExternalStore` (React 19) around the cr-sqlite `onUpdate` callback. When **any** write hits the local database — whether from the user or from a network sync — every active query re-fetches automatically. This is what makes the UI feel "live."

---

### 4. Database Layer — `src/db/`

| File | Purpose |
|---|---|
| `schema.ts` | Drizzle table definitions for `clients` and `services` (with Brazilian-specific fields like CPF, CNPJ, NIRF). |
| `index.ts` | Initializes the cr-sqlite WASM module, opens the local database, runs migrations, and wraps it in a Drizzle proxy driver. |
| `migrator.ts` | Applies schema migrations to keep the database structure up to date. |
| `validations.ts` | Zod schemas generated from Drizzle for form-level validation. |
| `context.tsx` | A React context that exposes both the raw `DB` handle and the Drizzle `orm` instance to the entire component tree. |

---

### 5. Boot Sequence — `src/main.tsx`

When the app starts, the following happens in order:

1. **Initialize the WASM database** — cr-sqlite is loaded and the local `.db` file is opened.
2. **Detect environment** — The app checks for `window.__TAURI_INTERNALS__` to know if it is running inside Tauri (desktop) or a plain browser.
3. **Scan the LAN** *(Tauri only)* — Calls `find_hub_ip` to discover an existing Hub on the network.
4. **Render the app** — Passes the database context and hub IP down to `<App>`, which activates the sync bridge.

> In a browser (non-Tauri), the app defaults to `ws://localhost:1234/ws` and operates as a Spoke connected to a locally running Hub.

---

## Getting Started

### Prerequisites

| Tool | Version | Install Link |
|---|---|---|
| **Node.js** | v18+ | [nodejs.org](https://nodejs.org/) |
| **Rust** | stable (latest) | [rustup.rs](https://rustup.rs/) |
| **Tauri CLI** | v2 | Included in `devDependencies` |

### Install & Run

```bash
# 1. Clone the repository
git clone https://github.com/Jonatas-lopess/office_manager.git
cd office_manager

# 2. Install Node dependencies
npm install

# 3. Run the app in development mode (launches Tauri + Vite)
npm run tauri dev
```

That's it. The app will:
- Compile the Rust backend.
- Start the Vite dev server on `http://localhost:1420`.
- Open the Tauri window.
- Start the WebSocket hub on port `1234`.
- Scan the LAN for other instances.

### Useful Scripts

| Command | What It Does |
|---|---|
| `npm run dev` | Start only the Vite frontend (no Tauri). |
| `npm run tauri dev` | Start the full desktop app in dev mode. |
| `npm run build` | Build the TypeScript + Vite production bundle. |
| `npm run tauri build` | Build the production desktop installer. |
| `npm run lint` | Run ESLint across the project. |
| `npm run db:generate` | Generate Drizzle migration files from `schema.ts`. |
| `npm run db:studio` | Open Drizzle Studio to visually browse the database. |

---

## Pages Overview

| Page | Route | Description |
|---|---|---|
| Dashboard | `/` | High-level overview of clients and services. |
| Clients | `/clients` | Full CRUD for client records (CPF, CNPJ, contact info, MEI details). |
| Services | `/services` | Full CRUD for services linked to clients (tax declarations, filings, invoices). |
| Logs | `/logs` | View activity and event logs. |
| Settings | `/settings` | Network status, connected peers, and app configuration. |

---

## FAQ

<details>
<summary><strong>Does it need the internet?</strong></summary>

No. Everything runs on your local network (LAN). You don't need an internet connection at all — not even for sync.
</details>

<details>
<summary><strong>What happens when two people edit the same client offline?</strong></summary>

Both edits are preserved. cr-sqlite uses CRDTs, which mathematically merge changes at the column level. The "last write wins" per field, based on a logical clock — so no data is ever silently dropped.
</details>

<details>
<summary><strong>Can I run it in a browser instead of the desktop app?</strong></summary>

Partially. Running `npm run dev` gives you the frontend in a browser with a local WASM-powered database. However, the LAN scanning and hub discovery features require the Tauri desktop shell. In the browser, the app will try to connect to `ws://localhost:1234/ws`, so you need at least one Tauri instance running as the Hub.
</details>

<details>
<summary><strong>What if the Hub machine shuts down?</strong></summary>

The remaining Spoke devices will automatically detect the disconnection, scan the LAN, and promote one of themselves to the new Hub. This happens within a few seconds using exponential backoff with random jitter to avoid race conditions.
</details>

---

## License

This project is private and not yet licensed for distribution.
