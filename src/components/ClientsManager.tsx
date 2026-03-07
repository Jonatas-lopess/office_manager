import { useState } from "react";
import { useLocalQuery } from "../hooks/useLocalQuery";
import { useDb } from "../db/context";
import { clientsTable } from "../db/schema";
import { eq } from "drizzle-orm";
import { Client } from "../db/validations";

export default function ClientsManager() {
  const { db, orm } = useDb();

  const {
    data: clients,
    loading,
    error,
  } = useLocalQuery<Client>(
    db,
    orm.select().from(clientsTable).orderBy(clientsTable.name).toSQL(),
  );

  const [newClientName, setNewClientName] = useState("");

  const handleAddClient = async () => {
    if (!newClientName.trim()) return;

    await orm.insert(clientsTable).values({
      id: crypto.randomUUID(),
      name: newClientName,
      status: "Active",
    });

    setNewClientName("");
  };

  const handleDelete = async (id: string) => {
    await orm.delete(clientsTable).where(eq(clientsTable.id, id));
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
        {clients.map((client) => (
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
