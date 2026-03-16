import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Plus,
  Search,
  Check,
  ChevronsUpDown,
  Eye,
  Pencil,
  Trash2,
} from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDb } from "@/db/context";
import { useSync } from "@/db/sync-context";
import { useLocalQuery } from "@/hooks/useLocalQuery";
import { servicesTable, serviceTypesArray, clientsTable } from "@/db/schema";
import { and, desc, eq, like, or, isNotNull, ne, sql } from "drizzle-orm";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { logAction } from "@/lib/logger";
import { useToast } from "@/hooks/use-toast";
import ClickToCopy from "@/components/ui/click-to-copy";

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
  const [pendingService, setPendingService] = useState<any | null>(null);

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

  const { data: rawServices, loading: servicesLoading } = useLocalQuery<any>(
    db,
    servicesQuery,
  );
  const services = useMemo(() => rawServices || [], [rawServices]);

  const clientsQuery = useMemo(() => {
    return orm.select().from(clientsTable).toSQL();
  }, [orm]);
  const { data: rawClients, loading: clientsLoading } = useLocalQuery<any>(
    db,
    clientsQuery,
  );
  const clients = useMemo(() => rawClients || [], [rawClients]);

  const loading = servicesLoading || clientsLoading;

  const clientsMap = useMemo(() => {
    return clients.reduce((acc: Record<string, any>, c: any) => {
      acc[c.id] = c;
      return acc;
    }, {});
  }, [clients]);

  const filtered = services;

  const totalRevenue = useMemo(() => {
    return services
      .filter((s: any) => s.status === "Invoiced")
      .reduce((acc: number, s: any) => acc + s.price, 0);
  }, [services]);

  const totalToReceive = useMemo(() => {
    return services
      .filter((s: any) => s.status !== "Invoiced" && s.status !== "Draft")
      .reduce((acc: number, s: any) => acc + s.price, 0);
  }, [services]);

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
      variant: "destructive",
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
      <div className="flex-1 grid gap-4 lg:grid-cols-3 min-h-0" data-testid="grid-services">
        <Card className="panel-card flex flex-col min-h-0 lg:col-span-2" data-testid="card-services">
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
          <ScrollArea className="flex-1 pr-4">
            <div className="divide-y" data-testid="list-services">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <ServiceSkeleton key={i} />
                ))
              ) : (
                <>
                  {pendingService &&
                    !services.some((s) => s.id === pendingService.id) && (
                      <ServiceSkeleton />
                    )}
                  {filtered.length > 0
                    ? filtered.map((s) => {
                        if (pendingService && s.id === pendingService.id) {
                          return <ServiceSkeleton key={s.id} />;
                        }
                        return (
                          <div
                            key={s.id}
                            className="group flex items-center justify-between gap-4 p-4 hover:bg-muted/30 transition-colors"
                            data-testid={`row-service-${s.id}`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <div
                                  className="truncate text-sm font-medium"
                                  data-testid={`text-service-type-${s.id}`}
                                >
                                  {s.type}{" "}
                                  {s.description && `- ${s.description}`}
                                </div>
                                <StatusBadge status={s.status} />
                              </div>
                              <div
                                className="mt-0.5 truncate text-xs text-muted-foreground"
                                data-testid={`text-service-meta-${s.id}`}
                              >
                                {clientsMap[s.client_id]?.name ||
                                  "Cliente desconhecido"}{" "}
                                &middot;{" "}
                                {format(
                                  parseISO(s.contract_date),
                                  "dd/MM/yyyy",
                                )}{" "}
                                &middot; {currency(s.price)}
                              </div>
                            </div>
                            <div
                              className="flex items-center gap-2"
                              data-testid={`group-service-actions-${s.id}`}
                            >
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="secondary"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => openDialog("view", s)}
                                    data-testid={`button-service-view-${s.id}`}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Visualizar</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => openDialog("edit", s)}
                                    data-testid={`button-service-edit-${s.id}`}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Editar</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="destructive"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => {
                                      setSelectedService(s);
                                      setIsDeleteDialogOpen(true);
                                    }}
                                    data-testid={`button-service-delete-${s.id}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Excluir</TooltipContent>
                              </Tooltip>
                            </div>{" "}
                          </div>
                        );
                      })
                    : !pendingService && (
                        <Empty className="py-12">
                          <EmptyHeader>
                            <EmptyMedia variant="icon">
                              <Search className="size-6" />
                            </EmptyMedia>
                            <EmptyTitle>Nenhum serviço encontrado</EmptyTitle>
                            <EmptyDescription>
                              Tente ajustar sua busca ou filtros para encontrar
                              o que procura.
                            </EmptyDescription>
                          </EmptyHeader>
                        </Empty>
                      )}
                </>
              )}
            </div>
          </ScrollArea>
        </Card>

        <Card className="panel-card h-fit" data-testid="card-services-summary">
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
                value={String(filtered.length)}
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
          </div>
        </Card>
      </div>

      <ServiceDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        mode={dialogMode}
        initialData={selectedService}
        onSave={async (svc) => {
          setPendingService(svc);
          setIsDialogOpen(false);

          try {
            if (dialogMode === "create") {
              await orm.insert(servicesTable).values(svc);
              await logAction(orm, {
                action: `Novo serviço criado: ${svc.type}`,
                module: "Serviços",
                device:
                  connectedPeers.find((p) => p.id === myId)?.ip || undefined,
              });
              toast({
                variant: "success",
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
                variant: "success",
                title: "Serviço atualizado",
                description: `As informações do serviço ${svc.type} foram atualizadas.`,
              });
            }
          } finally {
            setTimeout(() => {
              setPendingService(null);
              setSelectedService(null);
            }, 500);
          }
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

  const { data: rawClients } = useLocalQuery<{ id: string; name: string }>(
    db,
    clientsQuery,
  );
  const clients = useMemo(() => rawClients || [], [rawClients]);

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
      <DialogContent 
        data-testid="dialog-new-service"
        className="max-h-[85vh] overflow-y-auto max-w-2xl"
      >
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
          className="grid gap-3"
          data-testid="form-new-service"
        >
          {/* TIER 1: CORE FIELDS */}
          <div className="grid gap-1.5" data-testid="field-service-client">
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

          <div className="grid gap-3 sm:grid-cols-3">
            <div
              className="grid gap-1.5 sm:col-span-2"
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

            <div className="grid gap-1.5" data-testid="field-service-price">
              <Label htmlFor="service-price">Valor Base</Label>
              <ClickToCopy
                enabled={isView}
                value={form.watch("price")}
                label="Valor Base"
              >
                <Input
                  disabled={isView}
                  id="service-price"
                  type="number"
                  {...form.register("price", { valueAsNumber: true })}
                  inputMode="decimal"
                  data-testid="input-service-price"
                  className={isView ? "pointer-events-none" : ""}
                />
              </ClickToCopy>
            </div>
          </div>

          <div className="grid gap-1.5" data-testid="field-service-desc">
            <Label htmlFor="service-description">Descrição Resumida</Label>
            <Popover open={openDesc} onOpenChange={setOpenDesc}>
              <PopoverTrigger asChild>
                <ClickToCopy
                  enabled={isView}
                  value={form.watch("description")}
                  label="Descrição"
                >
                  <Button
                    id="service-description"
                    type="button"
                    variant="outline"
                    role="combobox"
                    disabled={isView}
                    aria-expanded={openDesc}
                    className={cn(
                      "w-full justify-between font-normal",
                      !form.watch("description") && "text-muted-foreground",
                      isView && "pointer-events-none",
                    )}
                  >
                    {form.watch("description") ||
                      "Notas rápidas sobre a entrega"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </ClickToCopy>
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

          <Accordion
            type="single"
            collapsible
            defaultValue="additional"
            className="w-full space-y-4"
          >
            <AccordionItem 
              value="additional" 
              className="border rounded-md px-4 py-2 bg-muted/20"
            >
              <AccordionTrigger className="hover:no-underline py-2 text-sm font-semibold">
                Status & Contrato
              </AccordionTrigger>
              <AccordionContent className="pt-2 pb-4 space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div
                    className="grid gap-1.5"
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
                    className="grid gap-1.5"
                    data-testid="field-service-contract-date"
                  >
                    <Label htmlFor="service-contract-date">
                      Data de Contrato
                    </Label>
                    <ClickToCopy
                      enabled={isView}
                      value={form.watch("contract_date")}
                      label="Data do Contrato"
                    >
                      <Input
                        id="service-contract-date"
                        type="date"
                        {...form.register("contract_date")}
                        disabled={isView}
                        className={isView ? "pointer-events-none" : ""}
                      />
                    </ClickToCopy>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div
                    className="grid gap-1.5"
                    data-testid="field-service-final-date"
                  >
                    <Label htmlFor="service-final-date">Data de Entrega</Label>
                    <ClickToCopy
                      enabled={isView}
                      value={form.watch("final_date")}
                      label="Data de Entrega"
                    >
                      <Input
                        id="service-final-date"
                        type="date"
                        {...form.register("final_date")}
                        disabled={isView}
                        className={isView ? "pointer-events-none" : ""}
                      />
                    </ClickToCopy>
                  </div>
                  <div
                    className="grid gap-1.5"
                    data-testid="field-service-payment-date"
                  >
                    <Label htmlFor="service-payment-date">
                      Data de Pagamento
                    </Label>
                    <ClickToCopy
                      enabled={isView}
                      value={form.watch("payment_date")}
                      label="Data de Pagamento"
                    >
                      <Input
                        id="service-payment-date"
                        type="date"
                        {...form.register("payment_date")}
                        disabled={isView}
                        className={isView ? "pointer-events-none" : ""}
                      />
                    </ClickToCopy>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem 
              value="advanced" 
              className="border rounded-md px-4 py-2 bg-muted/20"
            >
              <AccordionTrigger className="hover:no-underline py-2 text-sm font-semibold">
                Dados Financeiros e Prazos
              </AccordionTrigger>
              <AccordionContent className="pt-2 pb-4 space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div
                    className="grid gap-1.5"
                    data-testid="field-service-payment-method"
                  >
                    <Label htmlFor="service-payment-method">
                      Método de Pagamento
                    </Label>
                    <ClickToCopy
                      enabled={isView}
                      value={form.watch("payment_method")}
                      label="Meio de Pagamento"
                    >
                      <Input
                        id="service-payment-method"
                        {...form.register("payment_method")}
                        placeholder="Ex: Pix, Cartão…"
                        disabled={isView}
                        className={isView ? "pointer-events-none" : ""}
                      />
                    </ClickToCopy>
                  </div>
                  <div
                    className="grid gap-1.5"
                    data-testid="field-service-installments"
                  >
                    <Label htmlFor="service-installments">Nº de Parcelas</Label>
                    <ClickToCopy
                      enabled={isView}
                      value={form.watch("installments")}
                      label="Parcelas"
                    >
                      <Input
                        id="service-installments"
                        type="number"
                        {...form.register("installments", {
                          valueAsNumber: true,
                        })}
                        disabled={isView}
                        className={isView ? "pointer-events-none" : ""}
                      />
                    </ClickToCopy>
                  </div>
                </div>

                <div
                  className="grid gap-1.5"
                  data-testid="field-service-observations"
                >
                  <Label htmlFor="service-observations">
                    Observações Livres
                  </Label>
                  <ClickToCopy
                    enabled={isView}
                    value={form.watch("observations")}
                    label="Observações"
                  >
                    <Input
                      id="service-observations"
                      {...form.register("observations")}
                      placeholder="Notas internas…"
                      disabled={isView}
                      className={isView ? "pointer-events-none" : ""}
                    />
                  </ClickToCopy>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

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
                {form.formState.isSubmitting && (
                  <Spinner className="mr-2 h-4 w-4" />
                )}
                {mode === "create" ? "Criar serviço" : "Atualizar serviço"}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ServiceSkeleton() {
  return (
    <div className="flex items-center justify-between gap-4 p-4">
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-64" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>
    </div>
  );
}
