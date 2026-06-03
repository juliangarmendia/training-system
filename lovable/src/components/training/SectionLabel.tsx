import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function SectionLabel({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium",
        className,
      )}
      {...props}
    />
  );
}
