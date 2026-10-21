-- 011 — Supabase-Auth-powered admin panel
-- Admin identity lives in Supabase Auth (auth.users). Every admin record
-- links to an auth user by id. role 'root' is the ONLY superuser role: the
-- first account created in admin_users becomes root permanently, and only
-- the root can create further admins / moderators and grant permissions.
-- Permissions use a text[] tag list checked by the backend middleware.

create table if not exists public.admin_users (
    id uuid primary key references auth.users (id) on delete cascade,
    email text not null unique,
    role text not null default 'moderator'
        constraint admin_users_role_chk check (role in ('root', 'admin', 'moderator')),
    permissions text[] not null default '{}',
    suspended boolean not null default false not null,
    created_by uuid references public.admin_users (id) on delete set null,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create index if not exists admin_users_role_idx
    on public.admin_users (role);

-- The backend writes this table with the service-role key; RLS stays on and
-- no anon policies are granted, so users cannot read or forge admin rows.
alter table public.admin_users enable row level security;
