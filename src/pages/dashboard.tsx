import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  addDays,
  format,
  isWithinInterval,
  parseISO,
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
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import {
  AppShell,
  StatCard,
  TableCard,
  StatusBadge,
  type Service,
  type Client,
  seedClients,
  seedServices,
  currency,
} from "@/components/panel/panel-kit";

const PERIODS = [
  { id: "7d", label: "Últimos 7 dias", days: 7 },
  { id: "30d", label: "Últimos 30 dias", days: 30 },
  { id: "90d", label: "Últimos 90 dias", days: 90 },
] as const;

type PeriodId = (typeof PERIODS)[number]["id"];

export default function Dashboard() {
  const [period, setPeriod] = useState<PeriodId>("30d");

  const data = useMemo(() => {
    const clients: Client[] = seedClients;
    const services: Service[] = seedServices;

    const selected = PERIODS.find((p) => p.id === period) ?? PERIODS[1];
    const end = startOfDay(new Date());
    const start = addDays(end, -selected.days + 1);

    const servicesInRange = services.filter((s) => {
      const d = startOfDay(parseISO(s.date));
      return isWithinInterval(d, { start, end });
    });

    const revenue = servicesInRange.reduce((acc, s) => acc + s.price, 0);
    const profit = revenue;

    const chart = Array.from({ length: selected.days }, (_, i) => {
      const d = addDays(start, i);
      const dayKey = format(d, "yyyy-MM-dd");
      const revenueDay = servicesInRange
        .filter((s) => s.date === dayKey)
        .reduce((acc, s) => acc + s.price, 0);
      return {
        day: format(d, "MMM d"),
        revenue: Math.round(revenueDay),
        profit: Math.round(revenueDay),
      };
    });

    return {
      clients,
      services,
      servicesInRange,
      revenue,
      profit,
      rangeLabel: `${format(start, "MMM d")} – ${format(end, "MMM d")}`,
      chart,
    };
  }, [period]);

  const recent = useMemo(() => {
    const list = [...data.services].sort((a, b) => (a.date < b.date ? 1 : -1));
    return list.slice(0, 6);
  }, [data.services]);

  return (
    <AppShell
      title="Painel de Controle"
      subtitle="Área administrativa limpa para clientes, serviços e renda."
      right={
        <div
          className="flex items-center gap-2"
          data-testid="group-dashboard-actions"
        >
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
      <div className="relative">
        <div className="pointer-events-none absolute inset-0 rounded-3xl subtle-grid" />

        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          data-testid="grid-stats"
        >
          <StatCard
            label="Clientes"
            value={data.clients.length}
            hint="Ativos no sistema"
            icon={<Users className="h-4 w-4" />}
            dataTestId="stat-clients"
          />
          <StatCard
            label="Serviços"
            value={data.servicesInRange.length}
            hint={data.rangeLabel}
            icon={<Layers className="h-4 w-4" />}
            dataTestId="stat-services"
          />
          <StatCard
            label="Renda"
            value={currency(data.revenue)}
            hint={data.rangeLabel}
            icon={<BadgeDollarSign className="h-4 w-4" />}
            dataTestId="stat-income"
          />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3" data-testid="grid-main">
          <Card
            className="panel-card hover-lift lg:col-span-2"
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

            <div className="px-3 pb-4" data-testid="chart-wrapper">
              <ChartContainer
                config={{
                  revenue: { label: "Income", color: "hsl(var(--chart-1))" },
                }}
                className="h-[260px] w-full"
              >
                <ResponsiveContainer>
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
                </ResponsiveContainer>
              </ChartContainer>
            </div>
          </Card>

          <TableCard
            title="Serviços recentes"
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
              {recent.map((s) => (
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
                      {s.title}
                    </div>
                    <div
                      className="mt-0.5 truncate text-xs text-muted-foreground"
                      data-testid={`text-service-meta-${s.id}`}
                    >
                      {s.clientName} · {format(parseISO(s.date), "MMM d, yyyy")}
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
              ))}
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
                    Notas, status e saúde num relance.
                  </div>
                </div>
                <div
                  className="rounded-2xl border bg-card p-3"
                  data-testid="iconbox-clients"
                >
                  <Users className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-4 grid gap-2" data-testid="list-quick-clients">
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
                        {c.company || "Individual"}
                      </div>
                    </div>
                    <StatusBadge status={c.status} />
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
                    Acompanhe preço, status e entrega.
                  </div>
                </div>
                <div
                  className="rounded-2xl border bg-card p-3"
                  data-testid="iconbox-services"
                >
                  <Layers className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-4 grid gap-2" data-testid="list-top-services">
                {data.services.slice(0, 3).map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded-xl border bg-card px-3 py-2"
                    data-testid={`row-top-service-${s.id}`}
                  >
                    <div className="min-w-0">
                      <div
                        className="truncate text-sm font-medium"
                        data-testid={`text-top-service-title-${s.id}`}
                      >
                        {s.title}
                      </div>
                      <div
                        className="truncate text-xs text-muted-foreground"
                        data-testid={`text-top-service-client-${s.id}`}
                      >
                        {s.clientName}
                      </div>
                    </div>
                    <StatusBadge status={s.status} />
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
    </AppShell>
  );
}
