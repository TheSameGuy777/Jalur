import { forwardRef, useId, type InputHTMLAttributes, type LabelHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const base =
  "w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground/70 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-red-500 aria-[invalid=true]:focus:ring-red-500/20";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn(base, "h-10", className)} {...p} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cn(base, "min-h-24 py-2.5 leading-relaxed", className)} {...p} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...p }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        base,
        "h-10 appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9",
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        className,
      )}
      {...p}
    >
      {children}
    </select>
  );
});

export function Label({ className, ...p }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-medium text-foreground", className)} {...p} />;
}

/** Label + control + hint/error with proper aria wiring. */
export function Field({
  label,
  hint,
  error,
  required,
  optional,
  className,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  optional?: boolean;
  className?: string;
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => ReactNode;
}) {
  const id = useId();
  const descId = `${id}-desc`;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="flex items-center gap-1">
        {label}
        {required && <span className="text-red-500" aria-hidden>*</span>}
        {optional && <span className="text-xs font-normal text-muted-foreground">(optional)</span>}
      </Label>
      {children({ id, "aria-invalid": !!error, "aria-describedby": error || hint ? descId : undefined })}
      {error ? (
        <p id={descId} className="text-xs font-medium text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={descId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Switch({ checked, onChange, label, id, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string; disabled?: boolean }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "focus-ring relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-primary" : "bg-input",
      )}
    >
      <span className={cn("inline-block size-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-5" : "translate-x-0.5")} />
    </button>
  );
}
