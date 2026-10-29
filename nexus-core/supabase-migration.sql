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
