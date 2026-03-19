import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronsUpDown, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { v7 as uuidv7 } from "uuid";
import {
  Service,
  insertServiceSchema,
  NewService as NewServiceType,
} from "@/db/validations";
import { Spinner } from "@/components/ui/spinner";
import { useDb } from "@/db/context";
import { useLocalQuery } from "@/hooks/useLocalQuery";
import {
  servicesTable,
  serviceTypesArray,
  clientsTable,
  paymentsTable,
} from "@/db/schema";
import { and, isNotNull, ne } from "drizzle-orm";
import ClickToCopy from "@/components/ui/click-to-copy";
import { maskCurrency, parseCurrencyToNumber } from "@/lib/masks";

export type ServiceStatus = Service["status"];

interface ServiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit" | "view";
  initialData: any | null;
  onSave: (service: any) => Promise<void>;
  onFinancialAction?: (service: any) => void;
}

export function ServiceDialog({
  open,
  onOpenChange,
  mode,
  initialData,
  onSave,
  onFinancialAction,
}: ServiceDialogProps) {
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
          // @ts-ignore - added for the form
          payment_now: false,
          payment_amount: 0,
          payment_date: new Date(),
          payment_type: "Pix",
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
    const service_id = initialData?.id || uuidv7();
    const svc: Service = {
      ...(initialData || {}),
      ...data,
      status: data.status || "Draft",
      type: data.type || "Outros",
      description: data.description || null,
      id: service_id,
      contract_date: data.contract_date || new Date(),
      final_date: data.final_date || null,
      payment_method: data.payment_method || "In_Cash",
      installments: data.installments || null,
      observations: data.observations || null,
      created_at: initialData?.created_at || now,
      updated_at: now,
    };

    await onSave(svc);

    // Save payment if provided
    const formVals = form.getValues() as any;
    if (
      mode === "create" &&
      formVals.payment_now &&
      formVals.payment_amount > 0
    ) {
      const np = {
        id: uuidv7(),
        service_id: service_id,
        amount: formVals.payment_amount,
        payment_type: formVals.payment_type,
        payment_date: formVals.payment_date || new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      };
      await orm.insert(paymentsTable).values(np);
    }
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
                value={form.watch("price") || 0}
                label="Valor Base"
              >
                <Controller
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <Input
                      disabled={isView}
                      id="service-price"
                      value={maskCurrency(field.value || 0)}
                      onChange={(e) => {
                        const val = e.target.value;
                        field.onChange(parseCurrencyToNumber(val));
                      }}
                      className={isView ? "pointer-events-none" : ""}
                      data-testid="input-service-price"
                    />
                  )}
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

          {/* PAYMENT ACCORDION - Only for create mode */}
          {mode === "create" && (
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="payment" className="border-none">
                <AccordionTrigger className="py-2 text-sm text-primary hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4" />
                    Adicionar pagamento agora?
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-2 pb-4">
                  <div className="grid gap-3 p-4 rounded-xl border bg-muted/30">
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="checkbox"
                        id="payment_now"
                        {...form.register("payment_now" as any)}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <Label htmlFor="payment_now" className="cursor-pointer">
                        Registrar pagamento imediato
                      </Label>
                    </div>

                    {form.watch("payment_now" as any) && (
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="grid gap-1.5">
                          <Label>Data</Label>
                          <Controller
                            control={form.control}
                            name={"payment_date" as any}
                            render={({ field }) => (
                              <Input
                                type="date"
                                {...field}
                                value={
                                  field.value instanceof Date
                                    ? format(field.value as Date, "yyyy-MM-dd")
                                    : ""
                                }
                                onChange={(e) => {
                                  const val = e.target.value;
                                  field.onChange(
                                    val ? new Date(val + "T12:00:00") : null,
                                  );
                                }}
                              />
                            )}
                          />
                        </div>
                        <div className="grid gap-1.5">
                          <Label>Valor</Label>
                          <Controller
                            control={form.control}
                            name={"payment_amount" as any}
                            render={({ field }) => (
                              <Input
                                value={maskCurrency(field.value || 0)}
                                onChange={(e) => {
                                  field.onChange(
                                    parseCurrencyToNumber(e.target.value),
                                  );
                                }}
                              />
                            )}
                          />
                        </div>
                        <div className="grid gap-1.5">
                          <Label>Forma</Label>
                          <Select
                            value={form.watch("payment_type" as any)}
                            onValueChange={(v) =>
                              form.setValue("payment_type" as any, v)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Pix">Pix</SelectItem>
                              <SelectItem value="Credit Card">
                                Cartão de Crédito
                              </SelectItem>
                              <SelectItem value="Debit Card">
                                Cartão de Débito
                              </SelectItem>
                              <SelectItem value="Cash">Dinheiro</SelectItem>
                              <SelectItem value="Bank Transfer">
                                Transferência
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}

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
