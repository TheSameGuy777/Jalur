import { cn } from "@/lib/utils";

/** Stacked bar: used (solid) + pending (striped/lighter). */
export function BudgetBar({ usedPct, pendingPct, over, className, label }: { usedPct: number; pendingPct: number; over?: boolean; className?: string; label?: string }) {
  const u = Math.max(0, Math.min(100, usedPct));
  const p = Math.max(0, Math.min(100 - u, pendingPct));
  return (
    <div
      className={cn("flex h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(u + p)}
    >
      <div className={cn("h-full transition-all", over ? "bg-red-500" : u + p > 85 ? "bg-amber-500" : "bg-primary")} style={{ width: `${u}%` }} />
      <div className={cn("h-full transition-all", over ? "bg-red-300" : "bg-primary/35")} style={{ width: `${p}%` }} />
    </div>
  );
}
