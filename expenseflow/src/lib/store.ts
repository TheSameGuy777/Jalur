/**
 * Supabase-backed data store.
 * ------------------------------------------------------------------
 * Same public API as the demo store (useDB, auth, requests, admin, …),
 * so pages/components don't need to change.
 *  - Reads: all tables are loaded into an in-memory snapshot after login
 *    (RLS decides what each user can see) and refreshed via Realtime.
 *  - Writes: applied optimistically to the snapshot, then sent to Supabase
 *    (tables + RPCs from supabase/schema.sql). On error → toast + reload.
 */
import { useSyncExternalStore } from "react";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { toast } from "@/components/ui/toast";
import type { Attachment, AuditLog, Budget, Category, DB, SpendRequest, User } from "./types";
import { uid } from "./utils";
import { approvalChain, canApprove, canMarkPaid, firstStatus, isEditable, isPending, nextStatus } from "./workflow";
import { formatIDR } from "./utils";

/* ---------------- client ---------------- */

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY_ = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const supabase: SupabaseClient | null = URL_ && KEY_ ? createClient(URL_, KEY_) : null;

class ActionError extends Error {}

function sb(): SupabaseClient {
  if (!supabase) throw new ActionError("Supabase belum dikonfigurasi. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY lalu redeploy.");
  return supabase;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
function ok<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

/* ---------------- snapshot state ---------------- */

const DEFAULT_SETTINGS: DB["settings"] = { highValueRuleEnabled: true, highValueThreshold: 10_000_000, emailEnabled: true, whatsappEnabled: false };

function emptyDB(): DB {
  return { version: 1, currentUserId: null, seq: 0, users: [], departments: [], categories: [], budgets: [], requests: [], approvals: [], comments: [], notifications: [], auditLogs: [], outbox: [], settings: DEFAULT_SETTINGS };
}

let db: DB = emptyDB();
let ready = !supabase;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribeStore = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

function setDB(next: DB) {
  db = next;
  emit();
}

function commit(mutator: (d: DB) => void) {
  const next: DB = JSON.parse(JSON.stringify(db));
  mutator(next);
  setDB(next);
}

export function getDB() {
  return db;
}
export function useDB(): DB {
  return useSyncExternalStore(subscribeStore, () => db);
}
export function useCurrentUser(): User | null {
  const d = useDB();
  return d.users.find((u) => u.id === d.currentUserId) ?? null;
}
/** false while the saved session is being restored on page load */
export function useAuthReady(): boolean {
  return useSyncExternalStore(subscribeStore, () => ready);
}

/* ---------------- mapping (snake_case rows → app types) ---------------- */

function hue(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

const mapUser = (u: Row): User => ({
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone ?? undefined,
  role: u.role,
  title: u.title ?? "",
  departmentId: u.department_id ?? "",
  managerId: u.manager_id ?? undefined,
  isDirector: !!u.is_director,
  avatarHue: hue(u.id),
  prefs: { email: !!u.notify_email, whatsapp: !!u.notify_whatsapp },
});

const mapRequest = (r: Row, attachments: Attachment[]): SpendRequest => ({
  id: r.id,
  code: r.code,
  title: r.title,
  categoryId: r.category_id,
  amount: Number(r.amount),
  dateNeeded: r.date_needed,
  description: r.description ?? "",
  vendor: r.vendor ?? "",
  attachments,
  priority: r.priority,
  type: r.type,
  status: r.status,
  requesterId: r.requester_id,
  departmentId: r.department_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  submittedAt: r.submitted_at ?? undefined,
  paidAt: r.paid_at ?? undefined,
  paymentRef: r.payment_ref ?? undefined,
  rejectionReason: r.rejection_reason ?? undefined,
  revisionNote: r.revision_note ?? undefined,
});

/* ---------------- loading ---------------- */

async function load() {
  const s = sb();
  const { data: sess } = await s.auth.getSession();
  const authId = sess.session?.user.id;
  if (!authId) {
    setDB(emptyDB());
    return;
  }
  const [users, departments, categories, budgets, requests, attachments, approvals, comments, notifications, audit, settings] = await Promise.all([
    s.from("users").select("*"),
    s.from("departments").select("*").order("name"),
    s.from("categories").select("*").order("name"),
    s.from("budgets").select("*"),
    s.from("requests").select("*"),
    s.from("request_attachments").select("*").order("created_at"),
    s.from("approvals").select("*").order("created_at"),
    s.from("comments").select("*").order("created_at"),
    s.from("notifications").select("*").order("created_at", { ascending: false }).limit(100),
    s.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(500),
    s.from("settings").select("*").eq("id", 1).maybeSingle(),
  ]);
  const failed = [users, departments, categories, budgets, requests, attachments, approvals, comments, notifications, audit, settings].find((r) => r.error);
  if (failed) throw failed.error;

  // Signed download links for attachments (private bucket, valid 1 hour)
  const attRows = (attachments.data ?? []) as Row[];
  const links = new Map<string, string>();
  if (attRows.length) {
    const { data } = await s.storage.from("attachments").createSignedUrls(attRows.map((a) => a.storage_path), 3600);
    (data ?? []).forEach((d) => d.path && d.signedUrl && links.set(d.path, d.signedUrl));
  }
  const attByReq = new Map<string, Attachment[]>();
  for (const a of attRows) {
    const list = attByReq.get(a.request_id) ?? [];
    list.push({ id: a.id, name: a.file_name, size: a.size_bytes, type: a.mime_type, dataUrl: links.get(a.storage_path) });
    attByReq.set(a.request_id, list);
  }

  const st = settings.data as Row | null;
  setDB({
    version: 1,
    currentUserId: authId,
    seq: 0,
    users: (users.data as Row[]).map(mapUser),
    departments: (departments.data as Row[]).map((d) => ({ id: d.id, name: d.name })),
    categories: (categories.data as Row[]).map((c) => ({ id: c.id, name: c.name, color: c.color, active: c.active })),
    budgets: (budgets.data as Row[]).map((b) => ({ id: b.id, scope: b.scope, refId: b.ref_id, period: b.period, amount: Number(b.amount) })),
    requests: (requests.data as Row[]).map((r) => mapRequest(r, attByReq.get(r.id) ?? [])),
    approvals: (approvals.data as Row[]).map((a) => ({ id: a.id, requestId: a.request_id, step: a.step, actorId: a.actor_id, decision: a.decision, note: a.note ?? undefined, at: a.created_at })),
    comments: (comments.data as Row[]).map((c) => ({ id: c.id, requestId: c.request_id, authorId: c.author_id, body: c.body, at: c.created_at })),
    notifications: (notifications.data as Row[]).map((n) => ({ id: n.id, userId: n.user_id, title: n.title, body: n.body, requestId: n.request_id ?? undefined, read: n.read, at: n.created_at })),
    auditLogs: (audit.data as Row[])
      .map((l) => ({ id: String(l.id), at: l.created_at, actorId: l.actor_id ?? "system", action: l.action, entity: l.entity, entityId: l.entity_id ?? undefined, requestId: l.request_id ?? undefined, details: l.details ?? "" }))
      .reverse() as AuditLog[],
    outbox: db.outbox,
    settings: st
      ? { highValueRuleEnabled: st.high_value_rule_enabled, highValueThreshold: Number(st.high_value_threshold), emailEnabled: st.email_enabled, whatsappEnabled: st.whatsapp_enabled }
      : DEFAULT_SETTINGS,
  });
  subscribeRealtime();
}

let inflight = 0;
let timer: number | undefined;
function refresh() {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    if (inflight > 0) return refresh(); // wait until pending writes are done
    load().catch((e) => toast.error("Gagal memuat data", errorMessage(e)));
  }, 250);
}

/** Queue a write to Supabase (serialised so inserts land before RPCs). */
let queue: Promise<void> = Promise.resolve();
function remote(label: string, fn: (s: SupabaseClient) => Promise<void>) {
  const s = sb();
  inflight++;
  queue = queue.then(async () => {
    try {
      await fn(s);
    } catch (e) {
      toast.error(`${label} gagal tersimpan`, errorMessage(e));
    } finally {
      inflight--;
      refresh();
    }
  });
}

let channel: RealtimeChannel | null = null;
function subscribeRealtime() {
  if (!supabase || channel) return;
  channel = supabase
    .channel("expenseflow-changes")
    .on("postgres_changes", { event: "*", schema: "public" }, () => refresh())
    .subscribe();
}

// Restore saved session on page load
if (supabase) {
  load()
    .catch((e) => toast.error("Gagal memuat data", errorMessage(e)))
    .finally(() => {
      ready = true;
      emit();
    });
}

/* ---------------- helpers ---------------- */

const now = () => new Date().toISOString();

function me(d: DB): User {
  const u = d.users.find((x) => x.id === d.currentUserId);
  if (!u) throw new ActionError("You are signed out.");
  return u;
}

function getReq(d: DB, id: string) {
  const r = d.requests.find((x) => x.id === id);
  if (!r) throw new ActionError("Request not found.");
  return r;
}

async function audit(s: SupabaseClient, entry: { action: AuditLog["action"]; entity: AuditLog["entity"]; entityId?: string; requestId?: string; details: string }) {
  ok(
    await s.from("audit_logs").insert({
      actor_id: db.currentUserId,
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entityId && /^[0-9a-f-]{36}$/i.test(entry.entityId) ? entry.entityId : null,
      request_id: entry.requestId ?? null,
      details: entry.details,
    }),
  );
}

async function notifyUsers(s: SupabaseClient, userIds: string[], title: string, body: string, requestId?: string) {
  const ids = [...new Set(userIds)].filter((id) => id && id !== db.currentUserId);
  if (!ids.length) return;
  ok(await s.from("notifications").insert(ids.map((user_id) => ({ user_id, title, body, request_id: requestId ?? null }))));
}

/** After a status change, notify whoever has to act next. (The requester is notified by the RPCs.) */
async function notifyNext(s: SupabaseClient, row: Row) {
  const requester = db.users.find((u) => u.id === row.requester_id);
  const label = `${requester?.name ?? "Someone"}: “${row.title}” (${formatIDR(Number(row.amount))})`;
  if (row.status === "pending_manager" && requester?.managerId) await notifyUsers(s, [requester.managerId], "New request to review", label, row.id);
  if (row.status === "pending_director")
    await notifyUsers(s, db.users.filter((u) => u.isDirector && u.id !== row.requester_id).map((u) => u.id), "High-value approval needed", label, row.id);
  if (row.status === "pending_finance")
    await notifyUsers(s, db.users.filter((u) => u.role === "finance" && u.id !== row.requester_id).map((u) => u.id), "Ready for finance review", label, row.id);
}

async function syncAttachments(s: SupabaseClient, requestId: string, next: Attachment[], prev: Attachment[]) {
  const prevIds = new Set(prev.map((a) => a.id));
  const nextIds = new Set(next.map((a) => a.id));
  for (const a of prev.filter((x) => !nextIds.has(x.id))) {
    const rows = ok(await s.from("request_attachments").delete().eq("id", a.id).select("storage_path")) as Row[];
    const paths = rows.map((r) => r.storage_path);
    if (paths.length) await s.storage.from("attachments").remove(paths);
  }
  for (const a of next.filter((x) => !prevIds.has(x.id))) {
    if (!a.dataUrl) {
      toast.error(`${a.name} tidak terupload`, "File terlalu besar untuk diproses di browser.");
      continue;
    }
    const blob = await (await fetch(a.dataUrl)).blob();
    const path = `${requestId}/${Date.now()}-${a.name.replace(/[^\w.\-]+/g, "_")}`;
    ok(await s.storage.from("attachments").upload(path, blob, { contentType: a.type, upsert: false }));
    ok(
      await s.from("request_attachments").insert({ request_id: requestId, file_name: a.name, storage_path: path, size_bytes: a.size, mime_type: a.type, uploaded_by: db.currentUserId }),
    );
  }
}

/* ---------------- auth ---------------- */

export const auth = {
  async signIn(email: string, password: string): Promise<User> {
    const s = sb();
    const { data, error } = await s.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new ActionError(error.message === "Invalid login credentials" ? "Email atau password salah." : error.message);
    await load();
    const user = db.users.find((u) => u.id === data.user.id);
    if (!user) {
      await s.auth.signOut();
      setDB(emptyDB());
      throw new ActionError("Login berhasil, tapi akun ini belum terdaftar di tabel public.users.");
    }
    remote("Audit log", (c) => audit(c, { action: "signed_in", entity: "auth", details: `${user.name} signed in` }));
    return user;
  },
  switchTo(_userId: string) {
    toast.info("Tidak tersedia di mode Supabase", "Sign out lalu login dengan akun lain.");
  },
  signOut() {
    setDB(emptyDB());
    if (channel && supabase) {
      supabase.removeChannel(channel);
      channel = null;
    }
    void supabase?.auth.signOut();
  },
};

/* ---------------- requests ---------------- */

export type RequestInput = Pick<SpendRequest, "title" | "categoryId" | "amount" | "dateNeeded" | "description" | "vendor" | "attachments" | "priority" | "type">;

export const requests = {
  save(input: RequestInput, opts: { id?: string; submit: boolean }) {
    const user = me(db);
    const existing = opts.id ? getReq(db, opts.id) : undefined;
    if (existing) {
      if (existing.requesterId !== user.id) throw new ActionError("You can only edit your own requests.");
      if (!isEditable(existing.status)) throw new ActionError("This request can no longer be edited.");
    }
    if (!user.departmentId) throw new ActionError("Akun kamu belum punya department_id di tabel users.");
    const id = existing?.id ?? crypto.randomUUID();
    const prevAttachments = existing?.attachments ?? [];

    commit((d) => {
      let r = d.requests.find((x) => x.id === id);
      if (!r) {
        r = { ...input, id, code: "SR-…", status: "draft", requesterId: user.id, departmentId: user.departmentId, createdAt: now(), updatedAt: now() };
        d.requests.push(r);
      } else Object.assign(r, input, { updatedAt: now() });
      if (opts.submit) {
        r.status = firstStatus(d, r);
        r.submittedAt = now();
        r.revisionNote = undefined;
      }
    });

    remote("Request", async (s) => {
      const row = {
        title: input.title,
        category_id: input.categoryId,
        amount: input.amount,
        date_needed: input.dateNeeded || new Date().toISOString().slice(0, 10),
        description: input.description,
        vendor: input.vendor,
        priority: input.priority,
        type: input.type,
      };
      if (existing) {
        ok(await s.from("requests").update({ ...row, updated_at: now() }).eq("id", id));
        await audit(s, { action: "updated", entity: "request", entityId: id, requestId: id, details: "Edited request details" });
      } else {
        ok(await s.from("requests").insert({ ...row, id, requester_id: user.id, department_id: user.departmentId, status: "draft" }));
        await audit(s, { action: "created", entity: "request", entityId: id, requestId: id, details: `Created request “${input.title}”` });
      }
      await syncAttachments(s, id, input.attachments, prevAttachments);
      if (opts.submit) {
        const res = ok(await s.rpc("submit_request", { p_id: id })) as Row;
        await notifyNext(s, res);
      }
    });
    return id;
  },

  approve(id: string, note?: string) {
    const user = me(db);
    const r = getReq(db, id);
    if (!canApprove(db, user, r)) throw new ActionError("You are not the approver for this step.");
    const step = approvalChain(db, r).find((c) => c.status === r.status)?.step ?? "manager";
    const next = nextStatus(db, r);
    commit((d) => {
      const x = getReq(d, id);
      d.approvals.push({ id: uid("ap"), requestId: id, step, actorId: user.id, decision: "approved", note, at: now() });
      x.status = next;
      x.updatedAt = now();
    });
    remote("Approval", async (s) => {
      const res = ok(await s.rpc("decide_request", { p_id: id, p_decision: "approved", p_note: note ?? null })) as Row;
      await notifyNext(s, res);
    });
  },

  reject(id: string, reason: string) {
    if (!reason.trim()) throw new ActionError("A rejection reason is required.");
    decide(id, "rejected", reason.trim());
  },

  requestRevision(id: string, note: string) {
    if (!note.trim()) throw new ActionError("Please describe what needs to change.");
    decide(id, "revision", note.trim());
  },

  markPaid(id: string, ref: string) {
    const user = me(db);
    const r = getReq(db, id);
    if (!canMarkPaid(user, r)) throw new ActionError("Only Finance can mark approved requests as paid.");
    commit((d) => {
      const x = getReq(d, id);
      x.status = "paid";
      x.paidAt = now();
      x.paymentRef = ref.trim() || undefined;
      d.approvals.push({ id: uid("ap"), requestId: id, step: "payment", actorId: user.id, decision: "paid", note: x.paymentRef, at: now() });
    });
    remote("Payment", async (s) => {
      ok(await s.rpc("mark_paid", { p_id: id, p_ref: ref.trim() || null }));
    });
  },

  cancel(id: string) {
    const user = me(db);
    const r = getReq(db, id);
    if (r.requesterId !== user.id) throw new ActionError("Only the requester can cancel.");
    if (!(isPending(r.status) || r.status === "revision")) throw new ActionError("Only pending requests can be cancelled.");
    commit((d) => {
      getReq(d, id).status = "cancelled";
    });
    remote("Cancel", async (s) => {
      ok(await s.rpc("cancel_request", { p_id: id }));
    });
  },

  deleteDraft(id: string) {
    const user = me(db);
    const r = getReq(db, id);
    if (r.requesterId !== user.id || r.status !== "draft") throw new ActionError("Only your own drafts can be deleted.");
    const paths = r.attachments.length;
    commit((d) => {
      d.requests = d.requests.filter((x) => x.id !== id);
    });
    remote("Delete", async (s) => {
      if (paths) {
        const rows = ok(await s.from("request_attachments").select("storage_path").eq("request_id", id)) as Row[];
        if (rows.length) await s.storage.from("attachments").remove(rows.map((x) => x.storage_path));
      }
      ok(await s.from("requests").delete().eq("id", id));
      await audit(s, { action: "deleted", entity: "request", details: `Deleted draft “${r.title}”` });
    });
  },

  comment(id: string, body: string) {
    const text = body.trim();
    if (!text) return;
    const user = me(db);
    const r = getReq(db, id);
    commit((d) => {
      d.comments.push({ id: uid("cm"), requestId: id, authorId: user.id, body: text, at: now() });
    });
    remote("Comment", async (s) => {
      ok(await s.from("comments").insert({ request_id: id, author_id: user.id, body: text }));
      await audit(s, { action: "commented", entity: "request", entityId: id, requestId: id, details: "Added a comment" });
      const step = approvalChain(db, r).find((c) => c.status === r.status);
      const targets = [r.requesterId, ...db.comments.filter((c) => c.requestId === id).map((c) => c.authorId), ...(step?.user ? [step.user.id] : [])];
      await notifyUsers(s, targets, "New comment", `${user.name} on “${r.title}”: ${text.slice(0, 80)}`, id);
    });
  },
};

function decide(id: string, decision: "rejected" | "revision", note: string) {
  const user = me(db);
  const r = getReq(db, id);
  if (!canApprove(db, user, r)) throw new ActionError("You are not the approver for this step.");
  const step = approvalChain(db, r).find((c) => c.status === r.status)?.step ?? "manager";
  commit((d) => {
    const x = getReq(d, id);
    d.approvals.push({ id: uid("ap"), requestId: id, step, actorId: user.id, decision, note, at: now() });
    x.status = decision;
    if (decision === "rejected") x.rejectionReason = note;
    else x.revisionNote = note;
    x.updatedAt = now();
  });
  remote(decision === "rejected" ? "Reject" : "Revision", async (s) => {
    ok(await s.rpc("decide_request", { p_id: id, p_decision: decision, p_note: note }));
  });
}

/* ---------------- notifications ---------------- */

export const notifications = {
  markRead(id: string) {
    commit((d) => {
      const n = d.notifications.find((x) => x.id === id);
      if (n) n.read = true;
    });
    remote("Notification", async (s) => {
      ok(await s.from("notifications").update({ read: true }).eq("id", id));
    });
  },
  markAllRead() {
    const userId = db.currentUserId;
    commit((d) => d.notifications.forEach((n) => n.userId === userId && (n.read = true)));
    remote("Notification", async (s) => {
      ok(await s.from("notifications").update({ read: true }).eq("user_id", userId).eq("read", false));
    });
  },
};

/* ---------------- admin (finance only — enforced by RLS too) ---------------- */

function requireFinance() {
  const u = me(db);
  if (u.role !== "finance") throw new ActionError("Finance/Admin permission required.");
  return u;
}

export const admin = {
  upsertCategory(c: Partial<Category> & { name: string; color: string }) {
    requireFinance();
    const name = c.name.trim();
    if (!name) throw new ActionError("Category name is required.");
    if (db.categories.some((x) => x.name.toLowerCase() === name.toLowerCase() && x.id !== c.id)) throw new ActionError("A category with this name already exists.");
    const id = c.id ?? crypto.randomUUID();
    commit((d) => {
      const ex = d.categories.find((x) => x.id === id);
      if (ex) Object.assign(ex, { name, color: c.color, active: c.active ?? ex.active });
      else d.categories.push({ id, name, color: c.color, active: true });
    });
    remote("Category", async (s) => {
      if (c.id) ok(await s.from("categories").update({ name, color: c.color, active: c.active ?? true }).eq("id", id));
      else ok(await s.from("categories").insert({ id, name, color: c.color, active: true }));
      await audit(s, { action: c.id ? "category_updated" : "category_created", entity: "category", entityId: id, details: `${c.id ? "Updated" : "Created"} category “${name}”` });
    });
  },
  upsertBudget(b: Omit<Budget, "id"> & { id?: string }) {
    requireFinance();
    if (!(b.amount > 0)) throw new ActionError("Budget amount must be greater than 0.");
    if (!b.id && db.budgets.some((x) => x.scope === b.scope && x.refId === b.refId)) throw new ActionError("This item already has a budget — edit it instead.");
    const id = b.id ?? crypto.randomUUID();
    commit((d) => {
      const ex = d.budgets.find((x) => x.id === id);
      if (ex) Object.assign(ex, b, { id });
      else d.budgets.push({ ...b, id });
    });
    remote("Budget", async (s) => {
      const row = { scope: b.scope, ref_id: b.refId, period: b.period, amount: b.amount };
      if (b.id) ok(await s.from("budgets").update(row).eq("id", id));
      else ok(await s.from("budgets").insert({ ...row, id }));
      await audit(s, { action: b.id ? "budget_updated" : "budget_created", entity: "budget", entityId: id, details: `${formatIDR(b.amount)} ${b.period}` });
    });
  },
  deleteBudget(id: string) {
    requireFinance();
    commit((d) => {
      d.budgets = d.budgets.filter((x) => x.id !== id);
    });
    remote("Budget", async (s) => {
      ok(await s.from("budgets").delete().eq("id", id));
      await audit(s, { action: "budget_deleted", entity: "budget", entityId: id, details: "Removed budget" });
    });
  },
  updateSettings(patch: Partial<DB["settings"]>) {
    requireFinance();
    commit((d) => {
      d.settings = { ...d.settings, ...patch };
    });
    const map: Record<string, string> = { highValueRuleEnabled: "high_value_rule_enabled", highValueThreshold: "high_value_threshold", emailEnabled: "email_enabled", whatsappEnabled: "whatsapp_enabled" };
    const row: Row = {};
    Object.entries(patch).forEach(([k, v]) => (row[map[k]!] = v));
    remote("Settings", async (s) => {
      ok(await s.from("settings").update(row).eq("id", 1));
      await audit(s, { action: "settings_updated", entity: "settings", details: Object.entries(patch).map(([k, v]) => `${k} = ${v}`).join(", ") });
    });
  },
  logExport(what: string) {
    remote("Audit log", (s) => audit(s, { action: "exported", entity: "report", details: what }));
  },
};

export const profile = {
  updatePrefs(prefs: Partial<User["prefs"]>, phone?: string) {
    const u = me(db);
    commit((d) => {
      const x = me(d);
      x.prefs = { ...x.prefs, ...prefs };
      if (phone !== undefined) x.phone = phone;
    });
    remote("Profile", async (s) => {
      const row: Row = {};
      if (prefs.email !== undefined) row.notify_email = prefs.email;
      if (prefs.whatsapp !== undefined) row.notify_whatsapp = prefs.whatsapp;
      if (phone !== undefined) row.phone = phone;
      ok(await s.from("users").update(row).eq("id", u.id));
    });
  },
};

/** "Reset demo data" button → in Supabase mode just reloads from the server. */
export function resetDemo() {
  refresh();
}

export function errorMessage(e: unknown) {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return "Something went wrong.";
}
