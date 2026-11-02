import { useEffect, useState } from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Kind = "success" | "error" | "info";
interface T {
  id: number;
  kind: Kind;
  title: string;
  description?: string;
}

let items: T[] = [];
let n = 0;
const subs = new Set<(t: T[]) => void>();
const emit = () => subs.forEach((s) => s(items));

function push(kind: Kind, title: string, description?: string) {
  const id = ++n;
  items = [...items, { id, kind, title, description }].slice(-4);
  emit();
  window.setTimeout(() => dismiss(id), kind === "error" ? 6000 : 4000);
}
function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  success: (title: string, description?: string) => push("success", title, description),
  error: (title: string, description?: string) => push("error", title, description),
  info: (title: string, description?: string) => push("info", title, description),
};

export function Toaster() {
  const [list, setList] = useState<T[]>(items);
  useEffect(() => {
    subs.add(setList);
    return () => {
      subs.delete(setList);
    };
  }, []);
  return (
    <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:items-end">
      {list.map((t) => {
        const Icon = t.kind === "success" ? CheckCircle2 : t.kind === "error" ? XCircle : Info;
        return (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className="animate-toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl bg-ink px-4 py-3 text-ink-foreground shadow-2xl ring-1 ring-white/10"
          >
            <Icon className={cn("mt-0.5 size-5 shrink-0", t.kind === "success" ? "text-emerald-400" : t.kind === "error" ? "text-red-400" : "text-sky-400")} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t.title}</p>
              {t.description && <p className="mt-0.5 text-xs text-white/70">{t.description}</p>}
            </div>
            <button type="button" onClick={() => dismiss(t.id)} className="focus-ring rounded-full p-1 text-white/60 hover:text-white" aria-label="Dismiss notification">
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
