-- 007: legal names for natively registered users + auth notes.
-- first_name / last_name are collected in the signup wizard (email path
-- requires both; wallet path takes first name only; OAuth prefills from the
-- provider profile). Password credentials themselves live OUTSIDE Supabase in
-- nexus-core/data/auth.json (file-backed, gitignored) — password hashes must
-- never sit in an anon-readable table.
alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text;
