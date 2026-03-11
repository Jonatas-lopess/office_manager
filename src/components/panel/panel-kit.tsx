import { PropsWithChildren, ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  BarChart3,
  Building2,
  History as HistoryIcon,
  LayoutGrid,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
export function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2, 9)}`;
}

export function currency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function Topbar({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  const [location] = useLocation();
  const isHome = location === "/";

  return (
    <div
      className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"
      data-testid="topbar"
    >
      <div className="flex items-start gap-4 min-w-0" data-testid="topbar-left">
        {!isHome && (
          <Button
            variant="ghost"
            size="icon"
            asChild
            className="mt-1 h-8 w-8 rounded-lg border bg-card text-muted-foreground hover:text-primary transition-all active:scale-95"
            data-testid="button-back"
          >
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
        )}
        <div className="min-w-0">
          <div
            className="flex items-center gap-2"
            data-testid="topbar-title-row"
          >
            <div
              className="text-2xl font-semibold tracking-tight"
              data-testid="text-page-title"
            >
              {title}
            </div>
            <span
              className="inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-[11px] text-muted-foreground"
              data-testid="pill-prototype"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Prototype
            </span>
          </div>
          {subtitle ? (
            <div
              className="mt-1 text-sm text-muted-foreground"
              data-testid="text-page-subtitle"
            >
              {subtitle}
            </div>
          ) : null}
        </div>
      </div>

      {right ? (
        <div className="shrink-0" data-testid="topbar-right">
          {right}
        </div>
      ) : null}
    </div>
  );
}

function NavItem({
  href,
  icon,
  label,
}: {
  href: string;
  icon: ReactNode;
  label: string;
}) {
  const [location] = useLocation();
  const active = location === href;

  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-sidebar-foreground transition",
        "hover:bg-sidebar-accent hover:text-sidebar-foreground",
        active && "bg-sidebar-accent text-sidebar-foreground",
      )}
      data-testid={`nav-${label.toLowerCase()}`}
    >
      <span
        className={cn(
          "grid h-8 w-8 place-items-center rounded-lg border bg-card text-muted-foreground transition",
          active && "border-primary/25 text-primary",
          "group-hover:border-primary/20 group-hover:text-primary",
        )}
        data-testid={`navicon-${label.toLowerCase()}`}
      >
        {icon}
      </span>
      <span
        className="truncate"
        data-testid={`navlabel-${label.toLowerCase()}`}
      >
        {label}
      </span>
    </Link>
  );
}

function Sidebar() {
  return (
    <aside
      className={cn(
        "sticky top-0 h-dvh w-[280px] shrink-0 border-r bg-sidebar",
        "hidden lg:block",
      )}
      data-testid="sidebar"
    >
      <div className="flex h-dvh flex-col" data-testid="sidebar-inner">
        <div className="p-4" data-testid="sidebar-header">
          <div className="flex items-center gap-3" data-testid="brand">
            <div
              className="grid h-10 w-10 place-items-center rounded-2xl border bg-card"
              data-testid="brand-mark"
            >
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0" data-testid="brand-text">
              <div
                className="truncate text-sm font-semibold"
                data-testid="text-brand-name"
              >
                Painel de Controle
              </div>
              <div
                className="truncate text-xs text-muted-foreground"
                data-testid="text-brand-subtitle"
              >
                Área administrativa
              </div>
            </div>
          </div>
        </div>

        <div className="px-4" data-testid="sidebar-nav">
          <div className="grid gap-1" data-testid="nav-list">
            <NavItem
              href="/"
              icon={<LayoutGrid className="h-4 w-4" />}
              label="Dashboard"
            />
            <NavItem
              href="/clients"
              icon={<Users className="h-4 w-4" />}
              label="Clientes"
            />
            <NavItem
              href="/services"
              icon={<BarChart3 className="h-4 w-4" />}
              label="Serviços"
            />
            <NavItem
              href="/logs"
              icon={<HistoryIcon className="h-4 w-4" />}
              label="Logs"
            />
            <NavItem
              href="/settings"
              icon={<Settings className="h-4 w-4" />}
              label="Configurações"
            />
          </div>
        </div>

        <div className="mt-auto p-4" data-testid="sidebar-footer">
          <Separator className="mb-4" />
          <div
            className="rounded-2xl border bg-card p-4"
            data-testid="card-sidebar-help"
          >
            <div
              className="text-sm font-semibold"
              data-testid="text-help-title"
            >
              Ações rápidas
            </div>
            <div
              className="mt-1 text-xs text-muted-foreground"
              data-testid="text-help-desc"
            >
              Use a barra lateral para navegar.
            </div>
            <div
              className="mt-3 grid grid-cols-2 gap-2"
              data-testid="grid-help-actions"
            >
              <Button asChild size="sm" data-testid="button-help-clients">
                <Link href="/clients">Clientes</Link>
              </Button>
              <Button
                asChild
                size="sm"
                variant="secondary"
                data-testid="button-help-services"
              >
                <Link href="/services">Serviços</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    // Status de Clientes (traduzidos internamente para match)
    Ativo: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    Integrando: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    Pausado: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    // Status de Serviços
    Rascunho: "bg-slate-500/10 text-slate-600 border-slate-500/20",
    "Em andamento": "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
    Entregue: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    Faturado: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  };

  const labels: Record<string, string> = {
    Active: "Ativo",
    Onboarding: "Integrando",
    Paused: "Pausado",
    Draft: "Rascunho",
    "In progress": "Em andamento",
    Delivered: "Entregue",
    Invoiced: "Faturado",
  };

  const displayLabel = labels[status] || status;
  const style =
    colors[displayLabel] ||
    "bg-slate-500/10 text-slate-600 border-slate-500/20";

  return (
    <Badge
      variant="outline"
      className={cn("font-medium", style)}
      data-testid={`badge-status-${status.toLowerCase().replace(/\s+/g, "-")}`}
    >
      {displayLabel}
    </Badge>
  );
}

export function AppShell({
  title,
  subtitle,
  right,
  children,
}: PropsWithChildren<{
  title: string;
  subtitle?: string;
  right?: ReactNode;
}>) {
  return (
    <div className="app-shell min-h-dvh" data-testid="app-shell">
      <div
        className="mx-auto flex w-full max-w-[1280px] gap-6 px-4 py-6"
        data-testid="layout"
      >
        <Sidebar />
        <main className="min-w-0 flex-1" data-testid="main">
          <Topbar title={title} subtitle={subtitle} right={right} />
          <div className="mt-5" data-testid="page-content">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  dataTestId,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: ReactNode;
  dataTestId: string;
}) {
  return (
    <Card className="panel-card hover-lift" data-testid={dataTestId}>
      <div className="p-4 sm:p-5">
        <div
          className="flex items-center justify-between gap-3"
          data-testid={`${dataTestId}-row`}
        >
          <div className="min-w-0 flex-1">
            <div
              className="text-xs sm:text-sm font-medium text-muted-foreground truncate"
              data-testid={`${dataTestId}-label`}
            >
              {label}
            </div>
            <div
              className="mt-1 text-lg sm:text-2xl font-semibold tracking-tight truncate"
              data-testid={`${dataTestId}-value`}
            >
              {value}
            </div>
            {hint ? (
              <div
                className="mt-1 text-[10px] sm:text-xs text-muted-foreground truncate"
                data-testid={`${dataTestId}-hint`}
              >
                {hint}
              </div>
            ) : null}
          </div>

          <div
            className="grid h-9 w-9 sm:h-11 sm:w-11 shrink-0 place-items-center rounded-xl sm:rounded-2xl border bg-card text-muted-foreground"
            data-testid={`${dataTestId}-iconbox`}
          >
            {icon}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function TableCard({
  title,
  description,
  action,
  children,
  dataTestId,
  className,
}: PropsWithChildren<{
  title: string;
  description?: string;
  action?: ReactNode;
  dataTestId: string;
  className?: string;
}>) {
  return (
    <Card
      className={cn("panel-card overflow-hidden", className)}
      data-testid={dataTestId}
    >
      <div
        className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between"
        data-testid={`${dataTestId}-header`}
      >
        <div className="min-w-0">
          <div
            className="text-sm font-medium truncate"
            data-testid={`${dataTestId}-title`}
          >
            {title}
          </div>
          {description ? (
            <div
              className="mt-1 text-sm text-muted-foreground line-clamp-2"
              data-testid={`${dataTestId}-desc`}
            >
              {description}
            </div>
          ) : null}
        </div>
        {action ? (
          <div className="shrink-0" data-testid={`${dataTestId}-action`}>
            {action}
          </div>
        ) : null}
      </div>
      <div data-testid={`${dataTestId}-content`}>{children}</div>
    </Card>
  );
}
