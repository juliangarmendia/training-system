import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type SetStatus = "done" | "active" | "pending";

interface SetRowProps {
  index: number;
  weight: number;
  reps: number;
  unit?: string;
  status: SetStatus;
  onLog?: () => void;
}

export function SetRow({
  index,
  weight,
  reps,
  unit = "LBS",
  status,
  onLog,
}: SetRowProps) {
  const isDone = status === "done";
  const isActive = status === "active";

  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-xl p-4 transition-colors",
        isDone && "bg-brand/5 ring-1 ring-brand/30",
        isActive && "ring-1 ring-white/20",
        !isDone && !isActive && "ring-1 ring-white/5 opacity-40",
      )}
    >
      <div className="flex items-center gap-4">
        <span
          className={cn(
            "text-xs font-display font-semibold tabular-nums",
            isDone ? "text-brand" : "text-muted-foreground",
          )}
        >
          SET {String(index).padStart(2, "0")}
        </span>
        <span className="text-lg font-display tabular-nums">
          {weight}{" "}
          <span className="text-[10px] text-muted-foreground">{unit}</span>{" "}
          ×{" "}
          {isDone ? (
            reps
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </span>
      </div>

      {isDone && (
        <div className="size-6 bg-brand rounded-full flex items-center justify-center">
          <Check className="size-3.5 text-surface stroke-[3]" />
        </div>
      )}
      {isActive && (
        <button
          onClick={onLog}
          className="h-8 px-3 ring-1 ring-white/15 rounded-lg text-[10px] font-semibold uppercase tracking-widest hover:bg-white/5 active:scale-95 transition-all"
        >
          Log Set
        </button>
      )}
    </div>
  );
}
