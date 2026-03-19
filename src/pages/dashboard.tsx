import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  addDays,
  endOfDay,
  format,
  isWithinInterval,
  isSameDay,
  startOfDay,
} from "date-fns";
import {
  ArrowUpRight,
  BadgeDollarSign,
  CalendarClock,
  ChevronRight,
  Layers,
  Settings,
  Users,
  Lock,
  LockOpen,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  AppShell,
  StatCard,
  TableCard,
  StatusBadge,
  currency,
} from "@/components/panel/panel-kit";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDb } from "@/db/context";
import { useLocalQuery } from "@/hooks/useLocalQuery";
import { clientsTable, servicesTable, paymentsTable } from "@/db/schema";
import { eq, sql, desc } from "drizzle-orm";

const PERIODS = [
  { id: "7d", label: "Últimos 7 dias", days: 7 },
  { id: "30d", label: "Últimos 30 dias", days: 30 },
  { id: "90d", label: "Últimos 90 dias", days: 90 },
] as const;

type PeriodId = (typeof PERIODS)[number]["id"];

export default function Dashboard() {
  const { db, orm } = useDb();

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
        client_name: sql<string>`${clientsTable.name}`.as("client_name"),
      })
      .from(servicesTable)
      .innerJoin(clientsTable, eq(servicesTable.client_id, clientsTable.id))
      .toSQL();
  }, [orm]);
  const { data: servicesRaw, loading: servicesLoading } = useLocalQuery<any>(
    db,
    servicesQuery,
  );
  const services = useMemo(() => servicesRaw || [], [servicesRaw]);

  const clientsQuery = useMemo(() => {
    return orm.select().from(clientsTable).toSQL();
  }, [orm]);
  const { data: clientsRaw, loading: clientsLoading } = useLocalQuery<any>(
    db,
    clientsQuery,
  );
  const clients = useMemo(() => clientsRaw || [], [clientsRaw]);

  const paymentsQuery = useMemo(() => {
    return orm
      .select()
      .from(paymentsTable)
      .orderBy(desc(paymentsTable.payment_date))
      .toSQL();
  }, [orm]);
  const { data: paymentsRaw, loading: paymentsLoading } = useLocalQuery<any>(
    db,
    paymentsQuery,
  );
  const payments = useMemo(() => paymentsRaw || [], [paymentsRaw]);

  const loading = servicesLoading || clientsLoading || paymentsLoading;

  const [period, setPeriod] = useState<PeriodId>("30d");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);

  const handleUnlock = () => {
    // Basic password for now
    const envPassword = import.meta.env.VITE_DASHBOARD_PASSWORD || "admin";
    if (passwordInput === envPassword) {
      setIsUnlocked(true);
      setIsPasswordDialogOpen(false);
      setPasswordError(false);
    } else {
      setPasswordError(true);
    }
    setPasswordInput("");
  };

  const data = useMemo(() => {
    const selected = PERIODS.find((p) => p.id === period) ?? PERIODS[1];
    const end = endOfDay(new Date());
    const start = startOfDay(addDays(new Date(), -selected.days + 1));

    const servicesInRange = services.filter((s: any) => {
      const d = startOfDay(new Date(s.contract_date));
      return isWithinInterval(d, { start, end });
    });

    const paymentsInRange = payments.filter((p) => {
      const d = startOfDay(new Date(p.payment_date));
      return isWithinInterval(d, { start, end });
    });

    const revenue = paymentsInRange.reduce((acc, p) => acc + p.amount, 0);

    const toReceive = services.reduce((acc, s) => {
      const paidForSvc = payments
        .filter((p) => p.service_id === s.id)
        .reduce((sum, p) => sum + p.amount, 0);
      const balance = s.price - paidForSvc;
      return acc + (balance > 0 ? balance : 0);
    }, 0);

    const chart = Array.from({ length: selected.days }, (_, i) => {
      const d = addDays(start, i);

      const revenueDay = paymentsInRange
        .filter((p) => isSameDay(new Date(p.payment_date), d))
        .reduce((acc, p) => acc + p.amount, 0);
      return {
        day: format(d, "MMM d"),
        revenue: Math.round(revenueDay),
      };
    });

    return {
      clients,
      services,
      servicesInRange,
      revenue,
      toReceive,
      rangeLabel: `${format(start, "MMM d")} – ${format(end, "MMM d")}`,
      chart,
    };
  }, [period, clients, services, payments]);

  const recent = useMemo(() => {
    const list = [...data.services]
      .filter((s) => s.status === "Delivered")
      .sort((a, b) => (a.contract_date < b.contract_date ? 1 : -1));
    return list.slice(0, 6);
  }, [data.services]);

  return (
    <>
      <AppShell
        title="Painel de Controle"
        subtitle="Área administrativa limpa para clientes, serviços e renda."
        right={
          <div
            className="flex items-center gap-2"
            data-testid="group-dashboard-actions"
          >
            <Button
              variant="outline"
              size="icon"
              onClick={
                isUnlocked
                  ? () => setIsUnlocked(false)
                  : () => setIsPasswordDialogOpen(true)
              }
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

            <Select
              value={period}
              onValueChange={(v) => setPeriod(v as PeriodId)}
            >
              <SelectTrigger
                className="w-[170px]"
                data-testid="select-period"
                aria-label="Selecionar período"
              >
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => (
                  <SelectItem
                    key={p.id}
                    value={p.id}
                    data-testid={`option-period-${p.id}`}
                  >
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              asChild
              variant="outline"
              size="icon"
              data-testid="button-go-settings"
              className="rounded-xl lg:hidden"
            >
              <Link href="/settings">
                <Settings className="h-4 w-4" />
              </Link>
            </Button>

            <Button
              asChild
              data-testid="button-view-services"
              className="gap-2 lg:hidden"
            >
              <Link href="/services">
                Ver serviços <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        }
      >
        <ScrollArea className="flex-1 pr-4">
          <div className="relative">
            <div className="pointer-events-none absolute inset-0 rounded-3xl subtle-grid" />

            <div
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
              data-testid="grid-stats"
            >
              <StatCard
                label="Clientes"
                value={data.clients.filter((c) => c.status === "Active").length}
                hint="Ativos no sistema"
                icon={<Users className="h-4 w-4" />}
                dataTestId="stat-clients"
                loading={loading}
              />
              <StatCard
                label="Serviços"
                value={
                  data.servicesInRange.filter((s) => s.status !== "Draft")
                    .length
                }
                hint={data.rangeLabel}
                icon={<Layers className="h-4 w-4" />}
                dataTestId="stat-services"
                loading={loading}
              />
              <StatCard
                label="Receita"
                value={isUnlocked ? currency(data.revenue) : "••••••"}
                hint={data.rangeLabel}
                icon={<BadgeDollarSign className="h-4 w-4" />}
                dataTestId="stat-income"
                loading={loading}
                className={!isUnlocked ? "opacity-60" : ""}
              />
              <StatCard
                label="A Receber"
                value={currency(data.toReceive)}
                hint="Saldo total pendente"
                icon={<CalendarClock className="h-4 w-4" />}
                dataTestId="stat-receivables"
                loading={loading}
              />
            </div>

            <div
              className="mt-4 grid gap-4 lg:grid-cols-3"
              data-testid="grid-main"
            >
              <Card
                className="panel-card hover-lift lg:col-span-2 min-w-0 overflow-hidden"
                data-testid="card-chart"
              >
                <div className="flex items-start justify-between gap-4 p-5">
                  <div>
                    <div
                      className="text-sm font-medium text-muted-foreground"
                      data-testid="text-chart-title"
                    >
                      Acompanhamento de renda
                    </div>
                    <div
                      className="mt-1 text-2xl font-semibold tracking-tight"
                      data-testid="text-chart-range"
                    >
                      {data.rangeLabel}
                    </div>
                    <div
                      className="mt-2 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground"
                      data-testid="pill-chart-note"
                    >
                      <CalendarClock className="h-3.5 w-3.5" />
                      Atualizado hoje
                    </div>
                  </div>
                  <div
                    className="flex items-center gap-2"
                    data-testid="legend-chart"
                  >
                    <Badge
                      variant="secondary"
                      className="gap-1"
                      data-testid="badge-income"
                    >
                      <span className="h-2 w-2 rounded-full bg-[hsl(var(--chart-1))]" />
                      Renda
                    </Badge>
                  </div>
                </div>

                <div className="px-3 pb-4 relative" data-testid="chart-wrapper">
                  {loading ? (
                    <div className="flex h-[260px] w-full items-end gap-2 px-2 pb-6">
                      {Array.from({ length: 12 }).map((_, i) => (
                        <Skeleton
                          key={i}
                          className="flex-1"
                          style={{ height: `${Math.random() * 60 + 20}%` }}
                        />
                      ))}
                    </div>
                  ) : (
                    <ChartContainer
                      config={{
                        revenue: {
                          label: "Income",
                          color: "hsl(var(--chart-1))",
                        },
                      }}
                      className="h-[260px] w-full"
                    >
                      <AreaChart
                        data={data.chart}
                        margin={{ left: 6, right: 10, top: 10, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="hsl(var(--border))"
                        />
                        <XAxis
                          dataKey="day"
                          tickLine={false}
                          axisLine={false}
                          fontSize={12}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          fontSize={12}
                          width={34}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Area
                          type="monotone"
                          dataKey="revenue"
                          stroke="hsl(var(--chart-1))"
                          fill="hsl(var(--chart-1) / 0.12)"
                          strokeWidth={2}
                          dot={false}
                        />
                      </AreaChart>
                    </ChartContainer>
                  )}

                  {!isUnlocked && !loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/40 backdrop-blur-md z-10">
                      <div className="flex flex-col items-center gap-2 text-center">
                        <div className="rounded-full bg-primary/10 p-3">
                          <Lock className="h-6 w-6 text-primary" />
                        </div>
                        <div className="text-sm font-medium">
                          CONTEÚDO BLOQUEADO
                        </div>
                        <p className="px-6 text-xs text-muted-foreground">
                          Clique no cadeado no topo para visualizar os dados
                          financeiros.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </Card>

              <TableCard
                title="Serviços recentes"
                className="min-w-0"
                description="Últimos trabalhos entregues"
                action={
                  <Button
                    variant="secondary"
                    asChild
                    data-testid="button-open-services"
                    className="gap-1"
                  >
                    <Link href="/services">
                      Abrir <ChevronRight className="h-4 w-4" />
                    </Link>
                  </Button>
                }
                dataTestId="card-recent"
              >
                <div className="divide-y" data-testid="list-recent-services">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-4 p-4"
                      >
                        <div className="min-w-0 space-y-2">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-48" />
                        </div>
                        <Skeleton className="h-5 w-16" />
                      </div>
                    ))
                  ) : recent.length > 0 ? (
                    recent.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between gap-4 p-4"
                        data-testid={`row-recent-service-${s.id}`}
                      >
                        <div className="min-w-0">
                          <div
                            className="truncate text-sm font-medium"
                            data-testid={`text-service-name-${s.id}`}
                          >
                            {s.type} {s.description && `- ${s.description}`}
                          </div>
                          <div
                            className="mt-0.5 truncate text-xs text-muted-foreground"
                            data-testid={`text-service-meta-${s.id}`}
                          >
                            {s.client_name} &middot;{" "}
                            {format(new Date(s.contract_date), "MMM d, yyyy")}
                          </div>
                        </div>
                        <div className="text-right">
                          <div
                            className="text-sm font-semibold"
                            data-testid={`text-service-price-${s.id}`}
                          >
                            {currency(s.price)}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      Nenhum serviço recente encontrado.
                    </div>
                  )}
                </div>
              </TableCard>
            </div>

            <div
              className="mt-4 grid gap-4 md:grid-cols-2"
              data-testid="grid-quick"
            >
              <Card
                className="panel-card hover-lift"
                data-testid="card-quick-clients"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div
                        className="text-sm font-medium text-muted-foreground"
                        data-testid="text-quick-clients-title"
                      >
                        Lista de clientes
                      </div>
                      <div
                        className="mt-1 text-xl font-semibold tracking-tight"
                        data-testid="text-quick-clients-subtitle"
                      >
                        Contatos organizados
                      </div>
                      <div
                        className="mt-2 text-sm text-muted-foreground"
                        data-testid="text-quick-clients-desc"
                      >
                        Status de forma rápida.
                      </div>
                    </div>
                    <div
                      className="rounded-2xl border bg-card p-3"
                      data-testid="iconbox-clients"
                    >
                      <Users className="h-5 w-5" />
                    </div>
                  </div>

                  <div
                    className="mt-4 grid gap-2"
                    data-testid="list-quick-clients"
                  >
                    {data.clients.slice(0, 3).map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between rounded-xl border bg-card px-3 py-2"
                        data-testid={`row-quick-client-${c.id}`}
                      >
                        <div className="min-w-0">
                          <div
                            className="truncate text-sm font-medium"
                            data-testid={`text-quick-client-name-${c.id}`}
                          >
                            {c.name}
                          </div>
                          <div
                            className="truncate text-xs text-muted-foreground"
                            data-testid={`text-quick-client-company-${c.id}`}
                          >
                            {c.observations || "Individual"}
                          </div>
                        </div>
                        <div className="shrink-0">
                          <StatusBadge status={c.status} />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 lg:hidden">
                    <Button
                      asChild
                      className="gap-2"
                      data-testid="button-go-clients"
                    >
                      <Link href="/clients">
                        Gerenciar clientes <ArrowUpRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </Card>

              <Card
                className="panel-card hover-lift"
                data-testid="card-quick-services"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div
                        className="text-sm font-medium text-muted-foreground"
                        data-testid="text-quick-services-title"
                      >
                        Acompanhamento de serviços
                      </div>
                      <div
                        className="mt-1 text-xl font-semibold tracking-tight"
                        data-testid="text-quick-services-subtitle"
                      >
                        Pipeline simples de trabalho
                      </div>
                      <div
                        className="mt-2 text-sm text-muted-foreground"
                        data-testid="text-quick-services-desc"
                      >
                        Acompanhe status e entrega.
                      </div>
                    </div>
                    <div
                      className="rounded-2xl border bg-card p-3"
                      data-testid="iconbox-services"
                    >
                      <Layers className="h-5 w-5" />
                    </div>
                  </div>

                  <div
                    className="mt-4 grid gap-2"
                    data-testid="list-top-services"
                  >
                    {data.services.slice(0, 3).map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between gap-2 overflow-hidden rounded-xl border bg-card px-3 py-2"
                        data-testid={`row-top-service-${s.id}`}
                      >
                        <div className="min-w-0">
                          <div
                            className="truncate text-sm font-medium"
                            data-testid={`text-top-service-title-${s.id}`}
                          >
                            {s.type}
                          </div>
                          <div
                            className="truncate text-xs text-muted-foreground"
                            data-testid={`text-top-service-client-${s.id}`}
                          >
                            {s.client_name}
                          </div>
                        </div>
                        <div className="shrink-0">
                          <StatusBadge status={s.status} />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 lg:hidden">
                    <Button
                      asChild
                      className="gap-2"
                      data-testid="button-go-services"
                    >
                      <Link href="/services">
                        Gerenciar serviços <ArrowUpRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </ScrollArea>
      </AppShell>

      <Dialog
        open={isPasswordDialogOpen}
        onOpenChange={setIsPasswordDialogOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Desbloquear Dashboard</DialogTitle>
            <DialogDescription>
              Insira a senha de administrador para visualizar as métricas de
              renda.
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
