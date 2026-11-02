import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/workflow";

const tones: Record<Tone, string> = {
  gray: "bg-zinc-100 text-zinc-700 ring-zinc-500/20 dark:bg-zinc-500/15 dark:text-zinc-300",
  yellow: "bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-400/10 dark:text-amber-300",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/25 dark:bg-emerald-400/10 dark:text-emerald-300",
  red: "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-400/10 dark:text-red-300",
  blue: "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-400/10 dark:text-blue-300",
  orange: "bg-orange-50 text-orange-700 ring-orange-600/25 dark:bg-orange-400/10 dark:text-orange-300",
};

const dots: Record<Tone, string> = {
  gray: "bg-zinc-400",
  yellow: "bg-amber-500",
  green: "bg-emerald-500",
  red: "bg-red-500",
  blue: "bg-blue-500",
  orange: "bg-orange-500",
};

export function Badge({ tone = "gray", dot, className, children, ...p }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", tones[tone], className)} {...p}>
      {dot && <span className={cn("size-1.5 rounded-full", dots[tone])} aria-hidden />}
      {children}
    </span>
  );
}
