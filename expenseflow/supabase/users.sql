-- Sync Supabase Auth users into public.users.
-- Login fails unless the Auth user has a matching public.users row (see src/lib/store.ts).
-- Create the users in Dashboard -> Authentication first, then run this file.
-- Safe to rerun: existing rows are left untouched.

insert into public.users (id, name, email)
select
  u.id,
  coalesce(nullif(u.raw_user_meta_data->>'name', ''), split_part(u.email, '@', 1)),
  u.email
from auth.users u
where u.email is not null
on conflict (id) do nothing;

-- Optional: assign roles / departments / managers later, e.g.
-- update public.users set role = 'finance' where email = 'you@example.com';
