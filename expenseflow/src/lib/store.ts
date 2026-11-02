/**
 * Demo-mode data store.
 * ------------------------------------------------------------------
 * All business rules (approval workflow, RBAC checks, audit logging,
 * notifications) live here so the UI stays thin. The same functions map
 * 1:1 to Supabase RPCs / Postgres functions in supabase/schema.sql.
 * State is persisted to localStorage so the demo survives reloads.
 */
import { useSyncExternalStore } from "react";
import { createSeed, DB_VERSION, DEMO_PASSWORD } from "./seed";
import type { AuditLog, Budget, Category, DB, SpendRequest, User } from "./types";
import { formatIDR, uid } from "./utils";
import { approvalChain, canApprove, canMarkPaid, firstStatus, isEditable, isPending, nextStatus, STATUS_META } from "./workflow";

const KEY = "expenseflow.db";

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DB;
      if (parsed.version === DB_VERSION) return parsed;
    }
  } catch {
    /* ignore corrupted storage */
  }
  return createSeed();
}

let db: DB = load();
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    // Quota exceeded (large attachments) — drop inline file data and retry.
    try {
      const slim: DB = { ...db, requests: db.requests.map((r) => ({ ...r, attachments: r.attachments.map((a) => ({ ...a, dataUrl: undefined })) })) };
      localStorage.setItem(KEY, JSON.stringify(slim));
    } catch {
      /* give up silently */
    }
  }
}

function commit(mutator: (d: DB) => void) {
  const next: DB = JSON.parse(JSON.stringify(db));
  mutator(next);
  db = next;
  persist();
  listeners.forEach((l) => l());
}

export function getDB() {
  return db;
}

export function useDB(): DB {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => db,
  );
}

export function useCurrentUser(): User | null {
  const d = useDB();
  return d.users.find((u) => u.id === d.currentUserId) ?? null;
}

/* ---------------- helpers ---------------- */

class ActionError extends Error {}

const now = () => new Date().toISOString();

function me(d: DB): User {
  const u = d.users.find((x) => x.id === d.currentUserId);
  if (!u) throw new ActionError("You are signed out.");
  return u;
}

function audit(d: DB, entry: Omit<AuditLog, "id" | "at" | "actorId"> & { actorId?: string }) {
  d.auditLogs.push({ id: uid("log"), at: now(), actorId: entry.actorId ?? d.currentUserId ?? "system", ...entry });
}

function notify(d: DB, userId: string | undefined, title: string, body: string, requestId?: string) {
  if (!userId) return;
  const user = d.users.find((u) => u.id === userId);
  if (!user) return;
  d.notifications.push({ id: uid("nt"), userId, title, body, requestId, read: false, at: now() });
  if (d.settings.emailEnabled && user.prefs.email) d.outbox.unshift({ id: uid("ob"), channel: "email", to: user.email, subject: title, at: now() });
  if (d.settings.whatsappEnabled && user.prefs.whatsapp && user.phone)
    d.outbox.unshift({ id: uid("ob"), channel: "whatsapp", to: user.phone, subject: title, at: now() });
  d.outbox = d.outbox.slice(0, 200);
}

function notifyNextApprovers(d: DB, r: SpendRequest) {
  const requester = d.users.find((u) => u.id === r.requesterId)!;
  const step = approvalChain(d, r).find((c) => c.status === r.status);
  const label = `“${r.title}” (${formatIDR(r.amount)})`;
  if (r.status === "pending_finance") {
    d.users.filter((u) => u.role === "finance" && u.id !== r.requesterId).forEach((u) => notify(d, u.id, "Ready for finance review", `${label} is waiting for final approval.`, r.id));
  } else if (step?.user) {
    const title = r.status === "pending_director" ? "High-value approval needed" : "New request to review";
    notify(d, step.user.id, title, `${requester.name} submitted ${label}.`, r.id);
  }
}

function getReq(d: DB, id: string) {
  const r = d.requests.find((x) => x.id === id);
  if (!r) throw new ActionError("Request not found.");
  return r;
}

/* ---------------- auth ---------------- */

export const auth = {
  signIn(email: string, password: string) {
    const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user || password !== DEMO_PASSWORD) throw new ActionError("Invalid email or password.");
    commit((d) => {
      d.currentUserId = user.id;
      audit(d, { action: "signed_in", entity: "auth", details: `${user.name} signed in` });
    });
    return user;
  },
  switchTo(userId: string) {
    commit((d) => {
      d.currentUserId = userId;
    });
  },
  signOut() {
    commit((d) => {
      d.currentUserId = null;
    });
  },
};

/* ---------------- requests ---------------- */

export type RequestInput = Pick<
  SpendRequest,
  "title" | "categoryId" | "amount" | "dateNeeded" | "description" | "vendor" | "attachments" | "priority" | "type"
>;

export const requests = {
  save(input: RequestInput, opts: { id?: string; submit: boolean }) {
    let resultId = opts.id ?? "";
    commit((d) => {
      const user = me(d);
      let r: SpendRequest;
      if (opts.id) {
        r = getReq(d, opts.id);
        if (r.requesterId !== user.id) throw new ActionError("You can only edit your own requests.");
        if (!isEditable(r.status)) throw new ActionError("This request can no longer be edited.");
        Object.assign(r, input, { updatedAt: now() });
        audit(d, { action: "updated", entity: "request", entityId: r.id, requestId: r.id, details: "Edited request details" });
      } else {
        d.seq += 1;
        r = {
          ...input,
          id: uid("r"),
          code: `SR-${new Date().getFullYear().toString().slice(2)}-${String(d.seq).padStart(4, "0")}`,
          status: "draft",
          requesterId: user.id,
          departmentId: user.departmentId,
          createdAt: now(),
          updatedAt: now(),
        };
        d.requests.push(r);
        audit(d, { action: "created", entity: "request", entityId: r.id, requestId: r.id, details: `Created request ${r.code}` });
      }
      resultId = r.id;
      if (opts.submit) {
        const wasRevision = r.status === "revision";
        r.status = firstStatus(d, r);
        r.submittedAt = now();
        r.revisionNote = undefined;
        audit(d, {
          action: wasRevision ? "resubmitted" : "submitted",
          entity: "request",
          entityId: r.id,
          requestId: r.id,
          details: wasRevision ? "Resubmitted after revision" : `Submitted for approval → ${STATUS_META[r.status].label}`,
        });
        notifyNextApprovers(d, r);
      }
    });
    return resultId;
  },

  approve(id: string, note?: string) {
    commit((d) => {
      const user = me(d);
      const r = getReq(d, id);
      if (!canApprove(d, user, r)) throw new ActionError("You are not the approver for this step.");
      const step = approvalChain(d, r).find((c) => c.status === r.status)?.step ?? "manager";
      d.approvals.push({ id: uid("ap"), requestId: r.id, step, actorId: user.id, decision: "approved", note, at: now() });
      r.status = nextStatus(d, r);
      r.updatedAt = now();
      audit(d, { action: "approved", entity: "request", entityId: r.id, requestId: r.id, details: `Approved at ${step} step${note ? ` — ${note}` : ""}` });
      if (r.status === "approved") {
        notify(d, r.requesterId, "Request approved", `“${r.title}” is fully approved and queued for payment.`, r.id);
      } else {
        notify(d, r.requesterId, "Approval progress", `${user.name} approved “${r.title}”. Next: ${STATUS_META[r.status].label}.`, r.id);
        notifyNextApprovers(d, r);
      }
    });
  },

  reject(id: string, reason: string) {
    if (!reason.trim()) throw new ActionError("A rejection reason is required.");
    commit((d) => {
      const user = me(d);
      const r = getReq(d, id);
      if (!canApprove(d, user, r)) throw new ActionError("You are not the approver for this step.");
      const step = approvalChain(d, r).find((c) => c.status === r.status)?.step ?? "manager";
      d.approvals.push({ id: uid("ap"), requestId: r.id, step, actorId: user.id, decision: "rejected", note: reason, at: now() });
      r.status = "rejected";
      r.rejectionReason = reason;
      r.updatedAt = now();
      audit(d, { action: "rejected", entity: "request", entityId: r.id, requestId: r.id, details: reason });
      notify(d, r.requesterId, "Request rejected", `${user.name} rejected “${r.title}”: ${reason}`, r.id);
    });
  },

  requestRevision(id: string, note: string) {
    if (!note.trim()) throw new ActionError("Please describe what needs to change.");
    commit((d) => {
      const user = me(d);
      const r = getReq(d, id);
      if (!canApprove(d, user, r)) throw new ActionError("You are not the approver for this step.");
      const step = approvalChain(d, r).find((c) => c.status === r.status)?.step ?? "manager";
      d.approvals.push({ id: uid("ap"), requestId: r.id, step, actorId: user.id, decision: "revision", note, at: now() });
      r.status = "revision";
      r.revisionNote = note;
      r.updatedAt = now();
      audit(d, { action: "revision_requested", entity: "request", entityId: r.id, requestId: r.id, details: note });
      notify(d, r.requesterId, "Revision requested", `${user.name} asked for changes on “${r.title}”: ${note}`, r.id);
    });
  },

  markPaid(id: string, ref: string) {
    commit((d) => {
      const user = me(d);
      const r = getReq(d, id);
      if (!canMarkPaid(user, r)) throw new ActionError("Only Finance can mark approved requests as paid.");
      r.status = "paid";
      r.paidAt = now();
      r.paymentRef = ref.trim() || undefined;
      r.updatedAt = now();
      d.approvals.push({ id: uid("ap"), requestId: r.id, step: "payment", actorId: user.id, decision: "paid", note: r.paymentRef, at: now() });
      audit(d, { action: "paid", entity: "request", entityId: r.id, requestId: r.id, details: `Marked as paid${r.paymentRef ? ` · ref ${r.paymentRef}` : ""}` });
      notify(d, r.requesterId, "Request paid", `“${r.title}” (${formatIDR(r.amount)}) has been paid.`, r.id);
    });
  },

  cancel(id: string) {
    commit((d) => {
      const user = me(d);
      const r = getReq(d, id);
      if (r.requesterId !== user.id) throw new ActionError("Only the requester can cancel.");
      if (!(isPending(r.status) || r.status === "revision")) throw new ActionError("Only pending requests can be cancelled.");
      r.status = "cancelled";
      r.updatedAt = now();
      audit(d, { action: "cancelled", entity: "request", entityId: r.id, requestId: r.id, details: "Cancelled by requester" });
    });
  },

  deleteDraft(id: string) {
    commit((d) => {
      const user = me(d);
      const r = getReq(d, id);
      if (r.requesterId !== user.id || r.status !== "draft") throw new ActionError("Only your own drafts can be deleted.");
      d.requests = d.requests.filter((x) => x.id !== id);
      d.comments = d.comments.filter((c) => c.requestId !== id);
      audit(d, { action: "deleted", entity: "request", entityId: id, details: `Deleted draft ${r.code} “${r.title}”` });
    });
  },

  comment(id: string, body: string) {
    if (!body.trim()) return;
    commit((d) => {
      const user = me(d);
      const r = getReq(d, id);
      d.comments.push({ id: uid("cm"), requestId: id, authorId: user.id, body: body.trim(), at: now() });
      audit(d, { action: "commented", entity: "request", entityId: id, requestId: id, details: "Added a comment" });
      const targets = new Set<string>([r.requesterId, ...d.comments.filter((c) => c.requestId === id).map((c) => c.authorId)]);
      const step = approvalChain(d, r).find((c) => c.status === r.status);
      if (step?.user) targets.add(step.user.id);
      targets.delete(user.id);
      targets.forEach((t) => notify(d, t, "New comment", `${user.name} on “${r.title}”: ${body.trim().slice(0, 80)}`, id));
    });
  },
};

/* ---------------- notifications ---------------- */

export const notifications = {
  markRead(id: string) {
    commit((d) => {
      const n = d.notifications.find((x) => x.id === id);
      if (n) n.read = true;
    });
  },
  markAllRead() {
    commit((d) => {
      d.notifications.forEach((n) => {
        if (n.userId === d.currentUserId) n.read = true;
      });
    });
  },
};

/* ---------------- admin ---------------- */

function requireFinance(d: DB) {
  const u = me(d);
  if (u.role !== "finance") throw new ActionError("Finance/Admin permission required.");
  return u;
}

export const admin = {
  upsertCategory(c: Partial<Category> & { name: string; color: string }) {
    commit((d) => {
      requireFinance(d);
      const name = c.name.trim();
      if (!name) throw new ActionError("Category name is required.");
      if (d.categories.some((x) => x.name.toLowerCase() === name.toLowerCase() && x.id !== c.id)) throw new ActionError("A category with this name already exists.");
      if (c.id) {
        const ex = d.categories.find((x) => x.id === c.id)!;
        Object.assign(ex, { name, color: c.color, active: c.active ?? ex.active });
        audit(d, { action: "category_updated", entity: "category", entityId: ex.id, details: `Updated category “${name}”${c.active === false ? " (deactivated)" : ""}` });
      } else {
        const id = uid("c");
        d.categories.push({ id, name, color: c.color, active: true });
        audit(d, { action: "category_created", entity: "category", entityId: id, details: `Created category “${name}”` });
      }
    });
  },
  upsertBudget(b: Omit<Budget, "id"> & { id?: string }) {
    commit((d) => {
      requireFinance(d);
      if (!(b.amount > 0)) throw new ActionError("Budget amount must be greater than 0.");
      const label = b.scope === "category" ? d.categories.find((c) => c.id === b.refId)?.name : d.departments.find((x) => x.id === b.refId)?.name;
      if (b.id) {
        const ex = d.budgets.find((x) => x.id === b.id)!;
        const before = ex.amount;
        Object.assign(ex, b);
        audit(d, { action: "budget_updated", entity: "budget", entityId: ex.id, details: `${label}: ${formatIDR(before)} → ${formatIDR(b.amount)} (${b.period})` });
      } else {
        if (d.budgets.some((x) => x.scope === b.scope && x.refId === b.refId)) throw new ActionError(`${label} already has a budget — edit it instead.`);
        const id = uid("b");
        d.budgets.push({ ...b, id });
        audit(d, { action: "budget_created", entity: "budget", entityId: id, details: `${label}: ${formatIDR(b.amount)} ${b.period}` });
      }
    });
  },
  deleteBudget(id: string) {
    commit((d) => {
      requireFinance(d);
      const b = d.budgets.find((x) => x.id === id);
      d.budgets = d.budgets.filter((x) => x.id !== id);
      audit(d, { action: "budget_deleted", entity: "budget", entityId: id, details: `Removed budget ${b ? formatIDR(b.amount) : ""}` });
    });
  },
  updateSettings(patch: Partial<DB["settings"]>) {
    commit((d) => {
      requireFinance(d);
      d.settings = { ...d.settings, ...patch };
      audit(d, { action: "settings_updated", entity: "settings", details: Object.entries(patch).map(([k, v]) => `${k} = ${v}`).join(", ") });
    });
  },
  logExport(what: string) {
    commit((d) => {
      audit(d, { action: "exported", entity: "report", details: what });
    });
  },
};

export const profile = {
  updatePrefs(prefs: Partial<User["prefs"]>, phone?: string) {
    commit((d) => {
      const u = me(d);
      u.prefs = { ...u.prefs, ...prefs };
      if (phone !== undefined) u.phone = phone;
    });
  },
};

export function resetDemo() {
  const current = db.currentUserId;
  db = createSeed();
  db.currentUserId = current;
  persist();
  listeners.forEach((l) => l());
}

export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong.";
}
