import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { TagInput, type TagOption } from "@/components/ui/tag-input";
import ClickToCopy from "@/components/ui/click-to-copy";

interface RefundListItemProps {
  service: {
    id: string;
    restitution_date: number | Date | null;
    description: string | null;
  };
  client: {
    id: string;
    name: string;
    cpf: string | null;
    birth_date: number | Date | null;
  };
  tagIds: string[];
  allTags: TagOption[];
  onRestitutionDateChange: (serviceId: string, date: Date | null) => void;
  onTagsChange: (serviceId: string, tagIds: string[]) => void;
  onCreateTag: (name: string, color: string) => Promise<TagOption>;
  onClientClick: (clientId: string) => void;
}

export function RefundListItem({
  service,
  client,
  tagIds,
  allTags,
  onRestitutionDateChange,
  onTagsChange,
  onCreateTag,
  onClientClick,
}: RefundListItemProps) {
  return (
    <div
      className="grid grid-cols-1 gap-2 px-4 py-3 hover:bg-muted/30 transition-colors sm:grid-cols-[1.6fr_1.4fr_1fr_1fr_1fr_1.4fr] sm:items-center sm:gap-3"
      data-testid={`row-refund-${service.id}`}
    >
      <button
        type="button"
        onClick={() => onClientClick(client.id)}
        className="truncate text-left text-sm font-medium hover:text-primary hover:underline"
        data-testid={`text-refund-client-${service.id}`}
      >
        {client.name || "Desconhecido"}
      </button>

      <div
        className="truncate text-sm text-muted-foreground"
        title={service.description || undefined}
        data-testid={`text-refund-description-${service.id}`}
      >
        {service.description || "—"}
      </div>

      <ClickToCopy
        enabled={!!client.cpf}
        value={client.cpf || ""}
        label="CPF"
        className="truncate text-sm text-muted-foreground"
        data-testid={`text-refund-cpf-${service.id}`}
      >
        {client.cpf || "—"}
      </ClickToCopy>

      <div
        className="truncate text-sm text-muted-foreground"
        data-testid={`text-refund-birthdate-${service.id}`}
      >
        {client.birth_date ? format(new Date(client.birth_date), "dd/MM/yyyy") : "—"}
      </div>

      <Input
        type="date"
        value={
          service.restitution_date
            ? format(new Date(service.restitution_date), "yyyy-MM-dd")
            : ""
        }
        onChange={(e) => {
          const val = e.target.value;
          onRestitutionDateChange(
            service.id,
            val ? new Date(val + "T12:00:00") : null,
          );
        }}
        className="h-8 text-sm"
        data-testid={`input-refund-date-${service.id}`}
      />

      <TagInput
        allTags={allTags}
        value={tagIds}
        onChange={(ids) => onTagsChange(service.id, ids)}
        onCreateTag={onCreateTag}
        className="sm:min-w-0"
      />
    </div>
  );
}
