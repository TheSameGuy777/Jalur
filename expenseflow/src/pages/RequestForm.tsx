import { useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, FileText, ImageIcon, Info, Paperclip, Receipt, Save, Send, Trash2, UploadCloud, Wallet, Zap } from "lucide-react";
import { CategoryTag, NoAccess, PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { BudgetBar } from "@/components/ui/progress";
import { toast } from "@/components/ui/toast";
import { navigate } from "@/lib/router";
import { errorMessage, requests, useDB, type RequestInput } from "@/lib/store";
import type { Attachment, SpendRequest, User } from "@/lib/types";
import { cn, formatBytes, formatDate, formatIDR, formatIDRCompact, formatThousands, parseAmount, todayISO, uid } from "@/lib/utils";
import { approvalChain, budgetImpact, isEditable, needsDirector } from "@/lib/workflow";

const STEPS = [
  { id: 1, label: "Basics", hint: "What & why" },
  { id: 2, label: "Amount & details", hint: "How much, when" },
  { id: 3, label: "Attachments & review", hint: "Proof & submit" },
] as const;

const MAX_FILE = 5 * 1024 * 1024;
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.heic,.xlsx,.xls,.docx,.doc";

type Errors = Partial<Record<keyof RequestInput, string>>;

function validate(f: RequestInput, step: number | "all", forSubmit: boolean): Errors {
  const e: Errors = {};
  const check = (s: number) => step === "all" || step === s;
  if (check(1)) {
    if (f.title.trim().length < 5) e.title = "Give the request a clear title (min. 5 characters).";
    if (!f.categoryId) e.categoryId = "Choose a category.";
  }
  if (check(2)) {
    if (!(f.amount > 0)) e.amount = "Enter an amount greater than Rp 0.";
    else if (f.amount > 5_000_000_000) e.amount = "Amounts above Rp 5.000.000.000 need a separate capex process.";
    if (!f.dateNeeded) e.dateNeeded = "Pick a date.";
    else if (f.type === "advance" && f.dateNeeded < todayISO()) e.dateNeeded = "For advances, the date can’t be in the past.";
    else if (f.type === "reimbursement" && f.dateNeeded > todayISO()) e.dateNeeded = "Reimbursements are for money already spent — pick today or earlier.";
    if (f.description.trim().length < 15) e.description = "Explain the business purpose (min. 15 characters).";
  }
  if (check(3) && forSubmit && f.type === "reimbursement" && f.attachments.length === 0) e.attachments = "Attach a receipt or invoice for reimbursements.";
  return e;
}

const stepOf = (k: keyof RequestInput) => (k === "title" || k === "categoryId" || k === "type" || k === "priority" ? 1 : k === "attachments" ? 3 : 2);

export default function RequestForm({ user, id }: { user: User; id?: string }) {
  const db = useDB();
  const existing = id ? db.requests.find((r) => r.id === id) : undefined;
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<RequestInput>(() =>
    existing
      ? { title: existing.title, categoryId: existing.categoryId, amount: existing.amount, dateNeeded: existing.dateNeeded, description: existing.description, vendor: existing.vendor, attachments: existing.attachments, priority: existing.priority, type: existing.type }
      : { title: "", categoryId: "", amount: 0, dateNeeded: "", description: "", vendor: "", attachments: [], priority: "normal", type: "advance" },
  );
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const impact = useMemo(
    () => (form.categoryId && form.amount > 0 ? budgetImpact(db, { id: existing?.id ?? "__new", categoryId: form.categoryId, departmentId: user.departmentId, amount: form.amount, dateNeeded: form.dateNeeded }) : []),
    [db, form.categoryId, form.amount, form.dateNeeded, existing?.id, user.departmentId],
  );
  const exceeding = impact.filter((i) => i.exceeds);
  const chain = useMemo(
    () => approvalChain(db, { requesterId: user.id, amount: form.amount } as SpendRequest),
    [db, user.id, form.amount],
  );

  if (id && !existing) return <NoAccess />;
  if (existing && (existing.requesterId !== user.id || !isEditable(existing.status))) return <NoAccess />;

  const set = <K extends keyof RequestInput>(k: K, v: RequestInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const next = () => {
    const e = validate(form, step, false);
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error("Please fix the highlighted fields");
      return;
    }
    setStep((s) => Math.min(3, s + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = (submit: boolean) => {
    if (submit) {
      const e = validate(form, "all", true);
      setErrors(e);
      const keys = Object.keys(e) as (keyof RequestInput)[];
      if (keys.length) {
        setStep(Math.min(...keys.map(stepOf)));
        toast.error("Some details are missing", Object.values(e)[0]);
        return;
      }
    } else if (form.title.trim().length < 3) {
      setStep(1);
      setErrors({ title: "Add a title before saving a draft." });
      return;
    }
    setBusy(submit ? "submit" : "draft");
    window.setTimeout(() => {
      try {
        const rid = requests.save(form, { id: existing?.id, submit });
        toast.success(submit ? (existing?.status === "revision" ? "Request resubmitted" : "Request submitted") : "Draft saved", submit ? `Sent to ${chain[0]?.user?.name ?? "approver"} for approval` : "You can finish it later from My Requests.");
        navigate(`/requests/${rid}`, { replace: true });
      } catch (err) {
        toast.error("Couldn’t save", errorMessage(err));
        setBusy(null);
      }
    }, 450);
  };

  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files);
    for (const f of list) {
      if (f.size > MAX_FILE) {
        toast.error(`${f.name} is too large`, "Max 5 MB per file.");
        continue;
      }
      const att: Attachment = { id: uid("att"), name: f.name, size: f.size, type: f.type || "application/octet-stream" };
      // keep small files inline so they can be previewed/downloaded in demo mode
      if (f.size <= 1_200_000) {
        const reader = new FileReader();
        reader.onload = () => setForm((p) => ({ ...p, attachments: p.attachments.map((a) => (a.id === att.id ? { ...a, dataUrl: String(reader.result) } : a)) }));
        reader.readAsDataURL(f);
      }
      setForm((p) => ({ ...p, attachments: [...p.attachments, att] }));
    }
    setErrors((e) => ({ ...e, attachments: undefined }));
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  const category = db.categories.find((c) => c.id === form.categoryId);
  const activeCategories = db.categories.filter((c) => c.active || c.id === form.categoryId);

  return (
    <>
      <PageHeader
        back="/requests"
        eyebrow={existing ? `${existing.code} · ${existing.status === "revision" ? "Revision requested" : "Draft"}` : "New spending request"}
        title={existing ? "Edit request" : "Create request"}
        description="Save as a draft any time — nothing is sent until you submit."
      />

      {existing?.status === "revision" && existing.revisionNote && (
        <div className="mb-5 flex gap-3 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900 dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-200">
          <Info className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">Changes requested</p>
            <p className="mt-0.5">{existing.revisionNote}</p>
          </div>
        </div>
      )}

      {/* Stepper */}
      <ol className="mb-6 grid grid-cols-3 gap-2" aria-label="Form progress">
        {STEPS.map((s) => {
          const done = step > s.id;
          const current = step === s.id;
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => (s.id < step ? setStep(s.id) : s.id === step + 1 ? next() : undefined)}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "focus-ring flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition md:p-3",
                  current ? "bg-card shadow-soft" : "hover:bg-card/60",
                )}
              >
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold", done ? "bg-primary text-primary-foreground" : current ? "bg-ink text-ink-foreground" : "bg-muted text-muted-foreground")}>
                  {done ? <Check className="size-4" /> : s.id}
                </span>
                <span className="hidden min-w-0 sm:block">
                  <span className={cn("block truncate text-sm font-medium", !current && "text-muted-foreground")}>{s.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{s.hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="grid gap-6 lg:grid-cols-3">
        <form className="lg:col-span-2" onSubmit={(e) => { e.preventDefault(); if (step < 3) next(); else save(true); }} noValidate>
          <Card>
            {step === 1 && (
              <>
                <CardHeader>
                  <div>
                    <CardTitle>What do you need?</CardTitle>
                    <CardDescription>Tell approvers what this spend is for.</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <fieldset>
                    <legend className="mb-2 text-sm font-medium">Request type <span className="text-red-500">*</span></legend>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {([
                        { v: "advance", icon: Wallet, t: "Advance request", d: "Get money before you spend it" },
                        { v: "reimbursement", icon: Receipt, t: "Reimbursement", d: "You already paid — get it back" },
                      ] as const).map((o) => (
                        <label key={o.v} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary", form.type === o.v ? "border-primary bg-primary-soft" : "border-border hover:bg-surface")}>
                          <input type="radio" name="type" value={o.v} checked={form.type === o.v} onChange={() => set("type", o.v)} className="sr-only" />
                          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", form.type === o.v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                            <o.icon className="size-4" />
                          </span>
                          <span>
                            <span className="block text-sm font-medium">{o.t}</span>
                            <span className="block text-xs text-muted-foreground">{o.d}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <Field label="Request title" required error={errors.title} hint="Short and specific — approvers see this first.">
                    {(a) => <Input {...a} value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={90} placeholder="e.g. Booth rental for Jakarta Fair 2026" autoFocus />}
                  </Field>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Category" required error={errors.categoryId}>
                      {(a) => (
                        <Select {...a} value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
                          <option value="" disabled>Select a category</option>
                          {activeCategories.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </Select>
                      )}
                    </Field>
                    <fieldset>
                      <legend className="mb-1.5 text-sm font-medium">Priority</legend>
                      <div className="grid h-10 grid-cols-2 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Priority">
                        {(["normal", "urgent"] as const).map((p) => (
                          <button
                            key={p}
                            type="button"
                            role="radio"
                            aria-checked={form.priority === p}
                            onClick={() => set("priority", p)}
                            className={cn("focus-ring flex items-center justify-center gap-1.5 rounded-md text-sm capitalize transition", form.priority === p ? (p === "urgent" ? "bg-red-600 text-white shadow" : "bg-card shadow") : "text-muted-foreground")}
                          >
                            {p === "urgent" && <Zap className="size-3.5" />}
                            {p}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  </div>
                </CardContent>
              </>
            )}

            {step === 2 && (
              <>
                <CardHeader>
                  <div>
                    <CardTitle>Amount & details</CardTitle>
                    <CardDescription>{form.type === "advance" ? "How much you need and by when." : "How much you spent and when."}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Amount" required error={errors.amount} hint={form.amount > 0 ? formatIDRCompact(form.amount) : "Indonesian Rupiah (IDR)"}>
                      {(a) => (
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">Rp</span>
                          <Input
                            {...a}
                            inputMode="numeric"
                            autoComplete="off"
                            className="pl-10 text-base font-medium tabular-nums"
                            value={form.amount ? formatThousands(form.amount) : ""}
                            onChange={(e) => set("amount", parseAmount(e.target.value))}
                            placeholder="1.500.000"
                          />
                        </div>
                      )}
                    </Field>
                    <Field label={form.type === "advance" ? "Date needed" : "Date of expense"} required error={errors.dateNeeded} hint={form.dateNeeded ? formatDate(form.dateNeeded) : "DD/MM/YYYY"}>
                      {(a) => <Input {...a} type="date" value={form.dateNeeded} min={form.type === "advance" ? todayISO() : undefined} max={form.type === "reimbursement" ? todayISO() : undefined} onChange={(e) => set("dateNeeded", e.target.value)} />}
                    </Field>
                  </div>
                  <Field label="Vendor or payee" optional hint="Who receives the money?">
                    {(a) => <Input {...a} value={form.vendor} onChange={(e) => set("vendor", e.target.value)} placeholder="e.g. PT Pameran Nusantara" />}
                  </Field>
                  <Field label="Description / purpose" required error={errors.description} hint={`${form.description.length}/600 · Include the business reason and expected outcome.`}>
                    {(a) => (
                      <Textarea {...a} rows={5} maxLength={600} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="e.g. 3x6m booth incl. construction and electricity. Expected 200+ qualified leads for Q1 pipeline." />
                    )}
                  </Field>
                  {exceeding.length > 0 && <BudgetWarning items={exceeding} />}
                  {needsDirector(db, form) && (
                    <div className="flex gap-3 rounded-xl bg-surface p-4 text-sm">
                      <Info className="mt-0.5 size-4 shrink-0 text-primary" />
                      <p>
                        Requests above <strong>{formatIDR(db.settings.highValueThreshold)}</strong> need an extra <strong>Director</strong> approval step.
                      </p>
                    </div>
                  )}
                </CardContent>
              </>
            )}

            {step === 3 && (
              <>
                <CardHeader>
                  <div>
                    <CardTitle>Attachments & review</CardTitle>
                    <CardDescription>Invoices, quotations or screenshots. PDF, images, Excel or Word · max 5 MB each.</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={onDrop}
                    className={cn("flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition", dragOver ? "border-primary bg-primary-soft" : errors.attachments ? "border-red-400" : "border-border")}
                  >
                    <span className="flex size-12 items-center justify-center rounded-full bg-muted"><UploadCloud className="size-5 text-muted-foreground" /></span>
                    <p className="mt-3 text-sm font-medium">Drag & drop files here</p>
                    <p className="text-xs text-muted-foreground">or</p>
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => fileRef.current?.click()}>
                      <Paperclip /> Browse files
                    </Button>
                    <input ref={fileRef} type="file" multiple accept={ACCEPT} className="sr-only" aria-label="Upload attachments" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
                    {form.type === "reimbursement" && <p className="mt-3 text-xs text-muted-foreground">A receipt is required for reimbursements.</p>}
                  </div>
                  {errors.attachments && <p role="alert" className="-mt-3 text-xs font-medium text-red-600">{errors.attachments}</p>}
                  {form.attachments.length > 0 && (
                    <ul className="space-y-2">
                      {form.attachments.map((a) => (
                        <li key={a.id} className="flex items-center gap-3 rounded-lg border border-border p-2.5">
                          <span className="flex size-9 items-center justify-center rounded-lg bg-muted">{a.type.startsWith("image") ? <ImageIcon className="size-4" /> : <FileText className="size-4" />}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm">{a.name}</p>
                            <p className="text-xs text-muted-foreground">{formatBytes(a.size)}</p>
                          </div>
                          <Button size="icon-sm" variant="ghost" aria-label={`Remove ${a.name}`} onClick={() => set("attachments", form.attachments.filter((x) => x.id !== a.id))}>
                            <Trash2 />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="rounded-xl bg-surface p-4">
                    <p className="mb-3 text-sm font-semibold">Review</p>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                      <Review label="Title" value={form.title || "—"} full />
                      <Review label="Type" value={form.type === "advance" ? "Advance request" : "Reimbursement"} />
                      <Review label="Priority" value={form.priority === "urgent" ? "Urgent" : "Normal"} />
                      <Review label="Category" value={<CategoryTag category={category} className="text-foreground" />} />
                      <Review label="Amount" value={<span className="font-semibold">{formatIDR(form.amount)}</span>} />
                      <Review label={form.type === "advance" ? "Date needed" : "Date of expense"} value={formatDate(form.dateNeeded)} />
                      <Review label="Vendor / payee" value={form.vendor || "—"} />
                      <Review label="Purpose" value={form.description || "—"} full />
                    </dl>
                  </div>
                  {exceeding.length > 0 && <BudgetWarning items={exceeding} />}
                </CardContent>
              </>
            )}

            {/* Actions */}
            <div className="sticky bottom-0 z-10 flex items-center justify-between gap-2 rounded-b-xl border-t border-border bg-card/95 p-4 backdrop-blur md:static md:bg-card md:px-5">
              <div className="flex gap-2">
                {step > 1 && (
                  <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
                    <ArrowLeft /> <span className="hidden sm:inline">Back</span>
                  </Button>
                )}
                <Button variant="outline" onClick={() => save(false)} loading={busy === "draft"} disabled={!!busy}>
                  <Save /> <span className="hidden sm:inline">Save draft</span>
                </Button>
              </div>
              {step < 3 ? (
                <Button type="submit" variant="ink">
                  Continue <ArrowRight />
                </Button>
              ) : (
                <Button type="submit" loading={busy === "submit"} disabled={!!busy}>
                  <Send /> {existing?.status === "revision" ? "Resubmit" : "Submit request"}
                </Button>
              )}
            </div>
          </Card>
        </form>

        {/* Side summary */}
        <aside className="space-y-4">
          <Card className="overflow-hidden">
            <div className="bg-hero p-5 text-white">
              <p className="text-xs text-white/75">Requesting</p>
              <p className="mt-1 text-3xl font-light tracking-tight">{formatIDR(form.amount)}</p>
              <p className="mt-1 truncate text-sm text-white/80">{form.title || "Untitled request"}</p>
            </div>
            <CardContent className="pt-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Approval route</p>
              <ol className="space-y-3">
                {chain.map((c, i) => (
                  <li key={c.step} className="flex items-center gap-3 text-sm">
                    <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold">{i + 1}</span>
                    <span className="flex-1">
                      {c.label}
                      <span className="block text-xs text-muted-foreground">{c.user?.name ?? "Finance team"}</span>
                    </span>
                  </li>
                ))}
                <li className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="flex size-6 items-center justify-center rounded-full bg-muted"><CheckCircle2 className="size-3.5" /></span>
                  Paid by Finance
                </li>
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div>
                <CardTitle className="text-sm">Budget check</CardTitle>
                <CardDescription className="text-xs">Remaining after this request</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {impact.length === 0 && <p className="text-sm text-muted-foreground">Pick a category and amount to see budget impact.</p>}
              {impact.map((i) => (
                <div key={i.budget.id}>
                  <div className="mb-1.5 flex justify-between gap-2 text-sm">
                    <span className="truncate">{i.name} <span className="text-xs text-muted-foreground">· {i.label}</span></span>
                    <span className={cn("shrink-0 font-medium tabular-nums", i.exceeds ? "text-red-600 dark:text-red-400" : "")}>{formatIDRCompact(i.after)}</span>
                  </div>
                  <BudgetBar label={`${i.name} budget`} usedPct={i.usedPct} pendingPct={i.budget.amount ? ((i.pending + form.amount) / i.budget.amount) * 100 : 0} over={i.exceeds} />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {formatIDRCompact(i.used)} used · {formatIDRCompact(i.pending)} pending · {formatIDRCompact(i.budget.amount)} budget
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}

function Review({ label, value, full }: { label: string; value: ReactNode; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words">{value}</dd>
    </div>
  );
}

function BudgetWarning({ items }: { items: { name: string; label: string; remaining: number; after: number }[] }) {
  return (
    <div role="alert" className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-medium">This request would exceed the remaining budget</p>
        <ul className="mt-1 space-y-0.5">
          {items.map((i) => (
            <li key={i.name}>
              {i.name} ({i.label}): {formatIDR(Math.max(0, i.remaining))} left — over by <strong>{formatIDR(-i.after)}</strong>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs opacity-80">You can still submit; Finance will review the overrun.</p>
      </div>
    </div>
  );
}
