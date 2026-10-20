-- 008: username uniqueness.
--
-- WHY THIS EXISTS
-- Usernames are public handles: two accounts must never hold the same one.
-- The old signup write path never checked availability server-side, so
-- duplicates could already exist. Resolve them here first (oldest account
-- keeps the name; later ones get a numeric suffix, truncated so the result
-- still fits the 3–20 char rule) so the unique index can be installed without
-- dropping any account.
--
-- This is enforced at write time by POST/PATCH /profiles (strict mode) and
-- backed by the unique index below.

with ranked as (
  select address,
         username,
         row_number() over (
           partition by lower(btrim(username))
           order by updated_at asc nulls last, address asc
         ) as rn
  from public.profiles
  where username is not null and btrim(username) <> ''
)
update public.profiles p
set username = left(r.username, 14) || '_' || (1000 + r.rn)
from ranked r
where p.address = r.address
  and r.rn > 1;

create unique index if not exists profiles_username_lower_uniq
  on public.profiles (lower(btrim(username)))
  where username is not null and btrim(username) <> '';
