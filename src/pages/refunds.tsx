import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { v7 as uuidv7 } from "uuid";
import { Card } from "@/components/ui/card";
import { AppShell, InfiniteList, DebouncedSearch } from "@/components/panel/panel-kit";
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
import { Label } from "@/components/ui/label";
import { cn, normalizeString } from "@/lib/utils";

import { useDb } from "@/db/context";
import { useSync } from "@/db/sync-context";
import { useLocalQuery } from "@/hooks/useLocalQuery";
import {
  servicesTable,
  clientsTable,
  tagsTable,
  serviceTagsTable,
} from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

import { logAction } from "@/lib/logger";

import { RefundListItem } from "@/components/service/refund-list-item";
import { ClientDialog } from "@/pages/clients";

const IRPF_TYPE = "Declaração de Imposto de Renda Pessoa Física";

export default function RefundsPage() {
  const { db, orm } = useDb();
  const { myId, connectedPeers } = useSync();

  const [q, setQ] = useState("");
  const [restitutionStatus, setRestitutionStatus] = useState<
    "all" | "set" | "pending"
  >("all");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [isClientDialogOpen, setIsClientDialogOpen] = useState(false);
  const [selectedClientData, setSelectedClientData] = useState<any | null>(
    null,
  );

  const device = connectedPeers.find((p) => p.id === myId)?.ip || undefined;

  const refundsQuery = useMemo(() => {
    return orm
      .select({
        id: servicesTable.id,
        client_id: servicesTable.client_id,
        restitution_date: servicesTable.restitution_date,
        description: servicesTable.description,
        client_name: sql<string>`${clientsTable.name}`.as("client_name"),
        cpf: sql<string>`${clientsTable.cpf}`.as("cpf"),
        birth_date: sql<number>`${clientsTable.birth_date}`.as("birth_date"),
      })
      .from(servicesTable)
      .innerJoin(clientsTable, eq(servicesTable.client_id, clientsTable.id))
      .where(eq(servicesTable.type, IRPF_TYPE))
      .orderBy(desc(servicesTable.restitution_date))
      .toSQL();
  }, [orm]);

  const { data: rawRefunds, loading: refundsLoading } = useLocalQuery<any>(
    db,
    refundsQuery,
  );
  const refunds = useMemo(() => rawRefunds || [], [rawRefunds]);

  const tagsQuery = useMemo(() => orm.select().from(tagsTable).toSQL(), [orm]);
  const { data: rawTags, loading: tagsLoading } = useLocalQuery<any>(
    db,
    tagsQuery,
  );
  const allTags = useMemo(() => rawTags || [], [rawTags]);

  const serviceTagsQuery = useMemo(
    () => orm.select().from(serviceTagsTable).toSQL(),
    [orm],
  );
  const { data: rawServiceTags } = useLocalQuery<any>(db, serviceTagsQuery);

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

  const clientsQuery = useMemo(
    () => orm.select().from(clientsTable).toSQL(),
    [orm],
  );
  const { data: rawClients } = useLocalQuery<any>(db, clientsQuery);
  const clientsMap = useMemo(() => {
    const map: Record<string, any> = {};
    for (const c of rawClients || []) map[c.id] = c;
    return map;
  }, [rawClients]);

  const filtered = useMemo(() => {
    const search = normalizeString(q.trim());
    return refunds.filter((r: any) => {
      if (restitutionStatus === "set" && !r.restitution_date) return false;
      if (restitutionStatus === "pending" && r.restitution_date) return false;

      if (selectedTagIds.length > 0) {
        const rTagIds = serviceTagsMap[r.id] || [];
        if (!selectedTagIds.some((tid) => rTagIds.includes(tid))) return false;
      }

      if (dateFrom) {
        if (!r.restitution_date) return false;
        const from = new Date(dateFrom).getTime();
        if (r.restitution_date < from) return false;
      }
      if (dateTo) {
        if (!r.restitution_date) return false;
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        if (r.restitution_date > to.getTime()) return false;
      }

      if (search) {
        const content = normalizeString(
          (r.client_name || "") + (r.cpf || "") + (r.description || ""),
        );
        if (!content.includes(search)) return false;
      }

      return true;
    });
  }, [
    refunds,
    q,
    restitutionStatus,
    selectedTagIds,
    serviceTagsMap,
    dateFrom,
    dateTo,
  ]);

  const loading = refundsLoading || tagsLoading;

  const hasActiveFilters =
    restitutionStatus !== "all" ||
    selectedTagIds.length > 0 ||
    dateFrom ||
    dateTo;

  const clearFilters = () => {
    setRestitutionStatus("all");
    setSelectedTagIds([]);
    setDateFrom("");
    setDateTo("");
  };

  const handleRestitutionDateChange = async (
    serviceId: string,
    date: Date | null,
  ) => {
    await orm
      .update(servicesTable)
      .set({ restitution_date: date, updated_at: new Date() })
      .where(eq(servicesTable.id, serviceId));
    await logAction(orm, {
      action: "Data de restituição atualizada",
      module: "Restituições",
      status: "Success",
      device,
    });
  };

  const handleTagsChange = async (serviceId: string, newTagIds: string[]) => {
    const oldTagIds = new Set(serviceTagsMap[serviceId] || []);
    const nextTagIds = new Set(newTagIds);

    for (const tagId of oldTagIds) {
      if (!nextTagIds.has(tagId)) {
        await orm
          .delete(serviceTagsTable)
          .where(
            and(
              eq(serviceTagsTable.service_id, serviceId),
              eq(serviceTagsTable.tag_id, tagId),
            ),
          );
      }
    }
    for (const tagId of nextTagIds) {
      if (!oldTagIds.has(tagId)) {
        await orm
          .insert(serviceTagsTable)
          .values({ service_id: serviceId, tag_id: tagId });
      }
    }
    await logAction(orm, {
      action: "Etiquetas de restituição atualizadas",
      module: "Restituições",
      status: "Success",
      device,
    });
  };

  const handleCreateTag = async (name: string, color: string) => {
    const newTag = { id: uuidv7(), name, color };
    await orm.insert(tagsTable).values({ ...newTag, created_at: new Date() });
    return newTag;
  };

  const handleClientClick = (clientId: string) => {
    const client = clientsMap[clientId];
    if (!client) return;
    setSelectedClientData(client);
    setIsClientDialogOpen(true);
  };

  return (
    <AppShell
      title="Restituições"
      subtitle="Declarações de IRPF e datas de restituição."
    >
      <Card
        className="panel-card flex flex-1 flex-col min-h-0"
        data-testid="card-refunds"
      >
        <div className="p-4 space-y-3" data-testid="bar-refunds-controls">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1" data-testid="wrap-refund-search">
              <DebouncedSearch
                onSearch={setQ}
                placeholder="Buscar por cliente ou CPF…"
                className="pl-9"
                data-testid="input-refund-search"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={restitutionStatus}
                onValueChange={(v) => setRestitutionStatus(v as any)}
              >
                <SelectTrigger
                  className="w-44"
                  data-testid="select-refund-status"
                >
                  <SelectValue placeholder="Restituição" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="set">Com data registrada</SelectItem>
                  <SelectItem value="pending">Sem data registrada</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex items-center gap-1">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-38.75 h-9 text-sm"
                  title="Data inicial"
                  data-testid="input-refund-date-from"
                />
                <span className="text-muted-foreground text-xs">-</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-38.75 h-9 text-sm"
                  title="Data final"
                  data-testid="input-refund-date-to"
                />
              </div>

              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-8 px-2 text-xs text-muted-foreground hover:text-primary"
                >
                  Limpar
                </Button>
              )}
            </div>
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
                    style={isSelected ? { backgroundColor: tag.color } : undefined}
                    data-testid={`filter-refund-tag-${tag.id}`}
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

        <div
          className="hidden border-y bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[1.6fr_1.4fr_1fr_1fr_1fr_1.4fr] sm:gap-3"
          data-testid="header-refunds"
        >
          <div>Cliente</div>
          <div>Descrição</div>
          <div>CPF</div>
          <div>Nascimento</div>
          <div>Restituição</div>
          <div>Etiquetas</div>
        </div>

        <ScrollArea className="flex-1">
          <div className="divide-y" data-testid="list-refunds">
            <InfiniteList
              data={filtered}
              loading={loading}
              emptyState={
                <Empty className="py-12">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Search className="size-6" />
                    </EmptyMedia>
                    <EmptyTitle>Nenhuma restituição encontrada</EmptyTitle>
                    <EmptyDescription>
                      Tente ajustar sua busca ou filtros para encontrar o que
                      procura.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              }
              renderItem={(r: any) => (
                <RefundListItem
                  key={r.id}
                  service={{
                    id: r.id,
                    restitution_date: r.restitution_date,
                    description: r.description,
                  }}
                  client={{
                    id: r.client_id,
                    name: r.client_name,
                    cpf: r.cpf,
                    birth_date: r.birth_date,
                  }}
                  tagIds={serviceTagsMap[r.id] || []}
                  allTags={allTags}
                  onRestitutionDateChange={handleRestitutionDateChange}
                  onTagsChange={handleTagsChange}
                  onCreateTag={handleCreateTag}
                  onClientClick={handleClientClick}
                />
              )}
            />
          </div>
        </ScrollArea>
      </Card>

      <ClientDialog
        open={isClientDialogOpen}
        onOpenChange={setIsClientDialogOpen}
        mode="view"
        initialData={selectedClientData}
        onOpenFolder={async () => {}}
        onSave={async () => {}}
      />
    </AppShell>
  );
}
