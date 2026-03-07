import { useSyncBridge } from "./hooks/useSyncBridge";
import ClientsManager from "./components/ClientsManager";
import { useDb } from "./db/context";

type AppProps = {
  hubIp: string | null;
  isTauri: boolean;
};

export default function App({ hubIp, isTauri }: AppProps) {
  const { db } = useDb();
  const wsUrl = hubIp ? `ws://${hubIp}:1234/ws` : `ws://localhost:1234/ws`;
  const { connectedPeers, connectionStatus } = useSyncBridge(
    db,
    wsUrl,
    isTauri,
  );

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
        <div>
          <p style={{ margin: 0, color: "gray", fontSize: "0.9rem" }}>
            <strong>Status: </strong>
            <span
              style={{
                fontWeight: "bold",
                color:
                  connectionStatus === "connected"
                    ? "green"
                    : connectionStatus === "reconnecting"
                      ? "orange"
                      : "red",
                textTransform: "capitalize",
              }}
            >
              {connectionStatus}
            </span>
          </p>
          <p
            style={{
              margin: "0.25rem 0 0 0",
              fontSize: "0.8rem",
              color: "#666",
            }}
          >
            {hubIp ? `Initial Hub: ${hubIp}` : "Local / Failover Mode"}
          </p>
        </div>

        <p style={{ margin: 0, color: "green", fontWeight: "bold" }}>
          🟢 {connectedPeers.length} Device(s) Online
        </p>
      </div>

      <ul style={{ fontSize: "0.8rem", color: "gray", marginBottom: "2rem" }}>
        {connectedPeers.map((ip: string, i: number) => (
          <li key={`${ip}-${i}`}>{ip}</li>
        ))}
      </ul>

      <ClientsManager />
    </div>
  );
}
