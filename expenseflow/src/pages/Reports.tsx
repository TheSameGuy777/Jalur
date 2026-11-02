import { useMemo, useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { CategoryDonut, TrendBars, byCategory, monthlyTrend } from "@/components/charts";
import { RequestList } from "@/components/RequestList";
import { EmptyState, NoAccess, PageHeader, StatCard } from "@/components/shared";
import { toSheet } from "@/pages/Requests";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { Select } from "@/components/ui/form";
import { PageSkeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { exportCSV, exportXLSX } from "@/lib/export";
import { useSimulatedLoading } from "@/lib/hooks";
import { admin, useDB } from "@/lib/store";
import type { User } from "@/lib/types";
import { formatDate, formatIDR, formatIDRCompact, parseDate, todayISO } from "@/lib/utils";
import { isCommitted, isPending } from "@/lib/workflow";

type Range = "this_month" | "last_3" | "ytd" | "last_12" | "all";
const RANGE_LABEL: Record<Range, string> = { this_month: "This month", last_3: "Last 3 months", ytd: "Year to date", last_12: "Last 12 months", all: "All time" };

function rangeStart(r: Range) {
  const n = new Date();
  switch (r) {
    case "this_month": return new Date(n.getFullYear(), n.getMonth(), 1);
    case "last_3": return new Date(n.getFullYear(), n.getMonth() - 2, 1);
    case "ytd": return new Date(n.getFullYear(), 0, 1);
    case "last_12": return new Date(n.getFullYear(), n.getMonth() - 11, 1);
    default: return new Date(2000, 0, 1);
  }
}

export default function Reports({ user }: { user: User }) {
  const db = useDB();
  const [range, setRange] = useState<Range>("ytd");
  const loading = useSimulatedLoading(range, 400);

  const rows = useMemo(() => {
    const start = rangeStart(range);
    return db.requests.filter((r) => r.status !== "draft" && parseDate(r.dateNeeded) >= start);
  }, [db, range]);

  if (user.role !== "finance") return <NoAccess />;

  const committed = rows.filter((r) => isCommitted(r.status));
  const total = committed.reduce((s, r) => s + r.amount, 0);
  const pending = rows.filter((r) => isPending(r.status));
  const decided = rows.filter((r) => ["approved", "paid", "rejected"].includes(r.status));
  const approvalRate = decided.length ? Math.round((decided.filter((r) => r.status !== "rejected").length / decided.length) * 100) : 0;
  const cats = byCategory(db, committed);
  const months = range === "last_12" || range === "all" ? 12 : range === "ytd" ? Math.max(3, new Date().getMonth() + 1) : range === "last_3" ? 3 : 1;
  const trend = monthlyTrend(rows, Math.max(months, 3));
  const depts = db.departments
    .map((d) => ({ name: d.name, value: committed.filter((r) => r.departmentId === d.id).reduce((s, r) => s + r.amount, 0), count: rows.filter((r) => r.departmentId === d.id).length }))
    .sort((a, b) => b.value - a.value);
  const maxDept = Math.max(1, ...depts.map((d) => d.value));
  const vendors = Object.entries(
    committed.reduce<Record<string, number>>((acc, r) => {
      const k = r.vendor || "Unspecified";
      acc[k] = (acc[k] ?? 0) + r.amount;
      return acc;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const doExport = (kind: "csv" | "xlsx") => {
    const name = `expense-report-${range}-${todayISO()}`;
    const reqSheet = toSheet(db, rows);
    if (kind === "csv") exportCSV(reqSheet, `${name}.csv`);
    else
      exportXLSX(
        [
          reqSheet,
          { name: "By category", columns: ["Category", "Approved & paid (IDR)", "Share %"], rows: cats.map((c) => [c.name, c.value, total ? Math.round((c.value / total) * 1000) / 10 : 0]) },
          { name: "By department", columns: ["Department", "Approved & paid (IDR)", "Requests"], rows: depts.map((d) => [d.name, d.value, d.count]) },
          { name: "Monthly trend", columns: ["Month", "Approved & paid (IDR)", "In approval (IDR)"], rows: trend.map((t) => [t.label, t.approved, t.pending]) },
        ],
        `${name}.xlsx`,
      );
    admin.logExport(`Exported report “${RANGE_LABEL[range]}” (${kind.toUpperCase()})`);
    toast.success("Report exported", `${name}.${kind}`);
  };

  return (
    <>
      <PageHeader
        eyebrow="Reports"
        title="Spending reports"
        description={`${RANGE_LABEL[range]} · based on date needed · generated ${formatDate(new Date())}`}
        actions={
          <>
            <label htmlFor="range" className="sr-only">Period</label>
            <Select id="range" value={range} onChange={(e) => setRange(e.target.value as Range)} className="w-44 rounded-full">
              {Object.entries(RANGE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
            <Dropdown label="Export report" trigger={(t) => (<Button variant="ink" onClick={t.toggle} aria-expanded={t["aria-expanded"]} aria-haspopup="menu"><Download /> Export</Button>)}>
              {(close) => (
                <>
                  <MenuItem icon={<FileSpreadsheet />} onClick={() => { close(); doExport("xlsx"); }}>Excel workbook (4 sheets)</MenuItem>
                  <MenuItem icon={<Download />} onClick={() => { close(); doExport("csv"); }}>CSV (requests)</MenuItem>
                </>
              )}
            </Dropdown>
          </>
        }
      />

      {loading ? (
        <PageSkeleton />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Approved & paid" value={formatIDRCompact(total).replace("Rp ", "")} unit="IDR" hint={`${committed.length} requests`} />
            <StatCard label="Requests" value={rows.length} unit="submitted" hint={`${pending.length} still in approval`} />
            <StatCard label="Approval rate" tone="green" value={approvalRate} unit="%" hint={`${decided.length} decided`} />
            <StatCard label="Avg. request" value={formatIDRCompact(rows.length ? rows.reduce((s, r) => s + r.amount, 0) / rows.length : 0).replace("Rp ", "")} unit="IDR" />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader>
                <div>
                  <CardTitle>Monthly trend</CardTitle>
                  <CardDescription>Approved & paid vs. still in approval</CardDescription>
                </div>
              </CardHeader>
              <CardContent><TrendBars data={trend} height={280} /></CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader>
                <div>
                  <CardTitle>By category</CardTitle>
                  <CardDescription>Approved & paid</CardDescription>
                </div>
              </CardHeader>
              <CardContent>{cats.length ? <CategoryDonut data={cats} height={200} /> : <EmptyState compact title="No approved spend in this period" />}</CardContent>
            </Card>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><div><CardTitle>By department</CardTitle><CardDescription>Approved & paid</CardDescription></div></CardHeader>
              <CardContent>
                <ul className="space-y-4">
                  {depts.map((d) => (
                    <li key={d.name}>
                      <div className="mb-1.5 flex justify-between text-sm"><span>{d.name}</span><span className="tabular-nums">{formatIDR(d.value)}</span></div>
                      <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${(d.value / maxDept) * 100}%` }} /></div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><div><CardTitle>Top vendors</CardTitle><CardDescription>By approved & paid amount</CardDescription></div></CardHeader>
              <CardContent>
                {vendors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No data for this period.</p>
                ) : (
                  <ol className="divide-y divide-border">
                    {vendors.map(([v, amt], i) => (
                      <li key={v} className="flex items-center gap-3 py-2.5 text-sm">
                        <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold">{i + 1}</span>
                        <span className="flex-1 truncate">{v}</span>
                        <span className="tabular-nums">{formatIDR(amt)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="mt-6">
            <CardHeader><div><CardTitle>Requests in period</CardTitle><CardDescription>{rows.length} requests</CardDescription></div></CardHeader>
            {rows.length ? <RequestList rows={[...rows].sort((a, b) => b.dateNeeded.localeCompare(a.dateNeeded))} showRequester dense /> : <EmptyState compact title="No requests in this period" />}
          </Card>
        </>
      )}
    </>
  );
}
