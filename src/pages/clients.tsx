import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Search, UserPlus, ChevronDown } from "lucide-react";
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
import { AppShell } from "@/components/panel/panel-kit";
import { v7 as uuidv7 } from "uuid";
import {
  Client,
  insertClientSchema,
  NewClient as NewClientType,
} from "@/db/validations";
import { useDb } from "@/db/context";
import { useLocalQuery } from "@/hooks/useLocalQuery";
import { clientsTable } from "@/db/schema";
import * as Accordion from "@radix-ui/react-accordion";
import { maskCPF, maskCNPJ, maskPhone } from "@/lib/masks";

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
      birth_date: "",
      payment_source: "",
      gov_password: "",
      cnpj_begin_date: "",
      mei_type: undefined,
      nire: "",
      cib: "",
      incra: "",
      estadual_inscription: "",
    },
  });

  const onSubmit = (data: NewClientType) => {
    const client: Client = {
      ...data,
      status: data.status || "Active",
      name: data.name || "",
      id: uuidv7(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      email: data.email || null,
      observations: data.observations || null,
      phone: data.phone || null,
      cpf: data.cpf || null,
      cnpj: data.cnpj || null,
      birth_date: data.birth_date || null,
      payment_source: data.payment_source || null,
      gov_password: data.gov_password || null,
      cnpj_begin_date: data.cnpj_begin_date || null,
      mei_type: data.mei_type || null,
      nire: data.nire || null,
      cib: data.cib || null,
      incra: data.incra || null,
      estadual_inscription: data.estadual_inscription || null,
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

  const onError = (errors: any) => {
    console.error("[Form Validation Failed]", errors);
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
          autoComplete="off"
          onSubmit={form.handleSubmit(onSubmit, onError)}
          className="grid gap-4"
          data-testid="form-add-client"
        >
          {/* TIER 1: CORE FIELDS */}
          <div className="grid gap-4 sm:grid-cols-2">
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

            <div className="grid gap-2" data-testid="field-client-status">
              <Label htmlFor="client-status" data-testid="label-client-status">Status</Label>
              <Select
                value={form.watch("status") ?? undefined}
                onValueChange={(v) =>
                  form.setValue("status", v as ClientStatus)
                }
              >
                <SelectTrigger id="client-status" data-testid="select-new-client-status">
                  <SelectValue placeholder="Escolha o status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active" data-testid="option-new-client-status-Active">Ativo</SelectItem>
                  <SelectItem value="Onboarding" data-testid="option-new-client-status-Onboarding">Integrando</SelectItem>
                  <SelectItem value="Inactive" data-testid="option-new-client-status-Inactive">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Accordion.Root type="single" collapsible defaultValue="additional" className="w-full space-y-4">
            {/* TIER 2: ADDITIONAL INFO */}
            <Accordion.Item value="additional" className="border rounded-md px-4 py-2 bg-muted/20">
              <Accordion.Header className="flex">
                <Accordion.Trigger className="flex flex-1 items-center justify-between py-2 text-sm font-semibold hover:underline [&[data-state=open]>svg]:rotate-180">
                  Documentação & Contato principal
                  <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="pt-2 pb-4 space-y-4">
                
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2" data-testid="field-client-cpf">
                    <Label htmlFor="client-cpf">CPF</Label>
                    <Input id="client-cpf" {...form.register("cpf", { onChange: (e) => { e.target.value = maskCPF(e.target.value); } })} placeholder="000.000.000-00" />
                    {form.formState.errors.cpf && (
                      <span className="text-xs text-destructive">{form.formState.errors.cpf.message}</span>
                    )}
                  </div>
                  <div className="grid gap-2" data-testid="field-client-cnpj">
                    <Label htmlFor="client-cnpj">CNPJ</Label>
                    <Input id="client-cnpj" {...form.register("cnpj", { onChange: (e) => { e.target.value = maskCNPJ(e.target.value); } })} placeholder="00.000.000/0000-00" />
                    {form.formState.errors.cnpj && (
                      <span className="text-xs text-destructive">{form.formState.errors.cnpj.message}</span>
                    )}
                  </div>
                </div>

                {(form.watch("cnpj")?.length ?? 0) > 0 && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2" data-testid="field-client-cnpj-date">
                      <Label htmlFor="client-cnpj-date">Data de Início do CNPJ</Label>
                      <Input id="client-cnpj-date" type="date" {...form.register("cnpj_begin_date")} />
                    </div>
                    <div className="grid gap-2" data-testid="field-client-mei-type">
                      <Label htmlFor="client-mei-type">Tipo de MEI</Label>
                      <Select
                        value={form.watch("mei_type") ?? undefined}
                        onValueChange={(v) => form.setValue("mei_type", v as any)}
                      >
                        <SelectTrigger id="client-mei-type">
                          <SelectValue placeholder="Selecione o tipo..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Comercy">Comércio</SelectItem>
                          <SelectItem value="Service">Serviço</SelectItem>
                          <SelectItem value="Production">Produção</SelectItem>
                          <SelectItem value="Specific">Outro Específico</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2" data-testid="field-client-email">
                    <Label htmlFor="client-email">Email</Label>
                    <Input id="client-email" {...form.register("email")} placeholder="alex@empresa.com" />
                    {form.formState.errors.email && (
                      <span className="text-xs text-destructive">{form.formState.errors.email.message}</span>
                    )}
                  </div>
                  <div className="grid gap-2" data-testid="field-client-phone">
                    <Label htmlFor="client-phone">Telefone</Label>
                    <Input id="client-phone" {...form.register("phone", { onChange: (e) => { e.target.value = maskPhone(e.target.value); } })} placeholder="(00) 00000-0000" />
                    {form.formState.errors.phone && (
                      <span className="text-xs text-destructive">{form.formState.errors.phone.message}</span>
                    )}
                  </div>
                </div>

              </Accordion.Content>
            </Accordion.Item>

            {/* TIER 3: ADVANCED DETAILS */}
            <Accordion.Item value="advanced" className="border rounded-md px-4 py-2 bg-muted/20">
              <Accordion.Header className="flex">
                <Accordion.Trigger className="flex flex-1 items-center justify-between py-2 text-sm font-semibold hover:underline [&[data-state=open]>svg]:rotate-180">
                  Dados Avançados (Gov, IE, NIRE, etc)
                  <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="pt-2 pb-4 space-y-4">
                
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2" data-testid="field-client-birthdate">
                    <Label htmlFor="client-birthdate">Data de Nascimento</Label>
                    <Input id="client-birthdate" type="date" {...form.register("birth_date")} />
                  </div>
                  <div className="grid gap-2" data-testid="field-client-payment-source">
                    <Label htmlFor="client-payment-source">Fonte Pagadora</Label>
                    <Input id="client-payment-source" {...form.register("payment_source")} placeholder="Ex: Nome da Empresa" />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2" data-testid="field-client-ie">
                    <Label htmlFor="client-ie">Inscrição Estadual</Label>
                    <Input id="client-ie" {...form.register("estadual_inscription")} placeholder="000.000.000.000" />
                  </div>
                  <div className="grid gap-2" data-testid="field-client-nire">
                    <Label htmlFor="client-nire">NIRE</Label>
                    <Input id="client-nire" {...form.register("nire")} placeholder="00.0.0000000-0" />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2" data-testid="field-client-cib">
                    <Label htmlFor="client-cib">CIB</Label>
                    <Input id="client-cib" {...form.register("cib")} placeholder="0.000.000-0" />
                  </div>
                  <div className="grid gap-2" data-testid="field-client-incra">
                    <Label htmlFor="client-incra">INCRA</Label>
                    <Input id="client-incra" {...form.register("incra")} placeholder="000.000.000.000-0" />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2" data-testid="field-client-gov-pass">
                    <Label htmlFor="client-gov-pass">Senha Gov</Label>
                    <Input id="client-gov-pass" {...form.register("gov_password")} placeholder="Senha do portal" />
                  </div>
                  <div className="grid gap-2" data-testid="field-client-observations">
                    <Label htmlFor="client-observations">Observações Livres</Label>
                    <Input id="client-observations" {...form.register("observations")} placeholder="Notas gerais..." />
                  </div>
                </div>

              </Accordion.Content>
            </Accordion.Item>
          </Accordion.Root>

          <div
            className="flex items-center justify-end gap-2 mt-4"
            data-testid="group-add-client-actions"
          >
            <Button type="button" variant="secondary" onClick={() => handleOpenChange(false)} data-testid="button-cancel-add-client">
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting} data-testid="button-save-add-client">
              Salvar cliente
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
