import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AppShell,
  currency,
  seedClients,
  seedServices,
  StatusBadge,
  type Service,
  uid,
} from "@/components/panel/panel-kit";

const STATUS = ["Draft", "In progress", "Delivered", "Invoiced"] as const;

type ServiceStatus = (typeof STATUS)[number];

export default function ServicesPage() {
  const [items, setItems] = useState<Service[]>(seedServices);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | ServiceStatus>("all");

  const filtered = useMemo(() => {
    return items
      .filter((s) => {
        const matchQ = (s.title + s.clientName)
          .toLowerCase()
          .includes(q.toLowerCase().trim());
        const matchS = status === "all" ? true : s.status === status;
        return matchQ && matchS;
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [items, q, status]);

  const totalRevenue = filtered.reduce((acc, s) => acc + s.price, 0);

  return (
    <AppShell
      title="Serviços"
      subtitle="Acompanhe entregas e renda."
      right={<NewService onCreate={(svc) => setItems((p) => [svc, ...p])} />}
    >
      <div className="grid gap-4 lg:grid-cols-3" data-testid="grid-services">
        <Card className="panel-card lg:col-span-2" data-testid="card-services">
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
                  {STATUS.map((s) => (
                    <SelectItem
                      key={s}
                      value={s}
                      data-testid={`option-service-status-${s}`}
                    >
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="divide-y" data-testid="list-services">
            {filtered.map((s) => (
              <div
                key={s.id}
                className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                data-testid={`row-service-${s.id}`}
              >
                <div className="min-w-0">
                  <div
                    className="flex flex-wrap items-center gap-2"
                    data-testid={`group-service-title-${s.id}`}
                  >
                    <div
                      className="truncate text-sm font-semibold"
                      data-testid={`text-service-title-${s.id}`}
                    >
                      {s.title}
                    </div>
                    <StatusBadge status={s.status} />
                  </div>
                  <div
                    className="mt-1 truncate text-xs text-muted-foreground"
                    data-testid={`text-service-meta-${s.id}`}
                  >
                    {s.clientName} · {format(parseISO(s.date), "MMM d, yyyy")}
                  </div>
                </div>

                <div
                  className="flex items-center justify-between gap-3 sm:justify-end"
                  data-testid={`group-service-right-${s.id}`}
                >
                  <div className="text-right">
                    <div
                      className="text-sm font-semibold"
                      data-testid={`text-service-price-${s.id}`}
                    >
                      {currency(s.price)}
                    </div>
                  </div>

                  <div
                    className="flex items-center gap-2"
                    data-testid={`group-service-actions-${s.id}`}
                  >
                    <Button
                      variant="secondary"
                      size="sm"
                      data-testid={`button-service-view-${s.id}`}
                    >
                      View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid={`button-service-edit-${s.id}`}
                    >
                      Edit
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {filtered.length === 0 ? (
              <div
                className="p-8 text-center text-sm text-muted-foreground"
                data-testid="empty-services"
              >
                No services found. Try changing your filters.
              </div>
            ) : null}
          </div>
        </Card>

        <Card className="panel-card" data-testid="card-services-summary">
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
                label="Renda"
                value={currency(totalRevenue)}
                testId="income"
              />
            </div>
            <div
              className="mt-4 rounded-2xl border bg-card p-4 text-xs text-muted-foreground"
              data-testid="callout-services"
            >
              Dica: use “Faturado” para acompanhar o que já foi pago.
            </div>
          </div>
        </Card>
      </div>
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

function NewService({ onCreate }: { onCreate: (service: Service) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState(seedClients[0]?.id ?? "");
  const [status, setStatus] = useState<ServiceStatus>("Draft");
  const [price, setPrice] = useState("1200");

  const clients = seedClients;
  const selectedClient = clients.find((c) => c.id === clientId);

  const canSave = title.trim().length > 2 && !!selectedClient;

  function reset() {
    setTitle("");
    setClientId(seedClients[0]?.id ?? "");
    setStatus("Draft");
    setPrice("1200");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-new-service" className="gap-2">
          <Plus className="h-4 w-4" />
          Novo serviço
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="dialog-new-service">
        <DialogHeader>
          <DialogTitle data-testid="text-new-service-title">
            Novo serviço
          </DialogTitle>
          <DialogDescription data-testid="text-new-service-desc">
            Crie uma entrada de serviço vinculada a um cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4" data-testid="form-new-service">
          <div className="grid gap-2" data-testid="field-service-title">
            <Label htmlFor="service-title" data-testid="label-service-title">
              Título
            </Label>
            <Input
              id="service-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ex: Redesign de Website"
              data-testid="input-service-title"
            />
          </div>

          <div className="grid gap-2" data-testid="field-service-client">
            <Label data-testid="label-service-client">Cliente</Label>
            <Select value={clientId} onValueChange={(v) => setClientId(v)}>
              <SelectTrigger data-testid="select-service-client">
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
          </div>

          <div className="grid gap-2" data-testid="field-service-status">
            <Label data-testid="label-service-status">Status</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as ServiceStatus)}
            >
              <SelectTrigger data-testid="select-new-service-status">
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

          <div className="grid gap-4" data-testid="group-service-money">
            <div className="grid gap-2" data-testid="field-service-price">
              <Label htmlFor="service-price" data-testid="label-service-price">
                Renda (R$)
              </Label>
              <Input
                id="service-price"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                data-testid="input-service-price"
              />
            </div>
          </div>

          <div
            className="flex items-center justify-end gap-2"
            data-testid="group-new-service-actions"
          >
            <Button
              variant="secondary"
              onClick={() => {
                setOpen(false);
                reset();
              }}
              data-testid="button-cancel-new-service"
            >
              Cancelar
            </Button>
            <Button
              disabled={!canSave}
              onClick={() => {
                const svc: Service = {
                  id: uid("s"),
                  title: title.trim(),
                  clientId: selectedClient!.id,
                  clientName: selectedClient!.name,
                  status,
                  date: new Date().toISOString().slice(0, 10),
                  price: Number(price) || 0,
                };
                onCreate(svc);
                setOpen(false);
                reset();
              }}
              data-testid="button-save-new-service"
            >
              Criar serviço
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
