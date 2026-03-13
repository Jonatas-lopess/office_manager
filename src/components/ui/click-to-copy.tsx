import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function ClickToCopy({
  children,
  value,
  label,
  enabled,
}: {
  children: React.ReactNode;
  value: string | number | null | undefined;
  label: string;
  enabled: boolean;
}) {
  const { toast } = useToast();
  const handleCopy = () => {
    if (!enabled || (value !== 0 && !value)) return;
    navigator.clipboard.writeText(String(value));
    toast({
      title: "Copiado!",
      description: `${label} copiado para a área de transferência.`,
    });
  };

  return (
    <div
      onClick={handleCopy}
      className={cn("w-full", enabled && "cursor-copy")}
    >
      {children}
    </div>
  );
}
