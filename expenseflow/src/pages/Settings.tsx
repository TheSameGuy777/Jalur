import { useMemo, useState, type ReactNode } from "react";
import { Download, Mail, MessageCircle, Pencil, Plus, Search, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/shared";
import { Dialog } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { Field, Input, Select, Switch } from "@/components/ui/form";
import { Tabs } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { exportCSV } from "@/lib/export";
import { useTheme } from "@/lib/hooks";
import { admin, auth, errorMessage, profile, useDB } from "@/lib/store";
import type { Category, User } from "@/lib/types";
import { formatDateTime, formatIDR, formatThousands, parseAmount, relativeTime, todayISO } from "@/lib/utils";
import { roleLabel } from "@/lib/workflow";

type Tab = "profile" | "categories" | "rules" | "integrations" | "audit";
const PALETTE = ["#14b8a6", "#6366f1", "#f59e0b", "#ec4899", "#0ea5e9", "#84cc16", "#94a3b8", "#ef4444", "#8b5cf6", "#f97316"];

export default function Settings({ user }: { user: User }) {
  const isAdmin = user.role === "finance";
  const [tab, setTab] = useState<Tab>("profile");
  const items: { value: Tab; label: string }[] = [
    { value: "profile", label: "Profile & notifications" },
    ...(isAdmin
      ? ([
          { value: "categories", label: "Categories" },
          { value: "rules", label: "Approval rules" },
          { value: "integrations", label: "Integrations" },
          { value: "audit", label: "Audit log" },
        ] as { value: Tab; label: string }[])
      : []),
  ];
  return (
    <>
      <PageHeader eyebrow="Settings" title="Settings" description={isAdmin ? "Your profile plus company-wide configuration." : "Your profile and notification preferences."} />
      <Tabs className="mb-6" value={tab} onChange={setTab} items={items} />
      {tab === "profile" && <ProfileTab user={user} />}
      {tab === "categories" && isAdmin && <CategoriesTab />}
      {tab === "rules" && isAdmin && <RulesTab />}
      {tab === "integrations" && isAdmin && <IntegrationsTab />}
      {tab === "audit" && isAdmin && <AuditTab />}
    </>
  );
}

function ProfileTab({ user }: { user: User }) {
  const db = useDB();
  const { dark, toggle } = useTheme();
  const [phone, setPhone] = useState(user.phone ?? "");
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [changingPw, setChangingPw] = useState(false);
  const dept = db.departments.find((d) => d.id === user.departmentId);
  const manager = db.users.find((u) => u.id === user.managerId);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardContent className="flex flex-col items-center pt-6 text-center">
          <Avatar user={user} size="lg" className="size-16 text-lg" />
          <p className="mt-3 font-semibold">{user.name}</p>
          <p className="text-sm text-muted-foreground">{user.title}</p>
          <Badge tone="green" className="mt-2">{roleLabel(user)}</Badge>
          <dl className="mt-6 w-full space-y-3 text-left text-sm">
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Email</dt><dd className="truncate">{user.email}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Department</dt><dd>{dept?.name}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Manager</dt><dd>{manager?.name ?? "—"}</dd></div>
          </dl>
        </CardContent>
      </Card>
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader><div><CardTitle>Notifications</CardTitle><CardDescription>In-app notifications are always on. Choose extra channels for status changes.</CardDescription></div></CardHeader>
          <CardContent className="divide-y divide-border">
            <Pref icon={<Mail />} title="Email" desc={`Status changes, approvals needed and comments → ${user.email}`} checked={user.prefs.email} disabled={!db.settings.emailEnabled} onChange={(v) => { profile.updatePrefs({ email: v }); toast.success(v ? "Email notifications on" : "Email notifications off"); }} note={!db.settings.emailEnabled ? "Disabled by admin" : undefined} />
            <Pref icon={<MessageCircle />} title="WhatsApp" desc="Short alerts via WhatsApp Business (requires phone number)" checked={user.prefs.whatsapp} disabled={!db.settings.whatsappEnabled} onChange={(v) => { profile.updatePrefs({ whatsapp: v }); toast.success(v ? "WhatsApp alerts on" : "WhatsApp alerts off"); }} note={!db.settings.whatsappEnabled ? "Not enabled by admin yet" : undefined} />
            <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-end">
              <Field label="WhatsApp number" className="flex-1" hint="Format: +62 8xx-xxxx-xxxx">
                {(a) => <Input {...a} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+62 812-0000-0000" />}
              </Field>
              <Button variant="outline" onClick={() => { profile.updatePrefs({}, phone.trim()); toast.success("Phone number saved"); }}>Save</Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Password</CardTitle><CardDescription>Change your account password.</CardDescription></div></CardHeader>
          <CardContent className="space-y-3">
            <Field label="Current password">
              {(a) => <Input {...a} type="password" autoComplete="current-password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} placeholder="••••••••" />}
            </Field>
            <Field label="New password" hint="At least 8 characters">
              {(a) => <Input {...a} type="password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="••••••••" />}
            </Field>
            <Field label="Confirm new password">
              {(a) => <Input {...a} type="password" autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="••••••••" />}
            </Field>
            <div className="flex justify-end">
              <Button
                disabled={changingPw || !currentPw || !newPw || !confirmPw}
                onClick={async () => {
                  if (newPw.length < 8) return toast.error("New password must be at least 8 characters.");
                  if (newPw !== confirmPw) return toast.error("New passwords do not match.");
                  setChangingPw(true);
                  try {
                    await auth.changePassword(currentPw, newPw);
                    setCurrentPw(""); setNewPw(""); setConfirmPw("");
                    toast.success("Password changed");
                  } catch (e) {
                    toast.error(errorMessage(e));
                  } finally {
                    setChangingPw(false);
                  }
                }}
              >
                {changingPw ? "Changing…" : "Change password"}
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Appearance</CardTitle></div></CardHeader>
          <CardContent className="divide-y divide-border">
            <Pref title="Dark mode" desc="Easier on the eyes at night" checked={dark} onChange={toggle} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Pref({ icon, title, desc, checked, onChange, disabled, note }: { icon?: ReactNode; title: string; desc: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; note?: string }) {
  return (
    <div className="flex items-center gap-4 py-4">
      {icon && <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-4">{icon}</span>}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title} {note && <span className="ml-1 text-xs font-normal text-amber-600 dark:text-amber-400">· {note}</span>}</p>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
      <Switch label={title} checked={checked && !disabled} onChange={onChange} disabled={disabled} />
    </div>
  );
}

function CategoriesTab() {
  const db = useDB();
  const [editing, setEditing] = useState<Partial<Category> | null>(null);
  const usage = (id: string) => db.requests.filter((r) => r.categoryId === id).length;
  return (
    <Card>
      <CardHeader>
        <div><CardTitle>Expense categories</CardTitle><CardDescription>Shown in the request form. Deactivate instead of deleting to keep history intact.</CardDescription></div>
        <Button size="sm" onClick={() => setEditing({ color: PALETTE[db.categories.length % PALETTE.length] })}><Plus /> Add category</Button>
      </CardHeader>
      <ul className="divide-y divide-border">
        {db.categories.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-5 py-3.5">
            <span className="size-3 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{c.name}</p>
              <p className="text-xs text-muted-foreground">{usage(c.id)} requests</p>
            </div>
            {!c.active && <Badge tone="gray">Inactive</Badge>}
            <Switch label={`${c.name} active`} checked={c.active} onChange={(v) => { try { admin.upsertCategory({ ...c, active: v }); toast.success(`${c.name} ${v ? "activated" : "deactivated"}`); } catch (e) { toast.error(errorMessage(e)); } }} />
            <Button size="icon-sm" variant="ghost" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}><Pencil /></Button>
          </li>
        ))}
      </ul>
      {editing && <CategoryDialog initial={editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function CategoryDialog({ initial, onClose }: { initial: Partial<Category>; onClose: () => void }) {
  const [name, setName] = useState(initial.name ?? "");
  const [color, setColor] = useState(initial.color ?? PALETTE[0]!);
  const [error, setError] = useState<string>();
  const save = () => {
    try {
      admin.upsertCategory({ id: initial.id, name, color, active: initial.active });
      toast.success(initial.id ? "Category updated" : "Category added", name);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Dialog open onClose={onClose} title={initial.id ? "Edit category" : "Add category"} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Name" required error={error}>
          {(a) => <Input {...a} data-autofocus value={name} onChange={(e) => { setName(e.target.value); setError(undefined); }} placeholder="e.g. Training & Development" />}
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Colour</legend>
          <div className="flex flex-wrap gap-2">
            {PALETTE.map((p) => (
              <button key={p} type="button" onClick={() => setColor(p)} aria-label={`Colour ${p}`} aria-pressed={color === p} className="focus-ring size-8 rounded-full ring-offset-2 ring-offset-card transition aria-pressed:ring-2 aria-pressed:ring-foreground" style={{ background: p }} />
            ))}
          </div>
        </fieldset>
      </div>
    </Dialog>
  );
}

function RulesTab() {
  const db = useDB();
  const [threshold, setThreshold] = useState(formatThousands(db.settings.highValueThreshold));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><div><CardTitle>Approval flow</CardTitle><CardDescription>Every request follows this path.</CardDescription></div></CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            {[
              ["Draft", "Employee prepares the request"],
              ["Pending Manager", "Direct manager approves, rejects or requests revision"],
              ["Pending Director", `Only when amount > ${formatIDR(db.settings.highValueThreshold)}${db.settings.highValueRuleEnabled ? "" : " (rule off)"}`],
              ["Pending Finance", "Finance gives final approval"],
              ["Approved → Paid", "Finance transfers money and marks as paid"],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-ink-foreground">{i + 1}</span>
                <span><span className="font-medium">{t}</span><span className="block text-muted-foreground">{d}</span></span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><div><CardTitle>High-value rule</CardTitle><CardDescription>Add an extra Director approval for large requests.</CardDescription></div></CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm">Require Director approval above threshold</p>
            <Switch label="High-value rule" checked={db.settings.highValueRuleEnabled} onChange={(v) => { admin.updateSettings({ highValueRuleEnabled: v }); toast.success(v ? "High-value rule enabled" : "High-value rule disabled"); }} />
          </div>
          <div className="flex items-end gap-2">
            <Field label="Threshold (Rp)" className="flex-1" hint="Applies to new submissions and requests not yet past the manager step.">
              {(a) => <Input {...a} inputMode="numeric" value={threshold} onChange={(e) => setThreshold(formatThousands(parseAmount(e.target.value)))} />}
            </Field>
            <Button variant="outline" onClick={() => { const n = parseAmount(threshold); if (!n) return toast.error("Enter a threshold"); admin.updateSettings({ highValueThreshold: n }); toast.success("Threshold saved", formatIDR(n)); }}>Save</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function IntegrationsTab() {
  const db = useDB();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><div><CardTitle>Notification channels</CardTitle><CardDescription>Company-wide switches. Users can opt out individually.</CardDescription></div></CardHeader>
        <CardContent className="divide-y divide-border">
          <Pref icon={<Mail />} title="Email notifications" desc="Sent on submit, approve, reject, revision, paid and new comments." checked={db.settings.emailEnabled} onChange={(v) => admin.updateSettings({ emailEnabled: v })} />
          <Pref icon={<MessageCircle />} title="WhatsApp notifications" desc="WhatsApp Business Cloud API — short status alerts to users with a phone number." checked={db.settings.whatsappEnabled} onChange={(v) => admin.updateSettings({ whatsappEnabled: v })} />
          <div className="flex items-start gap-3 py-4 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            In demo mode messages are written to the outbox on the right. In production a Supabase Edge Function delivers them (see README).
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><div><CardTitle>Outbox</CardTitle><CardDescription>Last {Math.min(db.outbox.length, 30)} simulated deliveries</CardDescription></div></CardHeader>
        <CardContent>
          {db.outbox.length === 0 ? (
            <p className="rounded-lg bg-surface px-4 py-6 text-center text-sm text-muted-foreground">Nothing sent yet. Submit or approve a request to see messages here.</p>
          ) : (
            <ul className="max-h-96 space-y-2 overflow-y-auto">
              {db.outbox.slice(0, 30).map((o) => (
                <li key={o.id} className="flex items-center gap-3 rounded-lg border border-border p-2.5 text-sm">
                  <span className="flex size-8 items-center justify-center rounded-full bg-muted [&_svg]:size-4">{o.channel === "email" ? <Mail /> : <MessageCircle />}</span>
                  <div className="min-w-0 flex-1"><p className="truncate">{o.subject}</p><p className="truncate text-xs text-muted-foreground">{o.to}</p></div>
                  <span className="text-xs text-muted-foreground">{relativeTime(o.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AuditTab() {
  const db = useDB();
  const [q, setQ] = useState("");
  const [entity, setEntity] = useState("");
  const logs = useMemo(() => {
    const t = q.toLowerCase();
    return [...db.auditLogs]
      .sort((a, b) => b.at.localeCompare(a.at))
      .filter((l) => (!entity || l.entity === entity) && (!t || `${l.details} ${l.action} ${db.users.find((u) => u.id === l.actorId)?.name ?? ""} ${db.requests.find((r) => r.id === l.requestId)?.code ?? ""}`.toLowerCase().includes(t)));
  }, [db, q, entity]);
  const exportLog = () => {
    exportCSV(
      { name: "Audit log", columns: ["Timestamp", "Actor", "Action", "Entity", "Reference", "Details"], rows: logs.map((l) => [formatDateTime(l.at), db.users.find((u) => u.id === l.actorId)?.name ?? "System", l.action, l.entity, db.requests.find((r) => r.id === l.requestId)?.code ?? l.entityId ?? "", l.details]) },
      `audit-log-${todayISO()}.csv`,
    );
    toast.success("Audit log exported");
  };
  return (
    <Card>
      <CardHeader className="flex-col gap-3 sm:flex-row sm:items-center">
        <div><CardTitle>Audit log</CardTitle><CardDescription>Immutable record of every change · {logs.length} entries</CardDescription></div>
        <div className="flex w-full gap-2 sm:w-auto">
          <div className="relative flex-1 sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input aria-label="Search audit log" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="pl-9" />
          </div>
          <Select aria-label="Filter by entity" value={entity} onChange={(e) => setEntity(e.target.value)} className="w-36">
            <option value="">All entities</option>
            <option value="request">Requests</option>
            <option value="budget">Budgets</option>
            <option value="category">Categories</option>
            <option value="settings">Settings</option>
            <option value="auth">Sign-ins</option>
            <option value="report">Exports</option>
          </Select>
          <Button variant="outline" size="icon" onClick={exportLog} aria-label="Export audit log"><Download /></Button>
        </div>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-y border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="px-5 py-2.5 font-medium">When</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Actor</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Action</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Reference</th>
              <th scope="col" className="px-5 py-2.5 font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {logs.slice(0, 150).map((l) => {
              const actor = db.users.find((u) => u.id === l.actorId);
              const req = db.requests.find((r) => r.id === l.requestId);
              return (
                <tr key={l.id}>
                  <td className="whitespace-nowrap px-5 py-3 tabular-nums text-muted-foreground">{formatDateTime(l.at)}</td>
                  <td className="px-3 py-3"><span className="flex items-center gap-2 whitespace-nowrap"><Avatar user={actor} size="xs" />{actor?.name ?? "System"}</span></td>
                  <td className="px-3 py-3"><Badge tone="gray">{l.action.replace(/_/g, " ")}</Badge></td>
                  <td className="whitespace-nowrap px-3 py-3">{req ? <a className="focus-ring rounded text-primary hover:underline" href={`#/requests/${req.id}`}>{req.code}</a> : <span className="text-muted-foreground">{l.entity}</span>}</td>
                  <td className="max-w-md truncate px-5 py-3 text-muted-foreground" title={l.details}>{l.details}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
