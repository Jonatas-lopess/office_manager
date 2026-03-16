import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import React from "react";

interface ClickToCopyProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  value: string | number | null | undefined;
  label: string;
  enabled: boolean;
}

const ClickToCopy = React.forwardRef<HTMLDivElement, ClickToCopyProps>(
  ({ children, value, label, enabled, className, onClick, ...props }, ref) => {
    const { toast } = useToast();

    const handleCopy = (e: React.MouseEvent<HTMLDivElement>) => {
      // Call external onClick if it exists (e.g. from Radix PopoverTrigger)
      onClick?.(e);

      if (!enabled || (value !== 0 && !value)) return;
      
      navigator.clipboard.writeText(String(value));
      toast({
        title: "Copiado!",
        description: `${label} copiado para a área de transferência.`,
      });
    };

    return (
      <div
        ref={ref}
        onClick={handleCopy}
        className={cn("w-full", enabled && "cursor-copy", className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

ClickToCopy.displayName = "ClickToCopy";

export default ClickToCopy;
