-- =====================================================================
-- ExpenseFlow · Supabase / Postgres schema
-- Tables: users(profiles), departments, categories, budgets, requests,
--         request_attachments, approvals, comments, notifications,
--         audit_logs, settings
-- Run in the Supabase SQL editor (or `supabase db push`).
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- enums ----------
create type user_role       as enum ('employee', 'manager', 'finance');
create type request_status  as enum ('draft','pending_manager','pending_director','pending_finance','approved','paid','rejected','cancelled','revision');
create type request_type    as enum ('advance', 'reimbursement');
create type request_priority as enum ('normal', 'urgent');
create type budget_scope    as enum ('category', 'department');
create type budget_period   as enum ('monthly', 'quarterly');
create type approval_step   as enum ('manager', 'director', 'finance', 'payment');
create type approval_decision as enum ('approved', 'rejected', 'revision', 'paid');

-- ---------- reference data ----------
create table departments (
  id   uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table users (                       -- 1:1 with auth.users
  id            uuid primary key references auth.users(id) on delete cascade,
  name          text not null,
  email         text not null unique,
  phone         text,
  title         text,
  role          user_role not null default 'employee',
  is_director   boolean not null default false,
  department_id uuid references departments(id),
  manager_id    uuid references users(id),
  notify_email  boolean not null default true,
  notify_whatsapp boolean not null default false,
  created_at    timestamptz not null default now()
);

create table categories (
  id     uuid primary key default gen_random_uuid(),
  name   text not null unique,
  color  text not null default '#94a3b8',
  active boolean not null default true
);

create table budgets (
  id      uuid primary key default gen_random_uuid(),
  scope   budget_scope not null,
  ref_id  uuid not null,                 -- category.id or department.id
  period  budget_period not null,
  amount  numeric(18,0) not null check (amount > 0),
  unique (scope, ref_id)
);

create table settings (
  id                      int primary key default 1 check (id = 1),
  high_value_rule_enabled boolean not null default true,
  high_value_threshold    numeric(18,0) not null default 10000000,
  email_enabled           boolean not null default true,
  whatsapp_enabled        boolean not null default false
);

-- ---------- requests ----------
create sequence request_seq;

create table requests (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique default ('SR-' || to_char(now(), 'YY') || '-' || lpad(nextval('request_seq')::text, 4, '0')),
  title           text not null check (char_length(title) between 3 and 120),
  category_id     uuid not null references categories(id),
  amount          numeric(18,0) not null check (amount >= 0),
  date_needed     date not null,
  description     text not null default '',
  vendor          text not null default '',
  priority        request_priority not null default 'normal',
  type            request_type not null,
  status          request_status not null default 'draft',
  requester_id    uuid not null references users(id),
  department_id   uuid not null references departments(id),
  rejection_reason text,
  revision_note   text,
  payment_ref     text,
  submitted_at    timestamptz,
  paid_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on requests (requester_id);
create index on requests (status);
create index on requests (date_needed);

create table request_attachments (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references requests(id) on delete cascade,
  file_name   text not null,
  storage_path text not null,            -- bucket: attachments/<request_id>/<file>
  size_bytes  int not null,
  mime_type   text not null,
  uploaded_by uuid not null references users(id),
  created_at  timestamptz not null default now()
);

create table approvals (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references requests(id) on delete cascade,
  step        approval_step not null,
  actor_id    uuid not null references users(id),
  decision    approval_decision not null,
  note        text,
  created_at  timestamptz not null default now()
);

create table comments (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references requests(id) on delete cascade,
  author_id   uuid not null references users(id),
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  title       text not null,
  body        text not null,
  request_id  uuid references requests(id) on delete cascade,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index on notifications (user_id, read);

create table audit_logs (
  id          bigserial primary key,
  actor_id    uuid references users(id),
  action      text not null,
  entity      text not null,
  entity_id   uuid,
  request_id  uuid references requests(id) on delete set null,
  details     text not null default '',
  created_at  timestamptz not null default now()
);

-- =====================================================================
-- Helpers
-- =====================================================================
create or replace function me() returns users language sql stable security definer set search_path = public as $$
  select * from users where id = auth.uid()
$$;

create or replace function is_finance() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from users where id = auth.uid() and role = 'finance')
$$;

create or replace function is_director() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from users where id = auth.uid() and is_director)
$$;

create or replace function manages(p_user uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from users where id = p_user and manager_id = auth.uid())
$$;

-- Status after the current approval step (mirrors src/lib/workflow.ts)
create or replace function next_status(r requests) returns request_status language plpgsql stable security definer set search_path = public as $$
declare s settings; mgr users; high boolean;
begin
  select * into s from settings where id = 1;
  select m.* into mgr from users u join users m on m.id = u.manager_id where u.id = r.requester_id;
  high := s.high_value_rule_enabled and r.amount > s.high_value_threshold;
  if r.status = 'pending_manager' then
    if high and not coalesce(mgr.is_director, false) then return 'pending_director'; end if;
    return 'pending_finance';
  elsif r.status = 'pending_director' then return 'pending_finance';
  elsif r.status = 'pending_finance' then return 'approved';
  end if;
  raise exception 'Request % is not awaiting approval', r.code;
end $$;

-- =====================================================================
-- Workflow RPCs (called from the client with supabase.rpc)
-- =====================================================================
create or replace function submit_request(p_id uuid) returns requests language plpgsql security definer set search_path = public as $$
declare r requests; was_revision boolean;
begin
  select * into r from requests where id = p_id for update;
  if r.requester_id <> auth.uid() then raise exception 'Not your request'; end if;
  if r.status not in ('draft','revision') then raise exception 'Only drafts or revisions can be submitted'; end if;
  was_revision := r.status = 'revision';
  update requests set
    status = case when (select manager_id from users where id = r.requester_id) is null then 'pending_finance' else 'pending_manager' end,
    submitted_at = now(), revision_note = null, updated_at = now()
  where id = p_id returning * into r;
  insert into audit_logs(actor_id, action, entity, entity_id, request_id, details)
  values (auth.uid(), case when was_revision then 'resubmitted' else 'submitted' end, 'request', p_id, p_id, 'Submitted for approval');
  return r;
end $$;

create or replace function decide_request(p_id uuid, p_decision approval_decision, p_note text default null)
returns requests language plpgsql security definer set search_path = public as $$
declare r requests; step approval_step; allowed boolean;
begin
  select * into r from requests where id = p_id for update;
  if r.requester_id = auth.uid() then raise exception 'You cannot approve your own request'; end if;
  allowed := case r.status
    when 'pending_manager'  then manages(r.requester_id)
    when 'pending_director' then is_director()
    when 'pending_finance'  then is_finance()
    else false end;
  if not allowed then raise exception 'You are not the approver for this step'; end if;
  if p_decision in ('rejected','revision') and coalesce(trim(p_note), '') = '' then raise exception 'A reason is required'; end if;
  step := case r.status when 'pending_manager' then 'manager' when 'pending_director' then 'director' else 'finance' end;

  insert into approvals(request_id, step, actor_id, decision, note) values (p_id, step, auth.uid(), p_decision, p_note);
  update requests set
    status = case p_decision when 'approved' then next_status(r) when 'rejected' then 'rejected' else 'revision' end,
    rejection_reason = case when p_decision = 'rejected' then p_note else rejection_reason end,
    revision_note    = case when p_decision = 'revision' then p_note else revision_note end,
    updated_at = now()
  where id = p_id returning * into r;
  insert into audit_logs(actor_id, action, entity, entity_id, request_id, details)
  values (auth.uid(), case p_decision when 'approved' then 'approved' when 'rejected' then 'rejected' else 'revision_requested' end, 'request', p_id, p_id, coalesce(p_note, 'Approved at ' || step || ' step'));
  insert into notifications(user_id, title, body, request_id)
  values (r.requester_id, 'Request ' || replace(r.status::text, '_', ' '), r.title, p_id);
  return r;
end $$;

create or replace function mark_paid(p_id uuid, p_ref text default null) returns requests language plpgsql security definer set search_path = public as $$
declare r requests;
begin
  if not is_finance() then raise exception 'Finance only'; end if;
  update requests set status = 'paid', paid_at = now(), payment_ref = p_ref, updated_at = now()
  where id = p_id and status = 'approved' returning * into r;
  if r.id is null then raise exception 'Request is not approved'; end if;
  insert into approvals(request_id, step, actor_id, decision, note) values (p_id, 'payment', auth.uid(), 'paid', p_ref);
  insert into audit_logs(actor_id, action, entity, entity_id, request_id, details) values (auth.uid(), 'paid', 'request', p_id, p_id, 'Marked as paid ' || coalesce(p_ref, ''));
  insert into notifications(user_id, title, body, request_id) values (r.requester_id, 'Request paid', r.title, p_id);
  return r;
end $$;

create or replace function cancel_request(p_id uuid) returns requests language plpgsql security definer set search_path = public as $$
declare r requests;
begin
  update requests set status = 'cancelled', updated_at = now()
  where id = p_id and requester_id = auth.uid()
    and status in ('pending_manager','pending_director','pending_finance','revision')
  returning * into r;
  if r.id is null then raise exception 'Only your own pending requests can be cancelled'; end if;
  insert into audit_logs(actor_id, action, entity, entity_id, request_id, details) values (auth.uid(), 'cancelled', 'request', p_id, p_id, 'Cancelled by requester');
  return r;
end $$;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table users               enable row level security;
alter table departments         enable row level security;
alter table categories          enable row level security;
alter table budgets             enable row level security;
alter table settings            enable row level security;
alter table requests            enable row level security;
alter table request_attachments enable row level security;
alter table approvals           enable row level security;
alter table comments            enable row level security;
alter table notifications       enable row level security;
alter table audit_logs          enable row level security;

-- Reference data: everyone signed in can read; finance manages
create policy "read users"        on users       for select to authenticated using (true);
create policy "update own prefs"  on users       for update to authenticated using (id = auth.uid());
-- Column-level protection: users may update only their own prefs/phone, never role/dept/manager/etc.
revoke update on public.users from authenticated;
grant update (phone, notify_email, notify_whatsapp) on public.users to authenticated;
create policy "read departments"  on departments for select to authenticated using (true);
create policy "read categories"   on categories  for select to authenticated using (true);
create policy "finance categories" on categories for all to authenticated using (is_finance()) with check (is_finance());
create policy "read budgets"      on budgets     for select to authenticated using (true);
create policy "finance budgets"   on budgets     for all to authenticated using (is_finance()) with check (is_finance());
create policy "read settings"     on settings    for select to authenticated using (true);
create policy "finance settings"  on settings    for update to authenticated using (is_finance());

-- Requests: owner, their manager, directors and finance can read
create policy "read requests" on requests for select to authenticated using (
  requester_id = auth.uid()
  or (status <> 'draft' and (manages(requester_id) or is_director() or is_finance()))
);
create policy "create own requests" on requests for insert to authenticated with check (requester_id = auth.uid() and status = 'draft');
create policy "edit own drafts" on requests for update to authenticated
  using (requester_id = auth.uid() and status in ('draft','revision'))
  with check (requester_id = auth.uid() and status in ('draft','revision'));
create policy "delete own drafts" on requests for delete to authenticated using (requester_id = auth.uid() and status = 'draft');
-- Status transitions beyond the requester go through the security-definer RPCs above.

create policy "read attachments" on request_attachments for select to authenticated
  using (exists (select 1 from requests r where r.id = request_id));
create policy "add attachments" on request_attachments for insert to authenticated
  with check (uploaded_by = auth.uid() and exists (select 1 from requests r where r.id = request_id and r.requester_id = auth.uid()));

create policy "read approvals" on approvals for select to authenticated using (exists (select 1 from requests r where r.id = request_id));

create policy "read comments" on comments for select to authenticated using (exists (select 1 from requests r where r.id = request_id));
create policy "add comments"  on comments for insert to authenticated with check (author_id = auth.uid() and exists (select 1 from requests r where r.id = request_id));

create policy "own notifications"    on notifications for select to authenticated using (user_id = auth.uid());
create policy "mark own notifications" on notifications for update to authenticated using (user_id = auth.uid());

create policy "finance reads audit" on audit_logs for select to authenticated using (is_finance());
drop policy if exists "insert own audit" on audit_logs;
create policy "insert own audit" on audit_logs for insert to authenticated with check (actor_id = auth.uid());

-- Storage bucket for attachments (private)
insert into storage.buckets (id, name, public) values ('attachments', 'attachments', false) on conflict do nothing;
drop policy if exists "attachments read" on storage.objects;
create policy "attachments read" on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and exists (
    select 1 from public.requests r
    where r.id::text = split_part(name, '/', 1)
      and (r.requester_id = auth.uid() or manages(r.requester_id) or is_director() or is_finance())
  ));
create policy "attachments upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and exists (select 1 from requests r where r.id::text = split_part(name, '/', 1) and r.requester_id = auth.uid()));
