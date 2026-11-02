import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { navigate } from "@/lib/router";
import type { Category, Status } from "@/lib/types";
import { cn } from "@/lib/utils";
import { STATUS_META } from "@/lib/workflow";

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const m = STATUS_META[status];
  return (
    <Badge tone={m.tone} dot className={className}>
      {m.label}
    </Badge>
  );
}

export function CategoryTag({ category, className }: { category?: Category; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm text-muted-foreground", className)}>
      <span className="size-2 shrink-0 rounded-full" style={{ background: category?.color ?? "#999" }} aria-hidden />
      <span className="truncate">{category?.name ?? "Uncategorised"}</span>
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  back,
  meta,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: string;
  meta?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        {back && (
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? window.history.back() : navigate(back))}
            className="focus-ring mt-1 hidden size-10 shrink-0 items-center justify-center rounded-full bg-card shadow-soft transition hover:scale-105 md:inline-flex"
            aria-label="Go back"
          >
            <ArrowLeft className="size-4" />
          </button>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="mb-1 text-sm text-muted-foreground">{eyebrow}</p>}
          <h1 className="text-3xl font-light leading-tight tracking-tight text-balance md:text-[2.5rem]">{title}</h1>
          {description && <div className="mt-2 text-sm text-muted-foreground">{description}</div>}
        </div>
      </div>
      {(actions || meta) && (
        <div className="flex shrink-0 flex-wrap items-end gap-3">
          {meta}
          {actions}
        </div>
      )}
    </div>
  );
}

export function StatCard({
  label,
  value,
  unit,
  hint,
  icon,
  tone,
  onClick,
  active,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "yellow" | "green" | "red" | "blue" | "gray";
  onClick?: () => void;
  active?: boolean;
}) {
  const toneDot = { yellow: "bg-amber-400", green: "bg-emerald-500", red: "bg-red-500", blue: "bg-blue-500", gray: "bg-zinc-400" };
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "focus-ring group flex min-h-[7.5rem] flex-col justify-between rounded-xl border border-border/70 bg-card p-4 text-left shadow-soft transition md:p-5",
        onClick && "hover:-translate-y-0.5 hover:shadow-lg",
        active && "ring-2 ring-primary",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-2 text-xs leading-tight text-muted-foreground md:text-sm">
          {tone && <span className={cn("size-2 rounded-full", toneDot[tone])} aria-hidden />}
          {label}
        </span>
        {icon && <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>}
      </div>
      <div className="mt-3">
        <span className="text-3xl font-light tracking-tight md:text-4xl">{value}</span>
        {unit && <span className="ml-1.5 text-sm text-muted-foreground">{unit}</span>}
        {hint && <div className="mt-1 truncate text-xs text-muted-foreground">{hint}</div>}
      </div>
    </Comp>
  );
}

/** Friendly inline illustration for empty states (no external assets). */
function EmptyIllustration() {
  return (
    <svg viewBox="0 0 200 140" className="h-32 w-auto" aria-hidden>
      <defs>
        <linearGradient id="ef-g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#5f7f88" />
          <stop offset="1" stopColor="#1fb39e" />
        </linearGradient>
      </defs>
      <ellipse cx="100" cy="126" rx="62" ry="7" className="fill-muted" />
      <rect x="58" y="18" width="84" height="104" rx="10" className="fill-card stroke-border" strokeWidth="2" />
      <path d="M58 108 l10 8 10-8 10 8 10-8 10 8 10-8 10 8 14-8" className="stroke-border" strokeWidth="2" fill="none" />
      <rect x="70" y="34" width="36" height="6" rx="3" fill="url(#ef-g)" />
      <rect x="70" y="50" width="60" height="5" rx="2.5" className="fill-muted" />
      <rect x="70" y="62" width="48" height="5" rx="2.5" className="fill-muted" />
      <rect x="70" y="74" width="54" height="5" rx="2.5" className="fill-muted" />
      <rect x="70" y="90" width="28" height="7" rx="3.5" className="fill-muted" />
      <rect x="104" y="88" width="26" height="11" rx="5.5" fill="url(#ef-g)" />
      <circle cx="152" cy="34" r="14" fill="url(#ef-g)" />
      <path d="M146 34 l4 4 8-8" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M40 46 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" fill="#f59e0b" />
      <path d="M160 82 l1.5 3.5 3.5 1.5 -3.5 1.5 -1.5 3.5 -1.5 -3.5 -3.5 -1.5 3.5 -1.5z" fill="#14b8a6" />
      <circle cx="44" cy="92" r="3" className="fill-border" />
    </svg>
  );
}

export function EmptyState({ title, description, action, compact }: { title: string; description?: string; action?: { label: string; to: string; icon?: ReactNode }; compact?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 text-center", compact ? "py-8" : "py-14")}>
      <EmptyIllustration />
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && (
        <Button className="mt-5" onClick={() => navigate(action.to)}>
          {action.icon}
          {action.label}
        </Button>
      )}
    </div>
  );
}

export function NoAccess() {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <p className="text-6xl font-light tracking-tight">403</p>
      <h1 className="mt-3 text-lg font-semibold">You don’t have access to this page</h1>
      <p className="mt-1 text-sm text-muted-foreground">Your role doesn’t include this area. Switch to a different demo account from the profile menu.</p>
      <Button className="mt-6" variant="outline" onClick={() => navigate("/dashboard")}>
        Back to dashboard
      </Button>
    </div>
  );
}
