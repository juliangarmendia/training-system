import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function MetricCard({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "ring-1 ring-border rounded-2xl bg-white/[0.02] backdrop-blur-sm",
        className,
      )}
      {...props}
    />
  );
}
