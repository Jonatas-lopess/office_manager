import { PropsWithChildren, ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import {
  ArrowLeft,
  BarChart3,
  Building2,
  History as HistoryIcon,
  LayoutGrid,
  Settings,
  Sparkles,
  Users,
  Download,
  Share,
} from "lucide-react";
import { useState } from "react";
import { CSVImportDialog } from "./csv-import-dialog";
import { useDb } from "@/db/context";
import { clientsTable } from "@/db/schema";
import { useToast } from "@/hooks/use-toast";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

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

function SidebarContent_() {
  const [location] = useLocation();

  const NAV_ITEMS = [
    { href: "/", label: "Dashboard", icon: LayoutGrid },
    { href: "/clients", label: "Clientes", icon: Users },
    { href: "/services", label: "Serviços", icon: BarChart3 },
    { href: "/logs", label: "Logs", icon: HistoryIcon },
    { href: "/settings", label: "Configurações", icon: Settings },
  ];

  return (
    <Sidebar variant="sidebar" collapsible="icon">
      <SidebarHeader className="p-4 flex flex-row items-center justify-between group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
        <div
          className="flex items-center gap-3 group-data-[collapsible=icon]:hidden"
          data-testid="brand"
        >
          <div
            className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border bg-card"
            data-testid="brand-mark"
          >
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
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
        <SidebarTrigger className="shrink-0" />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = location === item.href;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.label}
                    >
                      <Link href={item.href}>
                        <Icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 mt-auto">
        <SidebarDataManagement />
      </SidebarFooter>
    </Sidebar>
  );
}

function SidebarDataManagement() {
  const [isImportOpen, setIsImportOpen] = useState(false);
  const { orm } = useDb();
  const { toast } = useToast();

  const handleExportClients = async () => {
    try {
      const clients = await orm.select().from(clientsTable);
      const csv = Papa.unparse(clients);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        `clientes_export_${new Date().getTime()}.csv`,
      );
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Exportação concluída",
        description: "O arquivo CSV dos clientes foi gerado.",
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Erro na exportação",
        description: "Não foi possível gerar o arquivo CSV.",
      });
    }
  };

  return (
    <div className="group-data-[collapsible=icon]:hidden">
      <Separator className="mb-4" />
      <div
        className="rounded-2xl border bg-card p-4"
        data-testid="card-sidebar-data"
      >
        <div className="text-sm font-semibold" data-testid="text-data-title">
          Dados e Arquivos
        </div>
        <div
          className="mt-1 text-xs text-muted-foreground"
          data-testid="text-data-desc"
        >
          Gerencie informações em massa.
        </div>
        <div
          className="mt-3 grid grid-cols-2 gap-2"
          data-testid="grid-data-actions"
        >
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-[11px] gap-1.5"
            onClick={() => setIsImportOpen(true)}
            data-testid="button-import-clients"
          >
            <Download className="h-3.5 w-3.5" />
            Importar
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 text-[11px] gap-1.5"
            onClick={handleExportClients}
            data-testid="button-export-clients"
          >
            <Share className="h-3.5 w-3.5" />
            Exportar
          </Button>
        </div>
      </div>

      <CSVImportDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        onImportComplete={() => {
          // No-op for now as local sync handles it
        }}
      />
    </div>
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
    <SidebarProvider>
      <div
        className="app-shell h-svh flex w-full overflow-hidden"
        data-testid="app-shell"
      >
        <SidebarContent_ />
        <SidebarInset className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col gap-6 px-6 py-8">
            <Topbar title={title} subtitle={subtitle} right={right} />
            <div
              className="mt-2 flex-1 flex flex-col min-h-0"
              data-testid="page-content"
            >
              {children}
            </div>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  dataTestId,
  loading,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: ReactNode;
  dataTestId: string;
  loading?: boolean;
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
              {loading ? <Skeleton className="h-7 w-24 mb-1" /> : value}
            </div>
            {hint || loading ? (
              <div
                className="mt-1 text-[10px] sm:text-xs text-muted-foreground truncate"
                data-testid={`${dataTestId}-hint`}
              >
                {loading ? <Skeleton className="h-3 w-32" /> : hint}
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

export function RowSkeleton({
  count = 1,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "flex items-center justify-between gap-4 p-4 border-b last:border-0 h-[72px]",
            className,
          )}
        >
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-[40%] bg-muted" />
            <Skeleton className="h-3 w-[60%] bg-muted/60" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-8 rounded-md bg-muted" />
            <Skeleton className="h-8 w-8 rounded-md bg-muted" />
            <Skeleton className="h-8 w-8 rounded-md bg-muted" />
          </div>
        </div>
      ))}
    </>
  );
}

export function InfiniteList<T>({
  data,
  renderItem,
  loading,
  pendingItem,
  pageSize = 20,
  emptyState,
  className,
}: {
  data: T[];
  renderItem: (item: T) => ReactNode;
  loading?: boolean;
  pendingItem?: T | null;
  pageSize?: number;
  emptyState?: ReactNode;
  className?: string;
}) {
  const { items, lastElementRef } = useInfiniteScroll(data, pageSize);

  if (loading && items.length === 0) {
    return <RowSkeleton count={5} />;
  }

  return (
    <div className={cn("divide-y", className)}>
      {pendingItem &&
        !data.some((item: any) => item.id === (pendingItem as any).id) && (
          <RowSkeleton count={1} />
        )}

      {items.length > 0 ? (
        <>
          {items.map((item, i) => {
            if (pendingItem && (item as any).id === (pendingItem as any).id) {
              return <RowSkeleton key={(item as any).id || i} count={1} />;
            }
            return <div key={(item as any).id || i}>{renderItem(item)}</div>;
          })}
          <div ref={lastElementRef} className="h-4 pt-4" />
        </>
      ) : (
        !pendingItem && emptyState
      )}
    </div>
  );
}
