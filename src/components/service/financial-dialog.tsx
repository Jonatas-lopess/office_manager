import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Plus, Trash2, CalendarClock, BadgeDollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { currency } from "@/components/panel/panel-kit";
import { v7 as uuidv7 } from "uuid";
import { useDb } from "@/db/context";
import { paymentsTable } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { maskCurrency, parseCurrencyToNumber } from "@/lib/masks";

interface FinancialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service: any | null;
  isUnlocked?: boolean;
}

export function FinancialDialog({
  open,
  onOpenChange,
  service,
  isUnlocked = true,
}: FinancialDialogProps) {
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
      payment_type: "Bank Transfer",
      payment_date: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    });
    fetchPayments();
  };

  const handleSettleService = async () => {
    if (!service?.id || balance <= 0) return;
    await orm.insert(paymentsTable).values({
      id: uuidv7(),
      service_id: service.id,
      amount: balance,
      payment_type: "Pix",
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
              {service.payment_method === "In_Cash" && balance > 0 && (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSettleService}
                  className="h-7 text-xs gap-1 border-emerald-500/20 bg-emerald-500/5 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700"
                >
                  <BadgeDollarSign className="h-3 w-3" /> Adicionar Pagamento
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
                value={maskCurrency(newAmount)}
                onChange={(e) =>
                  setNewAmount(parseCurrencyToNumber(e.target.value))
                }
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
                        {isUnlocked ? currency(p.amount) : "••••••"}
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
              <span>{isUnlocked ? currency(service.price) : "••••••"}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground border-b pb-2">
              <span>Total Pago</span>
              <span className="text-green-600 font-medium">
                {isUnlocked ? currency(totalPaid) : "••••••"}
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
                  {isUnlocked ? currency(Math.max(0, balance)) : "••••••"}
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
