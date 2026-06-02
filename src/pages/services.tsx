import { useMemo, useState } from "react";
import { Plus, Search, Lock, LockOpen, Wind } from "lucide-react";
import { Card } from "@/components/ui/card";
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AppShell,
  currency,
  InfiniteList,
  DebouncedSearch,
} from "@/components/panel/panel-kit";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { v7 as uuidv7 } from "uuid";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn, normalizeString } from "@/lib/utils";

import { useDb } from "@/db/context";
import { useSync } from "@/db/sync-context";
import { useLocalQuery } from "@/hooks/useLocalQuery";
import {
  servicesTable,
  clientsTable,
  paymentsTable,
  serviceTypesArray,
  tagsTable,
  serviceTagsTable,
} from "@/db/schema";
import { and, desc, eq, sql, isNotNull, ne, not, inArray } from "drizzle-orm";

import { logAction } from "@/lib/logger";
import { useToast } from "@/hooks/use-toast";

// New abstracted components
import { SummaryRow } from "@/components/service/summary-row";
import {
  ServiceDialog,
  type ServiceStatus,
} from "@/components/service/service-dialog";
import { FinancialDialog } from "@/components/service/financial-dialog";
import { ServiceListItem } from "@/components/service/service-list-item";

export default function ServicesPage() {
  const { db, orm } = useDb();
  const { myId, connectedPeers } = useSync();
  const { toast } = useToast();
  const [isUnlocked, setIsUnlocked] = useState(
    () => sessionStorage.getItem("isUnlocked") === "true",
  );
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);

  const handleUnlock = () => {
    const envPassword = import.meta.env.VITE_DASHBOARD_PASSWORD || "admin";
    if (passwordInput === envPassword) {
      setIsUnlocked(true);
      sessionStorage.setItem("isUnlocked", "true");
      setIsPasswordDialogOpen(false);
      setPasswordError(false);
    } else {
      setPasswordError(true);
    }
    setPasswordInput("");
  };

  const handleToggleLock = () => {
    if (isUnlocked) {
      setIsUnlocked(false);
      sessionStorage.setItem("isUnlocked", "false");
    } else {
      setIsPasswordDialogOpen(true);
    }
  };
  const STATUS = ["Draft", "In progress", "Delivered"];

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | ServiceStatus>("all");
  const [paymentStatus, setPaymentStatus] = useState<
    "all" | "paid" | "pending"
  >("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [restitutionDate, setRestitutionDate] = useState<string>("");

  const [selectedService, setSelectedService] = useState<any | null>(null);
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | "view">(
    "create",
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const [isFinancialDialogOpen, setIsFinancialDialogOpen] = useState(false);
  const [financialService, setFinancialService] = useState<any | null>(null);

  const servicesQuery = useMemo(() => {
    return orm
      .select({
        id: servicesTable.id,
        type: servicesTable.type,
        description: servicesTable.description,
        client_id: servicesTable.client_id,
        status: servicesTable.status,
        contract_date: servicesTable.contract_date,
        price: servicesTable.price,
        final_date: servicesTable.final_date,
        restitution_date: servicesTable.restitution_date,
        payment_method: servicesTable.payment_method,
        installments: servicesTable.installments,
        observations: servicesTable.observations,
        client_name: sql<string>`${clientsTable.name}`.as("client_name"),
        total_paid: sql<number>`COALESCE(SUM(${paymentsTable.amount}), 0)`.as(
          "total_paid",
        ),
      })
      .from(servicesTable)
      .leftJoin(clientsTable, eq(servicesTable.client_id, clientsTable.id))
      .leftJoin(paymentsTable, eq(servicesTable.id, paymentsTable.service_id))
      .groupBy(servicesTable.id)
      .orderBy(desc(servicesTable.contract_date))
      .toSQL();
  }, [orm]);

  const { data: rawServices, loading: servicesLoading } = useLocalQuery<any>(
    db,
    servicesQuery,
  );
  const services = useMemo(() => rawServices || [], [rawServices]);

  // Load all tags
  const tagsQuery = useMemo(() => {
    return orm.select().from(tagsTable).toSQL();
  }, [orm]);
  const { data: rawTags, loading: tagsLoading } = useLocalQuery<any>(
    db,
    tagsQuery,
  );
  const allTags = useMemo(() => rawTags || [], [rawTags]);

  // Load all service_tags mappings
  const serviceTagsQuery = useMemo(() => {
    return orm.select().from(serviceTagsTable).toSQL();
  }, [orm]);
  const { data: rawServiceTags } = useLocalQuery<any>(db, serviceTagsQuery);

  // Build a map: service_id -> tag_id[]
  const serviceTagsMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    if (rawServiceTags) {
      for (const st of rawServiceTags) {
        if (!map[st.service_id]) map[st.service_id] = [];
        map[st.service_id].push(st.tag_id);
      }
    }
    return map;
  }, [rawServiceTags]);

  // Build a map: tag_id -> Tag
  const tagsMap = useMemo(() => {
    const map: Record<string, any> = {};
    for (const t of allTags) {
      map[t.id] = t;
    }
    return map;
  }, [allTags]);

  const filtered = useMemo(() => {
    const search = normalizeString(q.trim());
    return services.filter((s) => {
      // Status filter
      if (status !== "all" && s.status !== status) return false;

      // Payment filter
      const isPaid =
        (s.total_paid || 0) >= (s.price || 0) && (s.price || 0) > 0;
      if (paymentStatus === "paid" && !isPaid) return false;
      if (paymentStatus === "pending" && isPaid) return false;

      // Type filter
      if (selectedType !== "all" && s.type !== selectedType) {
        return false;
      }

      // Tag filter
      if (selectedTagIds.length > 0) {
        const sTagIds = serviceTagsMap[s.id] || [];
        if (!selectedTagIds.some((tid) => sTagIds.includes(tid))) {
          return false;
        }
      }

      // Period filter
      if (dateFrom) {
        const from = new Date(dateFrom).getTime();
        if (s.contract_date < from) return false;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        if (s.contract_date > to.getTime()) return false;
      }

      // Restitution Date filter
      if (restitutionDate) {
        if (!s.restitution_date) return false;
        const targetDate = new Date(restitutionDate);
        const sDate = new Date(s.restitution_date);
        if (
          targetDate.getFullYear() !== sDate.getFullYear() ||
          targetDate.getMonth() !== sDate.getMonth() ||
          targetDate.getDate() !== sDate.getDate()
        ) {
          return false;
        }
      }

      // Search filter
      if (search) {
        const content = normalizeString(
          (s.client_name || "") + (s.description || ""),
        );
        if (!content.includes(search)) return false;
      }

      return true;
    });
  }, [
    services,
    q,
    status,
    paymentStatus,
    selectedType,
    selectedTagIds,
    serviceTagsMap,
    dateFrom,
    dateTo,
    restitutionDate,
  ]);

  const clientsQuery = useMemo(() => {
    return orm.select().from(clientsTable).toSQL();
  }, [orm]);
  const { data: rawClients, loading: clientsLoading } = useLocalQuery<any>(
    db,
    clientsQuery,
  );
  const clients = useMemo(() => rawClients || [], [rawClients]);

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

  const { data: rawDesc, loading: descLoading } = useLocalQuery<any>(
    db,
    descQuery,
  );
  const historicDescriptions = useMemo(() => {
    if (!rawDesc) return [];
    return rawDesc.map((d: any) => d.description);
  }, [rawDesc]);

  const loading =
    servicesLoading || clientsLoading || descLoading || tagsLoading;

  const clientsMap = useMemo(() => {
    return clients.reduce((acc: Record<string, any>, c: any) => {
      acc[c.id] = c;
      return acc;
    }, {});
  }, [clients]);

  const totalRevenue = useMemo(() => {
    return filtered.reduce(
      (acc: number, s: any) => acc + (s.total_paid || 0),
      0,
    );
  }, [filtered]);

  const totalToReceive = useMemo(() => {
    return filtered
      .filter((s: any) => s.status !== "Draft")
      .reduce((acc: number, s: any) => {
        const balance = s.price - (s.total_paid || 0);
        return acc + (balance > 0 ? balance : 0);
      }, 0);
  }, [filtered]);

  const handleGarbageCollector = async () => {
    // Silent cleanup of orphaned payments using ORM for consistency and safety
    await orm
      .delete(paymentsTable)
      .where(
        not(
          inArray(
            paymentsTable.service_id,
            orm.select({ id: servicesTable.id }).from(servicesTable),
          ),
        ),
      );
  };

  const handleDelete = async () => {
    if (!selectedService) return;
    const { id, type } = selectedService;
    await orm.delete(paymentsTable).where(eq(paymentsTable.service_id, id));
    await orm
      .delete(serviceTagsTable)
      .where(eq(serviceTagsTable.service_id, id));
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

  const openFinancialDialog = (service: any) => {
    setFinancialService(service);
    setIsFinancialDialogOpen(true);
  };

  return (
    <>
      <AppShell
        title="Serviços"
        subtitle="Acompanhe entregas e renda."
        right={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handleToggleLock}
              className={cn(
                "rounded-xl",
                isUnlocked ? "text-emerald-500" : "text-muted-foreground",
              )}
              title={isUnlocked ? "Bloquear visão" : "Desbloquear visão"}
            >
              {isUnlocked ? (
                <LockOpen className="h-4 w-4" />
              ) : (
                <Lock className="h-4 w-4" />
              )}
            </Button>

            <Button
              variant="outline"
              size="icon"
              onClick={handleGarbageCollector}
              className="rounded-xl text-muted-foreground hover:text-amber-500"
              title="Limpar resíduos"
            >
              <Wind className="h-4 w-4" />
            </Button>

            <Button
              onClick={() => openDialog("create")}
              className="gap-2 cursor-pointer"
              data-testid="button-new-service-top"
            >
              <Plus className="h-4 w-4" />
              Novo serviço
            </Button>
          </div>
        }
      >
        <div
          className="flex-1 grid gap-4 lg:grid-cols-3 min-h-0"
          data-testid="grid-services"
        >
          <Card
            className="panel-card flex flex-col min-h-0 lg:col-span-2"
            data-testid="card-services"
          >
            <div className="p-4 space-y-3" data-testid="bar-services-controls">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div
                  className="relative flex-1"
                  data-testid="wrap-service-search"
                >
                  <DebouncedSearch
                    onSearch={setQ}
                    placeholder="Buscar por cliente ou descrição…"
                    className="pl-9"
                    data-testid="input-service-search"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Select
                    value={status}
                    onValueChange={(v) => setStatus(v as any)}
                  >
                    <SelectTrigger
                      className="w-35"
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
                          Inactive: "Inativo",
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

                  {(status !== "all" ||
                    paymentStatus !== "all" ||
                    selectedType !== "all" ||
                    selectedTagIds.length > 0 ||
                    dateFrom ||
                    dateTo ||
                    restitutionDate) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setStatus("all");
                        setPaymentStatus("all");
                        setSelectedType("all");
                        setSelectedTagIds([]);
                        setDateFrom("");
                        setDateTo("");
                        setRestitutionDate("");
                      }}
                      className="h-8 px-2 text-xs text-muted-foreground hover:text-primary"
                    >
                      Limpar
                    </Button>
                  )}
                </div>
              </div>

              <Accordion
                type="single"
                collapsible
                className="w-full border-none"
              >
                <AccordionItem value="filters" className="border-none">
                  <AccordionTrigger className="py-0 h-6 text-xs text-muted-foreground hover:no-underline justify-end gap-2">
                    Mais filtros
                  </AccordionTrigger>
                  <AccordionContent className="pt-3 pb-1 px-0.5">
                    <div
                      className="flex flex-wrap items-center gap-3"
                      data-testid="wrap-service-advanced-filters"
                    >
                      <div className="grid gap-1.5">
                        <Label className="text-[11px] text-muted-foreground">
                          Pagamento
                        </Label>
                        <Select
                          value={paymentStatus}
                          onValueChange={(v) => setPaymentStatus(v as any)}
                        >
                          <SelectTrigger
                            className="w-40 h-9"
                            data-testid="select-service-payment"
                          >
                            <SelectValue placeholder="Pagamento" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos</SelectItem>
                            <SelectItem value="paid">Faturado</SelectItem>
                            <SelectItem value="pending">Pendente</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid gap-1.5">
                        <Label className="text-[11px] text-muted-foreground">
                          Tipo de serviço
                        </Label>
                        <Select
                          value={selectedType}
                          onValueChange={setSelectedType}
                        >
                          <SelectTrigger
                            className="w-60 h-9"
                            data-testid="select-service-type"
                          >
                            <SelectValue placeholder="Tipo de serviço" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos os tipos</SelectItem>
                            {serviceTypesArray.map((t) => (
                              <SelectItem key={t} value={t}>
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid gap-1.5">
                        <Label className="text-[11px] text-muted-foreground">
                          Período (Contrato)
                        </Label>
                        <div className="flex items-center gap-1">
                          <Input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="w-38.75 h-9 text-sm"
                            title="Data inicial"
                          />
                          <span className="text-muted-foreground text-xs">
                            -
                          </span>
                          <Input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="w-38.75 h-9 text-sm"
                            title="Data final"
                          />
                        </div>
                      </div>

                      <div className="grid gap-1.5">
                        <Label className="text-[11px] text-muted-foreground">
                          Data de Restituição
                        </Label>
                        <Input
                          type="date"
                          value={restitutionDate}
                          onChange={(e) => setRestitutionDate(e.target.value)}
                          className="w-38.75 h-9 text-sm"
                          title="Data de restituição"
                        />
                      </div>

                      <div className="grid gap-1.5">
                        <Label className="text-[11px] text-muted-foreground">
                          Etiquetas
                        </Label>
                        <div className="flex flex-wrap gap-1.5">
                          {allTags.map((tag: any) => {
                            const isSelected = selectedTagIds.includes(tag.id);
                            return (
                              <button
                                key={tag.id}
                                type="button"
                                onClick={() => {
                                  setSelectedTagIds((prev) =>
                                    isSelected
                                      ? prev.filter((id) => id !== tag.id)
                                      : [...prev, tag.id],
                                  );
                                }}
                                className={cn(
                                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-all cursor-pointer",
                                  isSelected
                                    ? "text-white border-transparent"
                                    : "bg-transparent border-border text-muted-foreground hover:border-foreground/30",
                                )}
                                style={
                                  isSelected
                                    ? { backgroundColor: tag.color }
                                    : undefined
                                }
                                data-testid={`filter-tag-${tag.id}`}
                              >
                                <span
                                  className="h-2 w-2 rounded-full shrink-0"
                                  style={{ backgroundColor: tag.color }}
                                />
                                {tag.name}
                              </button>
                            );
                          })}
                          {allTags.length === 0 && (
                            <span className="text-xs text-muted-foreground">
                              Nenhuma etiqueta criada
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
            <ScrollArea className="flex-1 pr-4">
              <div className="divide-y" data-testid="list-services">
                <InfiniteList
                  data={filtered}
                  loading={loading}
                  emptyState={
                    <Empty className="py-12">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Search className="size-6" />
                        </EmptyMedia>
                        <EmptyTitle>Nenhum serviço encontrado</EmptyTitle>
                        <EmptyDescription>
                          Tente ajustar sua busca ou filtros para encontrar o
                          que procura.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  }
                  renderItem={(s) => (
                    <ServiceListItem
                      key={s.id}
                      service={s}
                      clientName={
                        clientsMap[s.client_id]?.name || "Desconhecido"
                      }
                      tags={(serviceTagsMap[s.id] || [])
                        .map((tid: string) => tagsMap[tid])
                        .filter(Boolean)}
                      onView={(s) => openDialog("view", s)}
                      onFinancial={(s) => openFinancialDialog(s)}
                      onEdit={(s) => openDialog("edit", s)}
                      onDelete={(s) => {
                        setSelectedService(s);
                        setIsDeleteDialogOpen(true);
                      }}
                    />
                  )}
                />
              </div>
            </ScrollArea>
          </Card>

          <Card
            className="panel-card h-fit"
            data-testid="card-services-summary"
          >
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
                  value={isUnlocked ? currency(totalRevenue) : "••••••"}
                  testId="income"
                />
                <SummaryRow
                  label="A receber"
                  value={isUnlocked ? currency(totalToReceive) : "••••••"}
                  testId="to-receive"
                />
              </div>
            </div>
          </Card>
        </div>

        <FinancialDialog
          open={isFinancialDialogOpen}
          onOpenChange={setIsFinancialDialogOpen}
          service={financialService}
        />

        <ServiceDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          mode={dialogMode}
          initialData={selectedService}
          clients={clients}
          historicDescriptions={historicDescriptions}
          allTags={allTags}
          onFinancialAction={openFinancialDialog}
          onSave={async (svc, tagsData, paymentData) => {
            const now = new Date();
            // 1. Persist the service
            if (dialogMode === "create") {
              await orm.insert(servicesTable).values(svc);
              await logAction(orm, {
                action: `Novo serviço criado: ${svc.type}`,
                module: "Serviços",
                status: "Success",
                device:
                  connectedPeers.find((p) => p.id === myId)?.ip || undefined,
              });
              toast({
                title: "Serviço criado",
                description: `O serviço foi registrado com sucesso.`,
              });
            } else if (dialogMode === "edit" || dialogMode === "view") {
              await orm
                .update(servicesTable)
                .set(svc)
                .where(eq(servicesTable.id, svc.id));
              await logAction(orm, {
                action: `Serviço atualizado: ${svc.type}`,
                module: "Serviços",
                status: "Success",
                device:
                  connectedPeers.find((p) => p.id === myId)?.ip || undefined,
              });
              toast({
                title: "Serviço atualizado",
                description: `As alterações foram salvas.`,
              });
            }

            // 2. Persist new tags
            for (const tag of tagsData.pendingTags) {
              await orm.insert(tagsTable).values({
                id: tag.id,
                name: tag.name,
                color: tag.color,
                created_at: now,
              });
            }

            // 3. Persist tag associations
            const oldTagIds = new Set(tagsData.initialTagIds);
            const newTagIds = new Set(tagsData.selectedTagIds);

            for (const tagId of oldTagIds) {
              if (!newTagIds.has(tagId as string)) {
                await orm
                  .delete(serviceTagsTable)
                  .where(
                    sql`${serviceTagsTable.service_id} = ${svc.id} AND ${serviceTagsTable.tag_id} = ${tagId}`,
                  );
              }
            }
            for (const tagId of newTagIds) {
              if (!oldTagIds.has(tagId)) {
                await orm
                  .insert(serviceTagsTable)
                  .values({ service_id: svc.id, tag_id: tagId });
              }
            }

            // 4. Persist payment
            if (paymentData) {
              await orm.insert(paymentsTable).values({
                id: uuidv7(),
                service_id: svc.id,
                amount: paymentData.amount,
                payment_type: paymentData.type as any,
                payment_date: paymentData.date,
                created_at: now,
                updated_at: now,
              });
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

      <Dialog
        open={isPasswordDialogOpen}
        onOpenChange={setIsPasswordDialogOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Desbloquear Valores</DialogTitle>
            <DialogDescription>
              Insira a senha de administrador para visualizar as métricas de
              preços e pagamentos.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleUnlock();
                }}
                className={
                  passwordError
                    ? "border-destructive focus-visible:ring-destructive"
                    : ""
                }
                autoFocus
              />
              {passwordError && (
                <p className="text-xs text-destructive font-medium animate-pulse">
                  Senha incorreta. Verifique suas configurações.
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="sm:justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsPasswordDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={handleUnlock}>
              Desbloquear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
