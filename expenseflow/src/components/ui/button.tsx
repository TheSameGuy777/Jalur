import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const variants = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm",
  ink: "bg-ink text-ink-foreground hover:opacity-90 shadow-sm",
  outline: "border border-border bg-card text-foreground hover:bg-muted",
  secondary: "bg-muted text-foreground hover:bg-border/70",
  ghost: "text-foreground hover:bg-muted",
  destructive: "bg-red-600 text-white hover:bg-red-700 shadow-sm",
  "destructive-outline": "border border-red-200 bg-card text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40",
  success: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm",
} as const;

const sizes = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-sm gap-2",
  icon: "h-10 w-10",
  "icon-sm": "h-8 w-8",
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading, disabled, children, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "focus-ring inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-full font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
});
