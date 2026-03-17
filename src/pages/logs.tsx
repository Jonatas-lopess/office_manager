import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Search,
  Laptop,
  AlertCircle,
  CheckCircle2,
  Info,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AppShell, InfiniteList } from "@/components/panel/panel-kit";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDb } from "@/db/context";
import { useLocalQuery } from "@/hooks/useLocalQuery";
import { logsTable } from "@/db/schema";
import { desc } from "drizzle-orm";
import { Log } from "@/db/validations";

function StatusIcon({ status }: { status: string }) {
  const s = status.toLowerCase();
  switch (s) {
    case "success":
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case "error":
      return <AlertCircle className="h-4 w-4 text-destructive" />;
    case "warning":
      return <Info className="h-4 w-4 text-amber-500" />;
    default:
      return <Info className="h-4 w-4 text-muted-foreground" />;
  }
}

export default function LogsPage() {
  const { db, orm } = useDb();
  const [q, setQ] = useState("");

  const logsQuery = useMemo(() => {
    return orm.select().from(logsTable).orderBy(desc(logsTable.created_at)).toSQL();
  }, [orm]);

  const { data: rawLogs } = useLocalQuery<Log>(db, logsQuery);
  const logs = useMemo(() => rawLogs || [], [rawLogs]);

  const filtered = logs.filter(
    (l) =>
      l.action.toLowerCase().includes(q.toLowerCase()) ||
      (l.device && l.device.toLowerCase().includes(q.toLowerCase())) ||
      l.module.toLowerCase().includes(q.toLowerCase()),
  );



  return (
    <AppShell
      title="Logs de Operações"
      subtitle="Rastreamento de atividades e dispositivos."
    >
      <Card className="panel-card flex-1 flex flex-col min-h-0" data-testid="card-logs">
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

        <ScrollArea className="flex-1 pr-4">
          <div className="divide-y" data-testid="list-logs">
            <InfiniteList
              data={filtered}
              emptyState={
                <div className="p-8 text-center text-muted-foreground">
                  Nenhum log encontrado para sua busca.
                </div>
              }
              renderItem={(log) => (
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
                          {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", {
                            locale: ptBR,
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div
                    className="flex items-center gap-3 text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-lg border border-border/50"
                    data-testid={`wrap-log-device-${log.id}`}
                  >
                    <Laptop className="h-4 w-4" />
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground/80">
                        {log.device || "N/A"}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            />
          </div>
        </ScrollArea>
      </Card>
    </AppShell>
  );
}

