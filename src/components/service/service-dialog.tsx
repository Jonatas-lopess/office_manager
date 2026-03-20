import { useEffect, useState } from "react";
import { format } from "date-fns";
import {
  useForm,
  Controller,
  FormProvider,
  useFormContext,
} from "react-hook-form";
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
import { serviceTypesArray, paymentsTable } from "@/db/schema";
import ClickToCopy from "@/components/ui/click-to-copy";
import { maskCurrencyInput, parseFreeFormCurrency } from "@/lib/masks";

export type ServiceStatus = Service["status"];

interface ServiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit" | "view";
  initialData: any | null;
  clients: any[];
  historicDescriptions: string[];
  onSave: (service: any) => Promise<void>;
  onFinancialAction?: (service: any) => void;
}

// Thin shell — only renders the Dialog primitive; inner content mounts on open
export function ServiceDialog(props: ServiceDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <ServiceDialogContent {...props} />}
    </Dialog>
  );
}

import React from "react";
// --- Sub-components (Memoized for performance) ---

const ClientSection = React.memo(
  ({ clients, isView }: { clients: any[]; isView: boolean }) => {
    const {
      setValue,
      watch,
      formState: { errors },
    } = useFormContext<NewServiceType>();
    const watchedClientId = watch("client_id");

    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [limit, setLimit] = useState(20);

    const filteredClients = React.useMemo(() => {
      const searchLower = search.toLowerCase();
      return clients.filter((c) => c.name.toLowerCase().includes(searchLower));
    }, [clients, search]);

    const displayedClients = React.useMemo(() => {
      const sliced = filteredClients.slice(0, limit);
      const selected = clients.find((c) => c.id === watchedClientId);
      const isSelectedIncluded = sliced.some((c) => c.id === watchedClientId);
      const isSelectedInFiltered = filteredClients.some(
        (c) => c.id === watchedClientId,
      );

      if (selected && isSelectedInFiltered && !isSelectedIncluded) {
        return [...sliced, selected];
      }
      return sliced;
    }, [filteredClients, limit, watchedClientId, clients]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
      const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
      if (scrollHeight - scrollTop <= clientHeight + 50) {
        setLimit((prev) => Math.min(prev + 20, filteredClients.length));
      }
    };

    const selectedClient = React.useMemo(
      () => clients.find((c) => c.id === watchedClientId),
      [clients, watchedClientId],
    );

    return (
      <div className="grid gap-1.5" data-testid="field-service-client">
        <Label htmlFor="service-client" data-testid="label-service-client">
          Cliente *
        </Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id="service-client"
              variant="outline"
              role="combobox"
              disabled={isView}
              aria-expanded={open}
              className={cn(
                "w-full justify-between font-normal text-left h-auto min-h-9 py-2",
                !watchedClientId && "text-muted-foreground",
                isView && "pointer-events-none",
              )}
              data-testid="select-service-client"
            >
              <span className="truncate">
                {selectedClient?.name || "Selecione um cliente"}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[var(--radix-popover-trigger-width)] p-0"
            align="start"
          >
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Buscar cliente..."
                value={search}
                onValueChange={(val) => {
                  setSearch(val);
                  setLimit(20);
                }}
              />
              <CommandList className="max-h-60" onScroll={handleScroll}>
                <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                <CommandGroup>
                  {displayedClients.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={c.name}
                      onSelect={() => {
                        setValue("client_id", c.id, { shouldValidate: true });
                        setOpen(false);
                        setSearch("");
                        setLimit(20);
                      }}
                      data-testid={`option-service-client-${c.id}`}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          watchedClientId === c.id
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                      />
                      {c.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {errors.client_id && (
          <span className="text-xs text-destructive">
            {errors.client_id.message as string}
          </span>
        )}
      </div>
    );
  },
);

ClientSection.displayName = "ClientSection";

const BasicInfoSection = React.memo(({ isView }: { isView: boolean }) => {
  const {
    control,
    setValue,
    watch,
    formState: { errors },
  } = useFormContext<NewServiceType>();
  const watchedType = watch("type");
  const watchedPrice = watch("price");

  return (
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
          value={watchedType ?? undefined}
          onValueChange={(v) => setValue("type", v as any)}
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
        {errors.type && (
          <span className="text-xs text-destructive">
            {errors.type.message as string}
          </span>
        )}
      </div>

      <div className="grid gap-1.5" data-testid="field-service-price">
        <Label htmlFor="service-price">Valor Base</Label>
        <ClickToCopy
          enabled={isView}
          value={watchedPrice || 0}
          label="Valor Base"
        >
          <Controller
            control={control}
            name="price"
            render={({ field }) => {
              const [localValue, setLocalValue] = useState(() => 
                (field.value || 0).toString().replace(".", ",")
              );

              useEffect(() => {
                const currentVal = (field.value || 0).toString().replace(".", ",");
                if (parseFreeFormCurrency(localValue) !== field.value) {
                  setLocalValue(currentVal);
                }
              }, [field.value]);

              return (
                <Input
                  disabled={isView}
                  id="service-price"
                  type="text"
                  value={localValue}
                  onChange={(e) => {
                    const masked = maskCurrencyInput(e.target.value);
                    setLocalValue(masked);
                    field.onChange(parseFreeFormCurrency(masked));
                  }}
                  onBlur={() => {
                    const normalized = (field.value || 0).toString().replace(".", ",");
                    setLocalValue(normalized);
                  }}
                  className={isView ? "pointer-events-none" : ""}
                  data-testid="input-service-price"
                />
              );
            }}
          />
        </ClickToCopy>
      </div>
    </div>
  );
});

BasicInfoSection.displayName = "BasicInfoSection";

const ServiceDetailsSection = React.memo(
  ({
    isView,
    historicDescriptions,
  }: {
    isView: boolean;
    historicDescriptions: string[];
  }) => {
    const {
      control,
      setValue,
      watch,
      formState: { errors },
    } = useFormContext<NewServiceType>();

    const watchedDescription = watch("description");
    const [open, setOpen] = useState(false);

    const filteredDescriptions = React.useMemo(() => {
      const searchLower = watchedDescription?.toLowerCase() || "";
      const filtered = !searchLower
        ? historicDescriptions
        : historicDescriptions.filter((desc) =>
            desc.toLowerCase().includes(searchLower),
          );
      return filtered.slice(0, 10);
    }, [watchedDescription, historicDescriptions]);

    return (
      <div className="grid gap-1.5" data-testid="field-service-desc">
        <Label htmlFor="service-description">Descrição Resumida</Label>
        <Popover
          open={open && !isView && filteredDescriptions.length > 0}
          onOpenChange={setOpen}
        >
          <PopoverTrigger asChild>
            <div className="w-full relative">
              <ClickToCopy
                enabled={isView}
                value={watchedDescription}
                label="Descrição"
              >
                <Controller
                  control={control}
                  name="description"
                  render={({ field }) => (
                    <Input
                      {...field}
                      value={field.value || ""}
                      id="service-description"
                      placeholder="Notas rápidas sobre a entrega"
                      autoComplete="off"
                      onFocus={() => setOpen(true)}
                      onBlur={() => {
                        // Delay closing to allow clicking suggestions
                        setTimeout(() => setOpen(false), 200);
                      }}
                      onPointerDown={(e) => {
                        // Prevent the PopoverTrigger from toggling it off when clicking
                        if (open) e.stopPropagation();
                      }}
                      disabled={isView}
                      className={cn(isView && "pointer-events-none")}
                      data-testid="input-service-description"
                    />
                  )}
                />
              </ClickToCopy>
            </div>
          </PopoverTrigger>
          <PopoverContent
            className="w-[var(--radix-popover-trigger-width)] p-0"
            align="start"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <Command shouldFilter={false}>
              <CommandList className="max-h-50">
                <CommandGroup>
                  {filteredDescriptions.map((desc) => (
                    <CommandItem
                      key={desc}
                      value={desc}
                      onSelect={() => {
                        setValue("description", desc, { shouldValidate: true });
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          watchedDescription === desc
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
        {errors.description && (
          <span className="text-xs text-destructive">
            {errors.description.message as string}
          </span>
        )}
      </div>
    );
  },
);

ServiceDetailsSection.displayName = "ServiceDetailsSection";

const DatesSection = React.memo(({ isView }: { isView: boolean }) => {
  const { control } = useFormContext<NewServiceType>();

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="grid gap-1.5" data-testid="field-service-status">
        <Label htmlFor="service-status">Status</Label>
        <Controller
          control={control}
          name="status"
          render={({ field }) => (
            <Select
              disabled={isView}
              value={field.value}
              onValueChange={field.onChange}
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
          )}
        />
      </div>

      <div className="grid gap-1.5" data-testid="field-contract-date">
        <Label htmlFor="service-contract-date">Contrato</Label>
        <Controller
          control={control}
          name="contract_date"
          render={({ field }) => (
            <Input
              id="service-contract-date"
              type="date"
              {...field}
              value={
                field.value instanceof Date
                  ? format(field.value, "yyyy-MM-dd")
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
          control={control}
          name="final_date"
          render={({ field }) => (
            <Input
              id="service-final-date"
              type="date"
              {...field}
              value={
                field.value instanceof Date
                  ? format(field.value, "yyyy-MM-dd")
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
  );
});

DatesSection.displayName = "DatesSection";

const AdditionalDetailsAccordion = React.memo(
  ({ isView }: { isView: boolean }) => {
    const { register, watch } = useFormContext<NewServiceType>();
    const watchedObservations = watch("observations");

    return (
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="additional-details" className="border-none">
          <AccordionTrigger className="py-2 text-sm text-primary hover:no-underline px-0">
            Informações Adicionais (Status, Datas e Observações)
          </AccordionTrigger>
          <AccordionContent className="pt-2 pb-1 space-y-4">
            <DatesSection isView={isView} />
            <div
              className="grid gap-1.5"
              data-testid="field-service-observations"
            >
              <Label htmlFor="service-observations">Observações Livres</Label>
              <ClickToCopy
                enabled={isView}
                value={watchedObservations}
                label="Observações"
              >
                <Input
                  id="service-observations"
                  {...register("observations")}
                  placeholder="Notas internas…"
                  disabled={isView}
                  className={isView ? "pointer-events-none" : ""}
                />
              </ClickToCopy>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    );
  },
);

AdditionalDetailsAccordion.displayName = "AdditionalDetailsAccordion";

const PaymentMethodSection = React.memo(({ isView }: { isView: boolean }) => {
  const { register, setValue, watch } = useFormContext<NewServiceType>();

  const watchedPaymentMethod = watch("payment_method");

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-1.5" data-testid="field-payment-method">
        <Label>Método de Pagamento</Label>
        <Select
          disabled={isView}
          value={watchedPaymentMethod || "In_Cash"}
          onValueChange={(v) => setValue("payment_method", v as any)}
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
      {watchedPaymentMethod === "Installments" && (
        <div className="grid gap-1.5" data-testid="field-installments">
          <Label htmlFor="installments">Número de Parcelas (Máx 6x)</Label>
          <Input
            id="installments"
            type="number"
            min={1}
            max={6}
            {...register("installments", { valueAsNumber: true })}
            disabled={isView}
          />
        </div>
      )}
    </div>
  );
});

PaymentMethodSection.displayName = "PaymentMethodSection";

const InitialPaymentAccordion = React.memo(() => {
  const { control, setValue, watch } = useFormContext<any>();

  const watchedPaymentType = watch("payment_type");

  return (
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
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label>Data</Label>
                <Controller
                  control={control}
                  name="payment_date"
                  render={({ field }) => (
                    <Input
                      type="date"
                      {...field}
                      value={
                        field.value instanceof Date
                          ? format(field.value, "yyyy-MM-dd")
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
                  control={control}
                  name="payment_amount"
                  render={({ field }) => {
                    const [localValue, setLocalValue] = useState(() => 
                      (field.value || 0).toString().replace(".", ",")
                    );

                    useEffect(() => {
                      const currentVal = (field.value || 0).toString().replace(".", ",");
                      if (parseFreeFormCurrency(localValue) !== field.value) {
                        setLocalValue(currentVal);
                      }
                    }, [field.value]);

                    return (
                      <Input
                        type="text"
                        value={localValue}
                        onChange={(e) => {
                          const masked = maskCurrencyInput(e.target.value);
                          setLocalValue(masked);
                          field.onChange(parseFreeFormCurrency(masked));
                        }}
                        onBlur={() => {
                          const normalized = (field.value || 0).toString().replace(".", ",");
                          setLocalValue(normalized);
                        }}
                      />
                    );
                  }}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Forma</Label>
                <Select
                  value={watchedPaymentType}
                  onValueChange={(v) => setValue("payment_type", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pix">Pix</SelectItem>
                    <SelectItem value="Credit Card">
                      Cartão de Crédito
                    </SelectItem>
                    <SelectItem value="Debit Card">Cartão de Débito</SelectItem>
                    <SelectItem value="Cash">Dinheiro</SelectItem>
                    <SelectItem value="Bank Transfer">Transferência</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
});

InitialPaymentAccordion.displayName = "InitialPaymentAccordion";

// Inner component: all hooks (including useLocalQuery DB subscriptions)
// only run while the dialog is actually open.
function ServiceDialogContent({
  open,
  onOpenChange,
  mode,
  initialData,
  clients,
  historicDescriptions,
  onSave,
  onFinancialAction,
}: ServiceDialogProps) {
  const { orm } = useDb();

  const form = useForm<NewServiceType>({
    resolver: zodResolver(insertServiceSchema),
    defaultValues: initialData || {
      type: "Outros",
      status: "In progress",
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
          status: initialData.status || "In progress",
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
          status: "In progress",
          price: 0,
          description: "",
          client_id: "",
          contract_date: new Date(),
          final_date: null,
          payment_method: "In_Cash",
          installments: 1,
          observations: "",
          payment_amount: 0,
          payment_date: new Date(),
          payment_type: "Pix",
        });
      }
    }
  }, [open, initialData, form]);

  const { status, final_date: finalDate } = form.watch();

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
    if (mode === "create" && formVals.payment_amount > 0) {
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

      <FormProvider {...form}>
        <form
          autoComplete="off"
          onSubmit={form.handleSubmit(onSubmit, onError)}
          className="grid gap-3 mt-4"
          data-testid="form-new-service"
        >
          <ClientSection clients={clients} isView={isView} />
          <BasicInfoSection isView={isView} />
          <ServiceDetailsSection
            isView={isView}
            historicDescriptions={historicDescriptions}
          />
          <PaymentMethodSection isView={isView} />
          <AdditionalDetailsAccordion isView={isView} />

          {mode === "create" && <InitialPaymentAccordion />}

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
      </FormProvider>
    </DialogContent>
  );
}
