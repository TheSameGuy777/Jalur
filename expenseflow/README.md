# ExpenseFlow · Spend Hub

Internal spending & reimbursement requests — employees submit, managers approve, Finance gives final approval and pays.

**Stack:** React 18 + TypeScript, Vite, Tailwind CSS v4, shadcn/ui-style components (`src/components/ui`), Recharts, lucide-react. Backend schema for Supabase (Postgres + Auth + Storage + RLS) in `supabase/`.

---

## 1. Quick start (Demo Mode — no backend needed)

```bash
npm install
npm run dev        # http://localhost:5173
```

The app starts in **Demo Mode**: 15 seeded requests across all categories and statuses are stored in your browser (`localStorage`). Reset any time in **Settings → Profile → Reset demo data**.

### Demo accounts (password `demo1234`)

| Account | Email | Role | What to try |
|---|---|---|---|
| Rina Wijaya | rina@expenseflow.demo | Employee | Create a request, edit the "Needs revision" one, cancel, comment |
| Budi Santoso | budi@expenseflow.demo | Approver (Manager) | Quick approve/reject from the dashboard, request revision |
| Sari Halim | sari@expenseflow.demo | Approver (Director) | Approves requests **above Rp 10.000.000** |
| Dewi Lestari | dewi@expenseflow.demo | Finance / Admin | Final approval, mark as paid, budgets, categories, reports, audit log |

Click any demo card on the login page, or switch accounts from the profile menu (top right).

---

## 2. How the approval flow works

```
Draft ──submit──▶ Pending Manager ──▶ [Pending Director] ──▶ Pending Finance ──▶ Approved ──▶ Paid
                        │                    │                     │
                        ├── Reject (reason required) ──────────────┴──▶ Rejected
                        └── Request revision ──▶ Needs Revision ──edit & resubmit──▶ Pending Manager
Requester can cancel any pending / revision request ──▶ Cancelled
```

| Step | Who can act | Rule |
|---|---|---|
| Pending Manager | The requester's direct manager (`users.manager_id`) | Approve / Reject / Request revision |
| Pending Director | Any user with `is_director = true` | **Only when amount > threshold** (default Rp 10.000.000, configurable in Settings → Approval rules). Skipped if the manager is already the director. |
| Pending Finance | Role `finance` | Final approval |
| Approved → Paid | Role `finance` | Mark as paid with a transfer reference |

- Nobody can approve their own request.
- Rejecting or requesting a revision **requires a note**.
- Every action writes to the **audit log** and the request's **activity timeline**, and notifies the requester / next approver (in-app + email, optional WhatsApp).
- **Budgets:** monthly or quarterly per category and per department. Usage = approved + paid (+ pending shown separately) for requests whose *date needed* falls in the current period. The form and detail page warn when a request would exceed the remaining budget (it can still be submitted; Finance decides).

All rules live in `src/lib/workflow.ts` and `src/lib/store.ts`, and are mirrored server-side in `supabase/schema.sql` (`submit_request`, `decide_request`, `mark_paid` RPCs + RLS).

---

## 3. Features

- **Employee:** dashboard (status cards, total spent this month), 3-step request form (inline validation, IDR thousand separators, drag-and-drop attachments, live budget check, approval-route preview), drafts, request list with search/filter/sort, detail page (summary left, progress + timeline + comments right).
- **Approver:** "Waiting for my approval" queue with one-click approve and reject-with-reason, team activity, processed history.
- **Finance:** KPIs, donut by category, monthly trend bar chart, budget used vs. remaining, payment queue, budget CRUD, category management, approval-rule settings, reports with period filter, audit log.
- **Export:** CSV and real `.xlsx` (multi-sheet for reports) — no extra dependency.
- **UX:** light/dark mode, collapsible sidebar (icon rail on desktop, drawer on mobile), mobile FAB + sticky action bars, skeleton loaders, toasts, confirmation modals for destructive actions, empty states, keyboard-navigable menus/tabs/dialogs (focus trap, Esc), `aria-live` toasts, DD/MM/YYYY dates, `Rp 1.500.000` formatting.

---

## 4. Connecting Supabase (production)

1. Create a Supabase project, then run `supabase/schema.sql` and `supabase/seed.sql` in the SQL editor.
2. Create the demo users in **Authentication → Users**, then insert them into `public.users` with `role`, `is_director`, `department_id`, `manager_id`.
3. Copy `.env.example` → `.env` and fill `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
4. Replace the in-browser store with Supabase calls. Every mutation in `src/lib/store.ts` maps 1:1 to a table write or RPC:

| `store.ts` | Supabase |
|---|---|
| `auth.signIn` | `supabase.auth.signInWithPassword` |
| `requests.save` | `insert/update requests` (+ upload to the `attachments` bucket) then `rpc('submit_request')` |
| `requests.approve / reject / requestRevision` | `rpc('decide_request', { p_id, p_decision, p_note })` |
| `requests.markPaid` | `rpc('mark_paid', { p_id, p_ref })` |
| `requests.cancel` | `rpc('cancel_request', { p_id })` |
| `requests.comment` | `insert comments` |
| `admin.upsertBudget / upsertCategory / updateSettings` | table writes (RLS: finance only) |

   Use `supabase.channel(...).on('postgres_changes', …)` on `requests` and `notifications` for live updates.

### Email & WhatsApp notifications

Add a Database Webhook on `notifications` (insert) → Supabase Edge Function that sends:
- **Email** via Resend/SendGrid/SMTP when `settings.email_enabled` and `users.notify_email`.
- **WhatsApp** via the WhatsApp Business Cloud API (template message) when `settings.whatsapp_enabled`, `users.notify_whatsapp` and `users.phone` are set.

In Demo Mode these are simulated in **Settings → Integrations → Outbox**.

---

## 5. Project structure

```
src/
  lib/          types, seed data, store (business logic), workflow rules, router, export (CSV/XLSX)
  components/
    ui/         shadcn-style primitives: button, card, badge, form, dialog, dropdown, tabs, toast, skeleton…
    layout/     AppShell (sidebar, top bar, notifications, profile menu)
    charts.tsx  Recharts donut + bar charts
  pages/        Login, Dashboard (employee/approver/finance), Requests, RequestForm, RequestDetail,
                Approvals, Budgets, Reports, Settings
supabase/       schema.sql (tables, RLS, RPCs, storage), seed.sql
```

## Scripts

`npm run dev` · `npm run build` · `npm run preview` · `npm run typecheck`

> UI language is English with IDR currency and DD/MM/YYYY dates. To switch to Bahasa Indonesia, centralise strings in a dictionary file — formatting helpers in `src/lib/utils.ts` already use `id-ID`.
