import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const idr = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

/** Rp 1.500.000 */
export function formatIDR(value: number) {
  return `Rp ${idr.format(Math.round(value || 0))}`;
}

/** 1.500.000 (no prefix) */
export function formatThousands(value: number) {
  return idr.format(Math.round(value || 0));
}

/** Compact: Rp 12,5 jt / Rp 1,2 M */
export function formatIDRCompact(value: number) {
  const v = Math.abs(value);
  const fmt = (n: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(n);
  if (v >= 1e9) return `Rp ${fmt(value / 1e9)} M`;
  if (v >= 1e6) return `Rp ${fmt(value / 1e6)} jt`;
  if (v >= 1e3) return `Rp ${fmt(value / 1e3)} rb`;
  return formatIDR(value);
}

/** Keep digits only → number. "Rp 1.500.000" → 1500000 */
export function parseAmount(input: string): number {
  const digits = input.replace(/\D/g, "").slice(0, 15);
  return digits ? Number(digits) : 0;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** DD/MM/YYYY */
export function formatDate(value?: string | Date) {
  if (!value) return "—";
  const d = typeof value === "string" ? parseDate(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** DD/MM/YYYY · HH:mm */
export function formatDateTime(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  return `${formatDate(d)} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parse "YYYY-MM-DD" as a local date (avoids UTC shift) or full ISO strings. */
export function parseDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
}

/** Date → YYYY-MM-DD (local) */
export function toISODate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO() {
  return toISODate(new Date());
}

export function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return formatDate(iso);
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 11) return "Good morning";
  if (h < 15) return "Good afternoon";
  if (h < 19) return "Good evening";
  return "Good night";
}

export const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;
}
