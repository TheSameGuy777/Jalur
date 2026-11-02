import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useEffect, useState } from "react";
import type { DB, SpendRequest } from "@/lib/types";
import { formatIDR, formatIDRCompact, MONTHS_SHORT, parseDate } from "@/lib/utils";
import { isCommitted } from "@/lib/workflow";

/** Resolve theme CSS variables to concrete colors (SVG attributes can't always use var()). */
function useChartColors() {
  const read = () => {
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string) => cs.getPropertyValue(n).trim();
    return { primary: v("--primary"), muted: v("--muted"), border: v("--border"), mutedFg: v("--muted-foreground"), soft: v("--primary-soft") };
  };
  const [c, setC] = useState(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setC(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return c;
}

const tooltipStyle = {
  contentStyle: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    fontSize: 12,
    color: "var(--foreground)",
    boxShadow: "0 8px 24px -12px rgba(0,0,0,.25)",
  },
  itemStyle: { color: "var(--foreground)" },
  labelStyle: { color: "var(--muted-foreground)", marginBottom: 4 },
};

export function byCategory(db: DB, rows: SpendRequest[]) {
  return db.categories
    .map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      value: rows.filter((r) => r.categoryId === c.id).reduce((s, r) => s + r.amount, 0),
    }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
}

export function monthlyTrend(rows: SpendRequest[], months = 6, ref = new Date()) {
  const out: { key: string; label: string; approved: number; pending: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    out.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: `${MONTHS_SHORT[d.getMonth()]}${d.getMonth() === 0 ? ` ’${String(d.getFullYear()).slice(2)}` : ""}`, approved: 0, pending: 0 });
  }
  for (const r of rows) {
    const d = parseDate(r.dateNeeded);
    const bucket = out.find((o) => o.key === `${d.getFullYear()}-${d.getMonth()}`);
    if (!bucket) continue;
    if (isCommitted(r.status)) bucket.approved += r.amount;
    else if (r.status.startsWith("pending")) bucket.pending += r.amount;
  }
  return out;
}

export function CategoryDonut({ data, height = 240 }: { data: { name: string; value: number; color: string }[]; height?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="@container">
    <div className="flex flex-col items-center gap-5 @md:flex-row @md:items-center">
      <div className="relative w-full max-w-[220px] shrink-0" style={{ height }} role="img" aria-label={`Spend by category, total ${formatIDR(total)}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="95%" paddingAngle={2} stroke="none" cornerRadius={4}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip {...tooltipStyle} formatter={(v: number) => formatIDR(v)} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-muted-foreground">Total</span>
          <span className="text-xl font-light tracking-tight">{formatIDRCompact(total)}</span>
        </div>
      </div>
      <ul className="w-full space-y-2 text-sm">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: d.color }} aria-hidden />
            <span className="flex-1 truncate text-muted-foreground">{d.name}</span>
            <span className="tabular-nums">{formatIDRCompact(d.value)}</span>
            <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{total ? Math.round((d.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
    </div>
  );
}

export function TrendBars({ data, height = 260 }: { data: { label: string; approved: number; pending: number }[]; height?: number }) {
  const c = useChartColors();
  return (
    <div style={{ height }} role="img" aria-label="Monthly spending trend">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={c.border} strokeDasharray="3 3" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: c.mutedFg, fontSize: 12 }} />
          <YAxis tickLine={false} axisLine={false} width={64} tick={{ fill: c.mutedFg, fontSize: 11 }} tickFormatter={(v: number) => formatIDRCompact(v).replace("Rp ", "")} />
          <Tooltip {...tooltipStyle} cursor={{ fill: c.muted }} formatter={(v: number, n: string) => [formatIDR(v), n === "approved" ? "Approved & paid" : "In approval"]} />
          <Bar dataKey="approved" stackId="a" fill={c.primary} radius={[0, 0, 4, 4]} />
          <Bar dataKey="pending" stackId="a" fill={c.primary} fillOpacity={0.3} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
