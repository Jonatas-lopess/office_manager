Local-First P2P Business App

App Concept
A local-first, offline-resilient business management application (managing entities like Clients and Services). The system operates on a peer-to-peer "Hub and Spoke" network model over the local area network (LAN). It requires no central cloud server, utilizing device-local databases that synchronize state automatically when a network connection is available.

Core Features
Offline-First Data Entry: Users can read and write data with zero network latency or connectivity requirements.

Conflict-Free Synchronization: Database merges happen automatically using CRDTs (Conflict-Free Replicated Data Types), resolving simultaneous offline edits mathematically.

Smart Network Routing: A local Rust server broadcasts sync payloads with server-side echo cancellation via UUID connection tracking.

Dynamic Failover: If the primary Hub goes offline, Spoke devices utilize random jitter to rescan the network and automatically promote themselves to the new Hub.

Live Presence: Real-time tracking of active devices connected to the local sync mesh.

Stack Used
Frontend Framework: React with Vite (TypeScript).

Desktop App / Backend: Tauri v2, Rust.

Database: SQLite extended with cr-sqlite (v0.16.x) for CRDT capabilities. WebAssembly (wa-sqlite) is used for browser-based execution.

Database ORM/Query Builder: Drizzle ORM.

Networking Layer: WebSockets powered by Rust's Axum framework and tokio::sync::broadcast.

Actual Code Structure

1. Rust Backend (src-tauri/src/main.rs)
   Role: The Desktop Hub. Binds a TCP listener to 0.0.0.0:1234 to accept WebSocket connections.

State Management: Holds an AppState with a tokio::sync::broadcast channel (transmitting tuples of (Sender_UUID, JSON_String)) and a Mutex<HashSet<String>> for tracking connected UUIDs.

Key Logic:

Assigns a uuid::Uuid::new_v4() to every incoming WebSocket connection.

Implements Server-Side Echo Cancellation: Drops outgoing messages if the destination UUID matches the sender UUID.

Broadcasts "presence" payloads whenever a device connects or disconnects.

Exposes Tauri commands like find_hub_ip for local network discovery.

2. Network Bridge (src/hooks/useSyncBridge.ts)
   Role: The React network controller. Connects the local cr-sqlite database to the WebSocket stream.

Data Serialization: Implements custom serializeMsg and deserializeMsg functions to safely package SQLite BigInts and Uint8Arrays for JSON network transport.

Inbound Logic (Effect 1): \* Parses incoming data.

Traps "presence" messages to update React state.

Sanitizes inbound Uint8Arrays by deep-cloning their buffers (new Uint8Array(val.buffer.slice(...))) to prevent WebAssembly memory misalignment panics (out of memory, bad parameter).

Executes INSERT INTO crsql_changes with the required cl and seq columns.

Manages Dynamic Failover: On ws.onclose, waits a random jitter (1000ms - 3000ms), scans via find_hub_ip, and reconnects or promotes itself to localhost.

Outbound Logic (Effect 2): \* Listens to ctx.db.onUpdate.

Extracts changes via SELECT ... FROM crsql_changes WHERE db_version > ? AND site_id = crsql_site_id().

Broadcasts payloads up the active WebSocket pipe.

3. User Interface (src/App.tsx & src/components/ClientsManager.tsx)
   Role: Renders the application state.

Network UI: Consumes useSyncBridge to display network connection status, failover warnings ("Reconnecting..."), and a live counter of online devices.

Data Writes: Executes standard SQL inserts (e.g., via Drizzle) to the local tables. It does not manually trigger syncs; it relies entirely on the cr-sqlite triggers waking up the useSyncBridge hook.
