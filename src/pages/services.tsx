import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Search, ChevronDown, Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
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
import { AppShell, currency, StatusBadge } from "@/components/panel/panel-kit";
import { v7 as uuidv7 } from "uuid";
import {
  Service,
  insertServiceSchema,
  NewService as NewServiceType,
} from "@/db/validations";
import { useDb } from "@/db/context";
import { useSync } from "@/db/sync-context";
import { useLocalQuery } from "@/hooks/useLocalQuery";
import { servicesTable, serviceTypesArray, clientsTable } from "@/db/schema";
import { and, desc, eq, like, or, isNotNull, ne, sql } from "drizzle-orm";
import * as Accordion from "@radix-ui/react-accordion";
import { logAction } from "@/lib/logger";
import { useToast } from "@/hooks/use-toast";

type ServiceStatus = Service["status"];

export default function ServicesPage() {
  const { db, orm } = useDb();
  const { myId, connectedPeers } = useSync();
  const { toast } = useToast();
  const STATUS = ["Draft", "In progress", "Delivered", "Invoiced"];

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | ServiceStatus>("all");

  const [selectedService, setSelectedService] = useState<any | null>(null);
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | "view">(
    "create",
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const servicesQuery = useMemo(() => {
    let base = orm
      .select({
        id: servicesTable.id,
        type: servicesTable.type,
        description: servicesTable.description,
        client_id: servicesTable.client_id,
        status: servicesTable.status,
        contract_date: servicesTable.contract_date,
        price: servicesTable.price,
        final_date: servicesTable.final_date,
        payment_date: servicesTable.payment_date,
        payment_method: servicesTable.payment_method,
        installments: servicesTable.installments,
        observations: servicesTable.observations,
        client_name: sql<string>`${clientsTable.name}`.as("client_name"),
      })
      .from(servicesTable)
      .innerJoin(clientsTable, eq(servicesTable.client_id, clientsTable.id));

    const conditions = [];

    if (q.trim()) {
      const searchTerm = `%${q.trim()}%`;
      conditions.push(
        or(
          like(servicesTable.type, searchTerm),
          like(clientsTable.name, searchTerm),
        ),
      );
    }

    if (status !== "all") {
      conditions.push(eq(servicesTable.status, status));
    }

    if (conditions.length > 0) {
      base = base.where(and(...conditions)) as any;
    }

    return base.orderBy(desc(servicesTable.contract_date)).toSQL();
  }, [orm, q, status]);

  const { data: rawServices } = useLocalQuery<any>(db, servicesQuery);
  const services = useMemo(() => rawServices || [], [rawServices]);

  const totalRevenue = services
    .filter((s: any) => s.status === "Invoiced")
    .reduce((acc: number, s: any) => acc + s.price, 0);

  const totalToReceive = services
    .filter((s: any) => s.status !== "Invoiced" && s.status !== "Draft")
    .reduce((acc: number, s: any) => acc + s.price, 0);

  const handleDelete = async () => {
    if (!selectedService) return;
    const { id, type } = selectedService;
    await orm.delete(servicesTable).where(eq(servicesTable.id, id));
    await logAction(orm, {
      action: `Serviço excluído: ${type}`,
      module: "Serviços",
      status: "Warning",
      device: connectedPeers.find((p) => p.id === myId)?.ip || undefined,
    });
    toast({
      title: "Serviço excluído",
      description: `O serviço ${type} foi removido com sucesso.`,
    });
    setIsDeleteDialogOpen(false);
    setSelectedService(null);
  };

  const openDialog = (mode: "create" | "edit" | "view", service?: any) => {
    setDialogMode(mode);
    setSelectedService(service || null);
    setIsDialogOpen(true);
  };

  return (
    <AppShell
      title="Serviços"
      subtitle="Acompanhe entregas e renda."
      right={
        <Button
          onClick={() => openDialog("create")}
          className="gap-2 cursor-pointer"
          data-testid="button-new-service-top"
        >
          <Plus className="h-4 w-4" />
          Novo serviço
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3" data-testid="grid-services">
        <Card className="panel-card lg:col-span-2" data-testid="card-services">
          <div
            className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            data-testid="bar-services-controls"
          >
            <div className="relative flex-1" data-testid="wrap-service-search">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por serviço ou cliente…"
                className="pl-9"
                data-testid="input-service-search"
              />
            </div>

            <div
              className="flex items-center gap-2"
              data-testid="wrap-service-filters"
            >
              <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                <SelectTrigger
                  className="w-[180px]"
                  data-testid="select-service-status"
                >
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    value="all"
                    data-testid="option-service-status-all"
                  >
                    Todos os status
                  </SelectItem>
                  {STATUS.map((s) => {
                    const labels: Record<string, string> = {
                      Draft: "Rascunho",
                      "In progress": "Em andamento",
                      Delivered: "Entregue",
                      Invoiced: "Faturado",
                    };
                    return (
                      <SelectItem
                        key={s}
                        value={s}
                        data-testid={`option-service-status-${s}`}
                      >
                        {labels[s] || s}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="divide-y" data-testid="list-services">
            {services.map((s: any) => (
              <div
                key={s.id}
                className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                data-testid={`row-service-${s.id}`}
              >
                <div className="min-w-0">
                  <div
                    className="flex items-center gap-2 min-w-0"
                    data-testid={`group-service-title-${s.id}`}
                  >
                    <div
                      className="truncate text-sm font-semibold"
                      data-testid={`text-service-title-${s.id}`}
                    >
                      {s.type} {s.description && `- ${s.description}`}
                    </div>
                    <StatusBadge status={s.status} />
                  </div>
                  <div
                    className="mt-1 truncate text-xs text-muted-foreground"
                    data-testid={`text-service-meta-${s.id}`}
                  >
                    {s.client_name} ·{" "}
                    {format(parseISO(s.contract_date), "MMM d, yyyy")}
                  </div>
                </div>

                <div
                  className="flex items-center justify-between gap-3 sm:justify-end"
                  data-testid={`group-service-right-${s.id}`}
                >
                  <div className="text-right">
                    <div
                      className="text-sm font-semibold"
                      data-testid={`text-service-price-${s.id}`}
                    >
                      {currency(s.price)}
                    </div>
                    <div
                      className="flex items-center gap-2"
                      data-testid={`group-service-actions-${s.id}`}
                    >
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openDialog("view", s)}
                        data-testid={`button-service-view-${s.id}`}
                      >
                        View
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openDialog("edit", s)}
                        data-testid={`button-service-edit-${s.id}`}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setSelectedService(s);
                          setIsDeleteDialogOpen(true);
                        }}
                        data-testid={`button-service-delete-${s.id}`}
                      >
                        Delete
                      </Button>
                    </div>{" "}
                  </div>
                </div>
              </div>
            ))}

            {services.length === 0 ? (
              <div
                className="p-8 text-center text-sm text-muted-foreground"
                data-testid="empty-services"
              >
                No services found. Try changing your filters.
              </div>
            ) : null}
          </div>
        </Card>

        <Card className="panel-card" data-testid="card-services-summary">
          <div className="p-5">
            <div
              className="text-sm font-medium text-muted-foreground"
              data-testid="text-services-summary-title"
            >
              Resumo (filtrado)
            </div>
            <div
              className="mt-2 grid gap-3"
              data-testid="list-services-summary"
            >
              <SummaryRow
                label="Serviços"
                value={String(services.length)}
                testId="services"
              />
              <SummaryRow
                label="Renda (Faturado)"
                value={currency(totalRevenue)}
                testId="income"
              />
              <SummaryRow
                label="A receber"
                value={currency(totalToReceive)}
                testId="to-receive"
              />
            </div>
            <div
              className="mt-4 rounded-2xl border bg-card p-4 text-xs text-muted-foreground"
              data-testid="callout-services"
            >
              Dica: use “Faturado” para acompanhar o que já foi pago.
            </div>
          </div>
        </Card>
      </div>

      <ServiceDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        mode={dialogMode}
        initialData={selectedService}
        onSave={async (svc) => {
          if (dialogMode === "create") {
            await orm.insert(servicesTable).values(svc);
            await logAction(orm, {
              action: `Novo serviço criado: ${svc.type}`,
              module: "Serviços",
              device:
                connectedPeers.find((p) => p.id === myId)?.ip || undefined,
            });
            toast({
              title: "Serviço criado",
              description: `O serviço ${svc.type} foi registrado com sucesso.`,
            });
          } else if (dialogMode === "edit" && selectedService) {
            await orm
              .update(servicesTable)
              .set(svc)
              .where(eq(servicesTable.id, selectedService.id));
            await logAction(orm, {
              action: `Serviço atualizado: ${svc.type}`,
              module: "Serviços",
              device:
                connectedPeers.find((p) => p.id === myId)?.ip || undefined,
            });
            toast({
              title: "Serviço atualizado",
              description: `As informações do serviço ${svc.type} foram atualizadas.`,
            });
          }
          setIsDialogOpen(false);
          setSelectedService(null);
        }}
      />

      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Serviço</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o serviço{" "}
              <span className="font-semibold text-foreground">
                {selectedService?.type}{" "}
                {selectedService?.description &&
                  `- ${selectedService.description}`}
              </span>
              ? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
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

function SummaryRow({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId: string;
}) {
  return (
    <div
      className="flex items-center justify-between"
      data-testid={`row-summary-${testId}`}
    >
      <div
        className="text-sm text-muted-foreground"
        data-testid={`text-summary-label-${testId}`}
      >
        {label}
      </div>
      <div
        className="text-sm font-semibold"
        data-testid={`text-summary-value-${testId}`}
      >
        {value}
      </div>
    </div>
  );
}

function ServiceDialog({
  open,
  onOpenChange,
  mode,
  initialData,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit" | "view";
  initialData: any | null;
  onSave: (service: any) => Promise<void>;
}) {
  const { db, orm } = useDb();

  const clientsQuery = useMemo(() => {
    return orm.select().from(clientsTable).toSQL();
  }, [orm]);

  const { data: clients } = useLocalQuery<{ id: string; name: string }>(
    db,
    clientsQuery,
  );

  const [openDesc, setOpenDesc] = useState(false);
  const [searchDesc, setSearchDesc] = useState("");

  const descQuery = useMemo(() => {
    return orm
      .select({ description: servicesTable.description })
      .from(servicesTable)
      .where(
        and(
          isNotNull(servicesTable.description),
          ne(servicesTable.description, ""),
        ),
      )
      .groupBy(servicesTable.description)
      .toSQL();
  }, [orm]);

  const { data: rawDesc } = useLocalQuery<any>(db, descQuery);
  const historicDescriptions = useMemo(() => {
    if (!rawDesc) return [];
    return rawDesc.map((d: any) => d.description);
  }, [rawDesc]);

  const form = useForm<NewServiceType>({
    resolver: zodResolver(insertServiceSchema),
    defaultValues: initialData || {
      type: "Outros",
      status: "Draft",
      price: 0,
      description: "",
      client_id: "",
      contract_date: format(new Date(), "yyyy-MM-dd"),
      final_date: "",
      payment_date: "",
      payment_method: "",
      installments: 1,
      observations: "",
    },
  });

  const isView = mode === "view";

  useEffect(() => {
    if (open) {
      if (initialData) {
        form.reset({
          ...initialData,
          client_id: initialData.client_id || "",
          type: initialData.type || "Outros",
          status: initialData.status || "Draft",
          price: initialData.price || 0,
          description: initialData.description || "",
          contract_date:
            initialData.contract_date || format(new Date(), "yyyy-MM-dd"),
          final_date: initialData.final_date || "",
          payment_date: initialData.payment_date || "",
          payment_method: initialData.payment_method || "",
          installments: initialData.installments || 1,
          observations: initialData.observations || "",
        });
      } else {
        form.reset({
          type: "Outros",
          status: "Draft",
          price: 0,
          description: "",
          client_id: "",
          contract_date: format(new Date(), "yyyy-MM-dd"),
          final_date: "",
          payment_date: "",
          payment_method: "",
          installments: 1,
          observations: "",
        });
      }
    }
  }, [open, initialData, form]);

  const status = form.watch("status");
  const finalDate = form.watch("final_date");
  const paymentDate = form.watch("payment_date");

  useEffect(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    if (status === "Delivered" && !finalDate) {
      form.setValue("final_date", today);
    } else if (status === "Invoiced" && !paymentDate) {
      form.setValue("payment_date", today);
    }
  }, [status, form, finalDate, paymentDate]);

  const onSubmit = async (data: NewServiceType) => {
    if (isView) return;
    const nowIso = new Date().toISOString();
    const svc: Service = {
      ...(initialData || {}),
      ...data,
      status: data.status || "Draft",
      type: data.type || "Outros",
      description: data.description || null,
      id: initialData?.id || uuidv7(),
      contract_date: data.contract_date || format(new Date(), "yyyy-MM-dd"),
      final_date: data.final_date || null,
      payment_date: data.payment_date || null,
      payment_method: data.payment_method || null,
      installments: data.installments || null,
      observations: data.observations || null,
      created_at: initialData?.created_at || nowIso,
      updated_at: nowIso,
    };

    await onSave(svc);
  };

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen);
  };

  const titles = {
    create: "Novo serviço",
    edit: "Editar serviço",
    view: "Detalhes do serviço",
  };

  const descriptions = {
    create: "Crie uma entrada de serviço vinculada a um cliente.",
    edit: "Atualize as informações do serviço e acompanhe o progresso.",
    view: "Confira as informações detalhadas deste serviço.",
  };

  const onError = (errors: any) => {
    console.error("[Form Validation Failed]", errors);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid="dialog-new-service">
        <DialogHeader>
          <DialogTitle data-testid="text-new-service-title">
            {titles[mode]}
          </DialogTitle>
          <DialogDescription data-testid="text-new-service-desc">
            {descriptions[mode]}
          </DialogDescription>
        </DialogHeader>

        <form
          autoComplete="off"
          onSubmit={form.handleSubmit(onSubmit, onError)}
          className="grid gap-4"
          data-testid="form-new-service"
        >
          {/* TIER 1: CORE FIELDS */}
          <div className="grid gap-2" data-testid="field-service-client">
            <Label htmlFor="service-client" data-testid="label-service-client">
              Cliente *
            </Label>
            <Select
              disabled={isView}
              value={form.watch("client_id")}
              onValueChange={(v) => form.setValue("client_id", v)}
            >
              <SelectTrigger
                id="service-client"
                data-testid="select-service-client"
              >
                <SelectValue placeholder="Selecione um cliente" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem
                    key={c.id}
                    value={c.id}
                    data-testid={`option-service-client-${c.id}`}
                  >
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.client_id && (
              <span className="text-xs text-destructive">
                {form.formState.errors.client_id.message}
              </span>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div
              className="grid gap-2 sm:col-span-2"
              data-testid="field-service-type"
            >
              <Label htmlFor="service-type" data-testid="label-service-type">
                Tipo de Serviço *
              </Label>
              <Select
                disabled={isView}
                value={form.watch("type") ?? undefined}
                onValueChange={(v) => form.setValue("type", v as any)}
              >
                <SelectTrigger
                  id="service-type"
                  data-testid="select-service-type"
                  className="overflow-hidden"
                >
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {serviceTypesArray.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.type && (
                <span className="text-xs text-destructive">
                  {form.formState.errors.type.message}
                </span>
              )}
            </div>

            <div className="grid gap-2" data-testid="field-service-price">
              <Label htmlFor="service-price" data-testid="label-service-price">
                Valor Base (R$)
              </Label>
              <Input
                disabled={isView}
                id="service-price"
                type="number"
                {...form.register("price", { valueAsNumber: true })}
                inputMode="decimal"
                data-testid="input-service-price"
              />
              {form.formState.errors.price && (
                <span className="text-xs text-destructive">
                  {form.formState.errors.price.message}
                </span>
              )}
            </div>
          </div>

          <div className="grid gap-2" data-testid="field-service-desc">
            <Label htmlFor="service-description">Descrição Resumida</Label>
            <Popover open={openDesc} onOpenChange={setOpenDesc}>
              <PopoverTrigger asChild>
                <Button
                  id="service-description"
                  variant="outline"
                  role="combobox"
                  disabled={isView}
                  aria-expanded={openDesc}
                  className={cn(
                    "w-full justify-between font-normal",
                    !form.watch("description") && "text-muted-foreground",
                  )}
                >
                  {form.watch("description") || "Notas rápidas sobre a entrega"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0" align="start">
                <Command>
                  <CommandInput
                    placeholder="Buscar ou adicionar nova..."
                    value={searchDesc}
                    onValueChange={(val) => {
                      setSearchDesc(val);
                      form.setValue("description", val, {
                        shouldValidate: true,
                      });
                    }}
                  />
                  <CommandList>
                    <CommandEmpty>
                      <span className="text-muted-foreground text-sm pl-2">
                        Pressione Enter para usar &quot;{searchDesc}&quot;
                      </span>
                    </CommandEmpty>
                    <CommandGroup>
                      {historicDescriptions.map((desc: string) => (
                        <CommandItem
                          key={desc}
                          value={desc}
                          onSelect={(currentValue) => {
                            form.setValue("description", currentValue, {
                              shouldValidate: true,
                            });
                            setSearchDesc("");
                            setOpenDesc(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              form.watch("description") === desc
                                ? "opacity-100"
                                : "opacity-0",
                            )}
                          />
                          {desc}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {form.formState.errors.description && (
              <span className="text-xs text-destructive">
                {form.formState.errors.description.message}
              </span>
            )}
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
                  Status & Contrato
                  <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="pt-2 pb-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div
                    className="grid gap-2"
                    data-testid="field-service-status"
                  >
                    <Label
                      htmlFor="service-status"
                      data-testid="label-service-status"
                    >
                      Status do Serviço
                    </Label>
                    <Select
                      disabled={isView}
                      value={form.watch("status")}
                      onValueChange={(v) =>
                        form.setValue("status", v as ServiceStatus)
                      }
                    >
                      <SelectTrigger
                        id="service-status"
                        data-testid="select-new-service-status"
                      >
                        <SelectValue placeholder="Escolha o status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          value="Draft"
                          data-testid="option-new-service-status-Draft"
                        >
                          Rascunho
                        </SelectItem>
                        <SelectItem
                          value="In progress"
                          data-testid="option-new-service-status-In-progress"
                        >
                          Em andamento
                        </SelectItem>
                        <SelectItem
                          value="Delivered"
                          data-testid="option-new-service-status-Delivered"
                        >
                          Entregue
                        </SelectItem>
                        <SelectItem
                          value="Invoiced"
                          data-testid="option-new-service-status-Invoiced"
                        >
                          Faturado
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div
                    className="grid gap-2"
                    data-testid="field-service-contract-date"
                  >
                    <Label htmlFor="service-contract-date">
                      Data de Contrato
                    </Label>
                    <Input
                      disabled={isView}
                      id="service-contract-date"
                      type="date"
                      {...form.register("contract_date")}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div
                    className="grid gap-2"
                    data-testid="field-service-final-date"
                  >
                    <Label htmlFor="service-final-date">Data de Entrega</Label>
                    <Input
                      disabled={isView}
                      id="service-final-date"
                      type="date"
                      {...form.register("final_date")}
                    />
                  </div>
                  <div
                    className="grid gap-2"
                    data-testid="field-service-payment-date"
                  >
                    <Label htmlFor="service-payment-date">
                      Data de Pagamento
                    </Label>
                    <Input
                      disabled={isView}
                      id="service-payment-date"
                      type="date"
                      {...form.register("payment_date")}
                    />
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
                  Dados Financeiros e Prazos
                  <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="pt-2 pb-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div
                    className="grid gap-2"
                    data-testid="field-service-payment-method"
                  >
                    <Label htmlFor="service-payment-method">
                      Método de Pagamento
                    </Label>
                    <Input
                      disabled={isView}
                      id="service-payment-method"
                      {...form.register("payment_method")}
                      placeholder="Ex: Pix, Boleto..."
                    />
                  </div>
                  <div
                    className="grid gap-2"
                    data-testid="field-service-installments"
                  >
                    <Label htmlFor="service-installments">Nº de Parcelas</Label>
                    <Input
                      disabled={isView}
                      id="service-installments"
                      type="number"
                      {...form.register("installments", {
                        valueAsNumber: true,
                      })}
                      placeholder="1"
                    />
                  </div>
                </div>

                <div
                  className="grid gap-2"
                  data-testid="field-service-observations"
                >
                  <Label htmlFor="service-observations">
                    Observações Livres
                  </Label>
                  <Input
                    id="service-observations"
                    {...form.register("observations")}
                    placeholder="Notas estendidas ou links..."
                    disabled={isView}
                  />
                </div>
              </Accordion.Content>
            </Accordion.Item>
          </Accordion.Root>

          <div
            className="flex items-center justify-end gap-2 mt-4"
            data-testid="group-new-service-actions"
          >
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleOpenChange(false)}
              data-testid="button-cancel-new-service"
            >
              {isView ? "Fechar" : "Cancelar"}
            </Button>
            {!isView && (
              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
                data-testid="button-save-new-service"
              >
                {mode === "create" ? "Criar serviço" : "Atualizar serviço"}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
