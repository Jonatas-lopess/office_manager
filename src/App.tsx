// App.tsx
import { useSyncBridge } from "./useSyncBridge";
import ClientsManager from "./ClientsManager";
import { DB } from "@vlcn.io/crsqlite-wasm";

type AppProps = {
  ctx: DB;
  hubIp: string | null;
  isTauri: boolean;
};

export default function App({ ctx, hubIp, isTauri }: AppProps) {
  // Determine our connection URL based on the Tauri scan results
  const wsUrl = hubIp ? `ws://${hubIp}:1234/ws` : `ws://localhost:1234/ws`;

  // Start the mathematical CRDT sync engine!
  const { connectedPeers } = useSyncBridge(ctx, wsUrl);

  return (
    <div style={{ padding: "2rem" }}>
      <h1>My Local-First Business App</h1>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "#f3f4f6",
          padding: "1rem",
          borderRadius: "8px",
          marginBottom: "2rem",
        }}
      >
        <p style={{ margin: 0, color: "gray", fontSize: "0.9rem" }}>
          <strong>Network Status:</strong>{" "}
          {hubIp
            ? `Connected to remote Hub (${hubIp})`
            : isTauri
              ? "Operating as the Local Hub (Broadcasting on port 1234)"
              : "Connected to Local Hub (Browser Testing)"}
        </p>

        {/* 2. Render the Live Counter! */}
        <p style={{ margin: 0, color: "green", fontWeight: "bold" }}>
          🟢 {connectedPeers.length} Device(s) Online
        </p>
      </div>

      {/* Optional: A debug list of the actual IPs */}
      <ul style={{ fontSize: "0.8rem", color: "gray" }}>
        {connectedPeers.map((ip) => (
          <li key={ip}>{ip}</li>
        ))}
      </ul>

      <ClientsManager ctx={ctx} />
    </div>
  );
}
