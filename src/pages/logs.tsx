import { useState } from "react";
import {
  Search,
  Laptop,
  Smartphone,
  Monitor,
  AlertCircle,
  CheckCircle2,
  Info,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AppShell } from "@/components/panel/panel-kit";

interface LogEntry {
  id: string;
  action: string;
  module: string;
  device: string;
  deviceType: "desktop" | "mobile" | "tablet";
  timestamp: string;
  status: "success" | "warning" | "error";
  user: string;
}

const MOCK_LOGS: LogEntry[] = [
  {
    id: "l1",
    action: "Cliente adicionado",
    module: "Clientes",
    device: "Desktop Windows (192.168.1.15)",
    deviceType: "desktop",
    timestamp: "2024-03-05 14:20:12",
    status: "success",
    user: "Alex Silva",
  },
  {
    id: "l2",
    action: "Serviço marcado como Entregue",
    module: "Serviços",
    device: "iPhone 15 Pro (10.0.0.42)",
    deviceType: "mobile",
    timestamp: "2024-03-05 13:45:30",
    status: "success",
    user: "Alex Silva",
  },
  {
    id: "l3",
    action: "Tentativa de login falhou",
    module: "Autenticação",
    device: "Desconhecido (45.12.33.1)",
    deviceType: "desktop",
    timestamp: "2024-03-05 12:10:05",
    status: "error",
    user: "admin",
  },
  {
    id: "l4",
    action: "Configurações de tema alteradas",
    module: "Configurações",
    device: "Desktop Windows (192.168.1.15)",
    deviceType: "desktop",
    timestamp: "2024-03-05 11:30:22",
    status: "success",
    user: "Alex Silva",
  },
  {
    id: "l5",
    action: "Exportação de relatório",
    module: "Serviços",
    device: "MacBook Pro (192.168.1.10)",
    deviceType: "desktop",
    timestamp: "2024-03-05 09:15:00",
    status: "warning",
    user: "Sistema",
  },
];

function DeviceIcon({ type }: { type: LogEntry["deviceType"] }) {
  switch (type) {
    case "mobile":
      return <Smartphone className="h-4 w-4" />;
    case "tablet":
      return <Monitor className="h-4 w-4" />;
    default:
      return <Laptop className="h-4 w-4" />;
  }
}

function StatusIcon({ status }: { status: LogEntry["status"] }) {
  switch (status) {
    case "success":
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case "error":
      return <AlertCircle className="h-4 w-4 text-destructive" />;
    case "warning":
      return <Info className="h-4 w-4 text-amber-500" />;
  }
}

export default function LogsPage() {
  const [q, setQ] = useState("");

  const filtered = MOCK_LOGS.filter(
    (l) =>
      l.action.toLowerCase().includes(q.toLowerCase()) ||
      l.device.toLowerCase().includes(q.toLowerCase()) ||
      l.module.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <AppShell
      title="Logs de Operações"
      subtitle="Rastreamento de atividades e dispositivos."
    >
      <Card className="panel-card" data-testid="card-logs">
        <div className="p-4 border-b">
          <div className="relative" data-testid="wrap-log-search">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filtrar por ação, dispositivo ou módulo..."
              className="pl-9"
              data-testid="input-log-search"
            />
          </div>
        </div>

        <div className="divide-y" data-testid="list-logs">
          {filtered.length > 0 ? (
            filtered.map((log) => (
              <div
                key={log.id}
                className="flex flex-col p-4 sm:flex-row sm:items-center sm:justify-between gap-4 hover:bg-muted/30 transition-colors"
                data-testid={`row-log-${log.id}`}
              >
                <div className="flex items-start gap-4">
                  <div className="mt-1">
                    <StatusIcon status={log.status} />
                  </div>
                  <div>
                    <div
                      className="font-medium text-sm"
                      data-testid={`text-log-action-${log.id}`}
                    >
                      {log.action}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0 h-4"
                        data-testid={`badge-log-module-${log.id}`}
                      >
                        {log.module}
                      </Badge>
                      <span
                        className="text-xs text-muted-foreground"
                        data-testid={`text-log-time-${log.id}`}
                      >
                        {log.timestamp}
                      </span>
                    </div>
                  </div>
                </div>

                <div
                  className="flex items-center gap-3 text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-lg border border-border/50"
                  data-testid={`wrap-log-device-${log.id}`}
                >
                  <DeviceIcon type={log.deviceType} />
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground/80">
                      {log.device}
                    </span>
                    <span>Usuário: {log.user}</span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-muted-foreground">
              Nenhum log encontrado para sua busca.
            </div>
          )}
        </div>
      </Card>
    </AppShell>
  );
}
