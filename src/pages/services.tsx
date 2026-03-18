import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Plus,
  Search,
  Check,
  ChevronsUpDown,
  Eye,
  Pencil,
  Trash2,
  Receipt,
  CalendarClock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  StatusBadge,
  InfiniteList,
} from "@/components/panel/panel-kit";
import { v7 as uuidv7 } from "uuid";
import {
  Service,
  insertServiceSchema,
  NewService as NewServiceType,
} from "@/db/validations";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDb } from "@/db/context";
import { useSync } from "@/db/sync-context";
import { useLocalQuery } from "@/hooks/useLocalQuery";
import {
  servicesTable,
  serviceTypesArray,
  clientsTable,
  paymentsTable,
} from "@/db/schema";
import { and, desc, eq, like, or, isNotNull, ne, sql } from "drizzle-orm";

import { logAction } from "@/lib/logger";
import { useToast } from "@/hooks/use-toast";
import ClickToCopy from "@/components/ui/click-to-copy";

type ServiceStatus = Service["status"];

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

function ServiceDialog({
  open,
  onOpenChange,
  mode,
  initialData,
  onSave,
  onFinancialAction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit" | "view";
  initialData: any | null;
  onSave: (service: any) => Promise<void>;
  onFinancialAction?: (service: any) => void;
}) {
  const { db, orm } = useDb();

  const clientsQuery = useMemo(() => {
    return orm.select().from(clientsTable).toSQL();
  }, [orm]);

  const { data: rawClients } = useLocalQuery<{ id: string; name: string }>(
    db,
    clientsQuery,
  );
  const clients = useMemo(() => rawClients || [], [rawClients]);

  const [openDesc, setOpenDesc] = useState(false);
  const [searchDesc, setSearchDesc] = useState("");

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

  const { data: rawDesc } = useLocalQuery<any>(db, descQuery);
  const historicDescriptions = useMemo(() => {
    if (!rawDesc) return [];
    return rawDesc.map((d: any) => d.description);
  }, [rawDesc]);

  const form = useForm<NewServiceType>({
    resolver: zodResolver(insertServiceSchema),
    defaultValues: initialData || {
      type: "Outros",
      status: "Draft",
      price: 0,
      description: "",
      client_id: "",
      contract_date: new Date(),
      final_date: null,
      payment_method: "In_Cash",
      installments: 1,
      observations: "",
    },
  });

  const isView = mode === "view";

  useEffect(() => {
    if (open) {
      if (initialData) {
        form.reset({
          ...initialData,
          client_id: initialData.client_id || "",
          type: initialData.type || "Outros",
          status: initialData.status || "Draft",
          price: initialData.price || 0,
          description: initialData.description || "",
          contract_date: initialData.contract_date
            ? new Date(initialData.contract_date)
            : new Date(),
          final_date: initialData.final_date
            ? new Date(initialData.final_date)
            : null,
          payment_method: initialData.payment_method || "In_Cash",
          installments: initialData.installments || 1,
          observations: initialData.observations || "",
        });
      } else {
        form.reset({
          type: "Outros",
          status: "Draft",
          price: 0,
          description: "",
          client_id: "",
          contract_date: new Date(),
          final_date: null,
          payment_method: "In_Cash",
          installments: 1,
          observations: "",
        });
      }
    }
  }, [open, initialData, form]);

  const status = form.watch("status");
  const finalDate = form.watch("final_date");

  useEffect(() => {
    const today = new Date();
    if (status === "Delivered" && !finalDate) {
      form.setValue("final_date", today);
    }
  }, [status, form, finalDate]);

  const onSubmit = async (data: NewServiceType) => {
    if (isView) return;
    const now = new Date();
    const svc: Service = {
      ...(initialData || {}),
      ...data,
      status: data.status || "Draft",
      type: data.type || "Outros",
      description: data.description || null,
      id: initialData?.id || uuidv7(),
      contract_date: data.contract_date || new Date(),
      final_date: data.final_date || null,
      payment_method: data.payment_method || "In_Cash",
      installments: data.installments || null,
      observations: data.observations || null,
      created_at: initialData?.created_at || now,
      updated_at: now,
    };

    await onSave(svc);
  };

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen);
  };

  const titles = {
    create: "Novo serviço",
    edit: "Editar serviço",
    view: "Detalhes do serviço",
  };

  const descriptions = {
    create: "Crie uma entrada de serviço vinculada a um cliente.",
    edit: "Atualize as informações do serviço e acompanhe o progresso.",
    view: "Confira as informações detalhadas deste serviço.",
  };

  const onError = (errors: any) => {
    console.error("[Form Validation Failed]", errors);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        data-testid="dialog-new-service"
        className="max-h-[85vh] overflow-y-auto max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle data-testid="text-new-service-title">
            {titles[mode]}
          </DialogTitle>
          <DialogDescription data-testid="text-new-service-desc">
            {descriptions[mode]}
          </DialogDescription>
        </DialogHeader>

        <form
          autoComplete="off"
          onSubmit={form.handleSubmit(onSubmit, onError)}
          className="grid gap-3"
          data-testid="form-new-service"
        >
          {/* TIER 1: CORE FIELDS */}
          <div className="grid gap-1.5" data-testid="field-service-client">
            <Label htmlFor="service-client" data-testid="label-service-client">
              Cliente *
            </Label>
            <Select
              disabled={isView}
              value={form.watch("client_id")}
              onValueChange={(v) => form.setValue("client_id", v)}
            >
              <SelectTrigger
                id="service-client"
                data-testid="select-service-client"
              >
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
            {form.formState.errors.client_id && (
              <span className="text-xs text-destructive">
                {form.formState.errors.client_id.message}
              </span>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div
              className="grid gap-1.5 sm:col-span-2"
              data-testid="field-service-type"
            >
              <Label htmlFor="service-type" data-testid="label-service-type">
                Tipo de Serviço *
              </Label>
              <Select
                disabled={isView}
                value={form.watch("type") ?? undefined}
                onValueChange={(v) => form.setValue("type", v as any)}
              >
                <SelectTrigger
                  id="service-type"
                  data-testid="select-service-type"
                  className="overflow-hidden"
                >
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {serviceTypesArray.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.type && (
                <span className="text-xs text-destructive">
                  {form.formState.errors.type.message}
                </span>
              )}
            </div>

            <div className="grid gap-1.5" data-testid="field-service-price">
              <Label htmlFor="service-price">Valor Base</Label>
              <ClickToCopy
                enabled={isView}
                value={form.watch("price")}
                label="Valor Base"
              >
                <Input
                  disabled={isView}
                  id="service-price"
                  type="number"
                  {...form.register("price", { valueAsNumber: true })}
                  inputMode="decimal"
                  data-testid="input-service-price"
                  className={isView ? "pointer-events-none" : ""}
                />
              </ClickToCopy>
            </div>
          </div>

          <div className="grid gap-1.5" data-testid="field-service-desc">
            <Label htmlFor="service-description">Descrição Resumida</Label>
            <Popover open={openDesc} onOpenChange={setOpenDesc}>
              <PopoverTrigger asChild>
                <ClickToCopy
                  enabled={isView}
                  value={form.watch("description")}
                  label="Descrição"
                >
                  <Button
                    id="service-description"
                    type="button"
                    variant="outline"
                    role="combobox"
                    disabled={isView}
                    aria-expanded={openDesc}
                    className={cn(
                      "w-full justify-between font-normal",
                      !form.watch("description") && "text-muted-foreground",
                      isView && "pointer-events-none",
                    )}
                  >
                    {form.watch("description") ||
                      "Notas rápidas sobre a entrega"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </ClickToCopy>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0" align="start">
                <Command>
                  <CommandInput
                    placeholder="Buscar ou adicionar nova..."
                    value={searchDesc}
                    onValueChange={(val) => {
                      setSearchDesc(val);
                      form.setValue("description", val, {
                        shouldValidate: true,
                      });
                    }}
                  />
                  <CommandList>
                    <CommandEmpty>
                      <span className="text-muted-foreground text-sm pl-2">
                        Pressione Enter para usar &quot;{searchDesc}&quot;
                      </span>
                    </CommandEmpty>
                    <CommandGroup>
                      {historicDescriptions.map((desc: string) => (
                        <CommandItem
                          key={desc}
                          value={desc}
                          onSelect={(currentValue) => {
                            form.setValue("description", currentValue, {
                              shouldValidate: true,
                            });
                            setSearchDesc("");
                            setOpenDesc(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              form.watch("description") === desc
                                ? "opacity-100"
                                : "opacity-0",
                            )}
                          />
                          {desc}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {form.formState.errors.description && (
              <span className="text-xs text-destructive">
                {form.formState.errors.description.message}
              </span>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5" data-testid="field-service-status">
              <Label htmlFor="service-status">Status</Label>
              <Select
                disabled={isView}
                value={form.watch("status")}
                onValueChange={(v) =>
                  form.setValue("status", v as ServiceStatus)
                }
              >
                <SelectTrigger id="service-status">
                  <SelectValue placeholder="Escolha o status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Draft">Rascunho</SelectItem>
                  <SelectItem value="In progress">Em andamento</SelectItem>
                  <SelectItem value="Delivered">Entregue</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5" data-testid="field-contract-date">
              <Label htmlFor="service-contract-date">Contrato</Label>
              <Controller
                control={form.control}
                name="contract_date"
                render={({ field }) => (
                  <Input
                    id="service-contract-date"
                    type="date"
                    {...field}
                    value={
                      field.value instanceof Date
                        ? format(field.value as Date, "yyyy-MM-dd")
                        : ""
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      field.onChange(val ? new Date(val + "T12:00:00") : null);
                    }}
                    disabled={isView}
                  />
                )}
              />
            </div>

            <div className="grid gap-1.5" data-testid="field-final-date">
              <Label htmlFor="service-final-date">Entrega (Prazo)</Label>
              <Controller
                control={form.control}
                name="final_date"
                render={({ field }) => (
                  <Input
                    id="service-final-date"
                    type="date"
                    {...field}
                    value={
                      field.value instanceof Date
                        ? format(field.value as Date, "yyyy-MM-dd")
                        : ""
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      field.onChange(val ? new Date(val + "T12:00:00") : null);
                    }}
                    disabled={isView}
                  />
                )}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5" data-testid="field-payment-method">
              <Label>Método de Pagamento</Label>
              <Select
                disabled={isView}
                value={form.watch("payment_method") || "In_Cash"}
                onValueChange={(v) => form.setValue("payment_method", v as any)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Escolha o método" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="In_Cash">À Vista</SelectItem>
                  <SelectItem value="Installments">Parcelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.watch("payment_method") === "Installments" && (
              <div className="grid gap-1.5" data-testid="field-installments">
                <Label htmlFor="installments">
                  Número de Parcelas (Máx 6x)
                </Label>
                <Input
                  id="installments"
                  type="number"
                  min={1}
                  max={6}
                  {...form.register("installments", {
                    valueAsNumber: true,
                  })}
                  disabled={isView}
                />
              </div>
            )}
          </div>

          <div
            className="grid gap-1.5"
            data-testid="field-service-observations"
          >
            <Label htmlFor="service-observations">Observações Livres</Label>
            <ClickToCopy
              enabled={isView}
              value={form.watch("observations")}
              label="Observações"
            >
              <Input
                id="service-observations"
                {...form.register("observations")}
                placeholder="Notas internas…"
                disabled={isView}
                className={isView ? "pointer-events-none" : ""}
              />
            </ClickToCopy>
          </div>

          <div
            className="flex items-center justify-end gap-2 mt-4"
            data-testid="group-new-service-actions"
          >
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleOpenChange(false)}
              data-testid="button-cancel-new-service"
            >
              {isView ? "Fechar" : "Cancelar"}
            </Button>
            {initialData?.id && (
              <Button
                type="button"
                variant="outline"
                onClick={() => onFinancialAction?.(initialData)}
                className="gap-2"
              >
                <Receipt className="h-4 w-4" />
                Financeiro
              </Button>
            )}
            {!isView && (
              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
                data-testid="button-save-new-service"
              >
                {form.formState.isSubmitting && (
                  <Spinner className="mr-2 h-4 w-4" />
                )}
                {mode === "create" ? "Criar serviço" : "Atualizar serviço"}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FinancialDialog({
  open,
  onOpenChange,
  service,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service: any | null;
}) {
  const { orm } = useDb();
  const [payments, setPayments] = useState<any[]>([]);

  const fetchPayments = async () => {
    if (service?.id) {
      const p = await orm
        .select()
        .from(paymentsTable)
        .where(eq(paymentsTable.service_id, service.id))
        .orderBy(desc(paymentsTable.payment_date));
      setPayments(p);
    } else {
      setPayments([]);
    }
  };

  useEffect(() => {
    if (open) fetchPayments();
  }, [open, service?.id]);

  const totalPaid = useMemo(
    () => payments.reduce((acc, p) => acc + p.amount, 0),
    [payments],
  );
  const balance = (service?.price || 0) - totalPaid;

  const [newType, setNewType] = useState<any>("Pix");
  const [newAmount, setNewAmount] = useState<number>(0);
  const [newDate, setNewDate] = useState<string>(
    format(new Date(), "yyyy-MM-dd"),
  );

  const handleAddPayment = async () => {
    if (!service?.id || newAmount <= 0) return;
    const np = {
      id: uuidv7(),
      service_id: service.id,
      amount: newAmount,
      payment_type: newType,
      payment_date: new Date(newDate + "T12:00:00"),
      created_at: new Date(),
      updated_at: new Date(),
    };
    await orm.insert(paymentsTable).values(np);
    setNewAmount(0);
    fetchPayments();
  };

  const handleAddInstallment = async () => {
    if (!service?.id) return;
    const count = service.installments || 1;
    const amount = service.price / count;
    await orm.insert(paymentsTable).values({
      id: uuidv7(),
      service_id: service.id,
      amount: amount,
      payment_type: "Bank Transfer", // Default for installments? Or Pix?
      payment_date: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    });
    fetchPayments();
  };

  const handleDeletePayment = async (pid: string) => {
    await orm.delete(paymentsTable).where(eq(paymentsTable.id, pid));
    fetchPayments();
  };

  if (!service) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Dados Financeiros e Prazos</DialogTitle>
          <DialogDescription>
            Histórico de pagamentos e prazos para: {service.type}
            {service.final_date && (
              <span className="block text-xs font-semibold text-primary mt-1">
                Data Estimada de Entrega:{" "}
                {format(new Date(service.final_date), "dd/MM/yyyy")}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-bold">Histórico de Pagamentos</Label>
            <div className="flex gap-2">
              {service.payment_method === "Installments" &&
                (service.installments || 1) > 1 && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleAddInstallment}
                    className="h-7 text-xs gap-1"
                  >
                    <CalendarClock className="h-3 w-3" /> Adicionar Parcela
                  </Button>
                )}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3 items-end bg-muted/20 p-3 rounded-md border">
            <div className="grid gap-1.5">
              <Label className="text-[10px] uppercase font-bold">Tipo</Label>
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pix">Pix</SelectItem>
                  <SelectItem value="Credit Card">Cartão de Crédito</SelectItem>
                  <SelectItem value="Debit Card">Cartão de Débito</SelectItem>
                  <SelectItem value="Cash">Dinheiro</SelectItem>
                  <SelectItem value="Bank Transfer">Transferência</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-[10px] uppercase font-bold">Valor</Label>
              <Input
                type="number"
                value={newAmount}
                onChange={(e) => setNewAmount(Number(e.target.value))}
                className="h-8 text-xs"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-[10px] uppercase font-bold">
                Vencimento
              </Label>
              <Input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <Button
              type="button"
              size="sm"
              onClick={handleAddPayment}
              className="h-8 text-xs gap-1"
            >
              <Plus className="h-3 w-3" /> Adicionar
            </Button>
          </div>

          <div className="rounded-md border bg-background overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted text-muted-foreground uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Data</th>
                  <th className="px-3 py-2 text-left font-medium">Tipo</th>
                  <th className="px-3 py-2 text-right font-medium">Valor</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {payments.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-4 text-center text-muted-foreground italic"
                    >
                      Nenhum pagamento registrado.
                    </td>
                  </tr>
                ) : (
                  payments.map((p) => (
                    <tr
                      key={p.id}
                      className="hover:bg-muted/50 transition-colors"
                    >
                      <td className="px-3 py-2 whitespace-nowrap">
                        {format(new Date(p.payment_date), "dd/MM/yyyy")}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {p.payment_type === "Pix" && "Pix"}
                        {p.payment_type === "Credit Card" && "Crédito"}
                        {p.payment_type === "Debit Card" && "Débito"}
                        {p.payment_type === "Cash" && "Dinheiro"}
                        {p.payment_type === "Bank Transfer" && "Doc/Ted"}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap font-medium">
                        {currency(p.amount)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive"
                          onClick={() => handleDeletePayment(p.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-muted/30 rounded-lg p-3 space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Total do Serviço</span>
              <span>{currency(service.price)}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground border-b pb-2">
              <span>Total Pago</span>
              <span className="text-green-600 font-medium">
                {currency(totalPaid)}
              </span>
            </div>
            <div className="flex justify-between text-sm font-bold pt-1">
              <span>Saldo Restante</span>
              <div className="flex items-center gap-2">
                {balance <= 0 && (
                  <Badge className="bg-green-600 hover:bg-green-700 text-[10px] h-4">
                    PAGO
                  </Badge>
                )}
                <span
                  className={
                    balance > 0 ? "text-destructive" : "text-green-600"
                  }
                >
                  {currency(Math.max(0, balance))}
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={() => onOpenChange(false)}>Fechar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ServicesPage() {
  const { db, orm } = useDb();
  const { myId, connectedPeers } = useSync();
  const { toast } = useToast();
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
    <AppShell
      title="Serviços"
      subtitle="Acompanhe entregas e renda."
      right={
        <Button
          onClick={() => openDialog("create")}
          className="gap-2 cursor-pointer"
          data-testid="button-new-service-top"
        >
          <Plus className="h-4 w-4" />
          Novo serviço
        </Button>
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
                        Tente ajustar sua busca ou filtros para encontrar o que
                        procura.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                }
                renderItem={(s) => (
                  <div
                    key={s.id}
                    className="group flex items-center justify-between gap-4 p-4 hover:bg-muted/30 transition-colors"
                    data-testid={`row-service-${s.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div
                          className="truncate text-sm font-medium"
                          data-testid={`text-service-type-${s.id}`}
                        >
                          {s.type} {s.description && `- ${s.description}`}
                        </div>
                        <StatusBadge status={s.status} />
                        {s.total_paid >= s.price && s.price > 0 && (
                          <Badge className="bg-green-600 hover:bg-green-700 h-5 text-[10px] ml-1">
                            Faturado
                          </Badge>
                        )}
                      </div>
                      <div
                        className="mt-0.5 truncate text-xs text-muted-foreground"
                        data-testid={`text-service-meta-${s.id}`}
                      >
                        {clientsMap[s.client_id]?.name ||
                          "Cliente desconhecido"}{" "}
                        &middot;{" "}
                        {format(new Date(s.contract_date), "dd/MM/yyyy")}{" "}
                        &middot; {currency(s.price)}
                      </div>
                    </div>
                    <div
                      className="flex items-center gap-2"
                      data-testid={`group-service-actions-${s.id}`}
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="secondary"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openDialog("view", s)}
                            data-testid={`button-service-view-${s.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Visualizar</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="secondary"
                            size="icon"
                            className="h-8 w-8 text-blue-600"
                            onClick={() => openFinancialDialog(s)}
                            data-testid={`button-service-payments-${s.id}`}
                          >
                            <Receipt className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Pagamentos</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openDialog("edit", s)}
                            data-testid={`button-service-edit-${s.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Editar</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="destructive"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              setSelectedService(s);
                              setIsDeleteDialogOpen(true);
                            }}
                            data-testid={`button-service-delete-${s.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Excluir</TooltipContent>
                      </Tooltip>
                    </div>{" "}
                  </div>
                )}
              />
            </div>
          </ScrollArea>
        </Card>

        <Card className="panel-card h-fit" data-testid="card-services-summary">
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
                value={currency(totalRevenue)}
                testId="income"
              />
              <SummaryRow
                label="A receber"
                value={currency(totalToReceive)}
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
  );
}
