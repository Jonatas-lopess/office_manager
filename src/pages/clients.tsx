import { useMemo, useState, useEffect } from "react";
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
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AppShell, StatusBadge } from "@/components/panel/panel-kit";
import { v7 as uuidv7 } from "uuid";
import {
  Client,
  insertClientSchema,
  NewClient as NewClientType,
} from "@/db/validations";
import { useDb } from "@/db/context";
import { useSync } from "@/db/sync-context";
import { useLocalQuery } from "@/hooks/useLocalQuery";
import { clientsTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import * as Accordion from "@radix-ui/react-accordion";
import { maskCPF, maskCNPJ, maskPhone, maskIncra, maskNIRF } from "@/lib/masks";
import { logAction } from "@/lib/logger";
import { useToast } from "@/hooks/use-toast";

type ClientStatus = Client["status"];

export default function ClientsPage() {
  const { db, orm } = useDb();
  const { myId, connectedPeers } = useSync();
  const { toast } = useToast();

  const clientsQuery = useMemo(() => {
    return orm.select().from(clientsTable).toSQL();
  }, [orm]);
  const { data: items } = useLocalQuery<Client>(db, clientsQuery);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | ClientStatus>("all");

  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | "view">(
    "create",
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const filtered = useMemo(() => {
    return (items || [])
      .filter((c) => {
        const matchQ = (c.name + (c.email || "") + (c.observations ?? ""))
          .toLowerCase()
          .includes(q.toLowerCase().trim());
        const matchS = status === "all" ? true : c.status === status;
        return matchQ && matchS;
      })
      .sort((a, b) => (a.name > b.name ? 1 : -1));
  }, [items, q, status]);

  const handleDelete = async () => {
    if (!selectedClient) return;
    const { id, name } = selectedClient;
    await orm.delete(clientsTable).where(eq(clientsTable.id, id));
    await logAction(orm, {
      action: `Cliente excluído: ${name}`,
      module: "Clientes",
      status: "Warning",
      device: connectedPeers.find((p) => p.id === myId)?.ip || undefined,
    });
    toast({
      variant: "destructive",
      title: "Cliente excluído",
      description: `O cliente ${name} foi removido com sucesso.`,
    });
    setIsDeleteDialogOpen(false);
    setSelectedClient(null);
  };

  const openDialog = (mode: "create" | "edit" | "view", client?: Client) => {
    setDialogMode(mode);
    setSelectedClient(client || null);
    setIsDialogOpen(true);
  };

  return (
    <AppShell
      title="Clientes"
      subtitle="Contatos, detalhes da empresa e status."
      right={
        <Button
          onClick={() => openDialog("create")}
          className="gap-2 cursor-pointer"
          data-testid="button-add-client-top"
        >
          <UserPlus className="h-4 w-4" />
          Adicionar cliente
        </Button>
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
                  <StatusBadge status={c.status} />
                </div>
                <div
                  className="mt-1 truncate text-xs text-muted-foreground"
                  data-testid={`text-client-meta-${c.id}`}
                >
                  {c.email || c.phone}
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
                  onClick={() => openDialog("view", c)}
                  data-testid={`button-client-view-${c.id}`}
                >
                  View
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openDialog("edit", c)}
                  data-testid={`button-client-edit-${c.id}`}
                >
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setSelectedClient(c);
                    setIsDeleteDialogOpen(true);
                  }}
                  data-testid={`button-client-delete-${c.id}`}
                >
                  Delete
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

      <ClientDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        mode={dialogMode}
        initialData={selectedClient}
        onSave={async (client) => {
          if (dialogMode === "create") {
            await orm.insert(clientsTable).values(client);
            await logAction(orm, {
              action: `Novo cliente cadastrado: ${client.name}`,
              module: "Clientes",
              device:
                connectedPeers.find((p) => p.id === myId)?.ip || undefined,
            });
            toast({
              variant: "success",
              title: "Cliente criado",
              description: `O cliente ${client.name} foi cadastrado com sucesso.`,
            });
          } else if (dialogMode === "edit" && selectedClient) {
            await orm
              .update(clientsTable)
              .set(client)
              .where(eq(clientsTable.id, selectedClient.id));
            await logAction(orm, {
              action: `Cliente atualizado: ${client.name}`,
              module: "Clientes",
              device:
                connectedPeers.find((p) => p.id === myId)?.ip || undefined,
            });
            toast({
              variant: "success",
              title: "Cliente atualizado",
              description: `As informações de ${client.name} foram salvas.`,
            });
          }
          setIsDialogOpen(false);
          setSelectedClient(null);
        }}
      />

      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Cliente</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o cliente{" "}
              <span className="font-semibold">{selectedClient?.name}</span>?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                handleDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function ClientDialog({
  open,
  onOpenChange,
  mode,
  initialData,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit" | "view";
  initialData: Client | null;
  onSave: (client: Client) => Promise<void>;
}) {
  const form = useForm<NewClientType>({
    resolver: zodResolver(insertClientSchema),
    defaultValues: initialData || {
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
      mei_type: null,
      nirf: "",
      cib: "",
      incra: "",
      estadual_inscription: "",
    },
  });

  const isView = mode === "view";

  useEffect(() => {
    if (open) {
      if (initialData) {
        form.reset(initialData as any);
      } else {
        form.reset({
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
          mei_type: null,
          nirf: "",
          cib: "",
          incra: "",
          estadual_inscription: "",
        });
      }
    }
  }, [open, initialData, form]);

  const onSubmit = async (data: NewClientType) => {
    if (isView) return;

    const client: Client = {
      ...(initialData || {}),
      ...data,
      status: data.status || "Active",
      name: data.name || "",
      id: initialData?.id || uuidv7(),
      created_at: initialData?.created_at || new Date().toISOString(),
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
      nirf: data.nirf || null,
      cib: data.cib || null,
      incra: data.incra || null,
      estadual_inscription: data.estadual_inscription || null,
    };

    await onSave(client);
  };

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen);
  };

  const onError = (errors: any) => {
    console.error("[Form Validation Failed]", errors);
  };

  const titles = {
    create: "Novo cliente",
    edit: "Editar cliente",
    view: "Dados do cliente",
  };

  const descriptions = {
    create: "Adicione um cliente ao seu espaço de trabalho.",
    edit: "Atualize as informações do cliente.",
    view: "Visualize as informações detalhadas do cliente.",
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        data-testid="dialog-add-client"
        className="max-h-[85vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle data-testid="text-add-client-title">
            {titles[mode]}
          </DialogTitle>
          <DialogDescription data-testid="text-add-client-desc">
            {descriptions[mode]}
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
                disabled={isView}
              />
              {form.formState.errors.name && (
                <span className="text-xs text-destructive">
                  {form.formState.errors.name.message}
                </span>
              )}
            </div>

            <div className="grid gap-2" data-testid="field-client-status">
              <Label htmlFor="client-status" data-testid="label-client-status">
                Status
              </Label>
              <Select
                disabled={isView}
                value={form.watch("status") ?? undefined}
                onValueChange={(v) =>
                  form.setValue("status", v as ClientStatus)
                }
              >
                <SelectTrigger
                  id="client-status"
                  data-testid="select-new-client-status"
                >
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

          <Accordion.Root
            type="single"
            collapsible
            defaultValue="additional"
            className="w-full space-y-4"
          >
            {/* TIER 2: ADDITIONAL INFO */}
            <Accordion.Item
              value="additional"
              className="border rounded-md px-4 py-2 bg-muted/20"
            >
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
                    <Input
                      id="client-cpf"
                      {...form.register("cpf", {
                        onChange: (e) => {
                          e.target.value = maskCPF(e.target.value);
                        },
                      })}
                      placeholder="000.000.000-00"
                      disabled={isView}
                    />
                    {form.formState.errors.cpf && (
                      <span className="text-xs text-destructive">
                        {form.formState.errors.cpf.message}
                      </span>
                    )}
                  </div>
                  <div className="grid gap-2" data-testid="field-client-cnpj">
                    <Label htmlFor="client-cnpj">CNPJ</Label>
                    <Input
                      id="client-cnpj"
                      {...form.register("cnpj", {
                        onChange: (e) => {
                          e.target.value = maskCNPJ(e.target.value);
                        },
                      })}
                      placeholder="00.000.000/0000-00"
                      disabled={isView}
                    />
                    {form.formState.errors.cnpj && (
                      <span className="text-xs text-destructive">
                        {form.formState.errors.cnpj.message}
                      </span>
                    )}
                  </div>
                </div>

                {(form.watch("cnpj")?.length ?? 0) > 0 && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div
                      className="grid gap-2"
                      data-testid="field-client-cnpj-date"
                    >
                      <Label htmlFor="client-cnpj-date">
                        Data de Início do CNPJ
                      </Label>
                      <Input
                        id="client-cnpj-date"
                        type="date"
                        {...form.register("cnpj_begin_date")}
                        disabled={isView}
                      />
                    </div>
                    <div
                      className="grid gap-2"
                      data-testid="field-client-mei-type"
                    >
                      <Label htmlFor="client-mei-type">Tipo de MEI</Label>
                      <Select
                        disabled={isView}
                        value={form.watch("mei_type") ?? undefined}
                        onValueChange={(v) =>
                          form.setValue("mei_type", v as any)
                        }
                      >
                        <SelectTrigger id="client-mei-type">
                          <SelectValue placeholder="Selecione o tipo..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Comercy">Comércio</SelectItem>
                          <SelectItem value="Service">Serviço</SelectItem>
                          <SelectItem value="Production">Produção</SelectItem>
                          <SelectItem value="Specific">
                            Outro Específico
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2" data-testid="field-client-email">
                    <Label htmlFor="client-email">Email</Label>
                    <Input
                      id="client-email"
                      {...form.register("email")}
                      placeholder="alex@empresa.com"
                      disabled={isView}
                    />
                    {form.formState.errors.email && (
                      <span className="text-xs text-destructive">
                        {form.formState.errors.email.message}
                      </span>
                    )}
                  </div>
                  <div className="grid gap-2" data-testid="field-client-phone">
                    <Label htmlFor="client-phone">Telefone</Label>
                    <Input
                      id="client-phone"
                      {...form.register("phone", {
                        onChange: (e) => {
                          e.target.value = maskPhone(e.target.value);
                        },
                      })}
                      placeholder="(00) 00000-0000"
                      disabled={isView}
                    />
                    {form.formState.errors.phone && (
                      <span className="text-xs text-destructive">
                        {form.formState.errors.phone.message}
                      </span>
                    )}
                  </div>
                </div>
              </Accordion.Content>
            </Accordion.Item>

            {/* TIER 3: ADVANCED DETAILS */}
            <Accordion.Item
              value="advanced"
              className="border rounded-md px-4 py-2 bg-muted/20"
            >
              <Accordion.Header className="flex">
                <Accordion.Trigger className="flex flex-1 items-center justify-between py-2 text-sm font-semibold hover:underline [&[data-state=open]>svg]:rotate-180">
                  Dados Avançados (Gov, IE, NIRF, etc)
                  <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="pt-2 pb-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div
                    className="grid gap-2"
                    data-testid="field-client-birthdate"
                  >
                    <Label htmlFor="client-birthdate">Data de Nascimento</Label>
                    <Input
                      id="client-birthdate"
                      type="date"
                      {...form.register("birth_date")}
                      disabled={isView}
                    />
                  </div>
                  <div
                    className="grid gap-2"
                    data-testid="field-client-payment-source"
                  >
                    <Label htmlFor="client-payment-source">
                      Fonte Pagadora
                    </Label>
                    <Input
                      id="client-payment-source"
                      {...form.register("payment_source")}
                      placeholder="Ex: Nome da Empresa"
                      disabled={isView}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2" data-testid="field-client-ie">
                    <Label htmlFor="client-ie">Inscrição Estadual</Label>
                    <Input
                      id="client-ie"
                      {...form.register("estadual_inscription")}
                      placeholder="Número da IE"
                      disabled={isView}
                    />
                  </div>
                  <div className="grid gap-2" data-testid="field-client-nirf">
                    <Label htmlFor="client-nirf">NIRF</Label>
                    <Input
                      id="client-nirf"
                      {...form.register("nirf", {
                        onChange: (e) => {
                          e.target.value = maskNIRF(e.target.value);
                        },
                      })}
                      placeholder="0.000.000-0"
                      disabled={isView}
                    />
                    {form.formState.errors.nirf && (
                      <span className="text-xs text-destructive">
                        {form.formState.errors.nirf.message}
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2" data-testid="field-client-cib">
                    <Label htmlFor="client-cib">CIB</Label>
                    <Input
                      id="client-cib"
                      {...form.register("cib")}
                      placeholder="Número do CIB"
                      disabled={isView}
                    />
                  </div>
                  <div className="grid gap-2" data-testid="field-client-incra">
                    <Label htmlFor="client-incra">INCRA</Label>
                    <Input
                      id="client-incra"
                      {...form.register("incra", {
                        onChange: (e) => {
                          e.target.value = maskIncra(e.target.value);
                        },
                      })}
                      placeholder="000.000.000.000-0"
                      disabled={isView}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div
                    className="grid gap-2"
                    data-testid="field-client-gov-pass"
                  >
                    <Label htmlFor="client-gov-pass">Senha Gov</Label>
                    <Input
                      id="client-gov-pass"
                      {...form.register("gov_password")}
                      placeholder="Senha do portal"
                      disabled={isView}
                    />
                  </div>
                  <div
                    className="grid gap-2"
                    data-testid="field-client-observations"
                  >
                    <Label htmlFor="client-observations">
                      Observações Livres
                    </Label>
                    <Input
                      id="client-observations"
                      {...form.register("observations")}
                      placeholder="Notas gerais..."
                      disabled={isView}
                    />
                  </div>
                </div>
              </Accordion.Content>
            </Accordion.Item>
          </Accordion.Root>

          <div
            className="flex items-center justify-end gap-2 mt-4"
            data-testid="group-add-client-actions"
          >
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleOpenChange(false)}
              data-testid="button-cancel-add-client"
            >
              {isView ? "Fechar" : "Cancelar"}
            </Button>
            {!isView && (
              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
                data-testid="button-save-add-client"
              >
                {mode === "create" ? "Salvar cliente" : "Atualizar cliente"}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
