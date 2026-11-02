import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Accessible popover/menu: click to toggle, Esc/outside-click to close, arrow-key navigation. */
export function Dropdown({
  trigger,
  children,
  align = "end",
  className,
  label,
}: {
  trigger: (props: { open: boolean; toggle: () => void; "aria-expanded": boolean; "aria-haspopup": "menu" }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "start" | "end";
  className?: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      root.current?.querySelector<HTMLElement>("[aria-haspopup]")?.focus();
    }
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && menu.current) {
      e.preventDefault();
      const items = Array.from(menu.current.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'));
      if (!items.length) return;
      const idx = items.indexOf(document.activeElement as HTMLElement);
      const next = e.key === "ArrowDown" ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
      items[next]!.focus();
    }
  };

  return (
    <div ref={root} className="relative" onKeyDown={onKey}>
      {trigger({ open, toggle: () => setOpen((o) => !o), "aria-expanded": open, "aria-haspopup": "menu" })}
      {open && (
        <div
          ref={menu}
          role="menu"
          aria-label={label}
          className={cn(
            "animate-pop-in absolute z-40 mt-2 min-w-56 overflow-hidden rounded-xl border border-border bg-card p-1.5 shadow-xl",
            align === "end" ? "right-0" : "left-0",
            className,
          )}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ children, onClick, className, icon, danger }: { children: ReactNode; onClick: () => void; className?: string; icon?: ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:bg-muted [&_svg]:size-4 [&_svg]:text-muted-foreground",
        danger && "text-red-600 [&_svg]:text-red-500 dark:text-red-400",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}
