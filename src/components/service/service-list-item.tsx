import { format } from "date-fns";
import { Eye, Receipt, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StatusBadge, currency } from "@/components/panel/panel-kit";

interface ServiceListItemProps {
  service: any;
  clientName: string;
  onView: (s: any) => void;
  onFinancial: (s: any) => void;
  onEdit: (s: any) => void;
  onDelete: (s: any) => void;
}

export function ServiceListItem({
  service,
  clientName,
  onView,
  onFinancial,
  onEdit,
  onDelete,
}: ServiceListItemProps) {
  return (
    <div
      className="group flex items-center justify-between gap-4 p-4 hover:bg-muted/30 transition-colors"
      data-testid={`row-service-${service.id}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div
            className="truncate text-sm font-medium"
            data-testid={`text-service-type-${service.id}`}
          >
            {service.type} {service.description && `- ${service.description}`}
          </div>
          <StatusBadge status={service.status} />
          {service.total_paid >= service.price && service.price > 0 && (
            <Badge className="bg-green-600 hover:bg-green-700 h-5 text-[10px] ml-1">
              Faturado
            </Badge>
          )}
        </div>
        <div
          className="mt-0.5 truncate text-xs text-muted-foreground"
          data-testid={`text-service-meta-${service.id}`}
        >
          {clientName} &middot;{" "}
          {format(new Date(service.contract_date), "dd/MM/yyyy")} &middot;{" "}
          {currency(service.price)}
        </div>
      </div>
      <div
        className="flex items-center gap-2"
        data-testid={`group-service-actions-${service.id}`}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              size="icon"
              className="h-8 w-8"
              onClick={() => onView(service)}
              data-testid={`button-service-view-${service.id}`}
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
              onClick={() => onFinancial(service)}
              data-testid={`button-service-payments-${service.id}`}
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
              onClick={() => onEdit(service)}
              data-testid={`button-service-edit-${service.id}`}
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
              onClick={() => onDelete(service)}
              data-testid={`button-service-delete-${service.id}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Excluir</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
