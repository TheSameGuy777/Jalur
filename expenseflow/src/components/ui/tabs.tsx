import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

/** Underline tabs with a caret on the active tab — mirrors the reference design. */
export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: string; count?: number }[];
  className?: string;
  size?: "md" | "lg";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const idx = items.findIndex((i) => i.value === value);
    const next = items[(idx + (e.key === "ArrowRight" ? 1 : items.length - 1)) % items.length]!;
    onChange(next.value);
    requestAnimationFrame(() => ref.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus());
  };
  return (
    <div ref={ref} role="tablist" onKeyDown={onKey} className={cn("scrollbar-thin relative flex gap-6 overflow-x-auto pb-2 after:pointer-events-none after:absolute after:inset-x-0 after:bottom-2 after:h-px after:bg-border", className)}>
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(it.value)}
            className={cn(
              "focus-ring relative shrink-0 whitespace-nowrap pb-3 pt-1 font-light transition-colors",
              size === "lg" ? "text-lg md:text-xl" : "text-sm font-normal",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {it.label}
            {it.count !== undefined && (
              <span className={cn("ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium", active ? "bg-ink text-ink-foreground" : "bg-muted text-muted-foreground")}>{it.count}</span>
            )}
            {active && (
              <>
                <span className="absolute inset-x-0 -bottom-px z-10 h-[2px] rounded-full bg-foreground" aria-hidden />
                <svg className="absolute left-1/2 top-full mt-0.5 -translate-x-1/2 text-foreground" width="10" height="6" viewBox="0 0 10 6" aria-hidden>
                  <path d="M1 1l4 4 4-4" stroke="currentColor" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
