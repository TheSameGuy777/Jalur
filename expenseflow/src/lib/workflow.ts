import type { Budget, BudgetPeriod, DB, SpendRequest, Status, User } from "./types";
import { MONTHS_SHORT, parseDate } from "./utils";

export type Tone = "gray" | "yellow" | "green" | "red" | "blue" | "orange";

export const STATUS_META: Record<Status, { label: string; tone: Tone; short: string }> = {
  draft: { label: "Draft", short: "Draft", tone: "gray" },
  pending_manager: { label: "Pending Manager", short: "Pending", tone: "yellow" },
  pending_director: { label: "Pending Director", short: "Pending", tone: "yellow" },
  pending_finance: { label: "Pending Finance", short: "Pending", tone: "yellow" },
  approved: { label: "Approved", short: "Approved", tone: "green" },
  paid: { label: "Paid", short: "Paid", tone: "blue" },
  rejected: { label: "Rejected", short: "Rejected", tone: "red" },
  cancelled: { label: "Cancelled", short: "Cancelled", tone: "gray" },
  revision: { label: "Needs Revision", short: "Revision", tone: "orange" },
};

export const PENDING: Status[] = ["pending_manager", "pending_director", "pending_finance"];
export const isPending = (s: Status) => PENDING.includes(s);
export const isEditable = (s: Status) => s === "draft" || s === "revision";
export const isCommitted = (s: Status) => s === "approved" || s === "paid";

export const ROLE_LABEL: Record<User["role"], string> = {
  employee: "Employee",
  manager: "Approver (Manager)",
  finance: "Finance / Admin",
};

export function roleLabel(u: User) {
  if (u.isDirector) return "Approver (Director)";
  return ROLE_LABEL[u.role];
}

export function needsDirector(db: DB, req: Pick<SpendRequest, "amount">) {
  return db.settings.highValueRuleEnabled && req.amount > db.settings.highValueThreshold;
}

/** Ordered approval chain for a request (who must act, in which order). */
export function approvalChain(db: DB, req: SpendRequest) {
  const requester = db.users.find((u) => u.id === req.requesterId);
  const manager = requester?.managerId ? db.users.find((u) => u.id === requester.managerId) : undefined;
  const director = db.users.find((u) => u.isDirector && u.id !== req.requesterId);
  const chain: { step: "manager" | "director" | "finance"; label: string; status: Status; user?: User }[] = [];
  if (manager) chain.push({ step: "manager", label: "Manager", status: "pending_manager", user: manager });
  if (needsDirector(db, req) && director && director.id !== manager?.id)
    chain.push({ step: "director", label: "Director", status: "pending_director", user: director });
  chain.push({ step: "finance", label: "Finance", status: "pending_finance", user: db.users.find((u) => u.role === "finance" && u.id !== req.requesterId) });
  return chain;
}

export function firstStatus(db: DB, req: SpendRequest): Status {
  return approvalChain(db, req)[0]!.status;
}

export function nextStatus(db: DB, req: SpendRequest): Status {
  const chain = approvalChain(db, req);
  const idx = chain.findIndex((c) => c.status === req.status);
  if (idx === -1 || idx === chain.length - 1) return "approved";
  return chain[idx + 1]!.status;
}

/** Can this user act (approve/reject/revise) on the request right now? */
export function canApprove(db: DB, user: User, req: SpendRequest) {
  if (user.id === req.requesterId) return false;
  const requester = db.users.find((u) => u.id === req.requesterId);
  switch (req.status) {
    case "pending_manager":
      return requester?.managerId === user.id;
    case "pending_director":
      return !!user.isDirector;
    case "pending_finance":
      return user.role === "finance";
    default:
      return false;
  }
}

export function canMarkPaid(user: User, req: SpendRequest) {
  return user.role === "finance" && req.status === "approved";
}

export function canView(db: DB, user: User, req: SpendRequest) {
  if (user.role === "finance" || user.isDirector) return true;
  if (req.requesterId === user.id) return true;
  const requester = db.users.find((u) => u.id === req.requesterId);
  return requester?.managerId === user.id && req.status !== "draft";
}

export function approverQueue(db: DB, user: User) {
  return db.requests
    .filter((r) => canApprove(db, user, r) || (user.role === "finance" && r.status === "approved"))
    .sort((a, b) => (a.priority === b.priority ? (a.submittedAt ?? "").localeCompare(b.submittedAt ?? "") : a.priority === "urgent" ? -1 : 1));
}

export function visibleRequests(db: DB, user: User, scope: "mine" | "team" | "all") {
  if (scope === "mine") return db.requests.filter((r) => r.requesterId === user.id);
  if (scope === "team")
    return db.requests.filter((r) => {
      if (r.requesterId === user.id) return false;
      const requester = db.users.find((u) => u.id === r.requesterId);
      return requester?.managerId === user.id && r.status !== "draft";
    });
  return db.requests.filter((r) => r.status !== "draft" || r.requesterId === user.id);
}

/* ---------------- Budgets ---------------- */

export function periodRange(period: BudgetPeriod, ref = new Date()) {
  const y = ref.getFullYear();
  if (period === "monthly") {
    const m = ref.getMonth();
    return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0, 23, 59, 59), label: `${MONTHS_SHORT[m]} ${y}` };
  }
  const q = Math.floor(ref.getMonth() / 3);
  return { start: new Date(y, q * 3, 1), end: new Date(y, q * 3 + 3, 0, 23, 59, 59), label: `Q${q + 1} ${y}` };
}

function matchesBudget(b: Budget, r: SpendRequest) {
  return b.scope === "category" ? r.categoryId === b.refId : r.departmentId === b.refId;
}

export function budgetUsage(db: DB, b: Budget, ref = new Date(), excludeId?: string) {
  const { start, end, label } = periodRange(b.period, ref);
  let used = 0;
  let pending = 0;
  for (const r of db.requests) {
    if (r.id === excludeId || !matchesBudget(b, r)) continue;
    const d = parseDate(r.dateNeeded);
    if (d < start || d > end) continue;
    if (isCommitted(r.status)) used += r.amount;
    else if (isPending(r.status)) pending += r.amount;
  }
  const remaining = b.amount - used - pending;
  const pct = b.amount > 0 ? Math.min(100, ((used + pending) / b.amount) * 100) : 0;
  return { used, pending, remaining, label, pct, usedPct: b.amount > 0 ? Math.min(100, (used / b.amount) * 100) : 0 };
}

/** Budgets touched by a (draft) request and whether it would overspend them. */
export function budgetImpact(db: DB, req: Pick<SpendRequest, "id" | "categoryId" | "departmentId" | "amount" | "dateNeeded">) {
  const ref = req.dateNeeded ? parseDate(req.dateNeeded) : new Date();
  return db.budgets
    .filter((b) => (b.scope === "category" ? b.refId === req.categoryId : b.refId === req.departmentId))
    .map((b) => {
      const u = budgetUsage(db, b, ref, req.id);
      const name =
        b.scope === "category"
          ? db.categories.find((c) => c.id === b.refId)?.name ?? "Category"
          : db.departments.find((d) => d.id === b.refId)?.name ?? "Department";
      return { budget: b, name, ...u, exceeds: req.amount > u.remaining, after: u.remaining - req.amount };
    });
}
