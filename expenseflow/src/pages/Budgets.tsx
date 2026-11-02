import { useMemo, useState } from "react";
import { AlertTriangle, Pencil, Plus, Trash2 } from "lucide-react";
import { EmptyState, NoAccess, PageHeader, StatCard } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { BudgetBar } from "@/components/ui/progress";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { useSimulatedLoading } from "@/lib/hooks";
import { admin, errorMessage, useDB } from "@/lib/store";
import type { Budget, BudgetPeriod, BudgetScope, User } from "@/lib/types";
import { cn, formatIDR, formatIDRCompact, formatThousands, parseAmount } from "@/lib/utils";
import { budgetUsage } from "@/lib/workflow";

export default function Budgets({ user }: { user: User }) {
  const db = useDB();
  const [scope, setScope] = useState<BudgetScope>("category");
  const [editing, setEditing] = useState<Partial<Budget> | null>(null);
  const [deleting, setDeleting] = useState<Budget | null>(null);
  const loading = useSimulatedLoading("budgets", 350);
  const canEdit = user.role === "finance";

  const rows = useMemo(
    () =>
      db.budgets
        .filter((b) => b.scope === scope)
        .map((b) => {
          const ref = b.scope === "category" ? db.categories.find((c) => c.id === b.refId) : db.departments.find((d) => d.id === b.refId);
          return { b, name: ref?.name ?? "—", color: b.scope === "category" ? (ref as { color?: string })?.color : undefined, ...budgetUsage(db, b) };
        })
        .sort((a, b) => b.pct - a.pct),
    [db, scope],
  );

  if (user.role === "employee") return <NoAccess />;
  if (loading) return <PageSkeleton />;

  const total = rows.reduce((s, r) => s + r.b.amount, 0);
  const used = rows.reduce((s, r) => s + r.used, 0);
  const pending = rows.reduce((s, r) => s + r.pending, 0);
  const over = rows.filter((r) => r.remaining < 0).length;

  return (
    <>
      <PageHeader
        eyebrow="Budgets"
        title="Budget management"
        description={canEdit ? "Set monthly or quarterly limits per category or department. Requesters see a warning when a request would exceed what’s left." : "Read-only view — budgets are managed by Finance."}
        actions={
          canEdit && (
            <Button onClick={() => setEditing({ scope, period: scope === "category" ? "monthly" : "quarterly" })}>
              <Plus /> Add budget
            </Button>
          )
        }
      />
      <Tabs
        className="mb-5"
        size="lg"
        value={scope}
        onChange={setScope}
        items={[
          { value: "category", label: "By category", count: db.budgets.filter((b) => b.scope === "category").length },
          { value: "department", label: "By department", count: db.budgets.filter((b) => b.scope === "department").length },
        ]}
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total budget (current periods)" value={formatIDRCompact(total).replace("Rp ", "")} unit="IDR" />
        <StatCard label="Used (approved & paid)" tone="green" value={formatIDRCompact(used).replace("Rp ", "")} unit="IDR" hint={total ? `${Math.round((used / total) * 100)}% of budget` : undefined} />
        <StatCard label="In approval" tone="yellow" value={formatIDRCompact(pending).replace("Rp ", "")} unit="IDR" />
        <StatCard label="Over budget" tone="red" value={over} unit={over === 1 ? "budget" : "budgets"} />
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState title="No budgets yet" description="Add a budget to start tracking spend against limits." />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <Card key={r.b.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {r.color && <span className="size-2.5 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden />}
                  <h3 className="truncate font-semibold">{r.name}</h3>
                </div>
                <Badge tone="gray" className="capitalize">{r.b.period} · {r.label}</Badge>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">Remaining</p>
              <p className={cn("text-3xl font-light tracking-tight", r.remaining < 0 && "text-red-600 dark:text-red-400")}>{formatIDR(r.remaining)}</p>
              <BudgetBar className="mt-4" label={`${r.name} budget usage`} usedPct={r.usedPct} pendingPct={r.pct - r.usedPct} over={r.remaining < 0} />
              <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div><dt className="text-muted-foreground">Used</dt><dd className="font-medium tabular-nums">{formatIDRCompact(r.used)}</dd></div>
                <div><dt className="text-muted-foreground">Pending</dt><dd className="font-medium tabular-nums">{formatIDRCompact(r.pending)}</dd></div>
                <div><dt className="text-muted-foreground">Budget</dt><dd className="font-medium tabular-nums">{formatIDRCompact(r.b.amount)}</dd></div>
              </dl>
              {r.remaining < 0 && (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400"><AlertTriangle className="size-3.5" /> Over budget</p>
              )}
              {canEdit && (
                <div className="mt-auto flex justify-end gap-1 pt-4">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(r.b)}><Pencil /> Edit</Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`Delete ${r.name} budget`} onClick={() => setDeleting(r.b)}><Trash2 /></Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {editing && <BudgetDialog initial={editing} onClose={() => setEditing(null)} />}
      <Dialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete this budget?"
        description="Requests will no longer be checked against this limit. Historical requests are not affected."
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                try {
                  admin.deleteBudget(deleting!.id);
                  toast.success("Budget deleted");
                } catch (e) {
                  toast.error("Couldn’t delete", errorMessage(e));
                }
                setDeleting(null);
              }}
            >
              Delete budget
            </Button>
          </>
        }
      />
    </>
  );
}

function BudgetDialog({ initial, onClose }: { initial: Partial<Budget>; onClose: () => void }) {
  const db = useDB();
  const [scope, setScope] = useState<BudgetScope>(initial.scope ?? "category");
  const [refId, setRefId] = useState(initial.refId ?? "");
  const [period, setPeriod] = useState<BudgetPeriod>(initial.period ?? "monthly");
  const [amount, setAmount] = useState(initial.amount ? formatThousands(initial.amount) : "");
  const [error, setError] = useState<string>();
  const isEdit = !!initial.id;
  const taken = new Set(db.budgets.filter((b) => b.scope === scope && b.id !== initial.id).map((b) => b.refId));
  const options = scope === "category" ? db.categories.filter((c) => c.active) : db.departments;

  const save = () => {
    if (!refId) return setError(`Choose a ${scope}.`);
    const n = parseAmount(amount);
    if (!n) return setError("Enter a budget amount.");
    try {
      admin.upsertBudget({ id: initial.id, scope, refId, period, amount: n });
      toast.success(isEdit ? "Budget updated" : "Budget added", `${formatIDR(n)} ${period}`);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={isEdit ? "Edit budget" : "Add budget"}
      description="Budgets reset at the start of each period. Pending requests count towards usage."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>{isEdit ? "Save changes" : "Add budget"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {!isEdit && (
          <Field label="Budget for">
            {(a) => (
              <Select {...a} value={scope} onChange={(e) => { setScope(e.target.value as BudgetScope); setRefId(""); }}>
                <option value="category">Category</option>
                <option value="department">Department</option>
              </Select>
            )}
          </Field>
        )}
        <Field label={scope === "category" ? "Category" : "Department"} required>
          {(a) => (
            <Select {...a} value={refId} disabled={isEdit} onChange={(e) => { setRefId(e.target.value); setError(undefined); }}>
              <option value="">Select…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id} disabled={taken.has(o.id)}>
                  {o.name}{taken.has(o.id) ? " (has budget)" : ""}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Period">
            {(a) => (
              <Select {...a} value={period} onChange={(e) => setPeriod(e.target.value as BudgetPeriod)}>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </Select>
            )}
          </Field>
          <Field label="Amount (Rp)" required error={error}>
            {(a) => <Input {...a} data-autofocus inputMode="numeric" value={amount} onChange={(e) => { setAmount(e.target.value ? formatThousands(parseAmount(e.target.value)) : ""); setError(undefined); }} placeholder="10.000.000" />}
          </Field>
        </div>
      </div>
    </Dialog>
  );
}
