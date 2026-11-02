import { useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { RequestList } from "@/components/RequestList";
import { EmptyState, PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { Field, Input, Select } from "@/components/ui/form";
import { ListSkeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { exportCSV, exportXLSX, type Sheet } from "@/lib/export";
import { useSimulatedLoading } from "@/lib/hooks";
import { navigate, useRoute } from "@/lib/router";
import { admin, useDB } from "@/lib/store";
import type { DB, SpendRequest, Status, User } from "@/lib/types";
import { cn, formatDate, formatDateTime, formatIDR, parseAmount, formatThousands, todayISO } from "@/lib/utils";
import { isPending, STATUS_META, visibleRequests } from "@/lib/workflow";

type StatusTab = "all" | "pending" | "approved" | "paid" | "rejected" | "draft" | "revision";
type Scope = "mine" | "team" | "all";
type Sort = "updated" | "dateNeeded" | "amount_desc" | "amount_asc" | "title";

const TAB_MATCH: Record<StatusTab, (s: Status) => boolean> = {
  all: () => true,
  pending: isPending,
  approved: (s) => s === "approved",
  paid: (s) => s === "paid",
  rejected: (s) => s === "rejected" || s === "cancelled",
  draft: (s) => s === "draft",
  revision: (s) => s === "revision",
};

export function toSheet(db: DB, rows: SpendRequest[]): Sheet {
  return {
    name: "Requests",
    columns: ["Code", "Title", "Requester", "Department", "Category", "Type", "Priority", "Amount (IDR)", "Date needed", "Status", "Vendor", "Submitted", "Paid", "Payment ref"],
    rows: rows.map((r) => [
      r.code,
      r.title,
      db.users.find((u) => u.id === r.requesterId)?.name ?? "",
      db.departments.find((d) => d.id === r.departmentId)?.name ?? "",
      db.categories.find((c) => c.id === r.categoryId)?.name ?? "",
      r.type === "advance" ? "Advance" : "Reimbursement",
      r.priority === "urgent" ? "Urgent" : "Normal",
      r.amount,
      formatDate(r.dateNeeded),
      STATUS_META[r.status].label,
      r.vendor,
      r.submittedAt ? formatDateTime(r.submittedAt) : "",
      r.paidAt ? formatDateTime(r.paidAt) : "",
      r.paymentRef ?? "",
    ]),
  };
}

export default function Requests({ user }: { user: User }) {
  const db = useDB();
  const { query } = useRoute();
  const scopes: { value: Scope; label: string }[] = [
    { value: "mine", label: "My requests" },
    ...(user.role === "manager" && !user.isDirector ? [{ value: "team" as Scope, label: "My team" }] : []),
    ...(user.role === "finance" || user.isDirector ? [{ value: "all" as Scope, label: "All requests" }] : []),
  ];
  const initialScope = (query.get("scope") as Scope) || "mine";
  const [scope, setScope] = useState<Scope>(scopes.some((s) => s.value === initialScope) ? initialScope : "mine");
  const [tab, setTab] = useState<StatusTab>((query.get("status") as StatusTab) || "all");
  const [q, setQ] = useState(query.get("q") ?? "");
  const [showFilters, setShowFilters] = useState(false);
  const [category, setCategory] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [sort, setSort] = useState<Sort>("updated");
  const loading = useSimulatedLoading(scope, 350);

  // sync with URL (global search, dashboard links)
  useEffect(() => {
    setQ(query.get("q") ?? "");
    const st = query.get("status") as StatusTab | null;
    if (st && st in TAB_MATCH) setTab(st);
    // a global search should look across everything the user can see
    if (query.get("q") && scopes.length > 1) setScope(scopes[scopes.length - 1]!.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.toString()]);

  const base = useMemo(() => visibleRequests(db, user, scope), [db, user, scope]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const minN = parseAmount(min);
    const maxN = parseAmount(max);
    const rows = base.filter((r) => {
      if (term) {
        const requester = db.users.find((u) => u.id === r.requesterId)?.name ?? "";
        const hay = `${r.title} ${r.code} ${r.vendor} ${r.description} ${requester}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (category && r.categoryId !== category) return false;
      if (from && r.dateNeeded < from) return false;
      if (to && r.dateNeeded > to) return false;
      if (minN && r.amount < minN) return false;
      if (maxN && r.amount > maxN) return false;
      return true;
    });
    const sorters: Record<Sort, (a: SpendRequest, b: SpendRequest) => number> = {
      updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
      dateNeeded: (a, b) => a.dateNeeded.localeCompare(b.dateNeeded),
      amount_desc: (a, b) => b.amount - a.amount,
      amount_asc: (a, b) => a.amount - b.amount,
      title: (a, b) => a.title.localeCompare(b.title),
    };
    return rows.sort(sorters[sort]);
  }, [base, q, category, from, to, min, max, sort, db.users]);

  const rows = filtered.filter((r) => TAB_MATCH[tab](r.status));
  const count = (t: StatusTab) => filtered.filter((r) => TAB_MATCH[t](r.status)).length;
  const activeFilters = [category, from, to, min, max].filter(Boolean).length;
  const clear = () => {
    setCategory("");
    setFrom("");
    setTo("");
    setMin("");
    setMax("");
    setQ("");
  };

  const doExport = (kind: "csv" | "xlsx") => {
    if (!rows.length) {
      toast.error("Nothing to export", "Adjust your filters first.");
      return;
    }
    const sheet = toSheet(db, rows);
    const name = `expense-requests-${todayISO()}`;
    if (kind === "csv") exportCSV(sheet, `${name}.csv`);
    else exportXLSX([sheet], `${name}.xlsx`);
    admin.logExport(`Exported ${rows.length} requests (${kind.toUpperCase()})`);
    toast.success(`Exported ${rows.length} requests`, `${name}.${kind}`);
  };

  const tabs: { value: StatusTab; label: string; count: number }[] = [
    { value: "all", label: "All", count: count("all") },
    { value: "pending", label: "Pending", count: count("pending") },
    { value: "revision", label: "Revision", count: count("revision") },
    { value: "approved", label: "Approved", count: count("approved") },
    { value: "paid", label: "Paid", count: count("paid") },
    { value: "rejected", label: "Rejected", count: count("rejected") },
    ...(scope === "mine" ? [{ value: "draft" as StatusTab, label: "Drafts", count: count("draft") }] : []),
  ];

  return (
    <>
      <PageHeader
        eyebrow="Requests"
        title={scope === "mine" ? "My Requests" : scope === "team" ? "Team Requests" : "All Requests"}
        description={`${base.length} request${base.length === 1 ? "" : "s"} · ${formatIDR(base.reduce((s, r) => s + r.amount, 0))} total`}
        actions={
          <>
            <Dropdown
              label="Export"
              trigger={(t) => (
                <Button variant="outline" onClick={t.toggle} aria-expanded={t["aria-expanded"]} aria-haspopup="menu">
                  <Download /> Export
                </Button>
              )}
            >
              {(close) => (
                <>
                  <MenuItem icon={<FileSpreadsheet />} onClick={() => { close(); doExport("xlsx"); }}>Excel (.xlsx)</MenuItem>
                  <MenuItem icon={<Download />} onClick={() => { close(); doExport("csv"); }}>CSV (.csv)</MenuItem>
                </>
              )}
            </Dropdown>
            <Button onClick={() => navigate("/requests/new")} className="hidden md:inline-flex">
              <Plus /> New request
            </Button>
          </>
        }
      />

      {scopes.length > 1 && (
        <div className="mb-4 inline-flex rounded-full bg-card p-1 shadow-soft" role="radiogroup" aria-label="Scope">
          {scopes.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={scope === s.value}
              onClick={() => setScope(s.value)}
              className={cn("focus-ring rounded-full px-4 py-1.5 text-sm transition", scope === s.value ? "bg-ink text-ink-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <Card>
        <div className="space-y-4 p-4 pb-0 md:p-5 md:pb-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <label htmlFor="req-search" className="sr-only">Search requests</label>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input id="req-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, code, vendor or requester…" className="pl-9" />
            </div>
            <div className="flex gap-2">
              <label htmlFor="req-sort" className="sr-only">Sort by</label>
              <Select id="req-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="sm:w-48">
                <option value="updated">Recently updated</option>
                <option value="dateNeeded">Date needed (soonest)</option>
                <option value="amount_desc">Amount (high → low)</option>
                <option value="amount_asc">Amount (low → high)</option>
                <option value="title">Title (A–Z)</option>
              </Select>
              <Button variant={showFilters || activeFilters ? "ink" : "outline"} onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters} aria-controls="req-filters">
                <SlidersHorizontal /> <span className="hidden sm:inline">Filters</span>
                {activeFilters > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">{activeFilters}</span>}
              </Button>
            </div>
          </div>

          {showFilters && (
            <div id="req-filters" className="animate-pop-in grid gap-3 rounded-xl bg-surface p-4 sm:grid-cols-2 lg:grid-cols-5">
              <Field label="Category">
                {(a) => (
                  <Select {...a} value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="">All categories</option>
                    {db.categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Needed from">{(a) => <Input {...a} type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />}</Field>
              <Field label="Needed to">{(a) => <Input {...a} type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />}</Field>
              <Field label="Min amount (Rp)">{(a) => <Input {...a} inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value ? formatThousands(parseAmount(e.target.value)) : "")} placeholder="0" />}</Field>
              <Field label="Max amount (Rp)">{(a) => <Input {...a} inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value ? formatThousands(parseAmount(e.target.value)) : "")} placeholder="No limit" />}</Field>
              <div className="flex items-end sm:col-span-2 lg:col-span-5">
                <Button variant="ghost" size="sm" onClick={clear}>
                  <X /> Clear all filters
                </Button>
              </div>
            </div>
          )}

          <Tabs value={tab} onChange={setTab} items={tabs} />
        </div>

        {loading ? (
          <ListSkeleton />
        ) : rows.length ? (
          <RequestList rows={rows} showRequester={scope !== "mine"} />
        ) : base.length === 0 && scope === "mine" ? (
          <EmptyState title="No requests yet" description="Submit a request to spend company money, or claim a reimbursement for something you’ve already paid." action={{ label: "Create your first request", to: "/requests/new", icon: <Plus className="size-4" /> }} />
        ) : (
          <div className="py-4">
            <EmptyState compact title="No matching requests" description="Try a different status tab, search term, or clear your filters." />
            <div className="-mt-4 flex justify-center pb-6">
              <Button variant="outline" size="sm" onClick={() => { clear(); setTab("all"); }}>Reset filters</Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
