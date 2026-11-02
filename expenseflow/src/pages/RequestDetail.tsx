import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  Ban,
  Banknote,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  Download,
  Edit3,
  FilePlus2,
  FileText,
  ImageIcon,
  MessageSquare,
  Pencil,
  RotateCcw,
  Send,
  Trash2,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { useRequestActions } from "@/components/RequestActions";
import { CategoryTag, NoAccess, PageHeader, StatusBadge } from "@/components/shared";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/form";
import { BudgetBar } from "@/components/ui/progress";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { useSimulatedLoading } from "@/lib/hooks";
import { navigate } from "@/lib/router";
import { requests, useDB } from "@/lib/store";
import type { AuditLog, DB, SpendRequest, User } from "@/lib/types";
import { cn, formatBytes, formatDate, formatDateTime, formatIDR, formatIDRCompact, parseDate, relativeTime } from "@/lib/utils";
import { approvalChain, budgetImpact, canApprove, canMarkPaid, canView, isEditable, isPending, STATUS_META } from "@/lib/workflow";

export default function RequestDetail({ user, id }: { user: User; id: string }) {
  const db = useDB();
  const loading = useSimulatedLoading(id, 350);
  const req = db.requests.find((r) => r.id === id);
  if (loading) return <PageSkeleton />;
  if (!req || !canView(db, user, req)) return <NoAccess />;
  return <Detail db={db} user={user} req={req} />;
}

function Detail({ db, user, req }: { db: DB; user: User; req: SpendRequest }) {
  const actions = useRequestActions();
  const [tab, setTab] = useState<"timeline" | "comments">("timeline");
  const requester = db.users.find((u) => u.id === req.requesterId)!;
  const category = db.categories.find((c) => c.id === req.categoryId);
  const dept = db.departments.find((d) => d.id === req.departmentId);
  const comments = db.comments.filter((c) => c.requestId === req.id).sort((a, b) => a.at.localeCompare(b.at));
  const isOwner = req.requesterId === user.id;
  const approver = canApprove(db, user, req);
  const payable = canMarkPaid(user, req);
  const impact = useMemo(() => (req.status === "draft" || isPending(req.status) || req.status === "revision" ? budgetImpact(db, req) : []), [db, req]);
  const daysLeft = Math.ceil((parseDate(req.dateNeeded).getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000);

  /* ---------- action bar (black pill, like the reference toolbar) ---------- */
  const bar: { key: string; label: string; icon: ReactNode; onClick: () => void; primary?: boolean; danger?: boolean }[] = [];
  if (approver) {
    bar.push({ key: "approve", label: "Approve", icon: <Check />, onClick: () => actions.approve(req), primary: true });
    bar.push({ key: "revise", label: "Request revision", icon: <RotateCcw />, onClick: () => actions.open("revise", req) });
    bar.push({ key: "reject", label: "Reject", icon: <X />, onClick: () => actions.open("reject", req), danger: true });
  }
  if (payable) bar.push({ key: "pay", label: "Mark as paid", icon: <Banknote />, onClick: () => actions.open("pay", req), primary: true });
  if (isOwner && req.status === "draft") {
    bar.push({ key: "edit", label: "Continue editing", icon: <Pencil />, onClick: () => navigate(`/requests/${req.id}/edit`), primary: true });
    bar.push({ key: "delete", label: "Delete", icon: <Trash2 />, onClick: () => actions.open("delete", req), danger: true });
  }
  if (isOwner && req.status === "revision") bar.push({ key: "edit", label: "Edit & resubmit", icon: <Edit3 />, onClick: () => navigate(`/requests/${req.id}/edit`), primary: true });
  if (isOwner && (isPending(req.status) || req.status === "revision")) bar.push({ key: "cancel", label: "Cancel request", icon: <Ban />, onClick: () => actions.open("cancel", req), danger: true });
  bar.push({ key: "comment", label: "Comment", icon: <MessageSquare />, onClick: () => { setTab("comments"); setTimeout(() => document.getElementById("comment-box")?.focus(), 50); } });
  if (isOwner && (req.status === "rejected" || req.status === "cancelled")) bar.push({ key: "dup", label: "Create similar", icon: <FilePlus2 />, onClick: () => navigate("/requests/new") });

  return (
    <div className="pb-20 lg:pb-0">
      <PageHeader
        back="/requests"
        eyebrow={`${isOwner ? "My Requests" : "Requests"} · ${req.code}`}
        title={req.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={req.status} />
            {req.priority === "urgent" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600 dark:bg-red-950/40 dark:text-red-400">
                <Zap className="size-3" /> Urgent
              </span>
            )}
            <span>Updated {relativeTime(req.updatedAt)}</span>
          </span>
        }
        meta={
          <dl className="hidden gap-6 text-right md:flex">
            <div>
              <dt className="text-[11px] text-muted-foreground">Priority</dt>
              <dd className="text-sm capitalize">{req.priority}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">{req.type === "advance" ? "Needed by" : "Spent on"}</dt>
              <dd className="text-sm tabular-nums">{formatDate(req.dateNeeded)}</dd>
            </div>
          </dl>
        }
      />

      {/* Floating action bar */}
      <div className="fixed inset-x-3 bottom-3 z-30 lg:sticky lg:inset-x-auto lg:top-20 lg:bottom-auto lg:mb-6">
        <div className="scrollbar-thin flex items-center gap-1.5 overflow-x-auto rounded-full bg-ink p-1.5 shadow-2xl lg:inline-flex" role="toolbar" aria-label="Request actions">
          {bar.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={b.onClick}
              className={cn(
                "focus-ring flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-medium transition [&_svg]:size-3.5",
                b.primary ? "bg-white text-black hover:bg-white/90" : b.danger ? "text-red-300 ring-1 ring-white/15 hover:bg-white/10" : "text-white ring-1 ring-white/15 hover:bg-white/10",
              )}
            >
              {b.icon}
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {req.status === "rejected" && req.rejectionReason && (
        <Banner tone="red" icon={<XCircle />} title="Rejected" body={req.rejectionReason} />
      )}
      {req.status === "revision" && req.revisionNote && (
        <Banner tone="orange" icon={<RotateCcw />} title="Revision requested" body={req.revisionNote} />
      )}
      {req.status === "paid" && (
        <Banner tone="blue" icon={<Banknote />} title={`Paid on ${formatDate(req.paidAt)}`} body={req.paymentRef ? `Transfer reference ${req.paymentRef}` : "Payment completed"} />
      )}

      {/* Metric strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <Metric label="Amount" value={formatIDRCompact(req.amount).replace("Rp ", "")} unit="IDR" sub={formatIDR(req.amount)} />
        <Metric label="Category" value={<CategoryTag category={category} className="text-lg text-foreground md:text-xl" />} sub={dept?.name} />
        <Metric label="Type" value={req.type === "advance" ? "Advance" : "Reimburse"} sub={req.type === "advance" ? "Money before spending" : "Money already spent"} />
        <Metric
          label={req.type === "advance" ? "Needed in" : "Spent"}
          value={req.type === "advance" ? (daysLeft >= 0 ? String(daysLeft) : "Overdue") : String(Math.abs(daysLeft))}
          unit={req.type === "advance" ? (daysLeft >= 0 ? "days" : "") : "days ago"}
          sub={formatDate(req.dateNeeded)}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        {/* Left: summary */}
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-4">
            <PeopleFlow db={db} req={req} requester={requester} />
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <p className="text-xs text-muted-foreground">Purpose</p>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{req.description || "—"}</p>
              </div>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <Item label="Vendor / payee" value={req.vendor || "—"} />
                <Item label="Requester" value={requester.name} />
                <Item label="Department" value={dept?.name ?? "—"} />
                <Item label="Created" value={formatDate(req.createdAt)} />
                <Item label="Submitted" value={req.submittedAt ? formatDate(req.submittedAt) : "Not yet"} />
                <Item label="Reference" value={req.code} />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Attachments <span className="text-sm font-normal text-muted-foreground">({req.attachments.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {req.attachments.length === 0 ? (
                <p className="rounded-lg bg-surface px-4 py-5 text-center text-sm text-muted-foreground">No attachments{isOwner && isEditable(req.status) ? " — add an invoice or quotation when editing." : "."}</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {req.attachments.map((a) => (
                    <li key={a.id}>
                      <a
                        href={a.dataUrl ?? "#"}
                        download={a.dataUrl ? a.name : undefined}
                        onClick={(e) => {
                          if (!a.dataUrl) {
                            e.preventDefault();
                            toast.info("Sample file", "Seeded attachments are placeholders in demo mode.");
                          }
                        }}
                        className="focus-ring group flex max-w-full items-center gap-2 rounded-full border border-border py-1.5 pl-2 pr-3 text-xs transition hover:bg-surface"
                      >
                        <span className="flex size-6 items-center justify-center rounded-full bg-muted">{a.type.startsWith("image") ? <ImageIcon className="size-3.5" /> : <FileText className="size-3.5" />}</span>
                        <span className="max-w-[12rem] truncate">{a.name}</span>
                        <span className="text-muted-foreground">{formatBytes(a.size)}</span>
                        <Download className="size-3.5 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {impact.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Budget impact</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {impact.map((i) => (
                  <div key={i.budget.id}>
                    <div className="mb-1.5 flex justify-between gap-2 text-sm">
                      <span>{i.name} <span className="text-xs text-muted-foreground">· {i.label}</span></span>
                      <span className={cn("font-medium tabular-nums", i.exceeds && "text-red-600 dark:text-red-400")}>{i.exceeds ? `Over ${formatIDRCompact(-i.after)}` : `${formatIDRCompact(i.after)} left`}</span>
                    </div>
                    <BudgetBar label={`${i.name} budget`} usedPct={i.usedPct} pendingPct={i.budget.amount ? ((i.pending + req.amount) / i.budget.amount) * 100 : 0} over={i.exceeds} />
                  </div>
                ))}
                {impact.some((i) => i.exceeds) && (
                  <p className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="size-3.5" /> Approving this request would exceed the remaining budget.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: progress, timeline & comments */}
        <div className="space-y-4 lg:col-span-3">
          <ApprovalProgress db={db} req={req} />
          <Card>
            <div className="px-5 pt-4">
              <Tabs
                size="lg"
                value={tab}
                onChange={setTab}
                items={[
                  { value: "timeline", label: "Activity" },
                  { value: "comments", label: "Comments", count: comments.length },
                ]}
              />
            </div>
            <CardContent className="pt-5">{tab === "timeline" ? <Timeline db={db} req={req} /> : <Comments db={db} req={req} user={user} />}</CardContent>
          </Card>
        </div>
      </div>
      {actions.dialogs}
    </div>
  );
}

/* ---------------- pieces ---------------- */

function Banner({ tone, icon, title, body }: { tone: "red" | "orange" | "blue"; icon: ReactNode; title: string; body: string }) {
  const c = {
    red: "border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200",
    orange: "border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-200",
    blue: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200",
  }[tone];
  return (
    <div className={cn("mb-5 flex gap-3 rounded-xl border p-4 text-sm [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0", c)}>
      {icon}
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 opacity-90">{body}</p>
      </div>
    </div>
  );
}

function Metric({ label, value, unit, sub }: { label: string; value: ReactNode; unit?: string; sub?: string }) {
  return (
    <div className="flex min-h-[6.5rem] flex-col justify-between rounded-xl border border-border/70 bg-card p-4 shadow-soft md:p-5">
      <p className="text-xs text-muted-foreground md:text-sm">{label}</p>
      <div>
        <p className="mt-2 truncate">
          <span className="text-2xl font-light tracking-tight md:text-3xl">{value}</span>
          {unit && <span className="ml-1 text-sm text-muted-foreground">{unit}</span>}
        </p>
        {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function Item({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate">{value}</dd>
    </div>
  );
}

/** Requester ▶ current approver pills (inspired by the reference call participants row). */
function PeopleFlow({ db, req, requester }: { db: DB; req: SpendRequest; requester: User }) {
  const step = approvalChain(db, req).find((c) => c.status === req.status);
  const lastActor = [...db.approvals].filter((a) => a.requestId === req.id).sort((a, b) => b.at.localeCompare(a.at))[0];
  const other = step?.user ?? (lastActor ? db.users.find((u) => u.id === lastActor.actorId) : undefined);
  const otherLabel = step ? `Waiting · ${step.label}` : lastActor ? `Last action · ${lastActor.decision}` : "Not submitted";
  return (
    <div className="flex items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-full bg-surface p-1.5 pr-4">
        <Avatar user={requester} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{requester.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">Requester</p>
        </div>
      </div>
      <span className="size-0 border-y-[5px] border-l-[7px] border-y-transparent border-l-foreground" aria-hidden />
      <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-full bg-surface p-1.5 pr-4">
        {other ? <Avatar user={other} /> : <span className="flex size-9 items-center justify-center rounded-full bg-muted"><Circle className="size-4 text-muted-foreground" /></span>}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{other?.name ?? "—"}</p>
          <p className="truncate text-[11px] capitalize text-muted-foreground">{otherLabel}</p>
        </div>
      </div>
    </div>
  );
}

function ApprovalProgress({ db, req }: { db: DB; req: SpendRequest }) {
  const chain = approvalChain(db, req);
  const approvals = db.approvals.filter((a) => a.requestId === req.id);
  const steps = [
    { key: "submitted", label: "Submitted", sub: req.submittedAt ? formatDate(req.submittedAt) : "Draft", state: req.submittedAt ? "done" : "current" },
    ...chain.map((c) => {
      const latest = [...approvals].reverse().find((a) => a.step === c.step);
      const state =
        req.status === c.status ? "current" : latest?.decision === "approved" && (req.status !== "revision" && req.status !== "draft") ? "done" : latest && (latest.decision === "rejected") && req.status === "rejected" ? "failed" : latest?.decision === "revision" && req.status === "revision" ? "failed" : "todo";
      return { key: c.step, label: c.label, sub: c.user?.name ?? "Finance team", state };
    }),
    { key: "paid", label: "Paid", sub: req.paidAt ? formatDate(req.paidAt) : req.status === "approved" ? "Ready to pay" : "—", state: req.status === "paid" ? "done" : req.status === "approved" ? "current" : "todo" },
  ];
  return (
    <div className="bg-hero rounded-xl p-5 text-white shadow-soft">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-white/85">Approval progress</p>
        <p className="text-xs text-white/70">{STATUS_META[req.status].label}</p>
      </div>
      <ol className="flex items-start">
        {steps.map((s, i) => (
          <li key={s.key} className="flex min-w-0 flex-1 flex-col items-center text-center">
            <div className="flex w-full items-center">
              <span className={cn("h-px flex-1", i === 0 ? "bg-transparent" : steps[i - 1]!.state === "done" ? "bg-white/80" : "bg-white/25")} />
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full ring-1",
                  s.state === "done" && "bg-white text-teal-700 ring-white",
                  s.state === "current" && "bg-white/20 text-white ring-white",
                  s.state === "failed" && "bg-red-500 text-white ring-red-300",
                  s.state === "todo" && "bg-transparent text-white/60 ring-white/30",
                )}
                aria-label={`${s.label}: ${s.state}`}
              >
                {s.state === "done" ? <Check className="size-4" /> : s.state === "failed" ? <X className="size-4" /> : s.state === "current" ? <Clock className="size-4" /> : <span className="text-xs">{i + 1}</span>}
              </span>
              <span className={cn("h-px flex-1", i === steps.length - 1 ? "bg-transparent" : s.state === "done" ? "bg-white/80" : "bg-white/25")} />
            </div>
            <p className="mt-2 w-full truncate px-1 text-xs font-medium">{s.label}</p>
            <p className="w-full truncate px-1 text-[11px] text-white/70">{s.sub}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

const ACTION_META: Record<AuditLog["action"], { label: string; icon: ReactNode; tone: string }> = {
  created: { label: "created the request", icon: <FilePlus2 />, tone: "bg-muted text-muted-foreground" },
  updated: { label: "edited the request", icon: <Pencil />, tone: "bg-muted text-muted-foreground" },
  submitted: { label: "submitted for approval", icon: <Send />, tone: "bg-primary-soft text-primary" },
  resubmitted: { label: "resubmitted after revision", icon: <Send />, tone: "bg-primary-soft text-primary" },
  approved: { label: "approved", icon: <CheckCircle2 />, tone: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40" },
  rejected: { label: "rejected the request", icon: <XCircle />, tone: "bg-red-50 text-red-600 dark:bg-red-950/40" },
  revision_requested: { label: "requested a revision", icon: <RotateCcw />, tone: "bg-orange-50 text-orange-600 dark:bg-orange-950/40" },
  cancelled: { label: "cancelled the request", icon: <Ban />, tone: "bg-muted text-muted-foreground" },
  paid: { label: "marked as paid", icon: <Banknote />, tone: "bg-blue-50 text-blue-600 dark:bg-blue-950/40" },
  commented: { label: "commented", icon: <MessageSquare />, tone: "bg-muted text-muted-foreground" },
  deleted: { label: "deleted", icon: <Trash2 />, tone: "bg-muted" },
  category_created: { label: "", icon: null, tone: "" },
  category_updated: { label: "", icon: null, tone: "" },
  budget_created: { label: "", icon: null, tone: "" },
  budget_updated: { label: "", icon: null, tone: "" },
  budget_deleted: { label: "", icon: null, tone: "" },
  settings_updated: { label: "", icon: null, tone: "" },
  signed_in: { label: "", icon: null, tone: "" },
  exported: { label: "", icon: null, tone: "" },
};

function Timeline({ db, req }: { db: DB; req: SpendRequest }) {
  const logs = db.auditLogs.filter((l) => l.requestId === req.id && l.action !== "commented").sort((a, b) => a.at.localeCompare(b.at));
  const step = approvalChain(db, req).find((c) => c.status === req.status);
  return (
    <ol className="relative space-y-5 before:absolute before:bottom-2 before:left-[17px] before:top-2 before:w-px before:bg-border">
      {logs.map((l) => {
        const actor = db.users.find((u) => u.id === l.actorId);
        const m = ACTION_META[l.action];
        const showDetails = ["rejected", "revision_requested", "paid", "approved"].includes(l.action) && l.details && !l.details.startsWith("Approved at");
        return (
          <li key={l.id} className="relative flex gap-3">
            <span className={cn("relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full ring-4 ring-card [&_svg]:size-4", m.tone)}>{m.icon}</span>
            <div className="min-w-0 flex-1 pt-1">
              <p className="text-sm">
                <span className="font-medium">{actor?.name ?? "System"}</span> <span className="text-muted-foreground">{m.label}</span>
                {l.action === "approved" && l.details.startsWith("Approved at") && <span className="text-muted-foreground"> ({l.details.replace("Approved at ", "").replace(" step", "")} step)</span>}
              </p>
              <p className="text-xs text-muted-foreground">{formatDateTime(l.at)}</p>
              {showDetails && <p className="mt-2 rounded-lg bg-surface px-3 py-2 text-sm">{l.details}</p>}
            </div>
          </li>
        );
      })}
      {(step || req.status === "approved") && (
        <li className="relative flex gap-3">
          <span className="relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-border bg-card ring-4 ring-card">
            <Clock className="size-4 text-muted-foreground" />
          </span>
          <div className="pt-1">
            <p className="text-sm text-muted-foreground">
              Waiting for <span className="font-medium text-foreground">{step ? step.user?.name ?? "Finance" : "Finance"}</span> {step ? `(${step.label.toLowerCase()} approval)` : "to process payment"}
            </p>
          </div>
        </li>
      )}
    </ol>
  );
}

function Comments({ db, req, user }: { db: DB; req: SpendRequest; user: User }) {
  const [body, setBody] = useState("");
  const list = db.comments.filter((c) => c.requestId === req.id).sort((a, b) => a.at.localeCompare(b.at));
  const send = (e?: FormEvent) => {
    e?.preventDefault();
    if (!body.trim()) return;
    requests.comment(req.id, body);
    setBody("");
    toast.success("Comment posted");
  };
  return (
    <div>
      {list.length === 0 ? (
        <p className="rounded-lg bg-surface px-4 py-6 text-center text-sm text-muted-foreground">No comments yet. Ask a question or add context for approvers.</p>
      ) : (
        <ul className="space-y-4">
          {list.map((c) => {
            const author = db.users.find((u) => u.id === c.authorId);
            const mine = c.authorId === user.id;
            return (
              <li key={c.id} className={cn("flex gap-3", mine && "flex-row-reverse")}>
                <Avatar user={author} size="sm" />
                <div className={cn("max-w-[85%] rounded-2xl px-4 py-2.5", mine ? "rounded-tr-sm bg-ink text-ink-foreground" : "rounded-tl-sm bg-surface")}>
                  <p className={cn("text-xs", mine ? "text-white/70" : "text-muted-foreground")}>
                    <span className="font-medium">{mine ? "You" : author?.name}</span> · {relativeTime(c.at)}
                  </p>
                  <p className="mt-0.5 whitespace-pre-line text-sm">{c.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <form onSubmit={send} className="mt-5 flex items-end gap-2">
        <label htmlFor="comment-box" className="sr-only">Write a comment</label>
        <Textarea
          id="comment-box"
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
          }}
          placeholder="Write a comment… (Ctrl + Enter to send)"
          className="min-h-12 resize-none rounded-2xl"
        />
        <Button type="submit" size="icon" variant="ink" disabled={!body.trim()} aria-label="Send comment">
          <Send />
        </Button>
      </form>
    </div>
  );
}
