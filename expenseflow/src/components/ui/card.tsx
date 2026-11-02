import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-border/70 bg-card text-card-foreground shadow-soft", className)} {...p} />;
}
export function CardHeader({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-start justify-between gap-3 p-5 pb-3", className)} {...p} />;
}
export function CardTitle({ className, ...p }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-base font-semibold tracking-tight", className)} {...p} />;
}
export function CardDescription({ className, ...p }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...p} />;
}
export function CardContent({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0", className)} {...p} />;
}
