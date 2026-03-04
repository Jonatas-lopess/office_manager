import { useState } from "react";
import { useLocalQuery } from "./useLocalQuery";
import { DB } from "@vlcn.io/crsqlite-wasm";

export default function ClientsManager({ ctx }: { ctx: DB }) {
  // 1. Reactive SQL Query
  // useQuery automatically re-renders this component whenever the 'clients' table changes,
  // whether that change came from this user, or synced from another PC!
  const {
    data: clients,
    loading,
    error,
  } = useLocalQuery(
    ctx,
    "SELECT id, name, status FROM clients ORDER BY name ASC",
  );

  const [newClientName, setNewClientName] = useState("");

  const handleAddClient = () => {
    if (!newClientName.trim()) return;

    // 2. Standard SQL Mutation
    // cr-sqlite automatically intercepts this, tracks the changes mathematically,
    // and prepares the byte-sized diffs to be sent over your WebSocket relay.
    ctx.exec("INSERT INTO clients (id, name, status) VALUES (?, ?, ?)", [
      crypto.randomUUID(),
      newClientName,
      "Active",
    ]);

    setNewClientName("");
  };

  const handleDelete = (id: string) => {
    ctx.exec("DELETE FROM clients WHERE id = ?", [id]);
  };

  if (error) return <div style={{ color: "red" }}>Database Error: {error}</div>;
  if (loading) return <div>Loading database...</div>;

  return (
    <div>
      <h2>Client Roster</h2>

      <div style={{ marginBottom: "1rem" }}>
        <input
          value={newClientName}
          onChange={(e) => setNewClientName(e.target.value)}
          placeholder="Enter client name..."
        />
        <button onClick={handleAddClient}>Add Client</button>
      </div>

      <ul>
        {clients.map((client: any) => (
          <li key={client.id}>
            <strong>{client.name}</strong> - {client.status}
            <button
              onClick={() => handleDelete(client.id)}
              style={{ marginLeft: "1rem" }}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
