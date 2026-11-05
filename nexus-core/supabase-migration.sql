-- ─────────────────────────────────────────────────────────────
-- 15market — Supabase `profiles` table: optional columns for
-- full profile durability (trade history).
--
-- The `profiles` table already exists and the backend writes to it
-- out of the box (identity, balance, copy-trading, provider state).
--
-- Run this ALTER TABLE in the Supabase SQL Editor ONLY if you also
-- want in-app trade history (`trades` / `copy_trades`) to persist
-- across backend restarts. Without these columns the backend
-- automatically stores a "slim" payload and trade history stays in
-- the file/Redis backups.
-- ─────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists onboarded boolean not null default false,
  add column if not exists onboarded_at bigint,
  add column if not exists trades jsonb not null default '[]'::jsonb,
  add column if not exists copy_trades jsonb not null default '[]'::jsonb;

update public.profiles
set onboarded = true
where onboarded = false
  and (onboarded_at is not null or nullif(trim(username), '') is not null);

create table if not exists public.trades (
  id text primary key,
  user_address text not null references public.profiles(address) on delete cascade,
  symbol text not null,
  direction text,
  amount numeric(20, 6) default 0,
  entry_price numeric(30, 10),
  exit_price numeric(30, 10),
  duration integer,
  status text default 'PENDING',
  won boolean default false,
  payout numeric(20, 6) default 0,
  fee numeric(20, 6) default 0,
  pnl numeric(20, 6) default 0,
  tx_hash text,
  stake_tx_hash text,
  settlement_tx_hash text,
  settled_at bigint,
  timestamp bigint default (extract(epoch from now()) * 1000)::bigint,
  raw_data jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_trades_user_address on public.trades(user_address);
create index if not exists idx_trades_timestamp on public.trades(timestamp desc);
create index if not exists idx_trades_status on public.trades(status);

-- Upsert convenience (used by the REST upsert with on_conflict=address)
create unique index if not exists profiles_address_key on public.profiles (address);

-- ---------------------------------------------------------------------------
-- Migration 012 - platform suspension: the whole-account kill switch the
-- admin Users panel writes to. Run in the Supabase SQL editor.

alter table public.profiles
  add column if not exists suspended boolean not null default false,
  add column if not exists suspended_at bigint,
  add column if not exists suspended_by text,
  add column if not exists suspend_note text;

create index if not exists idx_profiles_suspended on public.profiles(suspended) where suspended = true;

-- ---------------------------------------------------------------------------
-- Migration 013 - durable mail store: Supabase is the store of record for
-- both directions of the admin Mail console, so every mail ever sent or
-- received survives backend restarts and Render's per-deploy disk wipes.
-- Run in the Supabase SQL editor.

create table if not exists public.mail_outbox (
  id text primary key,
  kind text not null default 'system',
  "to" text not null default '',
  subject text not null default '',
  type text not null default 'info',
  title text not null default '',
  message text not null default '',
  status text not null default 'sent',
  detail text not null default '',
  html text not null default '',
  at bigint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_mail_outbox_at on public.mail_outbox(at desc);

create table if not exists public.mail_inbox (
  id text primary key,
  from_raw text not null default '',
  from_name text not null default '',
  from_addr text not null default '',
  to_addr text not null default '',
  subject text not null default '',
  html text not null default '',
  text_body text not null default '',
  preview text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  received_at bigint not null default 0,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_mail_inbox_received on public.mail_inbox(received_at desc);
