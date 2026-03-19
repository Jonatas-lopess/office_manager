import { useMemo, useState } from "react";
import { Plus, Search, Lock, LockOpen } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { useDb } from "@/db/context";
import { useSync } from "@/db/sync-context";
import { useLocalQuery } from "@/hooks/useLocalQuery";
import { servicesTable, clientsTable, paymentsTable } from "@/db/schema";
import { and, desc, eq, like, or, sql } from "drizzle-orm";

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
    const envPassword = import.meta.env.DASHBOARD_PASSWORD || "admin";
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

  const [selectedService, setSelectedService] = useState<any | null>(null);
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | "view">(
    "create",
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [pendingService, setPendingService] = useState<any | null>(null);

  const [isFinancialDialogOpen, setIsFinancialDialogOpen] = useState(false);
  const [financialService, setFinancialService] = useState<any | null>(null);

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
      .groupBy(servicesTable.id);

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
      // Invoiced is now automated
      if (status === ("Invoiced" as any)) {
        // This won't work perfectly via SQL status since we removed it from enum
        // but let's keep it if we can find another way, or just filter via JS.
      } else {
        conditions.push(eq(servicesTable.status, status));
      }
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
    return services.reduce(
      (acc: number, s: any) => acc + (s.total_paid || 0),
      0,
    );
  }, [services]);

  const totalToReceive = useMemo(() => {
    return services
      .filter((s: any) => s.status !== "Draft")
      .reduce((acc: number, s: any) => {
        const balance = s.price - (s.total_paid || 0);
        return acc + (balance > 0 ? balance : 0);
      }, 0);
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
            <div
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              data-testid="bar-services-controls"
            >
              <div
                className="relative flex-1"
                data-testid="wrap-service-search"
              >
                <DebouncedSearch
                  onSearch={setQ}
                  placeholder="Buscar por serviço ou cliente…"
                  className="pl-9"
                  data-testid="input-service-search"
                />
              </div>

              <div
                className="flex items-center gap-2"
                data-testid="wrap-service-filters"
              >
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as any)}
                >
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
              </div>
            </div>
            <ScrollArea className="flex-1 pr-4">
              <div className="divide-y" data-testid="list-services">
                <InfiniteList
                  data={filtered}
                  loading={loading}
                  pendingItem={pendingService}
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
                      isUnlocked={isUnlocked}
                      clientName={
                        clientsMap[s.client_id]?.name || "Cliente desconhecido"
                      }
                      onView={(service) => openDialog("view", service)}
                      onFinancial={(service) => openFinancialDialog(service)}
                      onEdit={(service) => openDialog("edit", service)}
                      onDelete={(service) => {
                        setSelectedService(service);
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
          isUnlocked={isUnlocked}
        />

        <ServiceDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          mode={dialogMode}
          initialData={selectedService}
          onFinancialAction={openFinancialDialog}
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
          isUnlocked={isUnlocked}
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
