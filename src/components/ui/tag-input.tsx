import { useState, useMemo } from "react";
import { X, Plus, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

const TAG_COLORS = [
  "#6366f1", // indigo
  "#f43f5e", // rose
  "#10b981", // emerald
  "#f59e0b", // amber
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
] as const;

export interface TagOption {
  id: string;
  name: string;
  color: string;
}

interface TagInputProps {
  /** All available tags in the system */
  allTags: TagOption[];
  /** Currently selected tag IDs */
  value: string[];
  /** Called when selection changes */
  onChange: (tagIds: string[]) => void;
  /** Called when a new tag needs to be created */
  onCreateTag: (name: string, color: string) => Promise<TagOption>;
  /** Read-only mode — just renders pills, no editing */
  readOnly?: boolean;
  className?: string;
}

export function TagInput({
  allTags,
  value,
  onChange,
  onCreateTag,
  readOnly = false,
  className,
}: TagInputProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [newTagColor, setNewTagColor] = useState<string>(TAG_COLORS[0]);
  const [creating, setCreating] = useState(false);

  const selectedTags = useMemo(
    () => allTags.filter((t) => value.includes(t.id)),
    [allTags, value],
  );

  const filteredTags = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return allTags;
    return allTags.filter((t) => t.name.toLowerCase().includes(q));
  }, [allTags, search]);

  const exactMatch = useMemo(
    () =>
      allTags.some((t) => t.name.toLowerCase() === search.toLowerCase().trim()),
    [allTags, search],
  );

  const handleToggle = (tagId: string) => {
    if (value.includes(tagId)) {
      onChange(value.filter((id) => id !== tagId));
    } else {
      onChange([...value, tagId]);
    }
  };

  const handleRemove = (tagId: string) => {
    onChange(value.filter((id) => id !== tagId));
  };

  const handleCreate = async () => {
    const name = search.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const newTag = await onCreateTag(name, newTagColor);
      onChange([...value, newTag.id]);
      setSearch("");
      setNewTagColor(TAG_COLORS[0]);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      className={cn("grid gap-1.5", className)}
      data-testid="field-service-tags"
    >
      {/* Selected tags */}
      <div className="flex flex-wrap gap-1.5 min-h-7">
        {selectedTags.map((tag) => (
          <Badge
            key={tag.id}
            className="gap-1 pr-1 text-xs font-medium text-white border-0 transition-all hover:opacity-90"
            style={{ backgroundColor: tag.color }}
            data-testid={`tag-pill-${tag.id}`}
          >
            {tag.name}
            {!readOnly && (
              <button
                type="button"
                onClick={() => handleRemove(tag.id)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-black/20 transition-colors"
                data-testid={`tag-remove-${tag.id}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}

        {!readOnly && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs gap-1 border-dashed"
                data-testid="button-add-tag"
              >
                <Plus className="h-3 w-3" />
                Etiqueta
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-64 p-0"
              align="start"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <Command shouldFilter={false}>
                <div className="p-2 border-b">
                  <Input
                    placeholder="Buscar ou criar etiqueta…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && search.trim() && !exactMatch) {
                        e.preventDefault();
                        handleCreate();
                      }
                    }}
                    className="h-8 text-sm"
                    autoFocus
                    data-testid="input-tag-search"
                  />
                </div>
                <CommandList className="max-h-48">
                  <CommandEmpty className="py-2 text-center text-xs text-muted-foreground">
                    Nenhuma etiqueta encontrada.
                  </CommandEmpty>
                  <CommandGroup>
                    {filteredTags.map((tag) => {
                      const isSelected = value.includes(tag.id);
                      return (
                        <CommandItem
                          key={tag.id}
                          value={tag.name}
                          onSelect={() => handleToggle(tag.id)}
                          className="flex items-center gap-2 cursor-pointer"
                          data-testid={`tag-option-${tag.id}`}
                        >
                          <span
                            className="h-3 w-3 rounded-full shrink-0 border"
                            style={{ backgroundColor: tag.color }}
                          />
                          <span className="flex-1 truncate text-sm">
                            {tag.name}
                          </span>
                          {isSelected && (
                            <Check className="h-4 w-4 text-primary shrink-0" />
                          )}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>

                {/* Create new tag section */}
                {search.trim() && !exactMatch && (
                  <div className="border-t p-2 space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {TAG_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setNewTagColor(color)}
                          className={cn(
                            "h-5 w-5 rounded-full border-2 transition-all",
                            newTagColor === color
                              ? "border-foreground scale-110"
                              : "border-transparent hover:border-muted-foreground/50",
                          )}
                          style={{ backgroundColor: color }}
                          data-testid={`tag-color-${color}`}
                        />
                      ))}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="w-full h-7 text-xs gap-1"
                      onClick={handleCreate}
                      disabled={creating}
                      data-testid="button-create-tag"
                    >
                      <Plus className="h-3 w-3" />
                      Criar &quot;{search.trim()}&quot;
                    </Button>
                  </div>
                )}
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}

export { TAG_COLORS };
