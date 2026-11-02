-- Reference data seed. Demo users + the 15 sample requests live in src/lib/seed.ts
-- (Demo Mode). For a Supabase project: create the 4 demo users in Auth first
-- (Dashboard → Authentication → Add user, password demo1234), then insert
-- matching rows into public.users with the roles shown in README.md.

insert into settings (id) values (1) on conflict do nothing;

insert into departments (name) values
  ('Marketing'), ('Technology'), ('Operations'), ('People & Culture'), ('Finance')
on conflict do nothing;

insert into categories (name, color) values
  ('Marketing', '#14b8a6'), ('Tech', '#6366f1'), ('Operations', '#f59e0b'), ('HR', '#ec4899'),
  ('Travel', '#0ea5e9'), ('Office Supplies', '#84cc16'), ('Other', '#94a3b8')
on conflict do nothing;

insert into budgets (scope, ref_id, period, amount)
select 'category', id, 'monthly', amt from (values
  ('Marketing', 45000000), ('Tech', 30000000), ('Operations', 20000000), ('HR', 10000000),
  ('Travel', 8000000), ('Office Supplies', 5000000), ('Other', 3000000)) v(n, amt)
join categories c on c.name = v.n
on conflict do nothing;

insert into budgets (scope, ref_id, period, amount)
select 'department', id, 'quarterly', amt from (values
  ('Marketing', 120000000), ('Technology', 90000000), ('Operations', 60000000),
  ('People & Culture', 30000000), ('Finance', 25000000)) v(n, amt)
join departments d on d.name = v.n
on conflict do nothing;
