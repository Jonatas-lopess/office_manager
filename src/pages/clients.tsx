import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { AppShell, uid } from "@/components/panel/panel-kit";
import {
  Client,
  insertClientSchema,
  NewClient as NewClientType,
} from "@/db/validations";
import { useDb } from "@/db/context";
import { useLocalQuery } from "@/hooks/useLocalQuery";
import { clientsTable } from "@/db/schema";

type ClientStatus = Client["status"];

export default function ClientsPage() {
  const { db, orm } = useDb();

  const clientsQuery = useMemo(() => {
    return orm.select().from(clientsTable).toSQL();
  }, [orm]);
  const { data: items } = useLocalQuery<Client>(db, clientsQuery);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | ClientStatus>("all");

  const filtered = useMemo(() => {
    return items
      .filter((c) => {
        const matchQ = (c.name + (c.email || "") + (c.observations ?? ""))
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
          onCreate={async (client) => {
            console.log("[Schema] Creating new client...");
            await orm.insert(clientsTable).values(client);
          }}
        />
      }
    >
      <Card className="panel-card" data-testid="card-clients">
        <div
          className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
          data-testid="bar-clients-controls"
        >
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

          <div
            className="flex items-center gap-2"
            data-testid="wrap-client-filters"
          >
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger
                className="w-[170px]"
                data-testid="select-client-status"
              >
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="option-client-status-all">
                  Todos os status
                </SelectItem>
                <SelectItem
                  value="Active"
                  data-testid="option-client-status-Active"
                >
                  Ativo
                </SelectItem>
                <SelectItem
                  value="Onboarding"
                  data-testid="option-client-status-Onboarding"
                >
                  Integrando
                </SelectItem>
                <SelectItem
                  value="Inactive"
                  data-testid="option-client-status-Inactive"
                >
                  Inativo
                </SelectItem>
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
                <div
                  className="flex flex-wrap items-center gap-2"
                  data-testid={`group-client-title-${c.id}`}
                >
                  <div
                    className="truncate text-sm font-semibold"
                    data-testid={`text-client-name-${c.id}`}
                  >
                    {c.name}
                  </div>
                  <Badge
                    variant={c.status === "Active" ? "default" : "secondary"}
                    data-testid={`badge-client-status-${c.id}`}
                  >
                    {c.status}
                  </Badge>
                </div>
                <div
                  className="mt-1 truncate text-xs text-muted-foreground"
                  data-testid={`text-client-meta-${c.id}`}
                >
                  {c.email}
                  {c.observations ? ` · ${c.observations}` : ""}
                </div>
              </div>

              <div
                className="flex items-center gap-2"
                data-testid={`group-client-actions-${c.id}`}
              >
                <Button
                  variant="secondary"
                  size="sm"
                  data-testid={`button-client-view-${c.id}`}
                >
                  View
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  data-testid={`button-client-edit-${c.id}`}
                >
                  Edit
                </Button>
              </div>
            </div>
          ))}

          {filtered.length === 0 ? (
            <div
              className="p-8 text-center text-sm text-muted-foreground"
              data-testid="empty-clients"
            >
              No clients found. Try changing your filters.
            </div>
          ) : null}
        </div>
      </Card>
    </AppShell>
  );
}

function AddClient({ onCreate }: { onCreate: (client: Client) => void }) {
  const [open, setOpen] = useState(false);

  const form = useForm<NewClientType>({
    resolver: zodResolver(insertClientSchema),
    defaultValues: {
      name: "",
      email: "",
      observations: "",
      status: "Active",
      phone: "",
      cpf: "",
      cnpj: "",
    },
  });

  const onSubmit = (data: NewClientType) => {
    const client: Client = {
      ...data,
      id: uid("c"),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      email: data.email || null,
      observations: data.observations || null,
      phone: data.phone || null,
      cpf: data.cpf || null,
      cnpj: data.cnpj || null,
      birth_date: null,
      payment_source: null,
      gov_password: null,
      cnpj_begin_date: null,
      mei_type: null,
      nire: null,
      cib: null,
      incra: null,
      estadual_inscription: null,
    };
    onCreate(client);
    setOpen(false);
    form.reset();
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      form.reset();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-client" className="gap-2">
          <UserPlus className="h-4 w-4" />
          Adicionar cliente
        </Button>
      </DialogTrigger>
      <DialogContent
        data-testid="dialog-add-client"
        className="max-h-[85vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle data-testid="text-add-client-title">
            Novo cliente
          </DialogTitle>
          <DialogDescription data-testid="text-add-client-desc">
            Adicione um cliente ao seu espaço de trabalho.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="grid gap-4"
          data-testid="form-add-client"
        >
          <div className="grid gap-2" data-testid="field-client-name">
            <Label htmlFor="client-name" data-testid="label-client-name">
              Nome Completo *
            </Label>
            <Input
              id="client-name"
              {...form.register("name")}
              placeholder="ex: Alex Silva"
              data-testid="input-client-name"
            />
            {form.formState.errors.name && (
              <span className="text-xs text-destructive">
                {form.formState.errors.name.message}
              </span>
            )}
          </div>
          <div className="grid gap-2" data-testid="field-client-email">
            <Label htmlFor="client-email" data-testid="label-client-email">
              Email
            </Label>
            <Input
              id="client-email"
              {...form.register("email")}
              placeholder="alex@empresa.com"
              data-testid="input-client-email"
            />
          </div>

          <div className="grid gap-4 grid-cols-2">
            <div className="grid gap-2" data-testid="field-client-cpf">
              <Label htmlFor="client-cpf" data-testid="label-client-cpf">
                CPF
              </Label>
              <Input
                id="client-cpf"
                {...form.register("cpf")}
                placeholder="000.000.000-00"
                data-testid="input-client-cpf"
              />
            </div>

            <div className="grid gap-2" data-testid="field-client-phone">
              <Label htmlFor="client-phone" data-testid="label-client-phone">
                Telefone
              </Label>
              <Input
                id="client-phone"
                {...form.register("phone")}
                placeholder="(00) 00000-0000"
                data-testid="input-client-phone"
              />
            </div>
          </div>

          <div className="grid gap-4 grid-cols-2">
            <div className="grid gap-2" data-testid="field-client-cnpj">
              <Label htmlFor="client-cnpj" data-testid="label-client-cnpj">
                CNPJ (se PJ)
              </Label>
              <Input
                id="client-cnpj"
                {...form.register("cnpj")}
                placeholder="00.000.000/0000-00"
                data-testid="input-client-cnpj"
              />
            </div>

            <div className="grid gap-2" data-testid="field-client-status">
              <Label data-testid="label-client-status">Status</Label>
              <Select
                value={form.watch("status") ?? undefined}
                onValueChange={(v) =>
                  form.setValue("status", v as ClientStatus)
                }
              >
                <SelectTrigger data-testid="select-new-client-status">
                  <SelectValue placeholder="Escolha o status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    value="Active"
                    data-testid="option-new-client-status-Active"
                  >
                    Ativo
                  </SelectItem>
                  <SelectItem
                    value="Onboarding"
                    data-testid="option-new-client-status-Onboarding"
                  >
                    Integrando
                  </SelectItem>
                  <SelectItem
                    value="Inactive"
                    data-testid="option-new-client-status-Inactive"
                  >
                    Inativo
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2" data-testid="field-client-observations">
            <Label
              htmlFor="client-observations"
              data-testid="label-client-observations"
            >
              Empresa / Observações
            </Label>
            <Input
              id="client-observations"
              {...form.register("observations")}
              placeholder="Notas gerais sobre o cliente..."
              data-testid="input-client-observations"
            />
          </div>

          <div
            className="flex items-center justify-end gap-2 mt-2"
            data-testid="group-add-client-actions"
          >
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleOpenChange(false)}
              data-testid="button-cancel-add-client"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={form.formState.isSubmitting}
              data-testid="button-save-add-client"
            >
              Salvar cliente
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
