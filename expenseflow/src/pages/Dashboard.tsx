import { useMemo, useState, type ReactNode } from "react";
import { ArrowRight, ArrowUpRight, Banknote, Check, CheckCircle2, Clock, Plus, Users, X, Zap } from "lucide-react";
import { CategoryDonut, TrendBars, byCategory, monthlyTrend } from "@/components/charts";
import { RequestList } from "@/components/RequestList";
import { useRequestActions } from "@/components/RequestActions";
import { CategoryTag, EmptyState, PageHeader, StatCard, StatusBadge } from "@/components/shared";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BudgetBar } from "@/components/ui/progress";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { useSimulatedLoading } from "@/lib/hooks";
import { Link, navigate } from "@/lib/router";
import { useDB } from "@/lib/store";
import type { DB, SpendRequest, User } from "@/lib/types";
import { formatDate, formatIDR, formatIDRCompact, greeting, MONTHS_SHORT, parseDate, relativeTime } from "@/lib/utils";
import { approverQueue, budgetUsage, canApprove, isCommitted, isPending, STATUS_META, visibleRequests } from "@/lib/workflow";

const thisMonth = (r: SpendRequest) => {
  const d = parseDate(r.dateNeeded);
  const n = new Date();
  return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
};
const sum = (rows: SpendRequest[]) => rows.reduce((s, r) => s + r.amount, 0);

export default function Dashboard({ user }: { user: User }) {
  const loading = useSimulatedLoading(user.id);
  if (loading) return <PageSkeleton />;
  if (user.role === "finance") return <FinanceDashboard user={user} />;
  if (user.role === "manager") return <ApproverDashboard user={user} />;
  return <EmployeeDashboard user={user} />;
}

/* ------------------------------------------------------------------ */

function HeroSpend({ title, amount, sub, children }: { title: string; amount: number; sub: string; children?: ReactNode }) {
  return (
    <div className="bg-hero relative overflow-hidden rounded-xl p-5 text-white shadow-soft md:p-6">
      <div className="pointer-events-none absolute -right-10 -top-10 size-44 rounded-full bg-white/10 blur-2xl" aria-hidden />
      <p className="text-sm text-white/80">{title}</p>
      <p className="mt-3 text-4xl font-light tracking-tight md:text-5xl">{formatIDR(amount)}</p>
      <p className="mt-2 text-sm text-white/75">{sub}</p>
      {children}
    </div>
  );
}

function EmployeeDashboard({ user }: { user: User }) {
  const db = useDB();
  const mine = useMemo(() => db.requests.filter((r) => r.requesterId === user.id), [db, user.id]);
  const pending = mine.filter((r) => isPending(r.status));
  const approved = mine.filter((r) => r.status === "approved");
  const rejected = mine.filter((r) => r.status === "rejected");
  const paid = mine.filter((r) => r.status === "paid");
  const spentMonth = sum(mine.filter((r) => isCommitted(r.status) && thisMonth(r)));
  const attention = mine.filter((r) => r.status === "revision" || r.status === "draft");
  const recent = [...mine].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6);
  const now = new Date();

  return (
    <>
      <PageHeader
        eyebrow="Dashboard"
        title={`${greeting()}, ${user.name.split(" ")[0]}`}
        description="Here’s where your spending requests stand."
        actions={
          <Button size="lg" onClick={() => navigate("/requests/new")} className="hidden md:inline-flex">
            <Plus /> New request
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <HeroSpend title={`Total spent · ${MONTHS_SHORT[now.getMonth()]} ${now.getFullYear()}`} amount={spentMonth} sub="Approved & paid requests this month">
          <div className="mt-6 flex flex-wrap gap-2">
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs ring-1 ring-white/25">{formatIDRCompact(sum(pending))} in approval</span>
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs ring-1 ring-white/25">{paid.filter(thisMonth).length} paid this month</span>
          </div>
        </HeroSpend>
        <div className="grid grid-cols-2 gap-4 lg:col-span-2">
          <StatCard label="Pending" tone="yellow" value={pending.length} unit="requests" hint={formatIDR(sum(pending))} onClick={() => navigate("/requests?status=pending")} />
          <StatCard label="Approved" tone="green" value={approved.length} unit="requests" hint={formatIDR(sum(approved))} onClick={() => navigate("/requests?status=approved")} />
          <StatCard label="Rejected" tone="red" value={rejected.length} unit="requests" hint={formatIDR(sum(rejected))} onClick={() => navigate("/requests?status=rejected")} />
          <StatCard label="Paid" tone="blue" value={paid.length} unit="requests" hint={formatIDR(sum(paid))} onClick={() => navigate("/requests?status=paid")} />
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>My requests</CardTitle>
              <CardDescription>Most recently updated</CardDescription>
            </div>
            {mine.length > 0 && (
              <Link to="/requests" className="focus-ring inline-flex items-center gap-1 rounded-full text-sm font-medium text-primary hover:underline">
                View all <ArrowRight className="size-4" />
              </Link>
            )}
          </CardHeader>
          {recent.length ? (
            <RequestList rows={recent} dense />
          ) : (
            <EmptyState title="No requests yet" description="Need to spend company money or get reimbursed? It takes about a minute." action={{ label: "Create your first request", to: "/requests/new", icon: <Plus className="size-4" /> }} />
          )}
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Needs your attention</CardTitle>
              <CardDescription>Drafts and revision requests</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {attention.length === 0 && <p className="rounded-lg bg-surface px-4 py-6 text-center text-sm text-muted-foreground">Nothing to action — nice!</p>}
            {attention.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => navigate(r.status === "draft" ? `/requests/${r.id}/edit` : `/requests/${r.id}`)}
                className="focus-ring flex w-full items-start gap-3 rounded-lg border border-border/70 p-3 text-left transition hover:bg-surface"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{r.status === "revision" ? r.revisionNote : `Draft · last edited ${relativeTime(r.updatedAt)}`}</p>
                </div>
                <StatusBadge status={r.status} />
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

export function QueueCard({ db, user, rows, title, description, limit }: { db: DB; user: User; rows: SpendRequest[]; title: string; description: string; limit?: number }) {
  const actions = useRequestActions();
  const shown = limit ? rows.slice(0, limit) : rows;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            {title}
            <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-medium text-ink-foreground">{rows.length}</span>
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {limit && rows.length > limit && (
          <Link to="/approvals" className="focus-ring inline-flex items-center gap-1 rounded-full text-sm font-medium text-primary hover:underline">
            All <ArrowRight className="size-4" />
          </Link>
        )}
      </CardHeader>
      {shown.length === 0 ? (
        <EmptyState compact title="Inbox zero" description="No requests are waiting for you right now." />
      ) : (
        <ul className="@container divide-y divide-border">
          {shown.map((r) => {
            const requester = db.users.find((u) => u.id === r.requesterId);
            const cat = db.categories.find((c) => c.id === r.categoryId);
            const approve = canApprove(db, user, r);
            return (
              <li key={r.id} className="flex flex-col gap-3 px-5 py-4 @xl:flex-row @xl:items-center">
                <button type="button" onClick={() => navigate(`/requests/${r.id}`)} className="focus-ring flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left">
                  <Avatar user={requester} />
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-sm font-medium">
                      <span className="truncate">{r.title}</span>
                      {r.priority === "urgent" && <Zap className="size-3.5 shrink-0 text-red-500" aria-label="Urgent" />}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span>{requester?.name}</span>·<CategoryTag category={cat} className="text-xs" />·<span>Need by {formatDate(r.dateNeeded)}</span>
                    </p>
                  </div>
                </button>
                <div className="flex items-center justify-between gap-3 pl-12 @xl:justify-end @xl:pl-0">
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">{formatIDR(r.amount)}</p>
                    <p className="text-[11px] text-muted-foreground">{STATUS_META[r.status].label}</p>
                  </div>
                  {approve ? (
                    <div className="flex gap-1.5">
                      <Button size="icon-sm" variant="destructive-outline" aria-label={`Reject ${r.title}`} title="Reject" onClick={() => actions.open("reject", r)}>
                        <X />
                      </Button>
                      <Button size="sm" variant="ink" aria-label={`Approve ${r.title}`} onClick={() => actions.approve(r)}>
                        <Check /> Approve
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" onClick={() => actions.open("pay", r)}>
                      <Banknote /> Mark paid
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {actions.dialogs}
    </Card>
  );
}

function ApproverDashboard({ user }: { user: User }) {
  const db = useDB();
  const queue = useMemo(() => approverQueue(db, user), [db, user]);
  const team = useMemo(() => visibleRequests(db, user, user.isDirector ? "all" : "team"), [db, user]);
  const decidedByMe = db.approvals.filter((a) => a.actorId === user.id && new Date(a.at).getMonth() === new Date().getMonth());
  const teamSpend = sum(team.filter((r) => isCommitted(r.status) && thisMonth(r)));
  const urgent = queue.filter((r) => r.priority === "urgent").length;

  return (
    <>
      <PageHeader
        eyebrow="Dashboard"
        title={`${greeting()}, ${user.name.split(" ")[0]}`}
        description={queue.length ? `You have ${queue.length} request${queue.length > 1 ? "s" : ""} waiting for your approval.` : "You’re all caught up."}
        actions={
          <Button variant="outline" size="lg" onClick={() => navigate("/approvals")} className="hidden md:inline-flex">
            Open approvals <ArrowUpRight />
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Waiting for me" tone="yellow" value={queue.length} unit="requests" hint={formatIDR(sum(queue))} />
        <StatCard label="Urgent" tone="red" value={urgent} unit="requests" hint="Prioritised at the top" />
        <StatCard label="Decided this month" tone="green" value={decidedByMe.length} unit="actions" hint={`${decidedByMe.filter((a) => a.decision === "approved").length} approved`} />
        <StatCard label={user.isDirector ? "Company spend (month)" : "Team spend (month)"} icon={<Users />} value={formatIDRCompact(teamSpend).replace("Rp ", "")} unit="IDR" hint="Approved & paid" />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <QueueCard db={db} user={user} rows={queue} title="Waiting for my approval" description="Urgent first, then oldest" limit={6} />
        </div>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Recent team activity</CardTitle>
              <CardDescription>Latest updates on your team’s requests</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ol className="space-y-4">
              {[...team]
                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                .slice(0, 6)
                .map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => navigate(`/requests/${r.id}`)} className="focus-ring flex w-full items-start gap-3 rounded-lg text-left">
                      <Avatar user={db.users.find((u) => u.id === r.requesterId)} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{r.title}</p>
                        <p className="text-xs text-muted-foreground">{relativeTime(r.updatedAt)} · {formatIDRCompact(r.amount)}</p>
                      </div>
                      <StatusBadge status={r.status} />
                    </button>
                  </li>
                ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

function FinanceDashboard({ user }: { user: User }) {
  const db = useDB();
  const [budgetTab, setBudgetTab] = useState<"category" | "department">("category");
  const all = useMemo(() => db.requests.filter((r) => r.status !== "draft"), [db]);
  const queue = useMemo(() => approverQueue(db, user), [db, user]);
  const committed = all.filter((r) => isCommitted(r.status));
  const pendingFinance = all.filter((r) => r.status === "pending_finance");
  const awaitingPayment = all.filter((r) => r.status === "approved");
  const paidMonth = all.filter((r) => r.status === "paid" && r.paidAt && new Date(r.paidAt).getMonth() === new Date().getMonth());
  const donut = byCategory(db, committed);
  const trend = monthlyTrend(all);

  const budgetRows = db.budgets
    .filter((b) => b.scope === budgetTab)
    .map((b) => {
      const u = budgetUsage(db, b);
      const name = b.scope === "category" ? db.categories.find((c) => c.id === b.refId)?.name ?? "—" : db.departments.find((d) => d.id === b.refId)?.name ?? "—";
      return { b, name, ...u };
    });

  return (
    <>
      <PageHeader eyebrow="Finance overview" title={`${greeting()}, ${user.name.split(" ")[0]}`} description="Company-wide spending, budgets and your approval queue." actions={
        <Button variant="outline" size="lg" onClick={() => navigate("/reports")} className="hidden md:inline-flex">
          Full reports <ArrowUpRight />
        </Button>
      } />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total requests" icon={<CheckCircle2 />} value={all.length} unit="submitted" hint={`${all.filter((r) => isPending(r.status)).length} in approval`} />
        <StatCard label="Approved & paid" icon={<Banknote />} value={formatIDRCompact(sum(committed)).replace("Rp ", "")} unit="IDR" hint={`${committed.length} requests`} />
        <StatCard label="Pending finance" tone="yellow" icon={<Clock />} value={pendingFinance.length} unit="requests" hint={formatIDR(sum(pendingFinance))} onClick={() => navigate("/approvals")} />
        <StatCard label="Awaiting payment" tone="green" value={awaitingPayment.length} unit="requests" hint={`${paidMonth.length} paid this month`} onClick={() => navigate("/approvals")} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <div>
              <CardTitle>Monthly spending trend</CardTitle>
              <CardDescription>By date needed · last 6 months</CardDescription>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-primary" />Approved & paid</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-primary/30" />In approval</span>
            </div>
          </CardHeader>
          <CardContent>
            <TrendBars data={trend} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Total amount by category</CardTitle>
              <CardDescription>Approved & paid, all time</CardDescription>
            </div>
          </CardHeader>
          <CardContent>{donut.length ? <CategoryDonut data={donut} height={200} /> : <EmptyState compact title="No spend yet" />}</CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader className="flex-col sm:flex-row sm:items-end">
            <div>
              <CardTitle>Budget used vs. remaining</CardTitle>
              <CardDescription>Current period · solid = approved/paid, light = in approval</CardDescription>
            </div>
            <Tabs
              value={budgetTab}
              onChange={setBudgetTab}
              items={[
                { value: "category", label: "Category" },
                { value: "department", label: "Department" },
              ]}
              className="after:hidden"
            />
          </CardHeader>
          <CardContent>
            <ul className="mt-2 grid gap-x-8 gap-y-5 sm:grid-cols-2">
              {budgetRows.map((r) => (
                <li key={r.b.id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{r.name}</span>
                    <span className={r.remaining < 0 ? "shrink-0 font-medium text-red-600 dark:text-red-400" : "shrink-0 tabular-nums"}>
                      {r.remaining < 0 ? `Over ${formatIDRCompact(-r.remaining)}` : `${formatIDRCompact(r.remaining)} left`}
                    </span>
                  </div>
                  <BudgetBar label={`${r.name} budget`} usedPct={r.usedPct} pendingPct={r.pct - r.usedPct} over={r.remaining < 0} />
                  <p className="mt-1 text-[11px] text-muted-foreground">{r.label} · budget {formatIDRCompact(r.b.amount)}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <div className="xl:col-span-2">
          <QueueCard db={db} user={user} rows={queue} title="Finance queue" description="Final approvals & payments" limit={5} />
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <div>
            <CardTitle>Latest requests</CardTitle>
            <CardDescription>Across all departments</CardDescription>
          </div>
          <Link to="/requests?scope=all" className="focus-ring inline-flex items-center gap-1 rounded-full text-sm font-medium text-primary hover:underline">
            View all <ArrowRight className="size-4" />
          </Link>
        </CardHeader>
        <RequestList rows={[...all].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6)} showRequester dense />
      </Card>
    </>
  );
}
