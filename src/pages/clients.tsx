import { useMemo, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AppShell,
  type Client,
  seedClients,
  uid,
} from "@/components/panel/panel-kit";

const STATUS = ["Active", "Onboarding", "Paused"] as const;

type ClientStatus = (typeof STATUS)[number];

export default function ClientsPage() {
  const [items, setItems] = useState<Client[]>(seedClients);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | ClientStatus>("all");

  const filtered = useMemo(() => {
    return items
      .filter((c) => {
        const matchQ = (c.name + c.email + (c.company ?? ""))
          .toLowerCase()
          .includes(q.toLowerCase().trim());
        const matchS = status === "all" ? true : c.status === status;
        return matchQ && matchS;
      })
      .sort((a, b) => (a.name > b.name ? 1 : -1));
  }, [items, q, status]);

  return (
    <AppShell
      title="Clientes"
      subtitle="Contatos, detalhes da empresa e status."
      right={
        <AddClient
          onCreate={(client) => setItems((prev) => [client, ...prev])}
        />
      }
    >
      <Card className="panel-card" data-testid="card-clients">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between" data-testid="bar-clients-controls">
          <div className="relative flex-1" data-testid="wrap-client-search">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nome, email, empresa…"
              className="pl-9"
              data-testid="input-client-search"
            />
          </div>

          <div className="flex items-center gap-2" data-testid="wrap-client-filters">
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger className="w-[170px]" data-testid="select-client-status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="option-client-status-all">
                  Todos os status
                </SelectItem>
                <SelectItem value="Active" data-testid="option-client-status-Active">Ativo</SelectItem>
                <SelectItem value="Onboarding" data-testid="option-client-status-Onboarding">Integrando</SelectItem>
                <SelectItem value="Paused" data-testid="option-client-status-Paused">Pausado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="divide-y" data-testid="list-clients">
          {filtered.map((c) => (
            <div
              key={c.id}
              className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
              data-testid={`row-client-${c.id}`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2" data-testid={`group-client-title-${c.id}`}>
                  <div className="truncate text-sm font-semibold" data-testid={`text-client-name-${c.id}`}>
                    {c.name}
                  </div>
                  <Badge variant={c.status === "Active" ? "default" : "secondary"} data-testid={`badge-client-status-${c.id}`}>
                    {c.status}
                  </Badge>
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground" data-testid={`text-client-meta-${c.id}`}>
                  {c.email}{c.company ? ` · ${c.company}` : ""}
                </div>
              </div>

              <div className="flex items-center gap-2" data-testid={`group-client-actions-${c.id}`}>
                <Button variant="secondary" size="sm" data-testid={`button-client-view-${c.id}`}>
                  View
                </Button>
                <Button variant="outline" size="sm" data-testid={`button-client-edit-${c.id}`}>
                  Edit
                </Button>
              </div>
            </div>
          ))}

          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground" data-testid="empty-clients">
              No clients found. Try changing your filters.
            </div>
          ) : null}
        </div>
      </Card>
    </AppShell>
  );
}

function AddClient({
  onCreate,
}: {
  onCreate: (client: Client) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState<ClientStatus>("Active");

  function reset() {
    setName("");
    setEmail("");
    setCompany("");
    setStatus("Active");
  }

  const canSave = name.trim().length > 1 && email.includes("@");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-client" className="gap-2">
          <UserPlus className="h-4 w-4" />
          Adicionar cliente
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="dialog-add-client">
        <DialogHeader>
          <DialogTitle data-testid="text-add-client-title">Novo cliente</DialogTitle>
          <DialogDescription data-testid="text-add-client-desc">
            Adicione um cliente ao seu espaço de trabalho.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4" data-testid="form-add-client">
          <div className="grid gap-2" data-testid="field-client-name">
            <Label htmlFor="client-name" data-testid="label-client-name">Nome</Label>
            <Input
              id="client-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Alex Silva"
              data-testid="input-client-name"
            />
          </div>
          <div className="grid gap-2" data-testid="field-client-email">
            <Label htmlFor="client-email" data-testid="label-client-email">Email</Label>
            <Input
              id="client-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alex@empresa.com"
              data-testid="input-client-email"
            />
          </div>
          <div className="grid gap-2" data-testid="field-client-company">
            <Label htmlFor="client-company" data-testid="label-client-company">Empresa (opcional)</Label>
            <Input
              id="client-company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="ex: Northwind"
              data-testid="input-client-company"
            />
          </div>

          <div className="grid gap-2" data-testid="field-client-status">
            <Label data-testid="label-client-status">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as ClientStatus)}>
              <SelectTrigger data-testid="select-new-client-status">
                <SelectValue placeholder="Escolha o status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Active" data-testid="option-new-client-status-Active">Ativo</SelectItem>
                <SelectItem value="Onboarding" data-testid="option-new-client-status-Onboarding">Integrando</SelectItem>
                <SelectItem value="Paused" data-testid="option-new-client-status-Paused">Pausado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-end gap-2" data-testid="group-add-client-actions">
            <Button
              variant="secondary"
              onClick={() => {
                setOpen(false);
                reset();
              }}
              data-testid="button-cancel-add-client"
            >
              Cancelar
            </Button>
            <Button
              disabled={!canSave}
              onClick={() => {
                const client: Client = {
                  id: uid("c"),
                  name: name.trim(),
                  email: email.trim(),
                  company: company.trim() ? company.trim() : undefined,
                  status,
                  createdAt: new Date().toISOString(),
                };
                onCreate(client);
                setOpen(false);
                reset();
              }}
              data-testid="button-save-add-client"
            >
              Salvar cliente
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
